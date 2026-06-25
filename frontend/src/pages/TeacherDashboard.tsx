import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  FaUsers, 
  FaExclamationTriangle, 
  FaMapMarkerAlt,
  FaUserCheck,
  FaUserClock,
  FaPlus,
  FaEdit,
  FaTrashAlt,
  FaFileAlt,
  FaBookOpen,
  FaDownload,
  FaGraduationCap,
  FaCloudUploadAlt
} from 'react-icons/fa';
import { assignmentApi, Assignment, StudentSubmission, AssignmentDetailResponse } from '@api/assignmentApi';
import * as Recharts from 'recharts';
const BarChart = Recharts.BarChart as any;
const Bar = Recharts.Bar as any;
const XAxis = Recharts.XAxis as any;
const YAxis = Recharts.YAxis as any;
const CartesianGrid = Recharts.CartesianGrid as any;
const Tooltip = Recharts.Tooltip as any;
const Legend = Recharts.Legend as any;
const ResponsiveContainer = Recharts.ResponsiveContainer as any;
const PieChart = Recharts.PieChart as any;
const Pie = Recharts.Pie as any;
const Cell = Recharts.Cell as any;
import { securityApi } from '@api/securityApi';
import { attendanceApi } from '@api/attendanceApi';
import { adminApi, TeamMember } from '@api/adminApi';
import { faceManagementApi, FaceChangeRequest } from '@api/faceManagementApi';
import { leaveApi, LeaveRequest } from '@api/leaveApi';
import { useNotification } from '@contexts/NotificationContext';
import { websocketService } from '@services/websocketService';

interface SecurityEvent {
  id: number;
  student_id: number | null;
  event_type: string;
  timestamp: string;
  severity: string;
  student?: {
    student_id: string;
    first_name: string;
    last_name: string;
  };
}

interface LoginLog {
  id: number;
  student_id: number;
  success: boolean;
  spoof_detected: boolean;
  timestamp: string;
  student?: {
    student_id: string;
    first_name: string;
    last_name: string;
  };
}

interface TeamAttendance {
  id: number;
  student_id: number;
  check_in_time: string;
  check_out_time: string | null;
  geo_fence_status: boolean;
  distance_from_office?: number | null;
  checkout_geo_fence_status?: boolean | null;
  checkout_distance_from_office?: number | null;
  student?: {
    student_id: string;
    first_name: string;
    last_name: string;
    department: string;
  };
}

