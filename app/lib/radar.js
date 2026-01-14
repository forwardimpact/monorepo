/**
 * Radar chart visualization using SVG
 */

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

  /**
   * Render the radar chart
   */
  render() {
    this.container.innerHTML = "";

    // Create SVG
    this.svg = this.createSvg();

    // Draw concentric rings
    this.drawLevels();

    // Draw axes
    this.drawAxes();

    // Draw data polygon
    this.drawDataPolygon();

    // Draw data points
    this.drawDataPoints();

    // Add labels
    if (this.options.showLabels) {
      this.drawLabels();
    }

    // Add tooltip container
    if (this.options.showTooltips) {
      this.createTooltip();
    }

    this.container.appendChild(this.svg);
  }

  /**
   * Create the SVG element
   * @returns {SVGElement}
   */
  createSvg() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    // Add padding around the chart to prevent label cutoff
    const padding = 40;
    const totalSize = this.options.size + padding * 2;
    svg.setAttribute("width", totalSize);
    svg.setAttribute("height", totalSize);
    svg.setAttribute(
      "viewBox",
      `${-padding} ${-padding} ${totalSize} ${totalSize}`,
    );
    svg.classList.add("radar-chart");
    return svg;
  }

  /**
   * Draw concentric level rings
   */
  drawLevels() {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add("radar-levels");

    for (let level = 1; level <= this.options.levels; level++) {
      const levelRadius = (this.radius * level) / this.options.levels;
      const points = this.data.map((_, i) => {
        const angle = this.angleSlice * i - Math.PI / 2;
        return {
          x: this.center + levelRadius * Math.cos(angle),
          y: this.center + levelRadius * Math.sin(angle),
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
      polygon.classList.add("radar-level");
      polygon.style.fill = "none";
      polygon.style.stroke = "#e2e8f0";
      polygon.style.strokeWidth = "1";
      group.appendChild(polygon);

      // Add level label
      const labelX = this.center + 5;
      const labelY = this.center - levelRadius + 4;
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

    this.svg.appendChild(group);
  }

  /**
   * Draw axis lines
   */
  drawAxes() {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add("radar-axes");

    this.data.forEach((_, i) => {
      const angle = this.angleSlice * i - Math.PI / 2;
      const x = this.center + this.radius * Math.cos(angle);
      const y = this.center + this.radius * Math.sin(angle);

      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      );
      line.setAttribute("x1", this.center);
      line.setAttribute("y1", this.center);
      line.setAttribute("x2", x);
      line.setAttribute("y2", y);
      line.classList.add("radar-axis");
      line.style.stroke = "#cbd5e1";
      line.style.strokeWidth = "1";
      group.appendChild(line);
    });

    this.svg.appendChild(group);
  }

  /**
   * Draw the data polygon
   */
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

  /**
   * Draw data points
   */
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

  /**
   * Draw axis labels
   */
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
      text.style.textAnchor = this.getTextAnchor(angle);
      text.style.dominantBaseline = "middle";

      // Split long labels into multiple lines
      const lines = this.wrapLabel(d.label, 12);
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
   * Wrap label text into multiple lines
   * @param {string} text
   * @param {number} maxCharsPerLine
   * @returns {string[]}
   */
  wrapLabel(text, maxCharsPerLine) {
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
  getTextAnchor(angle) {
    const degrees = (angle * 180) / Math.PI + 90;
    if (degrees > 45 && degrees < 135) return "start";
    if (degrees > 225 && degrees < 315) return "end";
    return "middle";
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

  /**
   * Create tooltip element
   */
  createTooltip() {
    this.tooltip = document.createElement("div");
    this.tooltip.className = "radar-tooltip";
    this.tooltip.style.cssText = `
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
      max-width: 200px;
    `;
    this.container.style.position = "relative";
    this.container.appendChild(this.tooltip);
  }

  /**
   * Show tooltip
   * @param {MouseEvent} event
   * @param {RadarDataPoint} data
   */
  showTooltip(event, data) {
    if (!this.tooltip) return;

    const rect = this.container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    this.tooltip.innerHTML = `
      <strong>${data.label}</strong><br>
      Value: ${data.value}/${data.maxValue}
      ${data.description ? `<br><small>${data.description}</small>` : ""}
    `;

    this.tooltip.style.left = `${x + 10}px`;
    this.tooltip.style.top = `${y - 10}px`;
    this.tooltip.style.opacity = "1";
  }

  /**
   * Hide tooltip
   */
  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.style.opacity = "0";
    }
  }

  /**
   * Update data and re-render
   * @param {RadarDataPoint[]} newData
   */
  update(newData) {
    this.data = newData;
    this.angleSlice = (Math.PI * 2) / this.data.length;
    this.render();
  }
}

/**
 * Comparison Radar Chart - displays two overlaid radar charts
 */
export class ComparisonRadarChart {
  /**
   * @param {Object} config
   * @param {HTMLElement} config.container
   * @param {RadarDataPoint[]} config.currentData
   * @param {RadarDataPoint[]} config.targetData
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

  /**
   * Render the comparison radar chart
   */
  render() {
    this.container.innerHTML = "";

    // Create SVG
    this.svg = this.createSvg();

    // Draw concentric rings
    this.drawLevels();

    // Draw axes
    this.drawAxes();

    // Draw target polygon (behind)
    this.drawDataPolygon(this.targetData, this.options.targetColor, 0.2);

    // Draw current polygon (in front)
    this.drawDataPolygon(this.currentData, this.options.currentColor, 0.3);

    // Draw target points
    this.drawDataPoints(this.targetData, this.options.targetColor, "target");

    // Draw current points
    this.drawDataPoints(this.currentData, this.options.currentColor, "current");

    // Add labels
    if (this.options.showLabels) {
      this.drawLabels();
    }

    // Add tooltip container
    if (this.options.showTooltips) {
      this.createTooltip();
    }

    this.container.appendChild(this.svg);
  }

  /**
   * Create the SVG element
   * @returns {SVGElement}
   */
  createSvg() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const padding = 40;
    const totalSize = this.options.size + padding * 2;
    svg.setAttribute("width", totalSize);
    svg.setAttribute("height", totalSize);
    svg.setAttribute(
      "viewBox",
      `${-padding} ${-padding} ${totalSize} ${totalSize}`,
    );
    svg.classList.add("radar-chart", "comparison-radar-chart");
    return svg;
  }

  /**
   * Draw concentric level rings
   */
  drawLevels() {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add("radar-levels");

    for (let level = 1; level <= this.options.levels; level++) {
      const levelRadius = (this.radius * level) / this.options.levels;
      const points = this.currentData.map((_, i) => {
        const angle = this.angleSlice * i - Math.PI / 2;
        return {
          x: this.center + levelRadius * Math.cos(angle),
          y: this.center + levelRadius * Math.sin(angle),
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
      polygon.classList.add("radar-level");
      polygon.style.fill = "none";
      polygon.style.stroke = "#e2e8f0";
      polygon.style.strokeWidth = "1";
      group.appendChild(polygon);

      // Add level label
      const labelX = this.center + 5;
      const labelY = this.center - levelRadius + 4;
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

    this.svg.appendChild(group);
  }

  /**
   * Draw axis lines
   */
  drawAxes() {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add("radar-axes");

    this.currentData.forEach((_, i) => {
      const angle = this.angleSlice * i - Math.PI / 2;
      const x = this.center + this.radius * Math.cos(angle);
      const y = this.center + this.radius * Math.sin(angle);

      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      );
      line.setAttribute("x1", this.center);
      line.setAttribute("y1", this.center);
      line.setAttribute("x2", x);
      line.setAttribute("y2", y);
      line.classList.add("radar-axis");
      line.style.stroke = "#cbd5e1";
      line.style.strokeWidth = "1";
      group.appendChild(line);
    });

    this.svg.appendChild(group);
  }

  /**
   * Draw a data polygon
   * @param {RadarDataPoint[]} data
   * @param {string} color
   * @param {number} opacity
   */
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

  /**
   * Draw data points
   * @param {RadarDataPoint[]} data
   * @param {string} color
   * @param {string} type
   */
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

  /**
   * Draw axis labels
   */
  drawLabels() {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add("radar-labels");

    this.currentData.forEach((d, i) => {
      const targetD = this.targetData[i];
      const angle = this.angleSlice * i - Math.PI / 2;
      const labelRadius = this.radius + this.options.labelOffset;
      const x = this.center + labelRadius * Math.cos(angle);
      const y = this.center + labelRadius * Math.sin(angle);

      // Check if there's a difference
      const diff = targetD.value - d.value;
      const hasDiff = diff !== 0;

      const text = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      text.setAttribute("x", x);
      text.setAttribute("y", y);
      text.classList.add("radar-label");
      if (hasDiff) text.classList.add("has-change");
      text.style.fontSize = "11px";
      text.style.fill = hasDiff
        ? diff > 0
          ? "#059669"
          : "#dc2626"
        : "#475569";
      text.style.fontWeight = hasDiff ? "600" : "400";
      text.style.textAnchor = this.getTextAnchor(angle);
      text.style.dominantBaseline = "middle";

      // Create label with change indicator
      let labelText = d.label;
      if (hasDiff) {
        labelText += ` (${diff > 0 ? "+" : ""}${diff})`;
      }

      const lines = this.wrapLabel(labelText, 15);
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
        text.addEventListener("mouseenter", (e) =>
          this.showComparisonTooltip(e, d, targetD),
        );
        text.addEventListener("mouseleave", () => this.hideTooltip());
      }

      group.appendChild(text);
    });

    this.svg.appendChild(group);
  }

  /**
   * Wrap label text into multiple lines
   */
  wrapLabel(text, maxCharsPerLine) {
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
   */
  getTextAnchor(angle) {
    const degrees = (angle * 180) / Math.PI + 90;
    if (degrees > 45 && degrees < 135) return "start";
    if (degrees > 225 && degrees < 315) return "end";
    return "middle";
  }

  /**
   * Create tooltip element
   */
  createTooltip() {
    this.tooltip = document.createElement("div");
    this.tooltip.className = "radar-tooltip";
    this.tooltip.style.cssText = `
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
      max-width: 250px;
    `;
    this.container.style.position = "relative";
    this.container.appendChild(this.tooltip);
  }

  /**
   * Show tooltip for a single data point
   */
  showTooltip(event, data, type) {
    if (!this.tooltip) return;

    const rect = this.container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const typeLabel = type === "current" ? "Current" : "Target";

    this.tooltip.innerHTML = `
      <strong>${data.label}</strong><br>
      ${typeLabel}: ${data.value}/${data.maxValue}
      ${data.description ? `<br><small>${data.description}</small>` : ""}
    `;

    this.tooltip.style.left = `${x + 10}px`;
    this.tooltip.style.top = `${y - 10}px`;
    this.tooltip.style.opacity = "1";
  }

  /**
   * Show comparison tooltip
   */
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
      <strong>${currentData.label}</strong><br>
      Current: ${currentData.value}/${currentData.maxValue}<br>
      Target: ${targetData.value}/${targetData.maxValue}<br>
      ${diffText}
    `;

    this.tooltip.style.left = `${x + 10}px`;
    this.tooltip.style.top = `${y - 10}px`;
    this.tooltip.style.opacity = "1";
  }

  /**
   * Hide tooltip
   */
  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.style.opacity = "0";
    }
  }
}
