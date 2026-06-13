import api from '@services/api';

export interface QueueStats {
  enqueued: number;
  processed: number;
  failed: number;
  deadLettered: number;
  pending: Record<string, number>;
  processing: number;
  deadLetterSize: number;
}

export interface TracingStats {
  total: number;
  errors: number;
  slowQueries: number;
  recentSpans: number;
  slowestRecent: Array<{ name: string; duration: number; traceId: string }>;
}

export interface SystemPermissions {
  [key: string]: boolean;
}

export const systemApi = {
  /** Get system health and status */
  getHealth: () => api.get('/health'),

  /** Get system status (degraded-mode, services) */
  getStatus: () => api.get('/system/status'),

  /** Get feature flags */
  getFeatures: () => api.get<{ features: Record<string, boolean> }>('/system/features'),

  /** Get permissions for current user (for UI gating) */
  getPermissions: () => api.get<{ permissions: SystemPermissions }>('/system/permissions'),

  /** Get job queue stats (supervisor+) */
  getQueueStats: () => api.get<{ queue: QueueStats }>('/system/queue'),

  /** Get tracing stats (supervisor+) */
  getTracingStats: () => api.get<{ tracing: TracingStats }>('/system/traces'),
};
