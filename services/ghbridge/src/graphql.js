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
