#!/usr/bin/env node
/**
 * Send an email via Apple Mail using AppleScript.
 *
 * Builds an AppleScript command to create and send an outgoing message through
 * Apple Mail. The script writes a temporary .scpt file, executes it with
 * osascript, and cleans up afterwards. Mail.app must be running.
 *
 * The body should be plain text — no HTML. Do NOT include an email signature;
 * Apple Mail appends the user's configured signature automatically.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const HELP = `send-email — send an email via Apple Mail

Usage: node scripts/send-email.mjs --to <addrs> --subject <subj> --body <text> [options]

Options:
  --to <addrs>       Comma-separated To recipients (required)
  --cc <addrs>       Comma-separated CC recipients
  --bcc <addrs>      Comma-separated BCC recipients
  --subject <subj>   Email subject line (required)
  --body <text>      Plain-text email body (required)
  -h, --help         Show this help message and exit

Mail.app must be running. No email signature needed — Apple Mail appends it.`;

if (process.argv.includes("-h") || process.argv.includes("--help")) {
  console.log(HELP);
  process.exit(0);
}

/** Escape a string for AppleScript double-quoted context. */
function escapeAS(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Build recipient lines for AppleScript. */
function recipientLines(type, addrs) {
  if (!addrs) return "";
  return addrs
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
    .map(
      (addr) =>
        `        make new ${type} at end of ${type}s with properties {address:"${escapeAS(addr)}"}`,
    )
    .join("\n");
}

function main() {
  const args = process.argv.slice(2);
  let to = "",
    cc = "",
    bcc = "",
    subject = "",
    body = "";

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--to":
        to = args[++i] ?? "";
        break;
      case "--cc":
        cc = args[++i] ?? "";
        break;
      case "--bcc":
        bcc = args[++i] ?? "";
        break;
      case "--subject":
        subject = args[++i] ?? "";
        break;
      case "--body":
        body = args[++i] ?? "";
        break;
    }
  }

  if (!to || !subject || !body) {
    console.error("Error: --to, --subject, and --body are required.");
    console.error("Run with --help for usage info.");
    process.exit(1);
  }

  const lines = [
    'tell application "Mail"',
    `    set newMessage to make new outgoing message with properties {subject:"${escapeAS(subject)}", content:"${escapeAS(body)}", visible:false}`,
    "    tell newMessage",
    recipientLines("to recipient", to),
    cc ? recipientLines("cc recipient", cc) : "",
    bcc ? recipientLines("bcc recipient", bcc) : "",
    "    end tell",
    "    send newMessage",
    "end tell",
  ]
    .filter(Boolean)
    .join("\n");

  const tmp = join(mkdtempSync(join(tmpdir(), "send-email-")), "mail.scpt");
  try {
    writeFileSync(tmp, lines);
    execFileSync("osascript", [tmp], { stdio: "inherit" });
    console.log(`Sent: ${subject}`);
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      // ignore cleanup errors
    }
  }
}

main();
