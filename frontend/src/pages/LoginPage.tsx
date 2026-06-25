import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaUser, FaLock, FaFingerprint, FaBuilding, FaShieldAlt,
  FaArrowRight, FaExclamationTriangle, FaCheckCircle, FaSpinner,
  FaEnvelope,
} from 'react-icons/fa';
import FaceCamera from '@components/camera/FaceCamera';
import { useAuth } from '@contexts/AuthContext';
import { useNotification } from '@contexts/NotificationContext';
import type { User } from '@contexts/AuthContext';
import api from '@services/api';
import { authApi } from '@api/authApi';

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────
interface PreLoginData {
  exists: boolean;
  role: 'admin' | 'teacher' | 'student' | null;
  has_password: boolean;
  has_face: boolean;
  required_method: 'face_and_password' | 'password_or_face' | 'password';
  missing_credentials: string[];
  needs_recovery: boolean;
  account_locked: boolean;
  locked_until: string | null;
  recovery_request?: {
    id: number;
    status: 'pending' | 'approved' | 'rejected' | 'completed' | 'expired';
    request_type: 'password_reset' | 'face_reset' | 'full_credential_reset';
    review_notes: string | null;
  } | null;
}

type LoginStep = 'id_entry' | 'checking' | 'password' | 'face_required' | 'locked' | 'recovery_needed';

