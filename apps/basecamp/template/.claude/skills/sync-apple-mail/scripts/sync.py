#!/usr/bin/env python3
"""Sync Apple Mail threads to ~/.cache/fit/basecamp/apple_mail/ as markdown.

Queries the macOS Mail SQLite database for threads with new messages since
the last sync and writes one markdown file per thread.

Usage: python3 scripts/sync.py [--days N]

Options:
    --days N    How many days back to sync on first run (default: 30)

Requires: macOS with Mail app configured and Full Disk Access granted.
"""

import argparse
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

OUTDIR = os.path.expanduser("~/.cache/fit/basecamp/apple_mail")
ATTACHMENTS_DIR = os.path.join(OUTDIR, "attachments")
STATE_DIR = os.path.expanduser("~/.cache/fit/basecamp/state")
STATE_FILE = os.path.join(STATE_DIR, "apple_mail_last_sync")

# Import parse-emlx module directly (avoids subprocess per message)
_emlx_spec = importlib.util.spec_from_file_location(
    "parse_emlx", os.path.join(os.path.dirname(__file__), "parse-emlx.py")
)
_emlx_mod = importlib.util.module_from_spec(_emlx_spec)
_emlx_spec.loader.exec_module(_emlx_mod)

MAX_THREADS = 500


def find_db():
    """Find the Apple Mail Envelope Index database."""
    import glob
    mail_dir = os.path.expanduser("~/Library/Mail")
    # V10, V9, etc. — always in {version}/MailData/Envelope Index
    paths = sorted(glob.glob(os.path.join(mail_dir, "V*/MailData/Envelope Index")),
                   reverse=True)
    if not paths:
        print("Error: Apple Mail database not found. Is Mail configured?")
        sys.exit(1)
    db = paths[0]
    if not os.access(db, os.R_OK):
        print("Error: Cannot read Mail database. Grant Full Disk Access to terminal.")
        sys.exit(1)
    return db


