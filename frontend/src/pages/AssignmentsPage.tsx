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
  FaDownload
} from 'react-icons/fa';
import { assignmentApi, Assignment, SubmissionFile } from '@api/assignmentApi';
import { useNotification } from '@contexts/NotificationContext';

const AssignmentsPage: React.FC = () => {
  const { showError, showSuccess } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null);
  const [assignmentDetail, setAssignmentDetail] = useState<{
    assignment: Assignment;
    submission: any | null;
    files: SubmissionFile[];
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  
  // Submission Form State
  const [comments, setComments] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);

  // Fetch student assignments
  const fetchAssignments = async () => {
    try {
      setLoading(true);
      const response = await assignmentApi.getStudentAssignments();
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
    fetchAssignments();
  }, []);

  // Fetch specific assignment details
  const fetchAssignmentDetail = async (id: number) => {
    try {
      setDetailLoading(true);
      const response = await assignmentApi.getStudentAssignmentDetails(id);
      if (response.data.success) {
        setAssignmentDetail(response.data.data);
        // Pre-populate comments if a previous submission exists
        if (response.data.data.submission) {
          setComments(response.data.data.submission.comments || '');
        } else {
          setComments('');
        }
        setSelectedFiles([]);
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to load assignment details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSelectAssignment = (id: number) => {
    setSelectedAssignmentId(id);
    fetchAssignmentDetail(id);
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
          <span className="p-2 rounded-xl bg-gradient-to-tr from-primary-500 to-secondary-500 text-white shadow-md shadow-primary-500/20">
            <FaClipboardList className="text-2xl" />
          </span>
          Assignments Portal
        </h1>
        <p className="text-gray-500 text-sm mt-2">
          View assigned coursework, submit solutions, and track grades from your supervisor.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Side: Assignments List */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-xl border border-gray-150 p-4 shadow-sm">
            <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FaBook className="text-primary-500" />
              Assigned Work
            </h2>
            
            {loading ? (
              <div className="py-12 flex justify-center">
                <div className="h-6 w-6 rounded-full border-2 border-primary-200 border-t-primary-600 animate-spin" />
              </div>
            ) : assignments.length === 0 ? (
              <div className="text-center py-10 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                <FaInfoCircle className="mx-auto text-2xl mb-2 text-gray-300" />
                <p className="text-sm font-medium">No assignments found</p>
                <p className="text-xs text-gray-400 mt-1">You are up to date with all tasks!</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {assignments.map(item => {
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
                            Graded
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
                {/* Main Assignment card */}
                <div className="bg-white rounded-xl border border-gray-150 shadow-sm p-6 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary-500 to-secondary-500" />
                  
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-gray-100">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-primary-600">
                        {assignmentDetail.assignment.subject}
                      </span>
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

                  {/* Upload Settings Info */}
                  <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-x-6 gap-y-2 text-3xs font-semibold text-gray-400 uppercase tracking-wider">
                    <span>Max Size: {assignmentDetail.assignment.max_file_size_mb} MB</span>
                    <span>Allowed Types: {assignmentDetail.assignment.allowed_file_types?.split(',').join(', ')}</span>
                  </div>
                </div>

                {/* Submissions Section */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  {/* Submission Form (or details if already graded/submitted) */}
                  <div className="md:col-span-12">
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
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default AssignmentsPage;
