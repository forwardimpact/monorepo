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
    // Handle gained skills (new in target role)
    if (item.isGained) {
      if (isSkill) {
        return tr(
          { className: "change-gained" },
          td(
            {},
            a({ href: `#/skill/${item.id}` }, item.name),
            span({ className: "gained-badge" }, "NEW"),
          ),
          td({}, createBadge(item.capability, item.capability)),
          td({}, createBadge(formatLevel(item.type), item.type)),
          createEmptyLevelCell(),
          createLevelCell(item.targetIndex, maxLevels, item.targetLevel),
          td(
            { className: "change-cell change-gained" },
            span({ className: "change-indicator" }, "+"),
          ),
        );
      } else {
        return tr(
          { className: "change-gained" },
          td(
            {},
            a({ href: `#/behaviour/${item.id}` }, item.name),
            span({ className: "gained-badge" }, "NEW"),
          ),
          createEmptyLevelCell(),
          createLevelCell(item.targetIndex, maxLevels, item.targetLevel),
          td(
            { className: "change-cell change-gained" },
            span({ className: "change-indicator" }, "+"),
          ),
        );
      }
    }

    // Handle lost skills (removed in target role)
    if (item.isLost) {
      if (isSkill) {
        return tr(
          { className: "change-lost" },
          td(
            {},
            a({ href: `#/skill/${item.id}` }, item.name),
            span({ className: "lost-badge" }, "REMOVED"),
          ),
          td({}, createBadge(item.capability, item.capability)),
          td({}, createBadge(formatLevel(item.type), item.type)),
          createLevelCell(item.currentIndex, maxLevels, item.currentLevel),
          createEmptyLevelCell(),
          td(
            { className: "change-cell change-lost" },
            span({ className: "change-indicator" }, "−"),
          ),
        );
      } else {
        return tr(
          { className: "change-lost" },
          td(
            {},
            a({ href: `#/behaviour/${item.id}` }, item.name),
            span({ className: "lost-badge" }, "REMOVED"),
          ),
          createLevelCell(item.currentIndex, maxLevels, item.currentLevel),
          createEmptyLevelCell(),
          td(
            { className: "change-cell change-lost" },
            span({ className: "change-indicator" }, "−"),
          ),
        );
      }
    }

    // Normal change (both current and target exist)
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
    } else {
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
  };

  const skillHeaders = tr(
    {},
    th({}, isSkill ? "Skill" : "Behaviour"),
    ...(isSkill ? [th({}, "Capability"), th({}, "Type")] : []),
    th({}, "Current"),
    th({}, "Target"),
    th({}, "Change"),
  );

  const content = [];

  // Show new skills first (in target role but not current)
  if (gained.length > 0) {
    content.push(
      div(
        { className: "progression-group" },
        div(
          { className: "progression-group-header gained-header" },
          span({ className: "group-icon" }, "➕"),
          span(
            {},
            `${gained.length} new ${type}${gained.length > 1 ? "s" : ""}`,
          ),
        ),
        div(
          { className: "table-container" },
          table(
            {
              className: `table progression-table ${isSkill ? "skill-table" : "behaviour-table"}`,
            },
            thead({}, skillHeaders),
            tbody({}, ...gained.map(createRow)),
          ),
        ),
      ),
    );
  }

  // Show level changes
  if (changesRequired.length > 0) {
    content.push(
      div(
        { className: "progression-group" },
        div(
          { className: "progression-group-header" },
          span({ className: "group-icon" }, "📈"),
          span(
            {},
            `${changesRequired.length} ${type}${changesRequired.length > 1 ? "s" : ""} need growth`,
          ),
        ),
        div(
          { className: "table-container" },
          table(
            {
              className: `table progression-table ${isSkill ? "skill-table" : "behaviour-table"}`,
            },
            thead({}, skillHeaders),
            tbody({}, ...changesRequired.map(createRow)),
          ),
        ),
      ),
    );
  }

  // Show removed skills (in current role but not target)
  if (lost.length > 0) {
    content.push(
      div(
        { className: "progression-group" },
        div(
          { className: "progression-group-header lost-header" },
          span({ className: "group-icon" }, "➖"),
          span(
            {},
            `${lost.length} ${type}${lost.length > 1 ? "s" : ""} removed`,
          ),
        ),
        div(
          { className: "table-container" },
          table(
            {
              className: `table progression-table ${isSkill ? "skill-table" : "behaviour-table"}`,
            },
            thead({}, skillHeaders),
            tbody({}, ...lost.map(createRow)),
          ),
        ),
      ),
    );
  }

  // Show no changes (collapsed by default)
  if (noChanges.length > 0) {
    const noChangeHeaders = tr(
      {},
      th({}, isSkill ? "Skill" : "Behaviour"),
      ...(isSkill ? [th({}, "Capability"), th({}, "Type")] : []),
      th({}, "Current"),
      th({}, "Target"),
      th({}, "Change"),
    );

    const detailsId = `no-changes-${type}-${Date.now()}`;
    content.push(
      div(
        { className: "progression-group no-change-group" },
        createCollapsibleHeader(
          detailsId,
          `${noChanges.length} ${type}${noChanges.length > 1 ? "s" : ""} unchanged`,
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
              {
                className: `table progression-table ${isSkill ? "skill-table" : "behaviour-table"}`,
              },
              thead({}, noChangeHeaders),
              tbody({}, ...noChanges.map(createRow)),
            ),
          ),
        ),
      ),
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
