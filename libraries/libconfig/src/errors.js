/**
 * Construct the refusal `Error` `bootstrapProject` throws when a write
 * conflicts with the on-disk state and the caller did not signal overwrite
 * intent. The message names the conflicting key and the overwrite-intent
 * surface so a contributor reading stderr can suppress the refusal without
 * reading the library source; `cause` carries the structured fields for
 * programmatic introspection.
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
    `bootstrapProject: refused to overwrite ${subject}; ` +
      `pass ${overwriteSurface}: ["${topKey}"] to allow.`,
  );
  err.cause = { kind, path, overwriteSurface };
  return err;
}
