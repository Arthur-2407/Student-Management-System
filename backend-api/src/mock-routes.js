const express = require('express');

// Mock auth routes
const authRoutes = express.Router();

authRoutes.post('/face-login', (req, res) => {
  res.json({
    success: true,
    accessToken: 'mock-access-token-' + Date.now(),
    refreshToken: 'mock-refresh-token-' + Date.now(),
    user: {
      id: 'EMP001',
      name: 'John Doe',
      email: 'john@company.com',
      role: 'employee'
    }
  });
});

authRoutes.post('/refresh', (req, res) => {
  res.json({
    accessToken: 'mock-new-access-token-' + Date.now(),
    refreshToken: 'mock-new-refresh-token-' + Date.now()
  });
});

authRoutes.post('/logout', (req, res) => {
  res.json({ success: true });
});

// Mock attendance routes
const attendanceRoutes = express.Router();

attendanceRoutes.get('/today', (req, res) => {
  res.json({
    date: new Date().toISOString().split('T')[0],
    status: 'present',
    checkIn: '09:00 AM',
    checkOut: null,
    totalHours: null
  });
});

attendanceRoutes.post('/check-in', (req, res) => {
  res.json({
    success: true,
    checkInTime: new Date().toISOString(),
    message: 'Successfully checked in'
  });
});

attendanceRoutes.post('/check-out', (req, res) => {
  res.json({
    success: true,
    checkOutTime: new Date().toISOString(),
    totalHours: 8.5,
    message: 'Successfully checked out'
  });
});

attendanceRoutes.get('/history', (req, res) => {
  res.json({
    records: [
      {
        date: '2026-03-28',
        checkIn: '09:00 AM',
        checkOut: '06:00 PM',
        totalHours: 9,
        status: 'present'
      },
      {
        date: '2026-03-27',
        checkIn: '09:15 AM',
        checkOut: '06:30 PM',
        totalHours: 9.25,
        status: 'present'
      }
    ],
    pagination: {
      page: 1,
      limit: 10,
      total: 45
    }
  });
});

// Mock leave routes
const leaveRoutes = express.Router();

leaveRoutes.get('/', (req, res) => {
  res.json({
    leaves: [
      {
        id: 1,
        type: 'sick',
        startDate: '2026-03-25',
        endDate: '2026-03-26',
        status: 'approved',
        reason: 'Medical emergency'
      }
    ]
  });
});

leaveRoutes.post('/', (req, res) => {
  res.json({
    success: true,
    leaveId: Date.now(),
    message: 'Leave request submitted successfully'
  });
});

// Mock work report routes
const workReportRoutes = express.Router();

workReportRoutes.post('/', (req, res) => {
  res.json({
    success: true,
    reportId: Date.now(),
    message: 'Work report submitted successfully'
  });
});

workReportRoutes.get('/', (req, res) => {
  res.json({
    reports: [
      {
        id: 1,
        date: '2026-03-28',
        tasksCompleted: 5,
        hoursWorked: 8,
        description: 'Completed API development and testing'
      }
    ]
  });
});

// Mock excel routes
const excelRoutes = express.Router();

excelRoutes.get('/attendance/download', (req, res) => {
  res.json({
    downloadUrl: '/api/excel/attendance/file.xlsx',
    message: 'Excel file generated successfully'
  });
});

// Mock geofence routes
const geofenceRoutes = express.Router();

geofenceRoutes.get('/check', (req, res) => {
  res.json({
    withinGeofence: true,
    distance: 50, // meters
    message: 'You are within the office geofence'
  });
});

// Mock security routes
const securityRoutes = express.Router();

securityRoutes.get('/events', (req, res) => {
  res.json({
    events: [
      {
        id: 1,
        type: 'LOGIN_SUCCESS',
        timestamp: new Date().toISOString(),
        employeeId: 'EMP001',
        details: 'Successful face login'
      }
    ]
  });
});

// Mock notification routes
const notificationRoutes = express.Router();

notificationRoutes.get('/', (req, res) => {
  res.json({
    notifications: [
      {
        id: 1,
        type: 'info',
        title: 'Check-in Reminder',
        message: 'Don\'t forget to check in today',
        timestamp: new Date().toISOString(),
        read: false
      }
    ]
  });
});

module.exports = {
  authRoutes,
  attendanceRoutes,
  leaveRoutes,
  workReportRoutes,
  excelRoutes,
  geofenceRoutes,
  securityRoutes,
  notificationRoutes
};
