/**
 * STABILIZATION: StateReconciliationEngine
 *
 * A centralized state reconciliation and consistency engine.
 * Solves "optimistic-update collisions" and "websocket/polling overlap"
 * by enforcing:
 *  - Deterministic mutation sequence verification (stale-state suppression)
 *  - Optimistic UI checkpoints and rollback mechanisms
 *  - State lock-guards during user interactions to suppress concurrent overrides
 */

interface StateCheckpoint {
  id: string;
  state: any;
  timestamp: number;
}

class StateReconciliationEngine {
  private checkpoints = new Map<string, StateCheckpoint>();
  private latestSequence = new Map<string, number>();
  private lockTimestamps = new Map<string, number>();

  /**
   * Set a state checkpoint for optimistic rollback.
   * Performs deep copy to ensure absolute isolation.
   */
  checkpoint(storeName: string, state: any) {
    try {
      this.checkpoints.set(storeName, {
        id: Math.random().toString(36).substring(7),
        state: JSON.parse(JSON.stringify(state)),
        timestamp: Date.now(),
      });
      console.log(`[ReconciliationEngine] Checkpoint captured for: ${storeName}`);
    } catch (e) {
      console.error('[ReconciliationEngine] Checkpoint failed:', e);
    }
  }

  /**
   * Roll back to the previously recorded checkpoint.
   * Returns the deep-copied state or null if no checkpoint exists.
   */
  rollback(storeName: string): any {
    const cp = this.checkpoints.get(storeName);
    if (cp) {
      console.warn(
        `[ReconciliationEngine] Rolling back ${storeName} to checkpoint from ${new Date(
          cp.timestamp
        ).toISOString()}`
      );
      return cp.state;
    }
    return null;
  }

  /**
   * Compare sequence/timestamp to prevent out-of-order stale updates.
   * Returns true if the incoming update is older than the current recorded sequence
   * (meaning it should be suppressed), false otherwise.
   */
  isStale(domain: string, incomingTimestamp: number): boolean {
    const lastTime = this.latestSequence.get(domain) || 0;
    if (incomingTimestamp < lastTime) {
      console.warn(
        `[ReconciliationEngine] Suppressing stale update for domain: ${domain}. Incoming: ${incomingTimestamp}, Current: ${lastTime}`
      );
      return true;
    }
    this.latestSequence.set(domain, incomingTimestamp);
    return false;
  }

  /**
   * Acquire a mutation lock to block background polling/sockets from overriding in-progress actions.
   */
  acquireLock(domain: string, durationMs = 5000) {
    const expiry = Date.now() + durationMs;
    this.lockTimestamps.set(domain, expiry);
    console.log(`[ReconciliationEngine] Lock acquired for: ${domain} (expiry: ${new Date(expiry).toISOString()})`);
  }

  /**
   * Check if a domain's state updates are currently locked.
   */
  isLocked(domain: string): boolean {
    const lockExpiry = this.lockTimestamps.get(domain) || 0;
    const locked = Date.now() < lockExpiry;
    if (locked) {
      console.warn(`[ReconciliationEngine] State is LOCKED for domain: ${domain}. Ignoring external update.`);
    }
    return locked;
  }

  /**
   * Clear all locks and checkpoints (useful on logout / navigation).
   */
  resetAll() {
    this.checkpoints.clear();
    this.latestSequence.clear();
    this.lockTimestamps.clear();
    console.log('[ReconciliationEngine] Reset completed.');
  }
}

export const stateReconciliationEngine = new StateReconciliationEngine();
export default stateReconciliationEngine;