const TeacherDashboard: React.FC = () => {
  const { showError, showSuccess } = useNotification();
  
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [_loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  const [teamAttendance, setTeamAttendance] = useState<TeamAttendance[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [faceRequests, setFaceRequests] = useState<FaceChangeRequest[]>([]);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [actionNotes, setActionNotes] = useState<string>('');
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [approvingLeaveId, setApprovingLeaveId] = useState<number | null>(null);
  const [rejectingLeaveId, setRejectingLeaveId] = useState<number | null>(null);
  const [leaveActionReason, setLeaveActionReason] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [previewAttachment, setPreviewAttachment] = useState<{ data: string; name: string } | null>(null);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showPresentModal, setShowPresentModal] = useState(false);
  const [showPendingLeaveModal, setShowPendingLeaveModal] = useState(false);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  // Assignment state variables
  const [activeTab, setActiveTab] = useState<'overview' | 'assignments' | 'prediction' | 'mock-exam'>('overview');

  // Mock Exam Tab State
  const [mockExams, setMockExams] = useState<any[]>([]);
  const [mockExamsLoading, setMockExamsLoading] = useState(false);
  const [selectedMockId, setSelectedMockId] = useState<number | null>(null);
  const [mockDetails, setMockDetails] = useState<any | null>(null);
  const [mockDetailsLoading, setMockDetailsLoading] = useState(false);
  const [showCreateMockModal, setShowCreateMockModal] = useState(false);
  const [mockResults, setMockResults] = useState<any | null>(null);
  // const [mockResultsLoading, setMockResultsLoading] = useState(false);

  // Create mock test form state
  const [mockSubject, setMockSubject] = useState('');
  const [mockTitle, setMockTitle] = useState('');
  const [mockDescription, setMockDescription] = useState('');
  const [mockTotalMarks, setMockTotalMarks] = useState('50');
  const [mockPassingMarks, setMockPassingMarks] = useState('20');
  const [mockDuration, setMockDuration] = useState('30');
  const [mockNegativeMarking, setMockNegativeMarking] = useState(false);
  const [mockDueDate, setMockDueDate] = useState('');
  const [mockQuestions, setMockQuestions] = useState<any[]>([
    { questionText: '', optionA: '', optionB: '', optionC: '', optionD: '', correctOption: 'A', questionMarks: 2, imageUrl: null }
  ]);
  const [mockSaving, setMockSaving] = useState(false);

  // Student review state
  // const [selectedReviewStudentId, setSelectedReviewStudentId] = useState<number | null>(null);
  const [studentReviewData, setStudentReviewData] = useState<any | null>(null);
  // const [studentReviewLoading, setStudentReviewLoading] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);

  // Mark Prediction Tab State
  const [selectedStudentPredictId, setSelectedStudentPredictId] = useState<number | null>(null);
  const [predAttendanceRate, setPredAttendanceRate] = useState<number>(85);
  const [predPrevMarks, setPredPrevMarks] = useState<number>(75);
  const [predCompRate, setPredCompRate] = useState<number>(85);
  const [predInternalMarks, setPredInternalMarks] = useState<number>(15);
  const [predStudyHours, setPredStudyHours] = useState<number>(6);
  const [predMockMarks, setPredMockMarks] = useState<number>(80);
  const [predictLoading, setPredictLoading] = useState<boolean>(false);
  const [predictSaving, setPredictSaving] = useState<boolean>(false);
  const [predictionResult, setPredictionResult] = useState<any | null>(null);
  const [predictionHistory, setPredictionHistory] = useState<any[]>([]);

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null);
  const [assignmentDetails, setAssignmentDetails] = useState<AssignmentDetailResponse | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [listTab, setListTab] = useState<'active' | 'past'>('active');
  
  
  // Create / Edit Assignment Form Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formInstructions, setFormInstructions] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formTotalMarks, setFormTotalMarks] = useState('20');
  const [formAllowedFileTypes, setFormAllowedFileTypes] = useState('pdf,doc,docx,xls,xlsx,ppt,pptx,jpg,jpeg,png,zip,txt');
  const [formMaxFileSize, setFormMaxFileSize] = useState('25');
  const [formSaving, setFormSaving] = useState(false);
  
  // Grading Modal state
  const [showGradingModal, setShowGradingModal] = useState(false);
  const [gradingSubmission, setGradingSubmission] = useState<StudentSubmission | null>(null);
  const [gradingMarks, setGradingMarks] = useState('');
  const [gradingFeedback, setGradingFeedback] = useState('');
  const [gradingSaving, setGradingSaving] = useState(false);
  
  // Attachment reference files state
  const [selectedResources, setSelectedResources] = useState<File[]>([]);
  const [existingResources, setExistingResources] = useState<any[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getImageUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002';
    return `${baseUrl}${url}`;
  };

  // Fetch pending face change requests
  const fetchFaceRequests = async () => {
    try {
      const response = await faceManagementApi.getPendingRequests();
      if (response.data.success) {
        setFaceRequests(response.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch pending face requests:', err);
    }
  };

  const handleApprove = async (id: number) => {
    try {
      setApprovingId(id);
      const response = await faceManagementApi.approveRequest(id, actionNotes);
      if (response.data.success) {
        showSuccess('Face change request approved successfully!');
        setActionNotes('');
        setApprovingId(null);
        fetchFaceRequests();
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to approve request');
      setApprovingId(null);
    }
  };

  const handleReject = async (id: number) => {
    try {
      setRejectingId(id);
      const response = await faceManagementApi.rejectRequest(id, actionNotes);
      if (response.data.success) {
        showSuccess('Face change request rejected successfully!');
        setActionNotes('');
        setRejectingId(null);
        fetchFaceRequests();
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to reject request');
      setRejectingId(null);
    }
  };

  // Fetch pending leave requests
  const fetchLeaveRequests = async () => {
    try {
      const response = await leaveApi.getTeamRequests();
      setLeaveRequests((response.data || []).filter((r: LeaveRequest) => r.status === 'pending'));
    } catch (err) {
      console.error('Failed to fetch pending leave requests:', err);
    }
  };

  const handleApproveLeave = async (id: number) => {
    try {
      setApprovingLeaveId(id);
      const response = await leaveApi.approveRequest(id);
      if (response.status === 200 || response.data) {
        showSuccess('Leave request approved successfully!');
        setApprovingLeaveId(null);
        fetchLeaveRequests();
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to approve leave request');
      setApprovingLeaveId(null);
    }
  };

  const handleRejectLeave = async (id: number) => {
    if (!leaveActionReason.trim()) {
      showError('Please provide a rejection reason');
      return;
    }
    try {
      setRejectingLeaveId(id);
      const response = await leaveApi.rejectRequest(id, leaveActionReason);
      if (response.status === 200 || response.data) {
        showSuccess('Leave request rejected successfully!');
        setLeaveActionReason('');
        setRejectingLeaveId(null);
        fetchLeaveRequests();
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to reject leave request');
      setRejectingLeaveId(null);
    }
  };

  // STABILIZATION: Fetch teacher data with AbortController and resilient parallel fetching
  const fetchData = useCallback(async (signal?: AbortSignal, skipLoading = false) => {
    try {
      if (!skipLoading) setLoading(true);

      // STABILIZATION: Parallel fetch with allSettled — one failure doesn't block others
      const [securityResult, loginResult, attendanceResult, teamResult, faceRequestsResult, leaveRequestsResult] = await Promise.allSettled([
        securityApi.getSecurityEvents(10),
        securityApi.getLoginLogs(10),
        attendanceApi.getHistory({
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          limit: 25,
          scope: 'team',
        }),
        adminApi.getMyTeam(),
        faceManagementApi.getPendingRequests(),
        leaveApi.getTeamRequests(),
      ]);

      if (signal?.aborted) return;

      if (securityResult.status === 'fulfilled') {
        setSecurityEvents(securityResult.value.data);
      } else {
        console.error('Security events fetch error:', securityResult.reason);
      }

      if (loginResult.status === 'fulfilled') {
        setLoginLogs(loginResult.value.data);
      } else {
        console.error('Login logs fetch error:', loginResult.reason);
      }

      if (attendanceResult.status === 'fulfilled') {
        setTeamAttendance(
          (attendanceResult.value.data.records || []).map((record: any) => ({
            id: record.id,
            student_id: record.student_id,
            check_in_time: record.check_in_time,
            check_out_time: record.check_out_time,
            geo_fence_status: record.geo_fence_status,
            distance_from_office: record.distance_from_office,
            checkout_geo_fence_status: record.checkout_geo_fence_status,
            checkout_distance_from_office: record.checkout_distance_from_office,
            student: {
              student_id: record.student?.student_id || record.student_id || '',
              first_name: record.student?.first_name || record.first_name || '',
              last_name: record.student?.last_name || record.last_name || '',
              department: record.student?.department || record.department || '',
            },
          }))
        );
      } else {
        console.error('Attendance fetch error:', attendanceResult.reason);
      }

      if (teamResult.status === 'fulfilled') {
        setTeamMembers(teamResult.value.data.data || []);
      } else {
        console.error('Team members fetch error:', teamResult.reason);
      }

      if (faceRequestsResult.status === 'fulfilled' && faceRequestsResult.value.data.success) {
        setFaceRequests(faceRequestsResult.value.data.data);
      } else {
        console.error('Face requests fetch error:', faceRequestsResult);
      }

      if (leaveRequestsResult.status === 'fulfilled') {
        setLeaveRequests((leaveRequestsResult.value.data || []).filter((r: LeaveRequest) => r.status === 'pending'));
      } else {
        console.error('Leave requests fetch error:', leaveRequestsResult.reason);
      }
    } catch (error: any) {
      if (error?.name === 'CanceledError') return;
      console.error('Teacher data fetch error:', error);
      showError('Failed to load teacher dashboard data');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [dateRange, showError]);

  useEffect(() => {
    const abortController = new AbortController();
    fetchData(abortController.signal);

    // STABILIZATION: Loading timeout — auto-resolve after 15s to prevent infinite spinner
    const loadingTimeout = setTimeout(() => {
      setLoading(false);
    }, 15_000);

    return () => {
      abortController.abort();
      clearTimeout(loadingTimeout);
    };
  }, [fetchData]);

  // Listen for realtime updates via WebSocket
  useEffect(() => {
    const handleRealtimeUpdate = (data: any) => {
      console.log('[TeacherDashboard] WebSocket event received, re-fetching data...', data);
      // Skip showing loading spinner to avoid UI jarring
      fetchData(undefined, true);
    };

    websocketService.on('attendance_update', handleRealtimeUpdate);
    websocketService.on('security_alert', handleRealtimeUpdate);
    websocketService.on('system_notification', handleRealtimeUpdate);

    return () => {
      websocketService.off('attendance_update', handleRealtimeUpdate);
      websocketService.off('security_alert', handleRealtimeUpdate);
      websocketService.off('system_notification', handleRealtimeUpdate);
    };
  }, [fetchData]);

  const handleSelectStudentForPrediction = async (studentId: number | null) => {
    setSelectedStudentPredictId(studentId);
    setPredictionResult(null);
    setPredictionHistory([]);
    if (!studentId) return;

    try {
      setPredictLoading(true);
      const metricsRes = await assignmentApi.getPredictionMetrics(studentId);
      const historyRes = await assignmentApi.getPredictionHistory(studentId);

      if (metricsRes.data.success) {
        const metrics = metricsRes.data.data;
        setPredAttendanceRate(metrics.attendanceRate);
        setPredCompRate(metrics.assignmentCompletionRate);
        setPredInternalMarks(metrics.internalAssessmentMarks);
        if (metrics.mockTestMarks !== undefined) setPredMockMarks(metrics.mockTestMarks);
        if (metrics.studyHours !== undefined) setPredStudyHours(metrics.studyHours);
        if (metrics.previousSemesterMarks !== undefined) setPredPrevMarks(metrics.previousSemesterMarks);
      }
      
      if (historyRes.data.success) {
        setPredictionHistory(historyRes.data.data);
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to fetch student prediction indicators');
    } finally {
      setPredictLoading(false);
    }
  };

  const handleGeneratePrediction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentPredictId) {
      showError('Please select a student first');
      return;
    }

    try {
      setPredictSaving(true);
      const response = await assignmentApi.predictMarks({
        attendanceRate: predAttendanceRate,
        previousSemesterMarks: predPrevMarks,
        assignmentCompletionRate: predCompRate,
        internalAssessmentMarks: predInternalMarks,
        studyHours: predStudyHours,
        mockTestMarks: predMockMarks,
        studentId: selectedStudentPredictId
      });

      if (response.data.success) {
        setPredictionResult(response.data.data);
        const data = response.data.data;
        if (data.attendanceRate !== undefined) setPredAttendanceRate(data.attendanceRate);
        if (data.assignmentCompletionRate !== undefined) setPredCompRate(data.assignmentCompletionRate);
        if (data.internalAssessmentMarks !== undefined) setPredInternalMarks(data.internalAssessmentMarks);
        if (data.studyHours !== undefined) setPredStudyHours(data.studyHours);
        if (data.mockTestMarks !== undefined) setPredMockMarks(data.mockTestMarks);
        showSuccess('Prediction generated successfully!');
        
        // Refresh history
        const historyRes = await assignmentApi.getPredictionHistory(selectedStudentPredictId);
        if (historyRes.data.success) {
          setPredictionHistory(historyRes.data.data);
        }
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to run prediction model');
    } finally {
      setPredictSaving(false);
    }
  };

  const fetchTeacherMockExams = async () => {
    try {
      setMockExamsLoading(true);
      const response = await assignmentApi.getTeacherMockExams();
      if (response.data.success) {
        setMockExams(response.data.data);
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to fetch mock exams');
    } finally {
      setMockExamsLoading(false);
    }
  };

  const handleSelectMockExam = async (id: number) => {
    setSelectedMockId(id);
    setMockResults(null);
    try {
      setMockDetailsLoading(true);
      const detailsRes = await assignmentApi.getMockExamDetails(id);
      if (detailsRes.data.success) {
        setMockDetails(detailsRes.data.data);
      }
      
      // setMockResultsLoading(true);
      const resultsRes = await assignmentApi.getMockExamResults(id);
      if (resultsRes.data.success) {
        setMockResults(resultsRes.data.data);
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to load mock exam data');
    } finally {
      setMockDetailsLoading(false);
      // setMockResultsLoading(false);
    }
  };

  const handleAddMockQuestion = () => {
    setMockQuestions(prev => [
      ...prev,
      { questionText: '', optionA: '', optionB: '', optionC: '', optionD: '', correctOption: 'A', questionMarks: 2, imageUrl: null }
    ]);
  };

  const handleRemoveMockQuestion = (index: number) => {
    if (mockQuestions.length <= 1) {
      showError('You must have at least one question');
      return;
    }
    setMockQuestions(prev => prev.filter((_, i) => i !== index));
  };

  const handleQuestionChange = (index: number, field: string, value: any) => {
    setMockQuestions(prev => prev.map((q, i) => i === index ? { ...q, [field]: value } : q));
  };

  const handleQuestionImageUpload = async (index: number, file: File) => {
    try {
      const res = await assignmentApi.uploadQuestionImage(file);
      if (res.data.success) {
        handleQuestionChange(index, 'imageUrl', res.data.imageUrl);
        showSuccess('Question image uploaded successfully!');
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to upload question image');
    }
  };

  const handleCreateMockExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mockSubject || !mockTitle || !mockDueDate) {
      showError('Subject, Title, and Due Date are required');
      return;
    }

    if (mockQuestions.length === 0) {
      showError('Please add at least one question');
      return;
    }

    // Validate questions choices
    for (let i = 0; i < mockQuestions.length; i++) {
      const q = mockQuestions[i];
      if (!q.questionText || !q.optionA || !q.optionB || !q.optionC || !q.optionD) {
        showError(`Question ${i + 1} has incomplete text or options`);
        return;
      }
    }

    try {
      setMockSaving(true);
      const response = await assignmentApi.createMockExam({
        subject: mockSubject,
        title: mockTitle,
        description: mockDescription || null,
        totalMarks: parseInt(mockTotalMarks, 10),
        passingMarks: parseInt(mockPassingMarks, 10),
        durationMinutes: parseInt(mockDuration, 10),
        negativeMarking: mockNegativeMarking,
        dueDate: mockDueDate,
        questions: mockQuestions
      });

      if (response.data.success) {
        showSuccess('Mock exam created successfully!');
        setShowCreateMockModal(false);
        // Reset form
        setMockSubject('');
        setMockTitle('');
        setMockDescription('');
        setMockTotalMarks('50');
        setMockPassingMarks('20');
        setMockDuration('30');
        setMockNegativeMarking(false);
        setMockDueDate('');
        setMockQuestions([{ questionText: '', optionA: '', optionB: '', optionC: '', optionD: '', correctOption: 'A', questionMarks: 2, imageUrl: null }]);
        fetchTeacherMockExams();
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to create mock exam');
    } finally {
      setMockSaving(false);
    }
  };

  const handleLoadStudentAttemptReview = async (studentId: number) => {
    if (!selectedMockId) return;
    try {
      // setStudentReviewLoading(true);
      // setSelectedReviewStudentId(studentId);
      const res = await assignmentApi.getMockExamReview(selectedMockId, studentId);
      if (res.data.success) {
        setStudentReviewData(res.data.data);
        setShowReviewModal(true);
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to load attempt details');
    } finally {
      // setStudentReviewLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'mock-exam') {
      fetchTeacherMockExams();
      setSelectedMockId(null);
      setMockDetails(null);
      setMockResults(null);
    }
  }, [activeTab]);

  // Assignments helper functions
  const fetchTeacherAssignments = async () => {
    try {
      setAssignmentsLoading(true);
      const response = await assignmentApi.getTeacherAssignments();
      if (response.data.success) {
        setAssignments(response.data.data);
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to fetch assignments');
    } finally {
      setAssignmentsLoading(false);
    }
  };

  const fetchAssignmentDetails = async (id: number) => {
    try {
      setDetailsLoading(true);
      const response = await assignmentApi.getAssignmentDetails(id);
      if (response.data.success) {
        setAssignmentDetails(response.data.data);
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to fetch assignment details');
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleSelectAssignment = (id: number) => {
    setSelectedAssignmentId(id);
    fetchAssignmentDetails(id);
  };

  const resetForm = () => {
    setEditingAssignment(null);
    setFormTitle('');
    setFormSubject('');
    setFormDescription('');
    setFormInstructions('');
    setFormDueDate('');
    setFormTotalMarks('20');
    setFormAllowedFileTypes('pdf,doc,docx,xls,xlsx,ppt,pptx,jpg,jpeg,png,zip,rar,txt,csv,gif,mp4,mp3');
    setFormMaxFileSize('25');
    setSelectedResources([]);
    setExistingResources([]);
    setUploadProgress(null);
  };

  const handleOpenEdit = async (assignment: Assignment) => {
    setEditingAssignment(assignment);
    setFormTitle(assignment.title);
    setFormSubject(assignment.subject);
    setFormDescription(assignment.description || '');
    setFormInstructions(assignment.instructions || '');
    if (assignment.due_date) {
      const date = new Date(assignment.due_date);
      const tzoffset = date.getTimezoneOffset() * 60000;
      const localISOTime = (new Date(date.getTime() - tzoffset)).toISOString().slice(0, 16);
      setFormDueDate(localISOTime);
    } else {
      setFormDueDate('');
    }
    setFormTotalMarks(String(assignment.total_marks));
    setFormAllowedFileTypes(assignment.allowed_file_types || 'pdf,doc,docx,xls,xlsx,ppt,pptx,jpg,jpeg,png,zip,rar,txt,csv,gif,mp4,mp3');
    setFormMaxFileSize(String(assignment.max_file_size_mb));
    setSelectedResources([]);
    setExistingResources([]);
    setUploadProgress(null);
    setShowCreateModal(true);

    try {
      const response = await assignmentApi.getAssignmentDetails(assignment.id);
      if (response.data.success && response.data.data.resources) {
        setExistingResources(response.data.data.resources);
      }
    } catch (err) {
      console.error("Failed to fetch assignment resources for editing", err);
    }
  };

  const handleCreateOrUpdateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle || !formSubject || !formDueDate || !formTotalMarks) {
      showError('Title, Subject, Due Date, and Total Marks are required');
      return;
    }

    const payload = {
      title: formTitle,
      subject: formSubject,
      description: formDescription,
      instructions: formInstructions,
      dueDate: formDueDate,
      totalMarks: parseInt(formTotalMarks, 10),
      allowedFileTypes: formAllowedFileTypes,
      maxFileSizeMb: parseInt(formMaxFileSize, 10)
    };

    try {
      setFormSaving(true);
      let response;
      if (editingAssignment) {
        response = await assignmentApi.updateAssignment(editingAssignment.id, payload);
      } else {
        response = await assignmentApi.createAssignment(payload);
      }

      if (response.data.success) {
        const savedAssignment = response.data.data;
        if (selectedResources.length > 0) {
          setUploadProgress(15);
          try {
            await assignmentApi.uploadAssignmentFiles(savedAssignment.id, selectedResources);
            setUploadProgress(100);
          } catch (uploadErr: any) {
            showError('Assignment saved, but reference files failed to upload: ' + (uploadErr.response?.data?.message || uploadErr.message));
          }
        }
        showSuccess(editingAssignment ? 'Assignment updated successfully!' : 'Assignment created successfully!');
        setShowCreateModal(false);
        resetForm();
        fetchTeacherAssignments();
        if (selectedAssignmentId && (editingAssignment?.id === selectedAssignmentId || savedAssignment.id === selectedAssignmentId)) {
          fetchAssignmentDetails(selectedAssignmentId);
        }
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to save assignment');
    } finally {
      setFormSaving(false);
      setUploadProgress(null);
    }
  };

  const handleDeleteAssignment = async (id: number) => {
    if (!window.confirm('Are you sure you want to permanently delete this assignment? All student submissions will be lost.')) return;
    try {
      const response = await assignmentApi.deleteAssignment(id);
      if (response.data.success) {
        showSuccess('Assignment deleted successfully!');
        if (selectedAssignmentId === id) {
          setSelectedAssignmentId(null);
          setAssignmentDetails(null);
        }
        fetchTeacherAssignments();
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to delete assignment');
    }
  };

  const handleOpenGrading = (submission: StudentSubmission) => {
    setGradingSubmission(submission);
    setGradingMarks(submission.marks !== null && submission.marks !== undefined ? String(submission.marks) : '');
    setGradingFeedback(submission.feedback || '');
    setShowGradingModal(true);
  };

  const handleGradeSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradingSubmission || !gradingSubmission.submission_id) return;
    
    const marksNum = parseInt(gradingMarks, 10);
    if (isNaN(marksNum) || marksNum < 0 || (assignmentDetails && marksNum > assignmentDetails.assignment.total_marks)) {
      showError(`Marks must be between 0 and ${assignmentDetails?.assignment.total_marks}`);
      return;
    }

    try {
      setGradingSaving(true);
      const response = await assignmentApi.gradeSubmission(
        gradingSubmission.submission_id,
        marksNum,
        gradingFeedback
      );

      if (response.data.success) {
        showSuccess('Submission graded successfully!');
        setShowGradingModal(false);
        if (selectedAssignmentId) {
          fetchAssignmentDetails(selectedAssignmentId);
        }
        fetchTeacherAssignments();
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to grade submission');
    } finally {
      setGradingSaving(false);
    }
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    switch (ext) {
      case 'pdf': return <FaFileAlt className="text-red-500 text-lg" />;
      case 'doc':
      case 'docx': return <FaFileAlt className="text-blue-500 text-lg" />;
      case 'xls':
      case 'xlsx': return <FaFileAlt className="text-green-500 text-lg" />;
      default: return <FaFileAlt className="text-gray-500 text-lg" />;
    }
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // File drag & drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addResources(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addResources(Array.from(e.target.files));
    }
  };

  const addResources = (files: File[]) => {
    const allowedExtensions = (formAllowedFileTypes || 'pdf,doc,docx,xls,xlsx,ppt,pptx,jpg,jpeg,png,zip,rar,txt,csv,gif,mp4,mp3').split(',').map(e => e.trim().toLowerCase());
    const maxSizeBytes = parseInt(formMaxFileSize, 10) * 1024 * 1024;

    const validFiles: File[] = [];
    files.forEach(file => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (!allowedExtensions.includes(ext)) {
        showError(`File type ".${ext}" is not allowed for this assignment.`);
        return;
      }
      if (file.size > maxSizeBytes) {
        showError(`File "${file.name}" exceeds the ${formMaxFileSize}MB limit.`);
        return;
      }
      validFiles.push(file);
    });

    setSelectedResources(prev => {
      const uniqueNew = validFiles.filter(
        newFile => !prev.some(p => p.name === newFile.name && p.size === newFile.size)
      );
      return [...prev, ...uniqueNew];
    });
  };

  const handleRemoveSelectedResource = (index: number) => {
    setSelectedResources(prev => prev.filter((_, i) => i !== index));
  };

  const handleDeleteExistingResource = async (fileId: number) => {
    if (!window.confirm('Are you sure you want to permanently delete this reference file?')) return;
    try {
      const response = await assignmentApi.deleteAssignmentFile(fileId);
      if (response.data.success) {
        showSuccess('Reference file deleted successfully');
        setExistingResources(prev => prev.filter(r => r.resource_id !== fileId));
        if (selectedAssignmentId) {
          fetchAssignmentDetails(selectedAssignmentId);
        }
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to delete reference file');
    }
  };

  const handleDownloadResource = async (assignmentId: number, fileId: number, fileName: string) => {
    try {
      const response = await assignmentApi.downloadResource(assignmentId, fileId);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (err) {
      showError('Failed to download reference file');
    }
  };

  const handleDownloadFile = async (fileId: number, fileName: string) => {
    try {
      const response = await assignmentApi.downloadFile(fileId);
      const blob = new Blob([response.data], { type: (response.headers['content-type'] as string) || undefined });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to download file');
    }
  };

  useEffect(() => {
    if (activeTab === 'assignments') {
      fetchTeacherAssignments();
    }
  }, [activeTab]);

  // Format geo-fence distance helper
  const formatDistance = (dist: number | null | undefined) => {
    if (dist === null || dist === undefined) return '—';
    if (dist < 1000) {
      return `${Math.round(dist)}m`;
    }
    return `${(dist / 1000).toFixed(2)}km`;
  };

  // Get event type icon
  const getEventTypeIcon = (type: string) => {
    switch (type) {
      case 'SPOOF_ATTEMPT':
        return <FaExclamationTriangle className="text-red-500" />;
      case 'FACE_MISMATCH':
        return <FaUserClock className="text-yellow-500" />;
      case 'GEOFENCE_VIOLATION':
        return <FaMapMarkerAlt className="text-blue-500" />;
      default:
        return <FaExclamationTriangle className="text-gray-500" />;
    }
  };

  // Get severity color
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
      case 'critical':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Present Today selector — filter active check-ins on current date (not checked out)
  const presentTodayRecords = teamAttendance.filter(a => {
    if (!a.check_in_time) return false;
    const checkInDate = new Date(a.check_in_time).toDateString();
    const todayDate = new Date().toDateString();
    return checkInDate === todayDate && a.check_out_time === null;
  });

  // Chart data — computed from REAL security events (no hardcoding)
  const securityEventData = [
    { name: 'Spoof Attempts', value: securityEvents.filter(e => e.event_type === 'SPOOF_ATTEMPT').length },
    { name: 'Face Mismatches', value: securityEvents.filter(e => e.event_type === 'FACE_MISMATCH').length },
    { name: 'Geo Violations', value: securityEvents.filter(e => e.event_type === 'GEOFENCE_VIOLATION').length },
  ];

  // Compute department breakdown from REAL attendance data
  const departmentAttendanceData = (() => {
    const deptMap: Record<string, { present: number; absent: number }> = {};
    teamAttendance.forEach(a => {
      const dept = a.student?.department || 'Unknown';
      if (!deptMap[dept]) deptMap[dept] = { present: 0, absent: 0 };
      if (a.check_out_time === null) {
        deptMap[dept].present += 1;
      } else {
        deptMap[dept].absent += 1;
      }
    });
    return Object.entries(deptMap).map(([department, counts]) => ({
      department,
      ...counts,
    }));
  })();

  const COLORS = ['#ef4444', '#f59e0b', '#3b82f6'];

  const filteredAssignments = assignments.filter(item => {
    const isPast = new Date(item.due_date) < new Date();
    return listTab === 'past' ? isPast : !isPast;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Teacher Portal</h1>
            <p className="text-gray-500 text-sm mt-1">Manage team attendance, requests, and student assignments.</p>
          </div>
          <div className="flex bg-gray-100 p-1 rounded-xl self-start md:self-auto border border-gray-200/50">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 ${
                activeTab === 'overview'
                  ? 'bg-white text-gray-900 shadow shadow-gray-250/20'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Dashboard Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('assignments')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 ${
                activeTab === 'assignments'
                  ? 'bg-white text-gray-900 shadow shadow-gray-250/20'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Assignments Manager
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('prediction')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 ${
                activeTab === 'prediction'
                  ? 'bg-white text-gray-900 shadow shadow-gray-250/20'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Mark Prediction
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('mock-exam')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 ${
                activeTab === 'mock-exam'
                  ? 'bg-white text-gray-900 shadow shadow-gray-250/20'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Mock Exam
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {activeTab === 'overview' && (
          <>
            {/* Stats Overview — All metrics from real API data */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <motion.div
            whileHover={{ y: -5 }}
            onClick={() => setShowTeamModal(true)}
            className="bg-white rounded-xl shadow p-6 cursor-pointer"
          >
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-blue-100 text-blue-600">
                <FaUsers className="text-xl" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Team Size</p>
                <p className="text-2xl font-bold text-gray-900">
                  {loading ? '...' : (teamMembers.length > 0 ? teamMembers.length : '—')}
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            whileHover={{ y: -5 }}
            className="bg-white rounded-xl shadow p-6"
          >
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-red-100 text-red-600">
                <FaExclamationTriangle className="text-xl" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Security Alerts</p>
                <p className="text-2xl font-bold text-gray-900">
                  {securityEvents.length}
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            whileHover={{ y: -5 }}
            onClick={() => setShowPresentModal(true)}
            className="bg-white rounded-xl shadow p-6 cursor-pointer"
          >
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-green-100 text-green-600">
                <FaUserCheck className="text-xl" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Present Today</p>
                <p className="text-2xl font-bold text-gray-900">
                  {loading ? '...' : presentTodayRecords.length}
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            whileHover={{ y: -5 }}
            onClick={() => setShowPendingLeaveModal(true)}
            className="bg-white rounded-xl shadow p-6 cursor-pointer"
          >
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-yellow-100 text-yellow-600">
                <FaUserClock className="text-xl" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Pending Leave</p>
                <p className="text-2xl font-bold text-gray-900">
                  {loading ? '...' : leaveRequests.length}
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Security Events Chart */}
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Security Events Distribution</h2>
            <div className="h-80">
              {securityEventData.every(d => d.value === 0) ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    <FaUserCheck className="mx-auto text-4xl text-green-300 mb-2" />
                    <p>No Security Events</p>
                    <p className="text-sm text-gray-400 mt-1">System is operating normally</p>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <PieChart>
                    <Pie
                      data={securityEventData.filter(d => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }: any) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {securityEventData.filter(d => d.value > 0).map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Team Attendance Chart — Real data, no hardcoding */}
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Team Attendance by Department</h2>
            <div className="h-80">
              {departmentAttendanceData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    <FaUsers className="mx-auto text-4xl text-gray-300 mb-2" />
                    <p>No Data Available</p>
                    <p className="text-sm text-gray-400 mt-1">No attendance records for selected period</p>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <BarChart data={departmentAttendanceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="department" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="present" name="Present" fill="#10b981" />
                    <Bar dataKey="absent" name="Absent" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Pending Face Approvals Panel */}
        <div className="bg-white rounded-xl shadow overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">Pending Face Change Approvals</h2>
            <p className="text-gray-500 text-sm mt-1">Review and approve biometric face registration requests from your team members.</p>
          </div>
          
          {faceRequests.length === 0 ? (
            <div className="py-12 text-center">
              <FaUserCheck className="mx-auto text-4xl text-green-300" />
              <p className="mt-4 text-gray-600">No pending face change requests.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {faceRequests.map((request) => (
                <div key={request.id} className="p-6 flex flex-col md:flex-row md:items-center md:justify-between hover:bg-gray-50 transition-colors">
                  <div className="mb-4 md:mb-0">
                    <div className="flex items-center space-x-3">
                      <span className="font-semibold text-gray-900">{request.first_name} {request.last_name}</span>
                      <span className="text-xs text-gray-500">({request.student_id})</span>
                      <span className={`px-2 py-0.5 text-xs rounded-full font-bold ${
                        request.request_type === 'ADD' 
                          ? 'bg-green-100 text-green-800' 
                          : request.request_type === 'DELETE' 
                            ? 'bg-red-100 text-red-800' 
                            : 'bg-blue-100 text-blue-800'
                      }`}>
                        {request.request_type} FACE
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      Department: {request.department} &bull; Requested on {new Date(request.created_at).toLocaleDateString()}
                    </div>
                    {request.requester_student_id && request.requester_student_id !== request.student_id && (
                      <div className="text-xs text-indigo-600 mt-1">
                        Requested by: {request.requester_first_name} {request.requester_last_name} ({request.requester_student_id})
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
                    {approvingId === request.id || rejectingId === request.id ? (
                      <div className="flex flex-col space-y-2 w-full sm:w-64">
                        <input
                          type="text"
                          placeholder="Add notes/reason (optional)..."
                          value={actionNotes}
                          onChange={(e) => setActionNotes(e.target.value)}
                          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-full focus:ring-1 focus:ring-blue-500"
                        />
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => {
                              setApprovingId(null);
                              setRejectingId(null);
                              setActionNotes('');
                            }}
                            className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded-lg font-medium"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => approvingId === request.id ? handleApprove(request.id) : handleReject(request.id)}
                            className={`px-3 py-1 text-white text-xs rounded-lg font-medium ${
                              approvingId === request.id ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                            }`}
                          >
                            Confirm
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setApprovingId(request.id);
                            setRejectingId(null);
                          }}
                          className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            setRejectingId(request.id);
                            setApprovingId(null);
                          }}
                          className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending Leave Approvals Panel */}
        <div className="bg-white rounded-xl shadow overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">Pending Leave Approvals</h2>
            <p className="text-gray-500 text-sm mt-1">Review and approve or reject leave requests from your team members.</p>
          </div>
          
          {leaveRequests.length === 0 ? (
            <div className="py-12 text-center">
              <FaUserCheck className="mx-auto text-4xl text-green-300" />
              <p className="mt-4 text-gray-600">No pending leave requests.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {leaveRequests.map((request) => (
                <div key={request.id} className="p-6 flex flex-col md:flex-row md:items-center md:justify-between hover:bg-gray-50 transition-colors">
                  <div className="mb-4 md:mb-0">
                    <div className="flex items-center space-x-3">
                      <span className="font-semibold text-gray-900">
                        {request.student?.first_name} {request.student?.last_name}
                      </span>
                      <span className="text-xs text-gray-500">({request.student?.student_id})</span>
                      <span className="px-2 py-0.5 text-xs rounded-full font-bold bg-yellow-100 text-yellow-800 uppercase">
                        {request.leave_type}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      <strong>Period:</strong> {new Date(request.start_date).toLocaleDateString()} to {new Date(request.end_date).toLocaleDateString()} ({request.total_days} {request.total_days === 1 ? 'day' : 'days'})
                    </div>
                    <div className="text-sm text-gray-700 mt-2 italic bg-gray-50 p-2 rounded border border-gray-100">
                      "{request.reason}"
                    </div>
                    <div className="text-xs text-gray-400 mt-2">
                      Submitted on {new Date(request.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
                    {request.attachment_data && (
                      <button
                        onClick={() => setPreviewAttachment({ data: request.attachment_data!, name: request.attachment_name || 'attachment' })}
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        View Attachment
                      </button>
                    )}
                    {rejectingLeaveId === request.id ? (
                      <div className="flex flex-col space-y-2 w-full sm:w-64">
                        <input
                          type="text"
                          placeholder="Rejection reason (required)..."
                          value={leaveActionReason}
                          onChange={(e) => setLeaveActionReason(e.target.value)}
                          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-full focus:ring-1 focus:ring-blue-500"
                        />
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => {
                              setRejectingLeaveId(null);
                              setLeaveActionReason('');
                            }}
                            className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded-lg font-medium"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleRejectLeave(request.id)}
                            className="px-3 py-1 text-white text-xs rounded-lg font-medium bg-red-600 hover:bg-red-700"
                          >
                            Confirm Reject
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          disabled={approvingLeaveId === request.id}
                          onClick={() => handleApproveLeave(request.id)}
                          className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          {approvingLeaveId === request.id ? 'Approving...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => {
                            setRejectingLeaveId(request.id);
                            setLeaveActionReason('');
                          }}
                          className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Security Events Table */}
        <div className="bg-white rounded-xl shadow overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-xl font-bold text-gray-900">Recent Security Events</h2>
            <div className="flex space-x-3">
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange({...dateRange, startDate: e.target.value})}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm"
              />
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange({...dateRange, endDate: e.target.value})}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm"
              />
            </div>
          </div>
          
          {loading ? (
            <div className="py-12 text-center">
              <svg className="animate-spin h-12 w-12 text-blue-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="mt-4 text-gray-600">Loading security events...</p>
            </div>
          ) : securityEvents.length === 0 ? (
            <div className="py-12 text-center">
              <FaExclamationTriangle className="mx-auto text-4xl text-gray-300" />
              <p className="mt-4 text-gray-600">No security events found for the selected date range.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Student
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Event Type
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Severity
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {securityEvents.map((event) => (
                    <motion.tr 
                      key={event.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                      className="hover:bg-gray-50"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {event.student ? (
                          <div>
                            <div className="font-medium">
                              {event.student.first_name} {event.student.last_name}
                            </div>
                            <div className="text-gray-500 text-xs">
                              {event.student.student_id}
                            </div>
                          </div>
                        ) : (event as any).first_name ? (
                          <div>
                            <div className="font-medium">
                              {(event as any).first_name} {(event as any).last_name}
                            </div>
                            <div className="text-gray-500 text-xs">
                              {(event as any).student_id}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">System</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="flex items-center">
                          <div className="mr-2">
                            {getEventTypeIcon(event.event_type)}
                          </div>
                          <span>{event.event_type.replace(/_/g, ' ')}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(event.timestamp).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <span className={`px-2 py-1 text-xs rounded-full ${getSeverityColor(event.severity)}`}>
                          {event.severity}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Team Attendance Table */}
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">Team Attendance Status</h2>
          </div>
          
          {loading ? (
            <div className="py-12 text-center">
              <svg className="animate-spin h-12 w-12 text-blue-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="mt-4 text-gray-600">Loading team attendance...</p>
            </div>
          ) : teamAttendance.length === 0 ? (
            <div className="py-12 text-center">
              <FaUsers className="mx-auto text-4xl text-gray-300" />
              <p className="mt-4 text-gray-600">No team attendance data available.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Student
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Department
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Check-in & Check-out
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Geo-fence
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {teamAttendance.map((attendance) => (
                    <motion.tr 
                      key={attendance.id}
                      whileHover={{ scale: 1.005, backgroundColor: '#f9fafb' }}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="transition-colors border-l-4 border-transparent hover:border-blue-500"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {attendance.student ? (
                          <div>
                            <div className="font-semibold text-gray-900">
                              {attendance.student.first_name} {attendance.student.last_name}
                            </div>
                            <div className="text-gray-500 text-xs font-mono mt-0.5">
                              {attendance.student.student_id}
                            </div>
                          </div>
                        ) : (
                          'Unknown'
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                        {attendance.student?.department || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="flex flex-col space-y-1">
                          <div className="flex items-center text-xs text-gray-500">
                            <span className="w-8 font-semibold text-blue-600 bg-blue-50 px-1 py-0.5 rounded text-center mr-2 scale-90">IN</span>
                            <span className="font-medium text-gray-800">
                              {new Date(attendance.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className="flex items-center text-xs text-gray-500">
                            <span className="w-8 font-semibold text-green-600 bg-green-50 px-1 py-0.5 rounded text-center mr-2 scale-90">OUT</span>
                            <span className="font-medium text-gray-800">
                              {attendance.check_out_time ? (
                                new Date(attendance.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              ) : (
                                <span className="text-3xs italic text-amber-500 font-bold bg-amber-50 px-1.5 py-0.5 rounded uppercase tracking-wider">Active</span>
                              )}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="flex flex-col space-y-1.5">
                          <div className="flex items-center">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-2" />
                            <span className="text-2xs font-bold uppercase tracking-wider text-blue-600">Checked In</span>
                          </div>
                          <div className="flex items-center">
                            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-2 ${attendance.check_out_time ? 'bg-green-500' : 'bg-gray-300'}`} />
                            <span className={`text-2xs font-bold uppercase tracking-wider ${attendance.check_out_time ? 'text-green-600' : 'text-gray-400'}`}>
                              {attendance.check_out_time ? 'Checked Out' : 'Active'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="flex flex-col space-y-1">
                          {/* Check-in Geo-fence status */}
                          <div className="flex items-center justify-between min-w-[120px]">
                            <span className={`px-2 py-0.5 text-3xs font-bold rounded-full uppercase tracking-wider ${
                              attendance.geo_fence_status 
                                ? 'bg-green-50 text-green-700 border border-green-200' 
                                : 'bg-red-50 text-red-600 border border-red-150'
                            }`}>
                              {attendance.geo_fence_status ? 'Within' : 'Outside'}
                            </span>
                            <span className="text-2xs text-gray-500 font-mono font-medium ml-2">
                              {attendance.distance_from_office !== null && attendance.distance_from_office !== undefined
                                ? `(${formatDistance(attendance.distance_from_office)})`
                                : '(No data)'}
                            </span>
                          </div>
                          {/* Check-out Geo-fence status */}
                          <div className="flex items-center justify-between min-w-[120px]">
                            {attendance.check_out_time ? (
                              <>
                                <span className={`px-2 py-0.5 text-3xs font-bold rounded-full uppercase tracking-wider ${
                                  attendance.checkout_geo_fence_status 
                                    ? 'bg-green-50 text-green-700 border border-green-200' 
                                    : 'bg-red-50 text-red-600 border border-red-150'
                                }`}>
                                  {attendance.checkout_geo_fence_status ? 'Within' : 'Outside'}
                                </span>
                                <span className="text-2xs text-gray-500 font-mono font-medium ml-2">
                                  {attendance.checkout_distance_from_office !== null && attendance.checkout_distance_from_office !== undefined
                                    ? `(${formatDistance(attendance.checkout_distance_from_office)})`
                                    : '(No data)'}
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="px-2 py-0.5 text-3xs font-bold rounded-full bg-gray-50 text-gray-400 border border-gray-150 uppercase tracking-wider">Pending</span>
                                <span className="text-2xs text-gray-300 font-mono ml-2">—</span>
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
          </>
        )}

        {activeTab === 'assignments' && (
          <div className="space-y-6">
            {/* Top Toolbar */}
            <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-gray-150 shadow-sm flex-wrap gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <FaBookOpen className="text-primary-500" />
                  Course Tasks & Assignments
                </h2>
                <p className="text-gray-500 text-xs mt-0.5">Create homework and track submission evaluation progress.</p>
              </div>
              <button
                type="button"
                onClick={() => { resetForm(); setShowCreateModal(true); }}
                className="btn btn-primary px-4 py-2.5 text-xs font-semibold flex items-center gap-2 rounded-lg"
              >
                <FaPlus className="text-3xs" />
                New Assignment
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Left Side: Assignments List */}
              <div className="lg:col-span-5 bg-white rounded-xl border border-gray-150 p-4 shadow-sm space-y-4">
                <h3 className="font-bold text-gray-800 text-sm border-b border-gray-100 pb-2 flex items-center gap-2">
                  <FaFileAlt className="text-primary-500 text-xs" />
                  Assignments List
                </h3>
                
                {/* Active / Past Toggle */}
                <div className="flex border-b border-gray-150 mb-4">
                  <button
                    type="button"
                    onClick={() => setListTab('active')}
                    className={`flex-1 pb-2.5 text-xs font-bold text-center border-b-2 transition-all ${
                      listTab === 'active' 
                        ? 'border-primary-500 text-primary-650' 
                        : 'border-transparent text-gray-450 hover:text-gray-700'
                    }`}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    onClick={() => setListTab('past')}
                    className={`flex-1 pb-2.5 text-xs font-bold text-center border-b-2 transition-all ${
                      listTab === 'past' 
                        ? 'border-primary-500 text-primary-650' 
                        : 'border-transparent text-gray-450 hover:text-gray-700'
                    }`}
                  >
                    Past
                  </button>
                </div>
                
                {assignmentsLoading ? (
                  <div className="py-12 flex justify-center">
                    <div className="h-6 w-6 rounded-full border-2 border-primary-200 border-t-primary-600 animate-spin" />
                  </div>
                ) : filteredAssignments.length === 0 ? (
                  <div className="text-center py-10 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    <FaFileAlt className="mx-auto text-2xl mb-2 text-gray-300" />
                    <p className="text-sm font-medium">No {listTab} assignments found</p>
                    <p className="text-xs mt-1">Get started by creating your first assignment!</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                    {filteredAssignments.map(item => {
                      const isSelected = item.id === selectedAssignmentId;
                      const progress = item.total_students && item.total_students > 0
                        ? Math.round(((item.submission_count || 0) / item.total_students) * 100)
                        : 0;

                      return (
                        <div
                          key={item.id}
                          onClick={() => handleSelectAssignment(item.id)}
                          className={`p-4 rounded-lg border transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                            isSelected
                              ? 'bg-primary-50 border-primary-300 text-primary-950 shadow-sm'
                              : 'bg-white border-gray-100 hover:bg-gray-50/50'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-3xs font-extrabold uppercase bg-primary-100/50 text-primary-700 px-2 py-0.5 rounded">
                              {item.subject}
                            </span>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleOpenEdit(item); }}
                                className="p-1 hover:bg-gray-200 text-gray-500 rounded transition-colors"
                                title="Edit Assignment"
                              >
                                <FaEdit size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleDeleteAssignment(item.id); }}
                                className="p-1 hover:bg-red-50 text-red-500 rounded transition-colors"
                                title="Delete Assignment"
                              >
                                <FaTrashAlt size={12} />
                              </button>
                            </div>
                          </div>

                          <h4 className="font-bold text-sm text-gray-800 line-clamp-1 mb-1">{item.title}</h4>
                          <p className="text-3xs text-gray-500 line-clamp-2 mb-3 leading-relaxed">{item.description}</p>
                          
                          {/* Progress */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-4xs font-bold text-gray-400">
                              <span>Submissions: {item.submission_count} / {item.total_students || teamMembers.length}</span>
                              <span>{progress}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1">
                              <div
                                className="bg-primary-600 h-1 rounded-full transition-all duration-300"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-4xs text-gray-400 font-medium mt-3 border-t border-gray-100/50 pt-2">
                            <span>Due: {new Date(item.due_date).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            <span>Max Marks: {item.total_marks}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right Side: Assignment Details & Student Submissions */}
              <div className="lg:col-span-7">
                {!selectedAssignmentId ? (
                  <div className="bg-white rounded-xl border border-gray-150 shadow-sm p-12 text-center text-gray-400 min-h-[50vh] flex flex-col justify-center items-center">
                    <FaFileAlt className="text-5xl text-gray-200 mb-4 bg-gray-50 p-3 rounded-full" />
                    <h4 className="font-bold text-gray-700 text-lg mb-1">Select an Assignment</h4>
                    <p className="text-sm max-w-sm">Select an assignment from the list to view detailed submissions progress and grade students.</p>
                  </div>
                ) : detailsLoading ? (
                  <div className="bg-white rounded-xl border border-gray-150 shadow-sm p-12 text-center min-h-[50vh] flex justify-center items-center">
                    <div className="h-8 w-8 rounded-full border-2 border-primary-200 border-t-primary-600 animate-spin" />
                  </div>
                ) : assignmentDetails ? (
                  <div className="space-y-6 animate-in fade-in duration-200">
                    {/* Assignment meta */}
                    <div className="bg-white rounded-xl border border-gray-150 shadow-sm p-6 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary-500 to-secondary-500" />
                      <span className="text-3xs font-extrabold uppercase tracking-wider text-primary-600">{assignmentDetails.assignment.subject}</span>
                      <h3 className="text-xl font-bold text-gray-900 mt-1">{assignmentDetails.assignment.title}</h3>
                      <p className="text-xs text-gray-500 mt-2 leading-relaxed whitespace-pre-line bg-gray-50 p-4 rounded-lg border border-gray-100">{assignmentDetails.assignment.description}</p>
                      
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 pt-4 border-t border-gray-100 text-3xs font-bold text-gray-400 uppercase tracking-wider">
                        <span>Due: {new Date(assignmentDetails.assignment.due_date).toLocaleString()}</span>
                        <span>Marks: {assignmentDetails.assignment.total_marks} Points</span>
                      </div>
                    </div>

                    {/* Attached Resources */}
                    {assignmentDetails.resources && assignmentDetails.resources.length > 0 && (
                      <div className="bg-white rounded-xl border border-gray-150 shadow-sm p-6 space-y-3">
                        <h4 className="font-bold text-gray-800 text-sm flex items-center gap-1.5 pb-2 border-b border-gray-100">
                          Attached Reference Materials ({assignmentDetails.resources.length})
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {assignmentDetails.resources.map(file => (
                            <div key={file.resource_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100/50 transition-colors">
                              <div className="flex items-center gap-2.5 min-w-0">
                                {getFileIcon(file.original_name)}
                                <div className="truncate">
                                  <p className="text-xs font-bold text-gray-800 truncate" title={file.original_name}>{file.original_name}</p>
                                  <p className="text-4xs text-gray-400 font-medium">
                                    {formatBytes(file.file_size)} &bull; v{file.version} &bull; Downloads: {file.download_count}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleDownloadResource(assignmentDetails.assignment.id, file.resource_id, file.original_name)}
                                  className="p-1.5 hover:bg-white text-primary-600 rounded border border-gray-200 shadow-3xs transition-colors"
                                  title="Download"
                                >
                                  <FaDownload size={11} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteExistingResource(file.resource_id)}
                                  className="p-1.5 hover:bg-red-50 text-red-500 rounded border border-red-100 shadow-3xs transition-colors"
                                  title="Delete"
                                >
                                  <FaTrashAlt size={11} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Submissions List */}
                    <div className="bg-white rounded-xl border border-gray-150 shadow-sm p-4">
                      <h4 className="font-bold text-gray-800 text-sm border-b border-gray-100 pb-2 mb-3">Student Submissions</h4>
                      
                      <div className="divide-y divide-gray-100 max-h-[50vh] overflow-y-auto pr-1">
                        {assignmentDetails.submissions.map(student => {
                          const hasSubmitted = student.submission_id !== null;
                          const isReviewed = student.submission_status === 'reviewed';

                          return (
                            <div key={student.student_id} className="py-3 flex items-center justify-between hover:bg-gray-50/50 px-2 rounded-lg transition-colors gap-4">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-sm text-gray-800">{student.first_name} {student.last_name}</span>
                                  <span className="text-4xs text-gray-400 font-mono">({student.student_code})</span>
                                </div>
                                <div className="flex items-center gap-2 text-3xs text-gray-500 mt-0.5">
                                  <span>{student.department || 'No Dept'}</span>
                                  {hasSubmitted && (
                                    <>
                                      <span>&bull;</span>
                                      <span>Submitted: {new Date(student.submitted_at!).toLocaleDateString()}</span>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                {isReviewed ? (
                                  <div className="text-right">
                                    <span className="text-3xs font-extrabold uppercase bg-success-50 text-success-700 px-2 py-0.5 rounded border border-success-100">
                                      {student.marks} / {assignmentDetails.assignment.total_marks}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenGrading(student)}
                                      className="block text-4xs font-bold text-primary-600 hover:text-primary-700 mt-1 hover:underline text-right w-full"
                                    >
                                      Re-grade
                                    </button>
                                  </div>
                                ) : hasSubmitted ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-3xs font-extrabold uppercase bg-warning-50 text-warning-700 px-2 py-0.5 rounded border border-warning-100">
                                      Needs Grade
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenGrading(student)}
                                      className="btn btn-primary px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5"
                                    >
                                      <FaGraduationCap size={12} />
                                      Grade
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-3xs font-extrabold uppercase bg-gray-50 text-gray-400 px-2 py-0.5 rounded border border-gray-100">
                                    Not Submitted
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'prediction' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-150 p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <FaGraduationCap className="text-primary-500" />
                Student Marks Prediction System
              </h2>
              <p className="text-gray-500 text-xs mt-0.5">
                Predict final exam performance based on attendance, study habits, mock tests, and real-time database indicators of assignments and attendance history.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Inputs Form */}
              <div className="lg:col-span-5 space-y-6">
                <div className="bg-white rounded-xl border border-gray-150 p-6 shadow-sm space-y-4">
                  <h3 className="font-bold text-gray-800 text-sm border-b border-gray-100 pb-2 flex items-center gap-2">
                    <FaFileAlt className="text-primary-500 text-xs" />
                    Academic & Behavioral Inputs
                  </h3>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Select Student</label>
                    <select
                      value={selectedStudentPredictId || ''}
                      onChange={(e) => handleSelectStudentForPrediction(e.target.value ? parseInt(e.target.value, 10) : null)}
                      className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-primary-500 focus:outline-none bg-white text-gray-800 font-medium"
                    >
                      <option value="">-- Choose a Student --</option>
                      {teamMembers.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.first_name} {m.last_name} ({m.student_id})
                        </option>
                      ))}
                    </select>
                  </div>

                  {predictLoading ? (
                    <div className="py-12 flex justify-center">
                      <div className="h-6 w-6 rounded-full border-2 border-primary-200 border-t-primary-600 animate-spin" />
                    </div>
                  ) : selectedStudentPredictId ? (
                    <form onSubmit={handleGeneratePrediction} className="space-y-4 pt-2">
                      <div>
                        <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                          <span>Attendance Rate (%)</span>
                          <span className="text-primary-600 font-bold bg-primary-50 px-2 py-0.5 rounded border border-primary-100">{predAttendanceRate}%</span>
                        </div>
                        <span className="text-[10px] text-gray-400">Pre-populated from class check-in records.</span>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                          <span>Assignment Completion Rate (%)</span>
                          <span className="text-primary-600 font-bold bg-primary-50 px-2 py-0.5 rounded border border-primary-100">{predCompRate}%</span>
                        </div>
                        <span className="text-[10px] text-gray-400">Pre-populated from student submission records.</span>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                          <span>Internal Assessment Marks (out of 20)</span>
                          <span className="text-primary-600 font-bold bg-primary-50 px-2 py-0.5 rounded border border-primary-100">{predInternalMarks} / 20</span>
                        </div>
                        <span className="text-[10px] text-gray-400">Pre-populated from reviewed assignment averages.</span>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                          <span>Previous Semester Marks (%)</span>
                          <span className="text-primary-600 font-bold">{predPrevMarks}%</span>
                        </div>
                        <input
                          type="number"
                          required
                          min="0"
                          max="100"
                          value={predPrevMarks}
                          onChange={(e) => setPredPrevMarks(Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                          className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-800"
                          placeholder="e.g. 75"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                          <span>Study Hours per Day</span>
                          <span className="text-primary-600 font-bold bg-primary-50 px-2 py-0.5 rounded border border-primary-100">{predStudyHours} hrs</span>
                        </div>
                        <span className="text-[10px] text-gray-400">Pre-populated from study habits questionnaire metrics.</span>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                          <span>Mock Test Marks (%)</span>
                          <span className="text-primary-600 font-bold bg-primary-50 px-2 py-0.5 rounded border border-primary-100">{predMockMarks}%</span>
                        </div>
                        <span className="text-[10px] text-gray-400">Pre-populated from mock examination records.</span>
                      </div>

                      <button
                        type="submit"
                        disabled={predictSaving}
                        className="w-full mt-4 btn btn-primary py-2.5 text-xs font-semibold flex items-center justify-center gap-2 rounded-lg"
                      >
                        {predictSaving ? (
                          <>
                            <div className="h-3 w-3 rounded-full border border-white border-t-transparent animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <FaGraduationCap size={14} />
                            Run Prediction Model
                          </>
                        )}
                      </button>
                    </form>
                  ) : (
                    <div className="text-center py-10 text-gray-400">
                      Select a student to initialize values from database.
                    </div>
                  )}
                </div>
              </div>

              {/* Results Dashboard */}
              <div className="lg:col-span-7 space-y-6">
                {predictionResult ? (
                  <div className="space-y-6">
                    {/* Top Score Summary */}
                    <div className="bg-white rounded-xl border border-gray-150 p-6 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary-500 to-secondary-500" />
                      <h3 className="font-bold text-gray-800 text-sm border-b border-gray-100 pb-3 mb-4">
                        Predicted Performance Metrics
                      </h3>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        {/* Score and Grade */}
                        <div className="p-4 bg-gray-50/60 rounded-xl border border-gray-100 flex flex-col justify-center items-center text-center">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Predicted Marks</span>
                          <div className="text-4xl font-extrabold text-primary-650 my-1">{predictionResult.predictedMarks}%</div>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold border ${
                            predictionResult.grade === 'A+' || predictionResult.grade === 'A' 
                              ? 'bg-success-50 text-success-700 border-success-100'
                              : predictionResult.grade === 'B' || predictionResult.grade === 'C'
                              ? 'bg-primary-50 text-primary-700 border-primary-150'
                              : 'bg-danger-50 text-danger-700 border-danger-100'
                          }`}>
                            Grade {predictionResult.grade}
                          </span>
                        </div>

                        {/* Risk and Pass Probability */}
                        <div className="p-4 bg-gray-50/60 rounded-xl border border-gray-100 space-y-3">
                          <div>
                            <div className="flex justify-between text-2xs font-bold text-gray-550 mb-1">
                              <span>Pass Probability:</span>
                              <span className="text-gray-800">{predictionResult.passProbability}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full transition-all duration-500 ${
                                  predictionResult.passProbability >= 75 ? 'bg-success-500' : predictionResult.passProbability >= 50 ? 'bg-warning-500' : 'bg-danger-500'
                                }`}
                                style={{ width: `${predictionResult.passProbability}%` }}
                              />
                            </div>
                          </div>

                          <div className="flex justify-between items-center text-2xs font-bold text-gray-550">
                            <span>Risk Level:</span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-3xs font-extrabold uppercase ${
                              predictionResult.riskLevel === 'Very Low' || predictionResult.riskLevel === 'Low'
                                ? 'bg-success-50 text-success-700 border border-success-100'
                                : predictionResult.riskLevel === 'Medium'
                                ? 'bg-warning-50 text-warning-700 border border-warning-100'
                                : 'bg-danger-50 text-danger-700 border-danger-100'
                            }`}>
                              {predictionResult.riskLevel}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Improvement Suggestions */}
                    <div className="bg-white rounded-xl border border-gray-150 p-6 shadow-sm">
                      <h3 className="font-bold text-gray-800 text-sm border-b border-gray-100 pb-3 mb-3">
                        Personalized Improvement Suggestions
                      </h3>
                      <ul className="space-y-2">
                        {predictionResult.suggestions.map((suggestion: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-2.5 text-xs text-gray-650 leading-relaxed">
                            <span className="h-5 w-5 flex-shrink-0 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-2xs">
                              {idx + 1}
                            </span>
                            <p className="mt-0.5">{suggestion}</p>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Progression Chart */}
                    {predictionHistory.length > 0 && (
                      <div className="bg-white rounded-xl border border-gray-150 p-6 shadow-sm">
                        <h3 className="font-bold text-gray-800 text-sm border-b border-gray-100 pb-3 mb-4">
                          Prediction Progression Trend
                        </h3>
                        <div className="h-60">
                          <ResponsiveContainer width="100%" height="100%">
                            <Recharts.LineChart
                              data={predictionHistory.map((item, idx) => ({
                                index: `Run ${idx + 1}`,
                                Marks: parseFloat(item.predicted_marks),
                                PassProb: parseFloat(item.pass_probability),
                                Date: new Date(item.created_at).toLocaleDateString()
                              }))}
                              margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              <XAxis dataKey="index" />
                              <YAxis domain={[0, 100]} />
                              <Tooltip />
                              <Legend />
                              <Recharts.Line type="monotone" dataKey="Marks" stroke="#3b82f6" strokeWidth={2.5} activeDot={{ r: 8 }} name="Predicted Marks %" />
                              <Recharts.Line type="monotone" dataKey="PassProb" stroke="#10b981" strokeWidth={2} name="Pass Prob %" />
                            </Recharts.LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-150 shadow-sm p-12 text-center text-gray-400 min-h-[50vh] flex flex-col justify-center items-center">
                    <FaGraduationCap className="text-5xl text-gray-200 mb-4 bg-gray-50 p-3 rounded-full" />
                    <h3 className="font-bold text-gray-700 text-lg mb-1">Awaiting Prediction</h3>
                    <p className="text-sm max-w-sm">Select a student and adjust parameters on the left, then run the model to generate the performance analytics.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'mock-exam' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-gray-150 shadow-sm flex-wrap gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <FaGraduationCap className="text-primary-500" />
                  Mock Examinations Manager
                </h2>
                <p className="text-gray-500 text-xs mt-0.5">Create practice MCQ exams and track student response analytics.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMockSubject('');
                  setMockTitle('');
                  setMockDescription('');
                  setMockTotalMarks('50');
                  setMockPassingMarks('20');
                  setMockDuration('30');
                  setMockNegativeMarking(false);
                  setMockDueDate('');
                  setMockQuestions([{ questionText: '', optionA: '', optionB: '', optionC: '', optionD: '', correctOption: 'A', questionMarks: 2, imageUrl: null }]);
                  setShowCreateMockModal(true);
                }}
                className="btn btn-primary px-4 py-2.5 text-xs font-semibold flex items-center gap-2 rounded-lg"
              >
                <FaPlus className="text-3xs" />
                New Mock Test
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Left Side: Mock Exams list */}
              <div className="lg:col-span-4 bg-white rounded-xl border border-gray-150 p-4 shadow-sm space-y-4">
                <h3 className="font-bold text-gray-800 text-sm border-b border-gray-100 pb-2 flex items-center gap-2">
                  <FaBookOpen className="text-primary-500 text-xs" />
                  Mock Tests List
                </h3>

                {mockExamsLoading ? (
                  <div className="py-12 flex justify-center">
                    <div className="h-6 w-6 rounded-full border-2 border-primary-200 border-t-primary-600 animate-spin" />
                  </div>
                ) : mockExams.length === 0 ? (
                  <div className="text-center py-10 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    <FaGraduationCap className="mx-auto text-2xl mb-2 text-gray-300" />
                    <p className="text-sm font-medium">No mock tests found</p>
                    <p className="text-xs mt-1">Click "New Mock Test" to get started.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                    {mockExams.map(item => {
                      const isSelected = item.id === selectedMockId;
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleSelectMockExam(item.id)}
                          className={`p-4 rounded-lg border transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                            isSelected
                              ? 'bg-primary-50 border-primary-300 text-primary-950 shadow-sm'
                              : 'bg-white border-gray-100 hover:bg-gray-50/50'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-3xs font-extrabold uppercase bg-primary-100/50 text-primary-700 px-2 py-0.5 rounded">
                              {item.subject}
                            </span>
                            <span className="text-4xs font-bold text-gray-450 uppercase">
                              {item.duration_minutes} Mins
                            </span>
                          </div>

                          <h4 className="font-bold text-sm text-gray-800 line-clamp-1 mb-1">{item.title}</h4>
                          <p className="text-3xs text-gray-500 line-clamp-2 mb-3 leading-relaxed">{item.description || 'Practice MCQ Exam.'}</p>

                          <div className="flex items-center justify-between text-4xs text-gray-400 font-medium border-t border-gray-100/50 pt-2">
                            <span>Submissions: {item.attempt_count}</span>
                            <span>Total Marks: {item.total_marks}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right Side: Mock Exam Details & Analytics */}
              <div className="lg:col-span-8">
                {!selectedMockId ? (
                  <div className="bg-white rounded-xl border border-gray-150 shadow-sm p-12 text-center text-gray-400 min-h-[50vh] flex flex-col justify-center items-center">
                    <FaGraduationCap className="text-5xl text-gray-200 mb-4 bg-gray-50 p-3 rounded-full" />
                    <h4 className="font-bold text-gray-700 text-lg mb-1">Select a Mock Test</h4>
                    <p className="text-sm max-w-sm">Select a mock test from the list to view question keys, student responses, and analytics.</p>
                  </div>
                ) : mockDetailsLoading ? (
                  <div className="bg-white rounded-xl border border-gray-150 shadow-sm p-12 text-center min-h-[50vh] flex justify-center items-center">
                    <div className="h-8 w-8 rounded-full border-2 border-primary-200 border-t-primary-600 animate-spin" />
                  </div>
                ) : mockDetails ? (
                  <div className="space-y-6 animate-in fade-in duration-200">
                    {/* Exam Overview Meta */}
                    <div className="bg-white rounded-xl border border-gray-150 shadow-sm p-6 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary-500 to-secondary-500" />
                      <div className="flex justify-between items-start gap-4 flex-wrap">
                        <div className="flex-1">
                          <span className="text-3xs font-extrabold uppercase tracking-wider text-primary-600">
                            {mockDetails.exam.subject}
                          </span>
                          <h3 className="text-xl font-bold text-gray-900 mt-1">{mockDetails.exam.title}</h3>
                          <p className="text-xs text-gray-500 mt-2 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100">
                            {mockDetails.exam.description || 'No description provided.'}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100 text-center">
                        <div className="p-2 bg-gray-50/50 rounded-lg border border-gray-100">
                          <p className="text-4xs font-bold uppercase text-gray-400">Total Marks</p>
                          <p className="text-sm font-bold text-gray-700">{mockDetails.exam.total_marks}</p>
                        </div>
                        <div className="p-2 bg-gray-50/50 rounded-lg border border-gray-100">
                          <p className="text-4xs font-bold uppercase text-gray-400">Passing Marks</p>
                          <p className="text-sm font-bold text-gray-700">{mockDetails.exam.passing_marks}</p>
                        </div>
                        <div className="p-2 bg-gray-50/50 rounded-lg border border-gray-100">
                          <p className="text-4xs font-bold uppercase text-gray-400">Duration</p>
                          <p className="text-sm font-bold text-gray-700">{mockDetails.exam.duration_minutes} Mins</p>
                        </div>
                        <div className="p-2 bg-gray-50/50 rounded-lg border border-gray-100">
                          <p className="text-4xs font-bold uppercase text-gray-400">Negative Marking</p>
                          <p className={`text-sm font-bold ${mockDetails.exam.negative_marking ? 'text-danger-600' : 'text-success-600'}`}>
                            {mockDetails.exam.negative_marking ? 'Yes (-0.25)' : 'No'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Analytics Summary */}
                    {mockResults && mockResults.attempts && mockResults.attempts.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <div className="bg-white rounded-xl border border-gray-150 p-4 shadow-sm text-center">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Average Score</p>
                          <p className="text-2xl font-black text-primary-650 mt-1">
                            {(mockResults.attempts.reduce((acc: number, c: any) => acc + parseFloat(c.score), 0) / mockResults.attempts.length).toFixed(1)} / {mockDetails.exam.total_marks}
                          </p>
                          <span className="text-[10px] text-gray-400">({(mockResults.attempts.reduce((acc: number, c: any) => acc + parseFloat(c.percentage), 0) / mockResults.attempts.length).toFixed(1)}% Avg)</span>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-150 p-4 shadow-sm text-center">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Highest Score</p>
                          <p className="text-2xl font-black text-success-600 mt-1">
                            {(mockResults.attempts.reduce((max: number, c: any) => parseFloat(c.score) > max ? parseFloat(c.score) : max, 0)).toFixed(1)} / {mockDetails.exam.total_marks}
                          </p>
                          <span className="text-[10px] text-gray-400">({(mockResults.attempts.reduce((max: number, c: any) => parseFloat(c.percentage) > max ? parseFloat(c.percentage) : max, 0)).toFixed(1)}% Max)</span>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-150 p-4 shadow-sm text-center">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pass Rate</p>
                          <p className="text-2xl font-black text-blue-650 mt-1">
                            {Math.round((mockResults.attempts.filter((c: any) => c.status === 'PASS').length / mockResults.attempts.length) * 100)}%
                          </p>
                          <span className="text-[10px] text-gray-400">({mockResults.attempts.filter((c: any) => c.status === 'PASS').length} Passed)</span>
                        </div>
                      </div>
                    )}

                    {/* Student Submissions List */}
                    <div className="bg-white rounded-xl border border-gray-150 shadow-sm p-6">
                      <h4 className="font-bold text-gray-800 text-sm border-b border-gray-100 pb-2 mb-4">
                        Student Attempt Records ({mockResults?.attempts?.length || 0})
                      </h4>

                      {!mockResults || !mockResults.attempts || mockResults.attempts.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                          <p className="text-sm font-medium">No student attempts recorded yet</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-150">
                            <thead className="bg-gray-50">
                              <tr>
                                <th scope="col" className="px-4 py-2 text-left text-3xs font-bold text-gray-400 uppercase tracking-wider">Student</th>
                                <th scope="col" className="px-4 py-2 text-center text-3xs font-bold text-gray-400 uppercase tracking-wider">Score</th>
                                <th scope="col" className="px-4 py-2 text-center text-3xs font-bold text-gray-400 uppercase tracking-wider">Grade</th>
                                <th scope="col" className="px-4 py-2 text-center text-3xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                                <th scope="col" className="px-4 py-2 text-center text-3xs font-bold text-gray-400 uppercase tracking-wider">Submitted</th>
                                <th scope="col" className="px-4 py-2 text-right text-3xs font-bold text-gray-400 uppercase tracking-wider">Action</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                              {mockResults.attempts.map((attempt: any) => (
                                <tr key={attempt.id} className="hover:bg-gray-50/50">
                                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-900">
                                    <div className="font-bold">{attempt.first_name} {attempt.last_name}</div>
                                    <div className="text-[10px] text-gray-400">{attempt.student_code}</div>
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-center text-xs font-semibold text-gray-800">
                                    {parseFloat(attempt.score).toFixed(1)} / {mockDetails.exam.total_marks} ({parseFloat(attempt.percentage).toFixed(0)}%)
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-center text-xs font-bold text-gray-700">
                                    {attempt.grade}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-center text-xs">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-3xs font-extrabold uppercase ${
                                      attempt.status === 'PASS'
                                        ? 'bg-success-50 text-success-700 border border-success-100'
                                        : 'bg-danger-50 text-danger-700 border-danger-100'
                                    }`}>
                                      {attempt.status}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-center text-xs text-gray-500">
                                    {new Date(attempt.submitted_at).toLocaleDateString()}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-right text-xs">
                                    <button
                                      type="button"
                                      onClick={() => handleLoadStudentAttemptReview(attempt.student_id)}
                                      className="text-primary-600 hover:text-primary-800 font-bold focus:outline-none"
                                    >
                                      Review
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Question-Wise Performance Stats */}
                    {mockResults && mockResults.questionPerformance && mockResults.questionPerformance.length > 0 && (
                      <div className="bg-white rounded-xl border border-gray-150 shadow-sm p-6">
                        <h4 className="font-bold text-gray-800 text-sm border-b border-gray-100 pb-2 mb-4">
                          Question-Wise Performance Breakdown
                        </h4>
                        <div className="space-y-4">
                          {mockResults.questionPerformance.map((q: any, idx: number) => {
                            const successRate = q.total_responses > 0
                              ? Math.round((q.correct_responses / q.total_responses) * 100)
                              : 0;
                            return (
                              <div key={q.question_id} className="space-y-1.5 p-3 bg-gray-50 rounded-lg border border-gray-100">
                                <div className="flex justify-between items-start gap-4 text-xs font-semibold text-gray-800">
                                  <span>Q{idx + 1}: {q.question_text}</span>
                                  <span className={successRate >= 70 ? 'text-success-600' : successRate >= 40 ? 'text-warning-600' : 'text-danger-600'}>
                                    {successRate}% Correct
                                  </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-1.5">
                                  <div
                                    className={`h-1.5 rounded-full transition-all duration-300 ${
                                      successRate >= 70 ? 'bg-success-500' : successRate >= 40 ? 'bg-warning-500' : 'bg-danger-500'
                                    }`}
                                    style={{ width: `${successRate}%` }}
                                  />
                                </div>
                                <div className="text-[10px] text-gray-400">
                                  {q.correct_responses} of {q.total_responses} students answered correctly
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Past Mock Examinations Section */}
            {mockExams.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-150 shadow-sm p-6">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                  <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs">&#128203;</span>
                    Past Mock Examinations
                  </h3>
                  <span className="text-3xs text-gray-400 font-semibold uppercase">All Exams You Created</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="px-4 py-2.5 text-left text-3xs font-extrabold uppercase text-gray-400">Subject</th>
                        <th className="px-4 py-2.5 text-left text-3xs font-extrabold uppercase text-gray-400">Title</th>
                        <th className="px-4 py-2.5 text-center text-3xs font-extrabold uppercase text-gray-400">Total Marks</th>
                        <th className="px-4 py-2.5 text-center text-3xs font-extrabold uppercase text-gray-400">Duration</th>
                        <th className="px-4 py-2.5 text-center text-3xs font-extrabold uppercase text-gray-400">Attempts</th>
                        <th className="px-4 py-2.5 text-center text-3xs font-extrabold uppercase text-gray-400">Avg Score</th>
                        <th className="px-4 py-2.5 text-center text-3xs font-extrabold uppercase text-gray-400">Due Date</th>
                        <th className="px-4 py-2.5 text-center text-3xs font-extrabold uppercase text-gray-400">Status</th>
                        <th className="px-4 py-2.5 text-right text-3xs font-extrabold uppercase text-gray-400">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {mockExams.map(item => {
                        const isPast = item.due_date && new Date(item.due_date) < new Date();
                        const isSelected = item.id === selectedMockId;
                        return (
                          <tr key={item.id} className={`hover:bg-gray-50/50 transition-colors ${isSelected ? 'bg-primary-50/40' : ''}`}>
                            <td className="px-4 py-3">
                              <span className="inline-block bg-primary-50 text-primary-700 text-3xs font-extrabold uppercase px-2 py-0.5 rounded">
                                {item.subject}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-semibold text-gray-800 max-w-[200px] truncate">{item.title}</td>
                            <td className="px-4 py-3 text-center font-bold text-gray-700">{item.total_marks}</td>
                            <td className="px-4 py-3 text-center text-gray-500">{item.duration_minutes} min</td>
                            <td className="px-4 py-3 text-center">
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 font-bold text-gray-700 text-3xs">
                                {item.attempt_count || 0}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center font-semibold">
                              {item.average_score != null
                                ? <span className="text-primary-700">{parseFloat(item.average_score).toFixed(1)}</span>
                                : <span className="text-gray-300">—</span>
                              }
                            </td>
                            <td className="px-4 py-3 text-center text-gray-450">
                              {item.due_date ? new Date(item.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isPast ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-3xs font-extrabold uppercase bg-gray-100 text-gray-500 border border-gray-200">
                                  ✓ Closed
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-3xs font-extrabold uppercase bg-success-50 text-success-700 border border-success-100 animate-pulse">
                                  ● Live
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleSelectMockExam(item.id)}
                                className="text-primary-600 hover:text-primary-800 font-bold text-2xs focus:outline-none whitespace-nowrap"
                              >
                                View Results →
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Team Members Details Modal */}
      {showTeamModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl relative max-h-[80vh] flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center pb-4 border-b border-gray-200">
              <h3 className="text-2xl font-bold text-gray-800">
                Assigned Team Members ({teamMembers.length})
              </h3>
              <button
                onClick={() => setShowTeamModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl font-semibold focus:outline-none"
              >
                &times;
              </button>
            </div>
            
            <div className="overflow-y-auto my-4 flex-1">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Student ID
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Department
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Position
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Hire Date
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {teamMembers.map((member) => (
                    <tr key={member.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {member.student_id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {member.first_name} {member.last_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {member.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {member.department}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {member.position}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(member.hire_date).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowTeamModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Present Today Details Modal */}
      {showPresentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-white rounded-2xl max-w-5xl w-full p-6 shadow-2xl relative max-h-[80vh] flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center pb-4 border-b border-gray-200">
              <h3 className="text-2xl font-bold text-gray-800">
                Students Present Today ({presentTodayRecords.length})
              </h3>
              <button
                onClick={() => setShowPresentModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl font-semibold focus:outline-none"
              >
                &times;
              </button>
            </div>
            
            <div className="overflow-y-auto my-4 flex-1">
              {presentTodayRecords.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No students are currently present.</p>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Student ID
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Department
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Position
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Check-In Time
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Geo-Fence Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {presentTodayRecords.map((attendance) => {
                      const member = teamMembers.find(m => m.student_id === attendance.student?.student_id);
                      return (
                        <tr key={attendance.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {attendance.student?.student_id}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {attendance.student?.first_name} {attendance.student?.last_name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {member?.email || '—'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {attendance.student?.department || '—'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {member?.position || '—'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(attendance.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {attendance.geo_fence_status ? (
                              <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                                Within Fence
                              </span>
                            ) : (
                              <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">
                                Outside Fence
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowPresentModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Leave Details Modal */}
      {showPendingLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-white rounded-2xl max-w-5xl w-full p-6 shadow-2xl relative max-h-[80vh] flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center pb-4 border-b border-gray-200">
              <h3 className="text-2xl font-bold text-gray-800">
                Pending Leave Requests ({leaveRequests.length})
              </h3>
              <button
                onClick={() => setShowPendingLeaveModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl font-semibold focus:outline-none"
              >
                &times;
              </button>
            </div>
            
            <div className="overflow-y-auto my-4 flex-1">
              {leaveRequests.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No pending leave requests.</p>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Student ID
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Dates
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Days
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Reason
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Attachment
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Submitted On
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {leaveRequests.map((request) => (
                      <tr key={request.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {request.student?.student_id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {request.student?.first_name} {request.student?.last_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 uppercase">
                          {request.leave_type}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(request.start_date).toLocaleDateString()} to {new Date(request.end_date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {request.total_days} {request.total_days === 1 ? 'day' : 'days'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                          {request.reason}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {request.attachment_data ? (
                            <button
                              onClick={() => setPreviewAttachment({ data: request.attachment_data!, name: request.attachment_name || 'attachment' })}
                              className="text-blue-600 hover:text-blue-800 font-semibold"
                            >
                              View
                            </button>
                          ) : (
                            'None'
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(request.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowPendingLeaveModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attachment Preview Modal */}
      {previewAttachment && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl relative max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center pb-4 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-800 truncate">
                Attachment: {previewAttachment.name}
              </h3>
              <button
                onClick={() => setPreviewAttachment(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl font-semibold focus:outline-none"
              >
                &times;
              </button>
            </div>
            
            <div className="flex-1 overflow-auto my-4 flex items-center justify-center bg-gray-50 rounded-lg p-2 min-h-[50vh]">
              {previewAttachment.data.startsWith('data:application/pdf') || previewAttachment.name.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={previewAttachment.data}
                  className="w-full h-[65vh] border-0 rounded-lg"
                  title="PDF Document Viewer"
                />
              ) : (
                <img
                  src={previewAttachment.data}
                  alt="Attachment Preview"
                  className="max-w-full max-h-[65vh] object-contain rounded-lg shadow"
                />
              )}
            </div>
            
            <div className="flex justify-end pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setPreviewAttachment(null)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Assignment Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center pb-4 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-800">
                {editingAssignment ? 'Edit Assignment' : 'Create New Assignment'}
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl font-semibold focus:outline-none"
              >
                &times;
              </button>
            </div>
            
            <form onSubmit={handleCreateOrUpdateAssignment} className="overflow-y-auto my-4 flex-1 space-y-4 pr-1 animate-in fade-in duration-200">
              <div>
                <label className="form-label text-xs">Assignment Title</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="input text-xs"
                  placeholder="e.g. Database Normalization Assignment"
                />
              </div>

              <div>
                <label className="form-label text-xs">Subject / Course Name</label>
                <input
                  type="text"
                  required
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  className="input text-xs"
                  placeholder="e.g. Database Management Systems"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label text-xs">Due Date & Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="form-label text-xs">Total Marks</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formTotalMarks}
                    onChange={(e) => setFormTotalMarks(e.target.value)}
                    className="input text-xs"
                    placeholder="e.g. 20"
                  />
                </div>
              </div>

              <div>
                <label className="form-label text-xs">Description / Requirements</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 p-3 text-xs focus:ring-1 focus:ring-primary-500 focus:outline-none"
                  rows={4}
                  placeholder="Describe the tasks, requirements, ERD details, normalization, etc..."
                />
              </div>

              <div>
                <label className="form-label text-xs">Instructions (Optional)</label>
                <textarea
                  value={formInstructions}
                  onChange={(e) => setFormInstructions(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 p-3 text-xs focus:ring-1 focus:ring-primary-500 focus:outline-none"
                  rows={3}
                  placeholder="e.g. 1. Normalise to 3NF. 2. Prepare relational schema. 3. Upload PDF."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label text-xs">Allowed File Types</label>
                  <input
                    type="text"
                    value={formAllowedFileTypes}
                    onChange={(e) => setFormAllowedFileTypes(e.target.value)}
                    className="input text-xs"
                    placeholder="pdf,doc,docx,jpg,zip"
                  />
                </div>
                <div>
                  <label className="form-label text-xs">Max File Size (MB)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formMaxFileSize}
                    onChange={(e) => setFormMaxFileSize(e.target.value)}
                    className="input text-xs"
                  />
                </div>
              </div>

              {/* Reference Resources Upload Section */}
              <div className="space-y-2 border-t border-gray-100 pt-3">
                <label className="form-label text-xs font-bold text-gray-700">Course Materials / Reference Files</label>
                
                {/* Drag and Drop Zone */}
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                    isDragActive ? 'border-primary-500 bg-primary-50/30' : 'border-gray-300 hover:border-primary-400'
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <FaCloudUploadAlt className="mx-auto text-2xl text-gray-400 mb-1" />
                  <p className="text-2xs text-gray-500 font-medium">
                    Drag and drop reference files here, or <span className="text-primary-600 underline">browse</span>
                  </p>
                  <p className="text-3xs text-gray-400 mt-0.5">
                    Supports PDF, Word, Excel, Powerpoint, ZIP, images, MP4, MP3 up to {formMaxFileSize}MB
                  </p>
                </div>

                {/* Simulated/Actual Upload Progress Bar */}
                {uploadProgress !== null && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-3xs text-gray-500 font-medium">
                      <span>Uploading files...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1">
                      <div className="bg-primary-600 h-1 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  </div>
                )}

                {/* Combined list of files */}
                {((existingResources && existingResources.length > 0) || selectedResources.length > 0) && (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    <p className="text-3xs font-bold text-gray-400 uppercase tracking-wider">Attached files:</p>
                    
                    {/* Existing resource files */}
                    {existingResources.map(file => (
                      <div key={file.resource_id} className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-150 text-xs">
                        <div className="flex items-center gap-2 truncate">
                          {getFileIcon(file.original_name)}
                          <span className="text-2xs text-gray-700 font-medium truncate" title={file.original_name}>{file.original_name}</span>
                          <span className="text-4xs text-gray-400">({formatBytes(file.file_size)} &bull; v{file.version})</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteExistingResource(file.resource_id)}
                          className="p-1 hover:bg-red-50 text-red-500 rounded transition-colors"
                          title="Delete File"
                        >
                          <FaTrashAlt size={10} />
                        </button>
                      </div>
                    ))}

                    {/* Newly selected files pending upload */}
                    {selectedResources.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-primary-50/20 rounded border border-primary-100 text-xs">
                        <div className="flex items-center gap-2 truncate">
                          {getFileIcon(file.name)}
                          <span className="text-2xs text-primary-900 font-medium truncate" title={file.name}>{file.name}</span>
                          <span className="text-4xs text-primary-500">({formatBytes(file.size)} &bull; pending)</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSelectedResource(idx)}
                          className="p-1 hover:bg-gray-100 text-gray-500 rounded transition-colors"
                          title="Remove File"
                        >
                          <FaTrashAlt size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-4 border-t border-gray-250 gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                >
                  {formSaving ? 'Saving...' : 'Save Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Grading / Feedback Modal */}
      {showGradingModal && gradingSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center pb-4 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-bold text-gray-800">
                  Grade Submission
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">Student: {gradingSubmission.first_name} {gradingSubmission.last_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowGradingModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl font-semibold focus:outline-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleGradeSubmission} className="overflow-y-auto my-4 flex-1 space-y-4 pr-1 animate-in fade-in duration-200">
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 text-xs text-gray-600 space-y-2">
                <p><span className="font-semibold">Submitted comments:</span> {gradingSubmission.comments || 'No comments'}</p>
                
                {gradingSubmission.files.length > 0 && (
                  <div>
                    <span className="font-semibold block mb-1.5">Submitted files ({gradingSubmission.files.length}):</span>
                    <div className="space-y-1">
                      {gradingSubmission.files.map(file => (
                        <div key={file.id} className="flex items-center justify-between p-2 bg-white rounded border border-gray-150">
                          <div className="flex items-center gap-2 truncate">
                            {getFileIcon(file.file_name)}
                            <span className="text-2xs text-gray-800 font-medium truncate" title={file.file_name}>{file.file_name}</span>
                            <span className="text-4xs text-gray-400">({formatBytes(file.file_size)})</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDownloadFile(file.id, file.file_name)}
                            className="p-1 hover:bg-gray-100 text-primary-600 rounded transition-colors focus:outline-none"
                            title="Download File"
                          >
                            <FaDownload size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="form-label text-xs">
                  Marks Obtained (out of {assignmentDetails?.assignment.total_marks})
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  max={assignmentDetails?.assignment.total_marks}
                  value={gradingMarks}
                  onChange={(e) => setGradingMarks(e.target.value)}
                  className="input text-xs"
                  placeholder="e.g. 18"
                />
              </div>

              <div>
                <label className="form-label text-xs">Feedback / Comments</label>
                <textarea
                  value={gradingFeedback}
                  onChange={(e) => setGradingFeedback(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 p-3 text-xs focus:ring-1 focus:ring-primary-500 focus:outline-none"
                  rows={4}
                  placeholder="Provide feedback on ERD design, Normalization process, code formatting etc..."
                />
              </div>

              <div className="flex justify-end pt-4 border-t border-gray-250 gap-2">
                <button
                  type="button"
                  onClick={() => setShowGradingModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={gradingSaving}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                >
                  {gradingSaving ? 'Saving...' : 'Submit Grade'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Mock Exam Modal */}
      {showCreateMockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center pb-4 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-800">
                Create New Mock Test
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateMockModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl font-semibold focus:outline-none"
              >
                &times;
              </button>
            </div>
            
            <form onSubmit={handleCreateMockExam} className="overflow-y-auto my-4 flex-1 space-y-4 pr-1 animate-in fade-in duration-200">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-3xs font-extrabold uppercase text-gray-400 mb-1">Subject / Course Name</label>
                  <input
                    type="text"
                    required
                    value={mockSubject}
                    onChange={(e) => setMockSubject(e.target.value)}
                    className="input text-xs"
                    placeholder="e.g. Mathematics"
                  />
                </div>
                <div>
                  <label className="block text-3xs font-extrabold uppercase text-gray-400 mb-1">Mock Test Title</label>
                  <input
                    type="text"
                    required
                    value={mockTitle}
                    onChange={(e) => setMockTitle(e.target.value)}
                    className="input text-xs"
                    placeholder="e.g. Mid-Term Practice"
                  />
                </div>
              </div>

              <div>
                <label className="block text-3xs font-extrabold uppercase text-gray-400 mb-1">Description (Optional)</label>
                <textarea
                  value={mockDescription}
                  onChange={(e) => setMockDescription(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 p-3 text-xs focus:ring-1 focus:ring-primary-500 focus:outline-none"
                  rows={2}
                  placeholder="e.g. Covers Chapters 1 to 5."
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-3xs font-extrabold uppercase text-gray-400 mb-1">Total Marks</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={mockTotalMarks}
                    onChange={(e) => setMockTotalMarks(e.target.value)}
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="block text-3xs font-extrabold uppercase text-gray-400 mb-1">Passing Marks</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={mockPassingMarks}
                    onChange={(e) => setMockPassingMarks(e.target.value)}
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="block text-3xs font-extrabold uppercase text-gray-400 mb-1">Duration (Mins)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={mockDuration}
                    onChange={(e) => setMockDuration(e.target.value)}
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="block text-3xs font-extrabold uppercase text-gray-400 mb-1">Due Date &amp; Time</label>
                  <div className="relative">
                    <input
                      type="datetime-local"
                      required
                      value={mockDueDate}
                      onChange={(e) => setMockDueDate(e.target.value)}
                      min={new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16)}
                      className="input text-xs pr-9 cursor-pointer"
                      style={{ colorScheme: 'light' }}
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-primary-400 text-sm">&#128197;</span>
                  </div>
                  {mockDueDate && (
                    <p className="text-2xs text-primary-600 font-semibold mt-0.5 flex items-center gap-1">
                      <span>&#9201;</span>
                      <span>Closes: {new Date(mockDueDate).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3 flex items-start gap-3">
                <div className="pt-0.5">
                  <input
                    type="checkbox"
                    id="mockNegativeMarking"
                    checked={mockNegativeMarking}
                    onChange={(e) => setMockNegativeMarking(e.target.checked)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-4 w-4 cursor-pointer"
                  />
                </div>
                <div className="flex-1">
                  <label htmlFor="mockNegativeMarking" className="text-xs font-bold text-gray-800 cursor-pointer">
                    Enable Negative Marking
                  </label>
                  <p className="text-2xs text-gray-500 mt-0.5 leading-relaxed">
                    {mockNegativeMarking ? (
                      <span className="text-danger-600 font-semibold">
                        Auto-penalty is active: each wrong answer deducts{' '}
                        <strong>1/4 of that question&apos;s marks</strong>.
                        {mockQuestions.length > 0 && (
                          <span className="block mt-0.5">
                            Current deductions per question:{' '}
                            {[...new Set(mockQuestions.map((q: any) => q.questionMarks))].map((m: any, i: number) => (
                              <span key={i} className="inline-block bg-danger-50 border border-danger-100 px-1 rounded mr-1 font-mono">
                                {m}pts → -{(m / 4).toFixed(2)}
                              </span>
                            ))}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-gray-400">
                        If enabled, wrong answers will automatically deduct <strong>question_marks &divide; 4</strong> per question. Currently <strong>disabled</strong> — no penalty applied.
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Questions Section */}
              <div className="space-y-4 border-t border-gray-100 pt-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-bold text-gray-800">Questions ({mockQuestions.length})</h4>
                  <button
                    type="button"
                    onClick={handleAddMockQuestion}
                    className="btn btn-secondary px-3 py-1.5 text-2xs font-semibold flex items-center gap-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    <FaPlus className="text-4xs" /> Add Question
                  </button>
                </div>

                {mockQuestions.map((q, idx) => (
                  <div key={idx} className="p-4 bg-gray-50 rounded-xl border border-gray-150 relative space-y-3 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => handleRemoveMockQuestion(idx)}
                      className="absolute top-2 right-3 text-gray-400 hover:text-red-500 font-semibold text-lg"
                      title="Remove Question"
                    >
                      &times;
                    </button>

                    <div className="flex gap-2 items-start">
                      <span className="text-xs font-bold text-gray-400 pt-1.5">Q{idx + 1}.</span>
                      <textarea
                        required
                        value={q.questionText}
                        onChange={(e) => handleQuestionChange(idx, 'questionText', e.target.value)}
                        className="w-full rounded-lg border border-gray-200 p-2 text-xs focus:ring-1 focus:ring-primary-500 focus:outline-none"
                        rows={2}
                        placeholder="Enter the question text here..."
                      />
                    </div>

                    {/* Image Option */}
                    <div className="pl-6 space-y-2">
                      <label className="block text-3xs font-extrabold uppercase text-gray-400">Question Image (Optional)</label>
                      <div className="flex items-center gap-4">
                        <input
                          type="file"
                          accept="image/*"
                          id={`question-img-${idx}`}
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleQuestionImageUpload(idx, e.target.files[0]);
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => document.getElementById(`question-img-${idx}`)?.click()}
                          className="px-3 py-1 text-3xs font-bold border border-gray-200 hover:bg-gray-50 rounded-lg flex items-center gap-1.5 transition-colors"
                        >
                          <FaCloudUploadAlt /> Select Image
                        </button>
                        {q.imageUrl && (
                          <div className="flex items-center gap-2">
                            <img
                              src={getImageUrl(q.imageUrl)}
                              alt="preview"
                              className="h-10 w-10 object-cover rounded border border-gray-200"
                            />
                            <button
                              type="button"
                              onClick={() => handleQuestionChange(idx, 'imageUrl', null)}
                              className="text-4xs font-bold text-red-500 hover:underline"
                            >
                              Remove Image
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6">
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 block mb-0.5">Option A</label>
                        <input
                          type="text"
                          required
                          value={q.optionA}
                          onChange={(e) => handleQuestionChange(idx, 'optionA', e.target.value)}
                          className="input text-xs py-1.5"
                          placeholder="Option A"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 block mb-0.5">Option B</label>
                        <input
                          type="text"
                          required
                          value={q.optionB}
                          onChange={(e) => handleQuestionChange(idx, 'optionB', e.target.value)}
                          className="input text-xs py-1.5"
                          placeholder="Option B"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 block mb-0.5">Option C</label>
                        <input
                          type="text"
                          required
                          value={q.optionC}
                          onChange={(e) => handleQuestionChange(idx, 'optionC', e.target.value)}
                          className="input text-xs py-1.5"
                          placeholder="Option C"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 block mb-0.5">Option D</label>
                        <input
                          type="text"
                          required
                          value={q.optionD}
                          onChange={(e) => handleQuestionChange(idx, 'optionD', e.target.value)}
                          className="input text-xs py-1.5"
                          placeholder="Option D"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pl-6">
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 block mb-0.5">Correct Option</label>
                        <select
                          value={q.correctOption}
                          onChange={(e) => handleQuestionChange(idx, 'correctOption', e.target.value)}
                          className="w-full rounded-lg border border-gray-200 p-1.5 text-xs focus:ring-1 focus:ring-primary-500 focus:outline-none"
                        >
                          <option value="A">Option A</option>
                          <option value="B">Option B</option>
                          <option value="C">Option C</option>
                          <option value="D">Option D</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 block mb-0.5">Question Marks</label>
                        <input
                          type="number"
                          required
                          min="1"
                          value={q.questionMarks}
                          onChange={(e) => handleQuestionChange(idx, 'questionMarks', parseInt(e.target.value, 10) || 1)}
                          className="input text-xs py-1.5"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-4 border-t border-gray-200 gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateMockModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={mockSaving}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                >
                  {mockSaving ? 'Creating...' : 'Create Mock Exam'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review Student Attempt Modal */}
      {showReviewModal && studentReviewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl relative max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center pb-4 border-b border-gray-200">
              <div>
                <h3 className="text-xl font-bold text-gray-800">
                  Mock Exam Review
                </h3>
                <p className="text-xs text-gray-500">
                  Student: {studentReviewData.attempt.first_name} {studentReviewData.attempt.last_name} ({studentReviewData.attempt.student_code})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl font-semibold focus:outline-none"
              >
                &times;
              </button>
            </div>
            
            <div className="overflow-y-auto my-4 flex-1 space-y-6 pr-1 animate-in fade-in duration-200">
              {/* Attempt Analytics Summary Card */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-150 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <span className="text-[10px] font-bold uppercase text-gray-400">Score</span>
                  <p className="text-base font-bold text-gray-800">
                    {parseFloat(studentReviewData.attempt.score).toFixed(1)} / {studentReviewData.questions.reduce((sum: number, q: any) => sum + q.question_marks, 0)}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-gray-400">Percentage</span>
                  <p className="text-base font-bold text-gray-800">{parseFloat(studentReviewData.attempt.percentage).toFixed(1)}%</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-gray-400">Grade / Status</span>
                  <p className="text-base font-bold text-gray-800">
                    {studentReviewData.attempt.grade} - 
                    <span className={`ml-1 text-xs font-black ${studentReviewData.attempt.status === 'PASS' ? 'text-success-600' : 'text-danger-600'}`}>
                      {studentReviewData.attempt.status}
                    </span>
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-gray-400">Correct / Wrong</span>
                  <p className="text-base font-bold text-gray-800">
                    <span className="text-success-600 font-bold">{studentReviewData.attempt.correct_answers_count} ✓</span> / <span className="text-danger-600 font-bold">{studentReviewData.attempt.wrong_answers_count} ✗</span>
                  </p>
                </div>
              </div>

              {/* Questions Loop */}
              <div className="space-y-4">
                {studentReviewData.questions.map((q: any, idx: number) => {
                  const isCorrect = q.selected_option === q.correct_option;
                  const isUnanswered = q.selected_option === null;
                  
                  return (
                    <div key={q.question_id} className="p-4 bg-white rounded-xl border border-gray-150 space-y-3 relative shadow-2xs">
                      <div className="absolute top-3 right-4 flex items-center gap-1">
                        {isCorrect ? (
                          <span className="px-2 py-0.5 text-3xs font-extrabold uppercase rounded bg-success-50 text-success-700 border border-success-100 flex items-center gap-1">
                            ✓ Correct (+{q.question_marks} Marks)
                          </span>
                        ) : isUnanswered ? (
                          <span className="px-2 py-0.5 text-3xs font-extrabold uppercase rounded bg-gray-50 text-gray-500 border border-gray-150">
                            Unanswered (0 Marks)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-3xs font-extrabold uppercase rounded bg-danger-50 text-danger-700 border border-danger-100 flex items-center gap-1">
                            ✗ Incorrect {studentReviewData.attempt.negative_marking ? `(-${(0.25 * q.question_marks).toFixed(2)} Marks)` : '(0 Marks)'}
                          </span>
                        )}
                      </div>

                      <div className="pr-24">
                        <span className="text-xs font-black text-gray-400 mr-1.5">Q{idx + 1}.</span>
                        <span className="text-xs font-bold text-gray-850">{q.question_text}</span>
                      </div>

                      {q.image_url && (
                        <div className="pl-6">
                          <img
                            src={getImageUrl(q.image_url)}
                            alt={`question-${idx}`}
                            className="max-h-40 rounded border border-gray-155 object-contain"
                          />
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                        {[
                          { key: 'A', text: q.option_a },
                          { key: 'B', text: q.option_b },
                          { key: 'C', text: q.option_c },
                          { key: 'D', text: q.option_d }
                        ].map(opt => {
                          const isOptCorrect = opt.key === q.correct_option;
                          const isOptSelected = opt.key === q.selected_option;
                          
                          let bgStyle = 'bg-gray-50/50 border-gray-150 text-gray-700';
                          if (isOptCorrect) {
                            bgStyle = 'bg-success-50 border-success-200 text-success-900 font-bold';
                          } else if (isOptSelected && !isCorrect) {
                            bgStyle = 'bg-danger-50 border-danger-200 text-danger-900 font-bold';
                          }

                          return (
                            <div
                              key={opt.key}
                              className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${bgStyle}`}
                            >
                              <span>{opt.key}. {opt.text}</span>
                              <div className="flex items-center gap-1">
                                {isOptCorrect && <span className="text-success-600 font-bold text-2xs uppercase">Correct Key</span>}
                                {isOptSelected && <span className="text-gray-500 font-semibold text-[10px] px-1 bg-white rounded shadow-3xs">Student Selected</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="flex justify-end pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherDashboard;
