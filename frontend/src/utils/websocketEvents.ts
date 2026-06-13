// Utility functions for handling WebSocket events

export interface WebSocketEvent {
  type: string;
  payload: any;
  timestamp: Date;
}

export const EVENT_TYPES = {
  SECURITY_ALERT: 'security_alert',
  ATTENDANCE_UPDATE: 'attendance_update',
  SPOOF_DETECTION: 'spoof_detection',
  SYSTEM_NOTIFICATION: 'system_notification',
  LEAVE_APPROVAL: 'leave_approval',
  TEAM_ACTIVITY: 'team_activity',
};

export const createWebSocketEvent = (type: string, payload: any): WebSocketEvent => {
  return {
    type,
    payload,
    timestamp: new Date(),
  };
};

export const isSecurityAlert = (event: WebSocketEvent): boolean => {
  return event.type === EVENT_TYPES.SECURITY_ALERT;
};

export const isAttendanceUpdate = (event: WebSocketEvent): boolean => {
  return event.type === EVENT_TYPES.ATTENDANCE_UPDATE;
};

export const isSpoofDetection = (event: WebSocketEvent): boolean => {
  return event.type === EVENT_TYPES.SPOOF_DETECTION;
};

export const isSystemNotification = (event: WebSocketEvent): boolean => {
  return event.type === EVENT_TYPES.SYSTEM_NOTIFICATION;
};

export const formatEventMessage = (event: WebSocketEvent): string => {
  switch (event.type) {
    case EVENT_TYPES.SECURITY_ALERT:
      return `Security alert: ${event.payload.message}`;
    case EVENT_TYPES.ATTENDANCE_UPDATE:
      return `Attendance update: ${event.payload.employeeName} ${event.payload.action}`;
    case EVENT_TYPES.SPOOF_DETECTION:
      return `Spoof detection: ${event.payload.employeeName} attempted spoofing`;
    case EVENT_TYPES.SYSTEM_NOTIFICATION:
      return `System notification: ${event.payload.message}`;
    case EVENT_TYPES.LEAVE_APPROVAL:
      return `Leave request: ${event.payload.status} for ${event.payload.employeeName}`;
    case EVENT_TYPES.TEAM_ACTIVITY:
      return `Team activity: ${event.payload.message}`;
    default:
      return `New event: ${event.type}`;
  }
};

export const getEventPriority = (event: WebSocketEvent): 'low' | 'medium' | 'high' | 'critical' => {
  switch (event.type) {
    case EVENT_TYPES.SECURITY_ALERT:
    case EVENT_TYPES.SPOOF_DETECTION:
      return 'critical';
    case EVENT_TYPES.SYSTEM_NOTIFICATION:
      return event.payload.severity || 'medium';
    case EVENT_TYPES.ATTENDANCE_UPDATE:
      return 'low';
    case EVENT_TYPES.LEAVE_APPROVAL:
      return 'medium';
    case EVENT_TYPES.TEAM_ACTIVITY:
      return 'low';
    default:
      return 'medium';
  }
};

export const shouldNotifyUser = (event: WebSocketEvent, userRole: string): boolean => {
  // Always notify for critical events
  if (getEventPriority(event) === 'critical') {
    return true;
  }
  
  // Admins get notified for all events
  if (userRole === 'admin') {
    return true;
  }
  
  // Supervisors get notified for team-related events
  if (userRole === 'supervisor' && 
      (event.type === EVENT_TYPES.TEAM_ACTIVITY || 
       event.type === EVENT_TYPES.LEAVE_APPROVAL)) {
    return true;
  }
  
  // Regular employees only get notified for personal events
  if (userRole === 'employee' && 
      (event.type === EVENT_TYPES.LEAVE_APPROVAL || 
       event.type === EVENT_TYPES.SYSTEM_NOTIFICATION)) {
    return true;
  }
  
  return false;
};