import api from '@services/api';
import { AxiosResponse } from 'axios';

export interface FaceLoginData {
  frames: string[];
  employeeId: string;
  challengeType?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
}

export interface FaceLoginResponse {
  success: boolean;
  authenticated: boolean;
  message: string;
  tokens?: {
    accessToken: string;
    refreshToken: string;
  };
  employee?: {
    id: number;
    employeeId: string;
    email: string;
    role: string;
    department: string;
  };
  spoofDetected?: boolean;
  errors?: string[];
}

export interface RegisterFaceData {
  frames: string[];
  employeeId: string;
}

export interface RegisterFaceResponse {
  success: boolean;
  message: string;
  employeeId: string;
}

export interface RefreshTokenData {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  success: boolean;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
  employee: {
    id: number;
    employeeId: string;
    email: string;
    role: string;
    department: string;
  };
}

export const authApi = {
  faceLogin: async (data: FaceLoginData, signal?: AbortSignal): Promise<AxiosResponse<FaceLoginResponse>> => {
    const response = await api.post<FaceLoginResponse>('/auth/face-login', data, { signal });
    return response;
  },

  registerFace: async (data: RegisterFaceData): Promise<AxiosResponse<RegisterFaceResponse>> => {
    const response = await api.post<RegisterFaceResponse>('/auth/register-face', data);
    return response;
  },

  refreshToken: async (data: RefreshTokenData): Promise<AxiosResponse<RefreshTokenResponse>> => {
    const response = await api.post<RefreshTokenResponse>('/auth/refresh', data);
    return response;
  },

  logout: async (): Promise<AxiosResponse<{ success: boolean; message: string }>> => {
    const response = await api.post('/auth/logout');
    return response;
  },
};