/**
 * GraphQL mutations used by the GitHub Discussions adapter. Kept in a single
 * file so reviewers can grep one location for every channel-specific
 * GraphQL string — the libbridge invariant forbids these strings from
 * leaking into the shared package.
 */

export const ADD_DISCUSSION_COMMENT_MUTATION = `
  mutation Add($i: AddDiscussionCommentInput!) {
    addDiscussionComment(input: $i) {
      comment { id url }
    }
  }`;

export const ADD_REACTION_MUTATION = `
  mutation AddReaction($i: AddReactionInput!) {
    addReaction(input: $i) {
      reaction { content }
    }
  }`;

/**
 * Post each reply in `replies` as a separate `addDiscussionComment`
 * GraphQL mutation. Skips entries lacking a body.
 *
 * @param {(query: string, vars: object) => Promise<unknown>} graphqlClient
 * @param {{discussion_id: string}} ctx
 * @param {Array<{body: string, in_reply_to?: string}>} replies
 */
export async function postDiscussionReplies(graphqlClient, ctx, replies) {
  for (const reply of replies) {
    if (!reply || typeof reply.body !== "string") continue;
    const input = {
      discussionId: ctx.discussion_id,
      body: reply.body,
      ...(reply.in_reply_to ? { replyToId: reply.in_reply_to } : {}),
    };
    await graphqlClient(ADD_DISCUSSION_COMMENT_MUTATION, { i: input });
  }
}

/**
 * Post a single addDiscussionComment with no thread parent.
 *
 * @param {(query: string, vars: object) => Promise<unknown>} graphqlClient
 * @param {{discussion_id: string}} ctx
 * @param {string} text
 */
export async function postSingleDiscussionReply(graphqlClient, ctx, text) {
  await graphqlClient(ADD_DISCUSSION_COMMENT_MUTATION, {
    i: { discussionId: ctx.discussion_id, body: text },
  });
}
