/**
 * Portable mock function helper. Replaces `mock.fn` from `node:test` so the
 * test suite can run under either node:test or bun:test.
 *
 * Shape matches node:test's `mock.fn` to keep call-inspection sites
 * (`fn.mock.calls[0].arguments`, `fn.mock.callCount()`, `fn.mock.resetCalls()`)
 * unchanged across the codebase.
 *
 * @template T
 * @param {(...args: any[]) => T} [impl] - Initial implementation.
 * @returns {((...args: any[]) => T) & { mock: { calls: Array<{arguments: any[], result?: T, error?: unknown, this: unknown}>, callCount: () => number, resetCalls: () => void, mockImplementation: (newImpl: (...args: any[]) => T) => void } }}
 */
export function spy(impl) {
  let _impl = impl;
  const calls = [];
  const fn = function (...args) {
    const rec = { arguments: args, this: this };
    if (!_impl) {
      calls.push(rec);
      return undefined;
    }
    try {
      const result = _impl.apply(this, args);
      rec.result = result;
      calls.push(rec);
      return result;
    } catch (err) {
      rec.error = err;
      calls.push(rec);
      throw err;
    }
  };
  fn.mock = {
    calls,
    callCount: () => calls.length,
    resetCalls: () => {
      calls.length = 0;
    },
    mockImplementation: (newImpl) => {
      _impl = newImpl;
    },
  };
  return fn;
}
