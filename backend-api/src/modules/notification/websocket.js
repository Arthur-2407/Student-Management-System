const { verifyAccessToken } = require('../../middleware/authMiddleware');
const { logger } = require('../../config/logger');
const { wsTelemetry } = require('../telemetry/wsTelemetry');

function setupWebSocket(io) {
  const attendanceNS = io.of('/');
  const connectedStudents = new Map();

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
      studentId: socket.user.studentId,
    });
    wsTelemetry.onConnect(socket.id);

    socket.join(`student:${socket.user.studentId}`);
    connectedStudents.set(socket.user.studentId, socket.id);
    socket.emit('joined', { status: 'connected', studentId: socket.user.studentId });

    if (socket.user.role === 'teacher' || socket.user.role === 'admin') {
      socket.join('teachers');
      if (socket.user.role === 'admin') {
        socket.join('admin');
      }
      socket.emit('joined', { status: 'connected', role: socket.user.role });
    }

    socket.on('join', () => {
      socket.emit('joined', { status: 'connected', studentId: socket.user.studentId });
    });

    socket.on('join-teacher', () => {
      if (socket.user.role === 'teacher' || socket.user.role === 'admin') {
        socket.join('teachers');
        if (socket.user.role === 'admin') {
          socket.join('admin');
        }
        socket.emit('joined', { status: 'connected', role: socket.user.role });
      } else {
        socket.emit('error', { code: 'FORBIDDEN', message: 'Teacher role required' });
      }
    });

    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // STABILIZATION: Attendance event acknowledgement handler
    socket.on('attendance_ack', (data) => {
      logger.debug('Attendance event acknowledged', {
        socketId: socket.id,
        studentId: socket.user.studentId,
        timestamp: data?.timestamp,
      });
    });

    // STABILIZATION: Stale connection cleanup — if no activity for 90s, disconnect
    let lastActivity = Date.now();
    const staleCheckInterval = setInterval(() => {
      if (Date.now() - lastActivity > 90_000) {
        logger.warn('Disconnecting stale socket', { socketId: socket.id, studentId: socket.user.studentId });
        socket.disconnect(true);
      }
    }, 30_000);

    // Update activity timestamp on any incoming event
    socket.onAny(() => { lastActivity = Date.now(); });

    socket.on('disconnect', () => {
      clearInterval(staleCheckInterval);
      connectedStudents.delete(socket.user.studentId);
      wsTelemetry.onDisconnect(socket.id);
      logger.info('WebSocket client disconnected', {
        socketId: socket.id,
        studentId: socket.user.studentId,
      });
    });
  });

  function notifyStudent(studentId, event, data) {
    attendanceNS.to(`student:${studentId}`).emit(event, data);
  }

  function notifyTeachers(event, data) {
    attendanceNS.to('teachers').emit(event, data);
  }

  io.notifyStudent = notifyStudent;
  io.notifyTeachers = notifyTeachers;
  io.connectedStudents = connectedStudents;

  logger.info('WebSocket handler initialized');
}

module.exports = { setupWebSocket };
