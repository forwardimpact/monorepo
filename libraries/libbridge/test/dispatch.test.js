import { describe, test, beforeEach, afterEach } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import { dispatchWorkflow } from "../src/dispatch.js";

describe("dispatchWorkflow", () => {
  let originalFetch;
  let captured;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    captured = null;
    globalThis.fetch = async (url, init) => {
      captured = { url, init };
      return new Response(null, { status: 204 });
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("POSTs to the workflow_dispatch endpoint with required inputs", async () => {
    await dispatchWorkflow({
      workflowFile: "kata-dispatch.yml",
      repo: "owner/repo",
      token: "ghs_token",
      prompt: "hello",
      callbackUrl: "https://bridge.example/api/callback/tok",
      correlationId: "corr-1",
    });
    expect(captured.url).toBe(
      "https://api.github.com/repos/owner/repo/actions/workflows/kata-dispatch.yml/dispatches",
    );
    expect(captured.init.method).toBe("POST");
    const headers = captured.init.headers;
    expect(headers.Authorization).toBe("Bearer ghs_token");
    expect(headers.Accept).toBe("application/vnd.github+json");
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(captured.init.body);
    expect(body.ref).toBe("main");
    expect(body.inputs).toEqual({
      prompt: "hello",
      callback_url: "https://bridge.example/api/callback/tok",
      correlation_id: "corr-1",
    });
  });

  test("custom ref is honoured", async () => {
    await dispatchWorkflow({
      workflowFile: "kata-dispatch.yml",
      ref: "release/1.0",
      repo: "owner/repo",
      token: "t",
      prompt: "p",
      callbackUrl: "u",
      correlationId: "c",
    });
    expect(JSON.parse(captured.init.body).ref).toBe("release/1.0");
  });

  test("discussionId and resumeContext are included only when defined", async () => {
    await dispatchWorkflow({
      workflowFile: "kata-dispatch.yml",
      repo: "owner/repo",
      token: "t",
      prompt: "p",
      callbackUrl: "u",
      correlationId: "c",
      discussionId: "D_kwDO",
      resumeContext: '{"open_rfcs":{}}',
    });
    const body = JSON.parse(captured.init.body);
    expect(body.inputs.discussion_id).toBe("D_kwDO");
    expect(body.inputs.resume_context).toBe('{"open_rfcs":{}}');
  });

  test("omitting discussionId and resumeContext keeps body byte-identical to legacy", async () => {
    await dispatchWorkflow({
      workflowFile: "kata-dispatch.yml",
      repo: "owner/repo",
      token: "t",
      prompt: "p",
      callbackUrl: "u",
      correlationId: "c",
    });
    const body = JSON.parse(captured.init.body);
    expect(Object.keys(body.inputs).sort()).toEqual([
      "callback_url",
      "correlation_id",
      "prompt",
    ]);
  });

  test("non-2xx response throws with status and body", async () => {
    globalThis.fetch = async () =>
      new Response("forbidden", { status: 403, statusText: "Forbidden" });
    await expect(
      dispatchWorkflow({
        workflowFile: "kata-dispatch.yml",
        repo: "owner/repo",
        token: "t",
        prompt: "p",
        callbackUrl: "u",
        correlationId: "c",
      }),
    ).rejects.toThrow(/403/);
  });

  test("missing required fields throw before fetch", async () => {
    await expect(dispatchWorkflow({ repo: "o/r", token: "t" })).rejects.toThrow(
      /workflowFile/,
    );
    await expect(
      dispatchWorkflow({ workflowFile: "f.yml", token: "t" }),
    ).rejects.toThrow(/repo/);
    await expect(
      dispatchWorkflow({ workflowFile: "f.yml", repo: "o/r" }),
    ).rejects.toThrow(/token/);
  });
});
