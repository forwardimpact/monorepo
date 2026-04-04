/**
 * Progression table component
 * Displays skill or behaviour changes between current and target levels
 */

/** @typedef {import('../types.js').SkillChangeItem} SkillChangeItem */
/** @typedef {import('../types.js').BehaviourChangeItem} BehaviourChangeItem */

import {
  div,
  table,
  thead,
  tbody,
  tr,
  th,
  td,
  a,
  span,
} from "../lib/render.js";
import { formatLevel } from "../lib/render.js";
import { createLevelCell, createEmptyLevelCell } from "./detail.js";
import { createBadge } from "./card.js";

/**
 * Create a row for a gained (new) item
 */
function createGainedRow(item, isSkill, maxLevels) {
  const nameCell = td(
    {},
    a({ href: `#/${isSkill ? "skill" : "behaviour"}/${item.id}` }, item.name),
    span({ className: "gained-badge" }, "NEW"),
  );
  const changeCell = td(
    { className: "change-cell change-gained" },
    span({ className: "change-indicator" }, "+"),
  );
  if (isSkill) {
    return tr(
      { className: "change-gained" },
      nameCell,
      td({}, createBadge(item.capability, item.capability)),
      td({}, createBadge(formatLevel(item.type), item.type)),
      createEmptyLevelCell(),
      createLevelCell(item.targetIndex, maxLevels, item.targetLevel),
      changeCell,
    );
  }
  return tr(
    { className: "change-gained" },
    nameCell,
    createEmptyLevelCell(),
    createLevelCell(item.targetIndex, maxLevels, item.targetLevel),
    changeCell,
  );
}

/**
 * Create a row for a lost (removed) item
 */
function createLostRow(item, isSkill, maxLevels) {
  const nameCell = td(
    {},
    a({ href: `#/${isSkill ? "skill" : "behaviour"}/${item.id}` }, item.name),
    span({ className: "lost-badge" }, "REMOVED"),
  );
  const changeCell = td(
    { className: "change-cell change-lost" },
    span({ className: "change-indicator" }, "−"),
  );
  if (isSkill) {
    return tr(
      { className: "change-lost" },
      nameCell,
      td({}, createBadge(item.capability, item.capability)),
      td({}, createBadge(formatLevel(item.type), item.type)),
      createLevelCell(item.currentIndex, maxLevels, item.currentLevel),
      createEmptyLevelCell(),
      changeCell,
    );
  }
  return tr(
    { className: "change-lost" },
    nameCell,
    createLevelCell(item.currentIndex, maxLevels, item.currentLevel),
    createEmptyLevelCell(),
    changeCell,
  );
}

/**
 * Create a row for a normal change item
 */
function createChangeRow(item, isSkill, maxLevels) {
  const changeClass =
    item.change > 0
      ? "change-up"
      : item.change < 0
        ? "change-down"
        : "change-same";
  const changeIcon = item.change > 0 ? "↑" : item.change < 0 ? "↓" : "—";
  const changeText =
    item.change !== 0 ? `${changeIcon} ${Math.abs(item.change)}` : "—";

  if (isSkill) {
    return tr(
      { className: changeClass },
      td({}, a({ href: `#/skill/${item.id}` }, item.name)),
      td({}, createBadge(item.capability, item.capability)),
      td({}, createBadge(formatLevel(item.type), item.type)),
      createLevelCell(item.currentIndex, maxLevels, item.currentLevel),
      createLevelCell(item.targetIndex, maxLevels, item.targetLevel),
      td(
        { className: `change-cell ${changeClass}` },
        span({ className: "change-indicator" }, changeText),
      ),
    );
  }
  return tr(
    { className: changeClass },
    td({}, a({ href: `#/behaviour/${item.id}` }, item.name)),
    createLevelCell(item.currentIndex, maxLevels, item.currentLevel),
    createLevelCell(item.targetIndex, maxLevels, item.targetLevel),
    td(
      { className: `change-cell ${changeClass}` },
      span({ className: "change-indicator" }, changeText),
    ),
  );
}

/**
 * Pluralize a type name
 * @param {string} type
 * @param {number} count
 * @returns {string}
 */
function pluralize(type, count) {
  return count > 1 ? `${type}s` : type;
}

/**
 * Create a progression group with header and table
 * @param {Object} params
 * @param {Array} params.items
 * @param {string} params.icon
 * @param {string} params.label
 * @param {string} [params.headerClass]
 * @param {string} params.tableClass
 * @param {HTMLElement} params.headers
 * @param {Function} params.createRow
 * @returns {HTMLElement}
 */
function createProgressionGroup({
  items,
  icon,
  label,
  headerClass,
  tableClass,
  headers,
  createRow,
}) {
  return div(
    { className: "progression-group" },
    div(
      { className: `progression-group-header ${headerClass || ""}`.trim() },
      span({ className: "group-icon" }, icon),
      span({}, label),
    ),
    div(
      { className: "table-container" },
      table(
        { className: tableClass },
        thead({}, headers),
        tbody({}, ...items.map(createRow)),
      ),
    ),
  );
}

