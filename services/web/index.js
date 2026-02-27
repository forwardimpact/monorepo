import { Hono } from "hono";
import { streamText } from "hono/streaming";

import { createHtmlFormatter } from "@forwardimpact/libformat";
import { agent, common } from "@forwardimpact/libtype";
import {
  createValidationMiddleware,
  createCorsMiddleware,
  createAuthMiddleware,
} from "@forwardimpact/libweb";

// Create HTML formatter with factory function
const htmlFormatter = createHtmlFormatter();

/**
 * Creates a web service with configurable dependencies
 * @param {import("@forwardimpact/librpc").clients.AgentClient} client - Agent service gRPC client
 * @param {import("@forwardimpact/libconfig").Config} config - Service configuration
 * @param {(namespace: string) => import("@forwardimpact/libtelemetry").Logger} [logger] - Optional logger
 * @returns {Promise<Hono>} Configured Hono application
 */
export async function createWebService(client, config, logger = null) {
  const app = new Hono();

  // Debug log auth configuration
  logger?.debug("Config", "Auth configuration", {
    auth_enabled: config.auth_enabled,
  });

  // Create middleware instances
  const validationMiddleware = createValidationMiddleware(config);
  const corsMiddleware = createCorsMiddleware(config);

  // Create auth middleware if enabled (auth_enabled from config.json or SERVICE_WEB_AUTH_ENABLED)
  const authMiddleware = config.auth_enabled
    ? createAuthMiddleware(config)
    : null;

  // Add CORS middleware
  app.use(
    "/web/api/*",
    corsMiddleware.create({
      origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
      allowMethods: ["GET", "POST"],
      allowHeaders: ["Content-Type", "Authorization"],
    }),
  );

  // Add auth middleware to protected routes
  if (authMiddleware) {
    app.use("/web/api/chat", authMiddleware.create());
  }

  // Health check endpoint
  app.get("/web/health", (c) => {
    return c.json({ status: "ok" });
  });

  // Route handlers with input validation
  app.post(
    "/web/api/chat",
    validationMiddleware.create({
      required: ["message"],
      types: {
        message: "string",
        resource_id: "string",
      },
      maxLengths: {
        message: 5000,
        resource_id: 100,
      },
    }),
    async (c) => {
      try {
        // Access authenticated user (null if auth disabled or optional)
        const user = c.get("user");
        logger?.debug("Chat", "Processing request", { userId: user?.id });

        const data = c.get("validatedData");
        const { message, resource_id } = data;

        const requestParams = agent.AgentRequest.fromObject({
          messages: [
            common.Message.fromObject({ role: "user", content: message }),
          ],
          llm_token: await config.llmToken(),
          resource_id: resource_id,
        });

        return streamText(c, async (stream) => {
          try {
            const grpcStream = client.ProcessStream(requestParams);

            for await (const chunk of grpcStream) {
              if (chunk.resource_id) {
                await stream.write(
                  JSON.stringify({ resource_id: chunk.resource_id }) + "\n",
                );
              }

              if (chunk.messages && chunk.messages.length > 0) {
                for (const msg of chunk.messages) {
                  let content = msg.content || "";
                  if (msg.role === "assistant" && content) {
                    content = htmlFormatter.format(content);
                  }

                  await stream.write(
                    JSON.stringify({
                      messages: [
                        {
                          role: msg.role,
                          content: content,
                          tool_calls: msg.tool_calls,
                        },
                      ],
                    }) + "\n",
                  );
                }
              }
            }
          } catch (error) {
            logger?.error("Stream", error);
            await stream.write(
              JSON.stringify({
                error: "Stream processing failed",
                details: error.message,
              }) + "\n",
            );
          }
        });
      } catch (error) {
        logger?.error("API", error, { path: c.req.path });

        // Return sanitized error response
        return c.json(
          {
            error: "Request processing failed",
            status: "error",
          },
          500,
        );
      }
    },
  );

  return app;
}
