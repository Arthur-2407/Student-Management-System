import api from '@services/api';
import { AxiosResponse } from 'axios';

export interface Student {
  id: number;
  student_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number?: string;
  department: string;
  position: string;
  role: 'student' | 'teacher' | 'admin';
  teacher_id?: number | null;
  hire_date: string;
  is_active: boolean;
  face_enrolled?: boolean;
  mfa_enabled?: boolean;
  created_at: string;
  updated_at: string;
  // Work location (from student_locations table, if assigned)
  work_location_name?: string | null;
  work_location_lat?: number | null;
  work_location_lng?: number | null;
  work_location_radius?: number | null;
}

export interface StudentLocation {
  id: number;
  student_id: number;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Row returned by the bulk /students/locations endpoint
export interface StudentLocationRow {
  id: number;
  student_id: string;
  first_name: string;
  last_name: string;
  role: string;
  department: string;
  is_active: boolean;
  // null fields mean no location assigned
  location_id: number | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number | null;
  location_is_active: boolean | null;
  location_updated_at: string | null;
  work_start_time?: string | null;
  work_end_time?: string | null;
  timing_is_temporary?: boolean | null;
}


export interface Teacher extends Student {
  assigned_students?: Student[];
  active_student_count?: number;
}

export interface HierarchyData {
  teachers: Teacher[];
  unassignedStudents: Student[];
  totalTeachers: number;
  totalUnassignedStudents: number;
  totalActiveStudents: number;
}

export interface TeamMember extends Student {
  checked_in_today: string | number;
  pending_leave_status?: string | null;
}

export interface CreateStudentData {
  studentId: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  department: string;
  position: string;
  role: 'student' | 'teacher' | 'admin';
  teacherId?: number | null;
  hireDate: string;
  password?: string;
}

export interface WorkTiming {
  id: number;
  student_id?: number | null;
  student_code?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  department?: string | null;
  work_start_time: string;
  work_end_time: string;
  lunch_start_time?: string | null;
  lunch_end_time?: string | null;
  overtime_start_time?: string | null;
  overtime_end_time?: string | null;
  is_active: boolean;
  is_temporary?: boolean;
  start_date?: string | null;
  end_date?: string | null;
}

export const adminApi = {
  // Student management
  getStudents: async (params?: {
    page?: number;
    limit?: number;
    department?: string;
    role?: string;
    isActive?: boolean;
  }): Promise<AxiosResponse<{ success: boolean; data: Student[]; pagination: any }>> => {
    return api.get('/admin/students', { params });
  },

  createStudent: async (data: CreateStudentData): Promise<AxiosResponse<any>> => {
    return api.post('/admin/students', data);
  },

  updateStudent: async (id: number, data: Partial<CreateStudentData> & { isActive?: boolean }): Promise<AxiosResponse<any>> => {
    return api.put(`/admin/students/${id}`, data);
  },

  deactivateStudent: async (id: number): Promise<AxiosResponse<any>> => {
    return api.delete(`/admin/students/${id}`);
  },

  // Hierarchy management
  getHierarchy: async (): Promise<AxiosResponse<{ success: boolean; data: HierarchyData }>> => {
    return api.get('/admin/hierarchy');
  },

  // Teacher assignments
  assignStudentsToTeacher: async (teacherId: string | number, studentIds: number[]): Promise<AxiosResponse<{ success: boolean; assignedCount: number }>> => {
    return api.post(`/admin/teachers/${teacherId}/assign-students`, { studentIds });
  },

  getTeacherStudents: async (teacherId: string | number): Promise<AxiosResponse<{ success: boolean; data: Student[] }>> => {
    return api.get(`/admin/teachers/${teacherId}/students`);
  },

  removeStudentFromTeacher: async (teacherId: string | number, studentId: string | number): Promise<AxiosResponse<{ success: boolean }>> => {
    return api.delete(`/admin/teachers/${teacherId}/students/${studentId}`);
  },

  // Department management
  getDepartments: async (): Promise<AxiosResponse<{ success: boolean; data: any[] }>> => {
    return api.get('/admin/departments');
  },

  createDepartment: async (data: { departmentName: string; departmentHeadId?: number; maxStudents?: number }): Promise<AxiosResponse<any>> => {
    return api.post('/admin/departments', data);
  },

  // Work timings
  getWorkTimings: async (): Promise<AxiosResponse<{ success: boolean; data: WorkTiming[] }>> => {
    return api.get('/admin/work-timings');
  },

  createWorkTiming: async (data: {
    studentId?: number;
    department?: string;
    workStartTime: string;
    workEndTime: string;
    lunchStartTime?: string;
    lunchEndTime?: string;
    overtimeStartTime?: string;
    overtimeEndTime?: string;
    isTemporary?: boolean;
    startDate?: string | null;
    endDate?: string | null;
  }): Promise<AxiosResponse<any>> => {
    return api.post('/admin/work-timings', data);
  },

  deleteWorkTiming: async (id: number): Promise<AxiosResponse<any>> => {
    return api.delete(`/admin/work-timings/${id}`);
  },

  // Student location management
  getStudentLocation: async (studentId: number | string): Promise<AxiosResponse<{ success: boolean; data: StudentLocation | null }>> => {
    return api.get(`/admin/students/${studentId}/location`);
  },

  assignStudentLocation: async (
    studentId: number | string,
    data: { name: string; latitude: number; longitude: number; radiusMeters: number }
  ): Promise<AxiosResponse<{ success: boolean; data: StudentLocation; message: string }>> => {
    return api.post(`/admin/students/${studentId}/location`, data);
  },

  removeStudentLocation: async (studentId: number | string): Promise<AxiosResponse<{ success: boolean; message: string }>> => {
    return api.delete(`/admin/students/${studentId}/location`);
  },

  // Bulk fetch: all students with their location status (real-time)
  getAllStudentLocations: async (): Promise<AxiosResponse<{ success: boolean; data: StudentLocationRow[] }>> => {
    return api.get('/admin/students/locations');
  },


  // Teacher team (for teacher role)
  getMyTeam: async (): Promise<AxiosResponse<{ success: boolean; data: TeamMember[]; count: number }>> => {
    return api.get('/admin/teacher/team');
  },

  getTeamMemberAttendance: async (studentId: number, params?: { startDate?: string; endDate?: string; limit?: number }): Promise<AxiosResponse<any>> => {
    return api.get(`/admin/teacher/team/${studentId}/attendance`, { params });
  },

  resetStudentMfa: async (studentId: string | number): Promise<AxiosResponse<{ success: boolean; message: string }>> => {
    return api.post(`/admin/students/${studentId}/mfa/reset`);
  },

  // Admin configuration & reset
  getConfiguration: async (): Promise<AxiosResponse<{ success: boolean; data: any }>> => {
    return api.get('/admin/configuration');
  },

  updateConfiguration: async (data: any): Promise<AxiosResponse<{ success: boolean; message: string }>> => {
    return api.post('/admin/configuration', data);
  },

  initiateAdminReset: async (data: { password?: string; frames?: string[] }): Promise<AxiosResponse<{ success: boolean; message: string; recoveryEmailMasked?: string }>> => {
    return api.post('/admin/reset/initiate', data);
  },

  verifyAdminResetOtp: async (data: { otp?: string }): Promise<AxiosResponse<{ success: boolean; message: string }>> => {
    return api.post('/admin/reset/verify-otp', data);
  },

  replaceAdmin: async (data: any): Promise<AxiosResponse<{ success: boolean; message: string }>> => {
    return api.post('/admin/reset/replace', data);
  },

  getLocationTimingRequests: async (): Promise<AxiosResponse<{ success: boolean; data: any[] }>> => {
    return api.get('/admin/location-timing-requests');
  },

  updateLocationTimingRequest: async (
    requestId: number,
    data: { status: 'approved' | 'rejected'; adminNotes?: string }
  ): Promise<AxiosResponse<{ success: boolean; data: any }>> => {
    return api.put(`/admin/location-timing-requests/${requestId}`, data);
  },

  // Account recovery requests
  getPendingRecoveries: async (): Promise<AxiosResponse<{ success: boolean; data: any[] }>> => {
    return api.get('/auth/recovery/pending');
  },

  approveRecovery: async (id: number, notes?: string): Promise<AxiosResponse<any>> => {
    return api.post(`/auth/recovery/${id}/approve`, { notes });
  },

  rejectRecovery: async (id: number, reason?: string): Promise<AxiosResponse<any>> => {
    return api.post(`/auth/recovery/${id}/reject`, { reason });
  },
};
