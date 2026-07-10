/**
 * Component: Smart Tables
 * Renders a data table with sticky header + a parallel mobile card list
 * (CSS toggles which one is visible depending on breakpoint).
 *
 * config = {
 *   columns: [{ key, label, render?(row), sortable? }],
 *   rows: [...],
 *   rowActions?: (row) => htmlString,
 *   mobileTitle: (row) => string,
 *   mobilePrimaryRows: [{ key, label, render?(row) }]
 * }
 */
(function (global) {
  "use strict";

  function cell(col, row) {
    if (col.render) return col.render(row);
    const val = row[col.key];
    return val === null || val === undefined || val === "" ? '<span class="text-muted">—</span>' : val;
  }

  function dataTable(config) {
    const { columns, rows } = config;
    if (!rows || !rows.length) {
      return global.DGL_UI.emptyState({
        icon: "inbox",
        title: "Sin registros",
        text: "No hay datos que coincidan con los filtros seleccionados."
      });
    }

    const thead = columns.map((c) => `<th class="${c.sortable ? "sortable" : ""}" ${c.sortable ? `data-sort-key="${c.key}"` : ""}>${c.label}${c.sortable ? ' <i data-lucide="chevrons-up-down" style="width:11px;height:11px;display:inline;vertical-align:-1px;opacity:.5"></i>' : ""}</th>`).join("");

    const tbody = rows.map((row) => {
      const tds = columns.map((c) => `<td class="${c.primary ? "cell-primary" : ""}">${cell(c, row)}</td>`).join("");
      const actionsTd = config.rowActions ? `<td><div class="cell-actions">${config.rowActions(row)}</div></td>` : "";
      return `<tr data-row-id="${row.id || ""}">${tds}${actionsTd}</tr>`;
    }).join("");

    const desktopTable = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>${thead}${config.rowActions ? "<th></th>" : ""}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>`;

    const mobileCards = `
    <div class="mobile-card-list">
      ${rows.map((row) => {
        const title = config.mobileTitle ? config.mobileTitle(row) : (row.name || row.title || row.id);
        const primaryRows = (config.mobilePrimaryRows || columns.slice(0, 4)).map((c) => `
          <div class="mr-row"><span class="mr-label">${c.label}</span><span>${cell(c, row)}</span></div>
        `).join("");
        return `
        <div class="mobile-record-card" data-row-id="${row.id || ""}">
          <div class="mr-top"><span class="mr-title">${title}</span>${row.status ? `<span class="badge badge-muted">${row.status}</span>` : ""}</div>
          ${primaryRows}
          ${config.rowActions ? `<div class="mr-actions">${config.rowActions(row)}</div>` : ""}
        </div>`;
      }).join("")}
    </div>`;

    return desktopTable + mobileCards;
  }

  global.DGL_UI = global.DGL_UI || {};
  global.DGL_UI.dataTable = dataTable;
})(window);
