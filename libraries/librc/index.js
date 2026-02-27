/**
 * Unix socket client utilities for communicating with svscan daemon.
 */
import net from "node:net";

export { ServiceManager } from "./manager.js";

/**
 * Sends a command to svscan via Unix socket
 * @param {string} socketPath - Path to Unix socket
 * @param {object} cmd - Command object to send
 * @returns {Promise<object>} Response from svscan
 */
export function sendCommand(socketPath, cmd) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath, () => {
      client.write(JSON.stringify(cmd) + "\n");
    });

    let data = "";
    client.on("data", (chunk) => {
      data += chunk.toString();
    });

    client.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error(`Invalid response: ${data}`));
      }
    });

    client.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Waits for socket to become available
 * @param {string} socketPath - Path to Unix socket
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<boolean>} True if socket available
 */
export async function waitForSocket(socketPath, timeout) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await sendCommand(socketPath, { command: "ping" });
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  return false;
}
