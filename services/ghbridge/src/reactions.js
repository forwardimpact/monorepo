import { ADD_REACTION_MUTATION, REMOVE_REACTION_MUTATION } from "./graphql.js";

const REACTION_CONTENT = "EYES";

/**
 * Parse an `owner/repo` string into `{owner, name}`, or `undefined` when the
 * value is empty or malformed (e.g. multi-tenant mode where the static repo
 * is unset).
 *
 * @param {string} githubRepo
 * @returns {{owner: string, name: string} | undefined}
 */
export function parseRepo(githubRepo) {
  if (typeof githubRepo !== "string" || !githubRepo) return undefined;
  const [owner, name] = githubRepo.split("/");
  if (!owner || !name) return undefined;
  return { owner, name };
}

/**
 * Build the EYES reaction adapter. The reaction is the App reacting on the
 * customer's repository, so it needs an installation token for that repo. A
 * `target.repo` (set by the bridge in multi-tenant mode from the resolved
 * tenant) selects a per-tenant client via `makeGraphqlClient`; otherwise the
 * static single-tenant `graphqlClient` is used.
 *
 * @param {(query: string, vars: object) => Promise<unknown>} graphqlClient
 * @param {((repo: {owner: string, name: string}) => Function) | undefined} makeGraphqlClient
 */
export function buildReactionAdapter(graphqlClient, makeGraphqlClient) {
  const clientFor = (target) =>
    target?.repo && makeGraphqlClient
      ? makeGraphqlClient(target.repo)
      : graphqlClient;
  return {
    add: async (target) => {
      if (!target?.subjectId) return null;
      await clientFor(target)(ADD_REACTION_MUTATION, {
        i: { subjectId: target.subjectId, content: REACTION_CONTENT },
      });
      return target.subjectId;
    },
    remove: async (_reactionId, target) => {
      if (!target?.subjectId) return;
      await clientFor(target)(REMOVE_REACTION_MUTATION, {
        i: { subjectId: target.subjectId, content: REACTION_CONTENT },
      });
    },
  };
}
