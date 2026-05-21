#!/usr/bin/env bun
import { createServiceConfig } from "@forwardimpact/libconfig";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { execSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import { parseArgs } from "node:util";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const { values } = parseArgs({
  options: {
    "tunnel-domain": { type: "string" },
    output: {
      type: "string",
      default: "dist/kata-agent-bridge.zip",
    },
  },
});

const config = await createServiceConfig("msteams", {
  protocol: "http",
  port: 3978,
  callback_base_url: "",
});
const appId = config.msAppId();

let tunnelDomain = values["tunnel-domain"];
if (!tunnelDomain && config.callback_base_url) {
  tunnelDomain = new URL(config.callback_base_url).hostname;
}
if (!tunnelDomain) {
  console.error(
    "No tunnel domain: pass --tunnel-domain or set SERVICE_MSTEAMS_CALLBACK_BASE_URL in .env",
  );
  process.exit(1);
}

const manifest = {
  $schema:
    "https://developer.microsoft.com/en-us/json-schemas/teams/v1.17/MicrosoftTeams.schema.json",
  manifestVersion: "1.17",
  version: "0.1.0",
  id: appId,
  packageName: "com.forwardimpact.kata-agent-bridge",
  developer: {
    name: "Forward Impact",
    websiteUrl: "https://www.forwardimpact.team",
    privacyUrl: "https://www.forwardimpact.team/privacy",
    termsOfUseUrl: "https://www.forwardimpact.team/terms",
  },
  name: { short: "Kata Agent", full: "Kata Agent Team Bridge" },
  description: {
    short: "Invoke the Kata agent team from Teams",
    full: "Bridge between Microsoft Teams and the Kata agent team. Send a message to get the facilitator's conclusion back in the same thread.",
  },
  icons: { outline: "outline.png", color: "color.png" },
  accentColor: "#4F46E5",
  bots: [
    {
      botId: appId,
      scopes: ["team", "groupChat"],
      supportsFiles: false,
      isNotificationOnly: false,
    },
  ],
  permissions: ["messageTeamMembers"],
  validDomains: [tunnelDomain],
};

// --- Minimal PNG generation (solid-color placeholders) ---

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBytes = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

function createSolidPng(width, height, r, g, b) {
  const rowBytes = 1 + width * 3;
  const raw = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const off = y * rowBytes;
    for (let x = 0; x < width; x++) {
      const px = off + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Package ---

const tmp = await mkdtemp(join(tmpdir(), "msteams-pkg-"));
const outputPath = resolve(values.output);
await mkdir(dirname(outputPath), { recursive: true });
try {
  await Promise.all([
    writeFile(
      join(tmp, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    ),
    writeFile(join(tmp, "color.png"), createSolidPng(192, 192, 79, 70, 229)),
    writeFile(join(tmp, "outline.png"), createSolidPng(32, 32, 255, 255, 255)),
  ]);
  execSync(`zip -j "${outputPath}" manifest.json color.png outline.png`, {
    cwd: tmp,
  });
  console.log(outputPath);
} finally {
  await rm(tmp, { recursive: true });
}
