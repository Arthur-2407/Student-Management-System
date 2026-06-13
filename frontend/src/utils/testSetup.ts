// Test utilities and setup for the frontend application
import React from 'react';
export const mockUserData = {
  id: 1,
  employeeId: 'EMP001',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@company.com',
  role: 'employee',
  department: 'Engineering',
};

export const mockAdminData = {
  id: 2,
  employeeId: 'ADM001',
  firstName: 'Admin',
  lastName: 'User',
  email: 'admin@company.com',
  role: 'admin',
  department: 'Administration',
};

export const mockSupervisorData = {
  id: 3,
  employeeId: 'SUP001',
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'jane.smith@company.com',
  role: 'supervisor',
  department: 'Engineering',
};

export const mockAttendanceRecords = [
  {
    id: 1,
    employeeId: 1,
    checkInTime: new Date().toISOString(),
    checkOutTime: null,
    workHours: null,
    location: { latitude: 40.7128, longitude: -74.0060 },
    geoFenceStatus: true,
    distanceFromOffice: 50,
  },
  {
    id: 2,
    employeeId: 1,
    checkInTime: new Date(Date.now() - 86400000).toISOString(),
    checkOutTime: new Date(Date.now() - 86400000 + 28800000).toISOString(),
    workHours: '08:00:00',
    location: { latitude: 40.7128, longitude: -74.0060 },
    geoFenceStatus: true,
    distanceFromOffice: 25,
  },
];

export const mockLeaveRequests = [
  {
    id: 1,
    employeeId: 1,
    leaveType: 'vacation',
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 86400000 * 5).toISOString(),
    totalDays: 5,
    reason: 'Family vacation',
    status: 'pending',
  },
  {
    id: 2,
    employeeId: 1,
    leaveType: 'sick',
    startDate: new Date(Date.now() - 86400000 * 10).toISOString(),
    endDate: new Date(Date.now() - 86400000 * 8).toISOString(),
    totalDays: 3,
    reason: 'Flu',
    status: 'approved',
  },
];

export const mockSecurityEvents = [
  {
    id: 1,
    employeeId: 1,
    eventType: 'SPOOF_ATTEMPT',
    timestamp: new Date().toISOString(),
    ipAddress: '192.168.1.100',
    deviceInfo: 'Chrome on Windows',
    details: 'High spoof confidence detected',
    severity: 'high',
  },
  {
    id: 2,
    employeeId: 2,
    eventType: 'GEOFENCE_VIOLATION',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    ipAddress: '192.168.1.101',
    deviceInfo: 'Firefox on macOS',
    details: '150 meters outside office perimeter',
    severity: 'medium',
  },
];

export const mockChartData = {
  attendance: [
    { day: 'Mon', hours: 8.5 },
    { day: 'Tue', hours: 9.2 },
    { day: 'Wed', hours: 7.8 },
    { day: 'Thu', hours: 8.9 },
    { day: 'Fri', hours: 8.3 },
  ],
  leave: [
    { type: 'Approved', value: 15 },
    { type: 'Pending', value: 3 },
    { type: 'Rejected', value: 2 },
  ],
  security: [
    { date: '2023-01-01', spoofAttempts: 2, faceMismatches: 1, geoViolations: 0 },
    { date: '2023-01-02', spoofAttempts: 1, faceMismatches: 3, geoViolations: 2 },
    { date: '2023-01-03', spoofAttempts: 0, faceMismatches: 0, geoViolations: 1 },
  ],
};

export const setupMockApi = () => {
  // Mock API responses for testing
  global.fetch = jest.fn().mockImplementation((url) => {
    if (url.includes('/api/auth')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ 
          success: true, 
          tokens: { accessToken: 'mock-token', refreshToken: 'mock-refresh' },
          employee: mockUserData,
        }),
      });
    }
    
    if (url.includes('/api/attendance')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ 
          success: true, 
          data: mockAttendanceRecords,
        }),
      });
    }
    
    if (url.includes('/api/leave')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ 
          success: true, 
          data: mockLeaveRequests,
        }),
      });
    }
    
    if (url.includes('/api/security')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ 
          success: true, 
          data: mockSecurityEvents,
        }),
      });
    }
    
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
  });
};

export const teardownMockApi = () => {
  // Clean up mock API
  global.fetch = undefined as any;
};

export const waitForComponentToRender = async (_component: React.ReactElement) => {
  // Wait for component to render in tests
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 100);
  });
};