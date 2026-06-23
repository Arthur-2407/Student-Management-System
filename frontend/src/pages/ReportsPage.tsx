import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FaChartBar, 
  FaChartLine, 
  FaChartPie,
  FaFilePdf,
  FaFileExcel
} from 'react-icons/fa';
import * as Recharts from 'recharts';
const BarChart = Recharts.BarChart as any;
const Bar = Recharts.Bar as any;
const XAxis = Recharts.XAxis as any;
const YAxis = Recharts.YAxis as any;
const CartesianGrid = Recharts.CartesianGrid as any;
const Tooltip = Recharts.Tooltip as any;
const Legend = Recharts.Legend as any;
const ResponsiveContainer = Recharts.ResponsiveContainer as any;
const LineChart = Recharts.LineChart as any;
const Line = Recharts.Line as any;
const PieChart = Recharts.PieChart as any;
const Pie = Recharts.Pie as any;
const Cell = Recharts.Cell as any;
import { reportsApi } from '@api/reportsApi';
import api from '@services/api';
import { useNotification } from '@contexts/NotificationContext';
import { useAuth } from '@contexts/AuthContext';
import { websocketService } from '@services/websocketService';

interface LeaveStats {
  totalRequests: number;
  approved: number;
  pending: number;
  rejected: number;
  vacationDaysUsed: number;
  sickDaysUsed: number;
}

interface DepartmentData {
  department: string;
  students: number;
  attendanceRate: number;
}

