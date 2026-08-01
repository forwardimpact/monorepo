/**
 * Stable error classes for Summit aggregation.
 *
 * CLI handlers branch on `error.code`. They do not match the message
 * string. This keeps the handler layer independent of the
 * human-readable message.
 */

/** Signals that a requested team ID does not exist in the roster. */
export class TeamNotFoundError extends Error {
  /** Create a TeamNotFoundError for the given team ID. */
  constructor(teamId) {
    super(
      `Team "${teamId}" not found. Run \`fit-summit roster\` to list teams.`,
    );
    this.code = "SUMMIT_TEAM_NOT_FOUND";
    this.teamId = teamId;
  }
}

/** Signals that a team exists but contains no members. */
export class EmptyTeamError extends Error {
  /** Create an EmptyTeamError for the given team ID. */
  constructor(teamId) {
    super(
      `Team "${teamId}" has no members. Add members to the roster or check the manager email hierarchy.`,
    );
    this.code = "SUMMIT_EMPTY_TEAM";
    this.teamId = teamId;
  }
}

/**
 * Signals that a job profile references a discipline, level, or track
 * that Map data does not define.
 */
export class UnknownJobFieldError extends Error {
  /** Create an UnknownJobFieldError for the invalid field name and value. */
  constructor(field, value) {
    super(`Invalid job profile. Map data does not define ${field} "${value}".`);
    this.code = "SUMMIT_UNKNOWN_JOB_FIELD";
    this.field = field;
    this.value = value;
  }
}
