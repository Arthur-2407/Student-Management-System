import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaUsers,
  FaUserPlus,
  FaUserSlash,
  FaUserCheck,
  FaUserMinus,
  FaBuilding,
  FaClock,
  FaSearch,
  FaShieldAlt,
  FaTimes,
  FaCheck,
  FaLink,
  FaUnlink,
  FaChevronDown,
  FaChevronRight,
  FaLock,
  FaCamera,
  FaTrash,
  FaSync,
  FaExclamationTriangle,
  FaCheckCircle,
  FaKey,
  FaMapMarkerAlt,
} from 'react-icons/fa';
import { adminApi, Student, Teacher, WorkTiming, StudentLocation, StudentLocationRow } from '@api/adminApi';
import { faceManagementApi, FaceChangeRequest, FaceAuditLog } from '@api/faceManagementApi';
import { leaveApi, LeaveRequest } from '@api/leaveApi';
import FaceCamera from '@components/camera/FaceCamera';
import { useNotification } from '@contexts/NotificationContext';
import { useAuth } from '@contexts/AuthContext';
import { websocketService } from '@services/websocketService';

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'hierarchy' | 'students' | 'teachers' | 'timings' | 'mfa' | 'approvals' | 'leaves' | 'system';

interface CreateStudentForm {
  studentId: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  department: string;
  position: string;
  role: 'student' | 'teacher' | 'admin';
  teacherId: string;
  hireDate: string;
  password: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const INITIAL_FORM: CreateStudentForm = {
  studentId: '',
  firstName: '',
  lastName: '',
  email: '',
  phoneNumber: '',
  department: '',
  position: '',
  role: 'student',
  teacherId: '',
  hireDate: new Date().toISOString().split('T')[0],
  password: '',
};

// ─── Sub-components ──────────────────────────────────────────────────────────

const RoleBadge: React.FC<{ role: string }> = ({ role }) => {
  const colors: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-800',
    teacher: 'bg-blue-100 text-blue-800',
    student: 'bg-gray-100 text-gray-700',
  };
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colors[role] || colors.student}`}>
      {role}
    </span>
  );
};

const StatusDot: React.FC<{ active: boolean }> = ({ active }) => (
  <span className={`inline-block w-2 h-2 rounded-full mr-2 ${active ? 'bg-green-500' : 'bg-gray-400'}`} />
);

// ─── System Settings Tab Sub-component ───────────────────────────────────────────

const SystemSettingsTab: React.FC = () => {
  const { showSuccess, showError } = useNotification();
  const [activeConfigTab, setActiveConfigTab] = useState<'general' | 'reset'>('general');

  // General Config Form States
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [adminAddress, setAdminAddress] = useState('');
  const [adminDesignation, setAdminDesignation] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryPhone, setRecoveryPhone] = useState('');
  const [adminStudentId, setAdminStudentId] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Reset Wizard States
  const [resetStep, setResetStep] = useState<1 | 2 | 3>(1);
  const [currentPassword, setCurrentPassword] = useState('');
  const [verifyFrames, setVerifyFrames] = useState<string[]>([]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState('');

  // Step 2 OTP States
  const [otpCode, setOtpCode] = useState('');
  const [isOtpVerifying, setIsOtpVerifying] = useState(false);

  // Step 3 Replacement States
  const [newName, setNewName] = useState('');
  const [newEmpId, setNewEmpId] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newDesignation, setNewDesignation] = useState('');
  const [newRecoveryEmail, setNewRecoveryEmail] = useState('');
  const [newRecoveryPhone, setNewRecoveryPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [newFaceFrames, setNewFaceFrames] = useState<string[]>([]);
  const [isReplacing, setIsReplacing] = useState(false);

  // Fetch current config on load
  const loadConfig = async () => {
    setIsFetching(true);
    try {
      const res = await adminApi.getConfiguration();
      if (res.data.success && res.data.data) {
        const config = res.data.data;
        setAdminName(config.adminName || '');
        setAdminEmail(config.adminEmail || '');
        setAdminPhone(config.adminPhone || '');
        setAdminAddress(config.adminAddress || '');
        setAdminDesignation(config.adminDesignation || '');
        setRecoveryEmail(config.recoveryEmail || '');
        setRecoveryPhone(config.recoveryPhone || '');
        setAdminStudentId(config.adminStudentId || '');
      }
    } catch (err: any) {
      showError(err.response?.data?.error || 'Failed to load system configuration.');
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await adminApi.updateConfiguration({
        adminName,
        adminEmail,
        adminPhone,
        adminAddress,
        adminDesignation,
        recoveryEmail,
        recoveryPhone
      });
      if (res.data.success) {
        showSuccess(res.data.message || 'Configuration updated successfully.');
        loadConfig();
      }
    } catch (err: any) {
      showError(err.response?.data?.error || 'Failed to save configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCaptureVerifyFrame = (frame: string) => {
    const base64Data = frame.replace('data:image/jpeg;base64,', '');
    setVerifyFrames(prev => [...prev.slice(-19), base64Data]);
  };

  const handleCaptureNewFaceFrame = (frame: string) => {
    const base64Data = frame.replace('data:image/jpeg;base64,', '');
    setNewFaceFrames(prev => [...prev.slice(-19), base64Data]);
  };

  // Step 1: Password & Face verification
  const handleInitiateReset = async () => {
    if (!currentPassword) {
      showError('Please enter your current password.');
      return;
    }
    if (verifyFrames.length < 5) {
      showError('Please look at the camera to capture face frames.');
      return;
    }

    setIsVerifying(true);
    try {
      const res = await adminApi.initiateAdminReset({
        password: currentPassword,
        frames: verifyFrames
      });
      if (res.data.success) {
        setMaskedEmail(res.data.recoveryEmailMasked || 'configured recovery email');
        showSuccess('Verification successful. OTP has been sent.');
        setResetStep(2);
      }
    } catch (err: any) {
      showError(err.response?.data?.error || 'Verification failed. Check password and face.');
    } finally {
      setIsVerifying(false);
    }
  };

  // Step 2: OTP verification
  const handleVerifyOtp = async () => {
    if (!otpCode || otpCode.length < 6) {
      showError('Please enter a valid 6-digit OTP code.');
      return;
    }

    setIsOtpVerifying(true);
    try {
      const res = await adminApi.verifyAdminResetOtp({ otp: otpCode });
      if (res.data.success) {
        showSuccess('OTP verified successfully. You may now update credentials.');
        setResetStep(3);
      }
    } catch (err: any) {
      showError(err.response?.data?.error || 'Invalid or expired OTP.');
    } finally {
      setIsOtpVerifying(false);
    }
  };

  // Step 3: Replace Admin Details
  const handleReplaceAdmin = async () => {
    if (!newName || !newEmpId || !newEmail || !newPassword) {
      showError('Name, Student ID, Email, and Password are required.');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      showError('Passwords do not match.');
      return;
    }
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      showError('Password must be at least 8 characters and contain at least one uppercase letter, one lowercase letter, and one number.');
      return;
    }
    if (newFaceFrames.length < 10) {
      showError('Please capture at least 10 face frames of the new administrator.');
      return;
    }

    setIsReplacing(true);
    try {
      const res = await adminApi.replaceAdmin({
        adminName: newName,
        adminStudentId: newEmpId,
        adminEmail: newEmail,
        adminPhone: newPhone,
        adminAddress: newAddress,
        adminDesignation: newDesignation,
        recoveryEmail: newRecoveryEmail,
        recoveryPhone: newRecoveryPhone,
        password: newPassword,
        frames: newFaceFrames
      });
      if (res.data.success) {
        showSuccess('Administrator replaced successfully. Logging out...');
        setTimeout(() => {
          window.location.href = '/login';
        }, 3000);
      }
    } catch (err: any) {
      showError(err.response?.data?.error || 'Failed to replace administrator.');
    } finally {
      setIsReplacing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveConfigTab('general')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeConfigTab === 'general' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          General Settings
        </button>
        <button
          onClick={() => setActiveConfigTab('reset')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeConfigTab === 'reset' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Admin Reset Wizard
        </button>
      </div>

      {isFetching ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin mx-auto" />
        </div>
      ) : activeConfigTab === 'general' ? (
        <form onSubmit={handleSaveConfig} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Administrator Profile Settings</h3>
            <p className="text-sm text-gray-500">Configure global administrator contact details and recovery paths.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Admin Student ID (Read-only)</label>
              <input
                type="text"
                value={adminStudentId}
                disabled
                className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Full Name</label>
              <input
                type="text"
                value={adminName}
                onChange={e => setAdminName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g. John Doe"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Primary Email</label>
              <input
                type="email"
                value={adminEmail}
                onChange={e => setAdminEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="admin@company.com"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Phone Number</label>
              <input
                type="tel"
                value={adminPhone}
                onChange={e => setAdminPhone(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="+1 (555) 0100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Designation</label>
              <input
                type="text"
                value={adminDesignation}
                onChange={e => setAdminDesignation(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="System Administrator"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Office Address</label>
              <input
                type="text"
                value={adminAddress}
                onChange={e => setAdminAddress(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Office HQ"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Recovery Email</label>
              <input
                type="email"
                value={recoveryEmail}
                onChange={e => setRecoveryEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="recovery@company.com"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Recovery Phone</label>
              <input
                type="tel"
                value={recoveryPhone}
                onChange={e => setRecoveryPhone(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="+1 (555) 0199"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-100">
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm disabled:opacity-50 flex items-center gap-2 shadow-sm"
            >
              {isSaving ? (
                <>
                  <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Settings'
              )}
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
          <div className="border-b border-gray-100 pb-4">
            <h3 className="text-lg font-bold text-red-600 flex items-center gap-2">
              <FaShieldAlt className="text-red-500" />
              Administrator Reset & Identity Replacement Wizard
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Follow this secure multi-step verification to fully replace the administrator credentials, identity, password, and registered face.
            </p>
          </div>

          {/* Steps Indicator */}
          <div className="flex items-center justify-between max-w-lg mx-auto mb-8">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                resetStep >= 1 ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-400'
              }`}>1</div>
              <span className="text-xs mt-1 text-gray-600 font-medium">Verify Identity</span>
            </div>
            <div className={`flex-1 h-0.5 mx-2 ${resetStep >= 2 ? 'bg-red-600' : 'bg-gray-200'}`} />
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                resetStep >= 2 ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-400'
              }`}>2</div>
              <span className="text-xs mt-1 text-gray-600 font-medium">Recovery OTP</span>
            </div>
            <div className={`flex-1 h-0.5 mx-2 ${resetStep >= 3 ? 'bg-red-600' : 'bg-gray-200'}`} />
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                resetStep >= 3 ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-400'
              }`}>3</div>
              <span className="text-xs mt-1 text-gray-600 font-medium">Replace Admin</span>
            </div>
          </div>

          <div className="max-w-xl mx-auto">
            {resetStep === 1 && (
              <div className="space-y-6">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3 text-amber-800 text-sm">
                  <FaExclamationTriangle className="mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-semibold">Security Warning:</span> Starting the reset wizard requires verifying your current administrator password and biometrics. An OTP will then be dispatched to your recovery email.
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1">Current Admin Password</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter current password"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-2">Liveness Face Capture</label>
                    <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden relative max-h-56 mx-auto">
                      <FaceCamera
                        onCapture={handleCaptureVerifyFrame}
                        className="w-full h-full"
                        autoCapture={true}
                        captureInterval={200}
                        showControls={false}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 mt-2">
                      <span>Verification frames buffer:</span>
                      <span className="font-semibold text-blue-600">{verifyFrames.length}/20</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <button
                    onClick={handleInitiateReset}
                    disabled={isVerifying || !currentPassword || verifyFrames.length < 5}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-lg shadow-sm disabled:opacity-50 flex items-center gap-2"
                  >
                    {isVerifying ? (
                      <>
                        <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      'Verify & Send OTP'
                    )}
                  </button>
                </div>
              </div>
            )}

            {resetStep === 2 && (
              <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3 text-blue-800 text-sm">
                  <FaCheckCircle className="mt-0.5 flex-shrink-0" />
                  <div>
                    An OTP was sent to your recovery email: <span className="font-bold">{maskedEmail}</span>. The code will expire in 5 minutes.
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1">One-Time Password (OTP)</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono tracking-widest text-center text-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="123456"
                  />
                </div>

                <div className="flex justify-between pt-4">
                  <button
                    onClick={() => setResetStep(1)}
                    className="px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleVerifyOtp}
                    disabled={isOtpVerifying || otpCode.length < 6}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-lg disabled:opacity-50 flex items-center gap-2"
                  >
                    {isOtpVerifying ? (
                      <>
                        <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        Verifying OTP...
                      </>
                    ) : (
                      'Verify OTP'
                    )}
                  </button>
                </div>
              </div>
            )}

            {resetStep === 3 && (
              <div className="space-y-6">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
                  <span className="font-semibold">Final Step:</span> Input the credentials and details for the new Master System Administrator and register their face.
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">New Admin Full Name *</label>
                    <input
                      type="text"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="e.g. John Smith"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">New Admin Student ID *</label>
                    <input
                      type="text"
                      value={newEmpId}
                      onChange={e => setNewEmpId(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="e.g. admin"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">New Admin Email *</label>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={e => setNewEmail(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="admin@company.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">New Admin Phone</label>
                    <input
                      type="tel"
                      value={newPhone}
                      onChange={e => setNewPhone(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="+1 555 0100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">New Recovery Email</label>
                    <input
                      type="email"
                      value={newRecoveryEmail}
                      onChange={e => setNewRecoveryEmail(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="recovery@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">New Recovery Phone</label>
                    <input
                      type="tel"
                      value={newRecoveryPhone}
                      onChange={e => setNewRecoveryPhone(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="+1 555 0199"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">New Designation</label>
                    <input
                      type="text"
                      value={newDesignation}
                      onChange={e => setNewDesignation(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="System Administrator"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Office Address</label>
                    <input
                      type="text"
                      value={newAddress}
                      onChange={e => setNewAddress(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="Office HQ"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">New Admin Password *</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="At least 8 chars, 1 uppercase, 1 lowercase, 1 number"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Confirm New Password *</label>
                    <input
                      type="password"
                      value={newPasswordConfirm}
                      onChange={e => setNewPasswordConfirm(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-2">New Admin Face Registration *</label>
                  <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden relative max-h-56 mx-auto">
                    <FaceCamera
                      onCapture={handleCaptureNewFaceFrame}
                      className="w-full h-full"
                      autoCapture={true}
                      captureInterval={150}
                      showControls={false}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-2">
                    <span>Captured frames (minimum 10):</span>
                    <span className="font-semibold text-blue-600">{newFaceFrames.length}/20</span>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    onClick={handleReplaceAdmin}
                    disabled={isReplacing || newFaceFrames.length < 10 || !newPassword || newPassword !== newPasswordConfirm}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-lg shadow-md disabled:opacity-50 flex items-center gap-2"
                  >
                    {isReplacing ? (
                      <>
                        <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        Replacing Administrator...
                      </>
                    ) : (
                      'Confirm Replacement'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const AdminPage: React.FC = () => {
  const { user } = useAuth();
  const { showSuccess, showError } = useNotification();

  useEffect(() => {
    const handleMapMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'MAP_LOCATION_SELECTED') {
        const { name, latitude, longitude } = event.data;
        if (name) setLocationName(name);
        if (latitude) setLocationLat(String(latitude));
        if (longitude) setLocationLng(String(longitude));
      }
    };
    window.addEventListener('message', handleMapMessage);
    return () => {
      window.removeEventListener('message', handleMapMessage);
    };
  }, []);

  // Data state
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [unassignedStudents, setUnassignedStudents] = useState<Student[]>([]);
  const [workTimings, setWorkTimings] = useState<WorkTiming[]>([]);
  const [loading, setLoading] = useState(true);

  // Teachers interactive features state
  const [expandedTeachersTab, setExpandedTeachersTab] = useState<Set<number>>(new Set());
  const [selectedDetailStudent, setSelectedDetailStudent] = useState<Student | null>(null);

  // Timing configuration modal states
  const [isAssignTimingModalOpen, setIsAssignTimingModalOpen] = useState(false);
  
  // Location & Timing Requests States
  const [requests, setRequests] = useState<any[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [processingRequestId, setProcessingRequestId] = useState<number | null>(null);
  const [pendingLocationData, setPendingLocationData] = useState<{
    studentId: number;
    locName: string;
    lat: number;
    lng: number;
    radius: number;
  } | null>(null);
  const [timingModalType, setTimingModalType] = useState<'permanent' | 'temporary'>('permanent');
  const [selectedStudentIdForTiming, setSelectedStudentIdForTiming] = useState<string>('');
  const [timingWorkStart, setTimingWorkStart] = useState('09:00');
  const [timingWorkEnd, setTimingWorkEnd] = useState('18:00');
  const [timingLunchStart, setTimingLunchStart] = useState('12:00');
  const [timingLunchEnd, setTimingLunchEnd] = useState('13:00');
  const [timingStartDate, setTimingStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [timingEndDate, setTimingEndDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [timingSubmitting, setTimingSubmitting] = useState(false);

  const handleAssignWorkTiming = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentIdForTiming) {
      showError('Please select an student');
      return;
    }
    if (!timingWorkStart || !timingWorkEnd) {
      showError('Work start and end times are required');
      return;
    }
    if (timingModalType === 'temporary' && (!timingStartDate || !timingEndDate)) {
      showError('Start and end dates are required for temporary work timings');
      return;
    }

    setTimingSubmitting(true);
    try {
      const payload = {
        studentId: parseInt(selectedStudentIdForTiming, 10),
        workStartTime: timingWorkStart.includes(':') && timingWorkStart.split(':').length === 2 ? `${timingWorkStart}:00` : timingWorkStart,
        workEndTime: timingWorkEnd.includes(':') && timingWorkEnd.split(':').length === 2 ? `${timingWorkEnd}:00` : timingWorkEnd,
        lunchStartTime: timingLunchStart ? (timingLunchStart.includes(':') && timingLunchStart.split(':').length === 2 ? `${timingLunchStart}:00` : timingLunchStart) : undefined,
        lunchEndTime: timingLunchEnd ? (timingLunchEnd.includes(':') && timingLunchEnd.split(':').length === 2 ? `${timingLunchEnd}:00` : timingLunchEnd) : undefined,
        isTemporary: timingModalType === 'temporary',
        startDate: timingModalType === 'temporary' ? timingStartDate : null,
        endDate: timingModalType === 'temporary' ? timingEndDate : null
      };

      const response = await adminApi.createWorkTiming(payload);
      if (response.status === 201 || response.data.success) {
        showSuccess(`Successfully assigned ${timingModalType} work timing`);
        setIsAssignTimingModalOpen(false);
        // Refresh work timings
        const updatedTimings = await adminApi.getWorkTimings();
        setWorkTimings(updatedTimings.data.data || []);
        fetchAllLocations();

        if (processingRequestId) {
          if (pendingLocationData) {
            const empToLoc = students.find(e => e.id === pendingLocationData.studentId);
            if (empToLoc) {
              setSelectedEmpForLocation(empToLoc);
              setLocationName(pendingLocationData.locName);
              setLocationLat(String(pendingLocationData.lat));
              setLocationLng(String(pendingLocationData.lng));
              setLocationRadius(String(pendingLocationData.radius));
              setCurrentLocation(null);
              setIsLocationModalOpen(true);
            }
            setPendingLocationData(null);
          } else {
            await adminApi.updateLocationTimingRequest(processingRequestId, {
              status: 'approved',
              adminNotes: 'Approved and assigned work timing.'
            });
            setProcessingRequestId(null);
            fetchRequests();
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      showError(err.response?.data?.error || 'Failed to assign work timing');
    } finally {
      setTimingSubmitting(false);
    }
  };

  const handleDeleteWorkTiming = async (id: number) => {
    if (!window.confirm('Are you sure you want to remove this work timing configuration?')) return;
    try {
      const response = await adminApi.deleteWorkTiming(id);
      if (response.status === 200 || response.data.success) {
        showSuccess('Successfully deleted work timing configuration');
        // Refresh work timings
        const updatedTimings = await adminApi.getWorkTimings();
        setWorkTimings(updatedTimings.data.data || []);
        fetchAllLocations();
      }
    } catch (err: any) {
      console.error(err);
      showError(err.response?.data?.error || 'Failed to delete work timing configuration');
    }
  };

  const fetchRequests = async () => {
    setRequestsLoading(true);
    try {
      const res = await adminApi.getLocationTimingRequests();
      setRequests(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch requests:', err);
    } finally {
      setRequestsLoading(false);
    }
  };

  const handleRejectRequest = async (requestId: number) => {
    if (!window.confirm('Are you sure you want to reject this request?')) return;
    try {
      const res = await adminApi.updateLocationTimingRequest(requestId, { status: 'rejected', adminNotes: 'Rejected by administrator.' });
      if (res.data.success || res.status === 200) {
        showSuccess('Request rejected successfully');
        fetchRequests();
      }
    } catch (err: any) {
      console.error(err);
      showError(err.response?.data?.error || 'Failed to reject request');
    }
  };

  const handleAcceptRequest = (req: any) => {
    const emp = students.find(e => e.id === req.student_id);
    if (!emp) {
      showError('Student not found in registry');
      return;
    }

    setProcessingRequestId(req.id);

    if (req.request_type === 'timing') {
      setTimingModalType(req.requested_is_temporary ? 'temporary' : 'permanent');
      setSelectedStudentIdForTiming(String(emp.id));
      setTimingWorkStart(req.requested_work_start_time ? req.requested_work_start_time.substring(0, 5) : '09:00');
      setTimingWorkEnd(req.requested_work_end_time ? req.requested_work_end_time.substring(0, 5) : '18:00');
      setTimingLunchStart('12:00');
      setTimingLunchEnd('13:00');
      if (req.requested_is_temporary) {
        setTimingStartDate(req.requested_start_date ? req.requested_start_date.split('T')[0] : new Date().toISOString().split('T')[0]);
        setTimingEndDate(req.requested_end_date ? req.requested_end_date.split('T')[0] : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
      }
      setIsAssignTimingModalOpen(true);
    } else if (req.request_type === 'location') {
      setSelectedEmpForLocation(emp);
      setLocationName(req.requested_location_name || 'Assigned Location');
      setLocationLat(String(req.requested_latitude || ''));
      setLocationLng(String(req.requested_longitude || ''));
      setLocationRadius(String(req.requested_radius_meters || '500'));
      setCurrentLocation(null);
      setIsLocationModalOpen(true);
    } else if (req.request_type === 'both') {
      setPendingLocationData({
        studentId: emp.id,
        locName: req.requested_location_name || 'Assigned Location',
        lat: req.requested_latitude || 0,
        lng: req.requested_longitude || 0,
        radius: req.requested_radius_meters || 500
      });

      setTimingModalType(req.requested_is_temporary ? 'temporary' : 'permanent');
      setSelectedStudentIdForTiming(String(emp.id));
      setTimingWorkStart(req.requested_work_start_time ? req.requested_work_start_time.substring(0, 5) : '09:00');
      setTimingWorkEnd(req.requested_work_end_time ? req.requested_work_end_time.substring(0, 5) : '18:00');
      setTimingLunchStart('12:00');
      setTimingLunchEnd('13:00');
      if (req.requested_is_temporary) {
        setTimingStartDate(req.requested_start_date ? req.requested_start_date.split('T')[0] : new Date().toISOString().split('T')[0]);
        setTimingEndDate(req.requested_end_date ? req.requested_end_date.split('T')[0] : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
      }
      setIsAssignTimingModalOpen(true);
    }
  };

  // Direct Face Management State
  const [selectedEmpForFace, setSelectedEmpForFace] = useState<Student | null>(null);
  const [isDirectFaceModalOpen, setIsDirectFaceModalOpen] = useState(false);
  const [directFaceFrames, setDirectFaceFrames] = useState<{ data: string; timestamp: number }[]>([]);
  const [isDirectFaceSubmitting, setIsDirectFaceSubmitting] = useState(false);

  // Approvals queue states
  const [pendingRequests, setPendingRequests] = useState<FaceChangeRequest[]>([]);
  const [pendingRecoveries, setPendingRecoveries] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<FaceAuditLog[]>([]);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [approvingRecoveryId, setApprovingRecoveryId] = useState<number | null>(null);
  const [rejectingRecoveryId, setRejectingRecoveryId] = useState<number | null>(null);
  const [actionNotes, setActionNotes] = useState<string>('');
  const [recoveryNotes, setRecoveryNotes] = useState<string>('');
  const [pendingLeaveRequests, setPendingLeaveRequests] = useState<LeaveRequest[]>([]);
  const [approvingLeaveId, setApprovingLeaveId] = useState<number | null>(null);
  const [rejectingLeaveId, setRejectingLeaveId] = useState<number | null>(null);
  const [leaveActionReason, setLeaveActionReason] = useState<string>('');
  const [previewAttachment, setPreviewAttachment] = useState<{ data: string; name: string } | null>(null);

  // UI state
  const [activeTab, setActiveTab] = useState<Tab>('hierarchy');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [expandedTeachers, setExpandedTeachers] = useState<Set<number>>(new Set());

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateStudentForm>(INITIAL_FORM);
  const [formLoading, setFormLoading] = useState(false);

  // Assignment modal
  const [assignTargetStudent, setAssignTargetStudent] = useState<Student | null>(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [assignLoading, setAssignLoading] = useState(false);

  const handleAssignTeacher = async () => {
    if (!assignTargetStudent) return;
    if (!selectedTeacherId) {
      showError('Please select a teacher');
      return;
    }

    setAssignLoading(true);
    try {
      const response = await adminApi.updateStudent(assignTargetStudent.id, {
        teacherId: parseInt(selectedTeacherId, 10)
      });

      if (response.data.success || response.status === 200) {
        showSuccess(`Successfully assigned ${assignTargetStudent.first_name} ${assignTargetStudent.last_name} to teacher`);
        setAssignTargetStudent(null);
        setSelectedTeacherId('');
        fetchData();
      }
    } catch (err: any) {
      console.error(err);
      showError(err.response?.data?.error || 'Failed to assign teacher');
    } finally {
      setAssignLoading(false);
    }
  };

  // Change Password Modal States
  const [selectedEmpForPassword, setSelectedEmpForPassword] = useState<Student | null>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Location Assignment Modal States
  const [selectedEmpForLocation, setSelectedEmpForLocation] = useState<Student | null>(null);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<StudentLocation | null>(null);
  const [locationName, setLocationName] = useState('');
  const [locationLat, setLocationLat] = useState('');
  const [locationLng, setLocationLng] = useState('');
  const [locationRadius, setLocationRadius] = useState('500');
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationFetching, setLocationFetching] = useState(false);

  // Bulk location rows: keyed by student numeric id for O(1) lookup in table
  const [studentLocationRows, setStudentLocationRows] = useState<Record<number, StudentLocationRow>>({}); 
  const [locationRowsLoading, setLocationRowsLoading] = useState(false);

  // Fetch ALL student locations from bulk endpoint — call after tab switch & after mutations
  const fetchAllLocations = async (silent: boolean | React.MouseEvent<any> = false) => {
    const isSilent = typeof silent === 'boolean' ? silent : false;
    if (!isSilent) setLocationRowsLoading(true);
    try {
      const res = await adminApi.getAllStudentLocations();
      const rows = res.data.data || [];
      const map: Record<number, StudentLocationRow> = {};
      rows.forEach((row) => { map[row.id] = row; });
      setStudentLocationRows(map);
    } catch (err) {
      console.error('Failed to load student locations:', err);
    } finally {
      if (!isSilent) setLocationRowsLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!selectedEmpForPassword) return;
    if (!newPassword || newPassword.trim() === '') {
      showError('Password cannot be empty');
      return;
    }

    setPasswordLoading(true);
    try {
      const response = await adminApi.updateStudent(selectedEmpForPassword.id, {
        password: newPassword
      });

      if (response.data.success || response.status === 200) {
        showSuccess(`Successfully updated password for ${selectedEmpForPassword.first_name} ${selectedEmpForPassword.last_name}`);
        setIsPasswordModalOpen(false);
        setSelectedEmpForPassword(null);
        setNewPassword('');
        fetchData();
      }
    } catch (err: any) {
      console.error(err);
      showError(err.response?.data?.error || 'Failed to update password');
    } finally {
      setPasswordLoading(false);
    }
  };

  const openLocationModal = async (emp: Student) => {
    setSelectedEmpForLocation(emp);
    setLocationName('');
    setLocationLat('');
    setLocationLng('');
    setLocationRadius('500');
    setCurrentLocation(null);
    setIsLocationModalOpen(true);
    setLocationFetching(true);
    try {
      const res = await adminApi.getStudentLocation(emp.id);
      if (res.data.data) {
        const loc = res.data.data;
        setCurrentLocation(loc);
        setLocationName(loc.name);
        setLocationLat(String(loc.latitude));
        setLocationLng(String(loc.longitude));
        setLocationRadius(String(loc.radius_meters));
      }
    } catch (err) {
      console.error('Failed to fetch student location:', err);
    } finally {
      setLocationFetching(false);
    }
  };

  const handleAssignLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpForLocation) return;
    const lat = parseFloat(locationLat);
    const lng = parseFloat(locationLng);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      showError('Please enter valid latitude (-90 to 90) and longitude (-180 to 180) values');
      return;
    }
    if (!locationName.trim()) {
      showError('Location name is required');
      return;
    }
    setLocationLoading(true);
    try {
      await adminApi.assignStudentLocation(selectedEmpForLocation.id, {
        name: locationName.trim(),
        latitude: lat,
        longitude: lng,
        radiusMeters: parseInt(locationRadius, 10) || 500,
      });
      showSuccess(`Work location assigned to ${selectedEmpForLocation.first_name} ${selectedEmpForLocation.last_name}`);
      setIsLocationModalOpen(false);
      setSelectedEmpForLocation(null);
      fetchData();
      fetchAllLocations(); // refresh real-time location table

      if (processingRequestId) {
        await adminApi.updateLocationTimingRequest(processingRequestId, {
          status: 'approved',
          adminNotes: 'Approved and assigned work location.'
        });
        setProcessingRequestId(null);
        fetchRequests();
      }
    } catch (err: any) {
      showError(err.response?.data?.error || 'Failed to assign location');
    } finally {
      setLocationLoading(false);
    }
  };

  const handleRemoveLocation = async () => {
    if (!selectedEmpForLocation) return;
    if (!window.confirm(`Remove work location for ${selectedEmpForLocation.first_name} ${selectedEmpForLocation.last_name}? They will fall back to the global office location.`)) return;
    setLocationLoading(true);
    try {
      await adminApi.removeStudentLocation(selectedEmpForLocation.id);
      showSuccess('Work location removed successfully');
      setIsLocationModalOpen(false);
      setSelectedEmpForLocation(null);
      fetchData();
      fetchAllLocations(); // refresh real-time location table
    } catch (err: any) {
      showError(err.response?.data?.error || 'Failed to remove location');
    } finally {
      setLocationLoading(false);
    }
  };

  // Fetch all data
  const fetchData = async (silent: boolean | React.MouseEvent<any> = false) => {
    const isSilent = typeof silent === 'boolean' ? silent : false;
    if (!isSilent) setLoading(true);
    try {
      const [empResult, hierarchyResult, timingsResult, pendingResult, logsResult, leaveResult, recoveryResult] = await Promise.allSettled([
        adminApi.getStudents({ limit: 200 }),
        adminApi.getHierarchy(),
        adminApi.getWorkTimings(),
        faceManagementApi.getPendingRequests(),
        faceManagementApi.getHistory(),
        leaveApi.getTeamRequests(200),
        adminApi.getPendingRecoveries(),
      ]);

      if (empResult.status === 'fulfilled') {
        setStudents(empResult.value.data.data || []);
      }

      if (hierarchyResult.status === 'fulfilled') {
        const data = hierarchyResult.value.data.data;
        setTeachers(data.teachers || []);
        setUnassignedStudents(data.unassignedStudents || []);
      }

      if (timingsResult.status === 'fulfilled') {
        setWorkTimings(timingsResult.value.data.data || []);
      }

      if (pendingResult.status === 'fulfilled' && pendingResult.value.data.success) {
        setPendingRequests(pendingResult.value.data.data);
      }

      if (logsResult.status === 'fulfilled' && logsResult.value.data.success) {
        setAuditLogs(logsResult.value.data.data);
      }

      if (leaveResult.status === 'fulfilled') {
        setPendingLeaveRequests((leaveResult.value.data || []).filter((r: LeaveRequest) => r.status === 'pending'));
      }

      if (recoveryResult && recoveryResult.status === 'fulfilled' && recoveryResult.value.data.success) {
        setPendingRecoveries(recoveryResult.value.data.data);
      }
    } catch (err) {
      console.error('Admin data fetch error:', err);
      if (!isSilent) showError('Failed to load admin data');
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  const fetchLeaveRequests = async () => {
    try {
      const response = await leaveApi.getTeamRequests(200);
      setPendingLeaveRequests((response.data || []).filter((r: LeaveRequest) => r.status === 'pending'));
    } catch (err) {
      console.error('Failed to fetch pending leave requests:', err);
    }
  };

  const handleApproveLeave = async (id: number) => {
    try {
      setApprovingLeaveId(id);
      const response = await leaveApi.approveRequest(id);
      if (response.status === 200 || response.data) {
        showSuccess('Leave request approved successfully!');
        setApprovingLeaveId(null);
        fetchLeaveRequests();
      }
    } catch (err: any) {
      showError(err.response?.data?.error || err.response?.data?.message || 'Failed to approve leave request');
      setApprovingLeaveId(null);
    }
  };

  const handleRejectLeave = async (id: number) => {
    if (!leaveActionReason.trim()) {
      showError('Please provide a rejection reason');
      return;
    }
    try {
      setRejectingLeaveId(id);
      const response = await leaveApi.rejectRequest(id, leaveActionReason);
      if (response.status === 200 || response.data) {
        showSuccess('Leave request rejected successfully!');
        setLeaveActionReason('');
        setRejectingLeaveId(null);
        fetchLeaveRequests();
      }
    } catch (err: any) {
      showError(err.response?.data?.error || err.response?.data?.message || 'Failed to reject leave request');
      setRejectingLeaveId(null);
    }
  };

  const handleDirectFaceFrameCapture = (frame: string) => {
    const base64Data = frame.replace('data:image/jpeg;base64,', '');
    setDirectFaceFrames((prev) => [
      ...prev.slice(-19),
      {
        data: base64Data,
        timestamp: Date.now(),
      },
    ]);
  };

  const handleSubmitDirectFace = async () => {
    if (!selectedEmpForFace) return;
    if (directFaceFrames.length < 10) {
      showError('Please capture at least 10 frames before submitting.');
      return;
    }

    try {
      setIsDirectFaceSubmitting(true);
      const response = await faceManagementApi.adminRegister(
        selectedEmpForFace.student_id,
        directFaceFrames.map(f => f.data)
      );

      if (response.data.success) {
        showSuccess(`Face profile registered successfully for ${selectedEmpForFace.first_name}`);
        setIsDirectFaceModalOpen(false);
        setSelectedEmpForFace(null);
        setDirectFaceFrames([]);
        fetchData();
      } else {
        showError(response.data.message || 'Failed to register face.');
      }
    } catch (err: any) {
      showError(err.response?.data?.error || err.response?.data?.message || 'Error occurred during registration.');
    } finally {
      setIsDirectFaceSubmitting(false);
    }
  };

  const handleDirectFaceDelete = async (emp: Student) => {
    if (!window.confirm(`Are you sure you want to delete the face profile for ${emp.first_name} ${emp.last_name}?`)) return;
    try {
      const response = await faceManagementApi.adminDelete(emp.student_id);
      if (response.data.success) {
        showSuccess(`Face profile deleted for ${emp.first_name} ${emp.last_name}`);
        fetchData();
      } else {
        showError(response.data.message || 'Failed to delete face.');
      }
    } catch (err: any) {
      showError(err.response?.data?.error || err.response?.data?.message || 'Error occurred during deletion.');
    }
  };

  const handleApprove = async (id: number) => {
    try {
      setApprovingId(id);
      const response = await faceManagementApi.approveRequest(id, actionNotes);
      if (response.data.success) {
        showSuccess('Face change request approved and applied successfully!');
        setActionNotes('');
        setApprovingId(null);
        fetchData();
      }
    } catch (err: any) {
      showError(err.response?.data?.error || err.response?.data?.message || 'Failed to approve request');
      setApprovingId(null);
    }
  };

  const handleReject = async (id: number) => {
    try {
      setRejectingId(id);
      const response = await faceManagementApi.rejectRequest(id, actionNotes);
      if (response.data.success) {
        showSuccess('Face change request rejected successfully!');
        setActionNotes('');
        setRejectingId(null);
        fetchData();
      }
    } catch (err: any) {
      showError(err.response?.data?.error || err.response?.data?.message || 'Failed to reject request');
      setRejectingId(null);
    }
  };

  const handleApproveRecovery = async (id: number) => {
    try {
      setApprovingRecoveryId(id);
      const response = await adminApi.approveRecovery(id, recoveryNotes);
      if (response.data.success) {
        showSuccess('Account recovery request approved successfully!');
        setRecoveryNotes('');
        setApprovingRecoveryId(null);
        fetchData();
      }
    } catch (err: any) {
      showError(err.response?.data?.error || err.response?.data?.message || 'Failed to approve recovery request');
      setApprovingRecoveryId(null);
    }
  };

  const handleRejectRecovery = async (id: number) => {
    try {
      setRejectingRecoveryId(id);
      const response = await adminApi.rejectRecovery(id, recoveryNotes);
      if (response.data.success) {
        showSuccess('Account recovery request rejected successfully!');
        setRecoveryNotes('');
        setRejectingRecoveryId(null);
        fetchData();
      }
    } catch (err: any) {
      showError(err.response?.data?.error || err.response?.data?.message || 'Failed to reject recovery request');
      setRejectingRecoveryId(null);
    }
  };

  useEffect(() => {
    fetchData();
    fetchAllLocations();
    fetchRequests();

    const interval = setInterval(() => {
      fetchData(true);
      fetchAllLocations(true);
      // Fetch requests silently in background
      adminApi.getLocationTimingRequests().then(res => {
        setRequests(res.data.data || []);
      }).catch(err => console.error(err));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleNewRequest = (data: any) => {
      console.log('[WS] New location/timing request received:', data);
      setRequests(prev => {
        if (prev.some(r => r.id === data.id)) return prev;
        return [data, ...prev];
      });
    };

    const handleUpdatedRequest = (data: any) => {
      console.log('[WS] Request updated:', data);
      setRequests(prev => prev.map(r => r.id === data.id ? { ...r, ...data } : r));
    };

    websocketService.on('location_timing_request_new', handleNewRequest);
    websocketService.on('location_timing_request_updated', handleUpdatedRequest);

    return () => {
      websocketService.off('location_timing_request_new', handleNewRequest);
      websocketService.off('location_timing_request_updated', handleUpdatedRequest);
    };
  }, []);

  // Filter students
  const filteredStudents = students.filter(emp => {
    const matchesSearch = !searchQuery
      || `${emp.first_name} ${emp.last_name} ${emp.student_id} ${emp.email}`.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = !filterDept || emp.department === filterDept;
    const matchesRole = !filterRole || emp.role === filterRole;
    return matchesSearch && matchesDept && matchesRole;
  });

  const departments = [...new Set(students.map(e => e.department).filter(Boolean))].sort();

  // Toggle teacher expansion in hierarchy
  const toggleTeacher = (id: number) => {
    setExpandedTeachers(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Toggle teacher expansion in Teachers management tab
  const toggleTeacherTab = (id: number) => {
    setExpandedTeachersTab(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Helper to get teacher name from id
  const getTeacherName = (teacherId?: number | null) => {
    if (!teacherId) return 'None';
    const sup = students.find(e => e.id === teacherId);
    return sup ? `${sup.first_name} ${sup.last_name} (${sup.student_id})` : `ID: ${teacherId}`;
  };

  // Create student handler
  const handleCreateStudent = async () => {
    if (
      !createForm.studentId ||
      !createForm.firstName ||
      !createForm.lastName ||
      !createForm.email ||
      !createForm.department ||
      !createForm.position
    ) {
      showError('Student ID, name, email, department, and position are required');
      return;
    }

    setFormLoading(true);
    try {
      await adminApi.createStudent({
        studentId: createForm.studentId,
        firstName: createForm.firstName,
        lastName: createForm.lastName,
        email: createForm.email,
        phoneNumber: createForm.phoneNumber || undefined,
        department: createForm.department,
        position: createForm.position,
        role: createForm.role,
        teacherId: createForm.teacherId ? parseInt(createForm.teacherId) : undefined,
        hireDate: createForm.hireDate,
        password: createForm.password || undefined,
      });
      showSuccess(`Student ${createForm.firstName} ${createForm.lastName} created successfully`);
      setShowCreateModal(false);
      setCreateForm(INITIAL_FORM);
      fetchData();
    } catch (err: any) {
      showError(err.response?.data?.error || err.response?.data?.message || 'Failed to create student');
    } finally {
      setFormLoading(false);
    }
  };

  // Deactivate student
  const handleDeactivate = async (emp: Student) => {
    if (!window.confirm(`Deactivate ${emp.first_name} ${emp.last_name}? They will no longer be able to log in.`)) return;
    try {
      await adminApi.updateStudent(emp.id, { isActive: false });
      showSuccess(`${emp.first_name} ${emp.last_name} has been deactivated`);
      fetchData();
    } catch (err: any) {
      showError(err.response?.data?.error || err.response?.data?.message || 'Failed to deactivate student');
    }
  };

  // Activate student
  const handleActivate = async (emp: Student) => {
    try {
      await adminApi.updateStudent(emp.id, { isActive: true });
      showSuccess(`${emp.first_name} ${emp.last_name} has been activated successfully`);
      fetchData();
    } catch (err: any) {
      showError(err.response?.data?.error || err.response?.data?.message || 'Failed to activate student');
    }
  };

  // Remove student (hard delete)
  const handleRemoveStudent = async (emp: Student) => {
    if (!window.confirm(`Are you sure you want to PERMANENTLY remove student ${emp.first_name} ${emp.last_name} and all their records from the database? This action cannot be undone.`)) return;
    try {
      await adminApi.deactivateStudent(emp.id);
      showSuccess(`Student ${emp.first_name} ${emp.last_name} removed successfully`);
      fetchData();
    } catch (err: any) {
      showError(err.response?.data?.error || err.response?.data?.message || 'Failed to remove student');
    }
  };

  // Tabs configuration
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'hierarchy', label: 'Org Hierarchy', icon: <FaBuilding /> },
    { id: 'students', label: 'All Students', icon: <FaUsers /> },
    { id: 'teachers', label: 'Teachers', icon: <FaShieldAlt /> },
    { id: 'timings', label: 'Work Timings', icon: <FaClock /> },
    { id: 'mfa', label: 'MFA Status', icon: <FaLock /> },
    { id: 'approvals', label: 'Face Approvals', icon: <FaCheck /> },
    { id: 'leaves', label: 'Leave Approvals', icon: <FaClock /> },
    { id: 'system', label: 'System Settings', icon: <FaSync /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-5 sm:px-6 lg:px-8 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <FaShieldAlt className="text-blue-600" />
              Admin Management Portal
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Logged in as <span className="font-medium text-gray-700">{user?.firstName} {user?.lastName}</span>
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 font-medium text-sm"
            id="create-student-btn"
          >
            <FaUserPlus />
            Add Student
          </motion.button>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-1 py-0">
            {tabs.map(tab => (
              <button
                key={tab.id}
                id={`admin-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <div className="h-12 w-12 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin mx-auto" />
              <p className="mt-4 text-gray-500 text-sm">Loading admin data...</p>
            </div>
          </div>
        ) : (
          <>
            {/* ── ORG HIERARCHY TAB ── */}
            {activeTab === 'hierarchy' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-semibold text-gray-900">Organizational Hierarchy</h2>
                  <div className="text-sm text-gray-500">
                    {teachers.length} teachers · {unassignedStudents.length} unassigned students
                  </div>
                </div>

                {/* Teachers with their teams */}
                {teachers.length === 0 ? (
                  <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                    <FaUsers className="mx-auto text-4xl text-gray-300 mb-3" />
                    <p className="text-gray-500">No teachers found. Add a teacher to build the hierarchy.</p>
                  </div>
                ) : (
                  teachers.map(sup => (
                    <div key={sup.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div
                        className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => toggleTeacher(sup.id)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm">
                            {sup.first_name[0]}{sup.last_name[0]}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{sup.first_name} {sup.last_name}</p>
                            <p className="text-sm text-gray-500">{sup.department} · {sup.student_id}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-600 bg-blue-50 px-3 py-1 rounded-full">
                            {(sup.assigned_students || []).length} team member{(sup.assigned_students || []).length !== 1 ? 's' : ''}
                          </span>
                          <RoleBadge role={sup.role} />
                          {expandedTeachers.has(sup.id) ? (
                            <FaChevronDown className="text-gray-400" />
                          ) : (
                            <FaChevronRight className="text-gray-400" />
                          )}
                        </div>
                      </div>

                      <AnimatePresence>
                        {expandedTeachers.has(sup.id) && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="border-t border-gray-100">
                              {(sup.assigned_students || []).length === 0 ? (
                                <div className="px-6 py-4 text-sm text-gray-500 italic">
                                  No students assigned to this teacher
                                </div>
                              ) : (
                                <div className="divide-y divide-gray-100">
                                  {(sup.assigned_students || []).map(emp => (
                                    <div
                                      key={emp.id}
                                      className="px-6 py-3 flex items-center justify-between hover:bg-gray-50 pl-14"
                                    >
                                      <div className="flex items-center gap-2">
                                        <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-xs font-medium">
                                          {emp.first_name[0]}{emp.last_name[0]}
                                        </div>
                                        <div>
                                          <p className="text-sm font-medium text-gray-900">{emp.first_name} {emp.last_name}</p>
                                          <p className="text-xs text-gray-500">{emp.student_id} · {emp.position}</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <StatusDot active={emp.is_active} />
                                        <span className="text-xs text-gray-500">{emp.is_active ? 'Active' : 'Inactive'}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))
                )}

                {/* Unassigned students */}
                {unassignedStudents.length > 0 && (
                  <div className="bg-white rounded-xl border border-amber-200 shadow-sm">
                    <div className="px-6 py-4 border-b border-amber-100 flex items-center gap-2">
                      <FaUnlink className="text-amber-500" />
                      <h3 className="font-semibold text-gray-900">Unassigned Students</h3>
                      <span className="ml-auto text-sm text-amber-600 bg-amber-50 px-3 py-1 rounded-full">
                        {unassignedStudents.length} student{unassignedStudents.length !== 1 ? 's' : ''} need assignment
                      </span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {unassignedStudents.map(emp => (
                        <div key={emp.id} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-xs font-medium">
                              {emp.first_name[0]}{emp.last_name[0]}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{emp.first_name} {emp.last_name}</p>
                              <p className="text-xs text-gray-500">{emp.student_id} · {emp.department} · {emp.position}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setAssignTargetStudent(emp);
                              setSelectedTeacherId('');
                            }}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            <FaLink className="text-xs" />
                            Assign
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── STUDENTS TAB ── */}
            {activeTab === 'students' && (
              <div className="space-y-5">
                {/* Search & Filters */}
                <div className="flex flex-wrap gap-3 items-center">
                  <div className="flex-1 min-w-64 relative">
                    <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                    <input
                      id="student-search"
                      type="text"
                      placeholder="Search by name, ID, or email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <select
                    id="filter-department"
                    value={filterDept}
                    onChange={(e) => setFilterDept(e.target.value)}
                    className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Departments</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select
                    id="filter-role"
                    value={filterRole}
                    onChange={(e) => setFilterRole(e.target.value)}
                    className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Roles</option>
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                    <option value="admin">Admin</option>
                  </select>
                  <span className="text-sm text-gray-500 ml-auto">
                    {filteredStudents.length} of {students.length} students
                  </span>
                </div>

                {/* Student Table */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Face Auth</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredStudents.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-12 text-center text-gray-500 text-sm">
                              No students found matching your filters
                            </td>
                          </tr>
                        ) : (
                          filteredStudents.map((emp) => (
                            <motion.tr
                              key={emp.id}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="hover:bg-gray-50"
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-semibold">
                                    {emp.first_name[0]}{emp.last_name[0]}
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-gray-900">{emp.first_name} {emp.last_name}</p>
                                    <p className="text-xs text-gray-500">{emp.student_id} · {emp.email}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">{emp.department}</td>
                              <td className="px-4 py-3"><RoleBadge role={emp.role} /></td>
                              <td className="px-4 py-3">
                                {emp.face_enrolled ? (
                                  <span className="flex items-center gap-1 text-green-600 text-xs">
                                    <FaCheck /> Enrolled
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-400">Not enrolled</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`flex items-center gap-1 text-xs font-medium ${emp.is_active ? 'text-green-700' : 'text-gray-400'}`}>
                                  <StatusDot active={emp.is_active} />
                                  {emp.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex gap-2">
                                  {emp.is_active && (
                                    <>
                                      <button
                                        onClick={() => {
                                          setSelectedEmpForFace(emp);
                                          setDirectFaceFrames([]);
                                          setIsDirectFaceModalOpen(true);
                                        }}
                                        className="p-1.5 text-blue-500 hover:bg-blue-50 rounded transition-colors"
                                        title={emp.face_enrolled ? "Replace face profile" : "Enroll face profile"}
                                      >
                                        <FaCamera className="text-sm" />
                                      </button>
                                      {emp.face_enrolled && (
                                        <button
                                          onClick={() => handleDirectFaceDelete(emp)}
                                          className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                                          title="Delete face profile"
                                        >
                                          <FaTrash className="text-sm" />
                                        </button>
                                      )}
                                    </>
                                  )}
                                    <button
                                      onClick={() => openLocationModal(emp)}
                                      className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                                      title="Assign work location"
                                    >
                                      <FaMapMarkerAlt className="text-sm" />
                                    </button>
                                    {emp.student_id !== 'admin' && (
                                      <>
                                        <button
                                          onClick={() => {
                                            setSelectedEmpForPassword(emp);
                                            setNewPassword('');
                                            setIsPasswordModalOpen(true);
                                          }}
                                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                          title="Change password"
                                        >
                                          <FaKey className="text-sm" />
                                        </button>
                                        {emp.is_active ? (
                                          <button
                                            onClick={() => handleDeactivate(emp)}
                                            className="p-1.5 text-orange-500 hover:bg-orange-50 rounded transition-colors"
                                            title="Deactivate student"
                                          >
                                            <FaUserSlash className="text-sm" />
                                          </button>
                                        ) : (
                                          <button
                                            onClick={() => handleActivate(emp)}
                                            className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                                            title="Activate student"
                                          >
                                            <FaUserCheck className="text-sm" />
                                          </button>
                                        )}
                                        <button
                                          onClick={() => handleRemoveStudent(emp)}
                                          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                          title="Remove student"
                                        >
                                          <FaUserMinus className="text-sm" />
                                        </button>
                                      </>
                                    )}
                                </div>
                              </td>
                            </motion.tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── TEACHERS TAB ── */}
            {activeTab === 'teachers' && (
              <div className="space-y-5 animate-in fade-in duration-200">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Teacher Management</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Click on any teacher card to view and manage their assigned students.</p>
                  </div>
                  <div className="text-sm text-gray-500 font-medium">
                    {teachers.length} Teachers
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {teachers.length === 0 ? (
                    <div className="col-span-3 bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
                      <FaUsers className="mx-auto text-5xl text-gray-300 mb-3" />
                      <p className="text-gray-900 font-semibold text-lg">No teachers configured yet.</p>
                      <p className="text-sm text-gray-500 mt-1">Create a teacher from the Add Student modal.</p>
                      <button
                        onClick={() => { setCreateForm({ ...INITIAL_FORM, role: 'teacher' }); setShowCreateModal(true); }}
                        className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm inline-flex items-center gap-2"
                      >
                        <FaUserPlus /> Create Teacher
                      </button>
                    </div>
                  ) : (
                    teachers.map(sup => {
                      const isExpanded = expandedTeachersTab.has(sup.id);
                      return (
                        <div
                          key={sup.id}
                          onClick={() => toggleTeacherTab(sup.id)}
                          className={`cursor-pointer bg-white rounded-2xl border transition-all duration-300 p-5 shadow-sm hover:shadow-md select-none flex flex-col justify-between relative overflow-hidden group ${
                            isExpanded ? 'border-blue-500 ring-2 ring-blue-100 ring-offset-0' : 'border-gray-200 hover:border-blue-300'
                          }`}
                        >
                          {/* Accent Line */}
                          <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${
                            sup.role === 'admin' ? 'from-purple-500 to-indigo-500' : 'from-blue-500 to-indigo-500'
                          }`} />

                          <div>
                            {/* Card Header */}
                            <div className="flex items-start justify-between mb-4 mt-1">
                              <div className="flex items-center gap-3">
                                <div className={`h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm bg-gradient-to-br ${
                                  sup.role === 'admin' ? 'from-purple-500 to-indigo-600' : 'from-blue-500 to-indigo-600'
                                }`}>
                                  {sup.first_name[0]}{sup.last_name[0]}
                                </div>
                                <div>
                                  <p className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors flex items-center gap-1.5">
                                    {sup.first_name} {sup.last_name}
                                  </p>
                                  <p className="text-xs text-gray-500 font-medium font-mono">{sup.student_id}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <RoleBadge role={sup.role} />
                                <div className="text-gray-400 group-hover:text-gray-600 transition-colors p-1">
                                  {isExpanded ? <FaChevronDown className="text-xs text-blue-500" /> : <FaChevronRight className="text-xs" />}
                                </div>
                              </div>
                            </div>

                            {/* Teacher Info Grid */}
                            <div className="grid grid-cols-1 gap-2.5 text-sm border-t border-b border-gray-100 py-3.5 my-3">
                              <div className="flex justify-between items-center">
                                <span className="text-gray-500 font-medium">Department</span>
                                <span className="text-gray-800 font-semibold">{sup.department || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-gray-500 font-medium">Position</span>
                                <span className="text-gray-800 font-semibold truncate max-w-[150px]" title={sup.position}>{sup.position || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-gray-500 font-medium">Email</span>
                                <span className="text-gray-800 font-semibold truncate max-w-[180px]" title={sup.email}>{sup.email || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-gray-500 font-medium">Team Size</span>
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700">
                                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                                  {(sup.assigned_students || []).length} active students
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Interactive Section: View Teacher Profile Button */}
                          <div className="flex justify-between items-center pt-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const fullSup = students.find(x => x.id === sup.id) || sup;
                                setSelectedDetailStudent(fullSup);
                              }}
                              className="text-xs text-gray-500 hover:text-blue-600 font-semibold flex items-center gap-1 transition-colors"
                            >
                              <FaUsers className="text-gray-400 group-hover:text-blue-500" /> View Teacher Profile
                            </button>
                            <span className="text-xs text-blue-600 group-hover:underline font-semibold">
                              {isExpanded ? 'Hide Team' : 'Show Team'}
                            </span>
                          </div>

                          {/* Expanded Team Members List */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25 }}
                                className="overflow-hidden"
                              >
                                <div className="border-t border-gray-100 mt-4 pt-4">
                                  <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                                    Students Under {sup.first_name}
                                  </h4>
                                  {(sup.assigned_students || []).length === 0 ? (
                                    <div className="text-xs text-gray-400 italic py-2 text-center">
                                      No students currently assigned
                                    </div>
                                  ) : (
                                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                                      {(sup.assigned_students || []).map(emp => (
                                        <div
                                          key={emp.id}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            // Find the full student from students list
                                            const fullEmp = students.find(x => x.id === emp.id) || emp;
                                            setSelectedDetailStudent(fullEmp);
                                          }}
                                          className="flex items-center justify-between p-2 rounded-xl hover:bg-blue-50/60 border border-transparent hover:border-blue-100/50 transition-all cursor-pointer group/item"
                                        >
                                          <div className="flex items-center gap-2.5">
                                            <div className="h-8 w-8 rounded-full bg-gray-100 group-hover/item:bg-blue-100 group-hover/item:text-blue-700 flex items-center justify-center text-gray-600 text-xs font-bold transition-colors">
                                              {emp.first_name[0]}{emp.last_name[0]}
                                            </div>
                                            <div>
                                              <p className="text-xs font-bold text-gray-900 group-hover/item:text-blue-700 transition-colors">
                                                {emp.first_name} {emp.last_name}
                                              </p>
                                              <p className="text-[10px] text-gray-500 font-medium">{emp.position || 'Student'}</p>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] text-gray-400 group-hover/item:text-blue-600 font-semibold opacity-0 group-hover/item:opacity-100 transition-all">
                                              View Details
                                            </span>
                                            <FaChevronRight className="text-[8px] text-gray-300 group-hover/item:text-blue-500 transform translate-x-0 group-hover/item:translate-x-0.5 transition-all" />
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* ── WORK TIMINGS TAB ── */}
            {activeTab === 'timings' && (
              <div className="space-y-8">
                {/* Permanent Timings Section */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">Work Timings Configuration</h2>
                      <p className="text-sm text-gray-500">Configure permanent working hours for students and teachers.</p>
                    </div>
                    <button
                      onClick={() => {
                        setTimingModalType('permanent');
                        setSelectedStudentIdForTiming('');
                        setTimingWorkStart('09:00');
                        setTimingWorkEnd('18:00');
                        setTimingLunchStart('12:00');
                        setTimingLunchEnd('13:00');
                        setIsAssignTimingModalOpen(true);
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 shadow"
                    >
                      <FaClock />
                      Assign Permanent Shift
                    </button>
                  </div>

                  {workTimings.filter(t => !t.is_temporary).length === 0 ? (
                    <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
                      <FaClock className="mx-auto text-4xl text-gray-300 mb-3" />
                      <p className="text-gray-900 font-semibold text-base">No work timings configured.</p>
                      <p className="text-sm text-gray-500 mt-1">The system will use default 9:00 AM - 6:00 PM schedule.</p>
                    </div>
                  ) : (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Work Hours</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lunch Break</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {workTimings.filter(t => !t.is_temporary).map(timing => (
                            <tr key={timing.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                {timing.first_name ? (
                                  <div>
                                    <p className="font-semibold">{timing.first_name} {timing.last_name}</p>
                                    <p className="text-xs text-gray-500 font-mono">{timing.student_code}</p>
                                  </div>
                                ) : (
                                  timing.student_id ? `Student #${timing.student_id}` : timing.department || 'Default (All)'
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                                {timing.work_start_time} – {timing.work_end_time}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                                {timing.lunch_start_time && timing.lunch_end_time
                                  ? `${timing.lunch_start_time} – ${timing.lunch_end_time}`
                                  : '—'}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                <button
                                  onClick={() => handleDeleteWorkTiming(timing.id)}
                                  className="text-red-600 hover:text-red-800 font-medium flex items-center gap-1"
                                >
                                  <FaTrash /> Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Temporary Timings Section */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">Temporary Work Timings</h2>
                      <p className="text-sm text-gray-500">Configure temporary work timings with active date ranges.</p>
                    </div>
                    <button
                      onClick={() => {
                        setTimingModalType('temporary');
                        setSelectedStudentIdForTiming('');
                        setTimingWorkStart('09:00');
                        setTimingWorkEnd('18:00');
                        setTimingLunchStart('12:00');
                        setTimingLunchEnd('13:00');
                        setTimingStartDate(new Date().toISOString().split('T')[0]);
                        setTimingEndDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
                        setIsAssignTimingModalOpen(true);
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 shadow"
                    >
                      <FaClock />
                      Assign Temporary Shift
                    </button>
                  </div>

                  {workTimings.filter(t => t.is_temporary).length === 0 ? (
                    <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
                      <FaClock className="mx-auto text-4xl text-gray-300 mb-3" />
                      <p className="text-gray-900 font-semibold text-base">No temporary work timings configured.</p>
                      <p className="text-sm text-gray-500 mt-1">Standard permanent shifts or default schedule will be used.</p>
                    </div>
                  ) : (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date Range</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Work Hours</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lunch Break</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {workTimings.filter(t => t.is_temporary).map(timing => (
                            <tr key={timing.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                {timing.first_name ? (
                                  <div>
                                    <p className="font-semibold">{timing.first_name} {timing.last_name}</p>
                                    <p className="text-xs text-gray-500 font-mono">{timing.student_code}</p>
                                  </div>
                                ) : (
                                  timing.student_id ? `Student #${timing.student_id}` : timing.department || 'Default (All)'
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">
                                <span className="px-2.5 py-1 text-xs font-medium bg-purple-50 text-purple-700 rounded-full border border-purple-100">
                                  {timing.start_date ? new Date(timing.start_date).toLocaleDateString() : ''} – {timing.end_date ? new Date(timing.end_date).toLocaleDateString() : ''}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                                {timing.work_start_time} – {timing.work_end_time}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                                {timing.lunch_start_time && timing.lunch_end_time
                                  ? `${timing.lunch_start_time} – ${timing.lunch_end_time}`
                                  : '—'}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                <button
                                  onClick={() => handleDeleteWorkTiming(timing.id)}
                                  className="text-red-600 hover:text-red-800 font-medium flex items-center gap-1"
                                >
                                  <FaTrash /> Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Location Assignment Overview Section */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">Student Work Location Assignment</h2>
                      <p className="text-sm text-gray-500">Assign individual GPS work locations to students and teachers. These locations override the global office geo-fence during attendance check-in/check-out.</p>
                    </div>
                    {locationRowsLoading && (
                      <div className="text-xs text-blue-500 flex items-center gap-1">
                        <div className="h-3 w-3 rounded-full border border-blue-300 border-t-blue-500 animate-spin" />
                        <span>Updating...</span>
                      </div>
                    )}
                  </div>

                  {students.length === 0 ? (
                    <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
                      <FaMapMarkerAlt className="mx-auto text-4xl text-gray-300 mb-3" />
                      <p className="text-gray-900 font-semibold text-base">No students found.</p>
                      <p className="text-sm text-gray-500 mt-1">Add students first to assign work locations.</p>
                    </div>
                  ) : (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Work Timing</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned Location</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {students.map(emp => (
                            <tr key={emp.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                <div>
                                  <p className="font-semibold">{emp.first_name} {emp.last_name}</p>
                                  <p className="text-xs text-gray-500 font-mono">{emp.student_id}</p>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">
                                <RoleBadge role={emp.role} />
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">
                                {studentLocationRows[emp.id]?.work_start_time ? (
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${studentLocationRows[emp.id]?.timing_is_temporary ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                                      <FaClock className={studentLocationRows[emp.id]?.timing_is_temporary ? 'text-purple-500' : 'text-blue-500'} />
                                      {studentLocationRows[emp.id]?.work_start_time?.substring(0, 5)} - {studentLocationRows[emp.id]?.work_end_time?.substring(0, 5)} {studentLocationRows[emp.id]?.timing_is_temporary ? '(Temp)' : ''}
                                    </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                    <FaClock className="text-gray-400" />
                                    Unassigned (Default 09:00 - 18:00)
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">
                                {studentLocationRows[emp.id]?.location_name ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                                    <FaMapMarkerAlt className="text-green-500" />
                                    {studentLocationRows[emp.id].location_name}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                    <FaMapMarkerAlt className="text-gray-400" />
                                    Global Office (Default)
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                <button
                                  onClick={() => openLocationModal(emp)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                                >
                                  <FaMapMarkerAlt />
                                  Assign Location
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Location & Timing Assignment Requests Section */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">Location & Timing Assignment Requests</h2>
                      <p className="text-sm text-gray-500">Approve or reject student and teacher requests for work timings and custom coordinates in real time.</p>
                    </div>
                    {requestsLoading && (
                      <div className="text-xs text-blue-500 flex items-center gap-1">
                        <div className="h-3 w-3 rounded-full border border-blue-300 border-t-blue-500 animate-spin" />
                        <span>Loading...</span>
                      </div>
                    )}
                  </div>

                  {requests.length === 0 ? (
                    <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
                      <FaClock className="mx-auto text-4xl text-gray-300 mb-3" />
                      <p className="text-gray-900 font-semibold text-base">No requests found.</p>
                      <p className="text-sm text-gray-500 mt-1">Pending requests from students will appear here in real-time.</p>
                    </div>
                  ) : (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Requested Details</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted At</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {requests.map(req => (
                            <tr key={req.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                <div>
                                  <p className="font-semibold">{req.first_name} {req.last_name}</p>
                                  <p className="text-xs text-gray-500 font-mono">{req.student_id_code}</p>
                                  <p className="text-xs text-gray-400">{req.department}</p>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm">
                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                                  req.request_type === 'location' ? 'bg-green-50 text-green-700 border-green-200' :
                                  req.request_type === 'timing' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                  'bg-purple-50 text-purple-700 border-purple-200'
                                }`}>
                                  {req.request_type.toUpperCase()}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">
                                <div className="space-y-1.5 max-w-sm">
                                  {(req.request_type === 'timing' || req.request_type === 'both') && (
                                    <div className="flex flex-col text-xs bg-blue-50/50 p-2 rounded border border-blue-100">
                                      <span className="font-semibold text-blue-800">Timing Request:</span>
                                      <span className="font-mono">{req.requested_work_start_time?.substring(0, 5)} - {req.requested_work_end_time?.substring(0, 5)}</span>
                                      {req.requested_is_temporary ? (
                                        <span className="text-purple-600 text-[10px]">
                                          Temp: {new Date(req.requested_start_date).toLocaleDateString()} to {new Date(req.requested_end_date).toLocaleDateString()}
                                        </span>
                                      ) : (
                                        <span className="text-gray-500 text-[10px]">Permanent</span>
                                      )}
                                    </div>
                                  )}
                                  {(req.request_type === 'location' || req.request_type === 'both') && (
                                    <div className="flex flex-col text-xs bg-green-50/50 p-2 rounded border border-green-100">
                                      <span className="font-semibold text-green-800">Location Request:</span>
                                      <span className="font-medium text-gray-900">{req.requested_location_name}</span>
                                      <span className="text-gray-600 font-mono">Coords: {req.requested_latitude?.toFixed(5)}, {req.requested_longitude?.toFixed(5)}</span>
                                      <span className="text-gray-500 text-[10px]">Radius: {req.requested_radius_meters}m</span>
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-500">
                                {new Date(req.created_at).toLocaleString()}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                                  req.status === 'approved' ? 'bg-green-100 text-green-800 border-green-200' :
                                  req.status === 'rejected' ? 'bg-red-100 text-red-800 border-red-200' :
                                  'bg-yellow-100 text-yellow-800 border-yellow-200 animate-pulse'
                                }`}>
                                  {req.status.toUpperCase()}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm">
                                {req.status === 'pending' ? (
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleAcceptRequest(req)}
                                      className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-semibold shadow-sm transition-all"
                                    >
                                      Accept
                                    </button>
                                    <button
                                      onClick={() => handleRejectRequest(req.id)}
                                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold shadow-sm transition-all"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-500 italic">
                                    {req.admin_notes || 'Processed'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── MFA STATUS TAB ── */}
            {activeTab === 'mfa' && (
              <div className="space-y-5">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-semibold text-gray-900">MFA Status</h2>
                  <div className="text-sm text-gray-500">
                    Manage Multi-Factor Authentication status for all students
                  </div>
                </div>

                {/* Search & Filters */}
                <div className="flex flex-wrap gap-3 items-center">
                  <div className="flex-1 min-w-64 relative">
                    <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                    <input
                      id="mfa-student-search"
                      type="text"
                      placeholder="Search by name, ID, or email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <select
                    id="mfa-filter-department"
                    value={filterDept}
                    onChange={(e) => setFilterDept(e.target.value)}
                    className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Departments</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select
                    id="mfa-filter-role"
                    value={filterRole}
                    onChange={(e) => setFilterRole(e.target.value)}
                    className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Roles</option>
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                    <option value="admin">Admin</option>
                  </select>
                  <span className="text-sm text-gray-500 ml-auto">
                    {filteredStudents.length} of {students.length} students
                  </span>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">MFA Enabled</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredStudents.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-12 text-center text-gray-500 text-sm">
                              No students found matching your filters
                            </td>
                          </tr>
                        ) : (
                          filteredStudents.map((emp) => (
                            <motion.tr
                              key={emp.id}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="hover:bg-gray-50"
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-semibold">
                                    {emp.first_name[0]}{emp.last_name[0]}
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-gray-900">{emp.first_name} {emp.last_name}</p>
                                    <p className="text-xs text-gray-500">{emp.student_id} · {emp.email}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">{emp.department}</td>
                              <td className="px-4 py-3"><RoleBadge role={emp.role} /></td>
                              <td className="px-4 py-3">
                                {emp.mfa_enabled ? (
                                  <span className="flex items-center gap-1 text-green-600 text-xs font-semibold">
                                    <FaCheck /> Enabled
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-400">Disabled</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {emp.mfa_enabled ? (
                                  <button
                                    onClick={async () => {
                                      if (!window.confirm(`Reset/Disable MFA for ${emp.first_name} ${emp.last_name}?`)) return;
                                      try {
                                        await adminApi.resetStudentMfa(emp.student_id);
                                        showSuccess(`MFA reset successfully for ${emp.first_name} ${emp.last_name}`);
                                        fetchData();
                                      } catch (err: any) {
                                        showError(err.response?.data?.error || err.response?.data?.message || 'Failed to reset MFA');
                                      }
                                    }}
                                    className="px-3 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded text-xs font-medium transition-colors"
                                  >
                                    Reset MFA
                                  </button>
                                ) : (
                                  <span className="text-xs text-gray-400 italic">No action needed</span>
                                )}
                              </td>
                            </motion.tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── FACE APPROVALS TAB ── */}
            {activeTab === 'approvals' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">Pending Face Change Requests</h2>
                      <p className="text-gray-500 text-sm mt-0.5">Review and approve biometric face registration requests from teachers and students.</p>
                    </div>
                    <button
                      onClick={fetchData}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors"
                    >
                      <FaSync className="text-xs animate-spin-hover" /> Refresh
                    </button>
                  </div>

                  {pendingRequests.length === 0 ? (
                    <div className="py-12 text-center text-gray-500">
                      <FaCheck className="mx-auto text-4xl text-green-300 mb-3" />
                      <p>No pending face change requests.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-200">
                      {pendingRequests.map((request) => (
                        <div key={request.id} className="p-6 flex flex-col md:flex-row md:items-center md:justify-between hover:bg-gray-50 transition-colors">
                          <div className="mb-4 md:mb-0">
                            <div className="flex items-center space-x-3">
                              <span className="font-semibold text-gray-900">{request.first_name} {request.last_name}</span>
                              <span className="text-xs text-gray-500">({request.student_id})</span>
                              <span className={`px-2 py-0.5 text-xs rounded-full font-bold ${
                                request.request_type === 'ADD' 
                                  ? 'bg-green-100 text-green-800' 
                                  : request.request_type === 'DELETE' 
                                    ? 'bg-red-100 text-red-800' 
                                    : 'bg-blue-100 text-blue-800'
                              }`}>
                                {request.request_type} FACE
                              </span>
                            </div>
                            <div className="text-sm text-gray-500 mt-1">
                              Department: {request.department} &bull; Requested on {new Date(request.created_at).toLocaleDateString()}
                            </div>
                            {request.requester_student_id && request.requester_student_id !== request.student_id && (
                              <div className="text-xs text-indigo-600 mt-1">
                                Requested by: {request.requester_first_name} {request.requester_last_name} ({request.requester_student_id})
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
                            {approvingId === request.id || rejectingId === request.id ? (
                              <div className="flex flex-col space-y-2 w-full sm:w-64">
                                <input
                                  type="text"
                                  placeholder="Add notes/reason (optional)..."
                                  value={actionNotes}
                                  onChange={(e) => setActionNotes(e.target.value)}
                                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-full focus:ring-1 focus:ring-blue-500"
                                />
                                <div className="flex justify-end space-x-2">
                                  <button
                                    onClick={() => {
                                      setApprovingId(null);
                                      setRejectingId(null);
                                      setActionNotes('');
                                    }}
                                    className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded-lg font-medium"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => approvingId === request.id ? handleApprove(request.id) : handleReject(request.id)}
                                    className={`px-3 py-1 text-white text-xs rounded-lg font-medium ${
                                      approvingId === request.id ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                                    }`}
                                  >
                                    Confirm
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setApprovingId(request.id);
                                    setRejectingId(null);
                                  }}
                                  className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => {
                                    setRejectingId(request.id);
                                    setApprovingId(null);
                                  }}
                                  className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── PENDING BIOMETRIC RECOVERY REQUESTS ── */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">Pending Biometric Recovery Requests</h2>
                      <p className="text-gray-500 text-sm mt-0.5">Review and approve biometric and credential recovery requests submitted by lock-out students or teachers.</p>
                    </div>
                    <button
                      onClick={fetchData}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors"
                    >
                      <FaSync className="text-xs animate-spin-hover" /> Refresh
                    </button>
                  </div>

                  {pendingRecoveries.length === 0 ? (
                    <div className="py-12 text-center text-gray-500">
                      <FaCheck className="mx-auto text-4xl text-green-300 mb-3" />
                      <p>No pending biometric recovery requests.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-200">
                      {pendingRecoveries.map((recovery) => (
                        <div key={recovery.id} className="p-6 flex flex-col md:flex-row md:items-center md:justify-between hover:bg-gray-50 transition-colors">
                          <div className="mb-4 md:mb-0">
                            <div className="flex items-center space-x-3">
                              <span className="font-semibold text-gray-900">{recovery.first_name} {recovery.last_name}</span>
                              <span className="text-xs text-gray-500">({recovery.student_id})</span>
                              <span className={`px-2 py-0.5 text-xs rounded-full font-bold ${
                                recovery.request_type === 'face_reset' 
                                  ? 'bg-amber-100 text-amber-800' 
                                  : recovery.request_type === 'password_reset' 
                                    ? 'bg-blue-100 text-blue-800' 
                                    : 'bg-purple-100 text-purple-800'
                              }`}>
                                {recovery.request_type === 'face_reset' 
                                  ? 'FACE RESET' 
                                  : recovery.request_type === 'password_reset'
                                    ? 'PASSWORD RESET'
                                    : 'FULL CREDENTIAL RESET'}
                              </span>
                            </div>
                            <div className="text-sm text-gray-700 mt-1.5 bg-gray-50 p-2 rounded-lg border border-gray-100 max-w-2xl">
                              <strong className="text-xs text-gray-500 uppercase tracking-wider block mb-0.5">Reason:</strong>
                              <span className="italic">"{recovery.request_reason || 'No reason provided'}"</span>
                            </div>
                            <div className="text-xs text-gray-500 mt-2">
                              Email: {recovery.email} &bull; Requested on {new Date(recovery.created_at).toLocaleDateString()} &bull; Expires on {new Date(recovery.expires_at).toLocaleDateString()}
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
                            {approvingRecoveryId === recovery.id || rejectingRecoveryId === recovery.id ? (
                              <div className="flex flex-col space-y-2 w-full sm:w-64">
                                <input
                                  type="text"
                                  placeholder="Add notes/reason (optional)..."
                                  value={recoveryNotes}
                                  onChange={(e) => setRecoveryNotes(e.target.value)}
                                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-full focus:ring-1 focus:ring-blue-500"
                                />
                                <div className="flex justify-end space-x-2">
                                  <button
                                    onClick={() => {
                                      setApprovingRecoveryId(null);
                                      setRejectingRecoveryId(null);
                                      setRecoveryNotes('');
                                    }}
                                    className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded-lg font-medium"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => approvingRecoveryId === recovery.id ? handleApproveRecovery(recovery.id) : handleRejectRecovery(recovery.id)}
                                    className={`px-3 py-1 text-white text-xs rounded-lg font-medium ${
                                      approvingRecoveryId === recovery.id ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                                    }`}
                                  >
                                    Confirm
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setApprovingRecoveryId(recovery.id);
                                    setRejectingRecoveryId(null);
                                  }}
                                  className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => {
                                    setRejectingRecoveryId(recovery.id);
                                    setApprovingRecoveryId(null);
                                  }}
                                  className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Audit log trail */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-xl font-bold text-gray-900">Face Change Audit Logs</h2>
                    <p className="text-gray-500 text-sm mt-0.5">Historical records of all biometric profile alterations.</p>
                  </div>

                  {auditLogs.length === 0 ? (
                    <div className="py-12 text-center text-gray-500">
                      No face audit logs found.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Target Student</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Performed By</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date & Time</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Device & IP</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {auditLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm text-gray-900">
                                <div>
                                  <p className="font-medium">{log.first_name} {log.last_name}</p>
                                  <p className="text-xs text-gray-500">{log.student_id}</p>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm">
                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                  log.action === 'ADD' 
                                    ? 'bg-green-100 text-green-800' 
                                    : log.action === 'DELETE' 
                                      ? 'bg-red-100 text-red-800' 
                                      : 'bg-blue-100 text-blue-800'
                                }`}>
                                  {log.action}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">
                                {log.perf_student_id ? (
                                  <div>
                                    <p className="font-medium">{log.perf_first_name} {log.perf_last_name}</p>
                                    <p className="text-xs text-gray-500">{log.perf_student_id}</p>
                                  </div>
                                ) : (
                                  'System'
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500">
                                {new Date(log.timestamp).toLocaleString()}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500">
                                <div>
                                  <p className="font-mono text-xs">{log.ip_address}</p>
                                  <p className="text-xs max-w-xs truncate" title={log.device_info}>{log.device_info}</p>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── SYSTEM SETTINGS TAB ── */}
            {activeTab === 'system' && (
              <SystemSettingsTab />
            )}

            {/* ── LEAVE APPROVALS TAB ── */}
            {activeTab === 'leaves' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">Pending Leave Approvals</h2>
                      <p className="text-gray-500 text-sm mt-0.5">Review and approve or reject leave requests submitted by students.</p>
                    </div>
                    <button
                      onClick={fetchLeaveRequests}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors"
                    >
                      <FaSync className="text-xs" /> Refresh
                    </button>
                  </div>

                  {pendingLeaveRequests.length === 0 ? (
                    <div className="py-12 text-center text-gray-500">
                      <FaCheckCircle className="mx-auto text-4xl text-green-300 mb-3" />
                      <p>No pending leave requests.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-200">
                      {pendingLeaveRequests.map((request) => (
                        <div key={request.id} className="p-6 flex flex-col md:flex-row md:items-center md:justify-between hover:bg-gray-50 transition-colors">
                          <div className="mb-4 md:mb-0">
                            <div className="flex items-center space-x-3">
                              <span className="font-semibold text-gray-900">
                                {request.student?.first_name} {request.student?.last_name}
                              </span>
                              <span className="text-xs text-gray-500 font-normal">({request.student?.student_id})</span>
                              <span className="px-2 py-0.5 text-xs rounded-full font-bold bg-yellow-100 text-yellow-800 uppercase">
                                {request.leave_type}
                              </span>
                            </div>
                            <div className="text-sm text-gray-500 mt-1">
                              <strong>Period:</strong> {new Date(request.start_date).toLocaleDateString()} to {new Date(request.end_date).toLocaleDateString()} ({request.total_days} {request.total_days === 1 ? 'day' : 'days'})
                            </div>
                            <div className="text-sm text-gray-700 mt-2 italic bg-gray-50 p-2 rounded border border-gray-100">
                              "{request.reason}"
                            </div>
                            <div className="text-xs text-gray-400 mt-2">
                              Submitted on {new Date(request.created_at).toLocaleDateString()}
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
                            {rejectingLeaveId === request.id ? (
                              <div className="flex flex-col space-y-2 w-full sm:w-64">
                                <input
                                  type="text"
                                  placeholder="Rejection reason (required)..."
                                  value={leaveActionReason}
                                  onChange={(e) => setLeaveActionReason(e.target.value)}
                                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-full focus:ring-1 focus:ring-blue-500"
                                />
                                <div className="flex justify-end space-x-2">
                                  <button
                                    onClick={() => {
                                      setRejectingLeaveId(null);
                                      setLeaveActionReason('');
                                    }}
                                    className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded-lg font-medium"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleRejectLeave(request.id)}
                                    className="px-3 py-1 text-white text-xs rounded-lg font-medium bg-red-600 hover:bg-red-700"
                                  >
                                    Confirm Reject
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                {request.attachment_data && (
                                  <button
                                    onClick={() => setPreviewAttachment({ data: request.attachment_data!, name: request.attachment_name || 'attachment' })}
                                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
                                  >
                                    View Attachment
                                  </button>
                                )}
                                <button
                                  disabled={approvingLeaveId === request.id}
                                  onClick={() => handleApproveLeave(request.id)}
                                  className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                                >
                                  {approvingLeaveId === request.id ? 'Approving...' : 'Approve'}
                                </button>
                                <button
                                  onClick={() => {
                                    setRejectingLeaveId(request.id);
                                    setLeaveActionReason('');
                                  }}
                                  className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* ── CREATE STUDENT MODAL ── */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <FaUserPlus className="text-blue-600" />
                  Create New Student
                </h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Student ID *</label>
                    <input
                      id="new-student-id"
                      type="text"
                      placeholder="e.g. EMP001"
                      value={createForm.studentId}
                      onChange={(e) => setCreateForm(f => ({ ...f, studentId: e.target.value }))}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Role *</label>
                    <select
                      id="new-student-role"
                      value={createForm.role}
                      onChange={(e) => setCreateForm(f => ({ ...f, role: e.target.value as any }))}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="student">Student</option>
                      <option value="teacher">Teacher</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">First Name *</label>
                    <input
                      id="new-first-name"
                      type="text"
                      value={createForm.firstName}
                      onChange={(e) => setCreateForm(f => ({ ...f, firstName: e.target.value }))}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Last Name *</label>
                    <input
                      id="new-last-name"
                      type="text"
                      value={createForm.lastName}
                      onChange={(e) => setCreateForm(f => ({ ...f, lastName: e.target.value }))}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
                    <input
                      id="new-email"
                      type="email"
                      value={createForm.email}
                      onChange={(e) => setCreateForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Department *</label>
                    <input
                      id="new-department"
                      type="text"
                      list="dept-list"
                      value={createForm.department}
                      onChange={(e) => setCreateForm(f => ({ ...f, department: e.target.value }))}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                    />
                    <datalist id="dept-list">
                      {departments.map(d => <option key={d} value={d} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Position *</label>
                    <input
                      id="new-position"
                      type="text"
                      value={createForm.position}
                      onChange={(e) => setCreateForm(f => ({ ...f, position: e.target.value }))}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {createForm.role === 'student' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Assign Teacher</label>
                      <select
                        id="new-teacher"
                        value={createForm.teacherId}
                        onChange={(e) => setCreateForm(f => ({ ...f, teacherId: e.target.value }))}
                        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">None (unassigned)</option>
                        {teachers.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.first_name} {s.last_name} ({s.department})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Hire Date</label>
                    <input
                      id="new-hire-date"
                      type="date"
                      value={createForm.hireDate}
                      onChange={(e) => setCreateForm(f => ({ ...f, hireDate: e.target.value }))}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Phone Number</label>
                    <input
                      id="new-phone"
                      type="tel"
                      value={createForm.phoneNumber}
                      onChange={(e) => setCreateForm(f => ({ ...f, phoneNumber: e.target.value }))}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Initial Password <span className="text-gray-400">(leave blank to auto-generate)</span>
                    </label>
                    <input
                      id="new-password"
                      type="password"
                      value={createForm.password}
                      onChange={(e) => setCreateForm(f => ({ ...f, password: e.target.value }))}
                      placeholder="Leave blank to auto-generate"
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  id="submit-create-student"
                  onClick={handleCreateStudent}
                  disabled={formLoading}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {formLoading ? (
                    <>
                      <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <FaUserPlus />
                      Create Student
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── DIRECT FACE REGISTRATION MODAL (ADMIN BYPASS) ── */}
      <AnimatePresence>
        {isDirectFaceModalOpen && selectedEmpForFace && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <FaCamera className="text-blue-600" />
                  Direct Face Registration: {selectedEmpForFace.first_name} {selectedEmpForFace.last_name}
                </h3>
                <button
                  onClick={() => {
                    setIsDirectFaceModalOpen(false);
                    setSelectedEmpForFace(null);
                    setDirectFaceFrames([]);
                  }}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="p-6">
                <p className="text-sm text-gray-600 mb-4">
                  Enroll face directly. Biometric updates will be applied instantly, skipping the approval workflow.
                </p>

                <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden mb-4 relative max-h-64">
                  <FaceCamera
                    onCapture={handleDirectFaceFrameCapture}
                    className="w-full h-full"
                    autoCapture={true}
                    captureInterval={150}
                    showControls={false}
                  />
                </div>

                {/* Progress Bar */}
                <div className="mb-6">
                  <div className="flex justify-between text-sm mb-1 text-gray-700">
                    <span>Captured Frames</span>
                    <span className="font-semibold">{directFaceFrames.length}/20</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min((directFaceFrames.length / 20) * 100, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setIsDirectFaceModalOpen(false);
                      setSelectedEmpForFace(null);
                      setDirectFaceFrames([]);
                    }}
                    className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitDirectFace}
                    disabled={isDirectFaceSubmitting || directFaceFrames.length < 10}
                    className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isDirectFaceSubmitting ? (
                      <>
                        <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ASSIGN TEACHER MODAL ── */}
      <AnimatePresence>
        {assignTargetStudent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setAssignTargetStudent(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <FaLink className="text-blue-600" />
                  Assign Teacher
                </h3>
                <button
                  onClick={() => setAssignTargetStudent(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                    Student
                  </label>
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="font-semibold text-gray-900">
                      {assignTargetStudent.first_name} {assignTargetStudent.last_name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      ID: {assignTargetStudent.student_id} · Dept: {assignTargetStudent.department} · Role: {assignTargetStudent.position}
                    </p>
                  </div>
                </div>

                <div>
                  <label htmlFor="assign-teacher-select" className="block text-xs font-medium text-gray-700 mb-1">
                    Select Teacher *
                  </label>
                  <select
                    id="assign-teacher-select"
                    value={selectedTeacherId}
                    onChange={(e) => setSelectedTeacherId(e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  >
                    <option value="">-- Choose a Teacher --</option>
                    {teachers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.first_name} {s.last_name} ({s.department})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => setAssignTargetStudent(null)}
                    className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAssignTeacher}
                    disabled={assignLoading || !selectedTeacherId}
                    className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {assignLoading ? (
                      <>
                        <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        Assigning...
                      </>
                    ) : (
                      'Confirm Assignment'
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CHANGE PASSWORD MODAL ── */}
      <AnimatePresence>
        {isPasswordModalOpen && selectedEmpForPassword && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) { setIsPasswordModalOpen(false); setSelectedEmpForPassword(null); setNewPassword(''); } }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <FaKey className="text-blue-600" />
                  Change Password
                </h3>
                <button
                  onClick={() => {
                    setIsPasswordModalOpen(false);
                    setSelectedEmpForPassword(null);
                    setNewPassword('');
                  }}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                    Student
                  </label>
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="font-semibold text-gray-900">
                      {selectedEmpForPassword.first_name} {selectedEmpForPassword.last_name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      ID: {selectedEmpForPassword.student_id} · Dept: {selectedEmpForPassword.department}
                    </p>
                  </div>
                </div>

                <div>
                  <label htmlFor="new-password-input" className="block text-xs font-medium text-gray-700 mb-1">
                    New Password *
                  </label>
                  <input
                    id="new-password-input"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => {
                      setIsPasswordModalOpen(false);
                      setSelectedEmpForPassword(null);
                      setNewPassword('');
                    }}
                    className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdatePassword}
                    disabled={passwordLoading || !newPassword}
                    className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {passwordLoading ? (
                      <>
                        <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        Updating...
                      </>
                    ) : (
                      'Update Password'
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ASSIGN WORK TIMING MODAL ── */}
      <AnimatePresence>
        {isAssignTimingModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setIsAssignTimingModalOpen(false); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <FaClock className="text-blue-600" />
                  Assign {timingModalType === 'permanent' ? 'Permanent' : 'Temporary'} Work Timing
                </h3>
                <button
                  onClick={() => setIsAssignTimingModalOpen(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                >
                  <FaTimes />
                </button>
              </div>

              <form onSubmit={handleAssignWorkTiming} className="p-6 space-y-4">
                <div>
                  <label htmlFor="timing-student-select" className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Select Student/Teacher *
                  </label>
                  <select
                    id="timing-student-select"
                    value={selectedStudentIdForTiming}
                    onChange={(e) => setSelectedStudentIdForTiming(e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                    required
                  >
                    <option value="">-- Choose Student --</option>
                    {students.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.first_name} {emp.last_name} ({emp.student_id} - {emp.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="timing-work-start" className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Work Start *
                    </label>
                    <input
                      id="timing-work-start"
                      type="time"
                      value={timingWorkStart}
                      onChange={(e) => setTimingWorkStart(e.target.value)}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="timing-work-end" className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Work End *
                    </label>
                    <input
                      id="timing-work-end"
                      type="time"
                      value={timingWorkEnd}
                      onChange={(e) => setTimingWorkEnd(e.target.value)}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="timing-lunch-start" className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Lunch Start
                    </label>
                    <input
                      id="timing-lunch-start"
                      type="time"
                      value={timingLunchStart}
                      onChange={(e) => setTimingLunchStart(e.target.value)}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="timing-lunch-end" className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Lunch End
                    </label>
                    <input
                      id="timing-lunch-end"
                      type="time"
                      value={timingLunchEnd}
                      onChange={(e) => setTimingLunchEnd(e.target.value)}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                    />
                  </div>
                </div>

                {timingModalType === 'temporary' && (
                  <div className="grid grid-cols-2 gap-4 p-3 bg-purple-50/50 rounded-xl border border-purple-100">
                    <div>
                      <label htmlFor="timing-start-date" className="block text-xs font-semibold text-purple-700 uppercase tracking-wider mb-1">
                        Start Date *
                      </label>
                      <input
                        id="timing-start-date"
                        type="date"
                        value={timingStartDate}
                        onChange={(e) => setTimingStartDate(e.target.value)}
                        className="w-full text-sm border border-purple-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="timing-end-date" className="block text-xs font-semibold text-purple-700 uppercase tracking-wider mb-1">
                        End Date *
                      </label>
                      <input
                        id="timing-end-date"
                        type="date"
                        value={timingEndDate}
                        onChange={(e) => setTimingEndDate(e.target.value)}
                        className="w-full text-sm border border-purple-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setIsAssignTimingModalOpen(false)}
                    className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={timingSubmitting}
                    className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {timingSubmitting ? (
                      <>
                        <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        Assigning...
                      </>
                    ) : (
                      'Confirm Assignment'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ASSIGN LOCATION MODAL ── */}
      <AnimatePresence>
        {isLocationModalOpen && selectedEmpForLocation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) { setIsLocationModalOpen(false); setSelectedEmpForLocation(null); } }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-green-50 to-emerald-50">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <FaMapMarkerAlt className="text-green-600" />
                  Assign Work Location
                </h3>
                <button
                  onClick={() => { setIsLocationModalOpen(false); setSelectedEmpForLocation(null); }}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-white/60"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* Student Info */}
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="font-semibold text-gray-900">{selectedEmpForLocation.first_name} {selectedEmpForLocation.last_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">ID: {selectedEmpForLocation.student_id} · {selectedEmpForLocation.department} · {selectedEmpForLocation.role}</p>
                </div>

                {/* Current location status */}
                {locationFetching ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <div className="h-4 w-4 rounded-full border-2 border-gray-300 border-t-blue-500 animate-spin" />
                    Loading current location...
                  </div>
                ) : currentLocation ? (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1">Currently Assigned Location</p>
                    <p className="text-sm font-medium text-green-900">{currentLocation.name}</p>
                    <p className="text-xs text-green-700 font-mono mt-0.5">
                      {currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)} · Radius: {currentLocation.radius_meters}m
                    </p>
                    <a
                      href={`https://maps.google.com/maps?q=${currentLocation.latitude},${currentLocation.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1"
                    >
                      <FaMapMarkerAlt className="text-xs" /> View on Google Maps
                    </a>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-0.5">No Personal Location Assigned</p>
                    <p className="text-xs text-amber-600">This student uses the global office geo-fence. Assign a personal location below.</p>
                  </div>
                )}

                {/* Google Maps hint */}
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                  <p className="text-xs font-semibold text-blue-700 mb-1">📍 How to get coordinates</p>
                  <p className="text-xs text-blue-600">1. Open <a href="https://maps.google.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">Google Maps</a> and navigate to the work location.</p>
                  <p className="text-xs text-blue-600">2. Right-click the exact point → click the coordinates shown.</p>
                  <p className="text-xs text-blue-600">3. Paste the latitude and longitude values in the fields below.</p>
                </div>

                <form onSubmit={handleAssignLocation} className="space-y-4">
                  <div>
                    <label htmlFor="loc-name" className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Location Name *</label>
                    <input
                      id="loc-name"
                      type="text"
                      value={locationName}
                      onChange={(e) => setLocationName(e.target.value)}
                      placeholder="e.g. Head Office, Branch Office, Site A"
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                      required
                    />
                  </div>

                  <div className="flex justify-between items-center mb-1">
                    <span className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">Coordinates</span>
                    <button
                      type="button"
                      onClick={() => {
                        const lat = locationLat || '20.136994';
                        const lng = locationLng || '85.635407';
                        const name = encodeURIComponent(locationName || '');
                        const width = 950;
                        const height = 650;
                        const left = (window.screen.width - width) / 2;
                        const top = (window.screen.height - height) / 2;
                        window.open(
                          `/map-picker.html?lat=${lat}&lng=${lng}&name=${name}`,
                          'MapPicker',
                          `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes`
                        );
                      }}
                      className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-semibold transition-colors py-1 px-2 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-100"
                    >
                      <FaMapMarkerAlt className="text-xs" />
                      Select on Google Maps
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="loc-lat" className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Latitude *</label>
                      <input
                        id="loc-lat"
                        type="number"
                        step="any"
                        value={locationLat}
                        onChange={(e) => setLocationLat(e.target.value)}
                        placeholder="e.g. 20.136994"
                        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="loc-lng" className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Longitude *</label>
                      <input
                        id="loc-lng"
                        type="number"
                        step="any"
                        value={locationLng}
                        onChange={(e) => setLocationLng(e.target.value)}
                        placeholder="e.g. 85.635407"
                        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white font-mono"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="loc-radius" className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Geo-Fence Radius (meters)</label>
                    <input
                      id="loc-radius"
                      type="number"
                      min="10"
                      max="5000"
                      value={locationRadius}
                      onChange={(e) => setLocationRadius(e.target.value)}
                      placeholder="100"
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                    />
                    <p className="text-xs text-gray-400 mt-1">Students within this radius of the assigned location will be marked as "Within Fence". Default: 100m.</p>
                  </div>

                  {/* Live preview of Google Maps link */}
                  {locationLat && locationLng && !isNaN(parseFloat(locationLat)) && !isNaN(parseFloat(locationLng)) && (
                    <div className="p-2 bg-gray-50 rounded-lg border border-gray-200">
                      <a
                        href={`https://maps.google.com/maps?q=${locationLat},${locationLng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline font-medium"
                      >
                        <FaMapMarkerAlt /> Verify on Google Maps: {parseFloat(locationLat).toFixed(6)}, {parseFloat(locationLng).toFixed(6)}
                      </a>
                    </div>
                  )}

                  <div className="flex justify-between gap-3 pt-4 border-t border-gray-100">
                    <div>
                      {currentLocation && (
                        <button
                          type="button"
                          onClick={handleRemoveLocation}
                          disabled={locationLoading}
                          className="px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 flex items-center gap-1.5"
                        >
                          <FaTrash className="text-xs" />
                          Remove Location
                        </button>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => { setIsLocationModalOpen(false); setSelectedEmpForLocation(null); }}
                        className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={locationLoading || locationFetching}
                        className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {locationLoading ? (
                          <>
                            <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>{currentLocation ? 'Update Location' : 'Assign Location'}</>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── STUDENT DETAILS POPUP MODAL ── */}
      <AnimatePresence>
        {selectedDetailStudent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4 overflow-y-auto"
            onClick={(e) => { if (e.target === e.currentTarget) setSelectedDetailStudent(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-100 flex flex-col my-8"
            >
              {/* Header Banner */}
              <div className={`px-6 py-5 flex items-center justify-between text-white ${
                selectedDetailStudent.role === 'admin' 
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600' 
                  : selectedDetailStudent.role === 'teacher'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600'
                    : 'bg-gradient-to-r from-slate-700 to-slate-800'
              }`}>
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white font-bold text-xl border border-white/30 shadow-sm">
                    {selectedDetailStudent.first_name[0]}{selectedDetailStudent.last_name[0]}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold tracking-tight">
                      {selectedDetailStudent.first_name} {selectedDetailStudent.last_name}
                    </h3>
                    <p className="text-xs text-white/80 font-medium mt-0.5">
                      {selectedDetailStudent.position || 'No position assigned'} &bull; {selectedDetailStudent.department || 'No department'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedDetailStudent(null)}
                  className="p-2 text-white/80 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
                >
                  <FaTimes className="text-lg" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto bg-gray-50/50">
                {/* Grid for core info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Account Information Card */}
                  <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Account Details</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Student ID</span>
                        <span className="text-gray-900 font-bold font-mono">{selectedDetailStudent.student_id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">System Role</span>
                        <span className="text-gray-900 font-semibold capitalize">{selectedDetailStudent.role}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Department</span>
                        <span className="text-gray-900 font-semibold">{selectedDetailStudent.department || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Teacher</span>
                        <span className="text-gray-900 font-semibold truncate max-w-[160px]" title={getTeacherName(selectedDetailStudent.teacher_id)}>
                          {getTeacherName(selectedDetailStudent.teacher_id)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Security & Authentication Card */}
                  <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Security & Auth</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500 font-medium">Status</span>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          selectedDetailStudent.is_active ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-600 border border-gray-250'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${selectedDetailStudent.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                          {selectedDetailStudent.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500 font-medium">Face Recognition</span>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          selectedDetailStudent.face_enrolled ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-250'
                        }`}>
                          {selectedDetailStudent.face_enrolled ? 'Enrolled' : 'Not Registered'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500 font-medium">MFA Status</span>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          selectedDetailStudent.mfa_enabled ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-650'
                        }`}>
                          {selectedDetailStudent.mfa_enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Hire Date</span>
                        <span className="text-gray-900 font-semibold">
                          {selectedDetailStudent.hire_date ? new Date(selectedDetailStudent.hire_date).toLocaleDateString() : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Contact Details Card */}
                  <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3 col-span-1 md:col-span-2">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Contact Information</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="block text-xs text-gray-400 font-medium">Email Address</span>
                        <span className="text-gray-900 font-semibold select-all">{selectedDetailStudent.email}</span>
                      </div>
                      <div>
                        <span className="block text-xs text-gray-400 font-medium">Phone Number</span>
                        <span className="text-gray-900 font-semibold select-all">{selectedDetailStudent.phone_number || 'No phone registered'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Assigned Location Card */}
                  <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3 col-span-1 md:col-span-2">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Work Location Geo-Fence</h4>
                    {studentLocationRows[selectedDetailStudent.id]?.location_name ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                          <div>
                            <span className="block text-xs text-gray-400 font-medium">Location Name</span>
                            <span className="text-green-700 font-bold flex items-center gap-1">
                              <FaMapMarkerAlt /> {studentLocationRows[selectedDetailStudent.id].location_name}
                            </span>
                          </div>
                          <div>
                            <span className="block text-xs text-gray-400 font-medium">Coordinates</span>
                            <span className="text-gray-900 font-mono font-semibold">
                              {Number(studentLocationRows[selectedDetailStudent.id].latitude).toFixed(6)}, {Number(studentLocationRows[selectedDetailStudent.id].longitude).toFixed(6)}
                            </span>
                          </div>
                          <div>
                            <span className="block text-xs text-gray-400 font-medium">Radius Limit</span>
                            <span className="text-gray-900 font-semibold">
                              {studentLocationRows[selectedDetailStudent.id].radius_meters} meters
                            </span>
                          </div>
                        </div>
                        <div className="bg-green-50/50 p-2.5 rounded-xl border border-green-100 flex items-center justify-between">
                          <span className="text-xs text-green-700 font-medium">This student has a custom location assigned.</span>
                          <a
                            href={`https://maps.google.com/maps?q=${studentLocationRows[selectedDetailStudent.id].latitude},${studentLocationRows[selectedDetailStudent.id].longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-bold"
                          >
                            <FaMapMarkerAlt /> Open in Google Maps
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                            <FaMapMarkerAlt />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-gray-700">Global Office Location (Default)</p>
                            <p className="text-[10px] text-gray-500">No individual geofence assigned. Default office radius applies.</p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const emp = selectedDetailStudent;
                            setSelectedDetailStudent(null);
                            openLocationModal(emp);
                          }}
                          className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg font-bold transition-colors border border-blue-100"
                        >
                          Assign Location
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Audit metadata logs */}
                <div className="text-[10px] text-gray-400 flex flex-wrap justify-between pt-2">
                  <span>Joined System: {new Date(selectedDetailStudent.created_at).toLocaleString()}</span>
                  {selectedDetailStudent.updated_at && (
                    <span>Last Updated: {new Date(selectedDetailStudent.updated_at).toLocaleString()}</span>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50/50">
                <button
                  onClick={() => setSelectedDetailStudent(null)}
                  className="px-5 py-2.5 text-sm font-semibold bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-xl transition-colors shadow-sm"
                >
                  Close Profile
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Attachment Preview Modal */}
      {previewAttachment && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-70 p-4">
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

export default AdminPage;
