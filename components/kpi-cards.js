/**
 * Component: KPI Cards
 * Renders executive KPI cards with delta, icon and optional footer note.
 */
(function (global) {
  "use strict";

  function formatValue(v, format) {
    if (format === "currency") return "$" + Number(v).toLocaleString("en-US");
    if (format === "currency-compact") {
      const n = Number(v);
      if (n >= 1000000) return "$" + (n / 1000000).toFixed(2) + "M";
      if (n >= 1000) return "$" + (n / 1000).toFixed(0) + "K";
      return "$" + n;
    }
    if (format === "percent") return Number(v).toFixed(1) + "%";
    if (format === "multiplier") return Number(v).toFixed(1) + "x";
    return Number(v).toLocaleString("en-US");
  }

  /**
   * config: { icon, label, value, format, delta, deltaLabel, tint, foot }
   */
  function kpiCard(config) {
    const deltaDir = config.delta > 0 ? "up" : config.delta < 0 ? "down" : "up";
    const deltaIcon = deltaDir === "up" ? "trending-up" : "trending-down";
    const deltaHtml = (config.delta !== undefined && config.delta !== null)
      ? `<span class="kpi-delta ${deltaDir}"><i data-lucide="${deltaIcon}" style="width:12px;height:12px"></i>${Math.abs(config.delta)}${config.deltaSuffix || "%"}</span>`
      : "";

    return `
    <div class="card kpi-card interactive" style="--kpi-tint:${config.tint || 'rgba(119,184,42,0.16)'}">
      <div class="kpi-top">
        <div class="kpi-icon" style="--kpi-bg:${config.iconBg || 'rgba(119,184,42,0.14)'};--kpi-fg:${config.iconFg || 'var(--secondary)'}">
          <i data-lucide="${config.icon}"></i>
        </div>
        ${deltaHtml}
      </div>
      <div class="kpi-value">${formatValue(config.value, config.format)}</div>
      <div class="kpi-label">${config.label}</div>
      ${config.foot ? `<div class="kpi-foot">${config.foot}</div>` : ""}
    </div>`;
  }

  function kpiGrid(items) {
    return `<div class="kpi-grid">${items.map(kpiCard).join("")}</div>`;
  }

  global.DGL_UI = global.DGL_UI || {};
  global.DGL_UI.kpiCard = kpiCard;
  global.DGL_UI.kpiGrid = kpiGrid;
  global.DGL_UI.formatValue = formatValue;
})(window);
