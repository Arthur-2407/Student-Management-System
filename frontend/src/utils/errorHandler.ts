// Utility functions for handling API errors

export interface ApiError {
  message: string;
  code?: string;
  details?: any;
}

export const handleApiError = (error: any): ApiError => {
  if (error.response) {
    // Server responded with error status
    const { status, data } = error.response;
    
    switch (status) {
      case 400:
        return {
          message: data.message || 'Bad Request',
          code: data.code || 'BAD_REQUEST',
          details: data.details,
        };
      case 401:
        return {
          message: 'Unauthorized access. Please login again.',
          code: 'UNAUTHORIZED',
        };
      case 403:
        return {
          message: 'Access forbidden. You do not have permission to perform this action.',
          code: 'FORBIDDEN',
        };
      case 404:
        return {
          message: data.message || 'Resource not found',
          code: data.code || 'NOT_FOUND',
        };
      case 429:
        return {
          message: data.message || 'Too many requests. Please try again later.',
          code: data.code || 'RATE_LIMIT_EXCEEDED',
        };
      case 500:
        return {
          message: 'Internal server error. Please try again later.',
          code: 'INTERNAL_ERROR',
        };
      default:
        return {
          message: data.message || `Server error (${status})`,
          code: data.code || 'SERVER_ERROR',
        };
    }
  } else if (error.request) {
    // Request was made but no response received
    return {
      message: 'Network error. Please check your connection and try again.',
      code: 'NETWORK_ERROR',
    };
  } else {
    // Something else happened
    return {
      message: error.message || 'An unexpected error occurred.',
      code: 'UNEXPECTED_ERROR',
    };
  }
};

export const isApiError = (error: any): error is ApiError => {
  return typeof error === 'object' && error !== null && 'message' in error;
};

export const getErrorMessage = (error: any): string => {
  if (isApiError(error)) {
    return error.message;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return 'An unexpected error occurred.';
};