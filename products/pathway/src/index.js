// Public entry point for @forwardimpact/pathway.
// The primary consumption mode is the CLI (fit-pathway) — this
// re-export exists so the package conforms to the repo-wide layout
// contract and so consumers who import @forwardimpact/pathway
// directly receive the shared type definitions.
export * from "./types.js";
