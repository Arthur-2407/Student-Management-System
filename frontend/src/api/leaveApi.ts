import api from '@services/api';
import { AxiosResponse } from 'axios';

export interface LeaveRequest {
  id: number;
  student_id: number;
  teacher_id: number | null;
  leave_type: 'vacation' | 'sick' | 'personal' | 'maternity' | 'paternity';
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approval_date: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  attachment_data?: string | null;
  attachment_name?: string | null;
  student?: {
    student_id: string;
    first_name: string;
    last_name: string;
    department: string;
  };
  teacher?: {
    student_id: string;
    first_name: string;
    last_name: string;
  };
}

export interface LeaveRequestData {
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
  attachmentData?: string | null;
  attachmentName?: string | null;
}

export interface LeaveStats {
  totalRequests: number;
  approved: number;
  pending: number;
  rejected: number;
  vacationDaysUsed: number;
  sickDaysUsed: number;
  personalDaysUsed: number;
  maternityDaysUsed: number;
  paternityDaysUsed: number;
}

export const leaveApi = {
  submitRequest: async (data: LeaveRequestData): Promise<AxiosResponse<LeaveRequest>> => {
    const response = await api.post('/leave/request', data);
    return response;
  },

  getMyRequests: async (limit: number = 50): Promise<AxiosResponse<LeaveRequest[]>> => {
    const response = await api.get(`/leave/my-requests?limit=${limit}`);
    return response;
  },

  getTeamRequests: async (limit: number = 50): Promise<AxiosResponse<LeaveRequest[]>> => {
    const response = await api.get(`/leave/team-requests?limit=${limit}`);
    return response;
  },

  getRequestById: async (id: number): Promise<AxiosResponse<LeaveRequest>> => {
    const response = await api.get(`/leave/request/${id}`);
    return response;
  },

  cancelRequest: async (id: number): Promise<AxiosResponse<LeaveRequest>> => {
    const response = await api.put(`/leave/request/${id}/cancel`);
    return response;
  },

  approveRequest: async (id: number): Promise<AxiosResponse<LeaveRequest>> => {
    const response = await api.put(`/leave/request/${id}/approve`);
    return response;
  },

  rejectRequest: async (id: number, reason: string): Promise<AxiosResponse<LeaveRequest>> => {
    const response = await api.put(`/leave/request/${id}/reject`, { reason });
    return response;
  },

  getStats: async (): Promise<AxiosResponse<LeaveStats>> => {
    const response = await api.get('/leave/stats');
    return response;
  },
};