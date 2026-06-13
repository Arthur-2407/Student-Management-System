import { create } from 'zustand';
import { stateReconciliationEngine } from '@services/reconciliationEngine';

interface AttendanceRecord {
  id: number;
  checkInTime: string;
  checkOutTime: string | null;
  workHours: string | null;
  location: {
    latitude: number;
    longitude: number;
  } | null;
  geoFenceStatus: boolean;
  distanceFromOffice: number | null;
}

interface AttendanceState {
  currentRecord: AttendanceRecord | null;
  history: AttendanceRecord[];
  stats: {
    totalCheckins: number;
    averageHours: string;
    geoFenceCompliance: string;
    lateArrivals: number;
  } | null;
  isCheckingIn: boolean;
  isCheckingOut: boolean;
  // STABILIZATION: Track when last WebSocket sync occurred for stale-state detection
  lastSyncTimestamp: number | null;
  setCurrentRecord: (record: AttendanceRecord | null) => void;
  setHistory: (history: AttendanceRecord[]) => void;
  setStats: (stats: any) => void;
  setIsCheckingIn: (checkingIn: boolean) => void;
  setIsCheckingOut: (checkingOut: boolean) => void;
  addRecord: (record: AttendanceRecord) => void;
  updateRecord: (record: AttendanceRecord) => void;
  // STABILIZATION: Handle realtime attendance events from WebSocket
  syncFromWebSocket: (event: any) => void;
  // STABILIZATION: Capture state checkpoint for optimistic updates
  checkpoint: () => void;
  // STABILIZATION: Rollback state to the last captured checkpoint
  rollback: () => void;
}

export const useAttendanceStore = create<AttendanceState>((set, get) => ({
  currentRecord: null,
  history: [],
  stats: null,
  isCheckingIn: false,
  isCheckingOut: false,
  lastSyncTimestamp: null,
  setCurrentRecord: (record) => set({ currentRecord: record }),
  setHistory: (history) => set({ history }),
  setStats: (stats) => set({ stats }),
  setIsCheckingIn: (checkingIn) => set({ isCheckingIn: checkingIn }),
  setIsCheckingOut: (checkingOut) => set({ isCheckingOut: checkingOut }),
  addRecord: (record) => {
    const { history } = get();
    set({ history: [record, ...history] });
  },
  updateRecord: (updatedRecord) => {
    const { history } = get();
    const updatedHistory = history.map(record =>
      record.id === updatedRecord.id ? updatedRecord : record
    );
    set({ history: updatedHistory });
    
    // Also update current record if it matches
    const { currentRecord } = get();
    if (currentRecord && currentRecord.id === updatedRecord.id) {
      set({ currentRecord: updatedRecord });
    }
  },

  // STABILIZATION: Process realtime attendance events from WebSocket.
  // Updates current status and adds/updates records in the history with reconciliation arbitration.
  syncFromWebSocket: (event: any) => {
    const now = Date.now();
    set({ lastSyncTimestamp: now });

    if (!event) return;

    // STATE RECONCILIATION: Check if state is locked (manual mutations in-flight)
    if (stateReconciliationEngine.isLocked('attendance')) {
      console.warn('[AttendanceStore] Ignoring WebSocket update; state is locked during active user mutation.');
      return;
    }

    // STATE RECONCILIATION: Check for stale events
    const eventTimestamp = event.timestamp || now;
    if (stateReconciliationEngine.isStale('attendance', eventTimestamp)) {
      console.warn('[AttendanceStore] Ignoring stale WebSocket event.', event);
      return;
    }

    // Handle check-in/check-out status changes
    if (event.type === 'check-in' && event.record) {
      const record: AttendanceRecord = {
        id: event.record.id,
        checkInTime: event.record.check_in_time,
        checkOutTime: null,
        workHours: null,
        location: null,
        geoFenceStatus: event.record.geo_fence_status ?? false,
        distanceFromOffice: event.record.distance_from_office ?? null,
      };
      set({ currentRecord: record, isCheckingIn: false });
      get().addRecord(record);
    }

    if (event.type === 'check-out' && event.record) {
      const record: AttendanceRecord = {
        id: event.record.id,
        checkInTime: event.record.check_in_time,
        checkOutTime: event.record.check_out_time,
        workHours: event.record.work_hours,
        location: null,
        geoFenceStatus: event.record.geo_fence_status ?? false,
        distanceFromOffice: event.record.distance_from_office ?? null,
      };
      set({ currentRecord: null, isCheckingOut: false });
      get().updateRecord(record);
    }
  },

  // STABILIZATION: Capture state checkpoint for optimistic updates
  checkpoint: () => {
    const { currentRecord, history, stats } = get();
    stateReconciliationEngine.checkpoint('attendance', { currentRecord, history, stats });
  },

  // STABILIZATION: Rollback state to the last captured checkpoint
  rollback: () => {
    const state = stateReconciliationEngine.rollback('attendance');
    if (state) {
      set({
        currentRecord: state.currentRecord,
        history: state.history,
        stats: state.stats,
      });
    }
  },
}));