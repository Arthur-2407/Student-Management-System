import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaLock, FaCamera, FaUpload, FaCheckCircle, FaExclamationTriangle,
  FaShieldAlt, FaLightbulb, FaUserShield, FaUser, FaEnvelope,
  FaPhone, FaMapMarkerAlt, FaBriefcase, FaLifeRing, FaArrowRight, FaArrowLeft,
} from 'react-icons/fa';
import FaceCamera from '@components/camera/FaceCamera';
import { authApi } from '@api/authApi';

// WEBSITECHK_BOOTSTRAP_EXPANSION — Full admin configuration center
// Steps: 1=Profile, 2=Recovery, 3=Password, 4=Face

type SetupStep = 1 | 2 | 3 | 4;

interface AdminProfile {
  name: string;
  email: string;
  phone: string;
  address: string;
  designation: string;
}

interface RecoveryInfo {
  recoveryEmail: string;
  recoveryPhone: string;
}

const BootstrapSetupPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<SetupStep>(1);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // Recovery Mode states
  const [isRecovery] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('recovery') === 'true';
  });
  const [isOtpVerified, setIsOtpVerified] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState('');

  const handleSendOtp = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    setOtpLoading(true);
    try {
      const res = await authApi.initiateAdminRecovery();
      if (res.data.success) {
        setOtpSent(true);
        setMaskedEmail(res.data.recoveryEmailMasked);
        setSuccessMessage(res.data.message || 'OTP sent successfully.');
      } else {
        setErrorMessage(res.data.error || 'Failed to send OTP.');
      }
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error || err.message || 'Failed to initiate admin recovery.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    if (!otp.trim()) {
      setErrorMessage('Please enter the OTP.');
      return;
    }
    setOtpLoading(true);
    try {
      const res = await authApi.verifyAdminRecoveryOtp(otp.trim());
      if (res.data.success) {
        setIsOtpVerified(true);
        setSuccessMessage(res.data.message || 'Identity verified successfully.');
      } else {
        setErrorMessage(res.data.error || 'Failed to verify OTP.');
      }
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error || err.message || 'Failed to verify OTP.');
    } finally {
      setOtpLoading(false);
    }
  };
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Step 1: Admin Profile
  const [profile, setProfile] = useState<AdminProfile>({
    name: '',
    email: '',
    phone: '',
    address: '',
    designation: '',
  });

  // Step 2: Recovery Info
  const [recovery, setRecovery] = useState<RecoveryInfo>({
    recoveryEmail: '',
    recoveryPhone: '',
  });

  // Step 3: Password
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Step 4: Face
  const [frames, setFrames] = useState<string[]>([]);
  const [uploadMode, setUploadMode] = useState<'camera' | 'upload'>('camera');

  // Password validation
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const passwordsMatch = password === confirmPassword && password.length > 0;
  const isPasswordValid = hasMinLength && hasUppercase && hasLowercase && hasNumber;
  const isFaceCaptured = uploadMode === 'camera' ? frames.length >= 10 : frames.length >= 1;

  // Validation per step
  const isStep1Valid = profile.name.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email) &&
    profile.designation.trim().length >= 2;

  const isStep2Valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recovery.recoveryEmail);

  const isStep3Valid = isPasswordValid && passwordsMatch;

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const recoveryParam = urlParams.get('recovery') === 'true';
        const res = await authApi.checkBootstrapStatus(recoveryParam);
        if (res.data.success && !res.data.bootstrapMode) {
          navigate('/login', { replace: true });
        }
      } catch (err) {
        console.error('Failed to verify bootstrap status', err);
      } finally {
        setIsCheckingStatus(false);
      }
    };
    checkStatus();
  }, [navigate]);

  const handleFrameCapture = useCallback((frame: string) => {
    const base64Data = frame.includes(',') ? frame.split(',')[1] : frame;
    setFrames(prev => {
      if (prev.length < 10) {
        return [...prev, base64Data];
      }
      return prev;
    });
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      // FIX: FileReader.readAsDataURL() returns 'data:image/jpeg;base64,/9j...'
      // The prefix contains ':' ';' ',' which are invalid base64 characters and crash
      // Python's base64.b64decode() in the Face-AI service. Strip to pure base64 only.
      const base64String = (reader.result as string).split(',')[1] ?? '';
      setFrames([base64String]); // 1 frame is enough for upload mode to save bandwidth/processing
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    setErrorMessage('');
    setSuccessMessage('');

    if (!isStep1Valid || !isStep2Valid || !isStep3Valid || !isFaceCaptured) {
      setErrorMessage('Please complete all steps before submitting.');
      return;
    }

    setIsLoading(true);
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const recoveryParam = urlParams.get('recovery') === 'true';
      const res = await authApi.bootstrapSetup({
        password,
        frames,
        adminName: profile.name,
        adminEmail: profile.email,
        adminPhone: profile.phone,
        adminAddress: profile.address,
        adminDesignation: profile.designation,
        recoveryEmail: recovery.recoveryEmail,
        recoveryPhone: recovery.recoveryPhone,
      }, recoveryParam);

      if (res.data.success) {
        setSuccessMessage(res.data.message || 'Setup completed successfully.');
        setTimeout(() => navigate('/login', { replace: true }), 3000);
      } else {
        setErrorMessage(res.data.error || 'Failed to complete setup');
      }
    } catch (err: any) {
      const status = err.response?.status;
      const code = err.response?.data?.code;
      const backendError = err.response?.data?.error;

      const isServiceDown = status === 503 && code === 'FACE_AI_UNAVAILABLE' && !backendError?.includes('No face') && !backendError?.includes('frame');
      if (isServiceDown) {
        setErrorMessage(
          'Face-AI Service Unavailable: Please start the face-recognition service and ensure it is healthy before completing setup.'
        );
      } else if (backendError) {
        // Surface the exact backend message (no face detected, bad frames, etc.)
        setErrorMessage(backendError);
      } else {
        setErrorMessage(err.response?.data?.error || err.message || 'An error occurred during setup.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingStatus) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center font-sans">
        <div className="h-12 w-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-400">Verifying bootstrap status...</p>
      </div>
    );
  }

  const steps = [
    { id: 1, label: 'Profile', icon: FaUser },
    { id: 2, label: 'Recovery', icon: FaLifeRing },
    { id: 3, label: 'Password', icon: FaLock },
    { id: 4, label: 'Face', icon: FaCamera },
  ];
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4 font-sans select-none relative overflow-hidden">
      {/* CSS Styles injection */}
      <style>{`
        @keyframes scan-laser {
          0% { top: 0%; opacity: 0.8; }
          50% { top: 100%; opacity: 0.8; }
          100% { top: 0%; opacity: 0.8; }
        }
        @keyframes rotate-hud {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.2; transform: scale(1) translate(-50%, -50%); }
          50% { opacity: 0.4; transform: scale(1.08) translate(-50%, -50%); }
        }
        @keyframes drift-bg {
          0%, 100% { background-position: 0px 0px; }
          50% { background-position: 20px 20px; }
        }
        .scanner-line {
          height: 3px;
          background: linear-gradient(90deg, transparent, #6366f1, #8b5cf6, #6366f1, transparent);
          box-shadow: 0 0 15px #6366f1, 0 0 8px #8b5cf6;
          position: absolute;
          width: 100%;
          animation: scan-laser 3s infinite linear;
          pointer-events: none;
          z-index: 10;
        }
        .custom-grid {
          background-size: 30px 30px;
          background-image: 
            linear-gradient(to right, rgba(99, 102, 241, 0.02) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(99, 102, 241, 0.02) 1px, transparent 1px);
          animation: drift-bg 30s infinite linear;
        }
        .pulse-ring {
          position: absolute;
          width: 100%;
          height: 100%;
          border-radius: inherit;
          border: 1px solid rgba(99, 102, 241, 0.4);
          animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
          pointer-events: none;
        }
        .hud-bracket {
          width: 20px;
          height: 20px;
          border-color: #6366f1;
          position: absolute;
          pointer-events: none;
          z-index: 5;
        }
      `}</style>

      {/* Background decorations */}
      <div className="absolute inset-0 custom-grid pointer-events-none" />
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-indigo-950/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-violet-950/20 blur-[120px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-indigo-500/5 blur-[100px] pointer-events-none" style={{ animation: 'pulse-glow 8s infinite ease-in-out' }} />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-2xl bg-slate-900/30 backdrop-blur-xl border border-white/10 rounded-3xl shadow-[0_0_50px_rgba(99,102,241,0.08)] z-10"
      >
        {/* Header */}
        <div className="p-8 border-b border-white/5 relative">
          <div className="flex items-center gap-5 mb-4">
            <motion.div 
              whileHover={{ rotate: 10 }}
              className="h-14 w-14 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center text-indigo-400 text-2xl flex-shrink-0 shadow-[0_0_20px_rgba(99,102,241,0.15)]"
            >
              <FaUserShield />
            </motion.div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-1">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                Initialize System
              </div>
              <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-slate-100 via-white to-indigo-200 bg-clip-text text-transparent">
                First-Time Setup
              </h1>
              <p className="text-slate-400 text-sm mt-0.5 font-medium">
                Configure your administrator profile and secure identity mapping
              </p>
            </div>
          </div>

          {/* Step progress */}
          <div className="flex items-center gap-0 mt-8">
            {steps.map((s, idx) => (
              <div key={s.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center relative z-10">
                  <motion.div 
                    whileHover={{ scale: 1.05 }}
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-semibold transition-all relative ${
                      step > s.id 
                        ? 'bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]' 
                        : step === s.id 
                        ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white ring-4 ring-indigo-500/20 shadow-[0_0_20px_rgba(99,102,241,0.4)]' 
                        : 'bg-slate-950 border border-slate-800 text-slate-500'
                    }`}
                  >
                    {step === s.id && <div className="pulse-ring" />}
                    {step > s.id ? <FaCheckCircle className="text-sm" /> : <s.icon className="text-sm" />}
                  </motion.div>
                  <span className={`text-xs mt-2 font-semibold tracking-wide ${step === s.id ? 'text-indigo-300 font-bold' : step > s.id ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {s.label}
                  </span>
                </div>
                {idx < steps.length - 1 && (
                  <div className="flex-1 h-[2px] mx-2 mb-6 rounded-full bg-slate-950 relative overflow-hidden">
                    <motion.div 
                      initial={{ width: '0%' }}
                      animate={{ width: step > s.id ? '100%' : '0%' }}
                      transition={{ duration: 0.4 }}
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-400 to-teal-500" 
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Alerts */}
        <AnimatePresence>
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              className="mx-8 mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3 text-red-300 text-sm backdrop-blur-md shadow-lg"
            >
              <FaExclamationTriangle className="mt-0.5 flex-shrink-0 text-red-400 text-base" />
              <span className="font-medium">{errorMessage}</span>
            </motion.div>
          )}
          {successMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              className="mx-8 mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-start gap-3 text-emerald-300 text-sm backdrop-blur-md shadow-lg"
            >
              <FaCheckCircle className="mt-0.5 flex-shrink-0 text-emerald-400 text-base" />
              <span className="font-medium">{successMessage} Redirecting to login...</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step Content */}
        <div className="p-8">
          <AnimatePresence mode="wait">
            {isRecovery && !isOtpVerified && (
              <motion.div
                key="otp-step"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.4 }}
                className="space-y-6"
              >
                <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-6 text-sm text-slate-300 space-y-3 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <FaShieldAlt className="text-7xl" />
                  </div>
                  <div className="flex items-center gap-2 text-indigo-300 font-bold text-base">
                    <FaShieldAlt className="text-lg text-indigo-400" />
                    <span>Identity Verification Gating</span>
                  </div>
                  <p className="text-slate-400 leading-relaxed font-medium">
                    To modify system credentials, verify possession of the primary administrator recovery email address.
                  </p>
                  {otpSent && (
                    <motion.div 
                      initial={{ scale: 0.98, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="text-emerald-300 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 flex items-center gap-2"
                    >
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                      Verification token dispatched to: <strong className="text-white font-mono">{maskedEmail}</strong>
                    </motion.div>
                  )}
                </div>

                {!otpSent ? (
                  <motion.button
                    whileHover={{ scale: 1.01, boxShadow: '0 0 25px rgba(99, 102, 241, 0.3)' }}
                    whileTap={{ scale: 0.99 }}
                    onClick={handleSendOtp}
                    disabled={otpLoading}
                    className="w-full py-4 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white rounded-2xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 text-sm disabled:opacity-50 tracking-wide"
                  >
                    {otpLoading ? (
                      <>
                        <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Generating Token...
                      </>
                    ) : (
                      <>Send Verification OTP <FaArrowRight /></>
                    )}
                  </motion.button>
                ) : (
                  <div className="space-y-5">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-indigo-300/80 mb-2">
                        Verification Code (OTP)
                      </label>
                      <input
                        type="text"
                        value={otp}
                        onChange={e => setOtp(e.target.value)}
                        className="w-full bg-slate-950/60 border border-slate-800/80 rounded-2xl px-4 py-4 text-center tracking-widest font-mono text-xl focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all text-slate-100 placeholder-slate-800"
                        placeholder="0 0 0 0 0 0"
                        maxLength={6}
                      />
                    </div>
                    <div className="flex gap-4">
                      <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={handleSendOtp}
                        disabled={otpLoading}
                        className="flex-1 py-3.5 bg-slate-950 border border-slate-800/80 text-slate-400 hover:text-slate-200 rounded-2xl font-bold transition-all text-sm disabled:opacity-50"
                      >
                        Resend Token
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.01, boxShadow: '0 0 25px rgba(16, 185, 129, 0.3)' }}
                        whileTap={{ scale: 0.99 }}
                        onClick={handleVerifyOtp}
                        disabled={otpLoading}
                        className="flex-1 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white rounded-2xl font-bold transition-all shadow-lg text-sm disabled:opacity-50"
                      >
                        {otpLoading ? (
                          <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                        ) : (
                          'Verify Identity'
                        )}
                      </motion.button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── STEP 1: Admin Profile ── */}
            {(!isRecovery || isOtpVerified) && step === 1 && (
              <motion.div 
                key="step1" 
                initial={{ opacity: 0, x: 15 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -15 }}
                transition={{ duration: 0.4 }}
                className="space-y-6"
              >
                <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2.5 mb-2">
                  <FaUser className="text-indigo-400" /> Administrative Profile
                </h2>
                <div className="grid grid-cols-2 gap-5">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Full Name <span className="text-indigo-400">*</span>
                    </label>
                    <div className="relative group">
                      <FaUser className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                      <input
                        type="text"
                        value={profile.name}
                        onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                        className="w-full bg-slate-950/40 border border-slate-800 rounded-2xl pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all text-slate-200 placeholder-slate-600"
                        placeholder="e.g. Stephen Strange"
                      />
                    </div>
                  </div>

                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Email Address <span className="text-indigo-400">*</span>
                    </label>
                    <div className="relative group">
                      <FaEnvelope className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                      <input
                        type="email"
                        value={profile.email}
                        onChange={e => setProfile(p => ({ ...p, email: e.target.value }))}
                        className="w-full bg-slate-950/40 border border-slate-800 rounded-2xl pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all text-slate-200 placeholder-slate-600"
                        placeholder="admin@attendance.local"
                      />
                    </div>
                  </div>

                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Phone Number
                    </label>
                    <div className="relative group">
                      <FaPhone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                      <input
                        type="tel"
                        value={profile.phone}
                        onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                        className="w-full bg-slate-950/40 border border-slate-800 rounded-2xl pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all text-slate-200 placeholder-slate-600"
                        placeholder="+1 (555) 019-2834"
                      />
                    </div>
                  </div>

                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Designation <span className="text-indigo-400">*</span>
                    </label>
                    <div className="relative group">
                      <FaBriefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                      <input
                        type="text"
                        value={profile.designation}
                        onChange={e => setProfile(p => ({ ...p, designation: e.target.value }))}
                        className="w-full bg-slate-950/40 border border-slate-800 rounded-2xl pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all text-slate-200 placeholder-slate-600"
                        placeholder="e.g. Chief Systems Administrator"
                      />
                    </div>
                  </div>

                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                      HQ Address
                    </label>
                    <div className="relative group">
                      <FaMapMarkerAlt className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                      <input
                        type="text"
                        value={profile.address}
                        onChange={e => setProfile(p => ({ ...p, address: e.target.value }))}
                        className="w-full bg-slate-950/40 border border-slate-800 rounded-2xl pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all text-slate-200 placeholder-slate-600"
                        placeholder="HQ Server Room 4B"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── STEP 2: Recovery ── */}
            {(!isRecovery || isOtpVerified) && step === 2 && (
              <motion.div 
                key="step2" 
                initial={{ opacity: 0, x: 15 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -15 }}
                transition={{ duration: 0.4 }}
                className="space-y-6"
              >
                <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2.5 mb-2">
                  <FaLifeRing className="text-indigo-400" /> Recovery Parameters
                </h2>
                <p className="text-slate-400 text-sm leading-relaxed font-medium">
                  Define backup contacts for system recovery audits, password recovery hooks, and OTP challenges.
                </p>
                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Recovery Email <span className="text-red-400">*</span>
                    </label>
                    <div className="relative group">
                      <FaEnvelope className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                      <input
                        type="email"
                        value={recovery.recoveryEmail}
                        onChange={e => setRecovery(r => ({ ...r, recoveryEmail: e.target.value }))}
                        className="w-full bg-slate-950/40 border border-slate-800 rounded-2xl pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all text-slate-200 placeholder-slate-600"
                        placeholder="recovery@attendance.local"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-2 font-medium">
                      Must be a different mailbox than your profile email address to satisfy security criteria.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Recovery Phone
                    </label>
                    <div className="relative group">
                      <FaPhone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                      <input
                        type="tel"
                        value={recovery.recoveryPhone}
                        onChange={e => setRecovery(r => ({ ...r, recoveryPhone: e.target.value }))}
                        className="w-full bg-slate-950/40 border border-slate-800 rounded-2xl pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all text-slate-200 placeholder-slate-600"
                        placeholder="+1 (555) 999-8888"
                      />
                    </div>
                  </div>
                </div>

                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-indigo-950/20 rounded-2xl p-5 border border-indigo-500/15 flex items-start gap-4"
                >
                  <FaLightbulb className="text-indigo-400 mt-1 flex-shrink-0 text-lg animate-pulse" />
                  <p className="text-xs text-slate-400 leading-relaxed font-medium">
                    This recovery configuration is securely integrated into the <strong className="text-slate-300">Identity Replacement</strong> API.
                    OTP codes are dispatched here to prove ownership of the system before executing structural account resets.
                  </p>
                </motion.div>
              </motion.div>
            )}

            {/* ── STEP 3: Password ── */}
            {(!isRecovery || isOtpVerified) && step === 3 && (
              <motion.div 
                key="step3" 
                initial={{ opacity: 0, x: 15 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -15 }}
                transition={{ duration: 0.4 }}
                className="space-y-6"
              >
                <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2.5 mb-6">
                  <FaLock className="text-indigo-400" /> Account Security Access
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full bg-slate-950/40 border border-slate-800 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all text-slate-200 placeholder-slate-700"
                      placeholder="••••••••"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="w-full bg-slate-950/40 border border-slate-800 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all text-slate-200 placeholder-slate-700"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                {/* Password strength checklist */}
                <div className="bg-slate-950/40 rounded-2xl p-5 border border-slate-800/80 space-y-3">
                  <span className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Password Security Requirements
                  </span>
                  {[
                    { ok: hasMinLength, label: 'At least 8 characters long' },
                    { ok: hasUppercase, label: 'One uppercase character (A-Z)' },
                    { ok: hasLowercase, label: 'One lowercase character (a-z)' },
                    { ok: hasNumber, label: 'One numerical digit (0-9)' },
                    { ok: passwordsMatch, label: 'Matching confirmation values' },
                  ].map(({ ok, label }) => (
                    <motion.div 
                      key={label}
                      layout
                      className="flex items-center gap-3 text-xs"
                    >
                      <FaCheckCircle className={`text-base transition-colors ${ok ? 'text-emerald-400' : 'text-slate-800'}`} />
                      <span className={`font-semibold transition-colors ${ok ? 'text-slate-200' : 'text-slate-500'}`}>{label}</span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── STEP 4: Face Enrollment ── */}
            {(!isRecovery || isOtpVerified) && step === 4 && (
              <motion.div 
                key="step4" 
                initial={{ opacity: 0, x: 15 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -15 }}
                transition={{ duration: 0.4 }}
                className="space-y-6"
              >
                <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2.5 mb-2">
                  <FaCamera className="text-indigo-400" /> Biometric Signature Mapping
                </h2>

                {/* Mode tabs */}
                <div className="flex bg-slate-950/60 p-1.5 rounded-2xl border border-slate-800/80 mb-6 text-xs font-bold">
                  {['camera', 'upload'].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setUploadMode(m as 'camera' | 'upload'); setFrames([]); }}
                      className={`flex-1 py-3 text-center rounded-xl transition-all capitalize ${
                        uploadMode === m
                          ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {m === 'camera' ? '📷 Real-Time Camera' : '📁 Image File Upload'}
                    </button>
                  ))}
                </div>

                {uploadMode === 'camera' ? (
                  <div className="space-y-4">
                    <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-950 border border-slate-800/80 shadow-inner group">
                      {/* High-tech HUD Brackets */}
                      <div className="hud-bracket top-4 left-4 border-t-2 border-l-2" />
                      <div className="hud-bracket top-4 right-4 border-t-2 border-r-2" />
                      <div className="hud-bracket bottom-4 left-4 border-b-2 border-l-2" />
                      <div className="hud-bracket bottom-4 right-4 border-b-2 border-r-2" />

                      {/* Laser scanner element */}
                      {frames.length < 10 && <div className="scanner-line" />}

                      {/* Circular target compass */}
                      {frames.length < 10 && (
                        <div 
                          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-48 w-48 border border-dashed border-indigo-500/20 rounded-full pointer-events-none z-10"
                          style={{ animation: 'rotate-hud 25s infinite linear' }}
                        />
                      )}

                      <FaceCamera
                        onCapture={handleFrameCapture}
                        showControls={false}
                        autoCapture={frames.length < 10}
                        captureInterval={300}
                        className="w-full h-full object-cover scale-x-[-1]"
                      />
                      
                      {frames.length > 0 && frames.length < 10 && (
                        <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-[2px] flex flex-col items-center justify-center z-20">
                          <div className="text-indigo-400 text-2xl font-black mb-1 animate-pulse tracking-wide font-mono">
                            CAPTURING: {frames.length} / 10
                          </div>
                          <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Align face inside the scanner boundary</p>
                        </div>
                      )}
                      
                      {isFaceCaptured && (
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="absolute inset-0 bg-emerald-950/40 backdrop-blur-sm border-2 border-emerald-500 flex items-center justify-center z-20"
                        >
                          <div className="text-center">
                            <motion.div 
                              initial={{ scale: 0.5, rotate: -45 }}
                              animate={{ scale: 1, rotate: 0 }}
                              transition={{ type: 'spring', damping: 10 }}
                            >
                              <FaCheckCircle className="text-emerald-400 text-4xl mx-auto mb-3 filter drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]" />
                            </motion.div>
                            <p className="text-emerald-300 text-base font-bold tracking-wide uppercase">Biometric Mapping Completed</p>
                          </div>
                        </motion.div>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
                      <span className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${frames.length >= 10 ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]' : 'bg-indigo-400 animate-pulse'}`} />
                        Mapped Frames: {frames.length} / 10
                      </span>
                      {frames.length > 0 && (
                        <button type="button" onClick={() => setFrames([])} className="text-red-400 hover:text-red-300 transition-colors">
                          Reset Scanner
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-2xl p-12 bg-slate-950/60 hover:bg-slate-950/80 hover:border-indigo-500/40 transition-all cursor-pointer group relative shadow-inner">
                      <input type="file" accept="image/*" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                      <FaUpload className="text-slate-600 text-4xl mb-4 group-hover:text-indigo-400 group-hover:scale-110 transition-all duration-300" />
                      <p className="text-sm font-bold text-slate-400 group-hover:text-slate-200 transition-colors">
                        Drop photo or browse directory
                      </p>
                      <p className="text-xs text-slate-600 mt-2 font-medium">PNG, JPG, or WEBP formats up to 10MB</p>
                    </label>
                    {isFaceCaptured && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex items-center justify-between bg-slate-950 border border-emerald-500/20 p-4 rounded-2xl text-xs"
                      >
                        <div className="flex items-center gap-2.5 text-emerald-400 font-bold">
                          <FaCheckCircle className="text-emerald-500 text-sm" /> Signature Image Loaded
                        </div>
                        <button type="button" onClick={() => setFrames([])} className="text-red-400 hover:text-red-300 transition-colors font-bold">
                          Reset Upload
                        </button>
                      </motion.div>
                    )}
                  </div>
                )}

                <div className="bg-slate-950/40 p-4 border border-slate-800/80 rounded-2xl flex items-start gap-3.5 text-xs text-slate-500 leading-relaxed font-medium">
                  <FaLightbulb className="text-indigo-400 mt-0.5 flex-shrink-0 text-lg animate-pulse" />
                  <div>
                    <span className="font-bold text-slate-300">Biometric Guidelines: </span>
                    Ensure balanced lighting, direct gaze, and visible features. Plain backgrounds produce optimal mathematical vectors. Plain text representations are discarded immediately after embedding extraction.
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation Footer */}
        {!(isRecovery && !isOtpVerified) && (
          <div className="p-6 border-t border-white/5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-slate-500 font-semibold">
              <FaShieldAlt className="text-indigo-400" />
              Cryptographic local vector storage
            </div>

            <div className="flex items-center gap-3">
              {step > 1 && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => { setStep((step - 1) as SetupStep); setErrorMessage(''); }}
                  className="flex items-center gap-2 px-5 py-3 bg-slate-950 border border-slate-800 text-slate-300 hover:text-white rounded-2xl text-sm font-bold transition-all"
                >
                  <FaArrowLeft /> Back
                </motion.button>
              )}

              {step < 4 ? (
                <motion.button
                  whileHover={{ scale: 1.02, boxShadow: '0 0 25px rgba(99, 102, 241, 0.3)' }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => {
                    setErrorMessage('');
                    if (step === 1 && !isStep1Valid) { setErrorMessage('Please populate all mandatory fields (Name, Email, Designation).'); return; }
                    if (step === 2 && !isStep2Valid) { setErrorMessage('Please provide a valid format recovery email.'); return; }
                    if (step === 3 && !isStep3Valid) { setErrorMessage('Verify that the password meets all dynamic criteria.'); return; }
                    setStep((step + 1) as SetupStep);
                  }}
                  className="flex items-center gap-2 px-7 py-3 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white rounded-2xl text-sm font-black shadow-lg transition-all"
                >
                  Continue <FaArrowRight />
                </motion.button>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.02, boxShadow: '0 0 25px rgba(99, 102, 241, 0.4)' }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={handleSubmit}
                  disabled={isLoading || !isFaceCaptured}
                  className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 disabled:opacity-50 text-white font-black rounded-2xl shadow-lg transition-all text-sm"
                >
                  {isLoading ? (
                    <>
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving Configuration...
                    </>
                  ) : (
                    <>Complete Enrollment <FaCheckCircle /></>
                  )}
                </motion.button>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default BootstrapSetupPage;
