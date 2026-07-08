/**
 * The Substrate Contract — the consumer-defined interface every stack-facing
 * `fit-terrain substrate` verb assumes. Consumers implement the relations
 * (as views or tables) in a dedicated `substrate` Postgres schema exposed
 * through their Supabase API; the verbs never name another schema or any
 * vendor table.
 *
 * Normative documentation:
 * https://www.forwardimpact.team/docs/libraries/substrate-contract/index.md
 */

export const SUBSTRATE_CONTRACT = {
  schema: "substrate",
  relations: {
    people: {
      required: true,
      columns: [
        "email",
        "name",
        "kind",
        "manager_email",
        "team_id",
        "team_name",
        "discipline",
        "level",
        "track",
      ],
    },
    evidence: { required: false, columns: ["email"] },
    discovery: { required: false, columns: ["key", "value"] },
  },
};
