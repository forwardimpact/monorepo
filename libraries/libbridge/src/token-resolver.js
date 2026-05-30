import { ghuser } from "@forwardimpact/libtype";

/** Maps ghuser GetToken oneof + gRPC transport into a discriminated DispatchAuth result. */
export class TokenResolver {
  #client;

  /** @param {object} client - ghuser gRPC client */
  constructor(client) {
    if (!client) throw new Error("ghuser client is required");
    this.#client = client;
  }

  /** @returns {Promise<{kind: string, token?: string, authorizeUrl?: string, error?: Error}>} */
  async resolve(surface, surfaceUserId) {
    try {
      const req = new ghuser.GetTokenRequest({
        surface,
        surface_user_id: surfaceUserId,
      });
      const res = await this.#client.GetToken(req);
      switch (res.result) {
        case "token":
          return { kind: "token", token: res.token };
        case "link_required":
          return {
            kind: "link_required",
            authorizeUrl: res.link_required.authorize_url,
          };
        case "re_auth_required":
          return { kind: "reauth_required" };
        default:
          return {
            kind: "transient",
            error: new Error("unexpected GetToken result"),
          };
      }
    } catch (err) {
      return { kind: "transient", error: err };
    }
  }
}
