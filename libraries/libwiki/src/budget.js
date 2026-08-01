// Canonical line- and word-counters for the budgeted wiki surfaces. The audit
// (`audit/scopes.js`) and the rotation primitive's bisecting seal
// (`weekly-log.js`) both import this one pair. So no audit that counts
// differently can later flag a part the seal accepts as conforming.

/** Count lines. Do not count a trailing newline as an empty final line. */
export function countLines(text) {
  return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

/** Count whitespace-delimited words. */
export function countWords(text) {
  let count = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const isWs = c === 32 || c === 9 || c === 10 || c === 13;
    if (isWs) inWord = false;
    else if (!inWord) {
      inWord = true;
      count++;
    }
  }
  return count;
}
