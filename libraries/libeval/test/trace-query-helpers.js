/**
 * Shared trace fixture for the TraceQuery sibling suites.
 */
/**
 * Build a minimal structured trace for testing.
 * @param {object} [overrides]
 * @returns {object}
 */
export function buildTrace(overrides = {}) {
  return {
    version: "1.2.0",
    metadata: {
      timestamp: "2026-01-01T00:00:00Z",
      sessionId: "test-session",
      model: "claude-opus-4-6",
      claudeCodeVersion: "2.1.87",
      tools: ["Bash", "Read", "Edit"],
      permissionMode: "default",
      ...overrides.metadata,
    },
    turns: overrides.turns ?? [
      {
        index: 0,
        role: "assistant",
        messageId: "msg_a",
        content: [{ type: "text", text: "Let me check the files." }],
        usage: {
          inputTokens: 100,
          outputTokens: 15,
          cacheReadInputTokens: 200,
          cacheCreationInputTokens: 50,
        },
      },
      {
        index: 1,
        role: "assistant",
        messageId: "msg_b",
        content: [
          {
            type: "tool_use",
            toolUseId: "toolu_01",
            name: "Bash",
            input: { command: "ls -la" },
          },
        ],
        usage: {
          inputTokens: 120,
          outputTokens: 20,
          cacheReadInputTokens: 300,
          cacheCreationInputTokens: 0,
        },
      },
      {
        index: 2,
        role: "tool_result",
        toolUseId: "toolu_01",
        content: "total 42\ndrwxr-xr-x  5 user user 4096 Jan 01 12:00 .",
        isError: false,
      },
      {
        index: 3,
        role: "assistant",
        messageId: "msg_c",
        content: [
          { type: "text", text: "Now reading the config file." },
          {
            type: "tool_use",
            toolUseId: "toolu_02",
            name: "Read",
            input: { file_path: "/app/config.json" },
          },
        ],
        usage: {
          inputTokens: 150,
          outputTokens: 25,
          cacheReadInputTokens: 400,
          cacheCreationInputTokens: 0,
        },
      },
      {
        index: 4,
        role: "tool_result",
        toolUseId: "toolu_02",
        content: '{"port": 3000, "debug": true}',
        isError: false,
      },
      {
        index: 5,
        role: "assistant",
        messageId: "msg_d",
        content: [
          {
            type: "tool_use",
            toolUseId: "toolu_03",
            name: "Edit",
            input: {
              file_path: "/app/config.json",
              old_string: '"debug": true',
              new_string: '"debug": false',
            },
          },
        ],
        usage: {
          inputTokens: 160,
          outputTokens: 18,
          cacheReadInputTokens: 500,
          cacheCreationInputTokens: 0,
        },
      },
      {
        index: 6,
        role: "tool_result",
        toolUseId: "toolu_03",
        content: "File updated successfully.",
        isError: false,
      },
      {
        index: 7,
        role: "assistant",
        messageId: "msg_e",
        content: [
          {
            type: "tool_use",
            toolUseId: "toolu_04",
            name: "Bash",
            input: { command: "npm test" },
          },
        ],
        usage: {
          inputTokens: 170,
          outputTokens: 12,
          cacheReadInputTokens: 600,
          cacheCreationInputTokens: 0,
        },
      },
      {
        index: 8,
        role: "tool_result",
        toolUseId: "toolu_04",
        content: "Error: test suite failed\n  at runTests (test.js:42)",
        isError: true,
      },
      {
        index: 9,
        role: "assistant",
        messageId: "msg_f",
        content: [
          { type: "text", text: "The tests failed. Let me fix the issue." },
        ],
        usage: {
          inputTokens: 180,
          outputTokens: 10,
          cacheReadInputTokens: 700,
          cacheCreationInputTokens: 0,
        },
      },
    ],
    summary: {
      result: "success",
      isError: false,
      totalCostUsd: 0.0523,
      durationMs: 5200,
      numTurns: 5,
      tokenUsage: {
        inputTokens: 880,
        outputTokens: 100,
        cacheReadInputTokens: 2700,
        cacheCreationInputTokens: 50,
      },
      modelUsage: null,
      ...overrides.summary,
    },
  };
}
