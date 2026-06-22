import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  FaShieldAlt, 
  FaExclamationTriangle, 
  FaUserSecret,
  FaMapMarkerAlt,
  FaCamera,
  FaChartBar
} from 'react-icons/fa';
import { 
  BarChart,
  Bar,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';
import { securityApi } from '@api/securityApi';
import type { SpoofAttemptRecord } from '@api/securityApi';
import { useNotification } from '@contexts/NotificationContext';

interface SecurityEvent {
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

interface LoginLog {
  id: number;
  student_id: number;
  success: boolean;
  spoof_detected: boolean;
  spoof_confidence: number | null;
  challenge_passed: boolean | null;
  ip_address: string;
  device_info: string;
  timestamp: string;
  student?: {
    student_id: string;
    first_name: string;
    last_name: string;
  };
}

interface SpoofAttempt extends SpoofAttemptRecord {}

const SecurityDashboard: React.FC = () => {
  const { showError } = useNotification();
  
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  const [spoofAttempts, setSpoofAttempts] = useState<SpoofAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('events');
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  // STABILIZATION: Fetch security data with AbortController and resilient parallel fetching
  useEffect(() => {
    const abortController = new AbortController();

    const fetchData = async () => {
      try {
        setLoading(true);

        // STABILIZATION: Parallel fetch with allSettled — one failure doesn't block others
        const [eventsResult, logsResult, spoofResult] = await Promise.allSettled([
          securityApi.getSecurityEvents(20),
          securityApi.getLoginLogs(20),
          securityApi.getSpoofAttempts(20),
        ]);

        if (abortController.signal.aborted) return;

        if (eventsResult.status === 'fulfilled') {
          setSecurityEvents(eventsResult.value.data);
        } else {
          console.error('Security events fetch error:', eventsResult.reason);
        }

        if (logsResult.status === 'fulfilled') {
          setLoginLogs(logsResult.value.data);
        } else {
          console.error('Login logs fetch error:', logsResult.reason);
        }

        if (spoofResult.status === 'fulfilled') {
          setSpoofAttempts(spoofResult.value.data);
        } else {
          console.error('Spoof attempts fetch error:', spoofResult.reason);
        }
      } catch (error: any) {
        if (error?.name === 'CanceledError') return;
        console.error('Security data fetch error:', error);
        showError('Failed to load security dashboard data');
      } finally {
        if (!abortController.signal.aborted) setLoading(false);
      }
    };

    fetchData();

    // STABILIZATION: Loading timeout — auto-resolve after 15s
    const loadingTimeout = setTimeout(() => {
      setLoading(false);
    }, 15_000);

    return () => {
      abortController.abort();
      clearTimeout(loadingTimeout);
    };
  }, []);

  // Get event type icon
  const getEventTypeIcon = (type: string) => {
    switch (type) {
      case 'SPOOF_ATTEMPT':
        return <FaUserSecret className="text-red-500" />;
      case 'FACE_MISMATCH':
        return <FaCamera className="text-yellow-500" />;
      case 'GEOFENCE_VIOLATION':
        return <FaMapMarkerAlt className="text-blue-500" />;
      case 'MULTIPLE_LOGIN_ATTEMPTS':
        return <FaExclamationTriangle className="text-orange-500" />;
      default:
        return <FaShieldAlt className="text-gray-500" />;
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

  // Chart data
  const eventTypeData = [
    { name: 'Spoof Attempts', value: securityEvents.filter(e => e.event_type === 'SPOOF_ATTEMPT').length },
    { name: 'Face Mismatches', value: securityEvents.filter(e => e.event_type === 'FACE_MISMATCH').length },
    { name: 'Geo Violations', value: securityEvents.filter(e => e.event_type === 'GEOFENCE_VIOLATION').length },
    { name: 'Multiple Attempts', value: securityEvents.filter(e => e.event_type === 'MULTIPLE_LOGIN_ATTEMPTS').length },
  ];

  const severityData = [
    { name: 'Critical', count: securityEvents.filter(e => e.severity === 'critical').length },
    { name: 'High', count: securityEvents.filter(e => e.severity === 'high').length },
    { name: 'Medium', count: securityEvents.filter(e => e.severity === 'medium').length },
    { name: 'Low', count: securityEvents.filter(e => e.severity === 'low').length },
  ];

  const spoofAttemptsByDay = [
    { day: 'Mon', attempts: 3 },
    { day: 'Tue', attempts: 5 },
    { day: 'Wed', attempts: 2 },
    { day: 'Thu', attempts: 7 },
    { day: 'Fri', attempts: 4 },
    { day: 'Sat', attempts: 1 },
    { day: 'Sun', attempts: 2 },
  ];

  const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6'];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">Security Dashboard</h1>
          <p className="text-gray-600 mt-1">Monitor and analyze security events and threats</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <motion.div
            whileHover={{ y: -5 }}
            className="bg-white rounded-xl shadow p-6"
          >
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-red-100 text-red-600">
                <FaExclamationTriangle className="text-xl" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Security Events</p>
                <p className="text-2xl font-bold text-gray-900">{securityEvents.length}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            whileHover={{ y: -5 }}
            className="bg-white rounded-xl shadow p-6"
          >
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-orange-100 text-orange-600">
                <FaUserSecret className="text-xl" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Spoof Attempts</p>
                <p className="text-2xl font-bold text-gray-900">
                  {securityEvents.filter(e => e.event_type === 'SPOOF_ATTEMPT').length}
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            whileHover={{ y: -5 }}
            className="bg-white rounded-xl shadow p-6"
          >
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-blue-100 text-blue-600">
                <FaMapMarkerAlt className="text-xl" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Geo Violations</p>
                <p className="text-2xl font-bold text-gray-900">
                  {securityEvents.filter(e => e.event_type === 'GEOFENCE_VIOLATION').length}
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            whileHover={{ y: -5 }}
            className="bg-white rounded-xl shadow p-6"
          >
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-purple-100 text-purple-600">
                <FaShieldAlt className="text-xl" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">High Severity Events</p>
                <p className="text-2xl font-bold text-gray-900">
                  {securityEvents.filter(e => e.severity === 'high' || e.severity === 'critical').length}
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Security Events Distribution */}
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Security Events Distribution</h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={eventTypeData}
                    cx="50%"
                    cy="50%"
                    labelLine={true}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  >
                    {eventTypeData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Spoof Attempts Trend */}
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Spoof Attempts Trend (Last 7 Days)</h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={spoofAttemptsByDay}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="attempts" 
                    stroke="#ef4444" 
                    activeDot={{ r: 8 }} 
                    name="Spoof Attempts"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Events by Severity */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow p-6 lg:col-span-2"
          >
            <div className="flex items-center mb-4">
              <FaChartBar className="text-blue-500 mr-2 text-xl" />
              <h2 className="text-xl font-bold text-gray-900">Events by Severity</h2>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={severityData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                  <Legend />
                  <Bar dataKey="count" name="Number of Events" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow overflow-hidden mb-8">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex">
              <button
                onClick={() => setActiveTab('events')}
                className={`py-4 px-6 text-center border-b-2 font-medium text-sm ${
                  activeTab === 'events'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Security Events
              </button>
              <button
                onClick={() => setActiveTab('logins')}
                className={`py-4 px-6 text-center border-b-2 font-medium text-sm ${
                  activeTab === 'logins'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Login Attempts
              </button>
              <button
                onClick={() => setActiveTab('spoof')}
                className={`py-4 px-6 text-center border-b-2 font-medium text-sm ${
                  activeTab === 'spoof'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Spoof Attempts
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'events' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Recent Security Events</h3>
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
                            IP Address
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
                              ) : (
                                'Unknown'
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              <div className="flex items-center">
                                <div className="mr-2">
                                  {getEventTypeIcon(event.event_type)}
                                </div>
                                <span>{event.event_type.replace('_', ' ')}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {event.ip_address}
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
            )}

            {activeTab === 'logins' && (
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Login Attempts</h3>
                
                {loading ? (
                  <div className="py-12 text-center">
                    <svg className="animate-spin h-12 w-12 text-blue-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="mt-4 text-gray-600">Loading login attempts...</p>
                  </div>
                ) : loginLogs.length === 0 ? (
                  <div className="py-12 text-center">
                    <FaShieldAlt className="mx-auto text-4xl text-gray-300" />
                    <p className="mt-4 text-gray-600">No login attempts found.</p>
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
                            Success
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Spoof Detected
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            IP Address
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Device Info
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Timestamp
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {loginLogs.map((log) => (
                          <motion.tr 
                            key={log.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3 }}
                            className="hover:bg-gray-50"
                          >
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {log.student ? (
                                <div>
                                  <div className="font-medium">
                                    {log.student.first_name} {log.student.last_name}
                                  </div>
                                  <div className="text-gray-500 text-xs">
                                    {log.student.student_id}
                                  </div>
                                </div>
                              ) : (
                                'Unknown'
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {log.success ? (
                                <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                                  Success
                                </span>
                              ) : (
                                <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">
                                  Failed
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {log.spoof_detected ? (
                                <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">
                                  Yes
                                </span>
                              ) : (
                                <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                                  No
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {log.ip_address}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              <div className="max-w-xs truncate" title={log.device_info}>
                                {log.device_info}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {new Date(log.timestamp).toLocaleString()}
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'spoof' && (
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Spoof Attempts</h3>
                
                {loading ? (
                  <div className="py-12 text-center">
                    <svg className="animate-spin h-12 w-12 text-blue-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="mt-4 text-gray-600">Loading spoof attempts...</p>
                  </div>
                ) : spoofAttempts.length === 0 ? (
                  <div className="py-12 text-center">
                    <FaUserSecret className="mx-auto text-4xl text-gray-300" />
                    <p className="mt-4 text-gray-600">No spoof attempts found.</p>
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
                            Spoof Confidence
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Detection Type
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Timestamp
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {spoofAttempts.map((attempt) => (
                          <motion.tr 
                            key={attempt.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3 }}
                            className="hover:bg-gray-50"
                          >
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {attempt.student ? (
                                <div>
                                  <div className="font-medium">
                                    {attempt.student.first_name} {attempt.student.last_name}
                                  </div>
                                  <div className="text-gray-500 text-xs">
                                    {attempt.student.student_id}
                                  </div>
                                </div>
                              ) : (
                                'Unknown'
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              <div className="flex items-center">
                                <div className="w-24 bg-gray-200 rounded-full h-2 mr-2">
                                  <div 
                                    className="bg-red-600 h-2 rounded-full" 
                                    style={{ width: `${(attempt.spoof_confidence || 0) * 100}%` }}
                                  ></div>
                                </div>
                                <span>{(attempt.spoof_confidence || 0).toFixed(2)}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {attempt.detection_type}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {new Date(attempt.timestamp).toLocaleString()}
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default SecurityDashboard;