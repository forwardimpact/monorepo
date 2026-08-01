/**
 * Comparison Radar Chart - displays two overlaid radar charts
 */

import {
  escapeHtml,
  wrapLabel,
  getTextAnchor,
  createRadarSvg,
  drawLevelRings,
  drawAxisLines,
  createRadarTooltip,
} from "./radar-utils.js";

/**
 * Resolve the fill color for a label based on the diff direction.
 * @param {number} diff - target minus current value
 * @returns {string} CSS color
 */
function diffColor(diff) {
  if (diff > 0) return "#059669";
  if (diff < 0) return "#dc2626";
  return "#475569";
}

/**
 * Create a styled SVG <text> element for one radar label. The element carries
 * the diff annotation. It wraps long text across multiple tspan lines.
 */
function createLabelElement(x, y, angle, label, diff) {
  const hasDiff = diff !== 0;

  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute("x", x);
  text.setAttribute("y", y);
  text.classList.add("radar-label");
  if (hasDiff) text.classList.add("has-change");
  text.style.fontSize = "11px";
  text.style.fill = diffColor(diff);
  text.style.fontWeight = hasDiff ? "600" : "400";
  text.style.textAnchor = getTextAnchor(angle);
  text.style.dominantBaseline = "middle";

  let labelText = label;
  if (hasDiff) {
    labelText += ` (${diff > 0 ? "+" : ""}${diff})`;
  }

  const lines = wrapLabel(labelText, 15);
  const lineHeight = 13;
  const offsetY = -((lines.length - 1) * lineHeight) / 2;

  for (const [lineIndex, line] of lines.entries()) {
    const tspan = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "tspan",
    );
    tspan.setAttribute("x", x);
    tspan.setAttribute("dy", lineIndex === 0 ? offsetY : lineHeight);
    tspan.textContent = line;
    text.appendChild(tspan);
  }

  return text;
}

/** SVG radar chart that overlays current and target data polygons for side-by-side comparison. */
export class ComparisonRadarChart {
  /**
   * @param {Object} config
   * @param {HTMLElement} config.container
   * @param {import('./radar.js').RadarDataPoint[]} config.currentData
   * @param {import('./radar.js').RadarDataPoint[]} config.targetData
   * @param {Object} [config.options]
   */
  constructor({ container, currentData, targetData, options = {} }) {
    this.container = container;
    this.currentData = currentData;
    this.targetData = targetData;
    this.options = {
      levels: options.levels || 5,
      currentColor: options.currentColor || "#3b82f6",
      targetColor: options.targetColor || "#10b981",
      showLabels: options.showLabels !== false,
      showTooltips: options.showTooltips !== false,
      size: options.size || 400,
      labelOffset: options.labelOffset || 50,
    };

    this.center = this.options.size / 2;
    this.radius = this.options.size / 2 - this.options.labelOffset - 20;
    this.angleSlice = (Math.PI * 2) / this.currentData.length;

    this.svg = null;
    this.tooltip = null;
  }

  /** Clear the container. Draw the full comparison radar chart with rings, axes, polygons, and labels. */
  render() {
    this.container.innerHTML = "";

    this.svg = createRadarSvg(this.options.size, ["comparison-radar-chart"]);

    const sharedParams = {
      radius: this.radius,
      center: this.center,
      angleSlice: this.angleSlice,
      dataLength: this.currentData.length,
    };

    drawLevelRings(this.svg, { ...sharedParams, levels: this.options.levels });
    drawAxisLines(this.svg, sharedParams);

    this.drawDataPolygon(this.targetData, this.options.targetColor, 0.2);
    this.drawDataPolygon(this.currentData, this.options.currentColor, 0.3);
    this.drawDataPoints(this.targetData, this.options.targetColor, "target");
    this.drawDataPoints(this.currentData, this.options.currentColor, "current");

    if (this.options.showLabels) this.drawLabels();
    if (this.options.showTooltips) {
      this.tooltip = createRadarTooltip(this.container, 250);
    }

    this.container.appendChild(this.svg);
  }