/**
 * Create a collapsible group for unchanged items
 * @param {Object} params
 * @param {Array} params.items
 * @param {string} params.type
 * @param {boolean} params.isSkill
 * @param {string} params.tableClass
 * @param {Function} params.createRow
 * @returns {HTMLElement}
 */
function createCollapsibleGroup({
  items,
  type,
  isSkill,
  tableClass,
  createRow,
}) {
  const noChangeHeaders = tr(
    {},
    th({}, isSkill ? "Skill" : "Behaviour"),
    ...(isSkill ? [th({}, "Capability"), th({}, "Type")] : []),
    th({}, "Current"),
    th({}, "Target"),
    th({}, "Change"),
  );

  const detailsId = `no-changes-${type}-${Date.now()}`;
  return div(
    { className: "progression-group no-change-group" },
    createCollapsibleHeader(
      detailsId,
      `${items.length} ${pluralize(type, items.length)} unchanged`,
      "✓",
    ),
    div(
      {
        className: "collapsible-content",
        id: detailsId,
        style: "display: none",
      },
      div(
        { className: "table-container" },
        table(
          { className: tableClass },
          thead({}, noChangeHeaders),
          tbody({}, ...items.map(createRow)),
        ),
      ),
    ),
  );
}

/**
 * Create a progression table showing changes
 * @param {SkillChangeItem[]|BehaviourChangeItem[]} changes - Array of change objects
 * @param {'skill'|'behaviour'} type - Type of changes
 * @returns {HTMLElement}
 */
export function createProgressionTable(changes, type = "skill") {
  if (!changes || changes.length === 0) {
    return div({ className: "empty-state" }, "No changes required");
  }

  const isSkill = type === "skill";
  const maxLevels = 5;

  // Separate into changes, gained, lost, and no-changes
  const gained = changes.filter((c) => c.isGained);
  const lost = changes.filter((c) => c.isLost);
  const changesRequired = changes.filter(
    (c) => c.change !== 0 && !c.isGained && !c.isLost,
  );
  const noChanges = changes.filter((c) => c.change === 0);

  const createRow = (item) => {
    if (item.isGained) {
      return createGainedRow(item, isSkill, maxLevels);
    }
    if (item.isLost) {
      return createLostRow(item, isSkill, maxLevels);
    }
    return createChangeRow(item, isSkill, maxLevels);
  };

  const skillHeaders = tr(
    {},
    th({}, isSkill ? "Skill" : "Behaviour"),
    ...(isSkill ? [th({}, "Capability"), th({}, "Type")] : []),
    th({}, "Current"),
    th({}, "Target"),
    th({}, "Change"),
  );

  const tableClass = `table progression-table ${isSkill ? "skill-table" : "behaviour-table"}`;
  const content = [];

  if (gained.length > 0) {
    content.push(
      createProgressionGroup({
        items: gained,
        icon: "➕",
        label: `${gained.length} new ${pluralize(type, gained.length)}`,
        headerClass: "gained-header",
        tableClass,
        headers: skillHeaders,
        createRow,
      }),
    );
  }

  if (changesRequired.length > 0) {
    content.push(
      createProgressionGroup({
        items: changesRequired,
        icon: "📈",
        label: `${changesRequired.length} ${pluralize(type, changesRequired.length)} need growth`,
        tableClass,
        headers: skillHeaders,
        createRow,
      }),
    );
  }

  if (lost.length > 0) {
    content.push(
      createProgressionGroup({
        items: lost,
        icon: "➖",
        label: `${lost.length} ${pluralize(type, lost.length)} removed`,
        headerClass: "lost-header",
        tableClass,
        headers: skillHeaders,
        createRow,
      }),
    );
  }

  if (noChanges.length > 0) {
    content.push(
      createCollapsibleGroup({
        items: noChanges,
        type,
        isSkill,
        tableClass,
        createRow,
      }),
    );
  }

  return div({ className: "progression-tables" }, ...content);
}

/**
 * Create a collapsible header
 */
function createCollapsibleHeader(targetId, text, icon) {
  const header = div(
    { className: "progression-group-header collapsible-header" },
    span({ className: "group-icon" }, icon),
    span({}, text),
    span({ className: "collapse-indicator" }, "▶"),
  );

  header.style.cursor = "pointer";
  header.addEventListener("click", () => {
    const content = document.getElementById(targetId);
    const indicator = header.querySelector(".collapse-indicator");
    if (content.style.display === "none") {
      content.style.display = "block";
      indicator.textContent = "▼";
    } else {
      content.style.display = "none";
      indicator.textContent = "▶";
    }
  });

  return header;
}
