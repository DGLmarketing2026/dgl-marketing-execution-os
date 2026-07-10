/**
 * Component: Filters + shared small UI helpers (empty states, skeletons).
 *
 * filterBar config = {
 *   searchPlaceholder,
 *   selects: [{ key, label, options: [string] }],
 *   resultCount
 * }
 */
(function (global) {
  "use strict";

  function filterBar(config) {
    const selects = (config.selects || []).map((s) => `
      <select class="filter-select" data-filter-key="${s.key}">
        <option value="">${s.label}: Todos</option>
        ${s.options.map((o) => `<option value="${o}">${o}</option>`).join("")}
      </select>
    `).join("");

    return `
    <div class="filter-bar" data-filter-scope="${config.scope || ""}">
      <div class="filter-search">
        <i data-lucide="search" style="width:15px;height:15px;color:var(--muted)"></i>
        <input type="text" placeholder="${config.searchPlaceholder || "Buscar..."}" data-filter-key="search" />
      </div>
      ${selects}
      <span class="filter-count" data-filter-count>${config.resultCount !== undefined ? config.resultCount + " resultados" : ""}</span>
    </div>`;
  }

  function emptyState({ icon, title, text, actionHtml }) {
    return `
    <div class="empty-state">
      <div class="icon-wrap"><i data-lucide="${icon || "inbox"}" style="width:24px;height:24px;color:var(--muted)"></i></div>
      <h4>${title}</h4>
      <p>${text || ""}</p>
      ${actionHtml || ""}
    </div>`;
  }

  function skeletonKpis(count) {
    return `<div class="kpi-grid">${Array.from({ length: count || 4 }).map(() => `<div class="skeleton skeleton-kpi"></div>`).join("")}</div>`;
  }

  function skeletonRows(count) {
    return Array.from({ length: count || 5 }).map(() => `<div class="skeleton skeleton-row"></div>`).join("");
  }

  /**
   * Generic client-side filtering used by module controllers.
   * dataset: array of objects
   * state: { search: string, [selectKey]: string }
   * fieldMap: { search: [keys to search in], selectKey: dataKey }
   */
  function applyFilters(dataset, state, fieldMap) {
    return dataset.filter((item) => {
      if (state.search) {
        const q = state.search.toLowerCase();
        const searchable = (fieldMap.search || []).map((k) => String(item[k] || "").toLowerCase());
        if (!searchable.some((v) => v.includes(q))) return false;
      }
      for (const key of Object.keys(state)) {
        if (key === "search" || !state[key]) continue;
        const dataKey = (fieldMap.selects && fieldMap.selects[key]) || key;
        const val = item[dataKey];
        if (Array.isArray(val)) {
          if (!val.includes(state[key])) return false;
        } else if (String(val) !== String(state[key])) {
          return false;
        }
      }
      return true;
    });
  }

  global.DGL_UI = global.DGL_UI || {};
  global.DGL_UI.filterBar = filterBar;
  global.DGL_UI.emptyState = emptyState;
  global.DGL_UI.skeletonKpis = skeletonKpis;
  global.DGL_UI.skeletonRows = skeletonRows;
  global.DGL_UI.applyFilters = applyFilters;
})(window);
