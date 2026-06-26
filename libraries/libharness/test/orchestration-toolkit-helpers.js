/** Build a stub message bus that records every routed call. */
export function stubBus() {
  const calls = [];
  return {
    calls,
    ask: (from, to, text, askId) =>
      calls.push({ method: "ask", from, to, text, askId }),
    answer: (from, to, text, askId) =>
      calls.push({ method: "answer", from, to, text, askId }),
    announce: (from, text) => calls.push({ method: "announce", from, text }),
    synthetic: (to, text) => calls.push({ method: "synthetic", to, text }),
    direct: (from, to, text) =>
      calls.push({ method: "direct", from, to, text }),
    drain: () => [],
  };
}
