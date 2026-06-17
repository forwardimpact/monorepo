#!/usr/bin/env bun

/**
 * follow.mjs — Read a live Anarlog transcript and output new content since
 * the last read. Designed to be called repeatedly during a live session.
 *
 * Usage:
 *   node follow.mjs <session-id>                    # First read — outputs everything
 *   node follow.mjs <session-id> --after <word-id>  # Outputs words after the given word ID
 *   node follow.mjs <session-id> --after <word-id> --summary  # Condensed summary mode
 *   node follow.mjs <session-id> --meta              # Output session metadata only
 *   node follow.mjs --detect                          # Detect the most recently active session
 *
 * Output (JSON):
 *   {
 *     "session_id": "...",
 *     "title": "...",
 *     "total_words": 1234,
 *     "new_words": 56,
 *     "last_word_id": "...",
 *     "duration_ms": 123456,
 *     "channels": {
 *       "0": { "label": "user", "word_count": 600 },
 *       "1": { "label": "guest", "word_count": 634 }
 *     },
 *     "text": [
 *       { "channel": 0, "start_ms": 1000, "end_ms": 5000, "text": "Hello, how are you?" },
 *       ...
 *     ]
 *   }
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const SESSIONS_DIR = join(
  homedir(),
  "Library/Application Support/anarlog/sessions",
);

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {};
  let positional = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--after" && i + 1 < args.length) {
      flags.after = args[++i];
    } else if (args[i] === "--summary") {
      flags.summary = true;
    } else if (args[i] === "--meta") {
      flags.meta = true;
    } else if (args[i] === "--detect") {
      flags.detect = true;
    } else if (!args[i].startsWith("--")) {
      positional = args[i];
    }
  }

  return { sessionId: positional, ...flags };
}

function detectActiveSession() {
  const entries = readdirSync(SESSIONS_DIR);
  let best = null;
  let bestMtime = 0;

  for (const entry of entries) {
    const transcriptPath = join(SESSIONS_DIR, entry, "transcript.json");
    try {
      const stat = statSync(transcriptPath);
      if (stat.mtimeMs > bestMtime) {
        bestMtime = stat.mtimeMs;
        best = entry;
      }
    } catch {
      // No transcript — skip
    }
  }

  if (!best) {
    console.error("No active Anarlog session found.");
    process.exit(1);
  }

  // Check if the transcript was modified recently (within last 5 minutes)
  const ageMs = Date.now() - bestMtime;
  const isLive = ageMs < 5 * 60 * 1000;

  const metaPath = join(SESSIONS_DIR, best, "_meta.json");
  let title = "Unknown";
  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
    title = meta.title || "Untitled";
  } catch {
    // No meta
  }

  return {
    session_id: best,
    title,
    is_live: isLive,
    last_modified: new Date(bestMtime).toISOString(),
    age_seconds: Math.round(ageMs / 1000),
  };
}

function readMeta(sessionId) {
  const metaPath = join(SESSIONS_DIR, sessionId, "_meta.json");
  try {
    return JSON.parse(readFileSync(metaPath, "utf-8"));
  } catch {
    return { title: "Unknown", created_at: null, participants: [] };
  }
}

function readTranscript(sessionId) {
  const path = join(SESSIONS_DIR, sessionId, "transcript.json");
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return data.transcripts?.[0]?.words || [];
  } catch {
    return [];
  }
}

function groupIntoSegments(words) {
  if (words.length === 0) return [];

  const segments = [];
  let current = {
    channel: words[0].channel,
    start_ms: words[0].start_ms,
    end_ms: words[0].end_ms,
    texts: [words[0].text],
  };

  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    const gap = w.start_ms - current.end_ms;

    // New segment on channel change or >3s gap
    if (w.channel !== current.channel || gap > 3000) {
      segments.push({
        channel: current.channel,
        start_ms: current.start_ms,
        end_ms: current.end_ms,
        text: current.texts.join("").trim(),
      });
      current = {
        channel: w.channel,
        start_ms: w.start_ms,
        end_ms: w.end_ms,
        texts: [w.text],
      };
    } else {
      current.end_ms = w.end_ms;
      current.texts.push(w.text);
    }
  }

  // Push final segment
  segments.push({
    channel: current.channel,
    start_ms: current.start_ms,
    end_ms: current.end_ms,
    text: current.texts.join("").trim(),
  });

  return segments.filter((s) => s.text.length > 0);
}

function buildChannelStats(allWords) {
  const channels = {};
  for (const w of allWords) {
    if (!channels[w.channel]) {
      channels[w.channel] = {
        label: w.channel === 0 ? "user" : `guest-${w.channel}`,
        word_count: 0,
      };
    }
    channels[w.channel].word_count++;
  }
  return channels;
}

function filterNewWords(allWords, afterId) {
  if (!afterId) return allWords;
  const idx = allWords.findIndex((w) => w.id === afterId);
  // If word ID not found, return everything (safety fallback)
  return idx >= 0 ? allWords.slice(idx + 1) : allWords;
}

function main() {
  const opts = parseArgs();

  // Detect mode
  if (opts.detect) {
    console.log(JSON.stringify(detectActiveSession(), null, 2));
    return;
  }

  if (!opts.sessionId) {
    console.error(
      "Usage: follow.mjs <session-id> [--after <word-id>] [--meta]",
    );
    process.exit(1);
  }

  const meta = readMeta(opts.sessionId);

  // Meta-only mode
  if (opts.meta) {
    console.log(JSON.stringify(meta, null, 2));
    return;
  }

  // Read transcript
  const allWords = readTranscript(opts.sessionId);
  const words = filterNewWords(allWords, opts.after);
  const lastWord = allWords[allWords.length - 1];

  console.log(
    JSON.stringify(
      {
        session_id: opts.sessionId,
        title: meta.title,
        created_at: meta.created_at,
        total_words: allWords.length,
        new_words: words.length,
        last_word_id: lastWord?.id || null,
        duration_ms: lastWord?.end_ms || 0,
        channels: buildChannelStats(allWords),
        text: groupIntoSegments(words),
      },
      null,
      2,
    ),
  );
}

main();
