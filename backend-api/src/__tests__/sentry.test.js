/**
 * V8 — Unit Tests for Sentry Integration
 */

describe('Sentry Integration Wrapper', () => {
  let sentryModule;

  beforeEach(() => {
    jest.resetModules();
    // Clear env vars
    delete process.env.SENTRY_DSN;
  });

  test('operates in no-op mode by default (no DSN)', () => {
    // Mock Sentry module to simulate package is installed
    jest.mock('@sentry/node', () => ({
      init: jest.fn(),
      captureException: jest.fn(),
      captureMessage: jest.fn(),
      setUser: jest.fn(),
    }), { virtual: true });

    sentryModule = require('../config/sentry');
    
    expect(sentryModule.sentry.isActive()).toBe(false);
    
    // Calls should not throw in no-op mode
    expect(() => {
      sentryModule.sentry.captureException(new Error('test'));
      sentryModule.sentry.captureMessage('test message');
      sentryModule.sentry.setUser({ id: '123' });
    }).not.toThrow();
  });

  test('initializes Sentry when DSN is provided', () => {
    process.env.SENTRY_DSN = 'https://abc@o123.ingest.sentry.io/123';
    
    const mockInit = jest.fn();
    jest.mock('@sentry/node', () => ({
      init: mockInit,
      captureException: jest.fn(),
      captureMessage: jest.fn(),
      setUser: jest.fn(),
      Handlers: {
        requestHandler: () => (req, res, next) => next(),
        errorHandler: () => (err, req, res, next) => next(err),
      }
    }), { virtual: true });

    sentryModule = require('../config/sentry');
    sentryModule.initSentry();

    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://abc@o123.ingest.sentry.io/123',
        environment: 'test',
      })
    );
  });
});
