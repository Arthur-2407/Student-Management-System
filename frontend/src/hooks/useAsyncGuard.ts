import { useEffect, useRef, useCallback } from 'react';

/**
 * STABILIZATION: useAsyncGuard
 *
 * Provides utilities to prevent infinite loading states:
 *  - withTimeout(promise, ms): wraps any promise with a timeout
 *  - useLoadingTimeout(isLoading, ms, onTimeout): auto-resets loading after timeout
 *  - createAbortController(): factory for fetch cleanup
 */

/**
 * Wrap a promise with a timeout. If the promise doesn't resolve/reject
 * within `timeoutMs`, the returned promise rejects with a TimeoutError.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label = 'Operation'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Hook: Monitors a loading boolean and calls `onTimeout` if it stays
 * true for longer than `timeoutMs`. Automatically cleans up on unmount
 * or when loading transitions to false.
 */
export function useLoadingTimeout(
  isLoading: boolean,
  timeoutMs: number,
  onTimeout: () => void
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    if (isLoading) {
      timerRef.current = setTimeout(() => {
        console.warn(`[useLoadingTimeout] Loading state exceeded ${timeoutMs}ms — triggering recovery.`);
        onTimeoutRef.current();
      }, timeoutMs);
    } else {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isLoading, timeoutMs]);
}

/**
 * Hook: Creates an AbortController that auto-aborts on unmount.
 * Returns a stable `getSignal()` function and a `reset()` to
 * create a new controller (e.g., on re-fetch).
 */
export function useAbortController() {
  const controllerRef = useRef<AbortController>(new AbortController());

  const reset = useCallback(() => {
    controllerRef.current.abort();
    controllerRef.current = new AbortController();
    return controllerRef.current;
  }, []);

  const getSignal = useCallback(() => {
    return controllerRef.current.signal;
  }, []);

  useEffect(() => {
    return () => {
      controllerRef.current.abort();
    };
  }, []);

  return { getSignal, reset, controllerRef };
}
