// Utility functions for form validation

export const validateEmployeeId = (employeeId: string): string | null => {
  if (!employeeId) {
    return 'Employee ID is required';
  }
  
  if (employeeId.length < 3) {
    return 'Employee ID must be at least 3 characters';
  }
  
  return null;
};

export const validatePassword = (password: string): string | null => {
  if (!password) {
    return 'Password is required';
  }
  
  if (password.length < 6) {
    return 'Password must be at least 6 characters';
  }
  
  return null;
};

export const validateDateRange = (startDate: string, endDate: string): string | null => {
  if (!startDate || !endDate) {
    return 'Both start and end dates are required';
  }
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (start > end) {
    return 'Start date must be before end date';
  }
  
  return null;
};

export const validateLeaveRequest = (
  leaveType: string,
  startDate: string,
  endDate: string,
  reason: string
): string | null => {
  if (!leaveType) {
    return 'Leave type is required';
  }
  
  const dateError = validateDateRange(startDate, endDate);
  if (dateError) {
    return dateError;
  }
  
  if (!reason || reason.trim().length === 0) {
    return 'Reason is required';
  }
  
  if (reason.length > 500) {
    return 'Reason must be less than 500 characters';
  }
  
  return null;
};