const ReportsPage: React.FC = () => {
  const { showError, showSuccess } = useNotification();
  const { user } = useAuth();
  
  const [leaveStats, setLeaveStats] = useState<LeaveStats | null>(null);
  const [departmentData, setDepartmentData] = useState<DepartmentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  
  // Real-time detailed attendance records
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<string | null>('total');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Managed student list for Weekly chart and Detailed Reports selector
  const [managedStudents, setManagedStudents] = useState<any[]>([]);

  // For Detailed Reports — target student for per-person PDF/Excel download (admin/teacher only)
  const [detailedReportTargetStudent, setDetailedReportTargetStudent] = useState<string>('');
  
  // Helper to generate the past 6 months dynamically
  const getMonthsList = () => {
    const list = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      list.push({ value: `${year}-${month}`, label });
    }
    return list;
  };

  // Divide a given month ("YYYY-MM") into weeks:
  // Week 1: Days 1 - 7
  // Week 2: Days 8 - 14
  // Week 3: Days 15 - 21
  // Week 4: Days 22 - 28
  // Week 5: Days 29 - End of Month
  const getWeeksOfMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate(); // month is 1-indexed for the 0th day of next month

    const weeks = [];
    let start = 1;
    let index = 1;
    
    while (start <= lastDay) {
      const end = Math.min(start + 6, lastDay);
      weeks.push({
        index,
        label: `Week ${index} (${start}-${end})`,
        startDate: `${year}-${String(month).padStart(2, '0')}-${String(start).padStart(2, '0')}`,
        endDate: `${year}-${String(month).padStart(2, '0')}-${String(end).padStart(2, '0')}`
      });
      start += 7;
      index++;
    }
    return weeks;
  };

  const getWeekDates = (monthStr: string, weekIndex: number) => {
    const weeks = getWeeksOfMonth(monthStr);
    const activeWeek = weeks.find(w => w.index === weekIndex) || weeks[0];
    
    const [year, month, startDay] = activeWeek.startDate.split('-').map(Number);
    const endDay = parseInt(activeWeek.endDate.split('-')[2], 10);
    
    const dates = [];
    for (let d = startDay; d <= endDay; d++) {
      const dateObj = new Date(year, month - 1, d);
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const weekdayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
      const dayLabel = dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
      
      dates.push({
        dateStr,
        weekdayName,
        dayLabel,
        dayNum: d
      });
    }
    return dates;
  };

  const getCurrentWeekIndex = () => {
    const today = new Date().getDate();
    if (today <= 7) return 1;
    if (today <= 14) return 2;
    if (today <= 21) return 3;
    if (today <= 28) return 4;
    return 5;
  };

  const monthsList = getMonthsList();
  const [weeklySelectedMonth, setWeeklySelectedMonth] = useState<string>(monthsList[0].value);
  const [weeklySelectedWeek, setWeeklySelectedWeek] = useState<number>(getCurrentWeekIndex());
  const [weeklySelectedStudent, setWeeklySelectedStudent] = useState<string>('');
  const [weeklyStudents, setWeeklyStudents] = useState<any[]>([]);
  const [weeklyAttendanceLogs, setWeeklyAttendanceLogs] = useState<any[]>([]);
  const [weeklyLoading, setWeeklyLoading] = useState<boolean>(false);

  // Fetch managed students list from backend (real-time, role-scoped)
  useEffect(() => {
    const fetchManagedStudents = async () => {
      try {
        const response = await reportsApi.getManagedStudents();
        const list = response.data.data || [];
        setManagedStudents(list);
        setWeeklyStudents(list);

        // Set initial student selection
        if (!weeklySelectedStudent) {
          if (user?.role === 'student') {
            // Student always sees their own data
            setWeeklySelectedStudent(user.studentId);
          } else if (list.length > 0) {
            // Admin/teacher: default to first in list (or themselves)
            const selfEntry = list.find((e: any) => e.student_id === user?.studentId);
            setWeeklySelectedStudent(selfEntry ? selfEntry.student_id : list[0].student_id);
          } else if (user) {
            setWeeklySelectedStudent(user.studentId);
          }
        }
      } catch (err) {
        console.error('Failed to fetch managed students:', err);
        // Fallback to just the logged-in user
        if (user) {
          const selfEntry = [{ student_id: user.studentId, first_name: user.firstName || 'Me', last_name: user.lastName || '', role: user.role }];
          setWeeklyStudents(selfEntry);
          setManagedStudents(selfEntry);
          if (!weeklySelectedStudent) setWeeklySelectedStudent(user.studentId);
        }
      }
    };

    if (user) fetchManagedStudents();
  }, [user]);

  // Fetch raw logs for the selected student and week
  useEffect(() => {
    const abortController = new AbortController();
    
    const fetchWeeklyAttendance = async () => {
      if (!weeklySelectedStudent) return;
      
      try {
        setWeeklyLoading(true);
        const weeks = getWeeksOfMonth(weeklySelectedMonth);
        const activeWeek = weeks.find(w => w.index === weeklySelectedWeek) || weeks[0];
        
        const response = await reportsApi.getAttendanceReport({
          startDate: activeWeek.startDate,
          endDate: activeWeek.endDate,
          studentId: weeklySelectedStudent,
          limit: 100
        });
        
        if (abortController.signal.aborted) return;
        setWeeklyAttendanceLogs(response.data.data || []);
      } catch (err) {
        console.error('Failed to fetch weekly attendance logs:', err);
      } finally {
        if (!abortController.signal.aborted) setWeeklyLoading(false);
      }
    };
    
    fetchWeeklyAttendance();
    
    return () => {
      abortController.abort();
    };
  }, [weeklySelectedMonth, weeklySelectedWeek, weeklySelectedStudent, refreshTrigger]);

  const toLocalISOString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getDateRange = (period: string) => {
    const end = new Date();
    let days = 30;
    if (period === 'week') days = 7;
    else if (period === 'quarter') days = 90;
    else if (period === 'year') days = 365;
    
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    return {
      startDate: toLocalISOString(start),
      endDate: toLocalISOString(end)
    };
  };

  // Fetch report data
  useEffect(() => {
    const abortController = new AbortController();

    const fetchData = async () => {
      try {
        setLoading(true);
        const range = getDateRange(selectedPeriod);
        
        const [reportsResult, attendanceResult] = await Promise.allSettled([
          reportsApi.getReports(selectedPeriod),
          reportsApi.getAttendanceReport({
            startDate: range.startDate,
            endDate: range.endDate,
            limit: 1000
          })
        ]);

        if (abortController.signal.aborted) return;

        if (reportsResult.status === 'fulfilled') {
          setLeaveStats(reportsResult.value.data.leave);
          setDepartmentData(reportsResult.value.data.departments || []);
        } else {
          console.error('Reports fetch error:', reportsResult.reason);
        }

        if (attendanceResult.status === 'fulfilled') {
          setAttendanceRecords(attendanceResult.value.data.data || []);
        } else {
          console.error('Attendance report fetch error:', attendanceResult.reason);
        }
      } catch (error: any) {
        if (error?.name === 'CanceledError') return;
        console.error('Report data fetch error:', error);
        showError('Failed to load report data');
      } finally {
        if (!abortController.signal.aborted) setLoading(false);
      }
    };
    
    fetchData();

    return () => {
      abortController.abort();
    };
  }, [selectedPeriod, refreshTrigger]);

  // Real-time synchronization via WebSockets — attendance AND leave events
  useEffect(() => {
    const handleUpdate = (data: any) => {
      console.log('[ReportsPage] Real-time websocket update received:', data);
      setRefreshTrigger(prev => prev + 1);
    };

    websocketService.on('attendance_update', handleUpdate);
    websocketService.on('system_notification', handleUpdate);
    websocketService.on('leave_request_update', handleUpdate);
    websocketService.on('leave_approved', handleUpdate);
    websocketService.on('leave_rejected', handleUpdate);

    return () => {
      websocketService.off('attendance_update', handleUpdate);
      websocketService.off('system_notification', handleUpdate);
      websocketService.off('leave_request_update', handleUpdate);
      websocketService.off('leave_approved', handleUpdate);
      websocketService.off('leave_rejected', handleUpdate);
    };
  }, []);

  // STABILIZATION: Loading timeout — auto-resolve after 15s
  useEffect(() => {
    const loadingTimeout = setTimeout(() => {
      setLoading(false);
    }, 15_000);
    return () => clearTimeout(loadingTimeout);
  }, [selectedPeriod]);

  // Helper to generate a PDF report in a new tab using print styles
  const generatePDFReport = async (range: { startDate: string; endDate: string }, type: string) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showError('Pop-up blocked! Please allow pop-ups for this website to print reports.');
      return;
    }

    let reportTitle = 'Attendance Analytics Report';
    let contentHtml = '';

    try {
      if (type === 'attendance') {
        reportTitle = 'Attendance Analytics Report';
        contentHtml = `
          <div class="cards">
            <div class="card">
              <div class="card-label">Total Check-ins & Check-outs</div>
              <div class="card-value">I: ${totalCheckins} | O: ${totalCheckouts}</div>
              <div class="card-desc">Total completed attendance cycles</div>
            </div>
            <div class="card">
              <div class="card-label">Avg. Hours/Day</div>
              <div class="card-value">${avgHoursPerDay.toFixed(2)}h</div>
              <div class="card-desc">Capped shift duration average</div>
            </div>
            <div class="card">
              <div class="card-label">Geo Compliance</div>
              <div class="card-value">${Math.round(geoComplianceRate)}%</div>
              <div class="card-desc">Attendance within geofence limits</div>
            </div>
            <div class="card">
              <div class="card-label">Late Arrivals & Early Leave</div>
              <div class="card-value">${lateOrEarlyCount}</div>
              <div class="card-desc">Total exceptions flag counts</div>
            </div>
          </div>
          <h2>Detailed Attendance Logs</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Student</th>
                <th>Assigned Shift</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Hours</th>
                <th>Compliance</th>
                <th>Exceptions</th>
              </tr>
            </thead>
            <tbody>
              ${attendanceRecords.map(r => {
                const hours = calculateWorkingHours(r);
                const compliant = isGeoCompliant(r);
                const { isLate, isEarly } = checkLateOrEarly(r);
                
                const exceptionsList = [];
                if (isLate) exceptionsList.push('Late Arrival');
                if (isEarly) exceptionsList.push('Early Leave');
                const exceptionsText = exceptionsList.join(', ') || 'None';

                return `
                  <tr>
                    <td>${new Date(r.check_in_time).toLocaleDateString()}</td>
                    <td>${r.first_name ? `${r.first_name} ${r.last_name} (${r.student_id})` : `User (${r.student_id})`}</td>
                    <td>${formatTime(r.work_start_time)} - ${formatTime(r.work_end_time)}</td>
                    <td>${formatTime(r.check_in_time)}</td>
                    <td>${r.check_out_time ? formatTime(r.check_out_time) : '—'}</td>
                    <td><strong>${hours.toFixed(2)}h</strong></td>
                    <td>
                      <span class="badge ${compliant ? 'badge-success' : 'badge-danger'}">
                        ${compliant ? 'Compliant' : 'Non-Compliant'}
                      </span>
                    </td>
                    <td>
                      ${isLate || isEarly ? `
                        <span class="badge ${isLate ? 'badge-warning' : 'badge-danger'}">
                          ${exceptionsText}
                        </span>
                      ` : '<span class="badge badge-success">On Time</span>'}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `;
      } else if (type === 'leave') {
        reportTitle = 'Leave Usage Report';
        const response = await api.get('/excel/leave', {
          params: { start_date: range.startDate, end_date: range.endDate },
          headers: { 'Accept': 'application/json' }
        });
        const leavesList = response.data.data || [];

        contentHtml = `
          <div class="cards" style="grid-template-columns: repeat(3, 1fr);">
            <div class="card">
              <div class="card-label">Total Requests</div>
              <div class="card-value">${leaveStats?.totalRequests || 0}</div>
              <div class="card-desc">Total submitted leave requests</div>
            </div>
            <div class="card">
              <div class="card-label">Approved Requests</div>
              <div class="card-value">${leaveStats?.approved || 0}</div>
              <div class="card-desc">Approved and closed requests</div>
            </div>
            <div class="card">
              <div class="card-label">Pending Requests</div>
              <div class="card-value">${leaveStats?.pending || 0}</div>
              <div class="card-desc">Requests currently under review</div>
            </div>
          </div>
          <h2>Leave Request Logs</h2>
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Leave Type</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Total Days</th>
                <th>Status</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              ${leavesList.map((r: any) => `
                <tr>
                  <td>${r.first_name} ${r.last_name} (${r.student_id})</td>
                  <td style="text-transform: capitalize;">${r.leave_type}</td>
                  <td>${String(r.start_date).split('T')[0]}</td>
                  <td>${String(r.end_date).split('T')[0]}</td>
                  <td><strong>${r.total_days} days</strong></td>
                  <td>
                    <span class="badge ${r.status === 'approved' ? 'badge-success' : r.status === 'pending' ? 'badge-warning' : 'badge-danger'}">
                      ${r.status}
                    </span>
                  </td>
                  <td>${r.reason || '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      } else if (type === 'security') {
        reportTitle = 'Security Incident Report';
        const response = await api.get('/excel/security-events', {
          params: { start_date: range.startDate, end_date: range.endDate },
          headers: { 'Accept': 'application/json' }
        });
        const eventsList = response.data.data || [];

        contentHtml = `
          <h2>Security Incident Logs</h2>
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Event Type</th>
                <th>Severity</th>
                <th>Student</th>
                <th>IP Address</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              ${eventsList.map((r: any) => `
                <tr>
                  <td>${new Date(r.created_at).toLocaleString()}</td>
                  <td><strong>${r.event_type}</strong></td>
                  <td>
                    <span class="badge ${r.severity === 'critical' || r.severity === 'high' ? 'badge-danger' : r.severity === 'medium' ? 'badge-warning' : 'badge-success'}">
                      ${r.severity}
                    </span>
                  </td>
                  <td>${r.first_name ? `${r.first_name} ${r.last_name} (${r.student_id})` : 'System'}</td>
                  <td>${r.ip_address || '—'}</td>
                  <td>${typeof r.details === 'object' ? JSON.stringify(r.details) : r.details}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      } else if (type === 'performance') {
        reportTitle = 'Performance Analytics Report';
        const response = await api.get('/reports/performance', {
          params: { startDate: range.startDate, endDate: range.endDate, limit: 1000 },
          headers: { 'Accept': 'application/json' }
        });
        const performanceList = response.data.data || [];

        contentHtml = `
          <h2>Student Performance Metrics</h2>
          <table>
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Name</th>
                <th>Department</th>
                <th>Position</th>
                <th>Total Check-ins</th>
                <th>Avg. Hours/Day</th>
                <th>Late Arrivals</th>
              </tr>
            </thead>
            <tbody>
              ${performanceList.map((r: any) => `
                <tr>
                  <td>${r.student_id}</td>
                  <td>${r.first_name} ${r.last_name}</td>
                  <td>${r.department || 'Unassigned'}</td>
                  <td>${r.position || '—'}</td>
                  <td><strong>${r.total_checkins}</strong></td>
                  <td><strong>${Number(r.avg_hours).toFixed(2)}h</strong></td>
                  <td>
                    <span class="badge ${r.late_count > 0 ? 'badge-warning' : 'badge-success'}">
                      ${r.late_count} late
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }

      const htmlContent = `
        <html>
          <head>
            <title>${reportTitle}</title>
            <style>
              body {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                color: #1f2937;
                padding: 40px;
                margin: 0;
              }
              .header {
                border-bottom: 2px solid #e5e7eb;
                padding-bottom: 20px;
                margin-bottom: 30px;
              }
              .header h1 {
                font-size: 24px;
                margin: 0 0 5px 0;
                color: #111827;
              }
              .header p {
                font-size: 14px;
                color: #6b7280;
                margin: 0;
              }
              .meta-info {
                display: flex;
                justify-content: space-between;
                font-size: 12px;
                color: #4b5563;
                margin-bottom: 30px;
                background: #f9fafb;
                padding: 12px 16px;
                border-radius: 8px;
              }
              .cards {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 20px;
                margin-bottom: 40px;
              }
              .card {
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                padding: 16px;
                background: #ffffff;
              }
              .card-label {
                font-size: 11px;
                font-weight: 600;
                color: #6b7280;
                text-transform: uppercase;
                margin-bottom: 4px;
              }
              .card-value {
                font-size: 18px;
                font-weight: 700;
                color: #111827;
              }
              .card-desc {
                font-size: 10px;
                color: #9ca3af;
                margin-top: 4px;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 20px;
                font-size: 12px;
              }
              th {
                background-color: #f3f4f6;
                color: #374151;
                font-weight: 600;
                text-align: left;
                padding: 10px 12px;
                border-bottom: 1px solid #e5e7eb;
              }
              td {
                padding: 10px 12px;
                border-bottom: 1px solid #f3f4f6;
              }
              tr:nth-child(even) td {
                background-color: #f9fafb;
              }
              .badge {
                display: inline-block;
                padding: 2px 6px;
                border-radius: 9999px;
                font-size: 10px;
                font-weight: 600;
              }
              .badge-success { background: #d1fae5; color: #065f46; }
              .badge-danger { background: #fee2e2; color: #991b1b; }
              .badge-warning { background: #fef3c7; color: #92400e; }
              .badge-info { background: #dbeafe; color: #1e40af; }
              @media print {
                body { padding: 20px; }
                button { display: none; }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>${reportTitle}</h1>
              <p>Student Management System</p>
            </div>
            <div class="meta-info">
              <div><strong>Report Period:</strong> ${range.startDate} to ${range.endDate}</div>
              <div><strong>Generated At:</strong> ${new Date().toLocaleString()}</div>
            </div>
            ${contentHtml}
            <script>
              window.onload = function() {
                window.print();
              };
            </script>
          </body>
        </html>
      `;

      printWindow.document.write(htmlContent);
      printWindow.document.close();
    } catch (e: any) {
      console.error('PDF generation failed:', e);
      showError('Failed to generate PDF report data');
      printWindow.close();
    }
  };

  // Handle export — supports optional targetStudentId for per-student reports (admin/teacher)
  const handleExport = async (format: string, type: string = 'attendance', targetStudentId?: string) => {
    try {
      const studentLabel = targetStudentId
        ? (() => {
            const emp = managedStudents.find((e: any) => e.student_id === targetStudentId);
            return emp ? `${emp.first_name} ${emp.last_name}` : targetStudentId;
          })()
        : 'All';
      showSuccess(`Generating ${format.toUpperCase()} report for ${studentLabel}...`);
      const range = getDateRange(selectedPeriod);

      if (format === 'excel') {
        let response;
        const empSuffix = targetStudentId ? `-${targetStudentId}` : '';
        let filename = `${type}-report${empSuffix}-${range.startDate}-to-${range.endDate}.xlsx`;
        
        if (type === 'attendance') {
          response = await reportsApi.downloadAttendanceExcel({
            startDate: range.startDate,
            endDate: range.endDate,
            studentId: targetStudentId
          });
        } else if (type === 'leave') {
          response = await reportsApi.downloadLeaveExcel({
            startDate: range.startDate,
            endDate: range.endDate,
            studentId: targetStudentId
          });
        } else if (type === 'security') {
          response = await api.get('/excel/security-events', {
            params: { start_date: range.startDate, end_date: range.endDate },
            responseType: 'blob'
          });
          filename = `security-report-${range.startDate}-to-${range.endDate}.xlsx`;
        } else if (type === 'performance') {
          response = await api.get('/excel/performance', {
            params: { start_date: range.startDate, end_date: range.endDate },
            responseType: 'blob'
          });
          filename = `performance-report-${range.startDate}-to-${range.endDate}.xlsx`;
        }

        if (response && response.data) {
          const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', filename);
          document.body.appendChild(link);
          link.click();
          link.parentNode?.removeChild(link);
          window.URL.revokeObjectURL(url);
          showSuccess(`${type} Excel for ${studentLabel} downloaded!`);
        }
      } else if (format === 'pdf') {
        await generatePDFReport(range, type);
      }
    } catch (error: any) {
      console.error('Export error:', error);
      showError(`Failed to export ${type} report as ${format.toUpperCase()}`);
    }
  };

  // Format geo-fence distance helper
  const formatDistance = (dist: number | null | undefined) => {
    if (dist === null || dist === undefined) return '—';
    if (dist < 1000) {
      return `${Math.round(dist)}m`;
    }
    return `${(dist / 1000).toFixed(2)}km`;
  };

  // Helper to calculate working hours capped to shift hours (overlap formula)
  const calculateWorkingHours = (record: any) => {
    if (!record.check_in_time) return 0;
    const checkIn = new Date(record.check_in_time);
    
    if (!record.check_out_time) return 0;
    const checkOut = new Date(record.check_out_time);
    
    const startParts = (record.work_start_time || '09:00:00').split(':');
    const shiftStart = new Date(checkIn);
    shiftStart.setHours(parseInt(startParts[0], 10), parseInt(startParts[1], 10), parseInt(startParts[2], 10), 0);
    
    const endParts = (record.work_end_time || '18:00:00').split(':');
    const shiftEnd = new Date(checkIn);
    shiftEnd.setHours(parseInt(endParts[0], 10), parseInt(endParts[1], 10), parseInt(endParts[2], 10), 0);
    
    const effectiveCheckIn = new Date(Math.max(checkIn.getTime(), shiftStart.getTime()));
    const effectiveCheckOut = new Date(Math.min(checkOut.getTime(), shiftEnd.getTime()));
    
    const diffMs = effectiveCheckOut.getTime() - effectiveCheckIn.getTime();
    const workingHours = diffMs / (1000 * 60 * 60);
    return workingHours < 0 ? 0 : workingHours;
  };

  // Helper to check late arrival and early leave status
  const checkLateOrEarly = (record: any) => {
    if (!record.check_in_time) return { isLate: false, isEarly: false };
    const checkIn = new Date(record.check_in_time);
    
    const startParts = (record.work_start_time || '09:00:00').split(':');
    const shiftStart = new Date(checkIn);
    shiftStart.setHours(parseInt(startParts[0], 10), parseInt(startParts[1], 10), parseInt(startParts[2], 10), 0);
    
    // Strict comparison
    const isLate = checkIn.getTime() > shiftStart.getTime();
    
    let isEarly = false;
    if (record.check_out_time) {
      const checkOut = new Date(record.check_out_time);
      const endParts = (record.work_end_time || '18:00:00').split(':');
      const shiftEnd = new Date(checkIn);
      shiftEnd.setHours(parseInt(endParts[0], 10), parseInt(endParts[1], 10), parseInt(endParts[2], 10), 0);
      
      isEarly = checkOut.getTime() < shiftEnd.getTime();
    }
    
    return { isLate, isEarly };
  };

  // Helper to check geo-fence compliance
  const isGeoCompliant = (record: any) => {
    const checkInCompliant = record.geo_fence_status === true;
    if (record.check_out_time) {
      const checkOutCompliant = record.checkout_geo_fence_status !== false;
      return checkInCompliant && checkOutCompliant;
    }
    return checkInCompliant;
  };

  // Real-time calculated stats from raw records
  const totalCheckins = attendanceRecords.length;
  const totalCheckouts = attendanceRecords.filter(r => r.check_out_time !== null).length;
  
  const recordsWithCheckout = attendanceRecords.filter(r => r.check_out_time !== null);
  const totalWorkingHours = recordsWithCheckout.reduce((acc, r) => acc + calculateWorkingHours(r), 0);
  const avgHoursPerDay = recordsWithCheckout.length > 0 ? totalWorkingHours / recordsWithCheckout.length : 0;
  
  const compliantRecords = attendanceRecords.filter(r => isGeoCompliant(r));
  const geoComplianceRate = totalCheckins > 0 ? (compliantRecords.length / totalCheckins) * 100 : 0;
  
  const lateOrEarlyRecords = attendanceRecords.filter(r => {
    const { isLate, isEarly } = checkLateOrEarly(r);
    return isLate || isEarly;
  });
  const lateOrEarlyCount = lateOrEarlyRecords.length;

  // Chart colors
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const metricCards = [
    {
      id: 'total',
      label: 'Total Check-ins & Check-outs',
      value: `I: ${totalCheckins} | O: ${totalCheckouts}`,
      icon: <FaChartBar className="text-xl" />,
      colorClass: 'bg-blue-100 text-blue-600 border-blue-200',
      activeColorClass: 'ring-2 ring-blue-500 bg-blue-50/50 border-blue-500',
      description: 'Date-wise check-in and check-out logs'
    },
    {
      id: 'hours',
      label: 'Avg. Hours/Day',
      value: `${avgHoursPerDay.toFixed(2)}h`,
      icon: <FaChartLine className="text-xl" />,
      colorClass: 'bg-green-100 text-green-600 border-green-200',
      activeColorClass: 'ring-2 ring-green-500 bg-green-50/50 border-green-500',
      description: 'Average working hours (capped to shift)'
    },
    {
      id: 'geo',
      label: 'Geo Compliance',
      value: `${Math.round(geoComplianceRate)}%`,
      icon: <FaChartPie className="text-xl" />,
      colorClass: 'bg-purple-100 text-purple-600 border-purple-200',
      activeColorClass: 'ring-2 ring-purple-500 bg-purple-50/50 border-purple-500',
      description: 'Check-in/out geo-fence compliance rate'
    },
    {
      id: 'late_early',
      label: 'Late Arrivals & Early Leave',
      value: `${lateOrEarlyCount}`,
      icon: <FaChartBar className="text-xl" />,
      colorClass: 'bg-yellow-100 text-yellow-600 border-yellow-200',
      activeColorClass: 'ring-2 ring-yellow-500 bg-yellow-50/50 border-yellow-500',
      description: 'Attendance exceptions log'
    }
  ];

  // Helper to format time strings
  const formatTime = (timeStr: string | null | undefined) => {
    if (!timeStr) return '—';
    // If it's a full ISO string, parse it
    if (timeStr.includes('T')) {
      return new Date(timeStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    // If it's a HH:MM:SS time string, convert to AM/PM format
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
      const hours = parseInt(parts[0], 10);
      const minutes = parts[1];
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const formattedHours = hours % 12 || 12;
      return `${formattedHours}:${minutes} ${ampm}`;
    }
    return timeStr;
  };

  // Daily worked hours and weekly sum calculations for selected student and week
  const weekDates = getWeekDates(weeklySelectedMonth, weeklySelectedWeek);
  
  const dailyDataForChart = weekDates.map(day => {
    const dayRecords = weeklyAttendanceLogs.filter(r => {
      const checkInDate = new Date(r.check_in_time).toISOString().split('T')[0];
      return checkInDate === day.dateStr;
    });
    
    let dailyHours = 0;
    let detailsStr = 'Absent';
    
    if (dayRecords.length > 0) {
      dailyHours = dayRecords.reduce((acc, r) => acc + calculateWorkingHours(r), 0);
      
      detailsStr = dayRecords.map(r => {
        const checkInFormatted = formatTime(r.check_in_time);
        const checkOutFormatted = r.check_out_time ? formatTime(r.check_out_time) : 'Active';
        const shiftStartFormatted = formatTime(r.work_start_time || '09:00:00');
        const shiftEndFormatted = formatTime(r.work_end_time || '18:00:00');
        return `Shift: ${shiftStartFormatted}-${shiftEndFormatted} | In: ${checkInFormatted} - Out: ${checkOutFormatted}`;
      }).join(', ');
    } else {
      if (day.weekdayName === 'Sunday') {
        detailsStr = 'Holiday';
      }
    }
    
    return {
      day: day.dayLabel,
      weekday: day.weekdayName,
      date: day.dateStr,
      hours: Number(dailyHours.toFixed(2)),
      details: detailsStr,
      records: dayRecords
    };
  });
  
  const weeklyTotalHours = dailyDataForChart.reduce((acc, d) => acc + d.hours, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
            <p className="text-gray-600 mt-1">Detailed insights and performance metrics</p>
          </div>
          <div className="flex space-x-3">
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="week">Last Week</option>
              <option value="month">Last Month</option>
              <option value="quarter">Last Quarter</option>
              <option value="year">Last Year</option>
            </select>
            <div className="flex space-x-2">
              <button
                onClick={() => handleExport('pdf', 'attendance')}
                className="flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                <FaFilePdf className="mr-2" />
                PDF
              </button>
              <button
                onClick={() => handleExport('excel', 'attendance')}
                className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                <FaFileExcel className="mr-2" />
                Excel
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {loading && (
          <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 animate-pulse">
            Syncing reports database in real time...
          </div>
        )}

        {/* Interactive Stats Cards */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Interactive Reports Board</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {metricCards.map((card) => {
              const isActive = selectedMetric === card.id;
              return (
                <motion.div
                  key={card.id}
                  whileHover={{ y: -4, scale: 1.01 }}
                  onClick={() => setSelectedMetric(isActive ? null : card.id)}
                  className={`bg-white rounded-xl shadow-sm p-6 border cursor-pointer transition-all duration-200 ${
                    isActive ? card.activeColorClass : 'border-gray-200 hover:shadow-md hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className={`p-3 rounded-full ${card.colorClass}`}>
                      {card.icon}
                    </div>
                    <span className="text-2xs text-gray-400 font-semibold select-none">
                      {isActive ? 'Active filter' : 'Click to details'}
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

        {/* Interactive Details Board */}
        {selectedMetric && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8"
          >
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  Analytics logs: {metricCards.find(c => c.id === selectedMetric)?.label}
                </h2>
                <p className="text-gray-500 text-xs mt-1">Real-time calculations compiled from daily shift timings.</p>
              </div>
              <button
                onClick={() => setSelectedMetric(null)}
                className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors"
              >
                Close Details
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {attendanceRecords.length === 0 ? (
                <div className="py-8 text-center text-gray-500 text-sm">No attendance records found for this period.</div>
              ) : selectedMetric === 'total' ? (
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider text-xs">Date</th>
                      <th className="px-6 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider text-xs">Student</th>
                      <th className="px-6 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider text-xs">Assigned Shift</th>
                      <th className="px-6 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider text-xs">Check-in</th>
                      <th className="px-6 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider text-xs">Check-out</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-150">
                    {attendanceRecords.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50/50">
                        <td className="px-6 py-3 whitespace-nowrap font-medium text-gray-900">
                          {new Date(r.check_in_time).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap">
                          {r.first_name ? `${r.first_name} ${r.last_name} (${r.student_id})` : `User (${r.student_id})`}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap font-mono text-xs text-gray-600">
                          {formatTime(r.work_start_time)} - {formatTime(r.work_end_time)}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-blue-600 font-semibold">
                          {formatTime(r.check_in_time)}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-green-600 font-semibold">
                          {r.check_out_time ? formatTime(r.check_out_time) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : selectedMetric === 'hours' ? (
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider text-xs">Date</th>
                      <th className="px-6 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider text-xs">Student</th>
                      <th className="px-6 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider text-xs">Assigned Shift</th>
                      <th className="px-6 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider text-xs">Actual Check In / Out</th>
                      <th className="px-6 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider text-xs">Working Hours</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-150">
                    {attendanceRecords.map(r => {
                      const hours = calculateWorkingHours(r);
                      return (
                        <tr key={r.id} className="hover:bg-gray-50/50">
                          <td className="px-6 py-3 whitespace-nowrap font-medium text-gray-900">
                            {new Date(r.check_in_time).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap">
                            {r.first_name ? `${r.first_name} ${r.last_name} (${r.student_id})` : `User (${r.student_id})`}
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap font-mono text-xs text-gray-600">
                            {formatTime(r.work_start_time)} - {formatTime(r.work_end_time)}
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-xs text-gray-600">
                            In: <span className="font-semibold text-gray-800">{formatTime(r.check_in_time)}</span> | 
                            Out: <span className="font-semibold text-gray-800">{r.check_out_time ? formatTime(r.check_out_time) : '—'}</span>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap">
                            <span className="font-mono font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-150">
                              {hours.toFixed(2)} hrs
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : selectedMetric === 'geo' ? (
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider text-xs">Date</th>
                      <th className="px-6 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider text-xs">Student</th>
                      <th className="px-6 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider text-xs">Check-in Status</th>
                      <th className="px-6 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider text-xs">Check-out Status</th>
                      <th className="px-6 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider text-xs">Compliance</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-150">
                    {attendanceRecords.map(r => {
                      const compliant = isGeoCompliant(r);
                      return (
                        <tr key={r.id} className="hover:bg-gray-50/50">
                          <td className="px-6 py-3 whitespace-nowrap font-medium text-gray-900">
                            {new Date(r.check_in_time).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap">
                            {r.first_name ? `${r.first_name} ${r.last_name} (${r.student_id})` : `User (${r.student_id})`}
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap">
                            <span className={`px-2 py-0.5 text-2xs font-bold rounded-full ${r.geo_fence_status ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {r.geo_fence_status ? 'Within' : 'Outside'}
                            </span>
                            <span className="text-2xs text-gray-400 font-mono ml-2">({formatDistance(r.distance_from_office)})</span>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap">
                            {r.check_out_time ? (
                              <>
                                <span className={`px-2 py-0.5 text-2xs font-bold rounded-full ${r.checkout_geo_fence_status ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                  {r.checkout_geo_fence_status ? 'Within' : 'Outside'}
                                </span>
                                <span className="text-2xs text-gray-400 font-mono ml-2">({formatDistance(r.checkout_distance_from_office)})</span>
                              </>
                            ) : '—'}
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap">
                            <span className={`px-2 py-0.5 text-2xs font-bold rounded-full uppercase tracking-wider ${compliant ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                              {compliant ? 'Compliant' : 'Non-Compliant'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider text-xs">Date</th>
                      <th className="px-6 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider text-xs">Student</th>
                      <th className="px-6 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider text-xs">Assigned Shift</th>
                      <th className="px-6 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider text-xs">Check In & Out Times</th>
                      <th className="px-6 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider text-xs">Exceptions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-150">
                    {lateOrEarlyRecords.map(r => {
                      const { isLate, isEarly } = checkLateOrEarly(r);
                      return (
                        <tr key={r.id} className="hover:bg-gray-50/50">
                          <td className="px-6 py-3 whitespace-nowrap font-medium text-gray-900">
                            {new Date(r.check_in_time).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap">
                            {r.first_name ? `${r.first_name} ${r.last_name} (${r.student_id})` : `User (${r.student_id})`}
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap font-mono text-xs text-gray-600">
                            {formatTime(r.work_start_time)} - {formatTime(r.work_end_time)}
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-xs text-gray-600">
                            In: <span className="font-semibold text-gray-800">{formatTime(r.check_in_time)}</span> | 
                            Out: <span className="font-semibold text-gray-800">{r.check_out_time ? formatTime(r.check_out_time) : '—'}</span>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap flex flex-wrap gap-1.5 mt-2">
                            {isLate && (
                              <span className="px-2 py-0.5 text-3xs font-bold bg-yellow-100 text-yellow-800 rounded-full uppercase tracking-wider">
                                Late Arrival
                              </span>
                            )}
                            {isEarly && (
                              <span className="px-2 py-0.5 text-3xs font-bold bg-red-100 text-red-800 rounded-full uppercase tracking-wider">
                                Early Leave
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
          </motion.div>
        )}

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
            {/* Weekly Attendance Card */}
            <div className={`bg-white rounded-xl shadow p-6 ${user?.role === 'admin' ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between border-b pb-4 mb-4 gap-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Weekly Attendance Hours</h2>
                  <p className="text-xs text-gray-500 mt-1">Strict shift rule overlap calculation</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  {/* Student Dropdown Selector (Admins & Teachers only) */}
                  {(user?.role === 'admin' || user?.role === 'teacher') && weeklyStudents.length > 0 && (
                    <div className="flex flex-col">
                      <label className="text-3xs text-gray-400 font-semibold uppercase mb-1">Student</label>
                      <select
                        value={weeklySelectedStudent}
                        onChange={(e) => setWeeklySelectedStudent(e.target.value)}
                        className="text-xs px-2.5 py-1.5 border border-gray-300 rounded-md bg-white font-medium text-gray-700 focus:ring-blue-500 focus:border-blue-500"
                      >
                        {weeklyStudents.map(emp => (
                          <option key={emp.student_id} value={emp.student_id}>
                            {emp.first_name} {emp.last_name || ''} ({emp.student_id})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Month Selector */}
                  <div className="flex flex-col">
                    <label className="text-3xs text-gray-400 font-semibold uppercase mb-1">Month</label>
                    <select
                      value={weeklySelectedMonth}
                      onChange={(e) => {
                        setWeeklySelectedMonth(e.target.value);
                        setWeeklySelectedWeek(1); // Reset to week 1 on month change
                      }}
                      className="text-xs px-2.5 py-1.5 border border-gray-300 rounded-md bg-white font-medium text-gray-700 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {monthsList.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Week Selector */}
                  <div className="flex flex-col">
                    <label className="text-3xs text-gray-400 font-semibold uppercase mb-1">Week of Month</label>
                    <select
                      value={weeklySelectedWeek}
                      onChange={(e) => setWeeklySelectedWeek(parseInt(e.target.value, 10))}
                      className="text-xs px-2.5 py-1.5 border border-gray-300 rounded-md bg-white font-medium text-gray-700 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {getWeeksOfMonth(weeklySelectedMonth).map(w => (
                        <option key={w.index} value={w.index}>{w.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Weekly Sum Display */}
                <div className="bg-blue-50/50 rounded-xl p-5 border border-blue-100 flex flex-col justify-between">
                  <div>
                    <span className="text-xs text-blue-600 font-bold uppercase tracking-wider">Weekly Performance</span>
                    <h3 className="text-3xl font-extrabold text-blue-900 mt-2">
                      {weeklyTotalHours.toFixed(2)}h
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">Total Worked Hours</p>
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-blue-100 text-2xs text-gray-450 font-mono">
                    <div className="truncate">Selected: {weeklySelectedStudent}</div>
                    <div className="truncate">
                      Period: {getWeeksOfMonth(weeklySelectedMonth).find(w => w.index === weeklySelectedWeek)?.startDate} to {getWeeksOfMonth(weeklySelectedMonth).find(w => w.index === weeklySelectedWeek)?.endDate}
                    </div>
                  </div>
                </div>

                {/* Bar Chart Display */}
                <div className="lg:col-span-2 h-64 bg-gray-50/20 rounded-xl p-2 border border-gray-100">
                  {weeklyLoading ? (
                    <div className="h-full flex items-center justify-center text-xs text-blue-600 animate-pulse">
                      Calculating worked hours from database...
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                      <BarChart data={dailyDataForChart}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="day" tickLine={false} axisLine={false} style={{ fontSize: '11px', fill: '#6b7280' }} />
                        <YAxis tickLine={false} axisLine={false} style={{ fontSize: '11px', fill: '#6b7280' }} />
                        <Tooltip 
                          contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '11px' }}
                          labelStyle={{ fontWeight: 'bold' }}
                        />
                        <Bar dataKey="hours" name="Shift Worked Hours" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Day-by-Day Worked Hours Detail list */}
              <div className="mt-6">
                <h4 className="text-xs font-semibold text-gray-405 uppercase tracking-wider mb-3">Daily Overlap Calculations</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {dailyDataForChart.map((day, idx) => {
                    const isSunday = day.weekday === 'Sunday';
                    const hasHours = day.hours > 0;
                    
                    return (
                      <div 
                        key={idx}
                        className={`p-3 rounded-lg border text-xs flex flex-col justify-between transition-all duration-200 ${
                          hasHours 
                            ? 'bg-white border-green-200 hover:shadow' 
                            : isSunday 
                              ? 'bg-yellow-50/45 border-yellow-100'
                              : 'bg-gray-50/50 border-gray-150 text-gray-400'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-gray-800">{day.weekday}</span>
                          <span className="text-3xs text-gray-400">{day.day}</span>
                        </div>
                        
                        <div className="my-2">
                          {day.records.length > 0 ? (
                            day.records.map((r, rIdx) => {
                              const checkInFormatted = formatTime(r.check_in_time);
                              const checkOutFormatted = r.check_out_time ? formatTime(r.check_out_time) : 'Active';
                              const shiftStartFormatted = formatTime(r.work_start_time || '09:00:00');
                              const shiftEndFormatted = formatTime(r.work_end_time || '18:00:00');
                              const hrs = calculateWorkingHours(r);
                              
                              return (
                                <div key={rIdx} className="mb-1.5 last:mb-0 pb-1.5 last:pb-0 border-b last:border-0 border-dashed border-gray-100">
                                  <div className="flex justify-between text-2xs text-gray-500 font-mono">
                                    <span>Shift:</span>
                                    <span>{shiftStartFormatted}-{shiftEndFormatted}</span>
                                  </div>
                                  <div className="flex justify-between text-2xs text-gray-650 font-mono mt-0.5">
                                    <span>In/Out:</span>
                                    <span className="font-semibold">{checkInFormatted} → {checkOutFormatted}</span>
                                  </div>
                                  <div className="flex justify-between text-3xs font-semibold text-green-600 mt-1">
                                    <span>Shift Overlap:</span>
                                    <span>{hrs.toFixed(2)}h</span>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-center py-2 font-semibold text-2xs italic text-gray-400">
                              {day.details}
                            </div>
                          )}
                        </div>

                        <div className="mt-1 pt-1.5 border-t border-gray-100 flex justify-between items-center">
                          <span className="text-3xs uppercase tracking-wider font-semibold text-gray-400">Worked</span>
                          <span className={`font-bold font-mono ${hasHours ? 'text-green-600' : 'text-gray-400'}`}>
                            {day.hours.toFixed(2)}h
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Department Performance Chart */}
            {user?.role === 'admin' && (
              <div className="bg-white rounded-xl shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Department Attendance Rates</h2>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                    <PieChart margin={{ top: 20, right: 60, bottom: 20, left: 60 }}>
                      <Pie
                        data={departmentData}
                        cx="50%"
                        cy="50%"
                        labelLine={true}
                        outerRadius={50}
                        fill="#8884d8"
                        dataKey="attendanceRate"
                        nameKey="department"
                        label={({ name, value }: any) => `${name}: ${value}%`}
                      >
                        {departmentData.map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => [`${value}%`, 'Attendance Rate']} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Leave Distribution Chart — visible to admin and teacher (role-scoped from backend) */}
            {leaveStats && (user?.role === 'admin' || user?.role === 'teacher') && (
              <div className="bg-white rounded-xl shadow p-6 lg:col-span-3">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Leave Request Distribution</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {user?.role === 'teacher' ? 'Showing data for your assigned students' : 'Organisation-wide leave summary'} — live from database
                    </p>
                  </div>
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                    user?.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-indigo-100 text-indigo-700'
                  }`}>
                    {user?.role === 'admin' ? 'All Departments' : 'My Team'}
                  </span>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                    <LineChart
                      data={[
                        { name: 'Approved', value: leaveStats.approved },
                        { name: 'Pending', value: leaveStats.pending },
                        { name: 'Rejected', value: leaveStats.rejected },
                      ]}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                      <Tooltip
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                        formatter={(value: any) => [value, 'Requests']}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Line 
                        type="monotone" 
                        dataKey="value" 
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ r: 5 }}
                        activeDot={{ r: 8 }} 
                        name="Leave Requests"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {/* Summary badges */}
                <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
                    <span className="text-xs text-gray-600">Approved: <strong>{leaveStats.approved}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
                    <span className="text-xs text-gray-600">Pending: <strong>{leaveStats.pending}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                    <span className="text-xs text-gray-600">Rejected: <strong>{leaveStats.rejected}</strong></span>
                  </div>
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-400"></span>
                    <span className="text-xs text-gray-600">Total: <strong>{leaveStats.totalRequests}</strong></span>
                  </div>
                </div>
              </div>
            )}
          </div>

        {/* Detailed Reports */}
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Detailed Reports</h2>
              <p className="text-xs text-gray-500 mt-0.5">Download detailed report data for the selected period</p>
            </div>

            {/* Student selector for admin and teacher one-click per-student download */}
            {(user?.role === 'admin' || user?.role === 'teacher') && managedStudents.length > 0 && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Filter by Student:
                </label>
                <select
                  value={detailedReportTargetStudent}
                  onChange={(e) => setDetailedReportTargetStudent(e.target.value)}
                  className="text-sm px-3 py-1.5 border border-gray-300 rounded-md bg-white font-medium text-gray-700 focus:ring-blue-500 focus:border-blue-500 min-w-[200px]"
                >
                  <option value="">All {user?.role === 'admin' ? 'Students' : 'My Team'}</option>
                  {managedStudents.map((emp: any) => (
                    <option key={emp.student_id} value={emp.student_id}>
                      {emp.first_name} {emp.last_name || ''} ({emp.student_id})
                    </option>
                  ))}
                </select>
                {detailedReportTargetStudent && (
                  <button
                    onClick={() => setDetailedReportTargetStudent('')}
                    className="text-xs text-gray-400 hover:text-gray-700 font-medium underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
            
            <div className="divide-y divide-gray-200">
              <div className="px-6 py-4 flex justify-between items-center hover:bg-gray-50">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Attendance Summary Report</h3>
                  <p className="text-sm text-gray-500">
                    {detailedReportTargetStudent
                      ? (() => { const e = managedStudents.find((m: any) => m.student_id === detailedReportTargetStudent); return e ? `Records for ${e.first_name} ${e.last_name}` : 'Filtered attendance records'; })()
                      : 'Detailed attendance records and statistics'}
                  </p>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleExport('pdf', 'attendance', detailedReportTargetStudent || undefined)}
                    className="flex items-center px-3 py-1 bg-red-100 text-red-700 rounded-md hover:bg-red-200"
                  >
                    <FaFilePdf className="mr-1" />
                    PDF
                  </button>
                  <button
                    onClick={() => handleExport('excel', 'attendance', detailedReportTargetStudent || undefined)}
                    className="flex items-center px-3 py-1 bg-green-100 text-green-700 rounded-md hover:bg-green-200"
                  >
                    <FaFileExcel className="mr-1" />
                    Excel
                  </button>
                </div>
              </div>
              
              <div className="px-6 py-4 flex justify-between items-center hover:bg-gray-50">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Leave Usage Report</h3>
                  <p className="text-sm text-gray-500">
                    {detailedReportTargetStudent
                      ? (() => { const e = managedStudents.find((m: any) => m.student_id === detailedReportTargetStudent); return e ? `Leave records for ${e.first_name} ${e.last_name}` : 'Filtered leave records'; })()
                      : 'Comprehensive leave request and approval data'}
                  </p>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleExport('pdf', 'leave', detailedReportTargetStudent || undefined)}
                    className="flex items-center px-3 py-1 bg-red-100 text-red-700 rounded-md hover:bg-red-200"
                  >
                    <FaFilePdf className="mr-1" />
                    PDF
                  </button>
                  <button
                    onClick={() => handleExport('excel', 'leave', detailedReportTargetStudent || undefined)}
                    className="flex items-center px-3 py-1 bg-green-100 text-green-700 rounded-md hover:bg-green-200"
                  >
                    <FaFileExcel className="mr-1" />
                    Excel
                  </button>
                </div>
              </div>
              
              <div className="px-6 py-4 flex justify-between items-center hover:bg-gray-50">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Security Incident Report</h3>
                  <p className="text-sm text-gray-500">Face recognition failures and security events</p>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleExport('pdf', 'security')}
                    className="flex items-center px-3 py-1 bg-red-100 text-red-700 rounded-md hover:bg-red-200"
                  >
                    <FaFilePdf className="mr-1" />
                    PDF
                  </button>
                  <button
                    onClick={() => handleExport('excel', 'security')}
                    className="flex items-center px-3 py-1 bg-green-100 text-green-700 rounded-md hover:bg-green-200"
                  >
                    <FaFileExcel className="mr-1" />
                    Excel
                  </button>
                </div>
              </div>
              
              <div className="px-6 py-4 flex justify-between items-center hover:bg-gray-50">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Performance Analytics Report</h3>
                  <p className="text-sm text-gray-500">Student performance metrics and trends</p>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleExport('pdf', 'performance')}
                    className="flex items-center px-3 py-1 bg-red-100 text-red-700 rounded-md hover:bg-red-200"
                  >
                    <FaFilePdf className="mr-1" />
                    PDF
                  </button>
                  <button
                    onClick={() => handleExport('excel', 'performance')}
                    className="flex items-center px-3 py-1 bg-green-100 text-green-700 rounded-md hover:bg-green-200"
                  >
                    <FaFileExcel className="mr-1" />
                    Excel
                  </button>
                </div>
              </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ReportsPage;
