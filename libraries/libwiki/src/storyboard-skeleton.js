/**
 * Storyboard skeleton — the minimal, valid storyboard file `fit-wiki refresh`
 * writes when the current-month board does not yet exist. It carries only the
 * structural surface libwiki owns: the five Toyota Kata sections and the
 * generic `obstacles`/`experiments` issue-list marker blocks that refresh
 * renders from tracker state.
 *
 * Deliberately *not* here: the per-agent `#### {metric}` XmR blocks. Their
 * agent→metric grouping is per-installation curation libwiki cannot infer, so a
 * participant seeds each missing marker pair (see the kata-session skill) and a
 * later refresh renders it. Section budgets and authoring prose ("write the
 * challenge here") stay in the skill's `storyboard-template.md`, the L4
 * authoring layer — this skeleton is content-free scaffolding.
 */

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Whether `year` is a leap year under the Gregorian rule. */
function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Last calendar day of the month containing `todayIso` (ISO `YYYY-MM-DD`).
 * Pure integer/calendar math — no `Date`, so the module stays free of ambient
 * time deps.
 */
function endOfMonthIso(todayIso) {
  const [year, month] = todayIso.split("-").map(Number);
  const lastDay =
    month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

/**
 * Render the minimal storyboard skeleton for the month containing `todayIso`.
 * Pure — takes the day as an ISO string and returns markdown. The heading reads
 * `# Storyboard — {YYYY} {Month}`; the marker blocks match the syntax the
 * scanner (`marker-scanner.js`) and renderer (`commands/refresh.js`) expect.
 *
 * @param {string} todayIso - ISO date string (`YYYY-MM-DD`).
 * @returns {string} The skeleton markdown, newline-terminated.
 */
export function renderStoryboardSkeleton(todayIso) {
  const [year, month] = todayIso.split("-").map(Number);
  const monthName = MONTH_NAMES[month - 1];
  return `# Storyboard — ${year} ${monthName}

## Challenge

> [Set during the planning meeting.]

## Target Condition

**Due:** ${endOfMonthIso(todayIso)}

> [Set during the planning meeting.]

## Current Condition

**Last updated:** ${todayIso}

### Headlines

None.

## Obstacles

### Active

<!-- obstacles:open Do not edit. Auto-generated. -->
<!-- /obstacles -->

### Concluded (last 7 days)

<!-- obstacles:closed Do not edit. Auto-generated. -->
<!-- /obstacles -->

## Experiments

### Active

<!-- experiments:open Do not edit. Auto-generated. -->
<!-- /experiments -->

### Concluded (last 7 days)

<!-- experiments:closed Do not edit. Auto-generated. -->
<!-- /experiments -->
`;
}
