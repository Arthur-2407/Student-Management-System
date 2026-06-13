const { verifyAccessToken } = require('../../middleware/authMiddleware');
const { logger } = require('../../config/logger');
const { wsTelemetry } = require('../telemetry/wsTelemetry');

function setupWebSocket(io) {
  const attendanceNS = io.of('/');
  const connectedEmployees = new Map();

  attendanceNS.use((socket, next) => {
    const rawToken = socket.handshake.auth?.token
      || socket.handshake.headers?.authorization;
    const token = rawToken ? String(rawToken).replace(/^Bearer\s+/i, '') : null;

    if (!token) {
      return next(new Error('AUTH_REQUIRED'));
    }

    try {
      socket.user = verifyAccessToken(token);
      return next();
    } catch (error) {
      logger.warn('WebSocket authentication failed', {
        socketId: socket.id,
        error: error.message,
      });
      wsTelemetry.onAuthFailure();
      return next(new Error('AUTH_INVALID'));
    }
  });

  attendanceNS.on('connection', (socket) => {
    logger.info('WebSocket client connected', {
      socketId: socket.id,
      employeeId: socket.user.employeeId,
    });
    wsTelemetry.onConnect(socket.id);

    socket.join(`employee:${socket.user.employeeId}`);
    connectedEmployees.set(socket.user.employeeId, socket.id);
    socket.emit('joined', { status: 'connected', employeeId: socket.user.employeeId });

    if (socket.user.role === 'supervisor' || socket.user.role === 'admin') {
      socket.join('supervisors');
      socket.emit('joined', { status: 'connected', role: socket.user.role });
    }

    socket.on('join', () => {
      socket.emit('joined', { status: 'connected', employeeId: socket.user.employeeId });
    });

    socket.on('join-supervisor', () => {
      if (socket.user.role === 'supervisor' || socket.user.role === 'admin') {
        socket.join('supervisors');
        socket.emit('joined', { status: 'connected', role: socket.user.role });
      } else {
        socket.emit('error', { code: 'FORBIDDEN', message: 'Supervisor role required' });
      }
    });

    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // STABILIZATION: Attendance event acknowledgement handler
    socket.on('attendance_ack', (data) => {
      logger.debug('Attendance event acknowledged', {
        socketId: socket.id,
        employeeId: socket.user.employeeId,
        timestamp: data?.timestamp,
      });
    });

    // STABILIZATION: Stale connection cleanup — if no activity for 90s, disconnect
    let lastActivity = Date.now();
    const staleCheckInterval = setInterval(() => {
      if (Date.now() - lastActivity > 90_000) {
        logger.warn('Disconnecting stale socket', { socketId: socket.id, employeeId: socket.user.employeeId });
        socket.disconnect(true);
      }
    }, 30_000);

    // Update activity timestamp on any incoming event
    socket.onAny(() => { lastActivity = Date.now(); });

    socket.on('disconnect', () => {
      clearInterval(staleCheckInterval);
      connectedEmployees.delete(socket.user.employeeId);
      wsTelemetry.onDisconnect(socket.id);
      logger.info('WebSocket client disconnected', {
        socketId: socket.id,
        employeeId: socket.user.employeeId,
      });
    });
  });

  function notifyEmployee(employeeId, event, data) {
    attendanceNS.to(`employee:${employeeId}`).emit(event, data);
  }

  function notifySupervisors(event, data) {
    attendanceNS.to('supervisors').emit(event, data);
  }

  io.notifyEmployee = notifyEmployee;
  io.notifySupervisors = notifySupervisors;
  io.connectedEmployees = connectedEmployees;

  logger.info('WebSocket handler initialized');
}

module.exports = { setupWebSocket };
