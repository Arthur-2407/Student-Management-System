import api from '@services/api';

export interface MfaEnrollResponse {
  secret: string;
  provisioningUri: string;
  backupCodes: string[];
}

export interface MfaStatusResponse {
  mfaEnabled: boolean;
  enrollmentPending: boolean;
}

export const mfaApi = {
  /** Start MFA enrollment — returns secret, QR URI, and backup codes */
  enroll: () => api.post<MfaEnrollResponse>('/auth/mfa/enroll'),

  /** Verify enrollment with a TOTP code */
  verify: (code: string) => api.post('/auth/mfa/verify', { code }),

  /** Validate a TOTP or backup code during login */
  validate: (code: string) => api.post('/auth/mfa/validate', { code }),

  /** Disable MFA (requires valid TOTP code) */
  disable: (code: string) => api.post('/auth/mfa/disable', { code }),

  /** Get current MFA status */
  getStatus: () => api.get<MfaStatusResponse>('/auth/mfa/status'),
};
