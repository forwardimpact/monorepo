import botbuilder from "botbuilder";

const { CloudAdapter, ConfigurationBotFrameworkAuthentication, TurnContext } =
  botbuilder;

export { CloudAdapter, ConfigurationBotFrameworkAuthentication, TurnContext };

/**
 * Reaction adapter for the Bot Framework. Sends a `messageReaction`
 * activity with `reactionsAdded: [{ type: "like" }]` on start and the
 * matching `reactionsRemoved` on finish — Microsoft's Bot SDK does not
 * surface a generic emoji reaction type, so `like` is the closest
 * immediate acknowledgement we can offer.
 *
 * @param {object} adapter - Bot Framework CloudAdapter (or compatible stub)
 * @param {() => string} msAppIdFn
 * @returns {{add: Function, remove: Function}}
 */
export function buildReactionAdapter(adapter, msAppIdFn) {
  return {
    add: async (target) => {
      if (!target?.ref || !target?.activityId) return null;
      await adapter.continueConversationAsync(
        msAppIdFn(),
        target.ref,
        async (turnContext) => {
          await turnContext.sendActivity({
            type: "messageReaction",
            replyToId: target.activityId,
            reactionsAdded: [{ type: "like" }],
          });
        },
      );
      return "like";
    },
    remove: async (_reactionId, target) => {
      if (!target?.ref || !target?.activityId) return;
      await adapter.continueConversationAsync(
        msAppIdFn(),
        target.ref,
        async (turnContext) => {
          await turnContext.sendActivity({
            type: "messageReaction",
            replyToId: target.activityId,
            reactionsRemoved: [{ type: "like" }],
          });
        },
      );
    },
  };
}

/**
 * Typing adapter for the Bot Framework. Single responsibility: deliver
 * `text` to the conversation identified by `target.ref`. Acknowledgement
 * owns the verb pool and cadence.
 *
 * @param {object} adapter
 * @param {() => string} msAppIdFn
 * @returns {{send: Function}}
 */
export function buildTypingAdapter(adapter, msAppIdFn) {
  return {
    send: async (target, text) => {
      if (!target?.ref) return;
      await adapter.continueConversationAsync(
        msAppIdFn(),
        target.ref,
        async (turnContext) => {
          await turnContext.sendActivity(text);
        },
      );
    },
  };
}

/**
 * Post `text` as a Teams message in the conversation identified by `ref`.
 * @param {object} adapter
 * @param {() => string} msAppIdFn
 * @param {object} ref
 * @param {string} text
 */
export async function sendReply(adapter, msAppIdFn, ref, text) {
  await adapter.continueConversationAsync(
    msAppIdFn(),
    ref,
    async (turnContext) => {
      await turnContext.sendActivity(text);
    },
  );
}

/**
 * Build the default Bot Framework CloudAdapter wired to the service config.
 * @param {object} config
 * @returns {object}
 */
export function createDefaultAdapter(config) {
  const auth = new ConfigurationBotFrameworkAuthentication({
    MicrosoftAppId: config.msAppId(),
    MicrosoftAppPassword: config.msAppPassword(),
    MicrosoftAppTenantId: config.msAppTenantId(),
    MicrosoftAppType: "SingleTenant",
  });
  return new CloudAdapter(auth);
}