  /** Draw a filled SVG polygon that connects the data points at their scaled positions on the radar. */
  drawDataPolygon(data, color, opacity) {
    const points = data.map((d, i) => {
      const angle = this.angleSlice * i - Math.PI / 2;
      const value = d.value / d.maxValue;
      const r = this.radius * value;
      return {
        x: this.center + r * Math.cos(angle),
        y: this.center + r * Math.sin(angle),
      };
    });

    const polygon = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "polygon",
    );
    polygon.setAttribute(
      "points",
      points.map((p) => `${p.x},${p.y}`).join(" "),
    );
    polygon.classList.add("radar-data");
    polygon.style.fill = color;
    polygon.style.fillOpacity = String(opacity);
    polygon.style.stroke = color;
    polygon.style.strokeWidth = "2";

    this.svg.appendChild(polygon);
  }

  /** Draw interactive SVG circles at each data point position, with optional tooltips. */
  drawDataPoints(data, color, type) {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add("radar-points", `radar-points-${type}`);

    data.forEach((d, i) => {
      const angle = this.angleSlice * i - Math.PI / 2;
      const value = d.value / d.maxValue;
      const r = this.radius * value;
      const x = this.center + r * Math.cos(angle);
      const y = this.center + r * Math.sin(angle);

      const circle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      circle.setAttribute("cx", x);
      circle.setAttribute("cy", y);
      circle.setAttribute("r", 4);
      circle.classList.add("radar-point");
      circle.style.fill = color;
      circle.style.stroke = "#fff";
      circle.style.strokeWidth = "2";
      circle.style.cursor = "pointer";

      if (this.options.showTooltips) {
        circle.addEventListener("mouseenter", (e) =>
          this.showTooltip(e, d, type),
        );
        circle.addEventListener("mouseleave", () => this.hideTooltip());
      }

      group.appendChild(circle);
    });

    this.svg.appendChild(group);
  }

  /** Draw axis labels with color-coded diff annotations. Each annotation shows the gap between current and target. */
  drawLabels() {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add("radar-labels");

    this.currentData.forEach((d, i) => {
      const targetD = this.targetData[i];
      const angle = this.angleSlice * i - Math.PI / 2;
      const labelRadius = this.radius + this.options.labelOffset;
      const x = this.center + labelRadius * Math.cos(angle);
      const y = this.center + labelRadius * Math.sin(angle);

      const diff = targetD.value - d.value;
      const text = createLabelElement(x, y, angle, d.label, diff);

      if (this.options.showTooltips) {
        text.style.cursor = "pointer";
        text.addEventListener("mouseenter", (e) =>
          this.showComparisonTooltip(e, d, targetD),
        );
        text.addEventListener("mouseleave", () => this.hideTooltip());
      }

      group.appendChild(text);
    });

    this.svg.appendChild(group);
  }

  /** Position a tooltip. Show the value for one current or target data point. */
  showTooltip(event, data, type) {
    if (!this.tooltip) return;

    const rect = this.container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const typeLabel = type === "current" ? "Current" : "Target";

    this.tooltip.innerHTML = `
      <strong>${escapeHtml(data.label)}</strong><br>
      ${typeLabel}: ${data.value}/${data.maxValue}
      ${data.description ? `<br><small>${escapeHtml(data.description)}</small>` : ""}
    `;

    this.tooltip.style.left = `${x + 10}px`;
    this.tooltip.style.top = `${y - 10}px`;
    this.tooltip.style.opacity = "1";
  }

  /** Position a tooltip. Compare the current and target values with a directional diff indicator. */
  showComparisonTooltip(event, currentData, targetData) {
    if (!this.tooltip) return;

    const rect = this.container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const diff = targetData.value - currentData.value;
    const diffText =
      diff > 0
        ? `<span style="color: #10b981">↑ ${diff} level${diff > 1 ? "s" : ""}</span>`
        : diff < 0
          ? `<span style="color: #ef4444">↓ ${Math.abs(diff)} level${Math.abs(diff) > 1 ? "s" : ""}</span>`
          : "<span style='color: #94a3b8'>No change</span>";

    this.tooltip.innerHTML = `
      <strong>${escapeHtml(currentData.label)}</strong><br>
      Current: ${currentData.value}/${currentData.maxValue}<br>
      Target: ${targetData.value}/${targetData.maxValue}<br>
      ${diffText}
    `;

    this.tooltip.style.left = `${x + 10}px`;
    this.tooltip.style.top = `${y - 10}px`;
    this.tooltip.style.opacity = "1";
  }

  /** Fade out the active tooltip element. */
  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.style.opacity = "0";
    }
  }
}
