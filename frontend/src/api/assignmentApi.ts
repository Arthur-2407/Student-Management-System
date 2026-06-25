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
  resources?: AssignmentResource[];
}

export interface AssignmentResource {
  resource_id: number;
  assignment_id: number;
  teacher_id: number;
  file_name: string;
  original_name: string;
  file_extension: string;
  mime_type: string | null;
  file_size: number;
  version: number;
  uploaded_at: string;
  download_count: number;
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
  resources: AssignmentResource[];
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
  resources: AssignmentResource[];
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
  },

  uploadAssignmentFiles: async (assignmentId: number, files: File[]): Promise<AxiosResponse<{ success: boolean; message: string; data: AssignmentResource[] }>> => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });
    return api.post(`/assignments/${assignmentId}/files`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  },

  deleteAssignmentFile: async (fileId: number): Promise<AxiosResponse<{ success: boolean; message: string }>> => {
    return api.delete(`/assignments/files/${fileId}`);
  },

  downloadResource: async (assignmentId: number, fileId: number): Promise<AxiosResponse<Blob>> => {
    return api.get(`/assignments/student/assignments/${assignmentId}/download/${fileId}`, { responseType: 'blob' });
  },

  getPredictionMetrics: async (studentId: number): Promise<AxiosResponse<{
    success: boolean;
    data: {
      studentId: number;
      attendanceRate: number;
      assignmentCompletionRate: number;
      internalAssessmentMarks: number;
      averageAssignmentMarksPercent: number;
    };
  }>> => {
    return api.get(`/assignments/prediction-metrics/${studentId}`);
  },

  predictMarks: async (data: {
    attendanceRate: number;
    previousSemesterMarks: number;
    assignmentCompletionRate: number;
    internalAssessmentMarks: number;
    studyHours: number;
    mockTestMarks: number;
    studentId?: number;
  }): Promise<AxiosResponse<{
    success: boolean;
    data: {
      predictedMarks: number;
      grade: string;
      passProbability: number;
      riskLevel: string;
      suggestions: string[];
    };
  }>> => {
    return api.post('/assignments/predict-marks', data);
  },

  getPredictionHistory: async (studentId: number): Promise<AxiosResponse<{
    success: boolean;
    data: Array<{
      predicted_marks: number;
      pass_probability: number;
      created_at: string;
    }>;
  }>> => {
    return api.get(`/assignments/prediction-history/${studentId}`);
  },

  // Mock Exam endpoints
  createMockExam: async (data: any): Promise<AxiosResponse<{ success: boolean; data: MockExam }>> => {
    return api.post('/assignments/mock-exams', data);
  },
  getTeacherMockExams: async (): Promise<AxiosResponse<{ success: boolean; data: MockExam[] }>> => {
    return api.get('/assignments/mock-exams/teacher');
  },
  getStudentMockExams: async (): Promise<AxiosResponse<{ success: boolean; data: MockExam[] }>> => {
    return api.get('/assignments/mock-exams/student');
  },
  getMockExamDetails: async (id: number): Promise<AxiosResponse<{
    success: boolean;
    data: {
      exam: MockExam;
      questions: MockExamQuestion[];
      attempt: MockExamAttempt | null;
    };
  }>> => {
    return api.get(`/assignments/mock-exams/${id}`);
  },
  submitMockExamAttempt: async (id: number, answers: Array<{ questionId: number; selectedOption: string | null }>): Promise<AxiosResponse<{ success: boolean; data: MockExamAttempt }>> => {
    return api.post(`/assignments/mock-exams/${id}/attempt`, { answers });
  },
  getMockExamResults: async (id: number): Promise<AxiosResponse<{
    success: boolean;
    data: {
      attempts: MockExamAttempt[];
      questionPerformance: Array<{
        question_id: number;
        question_text: string;
        total_responses: number;
        correct_responses: number;
      }>;
    };
  }>> => {
    return api.get(`/assignments/mock-exams/${id}/results`);
  },
  getMockExamReview: async (id: number, studentId?: number): Promise<AxiosResponse<{
    success: boolean;
    data: {
      attempt: MockExamAttempt;
      questions: MockExamQuestionReview[];
    };
  }>> => {
    const params = studentId ? { studentId } : {};
    return api.get(`/assignments/mock-exams/${id}/review`, { params });
  },
  uploadQuestionImage: async (file: File): Promise<AxiosResponse<{ success: boolean; imageUrl: string }>> => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post('/assignments/mock-exams/upload-image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  }
};

export interface MockExam {
  id: number;
  subject: string;
  title: string;
  description: string | null;
  total_marks: number;
  passing_marks: number;
  duration_minutes: number;
  negative_marking: boolean;
  teacher_id: number;
  due_date: string;
  created_at: string;
  updated_at: string;
  teacher_name?: string;
  attempt_id?: number | null;
  attempt_score?: number | null;
  attempt_percentage?: number | null;
  attempt_grade?: string | null;
  attempt_status?: string | null;
  attempt_submitted_at?: string | null;
  question_count?: number;
}

export interface MockExamQuestion {
  id: number;
  exam_id: number;
  question_text: string;
  image_url: string | null;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option?: string;
  question_marks: number;
}

export interface MockExamAttempt {
  id: number;
  exam_id: number;
  student_id: number;
  score: number;
  percentage: number;
  grade: string;
  status: string;
  correct_answers_count: number;
  wrong_answers_count: number;
  submitted_at: string;
  student_code?: string;
  first_name?: string;
  last_name?: string;
}

export interface MockExamQuestionReview extends MockExamQuestion {
  selected_option: string | null;
  is_correct: boolean;
}
