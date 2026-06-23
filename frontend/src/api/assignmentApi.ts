import api from '@services/api';
import { AxiosResponse } from 'axios';

export interface Assignment {
  id: number;
  title: string;
  description: string | null;
  instructions: string | null;
  teacher_id: number;
  subject: string;
  due_date: string;
  total_marks: number;
  allowed_file_types: string | null;
  max_file_size_mb: number;
  created_at: string;
  updated_at: string;
  teacher_name?: string;
  submission_id?: number | null;
  submission_status?: string | null;
  submitted_at?: string | null;
  marks?: number | null;
  feedback?: string | null;
  submission_count?: number;
  total_students?: number;
}

export interface SubmissionFile {
  id: number;
  file_name: string;
  file_size: number;
  uploaded_at: string;
}

export interface StudentSubmission {
  student_id: number;
  student_code: string;
  first_name: string;
  last_name: string;
  department: string | null;
  submission_id: number | null;
  comments: string | null;
  submitted_at: string | null;
  submission_status: string | null; // 'submitted' | 'reviewed' | null
  marks: number | null;
  feedback: string | null;
  files: SubmissionFile[];
}

export interface AssignmentDetailResponse {
  assignment: Assignment;
  submissions: StudentSubmission[];
}

export interface StudentAssignmentDetailResponse {
  assignment: Assignment;
  submission: {
    id: number;
    assignment_id: number;
    student_id: number;
    comments: string | null;
    submitted_at: string;
    status: string;
    marks: number | null;
    feedback: string | null;
  } | null;
  files: SubmissionFile[];
}

export const assignmentApi = {
  // Teacher endpoints
  createAssignment: async (data: any): Promise<AxiosResponse<{ success: boolean; data: Assignment }>> => {
    return api.post('/assignments', data);
  },
  getTeacherAssignments: async (): Promise<AxiosResponse<{ success: boolean; data: Assignment[] }>> => {
    return api.get('/assignments/teacher');
  },
  getAssignmentDetails: async (id: number): Promise<AxiosResponse<{ success: boolean; data: AssignmentDetailResponse }>> => {
    return api.get(`/assignments/teacher/${id}`);
  },
  updateAssignment: async (id: number, data: any): Promise<AxiosResponse<{ success: boolean; data: Assignment }>> => {
    return api.put(`/assignments/${id}`, data);
  },
  deleteAssignment: async (id: number): Promise<AxiosResponse<{ success: boolean; message: string }>> => {
    return api.delete(`/assignments/${id}`);
  },
  gradeSubmission: async (submissionId: number, marks: number, feedback: string): Promise<AxiosResponse<{ success: boolean; message: string }>> => {
    return api.put(`/assignments/submissions/${submissionId}/grade`, { marks, feedback });
  },

  // Student endpoints
  getStudentAssignments: async (): Promise<AxiosResponse<{ success: boolean; data: Assignment[] }>> => {
    return api.get('/assignments/student');
  },
  getStudentAssignmentDetails: async (id: number): Promise<AxiosResponse<{ success: boolean; data: StudentAssignmentDetailResponse }>> => {
    return api.get(`/assignments/student/${id}`);
  },
  submitAssignment: async (id: number, comments: string, files: File[]): Promise<AxiosResponse<{ success: boolean; message: string; submissionId: number }>> => {
    const formData = new FormData();
    formData.append('comments', comments);
    files.forEach((file) => {
      formData.append('files', file);
    });
    return api.post(`/assignments/${id}/submit`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  },

  // File download URL generator
  getFileDownloadUrl: (fileId: number): string => {
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002';
    return `${baseUrl}/api/assignments/files/${fileId}/download`;
  },

  downloadFile: async (fileId: number): Promise<AxiosResponse<Blob>> => {
    return api.get(`/assignments/files/${fileId}/download`, { responseType: 'blob' });
  }
};
