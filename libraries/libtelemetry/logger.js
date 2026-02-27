/**
 * Logger class for RFC 5424 compliant logging
 */
export class Logger {
  #domain;
  #enabled;
  #process;
  #msgId = 0;

  /**
   * Creates a new Logger instance
   * @param {string} domain - Domain or service area for this logger instance
   * @param {object} process - Process object for environment access
   */
  constructor(domain, process = global.process) {
    if (!domain || typeof domain !== "string") {
      throw new Error("domain must be a non-empty string");
    }
    this.#domain = domain;
    this.#process = process;
    this.#enabled = this.#isEnabled();
  }

  /**
   * Gets the domain or service area of this logger
   * @returns {string} The domain name
   */
  get domain() {
    return this.#domain;
  }

  /**
   * Gets whether logging is enabled for this domain
   * @returns {boolean} Whether logging is enabled
   */
  get enabled() {
    return this.#enabled;
  }

  /**
   * Gets the next message ID
   * @returns {string} The next message ID padded to 3 digits
   */
  get msgId() {
    this.#msgId += 1;
    return "MSG" + String(this.#msgId).padStart(3, "0");
  }

  /**
   * Gets the process ID of the current process
   * @returns {string} The process ID
   */
  get procId() {
    return this.#process.pid || "-";
  }

  /**
   * Gets the current timestamp in ISO 8601 format
   * @returns {string} The current timestamp
   */
  get timestamp() {
    return new Date().toISOString();
  }

  /**
   * Logs a debug message if logging is enabled for this domain
   * @param {string} [appId] - Application identifier or method name
   * @param {string} [message] - The log message
   * @param {object} [attributes] - Optional key-value pairs to append to the message
   */
  debug(appId, message, attributes = {}) {
    if (!this.#enabled) {
      return;
    }

    console.error(this.#formatLine("DEBUG", appId, message, attributes));
  }

  /**
   * Logs an info message (always outputs regardless of DEBUG setting)
   * @param {string} [appId] - Application identifier or method name
   * @param {string} [message] - The log message
   * @param {object} [attributes] - Optional key-value pairs to append to the message
   */
  info(appId, message, attributes = {}) {
    console.error(this.#formatLine("INFO", appId, message, attributes));
  }

  /**
   * Logs an error message (always outputs regardless of DEBUG setting)
   * @param {string} [appId] - Application identifier or method name
   * @param {string|Error} [message] - Error message or Error object
   * @param {object} [attributes] - Optional key-value pairs to append to the message
   */
  error(appId, message, attributes = {}) {
    const errorMessage =
      message instanceof Error ? message.message : String(message);

    // Extract trace context from error object (added by Tracer)
    const traceContext = {};
    if (message?.trace_id) traceContext.trace_id = message.trace_id;
    if (message?.span_id) traceContext.span_id = message.span_id;
    if (message?.service_name) traceContext.service_name = message.service_name;

    // Merge trace context with provided attributes
    const enrichedAttributes = { ...traceContext, ...attributes };

    console.error(
      this.#formatLine("ERROR", appId, errorMessage, enrichedAttributes),
    );
  }

  /**
   * Logs an error with stack trace (always logs message, stack trace only when enabled)
   * @param {string} [appId] - Application identifier or method name
   * @param {Error} [error] - Error object
   * @param {object} [attributes] - Optional key-value pairs to append to the message
   */
  exception(appId, error, attributes = {}) {
    let message = error?.message || String(error);

    // Append stack trace if available and logging is enabled
    if (this.#enabled && error?.stack) {
      message += "\n" + error.stack;
    }

    // Extract trace context from error object (added by Tracer)
    const traceContext = {};
    if (error?.trace_id) traceContext.trace_id = error.trace_id;
    if (error?.span_id) traceContext.span_id = error.span_id;
    if (error?.service_name) traceContext.service_name = error.service_name;

    // Merge trace context with provided attributes
    const enrichedAttributes = { ...traceContext, ...attributes };

    console.error(
      this.#formatLine("ERROR", appId, message, enrichedAttributes),
    );
  }

  /**
   * Formats attributes as a string for logging
   * @param {object} attributes - Key-value pairs to format
   * @returns {string} Formatted attributes string
   * @private
   */
  #formatData(attributes) {
    if (attributes && typeof attributes === "object") {
      const pairs = Object.entries(attributes)
        .map(([key, value]) => `${key}="${value}"`)
        .join(" ");

      if (pairs) {
        return `[${pairs}]`;
      }
    }
    return "-";
  }

  /**
   * Formats a log line according to RFC 5424
   * @param {string} level - Log level (e.g., "DEBUG")
   * @param {string} [appId] - Application identifier or method name
   * @param {string} [message] - The log message
   * @param {object} [attributes] - Key-value pairs to format
   * @returns {string} Formatted log line
   * @private
   */
  #formatLine(level, appId = "-", message = "-", attributes = {}) {
    const data = this.#formatData(attributes);

    // RFC 5424: level timestamp domain appId procId msgId data message
    return `${level} ${this.timestamp} ${this.domain} ${appId} ${this.procId} ${this.msgId} ${data} ${message}`;
  }

  /**
   * Checks if logging is enabled for this domain based on DEBUG environment variable
   * @returns {boolean} Whether logging is enabled
   * @private
   */
  #isEnabled() {
    const debugEnv = this.#process.env.DEBUG || "";

    if (debugEnv === "*") {
      return true;
    }

    if (debugEnv === "") {
      return false;
    }

    const patterns = debugEnv.split(",").map((p) => p.trim());

    return patterns.some((pattern) => {
      if (pattern === this.#domain) {
        return true;
      }

      if (pattern.endsWith("*")) {
        const prefix = pattern.slice(0, -1);
        return this.#domain.startsWith(prefix);
      }

      return false;
    });
  }
}

/**
 * Factory function to create a Logger instance
 * @param {string} domain - Domain or service area for the logger
 * @returns {Logger} Configured logger instance
 */
export function createLogger(domain) {
  return new Logger(domain);
}
