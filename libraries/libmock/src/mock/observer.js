import { spy } from "./spy.js";
/**
 * Creates a mock observer factory
 * @param {object} logger - Logger to use (optional)
 * @returns {Function} Mock observer factory
 */
export function createMockObserverFn(logger = null) {
  const mockLogger = logger || {
    debug: spy(),
    info: spy(),
    error: spy(),
  };

  return () => ({
    observeServerUnaryCall: async (_method, handler, call, callback) => {
      return await handler(call, callback);
    },
    observeClientUnaryCall: async (_method, _request, fn) => {
      return await fn();
    },
    observeClientStreamingCall: (_method, _request, fn) => {
      return fn();
    },
    logger: () => mockLogger,
  });
}

/**
 * Creates a mock tracer
 * @param {object} overrides - Method overrides
 * @returns {object} Mock tracer
 */
export function createMockTracer(overrides = {}) {
  return {
    startSpan: spy((name, options = {}) => ({
      span_id: `span-${Date.now()}`,
      trace_id: `trace-${Date.now()}`,
      name,
      ...options,
    })),
    startClientSpan: spy((_service, _method) => ({
      span: {
        span_id: `client-span-${Date.now()}`,
        trace_id: `trace-${Date.now()}`,
      },
      metadata: { get: () => [], set: () => {} },
    })),
    startServerSpan: spy((_service, _method, _request, metadata) => ({
      span_id: `server-span-${Date.now()}`,
      trace_id: metadata?.get?.("x-trace-id")?.[0] || `trace-${Date.now()}`,
    })),
    getSpanContext: () => ({
      run: (span, fn) => fn(),
      getStore: () => null,
    }),
    endSpan: spy(),
    recordError: spy(),
    ...overrides,
  };
}

/**
 * Creates a mock auth factory
 * @param {object} options - Auth options
 * @returns {Function} Mock auth factory
 */
export function createMockAuthFn(options = {}) {
  const { isValid = true, serviceId = "test" } = options;

  return () => ({
    createClientInterceptor: () => () => {},
    validateCall: () => ({ isValid, serviceId }),
  });
}