// ────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────
const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { showError, showSuccess } = useNotification();

  const [step, setStep] = useState<LoginStep>('id_entry');
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [preLoginData, setPreLoginData] = useState<PreLoginData | null>(null);
  const [idError, setIdError] = useState('');
  const [adminContact, setAdminContact] = useState<{ name: string; email: string | null; mailtoLink: string | null } | null>(null);

  // Recovery states
  const [recoveryFrames, setRecoveryFrames] = useState<string[]>([]);
  const [isRecoverySubmitting, setIsRecoverySubmitting] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [recoverySuccess, setRecoverySuccess] = useState(false);

  const handleRecoveryFrameCapture = useCallback((frame: string) => {
    const base64Data = frame.includes(',') ? frame.split(',')[1] : frame;
    setRecoveryFrames(prev => {
      if (prev.length < 15 && !recoverySuccess) {
        return [...prev, base64Data];
      }
      return prev;
    });
  }, [recoverySuccess]);

  useEffect(() => {
    if (recoveryFrames.length >= 15 && !isRecoverySubmitting && !recoverySuccess) {
      const submitFrames = async () => {
        setIsRecoverySubmitting(true);
        setRecoveryError('');
        try {
          const res = await api.post('/auth/recovery/reset', {
            studentId,
            recoveryId: preLoginData?.recovery_request?.id,
            frames: recoveryFrames,
          });
          if (res.data.success) {
            setRecoverySuccess(true);
            showSuccess('Face profile registered successfully!');
          } else {
            setRecoveryError(res.data.message || 'Failed to submit face registration.');
            setRecoveryFrames([]);
          }
        } catch (err: any) {
          setRecoveryError(err.response?.data?.message || 'Failed to complete recovery. Please try again.');
          setRecoveryFrames([]);
        } finally {
          setIsRecoverySubmitting(false);
        }
      };
      submitFrames();
    }
  }, [recoveryFrames, isRecoverySubmitting, recoverySuccess, studentId, preLoginData?.recovery_request?.id, showSuccess]);

  // ── Bootstrap check + admin contact info (loaded once on mount) ──
  useEffect(() => {
    const checkBootstrap = async () => {
      try {
        const res = await api.get<{ success: boolean; bootstrapMode: boolean }>(
          `/auth/bootstrap/status?t=${Date.now()}`
        );
        if (res.data.success && res.data.bootstrapMode) {
          navigate('/setup/admin-face', { replace: true });
        }
      } catch (err) {
        console.error('Failed to check bootstrap status', err);
      }
    };
    const loadAdminContact = async () => {
      try {
        const res = await authApi.getAdminContactInfo();
        setAdminContact(res.data);
      } catch {
        // Non-fatal — contact link just won't be shown
      }
    };
    checkBootstrap();
    loadAdminContact();
  }, [navigate]);

  // ── Step 1: Check Student ID and determine login method ──
  const handleCheckStudentId = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId.trim()) { setIdError('Please enter your Student ID'); return; }
    setIdError('');
    setStep('checking');
    setIsLoading(true);

    try {
      const res = await api.post<PreLoginData & { success: boolean }>('/auth/pre-login-check', { studentId });
      const data = res.data;
      setPreLoginData(data);

      if (data.account_locked) {
        setStep('locked');
        return;
      }

      if (!data.exists) {
        // Student doesn't exist — show password step (will fail gracefully at login)
        setStep('password');
        return;
      }

      if (data.role === 'admin' && !data.has_face) {
        showError('Administrator face profile missing. Redirecting to setup center...');
        setTimeout(() => {
          navigate('/setup/admin-face', { replace: true });
        }, 1500);
        return;
      }

      if (data.needs_recovery) {
        setStep('recovery_needed');
        return;
      }

      // Route to appropriate step based on required method
      if (data.required_method === 'face_and_password') {
        // Admin or Teacher: Need password first, then face
        setStep('password');
      } else {
        // Student: either method — show both options
        setStep('password');
      }
    } catch (err: any) {
      setStep('password'); // Fallback to password if check fails
    } finally {
      setIsLoading(false);
    }
  }, [studentId]);

  // ── Step 2: Password login ──
  const handlePasswordLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await api.post<{
        success: boolean;
        tokens: { accessToken: string; refreshToken: string };
        student: User;
        message?: string;
        code?: string;
      }>('/auth/login', { studentId, password });

      if (response.data.success) {
        login(response.data.tokens, response.data.student);
        showSuccess('Login successful!');
        navigate('/dashboard');
      } else {
        showError(response.data.message || 'Login failed. Please try again.');
      }
    } catch (error: any) {
      if (error.response?.status === 403 && error.response?.data?.code === 'FACE_AUTHENTICATION_REQUIRED') {
        // Admin/Teacher: password was correct but face is also needed
        showSuccess('Password verified. Face authentication required...');
        setTimeout(() => {
          navigate('/face-login', { state: { studentId, password, requirePassword: true, passwordVerified: true } });
        }, 1000);
      } else if (error.response?.status === 423) {
        setStep('locked');
        setPreLoginData((d) => d ? { ...d, account_locked: true, locked_until: error.response?.data?.lockedUntil } : d);
      } else {
        showError(error.response?.data?.message || 'Login failed. Please check your credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [studentId, password, login, navigate, showError, showSuccess]);

  // ── Navigate to face login (for students who prefer face-only) ──
  const goToFaceLogin = useCallback(() => {
    navigate('/face-login', { state: { studentId } });
  }, [navigate, studentId]);

  // ── Role badge ──
  const roleBadge = preLoginData?.role ? (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
      preLoginData.role === 'admin' ? 'bg-red-500/15 text-red-400 border border-red-500/20' :
      preLoginData.role === 'teacher' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' :
      'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
    }`}>
      {preLoginData.role}
    </span>
  ) : null;

  // ── Login method indicator ──
  const loginMethodInfo = preLoginData ? (
    preLoginData.required_method === 'face_and_password' ? (
      <div className="flex items-start gap-3 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5 mb-5 backdrop-blur-sm">
        <FaShieldAlt className="text-amber-400 flex-shrink-0 mt-0.5 text-sm" />
        <div>
          Your role requires <strong className="text-amber-200">password + face verification</strong> for enhanced security.
        </div>
      </div>
    ) : (
      <div className="flex items-start gap-3 text-xs text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-3.5 mb-5 backdrop-blur-sm">
        <FaCheckCircle className="text-cyan-400 flex-shrink-0 mt-0.5 text-sm" />
        <div>
          You may sign in with <strong className="text-cyan-200">password</strong> or <strong className="text-cyan-200">face authentication</strong>.
        </div>
      </div>
    )
  ) : null;

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Ambient background glows */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-gradient-to-br from-cyan-500/10 to-blue-500/10 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-gradient-to-br from-purple-500/10 to-pink-500/10 blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Uiverse neon gradient border wrapper */}
        <div className="relative w-full rounded-2xl p-[1.5px] bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-600 shadow-2xl transition-all duration-300 hover:shadow-cyan-500/10 hover:scale-[1.01]">
          {/* Card inner body with glassmorphic transparency */}
          <div className="bg-slate-950/85 backdrop-blur-xl border border-white/10 rounded-[15px] p-8 flex flex-col relative overflow-hidden">
            
            {/* Brand Header */}
            <div className="flex flex-col items-center mb-8 text-center">
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                className="w-14 h-14 bg-gradient-to-tr from-cyan-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-3"
              >
                <FaBuilding className="text-2xl text-white drop-shadow-md" />
              </motion.div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent tracking-tight">Student Management</h1>
              <p className="text-slate-400 text-xs mt-1">Secure Management Portal</p>
            </div>

            <AnimatePresence mode="wait">
              {/* ── Step: ID Entry ── */}
              {step === 'id_entry' && (
                <motion.div key="id" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                  <h2 className="text-xl font-bold text-white mb-1">Welcome Back</h2>
                  <p className="text-slate-400 text-sm mb-6">Enter your Student ID to continue</p>
                  <form onSubmit={handleCheckStudentId}>
                    <div className="mb-5">
                      <label htmlFor="studentId" className="block text-sm font-medium text-slate-300 mb-2">Student ID</label>
                      <div className="relative group/input">
                        <FaUser className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/input:text-cyan-400 transition-colors" />
                        <input
                          id="studentId"
                          type="text"
                          value={studentId}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val.trim().toLowerCase() === 'admin') {
                              setStudentId('admin');
                            } else {
                              setStudentId(val);
                            }
                            setIdError('');
                          }}
                          className={`w-full pl-10 pr-4 py-3 bg-slate-900/60 border rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all duration-300 ${
                            idError 
                              ? 'border-red-500/50 focus:ring-red-500/20' 
                              : 'border-slate-700/50 focus:border-cyan-500 focus:ring-cyan-500/20'
                          }`}
                          placeholder="e.g. EMP001 or ADMIN"
                          autoFocus
                          autoComplete="username"
                          required
                        />
                      </div>
                      {idError && (
                        <p className="mt-2 text-xs text-red-400 flex items-center gap-1.5">
                          <FaExclamationTriangle className="text-[10px]" />
                          {idError}
                        </p>
                      )}
                    </div>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-semibold rounded-xl transition-all duration-300 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50 disabled:pointer-events-none shadow-lg shadow-cyan-500/10 hover:shadow-cyan-500/20"
                    >
                      Continue <FaArrowRight className="text-xs" />
                    </button>
                  </form>

                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800" /></div>
                    <div className="relative flex justify-center text-xs">
                      <span className="px-3 bg-slate-950 text-slate-500 rounded-full py-0.5 border border-slate-800/80">Or sign in with face</span>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate('/face-login')}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-slate-900/80 hover:bg-slate-800/80 border border-slate-700/50 text-slate-300 hover:text-white rounded-xl transition-all duration-300 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-slate-700"
                  >
                    <FaFingerprint className="text-cyan-400" /> Face Authentication
                  </button>
                </motion.div>
              )}

              {/* ── Step: Checking ── */}
              {step === 'checking' && (
                <motion.div key="checking" className="text-center py-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <FaSpinner className="mx-auto text-3xl text-cyan-400 animate-spin mb-3" />
                  <p className="text-slate-300 text-sm">Verifying student ID...</p>
                </motion.div>
              )}

              {/* ── Step: Account Locked ── */}
              {step === 'locked' && (
                <motion.div key="locked" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-6">
                  <FaExclamationTriangle className="mx-auto text-4xl text-red-500 mb-4 animate-pulse" />
                  <h3 className="text-lg font-bold text-white mb-2">Account Locked</h3>
                  <p className="text-slate-400 text-sm mb-4">Too many failed attempts. Your account is temporarily locked.</p>
                  {preLoginData?.locked_until && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400 mb-6 max-w-xs mx-auto">
                      Locked until: {new Date(preLoginData.locked_until).toLocaleString()}
                    </div>
                  )}
                  <button
                    onClick={() => { setStep('id_entry'); setPassword(''); }}
                    className="text-cyan-400 hover:text-cyan-300 text-sm font-medium transition-colors hover:underline"
                  >
                    ← Try different account
                  </button>
                </motion.div>
              )}

              {/* ── Step: Recovery Needed ── */}
              {step === 'recovery_needed' && (
                <motion.div key="recovery" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-2">
                  {!preLoginData?.recovery_request ? (
                    /* Case 1: No request submitted yet */
                    <>
                      <FaExclamationTriangle className="mx-auto text-4xl text-amber-400 mb-3 block text-center w-full" />
                      <h3 className="text-lg font-bold text-white mb-2 text-center">Credentials Missing</h3>
                      <p className="text-slate-400 text-sm mb-4 text-center">
                        Some required credentials for your account are missing:
                      </p>
                      {preLoginData?.missing_credentials && (
                        <ul className="list-disc list-inside text-sm text-red-400 mb-4 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                          {preLoginData.missing_credentials.map((c) => <li key={c}>{c}</li>)}
                        </ul>
                      )}
                      <p className="text-xs text-slate-500 text-center mb-5">Please contact your administrator to recover your credentials, or submit a recovery request below.</p>
                      <button
                        onClick={() => navigate('/recovery-request', { state: { studentId, missingCredentials: preLoginData?.missing_credentials } })}
                        className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl font-semibold text-sm transition-all duration-300 active:scale-[0.98] shadow-lg shadow-amber-500/10"
                      >
                        Request Credential Recovery
                      </button>
                    </>
                  ) : preLoginData.recovery_request.status === 'pending' ? (
                    /* Case 2: Request pending */
                    <>
                      <div className="text-center py-4">
                        <div className="h-10 w-10 rounded-full border-4 border-amber-500/20 border-t-amber-400 animate-spin mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-white mb-2">Request Pending</h3>
                        <p className="text-slate-400 text-sm mb-4 px-2">
                          Your recovery request is pending administrator approval. Please wait for confirmation.
                        </p>
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300 text-left mb-6">
                          <strong>Type:</strong> {preLoginData.recovery_request.request_type.replace('_', ' ').toUpperCase()}
                        </div>
                        <button
                          disabled
                          className="w-full py-3 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl font-medium text-sm cursor-not-allowed"
                        >
                          Request Pending Admin Approval
                        </button>
                      </div>
                    </>
                  ) : preLoginData.recovery_request.status === 'rejected' ? (
                    /* Case 3: Request rejected */
                    <>
                      <FaExclamationTriangle className="mx-auto text-4xl text-red-500 mb-3 block text-center w-full" />
                      <h3 className="text-lg font-bold text-white mb-2 text-center">Request Rejected</h3>
                      <p className="text-slate-400 text-sm mb-4 text-center">
                        Admin has rejected your recovery request.
                      </p>
                      {preLoginData.recovery_request.review_notes && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400 text-left mb-5">
                          <strong>Rejection Comment:</strong>
                          <p className="mt-1 italic text-slate-300">"{preLoginData.recovery_request.review_notes}"</p>
                        </div>
                      )}
                      <p className="text-xs text-slate-500 text-center mb-5">Please submit another recovery request or contact your administrator.</p>
                      <button
                        onClick={() => navigate('/recovery-request', { state: { studentId, missingCredentials: preLoginData?.missing_credentials } })}
                        className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl font-semibold text-sm transition-all duration-300 active:scale-[0.98] shadow-lg shadow-amber-500/10"
                      >
                        Request Credential Recovery Again
                      </button>
                    </>
                  ) : preLoginData.recovery_request.status === 'approved' ? (
                    /* Case 4: Request approved */
                    recoverySuccess ? (
                      <div className="text-center py-4">
                        <FaCheckCircle className="mx-auto text-5xl text-emerald-400 mb-4 animate-bounce" />
                        <h3 className="text-lg font-bold text-white mb-2">Setup Completed</h3>
                        <p className="text-slate-400 text-sm mb-6">
                          Your face has been successfully registered in the database in real-time.
                        </p>
                        <button
                          onClick={() => {
                            setStep('id_entry');
                            setPassword('');
                            setRecoveryFrames([]);
                            setRecoverySuccess(false);
                            setRecoveryError('');
                          }}
                          className="w-full py-3 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white rounded-xl font-semibold text-sm transition-all duration-300 active:scale-[0.98]"
                        >
                          Continue to Login
                        </button>
                      </div>
                    ) : (
                      <div>
                        <h3 className="text-lg font-bold text-white mb-2 text-center">Face Profile Enrollment</h3>
                        <p className="text-slate-400 text-xs mb-4 text-center">
                          Your recovery request was approved! Position your face in the camera frame to register.
                        </p>

                        {recoveryError && (
                          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 mb-4 text-center">
                            {recoveryError}
                          </div>
                        )}

                        <div className="aspect-video bg-slate-900 rounded-xl overflow-hidden mb-4 relative max-h-60 border border-slate-800">
                          <FaceCamera
                            onCapture={handleRecoveryFrameCapture}
                            className="w-full h-full"
                            autoCapture={true}
                            captureInterval={250}
                            showControls={false}
                          />
                          {recoveryFrames.length > 0 && (
                            <div className="absolute inset-0 bg-slate-950/60 flex flex-col items-center justify-center">
                              <div className="text-cyan-400 text-lg font-bold mb-1 animate-pulse">
                                Capturing: {recoveryFrames.length} / 15
                              </div>
                              <p className="text-[10px] text-slate-400">Keep looking at the camera</p>
                            </div>
                          )}
                        </div>

                        {/* Progress Bar */}
                        <div className="mb-4">
                          <div className="w-full bg-slate-800 rounded-full h-1.5">
                            <div
                              className="bg-gradient-to-r from-cyan-500 to-indigo-500 h-1.5 rounded-full transition-all duration-300"
                              style={{ width: `${(recoveryFrames.length / 15) * 100}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex justify-between items-center text-xs text-slate-400 mb-4">
                          <span>Captured {recoveryFrames.length}/15 frames</span>
                          {recoveryFrames.length > 0 && (
                            <button
                              onClick={() => setRecoveryFrames([])}
                              className="text-red-400 hover:text-red-300 hover:underline"
                            >
                              Reset
                            </button>
                          )}
                        </div>

                        {isRecoverySubmitting && (
                          <div className="text-xs text-cyan-400 text-center py-2 flex items-center justify-center gap-1.5">
                            <FaSpinner className="animate-spin text-sm" /> Processing face image...
                          </div>
                        )}
                      </div>
                    )
                  ) : (
                    /* Other states: fallback */
                    <>
                      <FaExclamationTriangle className="mx-auto text-4xl text-amber-400 mb-3 block text-center w-full" />
                      <h3 className="text-lg font-bold text-white mb-2 text-center">Credentials Missing</h3>
                      <button
                        onClick={() => navigate('/recovery-request', { state: { studentId } })}
                        className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl font-semibold text-sm transition-all duration-300 active:scale-[0.98]"
                      >
                        Request Credential Recovery
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      setStep('id_entry');
                      setPassword('');
                      setRecoveryFrames([]);
                      setRecoverySuccess(false);
                      setRecoveryError('');
                    }}
                    className="mt-4 w-full text-slate-400 hover:text-white text-sm text-center font-medium transition-colors"
                  >
                    ← Back
                  </button>
                </motion.div>
              )}

              {/* ── Step: Password ── */}
              {step === 'password' && (
                <motion.div key="password" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xl font-bold text-white">Sign In</h2>
                    {roleBadge}
                  </div>
                  <p className="text-slate-400 text-sm mb-4">
                    {studentId && <span className="font-semibold text-slate-200">{studentId}</span>}
                  </p>

                  {loginMethodInfo}

                  <form onSubmit={handlePasswordLogin}>
                    <div className="mb-5">
                      <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                      <div className="relative group/input">
                        <FaLock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/input:text-cyan-400 transition-colors" />
                        <input
                          id="password"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 bg-slate-900/60 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all duration-300"
                          placeholder="Enter your password"
                          autoFocus
                          autoComplete="current-password"
                          required
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-semibold rounded-xl transition-all duration-300 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50 disabled:pointer-events-none shadow-lg shadow-cyan-500/10 hover:shadow-cyan-500/20"
                    >
                      {isLoading ? <><FaSpinner className="animate-spin text-sm" /> Signing in...</> : 'Sign In'}
                    </button>
                  </form>

                  {/* Student can also use face-only */}
                  {preLoginData?.required_method === 'password_or_face' && (
                    <div className="mt-4">
                      <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800" /></div>
                        <div className="relative flex justify-center text-xs">
                          <span className="px-3 bg-slate-950 text-slate-500 rounded-full py-0.5 border border-slate-800/80">Or</span>
                        </div>
                      </div>
                      <button
                        onClick={goToFaceLogin}
                        className="w-full flex items-center justify-center gap-2 py-3 border border-slate-700/50 bg-slate-900/80 hover:bg-slate-800/80 text-slate-300 hover:text-white rounded-xl transition-all duration-300 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-slate-700"
                      >
                        <FaFingerprint className="text-cyan-400" /> Use Face Authentication Instead
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => { setStep('id_entry'); setPassword(''); }}
                    className="mt-5 w-full text-slate-400 hover:text-white text-sm text-center font-medium transition-colors"
                  >
                    ← Use a different ID
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Footer */}
            <div className="mt-8 pt-6 border-t border-slate-800/80 text-center">
              {adminContact?.email ? (
                <p className="text-xs text-slate-500">
                  Need an account?{' '}
                  <a
                    href={adminContact.mailtoLink || `mailto:${adminContact.email}`}
                    className="font-medium text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1.5 transition-colors"
                  >
                    <FaEnvelope className="text-[10px]" />
                    Contact {adminContact.name || 'administrator'}
                  </a>
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  Need an account?{' '}
                  <a href="mailto:admin@company.com" className="font-medium text-cyan-400 hover:text-cyan-300 transition-colors">
                    Contact administrator
                  </a>
                </p>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default LoginPage;
