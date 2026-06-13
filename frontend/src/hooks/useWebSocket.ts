import { useState, useEffect, useRef } from 'react';
import { websocketService } from '@services/websocketService';
import { useAttendanceStore } from '@store/attendanceStore';
import { stateReconciliationEngine } from '@services/reconciliationEngine';

interface WebSocketHook {
  isConnected: boolean;
  lastEventTimestamp: number | null;
  connect: (token: string) => void;
  disconnect: () => void;
  sendMessage: (event: string, data: any) => void;
}

export const useWebSocket = (): WebSocketHook => {
  const [isConnected, setIsConnected] = useState(false);
  // STABILIZATION: Track last received event for stale-state detection
  const [lastEventTimestamp, setLastEventTimestamp] = useState<number | null>(null);
  const syncFromWebSocket = useAttendanceStore((s) => s.syncFromWebSocket);

  // STABILIZATION: Use ref to avoid infinite effect re-registration
  // when Zustand selector changes reference between renders
  const syncRef = useRef(syncFromWebSocket);
  syncRef.current = syncFromWebSocket;

  useEffect(() => {
    // STABILIZATION: Use the returned unsubscribe function for proper cleanup
    const unsubStatus = websocketService.onStatusChange((connected) => {
      setIsConnected(connected);
    });

    // Listen for connection status changes (fallback for direct socket events)
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    websocketService.on('connect', handleConnect);
    websocketService.on('disconnect', handleDisconnect);

    // STABILIZATION: Forward attendance_update events to Zustand store via ref with sequence verification
    const handleAttendanceUpdate = (data: any) => {
      const now = Date.now();
      setLastEventTimestamp(now);
      
      const eventTimestamp = data?.timestamp || now;
      if (stateReconciliationEngine.isStale('attendance', eventTimestamp)) {
        console.warn('[useWebSocket] Suppressing stale update received via WebSocket event.', data);
        return;
      }
      if (stateReconciliationEngine.isLocked('attendance')) {
        console.warn('[useWebSocket] Suppressing WebSocket update; store is currently locked by manual interaction.', data);
        return;
      }
      
      syncRef.current(data);
    };

    websocketService.on('attendance_update', handleAttendanceUpdate);

    return () => {
      unsubStatus();
      websocketService.off('connect', handleConnect);
      websocketService.off('disconnect', handleDisconnect);
      websocketService.off('attendance_update', handleAttendanceUpdate);
    };
  }, []);

  const connect = (token: string) => {
    websocketService.connect(token);
  };

  const disconnect = () => {
    websocketService.disconnect();
    setIsConnected(false);
  };

  const sendMessage = (event: string, data: any) => {
    websocketService.emit(event, data);
  };

  return {
    isConnected,
    lastEventTimestamp,
    connect,
    disconnect,
    sendMessage,
  };
};