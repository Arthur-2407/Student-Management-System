import { useState, useEffect, useRef } from 'react';

interface CameraHook {
  stream: MediaStream | null;
  error: string | null;
  isStreaming: boolean;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  captureFrame: () => Promise<string | null>;
  getVideoDevices: () => Promise<MediaDeviceInfo[]>;
  switchCamera: (deviceId: string) => Promise<void>;
}

// STABILIZATION: Global hardware lock and active stream references
// Resolves double-mount getUserMedia collisions and camera leaks
let globalCameraAcquisitionLock = false;
let globalActiveMediaStream: MediaStream | null = null;

export const useCamera = (): CameraHook => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  // Guard: prevents concurrent getUserMedia calls in the same instance
  const isStarting = useRef(false);

  // Start camera — guarded against concurrent calls globally and locally
  const startCamera = async () => {
    if (globalCameraAcquisitionLock || isStarting.current) {
      console.warn('[Camera] startCamera already in progress (globally or locally), ignoring duplicate call.');
      return;
    }
    globalCameraAcquisitionLock = true;
    isStarting.current = true;
    setError(null);

    // Stop any globally active stream to prevent double-mount hardware locks
    if (globalActiveMediaStream) {
      console.warn('[Camera] Stopping globally active stream to prevent leak on double-mount.');
      globalActiveMediaStream.getTracks().forEach(track => track.stop());
      globalActiveMediaStream = null;
    }

    // Stop any local existing stream before acquiring a new one
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      globalActiveMediaStream = mediaStream;
      setStream(mediaStream);
      setIsStreaming(true);
    } catch (err) {
      const domErr = err as DOMException;
      if (domErr.name === 'NotAllowedError' || domErr.name === 'PermissionDeniedError') {
        setError('Camera permission denied. Please allow camera access in your browser settings.');
      } else if (domErr.name === 'NotFoundError' || domErr.name === 'DevicesNotFoundError') {
        setError('No camera found. Please connect a camera and try again.');
      } else if (domErr.name === 'NotReadableError' || domErr.name === 'TrackStartError') {
        setError('Camera is already in use by another application. Please close it and try again.');
      } else {
        console.error('[Camera] getUserMedia error:', err);
        setError('Failed to access camera. Please check permissions and try again.');
      }
    } finally {
      isStarting.current = false;
      globalCameraAcquisitionLock = false;
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      if (globalActiveMediaStream === stream) {
        globalActiveMediaStream = null;
      }
      setStream(null);
      setIsStreaming(false);
    }
  };

  // Capture frame as base64
  const captureFrame = async (): Promise<string | null> => {
    if (!stream) return null;

    // Find the existing video element that is already playing this stream
    const videos = document.querySelectorAll('video');
    let video: HTMLVideoElement | null = null;
    for (const v of Array.from(videos)) {
      if (v.srcObject === stream && v.readyState >= 2) {
        video = v;
        break;
      }
    }

    if (!video) return null;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    return canvas.toDataURL('image/jpeg', 0.8);
  };

  // Get available video devices
  const getVideoDevices = async (): Promise<MediaDeviceInfo[]> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'videoinput');
    } catch (err) {
      console.error('Error enumerating devices:', err);
      return [];
    }
  };

  // Switch camera — stops old stream first to release the device
  const switchCamera = async (deviceId: string) => {
    // Stop current stream directly (don't rely on state-based stopCamera)
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setIsStreaming(false);
    }

    if (isStarting.current) return;
    isStarting.current = true;
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setStream(mediaStream);
      setIsStreaming(true);
    } catch (err) {
      console.error('[Camera] switchCamera error:', err);
      setError('Failed to switch camera. Please try again.');
    } finally {
      isStarting.current = false;
    }
  };

  // Cleanup on unmount — must depend on stream so closure captures latest value
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        if (globalActiveMediaStream === stream) {
          globalActiveMediaStream = null;
        }
      }
    };
  }, [stream]);

  return {
    stream,
    error,
    isStreaming,
    startCamera,
    stopCamera,
    captureFrame,
    getVideoDevices,
    switchCamera,
  };
};