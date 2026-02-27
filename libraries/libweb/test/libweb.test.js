import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import { Config } from "@forwardimpact/libconfig";
import {
  ValidationMiddleware,
  CorsMiddleware,
  createValidationMiddleware,
  createCorsMiddleware,
} from "../index.js";

describe("ValidationMiddleware", () => {
  let validationMiddleware;
  let config;

  beforeEach(() => {
    config = new Config("service", "test");
    validationMiddleware = new ValidationMiddleware(config);
  });

  test("creates validation middleware", () => {
    const middleware = validationMiddleware.create({
      required: ["message"],
      types: { message: "string" },
    });

    assert.strictEqual(typeof middleware, "function");
  });
});

describe("CorsMiddleware", () => {
  let corsMiddleware;
  let config;

  beforeEach(() => {
    config = new Config("service", "test");
    corsMiddleware = new CorsMiddleware(config);
  });

  test("creates CORS middleware", () => {
    const middleware = corsMiddleware.create();
    assert.strictEqual(typeof middleware, "function");
  });

  test("creates CORS middleware with custom options", () => {
    const middleware = corsMiddleware.create({
      origin: ["https://example.com"],
      allowMethods: ["GET", "POST", "PUT"],
    });
    assert.strictEqual(typeof middleware, "function");
  });
});

describe("Factory functions", () => {
  test("createValidationMiddleware creates validation middleware", () => {
    const middleware = createValidationMiddleware();
    assert(middleware instanceof ValidationMiddleware);
  });

  test("createValidationMiddleware works with config", () => {
    const config = new Config("service", "test");
    const middleware = createValidationMiddleware(config);
    assert(middleware instanceof ValidationMiddleware);
  });

  test("createCorsMiddleware creates CORS middleware", () => {
    const middleware = createCorsMiddleware();
    assert(middleware instanceof CorsMiddleware);
  });

  test("createCorsMiddleware works with config", () => {
    const config = new Config("service", "test");
    const middleware = createCorsMiddleware(config);
    assert(middleware instanceof CorsMiddleware);
  });
});
