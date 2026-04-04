/**
 * Shared utilities for radar chart visualizations
 */

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Wrap label text into multiple lines
 * @param {string} text
 * @param {number} maxCharsPerLine
 * @returns {string[]}
 */
export function wrapLabel(text, maxCharsPerLine) {
  if (text.length <= maxCharsPerLine) return [text];

  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    if (currentLine.length === 0) {
      currentLine = word;
    } else if (currentLine.length + 1 + word.length <= maxCharsPerLine) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [text];
}

/**
 * Get text anchor based on angle
 * @param {number} angle
 * @returns {string}
 */
export function getTextAnchor(angle) {
  const degrees = (angle * 180) / Math.PI + 90;
  if (degrees > 45 && degrees < 135) return "start";
  if (degrees > 225 && degrees < 315) return "end";
  return "middle";
}

/**
 * Create an SVG element with standard radar chart dimensions
 * @param {number} size
 * @param {string[]} [extraClasses]
 * @returns {SVGElement}
 */
export function createRadarSvg(size, extraClasses = []) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const padding = 40;
  const totalSize = size + padding * 2;
  svg.setAttribute("width", totalSize);
  svg.setAttribute("height", totalSize);
  svg.setAttribute(
    "viewBox",
    `${-padding} ${-padding} ${totalSize} ${totalSize}`,
  );
  svg.classList.add("radar-chart", ...extraClasses);
  return svg;
}

/**
 * Draw concentric level rings on a radar chart
 * @param {SVGElement} svg
 * @param {Object} params
 * @param {number} params.levels
 * @param {number} params.radius
 * @param {number} params.center
 * @param {number} params.angleSlice
 * @param {number} params.dataLength
 */
export function drawLevelRings(
  svg,
  { levels, radius, center, angleSlice, dataLength },
) {
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.classList.add("radar-levels");

  for (let level = 1; level <= levels; level++) {
    const levelRadius = (radius * level) / levels;
    const points = [];
    for (let i = 0; i < dataLength; i++) {
      const angle = angleSlice * i - Math.PI / 2;
      points.push({
        x: center + levelRadius * Math.cos(angle),
        y: center + levelRadius * Math.sin(angle),
      });
    }

    const polygon = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "polygon",
    );
    polygon.setAttribute(
      "points",
      points.map((p) => `${p.x},${p.y}`).join(" "),
    );
    polygon.classList.add("radar-level");
    polygon.style.fill = "none";
    polygon.style.stroke = "#e2e8f0";
    polygon.style.strokeWidth = "1";
    group.appendChild(polygon);

    const labelX = center + 5;
    const labelY = center - levelRadius + 4;
    const label = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text",
    );
    label.setAttribute("x", labelX);
    label.setAttribute("y", labelY);
    label.textContent = level;
    label.classList.add("radar-level-label");
    label.style.fontSize = "10px";
    label.style.fill = "#94a3b8";
    group.appendChild(label);
  }

  svg.appendChild(group);
}

/**
 * Draw axis lines on a radar chart
 * @param {SVGElement} svg
 * @param {Object} params
 * @param {number} params.radius
 * @param {number} params.center
 * @param {number} params.angleSlice
 * @param {number} params.dataLength
 */
export function drawAxisLines(svg, { radius, center, angleSlice, dataLength }) {
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.classList.add("radar-axes");

  for (let i = 0; i < dataLength; i++) {
    const angle = angleSlice * i - Math.PI / 2;
    const x = center + radius * Math.cos(angle);
    const y = center + radius * Math.sin(angle);

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", center);
    line.setAttribute("y1", center);
    line.setAttribute("x2", x);
    line.setAttribute("y2", y);
    line.classList.add("radar-axis");
    line.style.stroke = "#cbd5e1";
    line.style.strokeWidth = "1";
    group.appendChild(line);
  }

  svg.appendChild(group);
}

/**
 * Create a tooltip element for radar charts
 * @param {HTMLElement} container
 * @param {number} [maxWidth=200]
 * @returns {HTMLDivElement}
 */
export function createRadarTooltip(container, maxWidth = 200) {
  const tooltip = document.createElement("div");
  tooltip.className = "radar-tooltip";
  tooltip.style.cssText = `
    position: absolute;
    background: #1e293b;
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s;
    z-index: 100;
    max-width: ${maxWidth}px;
  `;
  container.style.position = "relative";
  container.appendChild(tooltip);
  return tooltip;
}
