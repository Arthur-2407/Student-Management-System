import { io, Socket } from 'socket.io-client';

class WebSocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 8;
  private readonly baseReconnectDelay = 1000; // 1s, 2s, 4s … capped at 30s
  private _stopped = false; // intentional-disconnect guard
  // STABILIZATION: Heartbeat interval for stale-connection detection
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private readonly heartbeatIntervalMs = 30_000; // 30s
  private readonly heartbeatTimeoutMs = 5_000; // 5s to receive pong
  private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
  // STABILIZATION: Event listeners for UI status callbacks (supports multiple)
  private _statusCallbacks: Array<(connected: boolean) => void> = [];
  // STABILIZATION: Pending listeners queued before socket creation
  private _pendingListeners: Array<{ event: string; callback: (...args: any[]) => void }> = [];
  // STABILIZATION: Store connection params for reconnection
  private _lastToken: string | null = null;
  private _lastStudentId: string | null = null;
  private _lastRole: string | null = null;

  connect(token: string) {
    // Guard: avoid creating duplicate connections
    if (this.socket && this.socket.connected) {
      console.log('[WS] Already connected, skipping reconnect.');
      return this.socket;
    }

    this._stopped = false; // allow reconnection on new login
    const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001';

    // Disable Socket.IO built-in reconnection — we manage it ourselves
    // for full exponential backoff control.
    this.socket = io(WS_URL, {
      transports: ['websocket'],
      auth: { token: `Bearer ${token}` },
      reconnection: false, // we handle retries manually
    });

    this._lastToken = token;
    this.setupEventListeners();

    // STABILIZATION: Apply any pending listeners that were registered before connect()
    for (const { event, callback } of this._pendingListeners) {
      this.socket.on(event, callback);
    }
    this._pendingListeners = [];

    return this.socket;
  }

  /**
   * STABILIZATION: Connect + join the correct rooms for this user in one call.
   * Uses the socket 'connect' event listener instead of setTimeout polling
   * for reliable room-join timing.
   */
  connectAndJoin(token: string, studentId: string, role: string) {
    // STABILIZATION: Store params for reconnect
    this._lastStudentId = studentId;
    this._lastRole = role;
    this.connect(token);

    if (!this.socket) return;

    // STABILIZATION: Use the 'connect' event instead of setTimeout polling
    // This guarantees we only join after the handshake is complete
    const doJoin = () => {
      this.joinRoom(studentId, role);
    };

    if (this.socket.connected) {
      // Already connected (fast reconnect) — join immediately
      doJoin();
    } else {
      // Wait for the connect event — guaranteed delivery
      this.socket.once('connect', doJoin);
    }
  }

  /**
   * Emit the room-join events for this user.
   */
  joinRoom(studentId: string, role: string) {
    this.emit('join', { studentId });
    if (role === 'teacher' || role === 'admin') {
      this.emit('join-teacher', { studentId });
    }
  }

  private setupEventListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('[WS] Connected.');
      this.reconnectAttempts = 0;
      this._statusCallbacks.forEach(cb => cb(true));
      // STABILIZATION: Start heartbeat on connect
      this.startHeartbeat();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[WS] Disconnected:', reason);
      this._statusCallbacks.forEach(cb => cb(false));
      this.stopHeartbeat();
      if (!this._stopped && reason !== 'io client disconnect') {
        // Reconnect on unexpected disconnect
        this.scheduleReconnect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('[WS] Connection error:', error.message);
      this._statusCallbacks.forEach(cb => cb(false));
      if (!this._stopped) {
        this.scheduleReconnect();
      }
    });

    // STABILIZATION: Heartbeat pong handler
    this.socket.on('pong', () => {
      if (this.heartbeatTimeout) {
        clearTimeout(this.heartbeatTimeout);
        this.heartbeatTimeout = null;
      }
    });

    // Security events
    this.socket.on('security_alert', (data) => {
      console.warn('[WS] Security alert:', data);
    });

    // Attendance updates
    this.socket.on('attendance_update', (data) => {
      console.log('[WS] Attendance update:', data);
      // STABILIZATION: Emit acknowledgement back to server
      this.emit('attendance_ack', { received: true, timestamp: Date.now() });
    });

    // Spoof detection events
    this.socket.on('spoof_detection', (data) => {
      console.warn('[WS] Spoof detection event:', data);
    });

    // System notifications
    this.socket.on('system_notification', (data) => {
      console.log('[WS] System notification:', data);
    });
  }

  /**
   * STABILIZATION: Heartbeat mechanism — sends ping every 30s,
   * expects pong within 5s. If no pong received, reconnects.
   */
  private startHeartbeat() {
    this.stopHeartbeat(); // Clear any existing interval first
    this.heartbeatInterval = setInterval(() => {
      if (!this.socket || !this.socket.connected) return;
      
      this.emit('ping', {});
      
      // Set timeout for pong response
      this.heartbeatTimeout = setTimeout(() => {
        console.warn('[WS] Heartbeat timeout — no pong received. Reconnecting...');
        if (this.socket) {
          this.socket.disconnect();
          if (!this._stopped) {
            this.scheduleReconnect();
          }
        }
      }, this.heartbeatTimeoutMs);
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  /**
   * Exponential backoff reconnect: 1s, 2s, 4s, 8s … up to 30s, max 8 attempts.
   * Halts if _stopped is set (intentional logout).
   */
  private scheduleReconnect() {
    if (this._stopped || this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('[WS] Max reconnect attempts reached. WebSocket offline.');
      }
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
    console.log(`[WS] Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms...`);
    setTimeout(() => {
      if (!this._stopped && this._lastToken) {
        // STABILIZATION: Destroy old socket and create a new one for clean reconnect
        if (this.socket) {
          this.socket.removeAllListeners();
          this.socket.disconnect();
          this.socket = null;
        }
        // Re-connect and re-join rooms if we have the params
        if (this._lastStudentId && this._lastRole) {
          this.connectAndJoin(this._lastToken, this._lastStudentId, this._lastRole);
        } else {
          this.connect(this._lastToken);
        }
      }
    }, delay);
  }

  disconnect() {
    this._stopped = true; // prevents reconnect loops after intentional logout
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.reconnectAttempts = 0;
    this._lastToken = null;
    this._lastStudentId = null;
    this._lastRole = null;
  }

  on(event: string, callback: (...args: any[]) => void) {
    if (this.socket) {
      this.socket.on(event, callback);
    } else {
      // STABILIZATION: Queue listener for when socket is created
      this._pendingListeners.push({ event, callback });
    }
  }

  off(event: string, callback?: (...args: any[]) => void) {
    if (this.socket) this.socket.off(event, callback);
    // STABILIZATION: Also remove from pending queue
    if (callback) {
      this._pendingListeners = this._pendingListeners.filter(
        (l) => !(l.event === event && l.callback === callback)
      );
    }
  }

  emit(event: string, data: any) {
    if (this.socket) this.socket.emit(event, data);
  }

  isConnected(): boolean {
    return this.socket ? this.socket.connected : false;
  }

  /** STABILIZATION: Register a callback for connection status changes (supports multiple) */
  onStatusChange(callback: (connected: boolean) => void) {
    this._statusCallbacks.push(callback);
    // Return unsubscribe function for cleanup
    return () => {
      this._statusCallbacks = this._statusCallbacks.filter(cb => cb !== callback);
    };
  }
}

export const websocketService = new WebSocketService();