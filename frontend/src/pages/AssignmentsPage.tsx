import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FaClipboardList, 
  FaCalendarAlt, 
  FaUser, 
  FaBook, 
  FaCheckCircle, 
  FaInfoCircle, 
  FaCloudUploadAlt, 
  FaFilePdf, 
  FaFileWord, 
  FaFileExcel, 
  FaFilePowerpoint, 
  FaFileArchive, 
  FaFileAlt, 
  FaTrashAlt, 
  FaDownload,
  FaClock,
  FaGraduationCap
} from 'react-icons/fa';
import * as Recharts from 'recharts';
const XAxis = Recharts.XAxis as any;
const YAxis = Recharts.YAxis as any;
const CartesianGrid = Recharts.CartesianGrid as any;
const Tooltip = Recharts.Tooltip as any;
const Legend = Recharts.Legend as any;
const ResponsiveContainer = Recharts.ResponsiveContainer as any;
import { assignmentApi, Assignment, SubmissionFile, StudentSubmission } from '@api/assignmentApi';
import { useNotification } from '@contexts/NotificationContext';
import { useAuth } from '@contexts/AuthContext';

const CountdownTimer: React.FC<{ dueDate: string }> = ({ dueDate }) => {
  const [timeLeft, setTimeLeft] = useState('');
  const [isCritical, setIsCritical] = useState(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = +new Date(dueDate) - +new Date();
      if (difference <= 0) {
        setTimeLeft('Ended');
        setIsCritical(true);
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((difference / 1000 / 60) % 60);
      const seconds = Math.floor((difference / 1000) % 60);

      let timeString = '';
      if (days > 0) {
        timeString += `${days}d ${hours}h ${minutes}m ${seconds}s`;
      } else if (hours > 0) {
        timeString += `${hours}h ${minutes}m ${seconds}s`;
      } else {
        timeString += `${minutes}m ${seconds}s`;
      }

      setTimeLeft(timeString);
      setIsCritical(difference < 24 * 60 * 60 * 1000);
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [dueDate]);

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
      isCritical 
        ? 'bg-red-50 text-red-700 border border-red-200 animate-pulse' 
        : 'bg-primary-50 text-primary-700 border border-primary-150'
    }`}>
      <FaClock size={11} className="flex-shrink-0" />
      <span>{timeLeft === 'Ended' ? 'Ended' : `${timeLeft} left`}</span>
    </span>
  );
};

const AssignmentsPage: React.FC = () => {
  const { showError, showSuccess } = useNotification();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null);
  const [assignmentDetail, setAssignmentDetail] = useState<{
    assignment: Assignment;
    submission: any | null;
    files: SubmissionFile[];
    resources?: any[];
    submissions?: StudentSubmission[];
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [listTab, setListTab] = useState<'active' | 'past'>('active');
  // Page-level tab: students get 'assignments' | 'mock-exam' — teachers stay on 'assignments' only
  const [pageTab, setPageTab] = useState<'assignments' | 'mock-exam'>('assignments');

  // Grading Modal state
  const [showGradingModal, setShowGradingModal] = useState(false);
  const [gradingSubmission, setGradingSubmission] = useState<StudentSubmission | null>(null);
  const [gradingMarks, setGradingMarks] = useState('');
  const [gradingFeedback, setGradingFeedback] = useState('');
  const [gradingSaving, setGradingSaving] = useState(false);
  
  // Submission Form State
  const [comments, setComments] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);

  // Mark Prediction Tab State
  const [rightTab, setRightTab] = useState<'details' | 'prediction' | 'mock-exam'>('details');
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

  // Mock Exam student state
  const [studentMockExams, setStudentMockExams] = useState<any[]>([]);
  const [studentMockExamsLoading, setStudentMockExamsLoading] = useState(false);
  
  // Active test attempting state
  const [activeExam, setActiveExam] = useState<any | null>(null);
  const [activeExamQuestions, setActiveExamQuestions] = useState<any[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string | null>>({});
  const [examTimeLeft, setExamTimeLeft] = useState(0); // in seconds
  const [submittingAttempt, setSubmittingAttempt] = useState(false);
  const [attemptResult, setAttemptResult] = useState<any | null>(null);
  const [reviewExamData, setReviewExamData] = useState<any | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [showReview, setShowReview] = useState(false);

  // Fetch student/teacher assignments
  const fetchAssignments = async () => {
    try {
      setLoading(true);
      let response;
      if (user?.role === 'teacher' || user?.role === 'admin') {
        response = await assignmentApi.getTeacherAssignments();
      } else {
        response = await assignmentApi.getStudentAssignments();
      }
      if (response.data.success) {
        setAssignments(response.data.data);
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to fetch assignments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role) {
      fetchAssignments();
    }
  }, [user?.role]);

  // Fetch specific assignment details
  const fetchAssignmentDetail = async (id: number) => {
    try {
      setDetailLoading(true);
      if (user?.role === 'teacher' || user?.role === 'admin') {
        const response = await assignmentApi.getAssignmentDetails(id);
        if (response.data.success) {
          const detail = response.data.data;
          setAssignmentDetail({
            assignment: detail.assignment,
            submission: null,
            files: [],
            resources: detail.resources,
            submissions: detail.submissions
          });
          setSelectedFiles([]);
        }
      } else {
        const response = await assignmentApi.getStudentAssignmentDetails(id);
        if (response.data.success) {
          const detail = response.data.data;
          setAssignmentDetail({
            assignment: detail.assignment,
            submission: detail.submission,
            files: detail.files,
            resources: detail.resources,
            submissions: []
          });
          // Pre-populate comments if a previous submission exists
          if (detail.submission) {
            setComments(detail.submission.comments || '');
          } else {
            setComments('');
          }
          setSelectedFiles([]);
        }
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to load assignment details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSelectAssignment = (id: number) => {
    setSelectedAssignmentId(id);
    setRightTab('details');
    fetchAssignmentDetail(id);
  };

  const handleLoadStudentPredictionData = async () => {
    if (!user?.id) return;
    try {
      setPredictLoading(true);
      setPredictionResult(null);
      setPredictionHistory([]);
      
      const metricsRes = await assignmentApi.getPredictionMetrics(user.id);
      const historyRes = await assignmentApi.getPredictionHistory(user.id);

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
      showError(err.response?.data?.message || 'Failed to fetch prediction indicators');
    } finally {
      setPredictLoading(false);
    }
  };

  const getImageUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002';
    return `${baseUrl}${url}`;
  };

  const handleLoadStudentMockExams = async () => {
    try {
      setStudentMockExamsLoading(true);
      const res = await assignmentApi.getStudentMockExams();
      if (res.data.success) {
        setStudentMockExams(res.data.data);
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to load mock exams');
    } finally {
      setStudentMockExamsLoading(false);
    }
  };

  const handleStartMockExam = async (examId: number) => {
    try {
      setStudentMockExamsLoading(true);
      setAttemptResult(null);
      setShowReview(false);
      const res = await assignmentApi.getMockExamDetails(examId);
      if (res.data.success) {
        const { exam, questions } = res.data.data;
        setActiveExam(exam);
        setActiveExamQuestions(questions);
        setCurrentQuestionIndex(0);
        
        // Initialize selected answers
        const initialAnswers: Record<number, string | null> = {};
        questions.forEach((q: any) => {
          initialAnswers[q.id] = null;
        });
        setSelectedAnswers(initialAnswers);
        setExamTimeLeft(exam.duration_minutes * 60);
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to start mock exam');
    } finally {
      setStudentMockExamsLoading(false);
    }
  };

  const handleLoadStudentMockReview = async (examId: number) => {
    try {
      setReviewLoading(true);
      const res = await assignmentApi.getMockExamReview(examId);
      if (res.data.success) {
        setReviewExamData(res.data.data);
        setShowReview(true);
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to load exam review');
    } finally {
      setReviewLoading(false);
    }
  };

  const handleAutoSubmitMockExam = async (examId: number, answersMap: Record<number, string | null>) => {
    try {
      showError('Time limit reached! Auto-submitting your answers...');
      const formattedAnswers = Object.entries(answersMap).map(([qId, val]) => ({
        questionId: parseInt(qId, 10),
        selectedOption: val
      }));
      setSubmittingAttempt(true);
      const res = await assignmentApi.submitMockExamAttempt(examId, formattedAnswers);
      if (res.data.success) {
        setAttemptResult(res.data.data);
        setActiveExam(null);
        setActiveExamQuestions([]);
        showSuccess('Exam auto-submitted successfully!');
        handleLoadStudentMockExams();
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to auto-submit mock exam');
    } finally {
      setSubmittingAttempt(false);
    }
  };

  const handleSubmitMockExamManual = async () => {
    if (!activeExam) return;
    
    const unansweredCount = activeExamQuestions.filter(q => !selectedAnswers[q.id]).length;
    const confirmMsg = unansweredCount > 0
      ? `You have ${unansweredCount} unanswered question(s). Are you sure you want to submit?`
      : 'Are you sure you want to submit your mock exam?';
      
    if (!window.confirm(confirmMsg)) {
      return;
    }

    const formattedAnswers = activeExamQuestions.map(q => ({
      questionId: q.id,
      selectedOption: selectedAnswers[q.id] || null
    }));

    try {
      setSubmittingAttempt(true);
      const res = await assignmentApi.submitMockExamAttempt(activeExam.id, formattedAnswers);
      if (res.data.success) {
        setAttemptResult(res.data.data);
        setActiveExam(null);
        setActiveExamQuestions([]);
        showSuccess('Mock exam submitted successfully!');
        handleLoadStudentMockExams();
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to submit mock exam');
    } finally {
      setSubmittingAttempt(false);
    }
  };

  // Ref to always access the latest state in the timer callback
  const examStateRef = useRef({ activeExam, selectedAnswers });
  useEffect(() => {
    examStateRef.current = { activeExam, selectedAnswers };
  }, [activeExam, selectedAnswers]);

  useEffect(() => {
    if (!activeExam) return;
    
    const interval = setInterval(() => {
      setExamTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          // Time's up! Auto-submit
          const currentExam = examStateRef.current.activeExam;
          const currentAnswers = examStateRef.current.selectedAnswers;
          if (currentExam) {
            handleAutoSubmitMockExam(currentExam.id, currentAnswers);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeExam ? activeExam.id : null]);

  const handleGenerateStudentPrediction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    try {
      setPredictSaving(true);
      const response = await assignmentApi.predictMarks({
        attendanceRate: predAttendanceRate,
        previousSemesterMarks: predPrevMarks,
        assignmentCompletionRate: predCompRate,
        internalAssessmentMarks: predInternalMarks,
        studyHours: predStudyHours,
        mockTestMarks: predMockMarks,
        studentId: user.id
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
        
        const historyRes = await assignmentApi.getPredictionHistory(user.id);
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
    if (isNaN(marksNum) || marksNum < 0 || (assignmentDetail && marksNum > assignmentDetail.assignment.total_marks)) {
      showError(`Marks must be between 0 and ${assignmentDetail?.assignment.total_marks}`);
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
          fetchAssignmentDetail(selectedAssignmentId);
        }
        fetchAssignments();
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to grade submission');
    } finally {
      setGradingSaving(false);
    }
  };

  // Drag and drop handlers
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
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
    }
  };

  // Add files with validations
  const addFiles = (files: File[]) => {
    const allowedExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'zip', 'txt'];
    const maxSizeBytes = 25 * 1024 * 1024; // 25 MB

    const validFiles: File[] = [];

    files.forEach(file => {
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      if (!allowedExtensions.includes(extension)) {
        showError(`File type ".${extension}" is not allowed.`);
        return;
      }
      if (file.size > maxSizeBytes) {
        showError(`File "${file.name}" exceeds the 25MB limit.`);
        return;
      }
      validFiles.push(file);
    });

    setSelectedFiles(prev => {
      // Avoid duplicate files based on name and size
      const uniqueNewFiles = validFiles.filter(
        newFile => !prev.some(p => p.name === newFile.name && p.size === newFile.size)
      );
      return [...prev, ...uniqueNewFiles];
    });
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssignmentId) return;

    if (selectedFiles.length === 0 && !comments.trim()) {
      showError('Please add some files or write comments to submit');
      return;
    }

    try {
      setSubmitLoading(true);
      const response = await assignmentApi.submitAssignment(
        selectedAssignmentId,
        comments,
        selectedFiles
      );

      if (response.data.success) {
        showSuccess('Assignment submitted successfully!');
        fetchAssignmentDetail(selectedAssignmentId);
        fetchAssignments(); // Update sidebar list count
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to submit assignment');
    } finally {
      setSubmitLoading(false);
    }
  };

  // Download reference file handler
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
      
      // Refresh detail view to update download count
      fetchAssignmentDetail(assignmentId);
    } catch (err) {
      showError('Failed to download reference file');
    }
  };

  // File Icon Helper
  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    switch (ext) {
      case 'pdf': return <FaFilePdf className="text-red-500 text-lg" />;
      case 'doc':
      case 'docx': return <FaFileWord className="text-blue-500 text-lg" />;
      case 'xls':
      case 'xlsx': return <FaFileExcel className="text-green-500 text-lg" />;
      case 'ppt':
      case 'pptx': return <FaFilePowerpoint className="text-orange-500 text-lg" />;
      case 'zip': return <FaFileArchive className="text-yellow-600 text-lg" />;
      default: return <FaFileAlt className="text-gray-500 text-lg" />;
    }
  };

  // Size formatter helper
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
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

  // Total size calculator
  const totalSelectedSize = selectedFiles.reduce((acc, file) => acc + file.size, 0);

  const filteredAssignments = assignments.filter(item => {
    const isPast = new Date(item.due_date) < new Date();
    return listTab === 'past' ? isPast : !isPast;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
          <span className="p-2 rounded-xl bg-gradient-to-tr from-primary-500 to-secondary-500 text-white shadow-md shadow-primary-500/20">
            <FaClipboardList className="text-2xl" />
          </span>
          {user?.role === 'student' ? (pageTab === 'mock-exam' ? 'Mock Exams Portal' : 'Assignments Portal') : 'Assignments Portal'}
        </h1>
        <p className="text-gray-500 text-sm mt-2">
          {user?.role === 'teacher' || user?.role === 'admin'
            ? 'Track, edit, and evaluate coursework submissions from your supervisor interface.'
            : pageTab === 'mock-exam'
            ? 'Take practice MCQ tests set by your teacher. Review answers and track your past scores in real-time.'
            : 'View assigned coursework, submit solutions, and track grades from your supervisor.'}
        </p>

        {/* Page-Level Tab Bar — Students Only */}
        {user?.role === 'student' && (
          <div className="mt-5 flex items-center gap-1 bg-gray-100/80 p-1 rounded-xl border border-gray-200/60 w-fit">
            <button
              type="button"
              onClick={() => setPageTab('assignments')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold tracking-wide transition-all duration-200 ${
                pageTab === 'assignments'
                  ? 'bg-white text-gray-900 shadow shadow-gray-300/30'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <FaClipboardList className="text-xs" />
              Assignments
            </button>
            <button
              type="button"
              onClick={() => {
                setPageTab('mock-exam');
                handleLoadStudentMockExams();
              }}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold tracking-wide transition-all duration-200 ${
                pageTab === 'mock-exam'
                  ? 'bg-white text-gray-900 shadow shadow-gray-300/30'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <FaGraduationCap className="text-xs" />
              Mock Exams
              {studentMockExams.filter(e => e.attempt_id === null).length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-primary-500 text-white text-[9px] font-extrabold">
                  {studentMockExams.filter(e => e.attempt_id === null).length}
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── STUDENT MOCK EXAM PORTAL (full-page standalone) ── */}
      {user?.role === 'student' && pageTab === 'mock-exam' && (
        <div className="space-y-6">
          {/* Active Exam Panel */}
          {activeExam ? (
            <div className="bg-white rounded-xl border border-gray-150 p-6 shadow-sm space-y-6">
              <div className="flex justify-between items-center pb-4 border-b border-gray-100 flex-wrap gap-2">
                <div>
                  <span className="text-3xs font-extrabold uppercase bg-primary-100 text-primary-700 px-2 py-0.5 rounded">
                    {activeExam.subject}
                  </span>
                  <h3 className="text-lg font-bold text-gray-900 mt-1">{activeExam.title}</h3>
                  {activeExam.negative_marking && (
                    <span className="text-3xs text-danger-600 font-semibold bg-danger-50 border border-danger-100 px-2 py-0.5 rounded mt-1 inline-block">
                      ⚠ Negative marking active
                    </span>
                  )}
                </div>
                {/* Enhanced Live Timer */}
                <div className="flex flex-col items-end gap-1">
                  <div className={`flex items-center gap-2 font-mono font-black text-sm px-4 py-2 rounded-xl border-2 transition-all duration-500 ${
                    examTimeLeft <= 0
                      ? 'bg-gray-50 border-gray-200 text-gray-400'
                      : examTimeLeft < 5 * 60
                      ? 'bg-danger-50 border-danger-400 text-danger-700 animate-pulse shadow-lg'
                      : examTimeLeft < 10 * 60
                      ? 'bg-warning-50 border-warning-300 text-warning-700'
                      : 'bg-success-50 border-success-200 text-success-700'
                  }`}>
                    <FaClock className={examTimeLeft < 5 * 60 ? 'animate-spin' : ''} />
                    <div className="flex flex-col items-center">
                      <span className="text-lg leading-none">
                        {Math.floor(examTimeLeft / 3600) > 0
                          ? `${Math.floor(examTimeLeft / 3600)}:${Math.floor((examTimeLeft % 3600) / 60).toString().padStart(2, '0')}:${(examTimeLeft % 60).toString().padStart(2, '0')}`
                          : `${Math.floor(examTimeLeft / 60)}:${(examTimeLeft % 60).toString().padStart(2, '0')}`
                        }
                      </span>
                      <span className="text-3xs font-semibold uppercase tracking-wider opacity-70">
                        {examTimeLeft < 5 * 60 ? '⚠ Hurry up!' : examTimeLeft < 10 * 60 ? 'Time running low' : 'Time Remaining'}
                      </span>
                    </div>
                  </div>
                  <div className="w-full min-w-[140px] bg-gray-100 rounded-full h-1">
                    <div
                      className={`h-1 rounded-full transition-all duration-1000 ${
                        examTimeLeft < 5 * 60 ? 'bg-danger-500' : examTimeLeft < 10 * 60 ? 'bg-warning-500' : 'bg-success-500'
                      }`}
                      style={{ width: `${Math.max(0, (examTimeLeft / (activeExam.duration_minutes * 60)) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-3xs font-bold text-gray-400">
                  <span>QUESTION {currentQuestionIndex + 1} OF {activeExamQuestions.length}</span>
                  <span>{Math.round(((currentQuestionIndex + 1) / activeExamQuestions.length) * 100)}% COMPLETE</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${((currentQuestionIndex + 1) / activeExamQuestions.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Current Question */}
              <div className="p-4 bg-gray-50/50 rounded-xl border border-gray-150 space-y-4">
                <div className="text-sm font-bold text-gray-800">
                  {activeExamQuestions[currentQuestionIndex].question_text}
                </div>
                {activeExamQuestions[currentQuestionIndex].image_url && (
                  <div className="max-w-md bg-white p-2 rounded-lg border border-gray-100">
                    <img
                      src={getImageUrl(activeExamQuestions[currentQuestionIndex].image_url)}
                      alt="Question aid"
                      className="max-h-56 w-auto object-contain rounded"
                    />
                  </div>
                )}
                {/* MCQ Options */}
                <div className="grid grid-cols-1 gap-2.5">
                  {[
                    { key: 'A', text: activeExamQuestions[currentQuestionIndex].option_a },
                    { key: 'B', text: activeExamQuestions[currentQuestionIndex].option_b },
                    { key: 'C', text: activeExamQuestions[currentQuestionIndex].option_c },
                    { key: 'D', text: activeExamQuestions[currentQuestionIndex].option_d }
                  ].map(opt => {
                    const isSelected = selectedAnswers[activeExamQuestions[currentQuestionIndex].id] === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => {
                          setSelectedAnswers(prev => ({
                            ...prev,
                            [activeExamQuestions[currentQuestionIndex].id]: opt.key
                          }));
                        }}
                        className={`w-full p-3 rounded-lg border text-left text-xs font-semibold flex items-center gap-3 transition-all duration-150 ${
                          isSelected
                            ? 'bg-primary-50 border-primary-300 text-primary-950 shadow-sm'
                            : 'bg-white border-gray-150 text-gray-655 hover:bg-gray-50/50'
                        }`}
                      >
                        <span className={`h-5 w-5 rounded-full border flex items-center justify-center font-bold text-3xs ${
                          isSelected
                            ? 'border-primary-500 bg-primary-500 text-white'
                            : 'border-gray-300 text-gray-400'
                        }`}>
                          {opt.key}
                        </span>
                        <span>{opt.text}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Navigation */}
              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  disabled={currentQuestionIndex === 0}
                  onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                >
                  ← Previous
                </button>
                <div className="flex items-center gap-1 flex-wrap justify-center max-w-xs">
                  {activeExamQuestions.map((_: any, i: number) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setCurrentQuestionIndex(i)}
                      className={`h-6 w-6 rounded-full text-3xs font-bold transition-all ${
                        i === currentQuestionIndex
                          ? 'bg-primary-600 text-white'
                          : selectedAnswers[activeExamQuestions[i].id]
                          ? 'bg-success-100 text-success-700 border border-success-300'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={currentQuestionIndex === activeExamQuestions.length - 1}
                  onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                >
                  Next →
                </button>
              </div>

              {/* Submit Button */}
              <div className="flex justify-center pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleSubmitMockExamManual}
                  disabled={submittingAttempt}
                  className="px-8 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-bold shadow-sm transition-colors disabled:opacity-50"
                >
                  {submittingAttempt ? 'Submitting...' : '✓ Submit Mock Test'}
                </button>
              </div>
            </div>
          ) : attemptResult ? (
            /* Result Panel */
            <div className="bg-white rounded-xl border border-gray-150 p-8 shadow-sm space-y-6 animate-in fade-in duration-300">
              <div className="text-center space-y-2 border-b border-gray-100 pb-6">
                <FaGraduationCap className="text-5xl text-primary-500 mx-auto" />
                <h3 className="text-2xl font-bold text-gray-900">Mock Test Result</h3>
                <p className="text-xs text-gray-500">Your auto-graded result is shown below</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-150">
                  <span className="text-3xs font-bold text-gray-400 uppercase">Score</span>
                  <p className="text-xl font-black text-gray-800 mt-1">{attemptResult.score} / {attemptResult.total_marks || 50}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-150">
                  <span className="text-3xs font-bold text-gray-400 uppercase">Percentage</span>
                  <p className="text-xl font-black text-gray-800 mt-1">{attemptResult.percentage}%</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-150">
                  <span className="text-3xs font-bold text-gray-400 uppercase">Grade</span>
                  <p className="text-xl font-black text-gray-800 mt-1">{attemptResult.grade}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-150">
                  <span className="text-3xs font-bold text-gray-400 uppercase">Status</span>
                  <p className="mt-2">
                    <span className={`inline-flex px-3 py-1 rounded-full text-sm font-extrabold uppercase ${
                      attemptResult.status === 'PASS'
                        ? 'bg-success-100 text-success-700 border border-success-200'
                        : 'bg-danger-100 text-danger-700 border border-danger-200'
                    }`}>
                      {attemptResult.status}
                    </span>
                  </p>
                </div>
              </div>
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-150 flex justify-around text-sm font-semibold text-gray-700">
                <div>Correct: <span className="text-success-600 font-bold">{attemptResult.correct_answers_count}</span></div>
                <div className="border-r border-gray-200 h-4 my-auto" />
                <div>Wrong: <span className="text-danger-600 font-bold">{attemptResult.wrong_answers_count}</span></div>
                <div className="border-r border-gray-200 h-4 my-auto" />
                <div>Unanswered: <span className="text-gray-500 font-bold">{(attemptResult.total_questions || 0) - (attemptResult.correct_answers_count || 0) - (attemptResult.wrong_answers_count || 0)}</span></div>
              </div>
              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setAttemptResult(null); handleLoadStudentMockExams(); }}
                  className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-bold transition-colors"
                >
                  ← Back to Exams
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadStudentMockReview(attemptResult.exam_id)}
                  className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-bold shadow-sm transition-colors"
                >
                  📋 Review Answers
                </button>
              </div>
            </div>
          ) : showReview && reviewExamData ? (
            /* Review Panel */
            <div className="bg-white rounded-xl border border-gray-150 p-6 shadow-sm space-y-6">
              <div className="flex justify-between items-center pb-4 border-b border-gray-100 flex-wrap gap-2">
                <div>
                  <span className="text-3xs font-extrabold uppercase bg-primary-100 text-primary-700 px-2 py-0.5 rounded">
                    {reviewExamData.attempt.subject || 'Review'}
                  </span>
                  <h3 className="text-lg font-bold text-gray-900 mt-1">Mock Exam Answer Review</h3>
                </div>
                <button
                  type="button"
                  onClick={() => { setShowReview(false); setReviewExamData(null); }}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-colors"
                >
                  ← Back to Exams
                </button>
              </div>
              {/* Summary */}
              <div className="bg-gray-50/35 p-4 rounded-xl border border-gray-150 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div>
                  <span className="text-4xs font-bold uppercase text-gray-400">Score</span>
                  <p className="text-base font-bold text-gray-800">{parseFloat(reviewExamData.attempt.score).toFixed(1)} / {reviewExamData.questions.reduce((s: number, q: any) => s + q.question_marks, 0)}</p>
                </div>
                <div>
                  <span className="text-4xs font-bold uppercase text-gray-400">Percentage</span>
                  <p className="text-base font-bold text-gray-800">{parseFloat(reviewExamData.attempt.percentage).toFixed(1)}%</p>
                </div>
                <div>
                  <span className="text-4xs font-bold uppercase text-gray-400">Grade</span>
                  <p className="text-base font-bold text-gray-800">{reviewExamData.attempt.grade}</p>
                </div>
                <div>
                  <span className="text-4xs font-bold uppercase text-gray-400">Correct / Wrong</span>
                  <p className="text-sm font-bold mt-0.5">
                    <span className="text-success-600 font-bold">{reviewExamData.attempt.correct_answers_count} ✓</span>
                    {' '}/{' '}
                    <span className="text-danger-600 font-bold">{reviewExamData.attempt.wrong_answers_count} ✗</span>
                  </p>
                </div>
              </div>
              {/* Questions */}
              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                {reviewExamData.questions.map((q: any, idx: number) => {
                  const isCorrect = q.selected_option === q.correct_option;
                  const isUnanswered = q.selected_option === null;
                  return (
                    <div key={q.question_id} className="p-4 bg-white rounded-xl border border-gray-150 space-y-3 relative shadow-2xs">
                      <div className="absolute top-3 right-4 flex items-center gap-1">
                        {isCorrect ? (
                          <span className="px-2 py-0.5 text-3xs font-extrabold uppercase rounded bg-success-50 text-success-700 border border-success-100">✓ Correct (+{q.question_marks})</span>
                        ) : isUnanswered ? (
                          <span className="px-2 py-0.5 text-3xs font-extrabold uppercase rounded bg-gray-50 text-gray-500 border border-gray-150">Unanswered (0)</span>
                        ) : (
                          <span className="px-2 py-0.5 text-3xs font-extrabold uppercase rounded bg-danger-50 text-danger-700 border border-danger-100">
                            ✗ Wrong {reviewExamData.attempt.negative_marking ? `(-${(0.25 * q.question_marks).toFixed(2)})` : '(0)'}
                          </span>
                        )}
                      </div>
                      <div className="pr-24">
                        <span className="text-xs font-black text-gray-400 mr-1.5">Q{idx + 1}.</span>
                        <span className="text-xs font-bold text-gray-800">{q.question_text}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-4">
                        {[
                          { key: 'A', text: q.option_a },
                          { key: 'B', text: q.option_b },
                          { key: 'C', text: q.option_c },
                          { key: 'D', text: q.option_d }
                        ].map(opt => {
                          const isOptCorrect = opt.key === q.correct_option;
                          const isOptSelected = opt.key === q.selected_option;
                          let bg = 'bg-gray-50 border-gray-150 text-gray-700';
                          if (isOptCorrect) bg = 'bg-success-50 border-success-200 text-success-900 font-bold';
                          else if (isOptSelected && !isCorrect) bg = 'bg-danger-50 border-danger-200 text-danger-900 font-bold';
                          return (
                            <div key={opt.key} className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${bg}`}>
                              <span>{opt.key}. {opt.text}</span>
                              <div className="flex items-center gap-1">
                                {isOptCorrect && <span className="text-success-600 font-bold text-2xs uppercase">Correct Key</span>}
                                {isOptSelected && <span className="text-gray-500 font-semibold text-[10px] px-1 bg-white rounded shadow-3xs">My Answer</span>}
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
          ) : (
            /* Main Mock Exam List (Available + Past) */
            <div className="space-y-6">
              {studentMockExamsLoading ? (
                <div className="py-20 flex justify-center">
                  <div className="h-10 w-10 rounded-full border-2 border-primary-200 border-t-primary-600 animate-spin" />
                </div>
              ) : (() => {
                const availableExams = studentMockExams.filter(item => item.attempt_id === null || item.attempt_id === undefined);
                const pastExams = studentMockExams.filter(item => item.attempt_id !== null && item.attempt_id !== undefined);
                return (
                  <>
                    {/* Stats Bar */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="bg-white rounded-xl border border-gray-150 shadow-sm p-4 text-center">
                        <p className="text-3xs font-extrabold uppercase text-gray-400">Total Tests</p>
                        <p className="text-2xl font-black text-gray-900 mt-1">{studentMockExams.length}</p>
                      </div>
                      <div className="bg-white rounded-xl border border-gray-150 shadow-sm p-4 text-center">
                        <p className="text-3xs font-extrabold uppercase text-success-600">Pending</p>
                        <p className="text-2xl font-black text-success-700 mt-1">{availableExams.length}</p>
                      </div>
                      <div className="bg-white rounded-xl border border-gray-150 shadow-sm p-4 text-center">
                        <p className="text-3xs font-extrabold uppercase text-gray-400">Completed</p>
                        <p className="text-2xl font-black text-gray-900 mt-1">{pastExams.length}</p>
                      </div>
                      <div className="bg-white rounded-xl border border-gray-150 shadow-sm p-4 text-center">
                        <p className="text-3xs font-extrabold uppercase text-primary-600">Avg Score</p>
                        <p className="text-2xl font-black text-primary-700 mt-1">
                          {pastExams.length > 0
                            ? `${(pastExams.reduce((s, e) => s + parseFloat(e.attempt_percentage || '0'), 0) / pastExams.length).toFixed(0)}%`
                            : '—'}
                        </p>
                      </div>
                    </div>

                    {studentMockExams.length === 0 ? (
                      <div className="text-center py-20 text-gray-400 bg-white rounded-xl border border-dashed border-gray-200 shadow-sm">
                        <FaGraduationCap className="mx-auto text-5xl mb-4 text-gray-200" />
                        <p className="text-lg font-bold text-gray-600">No Mock Tests Yet</p>
                        <p className="text-sm mt-2">Your teacher hasn't published any mock tests. Check back later.</p>
                      </div>
                    ) : (
                      <>
                        {/* Available Tests */}
                        {availableExams.length > 0 && (
                          <div className="bg-white rounded-xl border border-gray-150 shadow-sm p-6">
                            <div className="flex items-center gap-2 mb-5">
                              <h2 className="text-lg font-bold text-gray-900">Available Tests</h2>
                              <span className="text-2xs font-extrabold uppercase text-success-700 bg-success-50 border border-success-100 px-2 py-0.5 rounded-full">
                                ● {availableExams.length} pending
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                              {availableExams.map(item => (
                                <div key={item.id} className="group p-5 bg-gradient-to-br from-white to-primary-50/30 rounded-xl border border-primary-100 shadow-2xs hover:shadow-md transition-all space-y-3 relative overflow-hidden flex flex-col justify-between">
                                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary-500 to-secondary-500" />
                                  <div>
                                    <div className="flex justify-between items-start mb-2">
                                      <span className="text-3xs font-extrabold uppercase bg-primary-100 text-primary-700 px-2 py-0.5 rounded">{item.subject}</span>
                                      <span className="text-3xs font-bold text-gray-400 uppercase">{item.duration_minutes} min</span>
                                    </div>
                                    <h3 className="font-bold text-sm text-gray-900 line-clamp-2">{item.title}</h3>
                                    <p className="text-3xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{item.description || 'Practice MCQ exam.'}</p>
                                  </div>
                                  <div className="space-y-2 border-t border-gray-100/80 pt-3">
                                    <div className="flex justify-between text-4xs font-bold text-gray-400 uppercase">
                                      <span>{item.question_count} Questions</span>
                                      <span>{item.total_marks} Marks</span>
                                    </div>
                                    {item.negative_marking && (
                                      <div className="text-3xs text-danger-600 font-semibold bg-danger-50 border border-danger-100 px-2 py-1 rounded">
                                        ⚠ Negative marking applies
                                      </div>
                                    )}
                                    <div className="flex items-center gap-1 text-3xs text-warning-600 font-bold">
                                      <FaClock className="text-warning-500 text-2xs" />
                                      <span>Due: {new Date(item.due_date).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleStartMockExam(item.id)}
                                      className="w-full py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm group-hover:shadow-md"
                                    >
                                      ▶ Start Test
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Past Examinations */}
                        {pastExams.length > 0 && (
                          <div className="bg-white rounded-xl border border-gray-150 shadow-sm p-6">
                            <div className="flex items-center gap-2 mb-5">
                              <h2 className="text-lg font-bold text-gray-900">Past Examinations</h2>
                              <span className="text-2xs font-extrabold uppercase text-gray-600 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
                                ✓ {pastExams.length} completed
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                              {pastExams.map(item => (
                                <div key={item.id} className="p-5 bg-white rounded-xl border border-gray-150 shadow-2xs hover:shadow-sm transition-all space-y-3 relative overflow-hidden flex flex-col justify-between">
                                  <div className={`absolute top-0 left-0 w-full h-1 ${item.attempt_status === 'PASS' ? 'bg-success-400' : 'bg-danger-400'}`} />
                                  <div>
                                    <div className="flex justify-between items-start mb-2">
                                      <span className="text-3xs font-extrabold uppercase bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{item.subject}</span>
                                      <span className={`px-2 py-0.5 rounded text-3xs font-extrabold uppercase ${
                                        item.attempt_status === 'PASS'
                                          ? 'bg-success-100 text-success-800 border border-success-200'
                                          : 'bg-danger-100 text-danger-800 border border-danger-200'
                                      }`}>{item.attempt_status}</span>
                                    </div>
                                    <h3 className="font-bold text-sm text-gray-800 line-clamp-2">{item.title}</h3>
                                    <p className="text-3xs text-gray-400 mt-1 line-clamp-1 leading-relaxed">{item.description || 'Practice MCQ exam.'}</p>
                                  </div>
                                  <div className="border-t border-gray-100 pt-3 space-y-2">
                                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-150">
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <p className="text-3xs font-bold text-gray-500 uppercase">Score</p>
                                          <p className="text-base font-black text-gray-900">{parseFloat(item.attempt_score).toFixed(1)} <span className="text-xs font-semibold text-gray-400">/ {item.total_marks}</span></p>
                                        </div>
                                        <div className="text-right">
                                          <p className="text-3xs font-bold text-gray-500 uppercase">Percentage</p>
                                          <p className={`text-base font-black ${item.attempt_status === 'PASS' ? 'text-success-600' : 'text-danger-600'}`}>
                                            {parseFloat(item.attempt_percentage).toFixed(0)}%
                                          </p>
                                        </div>
                                      </div>
                                      <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                                        <div
                                          className={`h-1.5 rounded-full ${item.attempt_status === 'PASS' ? 'bg-success-500' : 'bg-danger-500'}`}
                                          style={{ width: `${Math.min(100, parseFloat(item.attempt_percentage))}%` }}
                                        />
                                      </div>
                                    </div>
                                    <div className="text-3xs text-gray-400 text-center">
                                      Attempted: {new Date(item.attempt_submitted_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleLoadStudentMockReview(item.id)}
                                      disabled={reviewLoading}
                                      className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-2xs font-bold transition-colors"
                                    >
                                      {reviewLoading ? 'Loading...' : '📋 Review Answers'}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* ── ASSIGNMENTS GRID (teacher always, student only when pageTab === 'assignments') ── */}
      {(user?.role !== 'student' || pageTab === 'assignments') && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Side: Assignments List */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-xl border border-gray-150 p-4 shadow-sm">
            <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FaBook className="text-primary-500" />
              Assigned Work
            </h2>

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
            
            {loading ? (
              <div className="py-12 flex justify-center">
                <div className="h-6 w-6 rounded-full border-2 border-primary-200 border-t-primary-600 animate-spin" />
              </div>
            ) : filteredAssignments.length === 0 ? (
              <div className="text-center py-10 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                <FaInfoCircle className="mx-auto text-2xl mb-2 text-gray-300" />
                <p className="text-sm font-medium">No assignments found</p>
                <p className="text-xs text-gray-400 mt-1">No tasks in this category.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {filteredAssignments.map(item => {
                  const isSelected = item.id === selectedAssignmentId;
                  const isOverdue = new Date(item.due_date) < new Date() && !item.submission_status;
                  
                  return (
                    <motion.div
                      key={item.id}
                      onClick={() => handleSelectAssignment(item.id)}
                      whileHover={{ scale: 1.01 }}
                      className={`p-4 rounded-lg border transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                        isSelected 
                          ? 'bg-primary-50 border-primary-300 text-primary-950 shadow-sm'
                          : 'bg-white border-gray-100 hover:bg-gray-50/50'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2 gap-2">
                        <span className="text-2xs font-bold uppercase tracking-wider text-primary-600 px-2 py-0.5 rounded bg-primary-100/50">
                          {item.subject}
                        </span>
                        
                        {item.submission_status === 'reviewed' ? (
                          <span className="text-3xs font-extrabold uppercase bg-success-50 text-success-700 border border-success-100 px-1.5 py-0.5 rounded-full">
                            Graded: {item.marks}/{item.total_marks}
                          </span>
                        ) : item.submission_status === 'submitted' ? (
                          <span className="text-3xs font-extrabold uppercase bg-indigo-50 text-indigo-700 border border-indigo-150 px-1.5 py-0.5 rounded-full">
                            Submitted
                          </span>
                        ) : isOverdue ? (
                          <span className="text-3xs font-extrabold uppercase bg-danger-50 text-danger-700 border border-danger-100 px-1.5 py-0.5 rounded-full">
                            Overdue
                          </span>
                        ) : (
                          <span className="text-3xs font-extrabold uppercase bg-warning-50 text-warning-700 border border-warning-100 px-1.5 py-0.5 rounded-full">
                            Assigned
                          </span>
                        )}
                      </div>

                      <h3 className="font-bold text-sm text-gray-800 line-clamp-1 mb-1">
                        {item.title}
                      </h3>
                      
                      <div className="flex items-center justify-between text-3xs text-gray-500 font-medium mt-1">
                        <span className="flex items-center gap-1">
                          <FaCalendarAlt />
                          Due: {new Date(item.due_date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                        <span>Marks: {item.total_marks}</span>
                      </div>

                      {user?.role === 'teacher' || user?.role === 'admin' ? (
                        <div className="text-3xs text-gray-400 font-bold mt-2 pt-2 border-t border-gray-100/50">
                          Submissions: {item.submission_count}
                        </div>
                      ) : (
                        !item.submission_status && !isOverdue && (
                          <div className="mt-2 pt-2 border-t border-gray-100/50 flex justify-between items-center">
                            <span className="text-4xs text-gray-400 uppercase tracking-wider font-semibold">Time remaining:</span>
                            <CountdownTimer dueDate={item.due_date} />
                          </div>
                        )
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Assignment Details & Submissions */}
        <div className="lg:col-span-8">
          <AnimatePresence mode="wait">
            {!selectedAssignmentId ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-white rounded-xl border border-gray-150 shadow-sm p-12 text-center text-gray-400 min-h-[50vh] flex flex-col justify-center items-center"
              >
                <FaClipboardList className="text-5xl text-gray-200 mb-4 bg-gray-50 p-3 rounded-full" />
                <h3 className="font-bold text-gray-700 text-lg mb-1">No Assignment Selected</h3>
                <p className="text-sm max-w-sm">Select an assignment from the sidebar list to view details and submit your work.</p>
              </motion.div>
            ) : detailLoading ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white rounded-xl border border-gray-150 shadow-sm p-12 text-center min-h-[50vh] flex justify-center items-center"
              >
                <div className="h-10 w-10 rounded-full border-4 border-primary-200 border-t-primary-600 animate-spin" />
              </motion.div>
            ) : assignmentDetail ? (
              <motion.div
                key={selectedAssignmentId}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                {/* Tab Switcher */}
                <div className="flex bg-gray-100/85 p-1 rounded-xl border border-gray-200/40 w-fit">
                  <button
                    type="button"
                    onClick={() => setRightTab('details')}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 ${
                      rightTab === 'details'
                        ? 'bg-white text-gray-900 shadow shadow-gray-250/20'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    Details & Submission
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRightTab('prediction'); handleLoadStudentPredictionData(); }}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 ${
                      rightTab === 'prediction'
                        ? 'bg-white text-gray-900 shadow shadow-gray-250/20'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    Mark Prediction
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRightTab('mock-exam'); handleLoadStudentMockExams(); }}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 ${
                      rightTab === 'mock-exam'
                        ? 'bg-white text-gray-900 shadow shadow-gray-250/20'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    Mock Exam
                  </button>
                </div>

                {rightTab === 'details' && (
                  <div className="space-y-6">
                <div className="bg-white rounded-xl border border-gray-150 shadow-sm p-6 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary-500 to-secondary-500" />
                  
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-gray-100">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold uppercase tracking-wider text-primary-600">
                          {assignmentDetail.assignment.subject}
                        </span>
                        {user?.role === 'student' && !assignmentDetail.submission && new Date(assignmentDetail.assignment.due_date) >= new Date() && (
                          <CountdownTimer dueDate={assignmentDetail.assignment.due_date} />
                        )}
                      </div>
                      <h2 className="text-2xl font-bold text-gray-900 mt-1">
                        {assignmentDetail.assignment.title}
                      </h2>
                    </div>
                    <div className="text-right sm:text-right text-xs text-gray-500">
                      <p className="flex items-center justify-end gap-1 font-semibold text-gray-700">
                        <FaUser className="text-primary-500 text-3xs" />
                        {assignmentDetail.assignment.teacher_name}
                      </p>
                      <p className="mt-0.5">Assigned: {new Date(assignmentDetail.assignment.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>

                  {/* Due Date & Marks Badges */}
                  <div className="grid grid-cols-2 gap-4 py-4 my-2">
                    <div className="p-3 bg-gray-50/60 border border-gray-100 rounded-lg flex items-center gap-3">
                      <FaCalendarAlt className="text-secondary-500 text-lg" />
                      <div>
                        <p className="text-3xs font-bold uppercase text-gray-400">Due Date</p>
                        <p className="text-xs font-bold text-gray-700">
                          {new Date(assignmentDetail.assignment.due_date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                      </div>
                    </div>
                    <div className="p-3 bg-gray-50/60 border border-gray-100 rounded-lg flex items-center gap-3">
                      <FaCheckCircle className="text-success-500 text-lg" />
                      <div>
                        <p className="text-3xs font-bold uppercase text-gray-400">Total Marks</p>
                        <p className="text-xs font-bold text-gray-700">
                          {assignmentDetail.assignment.total_marks} Points Possible
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Description & Requirements */}
                  {assignmentDetail.assignment.description && (
                    <div className="mb-4">
                      <h3 className="text-sm font-bold text-gray-800 mb-2">Description & Requirements</h3>
                      <div className="text-sm text-gray-600 bg-gray-50 p-4 rounded-xl border border-gray-100 leading-relaxed whitespace-pre-line prose max-w-none">
                        {assignmentDetail.assignment.description}
                      </div>
                    </div>
                  )}

                  {/* Special Instructions */}
                  {assignmentDetail.assignment.instructions && (
                    <div className="mb-2">
                      <h3 className="text-sm font-bold text-gray-800 mb-2">Submission Instructions</h3>
                      <div className="text-sm text-gray-600 bg-amber-50/40 p-4 rounded-xl border border-amber-100/50 leading-relaxed whitespace-pre-line">
                        {assignmentDetail.assignment.instructions}
                      </div>
                    </div>
                  )}

                  {/* Attached Course Materials / Reference Files */}
                  {assignmentDetail.resources && assignmentDetail.resources.length > 0 && (
                    <div className="mb-4 pt-4 border-t border-gray-100">
                      <h3 className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-1.5">
                        Course Materials & Reference Files ({assignmentDetail.resources.length})
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {assignmentDetail.resources.map(file => (
                          <div key={file.resource_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100/50 transition-colors">
                            <div className="flex items-center gap-2.5 min-w-0">
                              {getFileIcon(file.original_name)}
                              <div className="truncate">
                                <p className="text-xs font-bold text-gray-800 truncate" title={file.original_name}>{file.original_name}</p>
                                <p className="text-4xs text-gray-400 font-medium">
                                  {formatBytes(file.file_size)} &bull; v{file.version}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDownloadResource(assignmentDetail.assignment.id, file.resource_id, file.original_name)}
                              className="p-1.5 hover:bg-white text-primary-600 rounded border border-gray-200 shadow-3xs transition-colors flex items-center gap-1 focus:outline-none"
                              title="Download File"
                            >
                              <FaDownload size={11} />
                              <span className="text-4xs font-bold">({file.download_count})</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Upload Settings Info */}
                  <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-x-6 gap-y-2 text-3xs font-semibold text-gray-400 uppercase tracking-wider">
                    <span>Max Size: {assignmentDetail.assignment.max_file_size_mb} MB</span>
                    <span>Allowed Types: {assignmentDetail.assignment.allowed_file_types?.split(',').join(', ')}</span>
                  </div>
                </div>

                {/* Submissions Section */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  <div className="md:col-span-12">
                    {user?.role === 'teacher' || user?.role === 'admin' ? (
                      // Render Teacher view of submissions
                      <div className="bg-white rounded-xl border border-gray-150 shadow-sm p-4 animate-in fade-in duration-200">
                        <h4 className="font-bold text-gray-800 text-sm border-b border-gray-100 pb-2 mb-3">Student Submissions</h4>
                        
                        {(!assignmentDetail.submissions || assignmentDetail.submissions.length === 0) ? (
                          <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                            <p className="text-sm font-medium">No student submissions available for evaluation</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-gray-100 max-h-[50vh] overflow-y-auto pr-1">
                            {assignmentDetail.submissions.map(student => {
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
                                          {student.marks} / {assignmentDetail.assignment.total_marks}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleOpenGrading(student)}
                                          className="text-2xs text-blue-650 hover:text-blue-800 font-bold ml-3 focus:outline-none"
                                        >
                                          Re-grade
                                        </button>
                                      </div>
                                    ) : hasSubmitted ? (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenGrading(student)}
                                        className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded text-xs font-semibold shadow-sm focus:outline-none"
                                      >
                                        Evaluate & Grade
                                      </button>
                                    ) : (
                                      <span className="text-3xs font-extrabold uppercase bg-gray-50 text-gray-400 px-2 py-0.5 rounded border border-gray-150 tracking-wider font-semibold">
                                        Not Submitted
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      // Render Student view of submissions
                      <>
                        {/* CASE A: Reviewed & Graded */}
                        {assignmentDetail.submission?.status === 'reviewed' && (
                      <div className="bg-success-50/20 border border-success-100 rounded-xl p-6 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-success-500" />
                        <h3 className="text-lg font-bold text-success-800 flex items-center gap-2 mb-4">
                          <FaCheckCircle className="text-success-500" />
                          Grading & Feedback Completed
                        </h3>

                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
                          <div className="sm:col-span-1 p-4 bg-white border border-success-100 rounded-lg text-center shadow-xs flex flex-col justify-center">
                            <p className="text-3xs font-extrabold uppercase tracking-wider text-success-600 mb-1">Score Obtained</p>
                            <p className="text-3xl font-extrabold text-success-800">
                              {assignmentDetail.submission.marks}
                            </p>
                            <p className="text-3xs font-medium text-gray-400 mt-1">out of {assignmentDetail.assignment.total_marks}</p>
                          </div>
                          
                          <div className="sm:col-span-3 p-4 bg-white border border-success-100 rounded-lg">
                            <p className="text-3xs font-extrabold uppercase tracking-wider text-success-600 mb-1">Teacher's Feedback</p>
                            <p className="text-sm text-gray-700 italic leading-relaxed">
                              "{assignmentDetail.submission.feedback || 'Excellent work. Marks recorded.'}"
                            </p>
                          </div>
                        </div>

                        {/* Submission details */}
                        <div className="border-t border-success-100/50 pt-4 mt-4 text-xs text-gray-600">
                          <p className="font-semibold text-gray-700">Your comments:</p>
                          <p className="bg-white/50 p-2.5 rounded border border-gray-100 mt-1 italic">
                            "{assignmentDetail.submission.comments || 'No submission comments'}"
                          </p>
                          
                          {assignmentDetail.files.length > 0 && (
                            <div className="mt-3">
                              <p className="font-semibold text-gray-700 mb-1.5">Submitted files:</p>
                              <div className="space-y-1">
                                {assignmentDetail.files.map(file => (
                                  <div key={file.id} className="flex items-center justify-between p-2 bg-white/70 rounded border border-gray-150">
                                    <div className="flex items-center gap-2 truncate">
                                      {getFileIcon(file.file_name)}
                                      <span className="text-xs text-gray-800 font-medium truncate">{file.file_name}</span>
                                      <span className="text-3xs text-gray-400">({formatBytes(file.file_size)})</span>
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
                      </div>
                    )}

                    {/* CASE B: Submitted, waiting review */}
                    {assignmentDetail.submission?.status === 'submitted' && (
                      <div className="bg-white rounded-xl border border-gray-150 p-6 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-primary-500" />
                        
                        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <FaCheckCircle className="text-primary-500" />
                            Assignment Submitted Successfully
                          </h3>
                          <span className="text-xs text-primary-600 bg-primary-50 font-bold px-2 py-0.5 rounded border border-primary-100">
                            Awaiting Evaluation
                          </span>
                        </div>

                        <div className="p-4 bg-gray-50/50 rounded-lg border border-gray-100 text-xs text-gray-600 space-y-3">
                          <div>
                            <span className="font-semibold text-gray-700">Submission time:</span>{' '}
                            {new Date(assignmentDetail.submission.submitted_at).toLocaleString()}
                          </div>
                          <div>
                            <span className="font-semibold text-gray-700">Your comments:</span>
                            <p className="bg-white p-2.5 rounded border border-gray-100 mt-1 italic">
                              "{assignmentDetail.submission.comments || 'No submission comments'}"
                            </p>
                          </div>

                          {assignmentDetail.files.length > 0 && (
                            <div>
                              <span className="font-semibold text-gray-700 block mb-1.5">Submitted files:</span>
                              <div className="space-y-1">
                                {assignmentDetail.files.map(file => (
                                  <div key={file.id} className="flex items-center justify-between p-2 bg-white rounded border border-gray-150">
                                    <div className="flex items-center gap-2 truncate">
                                      {getFileIcon(file.file_name)}
                                      <span className="text-xs text-gray-800 font-medium truncate">{file.file_name}</span>
                                      <span className="text-3xs text-gray-400">({formatBytes(file.file_size)})</span>
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

                        {/* Resubmit form if deadline not passed */}
                        {new Date(assignmentDetail.assignment.due_date) > new Date() && (
                          <div className="mt-6 pt-6 border-t border-gray-100">
                            <h4 className="text-sm font-bold text-gray-800 mb-2">Want to update your submission?</h4>
                            <p className="text-xs text-gray-400 mb-4">
                              You can resubmit files before the deadline. Submitting again will completely replace your previous files.
                            </p>
                            
                            {/* Render Form */}
                            <form onSubmit={handleSubmit} className="space-y-4">
                              <div>
                                <label className="form-label text-xs">Updated Comments / Instructions (Optional)</label>
                                <textarea
                                  value={comments}
                                  onChange={(e) => setComments(e.target.value)}
                                  className="w-full rounded-lg border border-gray-200 bg-white p-3 text-xs focus:ring-1 focus:ring-primary-500 focus:outline-none"
                                  rows={3}
                                  placeholder="Leave a message for your teacher..."
                                />
                              </div>

                              {/* Upload Drag zone */}
                              <div
                                onDragEnter={handleDrag}
                                onDragOver={handleDrag}
                                onDragLeave={handleDrag}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
                                  isDragActive 
                                    ? 'border-primary-500 bg-primary-50/30' 
                                    : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50/20'
                                }`}
                              >
                                <input
                                  type="file"
                                  ref={fileInputRef}
                                  onChange={handleFileSelect}
                                  multiple
                                  className="hidden"
                                />
                                <FaCloudUploadAlt className="mx-auto text-4xl text-gray-400 mb-2" />
                                <p className="text-xs font-semibold text-gray-700">Drag & Drop Files Here or Browse Files</p>
                                <p className="text-4xs text-gray-400 mt-1 uppercase">Max Size: 25MB per file</p>
                              </div>

                              {/* List Selected Files */}
                              {selectedFiles.length > 0 && (
                                <div className="space-y-1">
                                  <p className="text-3xs font-extrabold uppercase text-gray-400 tracking-wider">New Selected Files ({selectedFiles.length})</p>
                                  {selectedFiles.map((file, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-150">
                                      <div className="flex items-center gap-2 truncate">
                                        {getFileIcon(file.name)}
                                        <span className="text-xs text-gray-800 font-medium truncate">{file.name}</span>
                                        <span className="text-3xs text-gray-400">({formatBytes(file.size)})</span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => removeSelectedFile(idx)}
                                        className="p-1 text-danger-500 hover:bg-danger-50 rounded transition-colors"
                                        title="Remove File"
                                      >
                                        <FaTrashAlt size={10} />
                                      </button>
                                    </div>
                                  ))}
                                  <p className="text-3xs text-right text-gray-500">Total size: {formatBytes(totalSelectedSize)}</p>
                                </div>
                              )}

                              <div className="flex justify-end pt-2">
                                <button
                                  type="submit"
                                  disabled={submitLoading || (selectedFiles.length === 0 && !comments.trim())}
                                  className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
                                >
                                  {submitLoading ? (
                                    <>
                                      <div className="h-3 w-3 rounded-full border border-white border-t-transparent animate-spin" />
                                      Resubmitting...
                                    </>
                                  ) : (
                                    'Resubmit Assignment'
                                  )}
                                </button>
                              </div>
                            </form>
                          </div>
                        )}
                      </div>
                    )}

                    {/* CASE C: Not Submitted Yet */}
                    {!assignmentDetail.submission && (
                      <div className="bg-white rounded-xl border border-gray-150 p-6 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-yellow-500" />
                        
                        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                          <FaClipboardList className="text-yellow-500" />
                          Submit Assignment Work
                        </h3>

                        {new Date(assignmentDetail.assignment.due_date) < new Date() ? (
                          <div className="p-4 bg-danger-50 text-danger-800 border border-danger-100 rounded-lg flex items-center gap-3 text-sm">
                            <FaInfoCircle className="text-danger-500 text-lg flex-shrink-0" />
                            <div>
                              <p className="font-semibold">Submission Deadline Passed</p>
                              <p className="text-xs text-danger-700 mt-0.5">The deadline for this assignment was reached and you did not submit. Resubmissions are closed.</p>
                            </div>
                          </div>
                        ) : (
                          <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                              <label className="form-label text-xs">Submission Comments (Optional)</label>
                              <textarea
                                value={comments}
                                onChange={(e) => setComments(e.target.value)}
                                className="w-full rounded-lg border border-gray-200 bg-white p-3 text-xs focus:ring-1 focus:ring-primary-500 focus:outline-none"
                                rows={3}
                                placeholder="Explain your design, list files, or leave note for prof..."
                              />
                            </div>

                            {/* Upload Drag zone */}
                            <div
                              onDragEnter={handleDrag}
                              onDragOver={handleDrag}
                              onDragLeave={handleDrag}
                              onDrop={handleDrop}
                              onClick={() => fileInputRef.current?.click()}
                              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
                                isDragActive 
                                  ? 'border-primary-500 bg-primary-50/30' 
                                  : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50/20'
                              }`}
                            >
                              <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileSelect}
                                multiple
                                className="hidden"
                              />
                              <FaCloudUploadAlt className="mx-auto text-4xl text-gray-400 mb-2" />
                              <p className="text-xs font-semibold text-gray-700">Drag & Drop Files Here or Browse Files</p>
                              <p className="text-4xs text-gray-400 mt-1 uppercase">Max Size: 25MB per file</p>
                            </div>

                            {/* List Selected Files */}
                            {selectedFiles.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-3xs font-extrabold uppercase text-gray-400 tracking-wider">Selected Files ({selectedFiles.length})</p>
                                {selectedFiles.map((file, idx) => (
                                  <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-150">
                                    <div className="flex items-center gap-2 truncate">
                                      {getFileIcon(file.name)}
                                      <span className="text-xs text-gray-800 font-medium truncate">{file.name}</span>
                                      <span className="text-3xs text-gray-400">({formatBytes(file.size)})</span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => removeSelectedFile(idx)}
                                      className="p-1 text-danger-500 hover:bg-danger-50 rounded transition-colors"
                                      title="Remove File"
                                    >
                                      <FaTrashAlt size={10} />
                                    </button>
                                  </div>
                                ))}
                                <p className="text-3xs text-right text-gray-500 font-medium">Total size: {formatBytes(totalSelectedSize)}</p>
                              </div>
                            )}

                            <div className="flex justify-end pt-2">
                              <button
                                type="submit"
                                disabled={submitLoading || (selectedFiles.length === 0 && !comments.trim())}
                                className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
                              >
                                {submitLoading ? (
                                  <>
                                    <div className="h-3 w-3 rounded-full border border-white border-t-transparent animate-spin" />
                                    Submitting...
                                  </>
                                ) : (
                                  'Submit Assignment'
                                )}
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    )}
                    </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {rightTab === 'prediction' && (
                  <div className="space-y-6 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl border border-gray-150 p-6 shadow-sm">
                      <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <FaGraduationCap className="text-primary-500" />
                        Student Marks Prediction Dashboard
                      </h3>
                      <p className="text-gray-500 text-xs mt-0.5">
                        Forecast your final semester grade based on class attendance, homework completion, and study time.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                      {/* Inputs Form */}
                      <div className="lg:col-span-5 space-y-6">
                        <div className="bg-white rounded-xl border border-gray-150 p-6 shadow-sm space-y-4">
                          <h3 className="font-bold text-gray-800 text-sm border-b border-gray-100 pb-2 flex items-center gap-2">
                            <FaFileAlt className="text-primary-500 text-xs" />
                            Academic & Habits Form
                          </h3>

                          {predictLoading ? (
                            <div className="py-12 flex justify-center">
                              <div className="h-6 w-6 rounded-full border-2 border-primary-200 border-t-primary-650 animate-spin" />
                            </div>
                          ) : (
                            <form onSubmit={handleGenerateStudentPrediction} className="space-y-4">
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
                                    Predict My Marks
                                  </>
                                )}
                              </button>
                            </form>
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
                                <div className="p-4 bg-gray-55/60 rounded-xl border border-gray-100 space-y-3">
                                  <div>
                                    <div className="flex justify-between text-2xs font-bold text-gray-555 mb-1">
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

                                  <div className="flex justify-between items-center text-2xs font-bold text-gray-555">
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
                            <p className="text-sm max-w-sm">Adjust your daily study parameters on the left and run the prediction model to forecast your academic results.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

            {rightTab === 'mock-exam' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {activeExam ? (
                  /* 1. ACTIVE MOCK TEST PANEL */
                  <div className="bg-white rounded-xl border border-gray-150 p-6 shadow-sm space-y-6">
                    <div className="flex justify-between items-center pb-4 border-b border-gray-100 flex-wrap gap-2">
                      <div>
                        <span className="text-3xs font-extrabold uppercase bg-primary-100 text-primary-700 px-2 py-0.5 rounded">
                          {activeExam.subject}
                        </span>
                        <h3 className="text-lg font-bold text-gray-900 mt-1">{activeExam.title}</h3>
                        {activeExam.negative_marking && (
                          <span className="text-3xs text-danger-600 font-semibold bg-danger-50 border border-danger-100 px-2 py-0.5 rounded mt-1 inline-block">
                            ⚠ Negative marking active
                          </span>
                        )}
                      </div>
                      {/* Enhanced Live Timer */}
                      <div className={`flex flex-col items-end gap-1`}>
                        <div className={`flex items-center gap-2 font-mono font-black text-sm px-4 py-2 rounded-xl border-2 transition-all duration-500 ${
                          examTimeLeft <= 0
                            ? 'bg-gray-50 border-gray-200 text-gray-400'
                            : examTimeLeft < 5 * 60
                            ? 'bg-danger-50 border-danger-400 text-danger-700 animate-pulse shadow-danger-100 shadow-lg'
                            : examTimeLeft < 10 * 60
                            ? 'bg-warning-50 border-warning-300 text-warning-700'
                            : 'bg-success-50 border-success-200 text-success-700'
                        }`}>
                          <FaClock className={examTimeLeft < 5 * 60 ? 'animate-spin' : ''} />
                          <div className="flex flex-col items-center">
                            <span className="text-lg leading-none">
                              {Math.floor(examTimeLeft / 3600) > 0
                                ? `${Math.floor(examTimeLeft / 3600)}:${Math.floor((examTimeLeft % 3600) / 60).toString().padStart(2, '0')}:${(examTimeLeft % 60).toString().padStart(2, '0')}`
                                : `${Math.floor(examTimeLeft / 60)}:${(examTimeLeft % 60).toString().padStart(2, '0')}`
                              }
                            </span>
                            <span className="text-3xs font-semibold uppercase tracking-wider opacity-70">
                              {examTimeLeft < 5 * 60 ? '⚠ Hurry up!' : examTimeLeft < 10 * 60 ? 'Time running low' : 'Time Remaining'}
                            </span>
                          </div>
                        </div>
                        {/* Mini time progress */}
                        <div className="w-full min-w-[140px] bg-gray-100 rounded-full h-1">
                          <div
                            className={`h-1 rounded-full transition-all duration-1000 ${
                              examTimeLeft < 5 * 60 ? 'bg-danger-500' : examTimeLeft < 10 * 60 ? 'bg-warning-500' : 'bg-success-500'
                            }`}
                            style={{ width: `${Math.max(0, (examTimeLeft / (activeExam.duration_minutes * 60)) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-3xs font-bold text-gray-400">
                        <span>QUESTION {currentQuestionIndex + 1} OF {activeExamQuestions.length}</span>
                        <span>{Math.round(((currentQuestionIndex + 1) / activeExamQuestions.length) * 100)}% COMPLETE</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${((currentQuestionIndex + 1) / activeExamQuestions.length) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Current Question */}
                    <div className="p-4 bg-gray-50/50 rounded-xl border border-gray-150 space-y-4">
                      <div className="text-sm font-bold text-gray-805">
                        {activeExamQuestions[currentQuestionIndex].question_text}
                      </div>

                      {activeExamQuestions[currentQuestionIndex].image_url && (
                        <div className="max-w-md bg-white p-2 rounded-lg border border-gray-100">
                          <img
                            src={getImageUrl(activeExamQuestions[currentQuestionIndex].image_url)}
                            alt="Question aid"
                            className="max-h-56 w-auto object-contain rounded"
                          />
                        </div>
                      )}

                      {/* MCQ Choices */}
                      <div className="grid grid-cols-1 gap-2.5">
                        {[
                          { key: 'A', text: activeExamQuestions[currentQuestionIndex].option_a },
                          { key: 'B', text: activeExamQuestions[currentQuestionIndex].option_b },
                          { key: 'C', text: activeExamQuestions[currentQuestionIndex].option_c },
                          { key: 'D', text: activeExamQuestions[currentQuestionIndex].option_d }
                        ].map(opt => {
                          const isSelected = selectedAnswers[activeExamQuestions[currentQuestionIndex].id] === opt.key;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => {
                                setSelectedAnswers(prev => ({
                                  ...prev,
                                  [activeExamQuestions[currentQuestionIndex].id]: opt.key
                                }));
                              }}
                              className={`w-full p-3 rounded-lg border text-left text-xs font-semibold flex items-center gap-3 transition-all duration-150 ${
                                isSelected
                                  ? 'bg-primary-50 border-primary-300 text-primary-950 shadow-sm'
                                  : 'bg-white border-gray-150 text-gray-655 hover:bg-gray-50/50'
                              }`}
                            >
                              <span className={`h-5 w-5 rounded-full border flex items-center justify-center font-bold text-3xs ${
                                isSelected
                                  ? 'border-primary-500 bg-primary-500 text-white'
                                  : 'border-gray-300 text-gray-400'
                              }`}>
                                {opt.key}
                              </span>
                              <span>{opt.text}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Navigation Buttons */}
                    <div className="flex justify-between items-center pt-2">
                      <button
                        type="button"
                        disabled={currentQuestionIndex === 0}
                        onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                      >
                        [Previous]
                      </button>

                      <button
                        type="button"
                        onClick={handleSubmitMockExamManual}
                        disabled={submittingAttempt}
                        className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
                      >
                        {submittingAttempt ? 'Submitting...' : '[Submit Test]'}
                      </button>

                      <button
                        type="button"
                        disabled={currentQuestionIndex === activeExamQuestions.length - 1}
                        onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                      >
                        [Next]
                      </button>
                    </div>
                  </div>
                ) : attemptResult ? (
                  /* 2. AUTO-EVALUATION RESULT PAGE */
                  <div className="bg-white rounded-xl border border-gray-150 p-6 shadow-sm space-y-6 animate-in fade-in duration-300">
                    <div className="text-center space-y-2 border-b border-gray-100 pb-6">
                      <FaGraduationCap className="text-5xl text-primary-500 mx-auto" />
                      <h3 className="text-xl font-bold text-gray-900">Mock Test Result</h3>
                      <p className="text-xs text-gray-500">Student: {user?.firstName} {user?.lastName}</p>
                    </div>

                    {/* Result Stats Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-150">
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Score</span>
                        <p className="text-base font-black text-gray-800">{attemptResult.score} / {activeExam ? activeExam.total_marks : attemptResult.total_marks || 50}</p>
                      </div>
                      <div className="p-3 bg-gray-55/35 rounded-xl border border-gray-150">
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Percentage</span>
                        <p className="text-base font-black text-gray-800">{attemptResult.percentage}%</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-150">
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Grade</span>
                        <p className="text-base font-black text-gray-800">{attemptResult.grade}</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-150">
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Status</span>
                        <p className="mt-0.5">
                          <span className={`inline-flex px-2 py-0.5 rounded text-3xs font-extrabold uppercase ${
                            attemptResult.status === 'PASS'
                              ? 'bg-success-50 text-success-700 border border-success-100'
                              : 'bg-danger-50 text-danger-700 border border-danger-100'
                          }`}>
                            {attemptResult.status}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-150 flex justify-around text-xs font-semibold text-gray-700">
                      <div>Correct Answers: <span className="text-success-600 font-bold">{attemptResult.correct_answers_count}</span></div>
                      <div className="border-r border-gray-200 h-4 my-auto" />
                      <div>Wrong Answers: <span className="text-danger-600 font-bold">{attemptResult.wrong_answers_count}</span></div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAttemptResult(null);
                        }}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-colors"
                      >
                        [Back to List]
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLoadStudentMockReview(attemptResult.exam_id)}
                        className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
                      >
                        [Review Correct Answers]
                      </button>
                    </div>
                  </div>
                ) : showReview && reviewExamData ? (
                  /* 3. STUDENT REVIEW PAGE */
                  <div className="bg-white rounded-xl border border-gray-150 p-6 shadow-sm space-y-6">
                    <div className="flex justify-between items-center pb-4 border-b border-gray-100 flex-wrap gap-2">
                      <div>
                        <span className="text-3xs font-extrabold uppercase bg-primary-100 text-primary-700 px-2 py-0.5 rounded">
                          {reviewExamData.attempt.subject || 'Review'}
                        </span>
                        <h3 className="text-lg font-bold text-gray-900 mt-1">Mock Exam Review</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowReview(false);
                          setReviewExamData(null);
                        }}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-colors"
                      >
                        [Back to List]
                      </button>
                    </div>

                    {/* Review Analytics Summary */}
                    <div className="bg-gray-55/35 p-4 rounded-xl border border-gray-150 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                      <div>
                        <span className="text-4xs font-bold uppercase text-gray-400">Score</span>
                        <p className="text-base font-bold text-gray-800">
                          {parseFloat(reviewExamData.attempt.score).toFixed(1)} / {reviewExamData.questions.reduce((sum: number, q: any) => sum + q.question_marks, 0)}
                        </p>
                      </div>
                      <div>
                        <span className="text-4xs font-bold uppercase text-gray-400">Percentage</span>
                        <p className="text-base font-bold text-gray-800">{parseFloat(reviewExamData.attempt.percentage).toFixed(1)}%</p>
                      </div>
                      <div>
                        <span className="text-4xs font-bold uppercase text-gray-400">Grade / Status</span>
                        <p className="text-base font-bold text-gray-800">
                          {reviewExamData.attempt.grade} - 
                          <span className={`ml-1 text-xs font-black ${reviewExamData.attempt.status === 'PASS' ? 'text-success-600' : 'text-danger-600'}`}>
                            {reviewExamData.attempt.status}
                          </span>
                        </p>
                      </div>
                      <div>
                        <span className="text-4xs font-bold uppercase text-gray-400">Correct / Wrong</span>
                        <p className="text-base font-bold text-gray-850 text-xs mt-0.5">
                          <span className="text-success-600 font-bold">{reviewExamData.attempt.correct_answers_count} ✓</span> / <span className="text-danger-600 font-bold">{reviewExamData.attempt.wrong_answers_count} ✗</span>
                        </p>
                      </div>
                    </div>

                    {/* Questions Loop */}
                    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                      {reviewExamData.questions.map((q: any, idx: number) => {
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
                                  ✗ Incorrect {reviewExamData.attempt.negative_marking ? `(-${(0.25 * q.question_marks).toFixed(2)} Marks)` : '(0 Marks)'}
                                </span>
                              )}
                            </div>

                            <div className="pr-24">
                              <span className="text-xs font-black text-gray-400 mr-1.5">Q{idx + 1}.</span>
                              <span className="text-xs font-bold text-gray-800">{q.question_text}</span>
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
                                
                                let bgStyle = 'bg-gray-55/40 border-gray-150 text-gray-700';
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
                                      {isOptSelected && <span className="text-gray-500 font-semibold text-[10px] px-1 bg-white rounded shadow-3xs">My Selection</span>}
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
                ) : (
                  /* 4. LIST OF AVAILABLE MOCK TESTS */
                  <div className="bg-white rounded-xl border border-gray-150 p-6 shadow-sm space-y-6">
                    {/* Available Tests Header */}
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <FaGraduationCap className="text-primary-500" />
                        Mock Examinations
                      </h3>
                      <p className="text-gray-500 text-xs mt-0.5">
                        Attempt practice tests set by your teachers. Immediate auto-graded feedback is provided.
                      </p>
                    </div>

                    {studentMockExamsLoading ? (
                      <div className="py-12 flex justify-center">
                        <div className="h-8 w-8 rounded-full border-2 border-primary-200 border-t-primary-600 animate-spin" />
                      </div>
                    ) : studentMockExams.length === 0 ? (
                      <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                        <FaGraduationCap className="mx-auto text-3xl mb-2 text-gray-300" />
                        <p className="text-sm font-semibold">No mock tests assigned</p>
                        <p className="text-xs mt-1">Check back later for tests published by your teacher.</p>
                      </div>
                    ) : (() => {
                      const availableExams = studentMockExams.filter(item => item.attempt_id === null || item.attempt_id === undefined);
                      const pastExams = studentMockExams.filter(item => item.attempt_id !== null && item.attempt_id !== undefined);
                      return (
                        <div className="space-y-6">
                          {/* Available Tests */}
                          {availableExams.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-3">
                                <span className="text-2xs font-extrabold uppercase text-success-700 bg-success-50 border border-success-100 px-2 py-0.5 rounded-full">
                                  ● Available Tests
                                </span>
                                <span className="text-2xs text-gray-400">{availableExams.length} test{availableExams.length !== 1 ? 's' : ''} pending</span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {availableExams.map(item => (
                                  <div key={item.id} className="p-4 bg-white rounded-xl border border-success-100 shadow-2xs space-y-3 relative overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow">
                                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-success-400 to-primary-500" />

                                    <div className="flex justify-between items-start mb-1">
                                      <span className="text-3xs font-extrabold uppercase bg-primary-100 text-primary-700 px-2 py-0.5 rounded">
                                        {item.subject}
                                      </span>
                                      <span className="text-[10px] text-gray-450 font-bold uppercase">{item.duration_minutes} Mins</span>
                                    </div>

                                    <div>
                                      <h4 className="font-bold text-sm text-gray-800 line-clamp-1">{item.title}</h4>
                                      <p className="text-3xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                                        {item.description || 'No description provided.'}
                                      </p>
                                    </div>

                                    <div className="border-t border-gray-100 pt-3 flex flex-col gap-2">
                                      <div className="flex justify-between items-center text-4xs text-gray-400 font-bold uppercase">
                                        <span>Questions: {item.question_count}</span>
                                        <span>Total Marks: {item.total_marks}</span>
                                      </div>

                                      {item.negative_marking && (
                                        <div className="text-3xs text-danger-600 font-semibold bg-danger-50 border border-danger-100 px-2 py-1 rounded">
                                          ⚠ Negative marking enabled — wrong answers deduct marks
                                        </div>
                                      )}

                                      <div className="text-4xs text-warning-600 font-bold flex items-center gap-1">
                                        <FaClock className="text-warning-500" />
                                        <span>Due: {new Date(item.due_date).toLocaleString()}</span>
                                      </div>
                                      <div className="flex justify-end pt-1">
                                        <button
                                          type="button"
                                          onClick={() => handleStartMockExam(item.id)}
                                          className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-2xs font-bold transition-colors w-full text-center shadow-sm"
                                        >
                                          ▶ Start Test
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Past Examinations */}
                          {pastExams.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-3">
                                <span className="text-2xs font-extrabold uppercase text-gray-600 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
                                  ✓ Past Examinations
                                </span>
                                <span className="text-2xs text-gray-400">{pastExams.length} completed</span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {pastExams.map(item => (
                                  <div key={item.id} className="p-4 bg-white rounded-xl border border-gray-150 shadow-2xs space-y-3 relative overflow-hidden flex flex-col justify-between">
                                    <div className={`absolute top-0 left-0 w-full h-1 ${item.attempt_status === 'PASS' ? 'bg-success-400' : 'bg-danger-400'}`} />

                                    <div className="flex justify-between items-start mb-1">
                                      <span className="text-3xs font-extrabold uppercase bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                                        {item.subject}
                                      </span>
                                      <span className={`px-2 py-0.5 rounded text-3xs font-extrabold uppercase ${
                                        item.attempt_status === 'PASS'
                                          ? 'bg-success-100 text-success-800 border border-success-200'
                                          : 'bg-danger-100 text-danger-800 border border-danger-200'
                                      }`}>
                                        {item.attempt_status}
                                      </span>
                                    </div>

                                    <div>
                                      <h4 className="font-bold text-sm text-gray-700 line-clamp-1">{item.title}</h4>
                                      <p className="text-3xs text-gray-400 mt-1 line-clamp-1 leading-relaxed">
                                        {item.description || 'Practice MCQ Exam.'}
                                      </p>
                                    </div>

                                    <div className="border-t border-gray-100 pt-3 space-y-2">
                                      <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-150">
                                        <div className="flex items-center justify-between text-xs">
                                          <div>
                                            <span className="text-3xs font-bold text-gray-500 uppercase">Score</span>
                                            <p className="font-black text-gray-900 text-sm">{parseFloat(item.attempt_score).toFixed(1)} <span className="text-xs font-semibold text-gray-400">/ {item.total_marks}</span></p>
                                          </div>
                                          <div className="text-right">
                                            <span className="text-3xs font-bold text-gray-500 uppercase">Percentage</span>
                                            <p className={`font-black text-sm ${item.attempt_status === 'PASS' ? 'text-success-600' : 'text-danger-600'}`}>
                                              {parseFloat(item.attempt_percentage).toFixed(0)}%
                                            </p>
                                          </div>
                                        </div>
                                        {/* Score bar */}
                                        <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                                          <div
                                            className={`h-1.5 rounded-full transition-all ${item.attempt_status === 'PASS' ? 'bg-success-500' : 'bg-danger-500'}`}
                                            style={{ width: `${Math.min(100, parseFloat(item.attempt_percentage))}%` }}
                                          />
                                        </div>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => handleLoadStudentMockReview(item.id)}
                                        disabled={reviewLoading}
                                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-2xs font-bold transition-colors w-full text-center"
                                      >
                                        {reviewLoading ? 'Loading...' : '📋 Review Answers & Explanations'}
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {availableExams.length === 0 && pastExams.length === 0 && (
                            <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                              <FaGraduationCap className="mx-auto text-3xl mb-2 text-gray-300" />
                              <p className="text-sm font-semibold">All caught up!</p>
                              <p className="text-xs mt-1">No pending mock tests. Check back after your teacher publishes new ones.</p>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
              </motion.div>
            ) : null}
          </AnimatePresence>
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

            <form onSubmit={handleGradeSubmission} className="overflow-y-auto my-4 flex-1 space-y-4 pr-1">
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 text-xs text-gray-600 space-y-2">
                <p><span className="font-semibold text-gray-850">Submitted comments:</span> {gradingSubmission.comments || 'No comments'}</p>
                
                {gradingSubmission.files && gradingSubmission.files.length > 0 && (
                  <div>
                    <span className="font-semibold block mb-1.5 text-gray-850">Submitted files ({gradingSubmission.files.length}):</span>
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
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Marks Obtained (out of {assignmentDetail?.assignment.total_marks})
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  max={assignmentDetail?.assignment.total_marks}
                  value={gradingMarks}
                  onChange={(e) => setGradingMarks(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-primary-500 focus:outline-none bg-white text-gray-800"
                  placeholder="e.g. 18"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Feedback / Comments</label>
                <textarea
                  value={gradingFeedback}
                  onChange={(e) => setGradingFeedback(e.target.value)}
                  className="w-full rounded-lg border border-gray-250 p-3 text-xs focus:ring-1 focus:ring-primary-500 focus:outline-none bg-white text-gray-800"
                  rows={4}
                  placeholder="Provide feedback on ERD design, Normalization process, code formatting etc..."
                />
              </div>

              <div className="flex justify-end pt-4 border-t border-gray-250 gap-2">
                <button
                  type="button"
                  onClick={() => setShowGradingModal(false)}
                  className="px-4 py-2 text-gray-750 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={gradingSaving}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {gradingSaving ? 'Saving...' : 'Submit Grade'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssignmentsPage;