def query(db, sql, retry=True):
    """Execute a read-only SQLite query and return JSON results."""
    result = subprocess.run(
        ["sqlite3", "-readonly", "-json", db, sql],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        if retry and "database is locked" in result.stderr:
            time.sleep(2)
            return query(db, sql, retry=False)
        print(f"SQLite error: {result.stderr.strip()}", file=sys.stderr)
        return []
    return json.loads(result.stdout) if result.stdout.strip() else []


def load_last_sync(days_back=30):
    """Load the last sync timestamp. Returns Unix timestamp.

    Args:
        days_back: How many days back to look on first sync (default: 30).
    """
    try:
        iso = Path(STATE_FILE).read_text().strip()
        if iso:
            dt = datetime.fromisoformat(iso)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return int(dt.timestamp())
    except (FileNotFoundError, ValueError):
        pass
    # First sync: N days ago
    return int((datetime.now(timezone.utc) - timedelta(days=days_back)).timestamp())


def save_sync_state():
    """Save current time as the sync timestamp."""
    os.makedirs(STATE_DIR, exist_ok=True)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    Path(STATE_FILE).write_text(now)


def unix_to_readable(ts):
    """Convert Unix timestamp to readable date string."""
    if ts is None:
        return "Unknown"
    try:
        dt = datetime.fromtimestamp(int(ts), tz=timezone.utc)
        return dt.strftime("%Y-%m-%d %H:%M:%S UTC")
    except (ValueError, OSError):
        return "Unknown"


def discover_thread_column(db):
    """Determine which column to use for thread grouping."""
    rows = query(db, "PRAGMA table_info(messages);")
    columns = {r["name"] for r in rows}
    if "conversation_id" in columns:
        return "conversation_id"
    if "thread_id" in columns:
        return "thread_id"
    return None


def find_changed_threads(db, thread_col, since_ts):
    """Find thread IDs with messages newer than since_ts."""
    return query(db, f"""
        SELECT DISTINCT m.{thread_col} AS tid
        FROM messages m
        WHERE m.date_received > {since_ts}
          AND m.deleted = 0
          AND m.mailbox IN (
            SELECT ROWID FROM mailboxes
            WHERE url LIKE '%/Inbox%'
               OR url LIKE '%/INBOX%'
               OR url LIKE '%/Sent%'
          )
        LIMIT {MAX_THREADS};
    """)


def fetch_thread_messages(db, thread_col, tid):
    """Fetch all messages in a thread with sender info."""
    return query(db, f"""
        SELECT
            m.ROWID AS message_id,
            m.{thread_col} AS thread_id,
            COALESCE(s.subject, '(No Subject)') AS subject,
            COALESCE(m.subject_prefix, '') AS subject_prefix,
            COALESCE(a.address, 'Unknown') AS sender,
            COALESCE(a.comment, '') AS sender_name,
            m.date_received,
            COALESCE(su.summary, '') AS summary,
            COALESCE(m.list_id_hash, 0) AS list_id_hash,
            COALESCE(m.automated_conversation, 0) AS automated_conversation
        FROM messages m
        LEFT JOIN subjects s ON m.subject = s.ROWID
        LEFT JOIN addresses a ON m.sender = a.ROWID
        LEFT JOIN summaries su ON m.summary = su.ROWID
        WHERE m.{thread_col} = {tid}
          AND m.deleted = 0
        ORDER BY m.date_received ASC;
    """)


def fetch_recipients(db, message_ids):
    """Batch-fetch To/Cc recipients for a set of message IDs."""
    if not message_ids:
        return {}
    id_list = ",".join(str(mid) for mid in message_ids)
    rows = query(db, f"""
        SELECT
            r.message AS message_id,
            r.type,
            COALESCE(a.address, '') AS address,
            COALESCE(a.comment, '') AS name
        FROM recipients r
        LEFT JOIN addresses a ON r.address = a.ROWID
        WHERE r.message IN ({id_list})
        ORDER BY r.message, r.type, r.position;
    """)
    # Group by message_id → {0: To list, 1: Cc list}
    result = {}
    for r in rows:
        mid = r["message_id"]
        rtype = r["type"]
        if rtype == 2:  # Skip Bcc
            continue
        result.setdefault(mid, {}).setdefault(rtype, []).append(r)
    return result


def fetch_attachments(db, message_ids):
    """Batch-fetch attachment metadata for a set of message IDs."""
    if not message_ids:
        return {}
    id_list = ",".join(str(mid) for mid in message_ids)
    rows = query(db, f"""
        SELECT a.message AS message_id, a.attachment_id, a.name
        FROM attachments a
        WHERE a.message IN ({id_list})
        ORDER BY a.message, a.ROWID;
    """)
    result = {}
    for r in rows:
        mid = r["message_id"]
        result.setdefault(mid, []).append({
            "attachment_id": r["attachment_id"],
            "name": r["name"],
        })
    return result


def build_file_indexes():
    """Build emlx and attachment indexes with a single find traversal.

    Returns (emlx_index, attachment_index):
        emlx_index: {message_rowid: path} for .emlx files
        attachment_index: {(message_rowid, attachment_id): path} for attachment files
    """
    mail_dir = os.path.expanduser("~/Library/Mail")
    try:
        result = subprocess.run(
            ["find", mail_dir, "(", "-name", "*.emlx", "-o",
             "-path", "*/Attachments/*", ")", "-type", "f"],
            capture_output=True, text=True, timeout=60
        )
        emlx_index = {}
        attachment_index = {}
        for path in result.stdout.strip().splitlines():
            if "/Attachments/" in path:
                # Path: .../Attachments/{msg_rowid}/{attachment_id}/{filename}
                parts = path.split("/Attachments/", 1)
                if len(parts) == 2:
                    segments = parts[1].split("/")
                    if len(segments) >= 3 and segments[0].isdigit():
                        msg_rowid = int(segments[0])
                        att_id = segments[1]
                        attachment_index[(msg_rowid, att_id)] = path
            elif path.endswith(".emlx"):
                basename = os.path.basename(path)
                msg_id = basename.split(".")[0]
                if msg_id.isdigit():
                    mid = int(msg_id)
                    # Prefer .emlx over .partial.emlx (shorter name = full message)
                    if mid not in emlx_index or len(basename) < len(os.path.basename(emlx_index[mid])):
                        emlx_index[mid] = path
        return emlx_index, attachment_index
    except (subprocess.TimeoutExpired, Exception):
        return {}, {}


def parse_emlx(message_id, emlx_index):
    """Parse .emlx file for a message using pre-built index. Returns body text or None."""
    path = emlx_index.get(message_id)
    if not path:
        return None
    try:
        import email as email_lib
        with open(path, "rb") as f:
            byte_count = int(f.readline())
            raw = f.read(byte_count)
            msg = email_lib.message_from_bytes(raw)
            return _emlx_mod.extract_body(msg)
    except Exception:
        return None


def format_recipient(r):
    """Format a recipient as 'Name <email>' or just 'email'."""
    name = (r.get("name") or "").strip()
    addr = (r.get("address") or "").strip()
    if name and addr:
        return f"{name} <{addr}>"
    return addr or name


def format_sender(msg):
    """Format sender as 'Name <email>' or just 'email'."""
    name = (msg.get("sender_name") or "").strip()
    addr = (msg.get("sender") or "").strip()
    if name and addr:
        return f"{name} <{addr}>"
    return addr or name


def copy_thread_attachments(thread_id, messages, attachments_by_msg, attachment_index):
    """Copy attachment files into the output attachments directory.

    Returns {message_id: [{name, available, path}, ...]} for markdown listing.
    """
    results = {}
    seen_filenames = set()
    for msg in messages:
        mid = msg["message_id"]
        msg_attachments = attachments_by_msg.get(mid, [])
        if not msg_attachments:
            continue
        msg_results = []
        for att in msg_attachments:
            att_id = att["attachment_id"]
            name = att["name"] or "unnamed"
            source = attachment_index.get((mid, att_id))
            if not source or not os.path.isfile(source):
                msg_results.append({"name": name, "available": False, "path": None})
                continue
            # Handle filename collisions by prefixing with message_id
            dest_name = name
            if dest_name in seen_filenames:
                dest_name = f"{mid}_{name}"
            seen_filenames.add(dest_name)
            dest_dir = os.path.join(ATTACHMENTS_DIR, str(thread_id))
            os.makedirs(dest_dir, exist_ok=True)
            dest_path = os.path.join(dest_dir, dest_name)
            try:
                shutil.copy2(source, dest_path)
                msg_results.append({"name": dest_name, "available": True, "path": dest_path})
            except OSError:
                msg_results.append({"name": name, "available": False, "path": None})
        results[mid] = msg_results
    return results


def write_thread_markdown(thread_id, messages, recipients_by_msg, emlx_index, attachment_results=None):
    """Write a thread as a markdown file."""
    if not messages:
        return False

    # Use base subject from first message (without prefix)
    base_subject = messages[0].get("subject", "(No Subject)")

    # Determine flags
    is_mailing_list = any(m.get("list_id_hash", 0) != 0 for m in messages)
    is_automated = any(m.get("automated_conversation", 0) != 0 for m in messages)
    flags = []
    if is_mailing_list:
        flags.append("mailing-list")
    if is_automated:
        flags.append("automated")

    lines = []
    lines.append(f"# {base_subject}")
    lines.append("")
    lines.append(f"**Thread ID:** {thread_id}")
    lines.append(f"**Message Count:** {len(messages)}")
    if flags:
        lines.append(f"**Flags:** {', '.join(flags)}")
    lines.append("")

    for msg in messages:
        lines.append("---")
        lines.append("")
        lines.append(f"### From: {format_sender(msg)}")
        lines.append(f"**Date:** {unix_to_readable(msg.get('date_received'))}")

        # To/Cc recipients
        mid = msg.get("message_id")
        msg_recips = recipients_by_msg.get(mid, {})
        to_list = msg_recips.get(0, [])
        cc_list = msg_recips.get(1, [])
        if to_list:
            lines.append(f"**To:** {', '.join(format_recipient(r) for r in to_list)}")
        if cc_list:
            lines.append(f"**Cc:** {', '.join(format_recipient(r) for r in cc_list)}")

        lines.append("")

        # Body: try .emlx first, fall back to summary
        body = parse_emlx(mid, emlx_index)
        if not body:
            body = msg.get("summary", "").strip()
        if body:
            lines.append(body)
        lines.append("")

        # Attachments
        if attachment_results:
            msg_atts = attachment_results.get(mid, [])
            if msg_atts:
                lines.append("**Attachments:**")
                for att in msg_atts:
                    if att["available"]:
                        lines.append(f"- [{att['name']}](attachments/{thread_id}/{att['name']})")
                    else:
                        lines.append(f"- {att['name']} *(not available)*")
                lines.append("")

    filepath = os.path.join(OUTDIR, f"{thread_id}.md")
    Path(filepath).write_text("\n".join(lines))
    return True


def main():
    parser = argparse.ArgumentParser(description="Sync Apple Mail threads.")
    parser.add_argument("--days", type=int, default=30,
                        help="How many days back to sync on first run (default: 30)")
    args = parser.parse_args()

    db = find_db()
    os.makedirs(OUTDIR, exist_ok=True)

    # Load sync state
    since_ts = load_last_sync(days_back=args.days)
    since_readable = unix_to_readable(since_ts)

    # Discover thread column
    thread_col = discover_thread_column(db)
    if not thread_col:
        print("Error: Could not find conversation_id or thread_id column.")
        sys.exit(1)

    # Find changed threads
    changed = find_changed_threads(db, thread_col, since_ts)
    thread_ids = [r["tid"] for r in changed]

    if not thread_ids:
        print("Apple Mail Sync Complete")
        print("Threads processed: 0 (no new messages)")
        print(f"Time range: {since_readable} to now")
        print(f"Output: {OUTDIR}")
        save_sync_state()
        return

    # Build .emlx and attachment file indexes (single find traversal)
    emlx_index, attachment_index = build_file_indexes()

    # Process each thread
    written = 0
    for tid in thread_ids:
        messages = fetch_thread_messages(db, thread_col, tid)
        if not messages:
            continue

        msg_ids = [m["message_id"] for m in messages]

        # Batch-fetch recipients and attachments for all messages in thread
        recipients = fetch_recipients(db, msg_ids)
        attachments_by_msg = fetch_attachments(db, msg_ids)

        # Copy attachment files to output directory
        attachment_results = copy_thread_attachments(
            tid, messages, attachments_by_msg, attachment_index
        )

        if write_thread_markdown(tid, messages, recipients, emlx_index, attachment_results):
            written += 1

    # Save sync state (even on partial success)
    save_sync_state()

    print("Apple Mail Sync Complete")
    print(f"Threads processed: {len(thread_ids)}")
    print(f"New/updated files: {written}")
    print(f"Time range: {since_readable} to now")
    print(f"Output: {OUTDIR}")


if __name__ == "__main__":
    main()
