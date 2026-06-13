/**
 * STABILIZATION: AsyncCoordinator
 *
 * A centralized registry for global async orchestration.
 * Tracks, aborts, and serializes in-flight frontend operations.
 * Helps prevent memory retention and stale request propagation across pages.
 */
class AsyncCoordinator {
  private inFlight = new Map<string, {
    promise: Promise<any>;
    abortController: AbortController;
    timestamp: number;
    metadata?: any;
    cleanup?: () => void;
  }>();

  /**
   * Register an active in-flight async operation under a domain and task ID.
   * If a duplicate task is registered, the previous task will be automatically aborted.
   */
  register(
    domain: string,
    taskId: string,
    promise: Promise<any>,
    abortController: AbortController,
    cleanup?: () => void,
    metadata?: any
  ) {
    const key = `${domain}:${taskId}`;
    
    // Task Deduplication & Cancellation Propagation
    if (this.inFlight.has(key)) {
      console.warn(`[AsyncCoordinator] Duplicate task detected for key: ${key}. Aborting older task.`);
      this.cancel(domain, taskId);
    }
    
    this.inFlight.set(key, {
      promise,
      abortController,
      timestamp: Date.now(),
      cleanup,
      metadata,
    });
    
    // Auto-remove from registry when resolved or rejected
    promise.finally(() => {
      const active = this.inFlight.get(key);
      if (active && active.promise === promise) {
        this.inFlight.delete(key);
      }
    });
  }

  /**
   * Cancel in-flight operations under a specific domain, optionally targeting a single task ID.
   */
  cancel(domain: string, taskId?: string) {
    if (taskId) {
      const key = `${domain}:${taskId}`;
      const task = this.inFlight.get(key);
      if (task) {
        task.abortController.abort();
        if (task.cleanup) {
          try {
            task.cleanup();
          } catch (e) {
            console.error('[AsyncCoordinator] Cleanup failed for task:', key, e);
          }
        }
        this.inFlight.delete(key);
      }
    } else {
      for (const [key, task] of this.inFlight.entries()) {
        if (key.startsWith(`${domain}:`)) {
          task.abortController.abort();
          if (task.cleanup) {
            try {
              task.cleanup();
            } catch (e) {
              console.error('[AsyncCoordinator] Cleanup failed during domain drain:', key, e);
            }
          }
          this.inFlight.delete(key);
        }
      }
    }
  }

  /**
   * Abort and clean up all in-flight tasks.
   */
  cancelAll() {
    for (const [key, task] of this.inFlight.entries()) {
      task.abortController.abort();
      if (task.cleanup) {
        try {
          task.cleanup();
        } catch (e) {
          console.error('[AsyncCoordinator] Cleanup failed during global drain:', key, e);
        }
      }
    }
    this.inFlight.clear();
  }

  /**
   * Returns list of currently active task keys.
   */
  getActiveTasks(): string[] {
    return Array.from(this.inFlight.keys());
  }
}

export const asyncCoordinator = new AsyncCoordinator();
export default asyncCoordinator;
