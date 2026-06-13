import { useState, useEffect, useCallback } from 'react';
import api from '@services/api';

interface ServiceHealth {
  status: string;
  degradedSince?: string;
  lastError?: string;
}

interface TelemetryDashboard {
  timestamp: string;
  uptime: number;
  startedAt: string;
  window: { minutes: number; totalRequests: number };
  latency: { p50: number; p95: number; p99: number; avg: number };
  statusCodes: Record<string, number>;
  errorRate: string;
  topErrors: Array<{ route: string; count: number }>;
  circuitBreakers: Record<string, {
    state: string;
    failures: number;
    totalCalls: number;
    shortCircuits: number;
  }>;
  degradedMode: {
    overall: string;
    degradedServices: string[];
    services: Record<string, { status: string; degradedSince?: string; lastError?: string }>;
  };
  recentDegradedEvents: Array<{ timestamp: string; event: string; service: string; detail: string }>;
  memory: { heapUsedMB: number; heapTotalMB: number; rssMB: number };
}

const POLL_MS = 10_000;

/**
 * ADDITION 3 + 5 — System Status & Operational Telemetry Dashboard
 *
 * Provides realtime operational visibility for supervisors/admins:
 *   - Service health indicators
 *   - Circuit breaker states
 *   - Degraded-mode status
 *   - API latency metrics
 *   - Memory usage
 *   - Recent degraded events
 */
