import { loadTrustedIdpOrigins } from "@forwardimpact/libutil/trusted-origins";

/** Shared fixtures for the link-resume sibling suites. */
export const TRUSTED = loadTrustedIdpOrigins("https://oauth.example");
export const SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const NOW = 1_700_000_000_000;
export const clock = { now: () => NOW };
