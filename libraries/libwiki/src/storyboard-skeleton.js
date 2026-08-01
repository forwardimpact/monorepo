/**
 * The storyboard skeleton is the minimal, valid storyboard file that
 * `gemba-wiki refresh` writes when the current-month board does not yet exist.
 * It carries only the structural surface libwiki owns: the five Toyota Kata
 * sections and the generic `obstacles`/`experiments` issue-list marker blocks
 * that refresh renders from tracker state.
 *
 * This skeleton deliberately omits the per-agent `#### {metric}` XmR blocks.
 * Each installation curates which metric belongs to which agent, so libwiki
 * cannot infer the pairs. A participant seeds each missing marker pair (see the
 * kata-session skill). A later refresh renders it. Section budgets and prose
 * for authors ("write the challenge here") stay in the skill's
 * `storyboard-template.md`, the L4 authoring layer. The skeleton itself carries
 * no content.
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
 * Return the last calendar day of the month that holds `todayIso` (ISO
 * `YYYY-MM-DD`). The function uses pure integer and calendar math. It uses no
 * `Date`, so the module stays free of ambient time deps.
 */
function endOfMonthIso(todayIso) {
  const [year, month] = todayIso.split("-").map(Number);
  const lastDay =
    month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

/**
 * Render the minimal storyboard skeleton for the month that holds `todayIso`.
 * The function is pure. It takes the day as an ISO string and returns
 * markdown. The heading reads `# Storyboard — {YYYY} {Month}`. The marker
 * blocks match the syntax the scanner (`marker-scanner.js`) and renderer
 * (`commands/refresh.js`) expect.
 *
 * @param {string} todayIso - ISO date string (`YYYY-MM-DD`).
 * @returns {string} The skeleton markdown, newline-terminated.
 */
export function renderStoryboardSkeleton(todayIso) {
  const [year, month] = todayIso.split("-").map(Number);
  const monthName = MONTH_NAMES[month - 1];
  return `# Storyboard — ${year} ${monthName}

## Challenge

> [product-manager sets this in the planning meeting.]

## Target Condition

**Due:** ${endOfMonthIso(todayIso)}

> [product-manager sets this in the planning meeting.]

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
