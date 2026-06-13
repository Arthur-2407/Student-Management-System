/**
 * V8 — SENTRY INTEGRATION (OPTIONAL DEPENDENCY)
 *
 * Enterprise error tracking and performance monitoring via Sentry.
 * Works WITHOUT @sentry/react installed — all calls are no-ops when the SDK is absent.
 *
 * To activate:
 *   1. npm install @sentry/react
 *   2. Set VITE_SENTRY_DSN in your environment
 */

let Sentry: any = null;
let isInitialized = false;

// We use a dynamic import with vite-ignore to prevent build failures when the package is missing.
const SENTRY_PKG = '@sentry/react';

export async function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    return;
  }

  try {
    const sdk = await import(/* @vite-ignore */ SENTRY_PKG);
    Sentry = sdk;
    
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: parseFloat(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || '0.1'),
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
    });
    
    isInitialized = true;
    console.log('[Sentry] Frontend SDK initialized successfully');
  } catch {
    // Gracefully handle missing dependency or initialization failure
  }
}

export const sentry = {
  captureException(error: any, context?: Record<string, any>) {
    if (Sentry && isInitialized) {
      Sentry.captureException(error, { extra: context });
    }
  },

  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', context?: Record<string, any>) {
    if (Sentry && isInitialized) {
      Sentry.captureMessage(message, { level, extra: context });
    }
  },

  setUser(user: { id: string; email?: string; role?: string } | null) {
    if (Sentry && isInitialized) {
      if (user) {
        Sentry.setUser({ id: user.id, email: user.email, username: user.role });
      } else {
        Sentry.setUser(null);
      }
    }
  },

  isActive(): boolean {
    return isInitialized;
  }
};
