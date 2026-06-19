/**
 * Hand-rolled fake Supabase client for the hosted Edge Function handler tests.
 *
 * The hosted handlers drive the full transform orchestrator (people → getdx →
 * github → artifact producer → round-robin evidence), so the fake models the
 * whole surface those transforms touch — not only the producer's chains.
 * `createMockSupabaseClient` does not model the producer's `.not()` /
 * nested-join select / `.delete().eq()` / `.upsert(rows, opts)` chains, so this
 * follows the hand-rolled pattern in `transform-evidence-artifact.test.js`.
 *
 * By default raw storage is empty (`list` → `[]`, `download` → error), so the
 * people/getdx/github/round-robin transforms no-op and only the artifact
 * producer does work when `mapData` is supplied. Seed `storage` and `tables`
 * to exercise the other paths.
 *
 * @param {object} [opts]
 * @param {Record<string, Array<{name: string, created_at?: string}>>} [opts.storage]
 *   Map of prefix → listed files (e.g. `{ "people/": [{ name: "x.yaml" }] }`).
 * @param {Record<string, string>} [opts.files] Map of full path → file text.
 * @param {Array<object>} [opts.joinedArtifacts] Rows returned by the
 *   `github_artifacts` join select the producer / round-robin use.
 * @returns {object} Fake client plus `upsertCalls` / `deleteCalls` for assertions.
 */
export function createFakeSupabase({
  storage = {},
  files = {},
  joinedArtifacts = [],
} = {}) {
  const upsertCalls = [];
  const deleteCalls = [];

  const bucket = {
    async list(prefix) {
      return { data: storage[prefix] ?? [], error: null };
    },
    async download(path) {
      if (files[path] === undefined) {
        return { data: null, error: { message: "not found" } };
      }
      return { data: { text: async () => files[path] }, error: null };
    },
    async upload(path, content) {
      files[path] = content;
      const slash = path.lastIndexOf("/");
      const prefix = path.slice(0, slash + 1);
      const name = path.slice(slash + 1);
      (storage[prefix] ??= []).unshift({
        name,
        created_at: new Date().toISOString(),
      });
      return { data: { path }, error: null };
    },
  };

  function table(name) {
    return {
      select() {
        return {
          not() {
            return { data: joinedArtifacts, error: null };
          },
          eq() {
            return {
              async single() {
                return { data: null, error: null };
              },
            };
          },
          data: joinedArtifacts,
          error: null,
        };
      },
      delete() {
        return {
          async eq(col, val) {
            deleteCalls.push({ table: name, col, val });
            return { error: null };
          },
        };
      },
      async upsert(rows, options) {
        upsertCalls.push({ table: name, rows, options });
        return { error: null };
      },
    };
  }

  return {
    upsertCalls,
    deleteCalls,
    storage: { from: () => bucket },
    from: (name) => table(name),
  };
}
