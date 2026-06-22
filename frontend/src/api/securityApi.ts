import api from '@services/api';
import { AxiosResponse } from 'axios';

export interface SecurityEvent {
  id: number;
  student_id: number | null;
  event_type: string;
  timestamp: string;
  ip_address: string;
  device_info: string;
  details: string;
  severity: string;
  student?: {
    student_id: string;
    first_name: string;
    last_name: string;
  };
}

export interface LoginLog {
  id: number;
  student_id: number;
  success: boolean;
  spoof_detected: boolean;
  spoof_confidence: number | null;
  challenge_passed: boolean | null;
  face_embedding: number[] | null;
  ip_address: string;
  device_info: string;
  location: {
    latitude: number;
    longitude: number;
  } | null;
  error_details: string | null;
  timestamp: string;
  student?: {
    student_id: string;
    first_name: string;
    last_name: string;
  };
}

export interface SystemLog {
  id: number;
  service_name: string;
  log_level: string;
  message: string;
  timestamp: string;
  metadata: Record<string, any>;
}

export interface SpoofAttemptRecord {
  id: number;
  student_id: number;
  spoof_confidence: number;
  detection_type: string;
  timestamp: string;
  student?: {
    student_id: string;
    first_name: string;
    last_name: string;
  };
}

export const securityApi = {
  getSecurityEvents: async (limit: number = 50): Promise<AxiosResponse<SecurityEvent[]>> => {
    const response = await api.get(`/security/events?limit=${limit}`);
    return { ...response, data: response.data.data || response.data };
  },

  getLoginLogs: async (limit: number = 50): Promise<AxiosResponse<LoginLog[]>> => {
    const response = await api.get(`/security/login-logs?limit=${limit}`);
    return { ...response, data: response.data.data || response.data };
  },

  getSystemLogs: async (limit: number = 50): Promise<AxiosResponse<SystemLog[]>> => {
    const response = await api.get(`/security/system-logs?limit=${limit}`);
    return { ...response, data: response.data.data || response.data };
  },

  getSpoofAttempts: async (limit: number = 50): Promise<AxiosResponse<SpoofAttemptRecord[]>> => {
    const response = await api.get(`/security/spoof-attempts?limit=${limit}`);
    return { ...response, data: response.data.data || response.data };
  },

  getGeoFenceViolations: async (limit: number = 50): Promise<AxiosResponse<any[]>> => {
    const response = await api.get(`/security/geofence-violations?limit=${limit}`);
    return { ...response, data: response.data.data || response.data };
  },
};