export default function SystemStatusDashboard() {
  const [data, setData] = useState<TelemetryDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/telemetry/dashboard?window=5');
      setData(res.data);
      setError(null);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch (e: any) {
      setError(e.message || 'Failed to load telemetry');
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.errorCard}>
          <span style={{ fontSize: '2rem' }}>🔴</span>
          <h2 style={{ margin: '0.5rem 0', color: '#fca5a5' }}>Telemetry Unavailable</h2>
          <p style={{ color: '#94a3b8' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.card, textAlign: 'center' as const }}>
          <div style={styles.spinner} />
          <p style={{ color: '#94a3b8', marginTop: '1rem' }}>Loading telemetry...</p>
        </div>
      </div>
    );
  }

  const overallColor = data.degradedMode.overall === 'healthy' ? '#10b981' : '#f59e0b';

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ ...styles.statusDot, background: overallColor }} />
          <h1 style={styles.title}>System Status</h1>
        </div>
        <span style={{ color: '#64748b', fontSize: '0.85rem' }}>
          Updated: {lastUpdate} • Uptime: {formatUptime(data.uptime)}
        </span>
      </div>

      {/* Degraded Banner */}
      {data.degradedMode.overall === 'degraded' && (
        <div style={styles.degradedBanner}>
          ⚠️ <strong>DEGRADED MODE</strong> — Affected: {data.degradedMode.degradedServices.join(', ')}
        </div>
      )}

      {/* Service Health Grid */}
      <div style={styles.grid}>
        {Object.entries(data.degradedMode.services).map(([name, svc]) => (
          <ServiceCard key={name} name={name} service={svc as any} breaker={data.circuitBreakers[name]} />
        ))}
      </div>

      {/* Metrics Row */}
      <div style={styles.metricsRow}>
        <MetricCard label="Requests (5m)" value={String(data.window.totalRequests)} icon="📊" />
        <MetricCard label="P95 Latency" value={`${data.latency.p95}ms`} icon="⚡" />
        <MetricCard label="P99 Latency" value={`${data.latency.p99}ms`} icon="🔥" />
        <MetricCard label="Error Rate" value={data.errorRate} icon="❌"
          color={parseFloat(data.errorRate) > 5 ? '#ef4444' : '#10b981'} />
        <MetricCard label="Heap Used" value={`${data.memory.heapUsedMB}MB`} icon="💾" />
        <MetricCard label="RSS" value={`${data.memory.rssMB}MB`} icon="🧠" />
      </div>

      {/* Top Errors */}
      {data.topErrors.length > 0 && (
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Top Errors</h3>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.25rem' }}>
            {data.topErrors.map((e, i) => (
              <div key={i} style={styles.errorRow}>
                <span style={{ color: '#f87171', fontFamily: 'monospace', fontSize: '0.8rem' }}>{e.route}</span>
                <span style={styles.badge}>{e.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Events */}
      {data.recentDegradedEvents.length > 0 && (
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Recent Events</h3>
          <div style={{ maxHeight: '200px', overflow: 'auto' }}>
            {data.recentDegradedEvents.slice().reverse().map((ev, i) => (
              <div key={i} style={styles.eventRow}>
                <span style={{ color: ev.event === 'degraded' ? '#f59e0b' : '#10b981', fontSize: '0.7rem' }}>
                  {ev.event === 'degraded' ? '🔴' : '🟢'}
                </span>
                <span style={{ color: '#94a3b8', fontSize: '0.75rem', minWidth: '60px' }}>
                  {new Date(ev.timestamp).toLocaleTimeString()}
                </span>
                <span style={{ color: '#e2e8f0', fontSize: '0.8rem' }}>
                  {ev.service}: {ev.detail}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ServiceCard({ name, service, breaker }: {
  name: string;
  service: ServiceHealth;
  breaker?: { state: string; failures: number; totalCalls: number };
}) {
  const isHealthy = service.status === 'healthy';
  const color = isHealthy ? '#10b981' : '#f59e0b';
  const cbState = breaker?.state || 'N/A';
  const cbColor = cbState === 'CLOSED' ? '#10b981' : cbState === 'OPEN' ? '#ef4444' : '#f59e0b';

  return (
    <div style={{ ...styles.card, borderLeft: `3px solid ${color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0, color: '#e2e8f0', textTransform: 'capitalize' as const }}>{name}</h4>
        <div style={{ ...styles.statusDot, background: color, width: '10px', height: '10px' }} />
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' as const }}>
        <span style={{ ...styles.tag, background: `${color}22`, color }}>{service.status}</span>
        {breaker && <span style={{ ...styles.tag, background: `${cbColor}22`, color: cbColor }}>CB: {cbState}</span>}
      </div>
      {service.lastError && <p style={{ color: '#94a3b8', fontSize: '0.75rem', margin: '0.5rem 0 0' }}>{service.lastError}</p>}
    </div>
  );
}

function MetricCard({ label, value, icon, color }: { label: string; value: string; icon: string; color?: string }) {
  return (
    <div style={styles.metricCard}>
      <span style={{ fontSize: '1.2rem' }}>{icon}</span>
      <span style={{ color: color || '#e2e8f0', fontSize: '1.4rem', fontWeight: 700 }}>{value}</span>
      <span style={{ color: '#64748b', fontSize: '0.75rem' }}>{label}</span>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: '1.5rem', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' },
  title: { margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#f1f5f9' },
  statusDot: { width: '14px', height: '14px', borderRadius: '50%', flexShrink: 0 },
  degradedBanner: { background: 'linear-gradient(90deg, #78350f, #92400e)', color: '#fef3c7', padding: '0.75rem 1rem', borderRadius: '0.5rem', marginBottom: '1rem', fontWeight: 500 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1rem' },
  card: { background: '#1e293b', borderRadius: '0.5rem', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' },
  cardTitle: { margin: '0 0 0.75rem', color: '#e2e8f0', fontSize: '0.95rem', fontWeight: 600 },
  metricsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1rem' },
  metricCard: { background: '#1e293b', borderRadius: '0.5rem', padding: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' },
  tag: { padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase' },
  badge: { background: '#ef444422', color: '#f87171', padding: '0.1rem 0.5rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 },
  errorRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0', borderBottom: '1px solid #334155' },
  eventRow: { display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.2rem 0' },
  errorCard: { background: '#1e293b', borderRadius: '0.5rem', padding: '2rem', textAlign: 'center' },
  spinner: { width: '2rem', height: '2rem', border: '3px solid #334155', borderTop: '3px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' },
};
