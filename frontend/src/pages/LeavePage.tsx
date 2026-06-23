import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  FaCalendarAlt, 
  FaPlaneDeparture, 
  FaNotesMedical, 
  FaUserFriends,
  FaPaperPlane,
  FaHistory,
  FaCheckCircle,
  FaTimesCircle,
  FaPaperclip
} from 'react-icons/fa';
import { leaveApi } from '@api/leaveApi';
import { useNotification } from '@contexts/NotificationContext';
import { websocketService } from '@services/websocketService';
import { ButtonWithIcon } from '@components/ui/ButtonWithIcon';

interface LeaveRequest {
  id: number;
  leave_type: 'vacation' | 'sick' | 'personal' | 'maternity' | 'paternity';
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approval_date: string | null;
  rejection_reason: string | null;
  created_at: string;
  student?: {
    student_id: string;
    first_name: string;
    last_name: string;
  };
  attachment_data?: string | null;
  attachment_name?: string | null;
}

interface LeaveStats {
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

const LeavePage: React.FC = () => {
  const { showError, showSuccess } = useNotification();
  
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [stats, setStats] = useState<LeaveStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<string | null>('total');
  const [now, setNow] = useState<Date>(new Date());
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitSuccess, setIsSubmitSuccess] = useState(false);
  
  const [formData, setFormData] = useState({
    leaveType: 'vacation',
    startDate: '',
    endDate: '',
    reason: '',
  });

  const [attachmentData, setAttachmentData] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<{ data: string; name: string } | null>(null);

