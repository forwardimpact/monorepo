import { MEMO_INBOX_MARKER } from "./constants.js";

/**
 * Append a timestamped memo bullet below the inbox marker in an agent's summary
 * file.
 * @param {{summaryPath: string, sender: string, message: string, today: string}} memo
 * @param {object} fs - Sync filesystem surface (`runtime.fsSync`).
 */
export function writeMemo({ summaryPath, sender, message, today }, fs) {
  const content = fs.readFileSync(summaryPath, "utf-8");
  const lines = content.split("\n");

  const markerIndex = lines.findIndex(
    (line) => line.trim() === MEMO_INBOX_MARKER,
  );

  if (markerIndex === -1) {
    return { written: false, reason: "missing-marker", path: summaryPath };
  }

  const flatMessage = message.replace(/\n/g, " ");
  const bullet = `- ${today} from **${sender}**: ${flatMessage}`;

  lines.splice(markerIndex + 1, 0, bullet);
  fs.writeFileSync(summaryPath, lines.join("\n"));

  return { written: true, path: summaryPath };
}
