#!/usr/bin/env bun
/**
 * Send an email via Apple Mail using AppleScript.
 *
 * Builds an AppleScript command to create and send an outgoing message through
 * Apple Mail. The script writes a temporary .scpt file, executes it with
 * osascript, and cleans up afterwards. Mail.app must be running.
 *
 * The body should be plain text — no HTML. Do NOT include an email signature
 * or sign-off; Apple Mail appends the user's configured signature automatically.
 */

import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  mkdtempSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";

const HELP = `send-email — send an email via Apple Mail

Usage: node scripts/send-email.mjs --to <addrs> --subject <subj> --body <text> [options]

Options:
  --to <addrs>       Comma-separated To recipients (required)
  --cc <addrs>       Comma-separated CC recipients
  --bcc <addrs>      Comma-separated BCC recipients
  --subject <subj>   Email subject line (required)
  --body <text>      Plain-text email body (required)
  --draft <path>     Draft file — deleted after send, ID appended to drafts/handled
  -h, --help         Show this help message and exit

Mail.app must be running. No signature or sign-off needed — Apple Mail appends it.`;

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

function parseArgs(args) {
  const parsed = { to: "", cc: "", bcc: "", subject: "", body: "", draft: "" };
  const keyMap = {
    "--to": "to",
    "--cc": "cc",
    "--bcc": "bcc",
    "--subject": "subject",
    "--body": "body",
    "--draft": "draft",
  };
  for (let i = 0; i < args.length; i++) {
    const key = keyMap[args[i]];
    if (key) parsed[key] = args[++i] ?? "";
  }
  if (!parsed.to || !parsed.subject || !parsed.body) {
    console.error("Error: --to, --subject, and --body are required.");
    console.error("Run with --help for usage info.");
    process.exit(1);
  }
  parsed.body = parsed.body
    .split("\n")
    .map((line) => line.replace(/^ {2}/, ""))
    .join("\n")
    .trim();
  return parsed;
}

function buildAppleScript({ to, cc, bcc, subject, body }) {
  return [
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
}

function handleDraftCleanup(draft) {
  if (!draft) return;
  try {
    unlinkSync(draft);
    console.log(`Removed draft: ${draft}`);
  } catch {
    /* ignore */
  }
  const draftBasename = basename(draft, ".md");
  const emailId = draftBasename.replace(/_draft$/, "");
  if (emailId) {
    appendFileSync("drafts/handled", emailId + "\n");
    console.log(`Marked as handled: ${emailId}`);
  }
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const script = buildAppleScript(parsed);
  const tmp = join(mkdtempSync(join(tmpdir(), "send-email-")), "mail.scpt");
  try {
    writeFileSync(tmp, script);
    execFileSync("osascript", [tmp], { stdio: "inherit" });
    console.log(`Sent: ${parsed.subject}`);
    handleDraftCleanup(parsed.draft);
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

main();
