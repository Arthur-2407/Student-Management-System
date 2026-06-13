/**
 * V8 — Unit Tests for Alerting Engine
 */

const { AlertEngine, AlertRule } = require('../config/alerting');

describe('Alerting Engine', () => {
  let engine;

  beforeEach(() => {
    jest.resetModules();
    engine = new AlertEngine();
    // Clear interval/stop evaluation to prevent timer leaks in tests
    engine.stop();
  });

  afterEach(() => {
    engine.stop();
  });

  test('initializes default rules', () => {
    const status = engine.getStatus();
    expect(status.rules.length).toBeGreaterThanOrEqual(4);
    expect(status.rules.map(r => r.name)).toContain('high_memory_usage');
    expect(status.rules.map(r => r.name)).toContain('critical_memory_usage');
    expect(status.rules.map(r => r.name)).toContain('event_loop_lag');
    expect(status.rules.map(r => r.name)).toContain('long_running_process');
  });

  test('adds custom rule', () => {
    engine.addRule({
      name: 'test_rule',
      condition: () => true,
      severity: 'info',
      message: () => 'Test alert',
    });

    const status = engine.getStatus();
    expect(status.rules.map(r => r.name)).toContain('test_rule');
  });

  test('evaluates rules and fires channels', async () => {
    const mockChannelSend = jest.fn();
    engine._channels = [{ name: 'mock_channel', send: mockChannelSend }];

    engine.addRule({
      name: 'triggered_rule',
      condition: () => true,
      severity: 'warning',
      message: () => 'Alert active',
      cooldownMs: 1000,
    });

    await engine._evaluate();

    expect(mockChannelSend).toHaveBeenCalledTimes(1);
    expect(mockChannelSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'triggered_rule',
        severity: 'warning',
        message: 'Alert active',
      })
    );

    const status = engine.getStatus();
    expect(status.active.map(r => r.name)).toContain('triggered_rule');
  });

  test('respects cooldown limits', async () => {
    const mockChannelSend = jest.fn();
    engine._channels = [{ name: 'mock_channel', send: mockChannelSend }];

    engine.addRule({
      name: 'cooldown_rule',
      condition: () => true,
      severity: 'warning',
      message: () => 'Cooldowned alert',
      cooldownMs: 600000, // 10 min
    });

    // Fire 1
    await engine._evaluate();
    // Fire 2 immediately (should not invoke channel due to cooldown)
    await engine._evaluate();

    expect(mockChannelSend).toHaveBeenCalledTimes(1);
  });
});
