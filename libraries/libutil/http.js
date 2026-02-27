/**
 * Parses the JSON body from an incoming HTTP request.
 * @param {import('http').IncomingMessage} req - The HTTP request object.
 * @returns {Promise<object>} The parsed JSON object, or an empty object if parsing fails.
 */
export function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}