  // Live countdown timer ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch leave data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [requestsResult, statsResult] = await Promise.allSettled([
        leaveApi.getMyRequests(50),
        leaveApi.getStats(),
      ]);

      if (requestsResult.status === 'fulfilled') {
        setRequests(requestsResult.value.data);
      } else {
        console.error('Leave requests fetch error:', requestsResult.reason);
      }

      if (statsResult.status === 'fulfilled') {
        setStats(statsResult.value.data);
      } else {
        console.error('Leave stats fetch error:', statsResult.reason);
      }
    } catch (error: any) {
      console.error('Leave data fetch error:', error);
      showError('Failed to load leave data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // WebSocket real-time updates subscription
    const handleRealtimeUpdate = (data: any) => {
      console.log('[LeavePage] WebSocket event received, re-fetching data...', data);
      leaveApi.getMyRequests(50).then(res => setRequests(res.data)).catch(console.error);
      leaveApi.getStats().then(res => setStats(res.data)).catch(console.error);
    };

    const unsubscribe = websocketService.onStatusChange((connected) => {
      if (connected) {
        leaveApi.getMyRequests(50).then(res => setRequests(res.data)).catch(console.error);
        leaveApi.getStats().then(res => setStats(res.data)).catch(console.error);
      }
    });

    websocketService.on('attendance_update', handleRealtimeUpdate);

    return () => {
      websocketService.off('attendance_update', handleRealtimeUpdate);
      unsubscribe();
    };
  }, []);

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  // Handle file attachment upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showError('File size must be less than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAttachmentData(reader.result as string);
      setAttachmentName(file.name);
      showSuccess('File attached successfully!');
    };
    reader.onerror = () => {
      showError('Failed to read file');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAttachment = () => {
    setAttachmentData(null);
    setAttachmentName(null);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (new Date(formData.endDate) < new Date(formData.startDate)) {
      showError('End date cannot be before start date');
      return;
    }
    
    try {
      setIsSubmitting(true);
      await leaveApi.submitRequest({
        leaveType: formData.leaveType,
        startDate: formData.startDate,
        endDate: formData.endDate,
        reason: formData.reason,
        attachmentData,
        attachmentName,
      });
      
      setIsSubmitting(false);
      setIsSubmitSuccess(true);
      showSuccess('Leave request submitted successfully!');
      
      // Auto-refresh stats and requests in the background
      fetchData();
      
      // Keep success state for 3 seconds before closing form
      setTimeout(() => {
        setIsSubmitSuccess(false);
        setShowRequestForm(false);
        handleRemoveAttachment();
        
        // Reset form
        setFormData({
          leaveType: 'vacation',
          startDate: '',
          endDate: '',
          reason: '',
        });
      }, 3000);
    } catch (error: any) {
      setIsSubmitting(false);
      console.error('Leave request submission error:', error);
      showError('Failed to submit leave request');
    }
  };

  // Handle cancel request
  const handleCancelRequest = async (id: number) => {
    try {
      await leaveApi.cancelRequest(id);
      showSuccess('Leave request cancelled successfully!');
      fetchData();
    } catch (error: any) {
      console.error('Cancel request error:', error);
      showError('Failed to cancel leave request');
    }
  };

  // Get leave type icon
  const getLeaveTypeIcon = (type: string) => {
    switch (type) {
      case 'vacation':
        return <FaPlaneDeparture className="text-teal-500" />;
      case 'sick':
        return <FaNotesMedical className="text-red-500" />;
      case 'personal':
        return <FaUserFriends className="text-green-500" />;
      case 'maternity':
        return <FaCalendarAlt className="text-pink-500" />;
      case 'paternity':
        return <FaCalendarAlt className="text-indigo-500" />;
      default:
        return <FaCalendarAlt className="text-gray-500" />;
    }
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800 font-semibold">Pending</span>;
      case 'approved':
        return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 font-semibold">Approved</span>;
      case 'rejected':
        return <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800 font-semibold">Rejected</span>;
      case 'cancelled':
        return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800 font-semibold">Cancelled</span>;
      default:
        return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800 font-semibold">{status}</span>;
    }
  };

  // Compute countdown timer text
  const getCountdownText = (request: LeaveRequest) => {
    const created = new Date(request.created_at);
    const end = new Date(request.end_date);
    // End time is target end date with same time as created_at
    end.setHours(created.getHours(), created.getMinutes(), created.getSeconds(), created.getMilliseconds());

    const diffMs = end.getTime() - now.getTime();
    if (diffMs <= 0) {
      return 'Completed';
    }

    const start = new Date(request.start_date);
    start.setHours(created.getHours(), created.getMinutes(), created.getSeconds(), created.getMilliseconds());
    if (now.getTime() < start.getTime()) {
      const diffToStart = start.getTime() - now.getTime();
      const days = Math.floor(diffToStart / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diffToStart % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diffToStart % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diffToStart % (1000 * 60)) / 1000);
      return `Starts in ${days}d ${hours}h ${mins}m ${secs}s`;
    }

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diffMs % (1000 * 60)) / 1000);

    return `${days}d ${hours}h ${mins}m ${secs}s remaining`;
  };

  // Filter requests based on selected metric
  const getFilteredRequests = () => {
    if (!selectedMetric) return requests;
    
    switch (selectedMetric) {
      case 'total':
        return requests;
      case 'approved':
        return requests.filter(r => r.status === 'approved');
      case 'pending':
        return requests.filter(r => r.status === 'pending');
      case 'rejected':
        return requests.filter(r => r.status === 'rejected');
      case 'vacation':
        return requests.filter(r => r.status === 'approved' && r.leave_type === 'vacation');
      case 'sick':
        return requests.filter(r => r.status === 'approved' && r.leave_type === 'sick');
      case 'personal':
        return requests.filter(r => r.status === 'approved' && r.leave_type === 'personal');
      case 'maternity':
        return requests.filter(r => r.status === 'approved' && r.leave_type === 'maternity');
      case 'paternity':
        return requests.filter(r => r.status === 'approved' && r.leave_type === 'paternity');
      default:
        return requests;
    }
  };

  const filteredRequests = getFilteredRequests();

  const metricCards = [
    {
      id: 'total',
      label: 'Total Requests',
      value: stats?.totalRequests || 0,
      icon: <FaCalendarAlt className="text-xl" />,
      colorClass: 'bg-blue-100 text-blue-600 border-blue-200',
      activeColorClass: 'ring-2 ring-blue-500 bg-blue-50/50 border-blue-500',
      description: 'Total leave requests submitted'
    },
    {
      id: 'approved',
      label: 'Approved',
      value: stats?.approved || 0,
      icon: <FaCheckCircle className="text-xl" />,
      colorClass: 'bg-green-100 text-green-600 border-green-200',
      activeColorClass: 'ring-2 ring-green-500 bg-green-50/50 border-green-500',
      description: 'Total approved leave requests'
    },
    {
      id: 'pending',
      label: 'Pending',
      value: stats?.pending || 0,
      icon: <FaHistory className="text-xl" />,
      colorClass: 'bg-yellow-100 text-yellow-600 border-yellow-200',
      activeColorClass: 'ring-2 ring-yellow-500 bg-yellow-50/50 border-yellow-500',
      description: 'Leave requests awaiting review'
    },
    {
      id: 'vacation',
      label: 'Vacation Days',
      value: stats?.vacationDaysUsed || 0,
      icon: <FaPlaneDeparture className="text-xl" />,
      colorClass: 'bg-teal-100 text-teal-600 border-teal-200',
      activeColorClass: 'ring-2 ring-teal-500 bg-teal-50/50 border-teal-500',
      description: 'Vacation leave days taken'
    },
    {
      id: 'sick',
      label: 'Sick Days',
      value: stats?.sickDaysUsed || 0,
      icon: <FaNotesMedical className="text-xl" />,
      colorClass: 'bg-red-100 text-red-600 border-red-200',
      activeColorClass: 'ring-2 ring-red-500 bg-red-50/50 border-red-500',
      description: 'Sick leave days taken'
    },
    {
      id: 'personal',
      label: 'Personal Leave',
      value: stats?.personalDaysUsed || 0,
      icon: <FaUserFriends className="text-xl" />,
      colorClass: 'bg-green-100 text-green-600 border-green-200',
      activeColorClass: 'ring-2 ring-green-500 bg-green-50/50 border-green-500',
      description: 'Personal leave days taken'
    },
    {
      id: 'maternity',
      label: 'Maternity Leave',
      value: stats?.maternityDaysUsed || 0,
      icon: <FaCalendarAlt className="text-xl" />,
      colorClass: 'bg-pink-100 text-pink-600 border-pink-200',
      activeColorClass: 'ring-2 ring-pink-500 bg-pink-50/50 border-pink-500',
      description: 'Maternity leave days taken'
    },
    {
      id: 'paternity',
      label: 'Paternity Leave',
      value: stats?.paternityDaysUsed || 0,
      icon: <FaCalendarAlt className="text-xl" />,
      colorClass: 'bg-indigo-100 text-indigo-600 border-indigo-200',
      activeColorClass: 'ring-2 ring-indigo-500 bg-indigo-50/50 border-indigo-500',
      description: 'Paternity leave days taken'
    },
    {
      id: 'rejected',
      label: 'Rejected Leave',
      value: stats?.rejected || 0,
      icon: <FaTimesCircle className="text-xl" />,
      colorClass: 'bg-red-100 text-red-600 border-red-200',
      activeColorClass: 'ring-2 ring-red-500 bg-red-50/50 border-red-500',
      description: 'Total rejected leave requests'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Leave Management</h1>
            <p className="text-gray-600 mt-1">Request and manage your leave</p>
          </div>
          <ButtonWithIcon
            onClick={() => setShowRequestForm(!showRequestForm)}
            text="REQUEST LEAVE"
            icon={<FaPaperPlane className="transition-transform duration-300 group-hover:scale-110" />}
          />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Interactive Stats Cards */}
        {stats && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Interactive Live Dashboard</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {metricCards.map((card) => {
                const isActive = selectedMetric === card.id;
                return (
                  <motion.div
                    key={card.id}
                    whileHover={{ y: -4, scale: 1.01 }}
                    onClick={() => setSelectedMetric(isActive ? null : card.id)}
                    className={`bg-white rounded-xl shadow-sm p-5 border cursor-pointer transition-all duration-200 ${
                      isActive ? card.activeColorClass : 'border-gray-200 hover:shadow-md hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className={`p-2.5 rounded-lg ${card.colorClass}`}>
                        {card.icon}
                      </div>
                      <span className="text-xs text-gray-400 font-medium select-none">
                        {isActive ? 'Selected' : 'Click to inspect'}
                      </span>
                    </div>
                    <div className="mt-4">
                      <p className="text-sm font-semibold text-gray-500 truncate">{card.label}</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
                      <p className="text-xs text-gray-400 mt-1 truncate">{card.description}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Request Form */}
        {showRequestForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8"
          >
            <h2 className="text-xl font-bold text-gray-900 mb-4">Request New Leave</h2>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="leaveType" className="block text-sm font-medium text-gray-700 mb-1">
                    Leave Type
                  </label>
                  <select
                    id="leaveType"
                    name="leaveType"
                    value={formData.leaveType}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="vacation">Vacation</option>
                    <option value="sick">Sick Leave</option>
                    <option value="personal">Personal Leave</option>
                    <option value="maternity">Maternity Leave</option>
                    <option value="paternity">Paternity Leave</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      id="startDate"
                      name="startDate"
                      value={formData.startDate}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
                      End Date
                    </label>
                    <input
                      type="date"
                      id="endDate"
                      name="endDate"
                      value={formData.endDate}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-1">
                    Reason
                  </label>
                  <textarea
                    id="reason"
                    name="reason"
                    value={formData.reason}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Provide a detailed reason for leave, or attach an application document below..."
                    required
                  />
                </div>

                {/* File Attachment Upload */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Attach Application / Application Hardcopy (Scanned PDF or Image, optional)
                  </label>
                  <div className="mt-1 flex items-center space-x-4">
                    <label className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer transition-colors">
                      <FaPaperclip className="mr-2 text-gray-400" />
                      <span>{attachmentName ? 'Change File' : 'Upload application (PDF/Image)'}</span>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={handleFileChange}
                        className="sr-only"
                      />
                    </label>
                    {attachmentName && (
                      <div className="flex items-center space-x-2 text-sm text-gray-600 bg-gray-50 px-3 py-1.5 rounded border border-gray-200">
                        <span className="truncate max-w-xs">{attachmentName}</span>
                        <button
                          type="button"
                          onClick={handleRemoveAttachment}
                          className="text-red-500 hover:text-red-700 font-bold focus:outline-none"
                        >
                          &times;
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Supports PDF, PNG, JPEG, JPG, and GIF files up to 5MB.</p>
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowRequestForm(false);
                    handleRemoveAttachment();
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <ButtonWithIcon
                  type="submit"
                  text="SUBMIT REQUEST"
                  loading={isSubmitting}
                  success={isSubmitSuccess}
                  icon={<FaPaperPlane className="transition-transform duration-300 group-hover:scale-110" />}
                />
              </div>
            </form>
          </motion.div>
        )}

        {/* Leave Requests Table & Detail Display */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {selectedMetric ? `Leave Details: ${metricCards.find(c => c.id === selectedMetric)?.label}` : 'All Leave Requests'}
              </h2>
              <p className="text-gray-500 text-xs mt-1">Real-time database sync is active.</p>
            </div>
            {selectedMetric && (
              <button
                onClick={() => setSelectedMetric(null)}
                className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors"
              >
                Clear Filter
              </button>
            )}
          </div>
          
          {loading ? (
            <div className="py-12 text-center">
              <svg className="animate-spin h-12 w-12 text-blue-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="mt-4 text-gray-600">Syncing with database...</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="py-12 text-center">
              <FaCalendarAlt className="mx-auto text-4xl text-gray-300" />
              <p className="mt-4 text-gray-600">No requests found matching this category.</p>
              <div className="flex justify-center">
                <ButtonWithIcon
                  onClick={() => setShowRequestForm(true)}
                  text="REQUEST LEAVE"
                  icon={<FaCalendarAlt className="transition-transform duration-300 group-hover:scale-110" />}
                  className="mt-4"
                />
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Dates & Period
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Days
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Reason & Attachments
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status / Countdown
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Submitted At
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredRequests.map((request) => (
                    <motion.tr 
                      key={request.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2 }}
                      className="hover:bg-gray-50/70"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                        <div className="flex items-center">
                          <div className="mr-2">
                            {getLeaveTypeIcon(request.leave_type)}
                          </div>
                          <span className="capitalize">{request.leave_type}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div>
                          {new Date(request.start_date).toLocaleDateString()} - {new Date(request.end_date).toLocaleDateString()}
                        </div>
                        {request.status === 'approved' && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            Active period: {new Date(request.start_date).toLocaleDateString()} to {new Date(request.end_date).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">
                        {request.total_days} {request.total_days === 1 ? 'day' : 'days'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="max-w-xs truncate" title={request.reason}>
                          {request.reason}
                        </div>
                        {request.attachment_data && (
                          <button
                            onClick={() => setPreviewAttachment({ data: request.attachment_data!, name: request.attachment_name || 'Attachment' })}
                            className="mt-1 flex items-center text-xs text-blue-600 hover:text-blue-800 font-semibold"
                          >
                            <FaPaperclip className="mr-1 text-2xs" /> View Attached Application
                          </button>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="flex flex-col space-y-1">
                          <div>{getStatusBadge(request.status)}</div>
                          {request.status === 'approved' && (
                            <div className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 inline-block w-fit">
                              ⏱️ {getCountdownText(request)}
                            </div>
                          )}
                          {request.status === 'rejected' && request.rejection_reason && (
                            <div className="text-xs text-red-600 font-medium bg-red-50 px-2 py-1 rounded border border-red-100 mt-1 max-w-xs" title={request.rejection_reason}>
                              Reason: {request.rejection_reason}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(request.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {request.status === 'pending' && (
                          <button
                            onClick={() => handleCancelRequest(request.id)}
                            className="text-red-600 hover:text-red-900 font-semibold transition-colors"
                          >
                            Cancel
                          </button>
                        )}
                        {request.status === 'approved' && (
                          <span className="text-xs text-green-600 font-semibold">Accepted</span>
                        )}
                        {request.status === 'rejected' && (
                          <span className="text-xs text-red-600 font-semibold">Rejected</span>
                        )}
                        {request.status === 'cancelled' && (
                          <span className="text-xs text-gray-400 font-semibold">Cancelled</span>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Attachment Preview Modal */}
      {previewAttachment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
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
    </div>
  );
};

export default LeavePage;