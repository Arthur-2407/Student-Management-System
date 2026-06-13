// Utility functions for handling notifications

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  action?: {
    label: string;
    handler: () => void;
  };
}

export const createNotification = (
  type: NotificationType,
  title: string,
  message: string,
  action?: { label: string; handler: () => void }
): Notification => {
  return {
    id: Math.random().toString(36).substring(2, 15),
    type,
    title,
    message,
    timestamp: new Date(),
    read: false,
    action,
  };
};

export const getNotificationIcon = (type: NotificationType): string => {
  switch (type) {
    case 'success':
      return '✅';
    case 'error':
      return '❌';
    case 'warning':
      return '⚠️';
    case 'info':
      return 'ℹ️';
    default:
      return 'ℹ️';
  }
};

export const getNotificationColor = (type: NotificationType): string => {
  switch (type) {
    case 'success':
      return 'bg-green-100 border-green-400 text-green-700';
    case 'error':
      return 'bg-red-100 border-red-400 text-red-700';
    case 'warning':
      return 'bg-yellow-100 border-yellow-400 text-yellow-700';
    case 'info':
      return 'bg-blue-100 border-blue-400 text-blue-700';
    default:
      return 'bg-gray-100 border-gray-400 text-gray-700';
  }
};

export const markAsRead = (notifications: Notification[], id: string): Notification[] => {
  return notifications.map(notification => 
    notification.id === id ? { ...notification, read: true } : notification
  );
};

export const markAllAsRead = (notifications: Notification[]): Notification[] => {
  return notifications.map(notification => ({ ...notification, read: true }));
};

export const removeNotification = (notifications: Notification[], id: string): Notification[] => {
  return notifications.filter(notification => notification.id !== id);
};

export const getUnreadCount = (notifications: Notification[]): number => {
  return notifications.filter(notification => !notification.read).length;
};