import { logger } from '@utils/logger';
import { useState, useEffect, useRef } from 'react';

interface CameraHook {
  stream: MediaStream | null;
  error: string | null;
  isStreaming: boolean;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  captureFrame: (videoElement?: HTMLVideoElement | null) => Promise<string | null>;
  getVideoDevices: () => Promise<MediaDeviceInfo[]>;
  switchCamera: (deviceId: string) => Promise<void>;
}

// STABILIZATION: Global active stream and pending promise references
// Resolves double-mount getUserMedia collisions and camera leaks
let globalActiveMediaStream: MediaStream | null = null;
let globalPendingStreamPromise: Promise<MediaStream> | null = null;

export const useCamera = (): CameraHook => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  
  // Guard: prevents concurrent getUserMedia calls in the same instance
  const isStarting = useRef(false);
  const isMounted = useRef(true);

  // Sync mounted status
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Start camera — guarded against concurrent calls globally and locally
  const startCamera = async () => {
    if (isStarting.current) {
      logger.warn('[Camera] startCamera already in progress locally, ignoring duplicate call.');
      return;
    }
    isStarting.current = true;
    setError(null);

    // Stop any local existing stream before acquiring a new one
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setIsStreaming(false);
    }

    try {
      let mediaStream: MediaStream;

      if (globalPendingStreamPromise) {
        logger.info('[Camera] Awaiting active getUserMedia call from another instance.');
        mediaStream = await globalPendingStreamPromise;
      } else {
        // Stop any globally active stream to prevent double-mount hardware locks
        if (globalActiveMediaStream) {
          logger.warn('[Camera] Stopping globally active stream to prevent leak on double-mount.');
          globalActiveMediaStream.getTracks().forEach(track => track.stop());
          globalActiveMediaStream = null;
        }

        logger.info('[Camera] Requesting user media stream...');
        const promise = navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        globalPendingStreamPromise = promise;
        try {
          mediaStream = await promise;
          globalActiveMediaStream = mediaStream;
        } finally {
          globalPendingStreamPromise = null;
        }
      }

      if (!isMounted.current) {
        logger.warn('[Camera] Component unmounted before stream resolved. Stopping tracks to prevent leak.');
        mediaStream.getTracks().forEach(track => track.stop());
        if (globalActiveMediaStream === mediaStream) {
          globalActiveMediaStream = null;
        }
        return;
      }

      // Check if tracks are still live (not stopped by another unmounted instance)
      const hasActiveTracks = mediaStream.getVideoTracks().some(track => track.readyState === 'live');
      if (!hasActiveTracks) {
        logger.warn('[Camera] Acquired stream has no active tracks (possibly stopped). Re-initiating...');
        if (globalActiveMediaStream === mediaStream) {
          globalActiveMediaStream = null;
        }
        isStarting.current = false;
        await startCamera();
        return;
      }

      setStream(mediaStream);
      setIsStreaming(true);
    } catch (err) {
      if (!isMounted.current) return;
      const domErr = err as DOMException;
      if (domErr.name === 'NotAllowedError' || domErr.name === 'PermissionDeniedError') {
        setError('Camera permission denied. Please allow camera access in your browser settings.');
      } else if (domErr.name === 'NotFoundError' || domErr.name === 'DevicesNotFoundError') {
        setError('No camera found. Please connect a camera and try again.');
      } else if (domErr.name === 'NotReadableError' || domErr.name === 'TrackStartError') {
        setError('Camera is already in use by another application. Please close it and try again.');
      } else {
        logger.error('[Camera] getUserMedia error', { error: String(err) });
        setError('Failed to access camera. Please check permissions and try again.');
      }
    } finally {
      isStarting.current = false;
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
  const captureFrame = async (videoElement?: HTMLVideoElement | null): Promise<string | null> => {
    if (!stream) return null;

    let video = videoElement;
    if (!video) {
      // Find the existing video element that is already playing this stream
      const videos = document.querySelectorAll('video');
      for (const v of Array.from(videos)) {
        if (v.srcObject === stream && v.readyState >= 2) {
          video = v;
          break;
        }
      }
    }

    if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }

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
      logger.error('Error enumerating devices', { error: String(err) });
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
      if (globalActiveMediaStream === stream) {
        globalActiveMediaStream = null;
      }
    }

    if (isStarting.current) return;
    isStarting.current = true;
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (!isMounted.current) {
        mediaStream.getTracks().forEach(track => track.stop());
        return;
      }
      globalActiveMediaStream = mediaStream;
      setStream(mediaStream);
      setIsStreaming(true);
    } catch (err) {
      if (!isMounted.current) return;
      logger.error('[Camera] switchCamera error', { error: String(err) });
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