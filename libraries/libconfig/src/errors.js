/**
 * Construct the refusal `Error` `bootstrapProject` throws when a write
 * conflicts with the on-disk state and the caller did not signal overwrite
 * intent. The message names the key in conflict and the overwrite-intent
 * surface. A contributor who reads stderr can then suppress the refusal
 * and does not need to read the library source. The `cause` field carries
 * the structured fields, so a program can inspect them.
 *
 * @param {{ kind: "config" | "env", path: string }} args
 * @returns {Error}
 */
export function bootstrapRefusal({ kind, path }) {
  const overwriteSurface =
    kind === "config" ? "overwrites.config" : "overwrites.env";
  const subject =
    kind === "config" ? `config key "${path}"` : `.env key "${path}"`;
  const topKey = kind === "config" ? path.split(".")[0] : path;
  const err = new Error(
    `bootstrapProject: refused to overwrite ${subject}. ` +
      `Pass ${overwriteSurface}: ["${topKey}"] to allow.`,
  );
  err.cause = { kind, path, overwriteSurface };
  return err;
}
