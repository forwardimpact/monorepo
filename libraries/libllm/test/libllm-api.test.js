import { test, describe, beforeEach, mock } from "node:test";
import assert from "node:assert";

import { LlmApi, DEFAULT_BASE_URL } from "../index.js";
import { Retry } from "@forwardimpact/libutil";

const EMBEDDING_BASE_URL = "http://localhost:8090";

describe("LlmApi", () => {
  let mockFetch;
  let llmApi;
  let retry;

  beforeEach(() => {
    mockFetch = mock.fn();
    retry = new Retry();
    llmApi = new LlmApi(
      "test-token",
      "gpt-4",
      DEFAULT_BASE_URL,
      EMBEDDING_BASE_URL,
      retry,
      mockFetch,
    );
  });

  test("creates LlmApi with token and model", () => {
    assert.ok(llmApi instanceof LlmApi);
  });

  test("createCompletions makes correct API call", async () => {
    const mockResponse = {
      ok: true,
      json: mock.fn(() =>
        Promise.resolve({
          id: "test-id",
          object: "chat.completion",
          choices: [{ message: { role: "assistant", content: "Hello" } }],
          usage: { total_tokens: 10 },
        }),
      ),
    };
    mockFetch.mock.mockImplementationOnce(() => Promise.resolve(mockResponse));

    const messages = [{ role: "user", content: "Hello" }];
    const tools = undefined;
    const temperature = 0.5;
    const max_tokens = 100;

    const result = await llmApi.createCompletions(
      messages,
      tools,
      temperature,
      max_tokens,
    );

    assert.strictEqual(mockFetch.mock.callCount(), 1);
    const [url, options] = mockFetch.mock.calls[0].arguments;
    assert.strictEqual(url, `${DEFAULT_BASE_URL}/chat/completions`);
    assert.strictEqual(options.method, "POST");
    assert.ok(options.headers.Authorization.includes("test-token"));
    assert.strictEqual(result.id, "test-id");
  });

  test("createCompletions uses default model when not specified", async () => {
    const mockResponse = {
      ok: true,
      json: mock.fn(() =>
        Promise.resolve({
          id: "test-id",
          object: "chat.completion",
          choices: [],
          usage: { total_tokens: 10 },
        }),
      ),
    };
    mockFetch.mock.mockImplementationOnce(() => Promise.resolve(mockResponse));

    const messages = [{ role: "user", content: "Hello" }];

    await llmApi.createCompletions(messages);

    const [, options] = mockFetch.mock.calls[0].arguments;
    const body = JSON.parse(options.body);
    assert.strictEqual(body.model, "gpt-4");
  });

  test("createCompletions throws error on HTTP error", async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: mock.fn(() => Promise.resolve("Error details")),
    };
    mockFetch.mock.mockImplementationOnce(() => Promise.resolve(mockResponse));

    const messages = [{ role: "user", content: "Hello" }];

    await assert.rejects(() => llmApi.createCompletions(messages), {
      message: /HTTP 404: Not Found/,
    });
  });

  test("createCompletions throws error immediately on non-retryable HTTP error", async () => {
    const errorResponse = {
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: mock.fn(() => Promise.resolve("Invalid request details")),
    };

    mockFetch.mock.mockImplementationOnce(() => Promise.resolve(errorResponse));

    const messages = [{ role: "user", content: "Hello" }];

    await assert.rejects(() => llmApi.createCompletions(messages), {
      message: /HTTP 400: Bad Request/,
    });

    assert.strictEqual(mockFetch.mock.callCount(), 1);
  });

  test("createCompletions fixes multi_tool_use.parallel hallucination", async () => {
    const mockResponse = {
      ok: true,
      json: mock.fn(() =>
        Promise.resolve({
          id: "test-id",
          object: "chat.completion",
          choices: [
            {
              message: {
                role: "assistant",
                content: "Planning to call tools...",
                tool_calls: [
                  {
                    id: "call_abc123",
                    type: "function",
                    function: {
                      name: "multi_tool_use.parallel",
                      arguments: JSON.stringify({
                        tool_uses: [
                          {
                            recipient_name: "functions.get_ontology",
                            parameters: {},
                          },
                          {
                            recipient_name: "functions.get_subjects",
                            parameters: { type: "schema:Person" },
                          },
                        ],
                      }),
                    },
                  },
                ],
              },
            },
          ],
          usage: { total_tokens: 100 },
        }),
      ),
    };
    mockFetch.mock.mockImplementationOnce(() => Promise.resolve(mockResponse));

    const messages = [{ role: "user", content: "Query the graph" }];
    const result = await llmApi.createCompletions({ messages });

    assert.strictEqual(result.choices[0].message.tool_calls.length, 2);

    const call0 = result.choices[0].message.tool_calls[0];
    assert.strictEqual(call0.function.name, "get_ontology");
    assert.strictEqual(call0.id, "call_abc123_0");
    assert.deepStrictEqual(JSON.parse(call0.function.arguments), {});

    const call1 = result.choices[0].message.tool_calls[1];
    assert.strictEqual(call1.function.name, "get_subjects");
    assert.strictEqual(call1.id, "call_abc123_1");
    assert.deepStrictEqual(JSON.parse(call1.function.arguments), {
      type: "schema:Person",
    });
  });

  test("createCompletions fixes parallel hallucination (short form)", async () => {
    const mockResponse = {
      ok: true,
      json: mock.fn(() =>
        Promise.resolve({
          id: "test-id",
          object: "chat.completion",
          choices: [
            {
              message: {
                role: "assistant",
                content: "",
                tool_calls: [
                  {
                    id: "call_xyz",
                    type: "function",
                    function: {
                      name: "parallel",
                      arguments: JSON.stringify({
                        tool_uses: [
                          {
                            recipient_name: "search_content",
                            parameters: { query: "test" },
                          },
                        ],
                      }),
                    },
                  },
                ],
              },
            },
          ],
          usage: { total_tokens: 50 },
        }),
      ),
    };
    mockFetch.mock.mockImplementationOnce(() => Promise.resolve(mockResponse));

    const result = await llmApi.createCompletions({
      messages: [{ role: "user", content: "Search" }],
    });

    assert.strictEqual(result.choices[0].message.tool_calls.length, 1);
    assert.strictEqual(
      result.choices[0].message.tool_calls[0].function.name,
      "search_content",
    );
  });

  test("createCompletions preserves normal tool calls", async () => {
    const mockResponse = {
      ok: true,
      json: mock.fn(() =>
        Promise.resolve({
          id: "test-id",
          object: "chat.completion",
          choices: [
            {
              message: {
                role: "assistant",
                content: "",
                tool_calls: [
                  {
                    id: "call_normal",
                    type: "function",
                    function: {
                      name: "search_content",
                      arguments: '{"query":"test"}',
                    },
                  },
                ],
              },
            },
          ],
          usage: { total_tokens: 30 },
        }),
      ),
    };
    mockFetch.mock.mockImplementationOnce(() => Promise.resolve(mockResponse));

    const result = await llmApi.createCompletions({
      messages: [{ role: "user", content: "Test" }],
    });

    assert.strictEqual(result.choices[0].message.tool_calls.length, 1);
    assert.strictEqual(
      result.choices[0].message.tool_calls[0].function.name,
      "search_content",
    );
    assert.strictEqual(
      result.choices[0].message.tool_calls[0].id,
      "call_normal",
    );
  });

  test("createEmbeddings makes correct TEI API call", async () => {
    const mockResponse = {
      ok: true,
      json: mock.fn(() =>
        Promise.resolve([
          [0.1, 0.2, 0.3],
          [0.4, 0.5, 0.6],
        ]),
      ),
    };
    mockFetch.mock.mockImplementationOnce(() => Promise.resolve(mockResponse));

    const texts = ["Hello", "World"];
    const result = await llmApi.createEmbeddings(texts);

    assert.strictEqual(mockFetch.mock.callCount(), 1);
    const [url, options] = mockFetch.mock.calls[0].arguments;
    assert.strictEqual(url, `${EMBEDDING_BASE_URL}/embed`);
    assert.strictEqual(options.method, "POST");

    const body = JSON.parse(options.body);
    assert.deepStrictEqual(body.inputs, texts);
    assert.strictEqual(body.model, undefined);

    assert.strictEqual(options.headers.Authorization, undefined);
    assert.strictEqual(options.headers["Content-Type"], "application/json");

    assert.strictEqual(result.data.length, 2);
    assert.deepStrictEqual(result.data[0].embedding, [0.1, 0.2, 0.3]);
    assert.deepStrictEqual(result.data[1].embedding, [0.4, 0.5, 0.6]);
    assert.strictEqual(result.model, "bge-small-en-v1.5");
  });

  test("createEmbeddings retries on 429 status", async () => {
    const retryResponse = {
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    };
    const successResponse = {
      ok: true,
      json: mock.fn(() => Promise.resolve([[0.1, 0.2, 0.3]])),
    };

    let callCount = 0;
    mockFetch.mock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(retryResponse);
      } else {
        return Promise.resolve(successResponse);
      }
    });

    const texts = ["Hello"];
    const result = await llmApi.createEmbeddings(texts);

    assert(mockFetch.mock.callCount() >= 2);
    assert.strictEqual(result.data.length, 1);
  });

  test("createEmbeddings throws error immediately on non-retryable HTTP error", async () => {
    const errorResponse = {
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: mock.fn(() => Promise.resolve("Invalid request details")),
    };

    mockFetch.mock.mockImplementationOnce(() => Promise.resolve(errorResponse));

    const texts = ["Hello"];

    await assert.rejects(() => llmApi.createEmbeddings(texts), {
      message: /HTTP 400: Bad Request/,
    });

    assert.strictEqual(mockFetch.mock.callCount(), 1);
  });

  test("LlmApi falls back to baseUrl when embeddingBaseUrl is null", () => {
    const teiMockFetch = mock.fn();
    const teiRetry = new Retry();

    const llm = new LlmApi(
      "test-token",
      "gpt-4",
      DEFAULT_BASE_URL,
      null,
      teiRetry,
      teiMockFetch,
    );

    assert.ok(llm instanceof LlmApi);
  });

  test("createEmbeddings uses OpenAI-compatible format when embeddingBaseUrl matches baseUrl", async () => {
    const oaiMockFetch = mock.fn();
    const oaiRetry = new Retry();
    const oaiLlm = new LlmApi(
      "test-token",
      "gpt-4",
      DEFAULT_BASE_URL,
      null,
      oaiRetry,
      oaiMockFetch,
    );

    const mockResponse = {
      ok: true,
      json: mock.fn(() =>
        Promise.resolve({
          object: "list",
          data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2, 0.3] }],
          model: "text-embedding-ada-002",
          usage: { prompt_tokens: 5, completion_tokens: 0, total_tokens: 5 },
        }),
      ),
    };
    oaiMockFetch.mock.mockImplementationOnce(() =>
      Promise.resolve(mockResponse),
    );

    const result = await oaiLlm.createEmbeddings(["Hello"]);

    assert.strictEqual(oaiMockFetch.mock.callCount(), 1);
    const [url, options] = oaiMockFetch.mock.calls[0].arguments;
    assert.ok(url.endsWith("/embeddings"));
    assert.ok(!url.endsWith("/embed"));
    assert.strictEqual(options.method, "POST");

    const body = JSON.parse(options.body);
    assert.deepStrictEqual(body.input, ["Hello"]);
    assert.strictEqual(body.model, "gpt-4");

    assert.strictEqual(result.data.length, 1);
    assert.deepStrictEqual(result.data[0].embedding, [0.1, 0.2, 0.3]);
    assert.strictEqual(result.model, "text-embedding-ada-002");
  });

  test("listModels makes correct API call", async () => {
    const mockResponse = {
      ok: true,
      json: mock.fn(() =>
        Promise.resolve({
          data: [
            { id: "gpt-4", object: "model" },
            { id: "gpt-3.5-turbo", object: "model" },
          ],
        }),
      ),
    };
    mockFetch.mock.mockImplementationOnce(() => Promise.resolve(mockResponse));

    const result = await llmApi.listModels();

    assert.strictEqual(mockFetch.mock.callCount(), 1);
    const [url, options] = mockFetch.mock.calls[0].arguments;
    assert.strictEqual(
      url,
      DEFAULT_BASE_URL.replace("/inference", "/catalog/models"),
    );
    assert.strictEqual(options.method, "GET");

    assert.strictEqual(result.data.length, 2);
    assert.strictEqual(result.data[0].id, "gpt-4");
    assert.strictEqual(result.data[1].id, "gpt-3.5-turbo");
  });

  test("listModels throws error on HTTP error", async () => {
    const mockResponse = {
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: mock.fn(() => Promise.resolve("Auth error details")),
    };
    mockFetch.mock.mockImplementationOnce(() => Promise.resolve(mockResponse));

    await assert.rejects(() => llmApi.listModels(), {
      message: /HTTP 401: Unauthorized/,
    });
  });
});
