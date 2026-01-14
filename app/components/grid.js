/**
 * Grid components and utilities
 *
 * This module provides reusable grid components that wrap the CSS grid utilities.
 * All grids use the unified CSS classes: auto-grid-xs, auto-grid-sm, auto-grid-md, auto-grid-lg
 *
 * Grid sizes:
 * - xs: 150px min column width (compact stats, small cards)
 * - sm: 200px min column width (form controls, medium cards)
 * - md: 300px min column width (detail items, content cards)
 * - lg: 400px min column width (large content like radar charts)
 */

import { div } from "../lib/render.js";

/**
 * Grid size options
 * @typedef {'xs' | 'sm' | 'md' | 'lg'} GridSize
 */

/**
 * Gap size options
 * @typedef {'sm' | 'md' | 'lg' | 'xl'} GapSize
 */

/**
 * Create an auto-fit grid container
 * @param {GridSize} size - Grid size variant (xs, sm, md, lg)
 * @param {HTMLElement[]} children - Child elements to place in grid
 * @param {Object} [options] - Optional configuration
 * @param {string} [options.className] - Additional CSS classes
 * @param {GapSize} [options.gap] - Override default gap (sm, md, lg, xl)
 * @returns {HTMLElement}
 */
export function createAutoGrid(size, children, options = {}) {
  const { className = "", gap } = options;
  const classes = [`auto-grid-${size}`, gap ? `gap-${gap}` : "", className]
    .filter(Boolean)
    .join(" ");

  return div({ className: classes }, ...children);
}

/**
 * Create a fixed-column grid container
 * @param {2 | 3 | 6} columns - Number of columns
 * @param {HTMLElement[]} children - Child elements to place in grid
 * @param {Object} [options] - Optional configuration
 * @param {string} [options.className] - Additional CSS classes
 * @returns {HTMLElement}
 */
export function createFixedGrid(columns, children, options = {}) {
  const { className = "" } = options;
  const classes = ["grid", `grid-${columns}`, className]
    .filter(Boolean)
    .join(" ");

  return div({ className: classes }, ...children);
}

/**
 * Create a grid for form selectors (discipline/grade/track dropdowns)
 * Uses auto-grid-sm (200px min)
 * @param {HTMLElement[]} children - Form control elements
 * @returns {HTMLElement}
 */
export function createSelectorGrid(children) {
  return createAutoGrid("sm", children, { gap: "lg" });
}

/**
 * Create a grid for detail items (key-value pairs)
 * Uses auto-grid-md (300px min)
 * @param {HTMLElement[]} children - Detail item elements
 * @returns {HTMLElement}
 */
export function createDetailGrid(children) {
  return createAutoGrid("md", children);
}

/**
 * Create a grid for radar charts or large content
 * Uses auto-grid-lg (400px min)
 * @param {HTMLElement[]} children - Large content elements
 * @returns {HTMLElement}
 */
export function createRadarGrid(children) {
  return createAutoGrid("lg", children);
}

/**
 * Create a grid for compact stats
 * Uses auto-grid-xs (150px min)
 * @param {HTMLElement[]} children - Stat elements
 * @returns {HTMLElement}
 */
export function createStatsGrid(children) {
  return createAutoGrid("xs", children);
}

/**
 * Create a grid for card-like items (tips, expectations)
 * Uses auto-grid-sm (200px min)
 * @param {HTMLElement[]} children - Card elements
 * @returns {HTMLElement}
 */
export function createCardGrid(children) {
  return createAutoGrid("sm", children);
}
