#!/usr/bin/env node
// Tiny HTTP service. preflight starts it in the background; the invariants
// script HTTP-probes it on $PORT.
const http = require("node:http");
const server = http.createServer((_, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end('{"ok":true}');
});
server.listen(Number(process.env.PORT), "127.0.0.1");
setInterval(() => {}, 1000);
