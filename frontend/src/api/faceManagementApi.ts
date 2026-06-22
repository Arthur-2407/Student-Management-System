import api from '@services/api';
import { AxiosResponse } from 'axios';

export interface FaceChangeRequest {
  id: number;
  student_id: string;
  first_name: string;
  last_name: string;
  department: string;
  request_type: 'ADD' | 'UPDATE' | 'REPLACE' | 'DELETE';
  created_at: string;
  requester_student_id?: string;
  requester_first_name?: string;
  requester_last_name?: string;
  status?: string;
}

export interface FaceAuditLog {
  id: number;
  action: string;
  timestamp: string;
  ip_address: string;
  device_info: string;
  student_id: string;
  first_name: string;
  last_name: string;
  perf_student_id?: string;
  perf_first_name?: string;
  perf_last_name?: string;
}

export interface CreateRequestData {
  studentId: string;
  requestType: 'ADD' | 'UPDATE' | 'REPLACE' | 'DELETE';
  frames?: string[];
}

export interface ApproveRejectResponse {
  success: boolean;
  message: string;
}

export const faceManagementApi = {
  // Submit request
  submitRequest: async (data: CreateRequestData): Promise<AxiosResponse<{ success: boolean; message: string; instant?: boolean; requestId?: number }>> => {
    return api.post('/face-change-requests', data);
  },

  // Get pending approvals
  getPendingRequests: async (): Promise<AxiosResponse<{ success: boolean; data: FaceChangeRequest[] }>> => {
    return api.get('/face-change-requests/pending');
  },

  // Approve a request
  approveRequest: async (id: number, notes?: string): Promise<AxiosResponse<ApproveRejectResponse>> => {
    return api.post(`/face-change-requests/${id}/approve`, { notes });
  },

  // Reject a request
  rejectRequest: async (id: number, notes?: string): Promise<AxiosResponse<ApproveRejectResponse>> => {
    return api.post(`/face-change-requests/${id}/reject`, { notes });
  },

  // Get history logs
  getHistory: async (): Promise<AxiosResponse<{ success: boolean; data: FaceAuditLog[] }>> => {
    return api.get('/face-change-requests/history');
  },

  // Admin immediate registration bypass
  adminRegister: async (studentId: string, frames: string[]): Promise<AxiosResponse<{ success: boolean; message: string }>> => {
    return api.post('/face-management/admin-register', { studentId, frames });
  },

  // Admin immediate deletion bypass
  adminDelete: async (studentId: string): Promise<AxiosResponse<{ success: boolean; message: string }>> => {
    return api.delete(`/face-management/admin-delete/${studentId}`);
  },
};
