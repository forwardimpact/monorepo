/**
 * Radar chart visualization using SVG
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

// Re-export ComparisonRadarChart so existing imports keep working
export { ComparisonRadarChart } from "./comparison-radar-chart.js";

/**
 * @typedef {Object} RadarDataPoint
 * @property {string} label - Label for this axis
 * @property {number} value - Current value
 * @property {number} maxValue - Maximum possible value
 * @property {string} [description] - Optional description for tooltip
 */

/**
 * @typedef {Object} RadarOptions
 * @property {number} [levels=5] - Number of concentric rings
 * @property {string} [color='#3b82f6'] - Fill color
 * @property {string} [strokeColor='#2563eb'] - Stroke color
 * @property {boolean} [showLabels=true] - Show axis labels
 * @property {boolean} [showTooltips=true] - Enable tooltips
 * @property {number} [size=400] - Chart size in pixels
 * @property {number} [labelOffset=25] - Distance of labels from edge
 */

export class RadarChart {
  /**
   * @param {Object} config
   * @param {HTMLElement} config.container
   * @param {RadarDataPoint[]} config.data
   * @param {RadarOptions} [config.options]
   */
  constructor({ container, data, options = {} }) {
    this.container = container;
    this.data = data;
    this.options = {
      levels: options.levels || 5,
      color: options.color || "#3b82f6",
      strokeColor: options.strokeColor || "#2563eb",
      showLabels: options.showLabels !== false,
      showTooltips: options.showTooltips !== false,
      size: options.size || 400,
      labelOffset: options.labelOffset || 50,
    };

    this.center = this.options.size / 2;
    this.radius = this.options.size / 2 - this.options.labelOffset - 20;
    this.angleSlice = (Math.PI * 2) / this.data.length;

    this.svg = null;
    this.tooltip = null;
  }

  render() {
    this.container.innerHTML = "";

    this.svg = createRadarSvg(this.options.size);

    const sharedParams = {
      radius: this.radius,
      center: this.center,
      angleSlice: this.angleSlice,
      dataLength: this.data.length,
    };

    drawLevelRings(this.svg, { ...sharedParams, levels: this.options.levels });
    drawAxisLines(this.svg, sharedParams);

    this.drawDataPolygon();
    this.drawDataPoints();

    if (this.options.showLabels) this.drawLabels();
    if (this.options.showTooltips) {
      this.tooltip = createRadarTooltip(this.container);
    }

    this.container.appendChild(this.svg);
  }

  drawDataPolygon() {
    const points = this.data.map((d, i) => {
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
    polygon.style.fill = this.options.color;
    polygon.style.fillOpacity = "0.3";
    polygon.style.stroke = this.options.strokeColor;
    polygon.style.strokeWidth = "2";

    this.svg.appendChild(polygon);
  }

  drawDataPoints() {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add("radar-points");

    this.data.forEach((d, i) => {
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
      circle.setAttribute("r", 5);
      circle.classList.add("radar-point");
      circle.style.fill = this.options.strokeColor;
      circle.style.stroke = "#fff";
      circle.style.strokeWidth = "2";
      circle.style.cursor = "pointer";

      if (this.options.showTooltips) {
        circle.addEventListener("mouseenter", (e) => this.showTooltip(e, d));
        circle.addEventListener("mouseleave", () => this.hideTooltip());
      }

      group.appendChild(circle);
    });

    this.svg.appendChild(group);
  }

  drawLabels() {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add("radar-labels");

    this.data.forEach((d, i) => {
      const angle = this.angleSlice * i - Math.PI / 2;
      const labelRadius = this.radius + this.options.labelOffset;
      const x = this.center + labelRadius * Math.cos(angle);
      const y = this.center + labelRadius * Math.sin(angle);

      const text = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      text.setAttribute("x", x);
      text.setAttribute("y", y);
      text.classList.add("radar-label");
      text.style.fontSize = "11px";
      text.style.fill = "#475569";
      text.style.textAnchor = getTextAnchor(angle);
      text.style.dominantBaseline = "middle";

      const lines = wrapLabel(d.label, 12);
      const lineHeight = 13;
      const offsetY = -((lines.length - 1) * lineHeight) / 2;

      lines.forEach((line, lineIndex) => {
        const tspan = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "tspan",
        );
        tspan.setAttribute("x", x);
        tspan.setAttribute("dy", lineIndex === 0 ? offsetY : lineHeight);
        tspan.textContent = line;
        text.appendChild(tspan);
      });

      if (this.options.showTooltips) {
        text.style.cursor = "pointer";
        text.addEventListener("mouseenter", (e) => this.showTooltip(e, d));
        text.addEventListener("mouseleave", () => this.hideTooltip());
      }

      group.appendChild(text);
    });

    this.svg.appendChild(group);
  }

  /**
   * Truncate label text
   * @param {string} text
   * @param {number} maxLength
   * @returns {string}
   */
  truncateLabel(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 1) + "…";
  }

  showTooltip(event, data) {
    if (!this.tooltip) return;

    const rect = this.container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    this.tooltip.innerHTML = `
      <strong>${escapeHtml(data.label)}</strong><br>
      Value: ${data.value}/${data.maxValue}
      ${data.description ? `<br><small>${escapeHtml(data.description)}</small>` : ""}
    `;

    this.tooltip.style.left = `${x + 10}px`;
    this.tooltip.style.top = `${y - 10}px`;
    this.tooltip.style.opacity = "1";
  }

  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.style.opacity = "0";
    }
  }

  update(newData) {
    this.data = newData;
    this.angleSlice = (Math.PI * 2) / this.data.length;
    this.render();
  }
}
