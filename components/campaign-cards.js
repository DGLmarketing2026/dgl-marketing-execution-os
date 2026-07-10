/**
 * Component: Campaign Cards
 * Renders an actionable campaign card with objective, segment, owner,
 * channel, KPI, expected result and a primary CTA.
 */
(function (global) {
  "use strict";

  const STATUS_BADGE = {
    "Active": "badge-success",
    "Scheduled": "badge-info",
    "Draft": "badge-muted",
    "Completed": "badge-muted",
    "Paused": "badge-warning"
  };

  function campaignCard(c) {
    const badgeClass = STATUS_BADGE[c.status] || "badge-muted";
    return `
    <div class="card campaign-card interactive" data-campaign-id="${c.id}">
      <div class="campaign-card-top">
        <div>
          <span class="tag" style="margin-bottom:8px;display:inline-block">${c.type}</span>
          <h4>${c.name}</h4>
        </div>
        <span class="badge ${badgeClass}">${c.status}</span>
      </div>
      <p class="text-secondary" style="font-size:12.5px;line-height:1.5">${c.objective}</p>
      <div class="campaign-meta">
        <span class="meta-item"><i data-lucide="target"></i>${c.segment}</span>
        <span class="meta-item"><i data-lucide="user"></i>${c.owner}</span>
        <span class="meta-item"><i data-lucide="radio"></i>${c.channel}</span>
        <span class="meta-item"><i data-lucide="calendar"></i>${c.startDate}</span>
      </div>
      <div class="divider" style="margin:4px 0"></div>
      <div style="display:flex;gap:16px">
        <div style="flex:1">
          <div class="text-muted" style="font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">KPI Principal</div>
          <div style="font-size:12.5px;font-weight:600">${c.kpi}</div>
        </div>
        <div style="flex:1">
          <div class="text-muted" style="font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Resultado Esperado</div>
          <div style="font-size:12.5px;font-weight:600;color:var(--secondary)">${c.expectedResult}</div>
        </div>
      </div>
      <div class="campaign-card-foot">
        <div class="campaign-next"><i data-lucide="arrow-right-circle" style="width:13px;height:13px;display:inline;vertical-align:-2px;color:var(--muted)"></i> <strong>Próximo:</strong> ${c.nextAction}</div>
      </div>
      <button class="btn btn-secondary btn-sm w-full" data-action="open-campaign" data-id="${c.id}">${c.cta} <i data-lucide="arrow-right"></i></button>
    </div>`;
  }

  function campaignGrid(list) {
    if (!list.length) {
      return global.DGL_UI.emptyState({
        icon: "megaphone",
        title: "No hay campañas en este segmento",
        text: "Ajusta los filtros o crea una nueva campaña para este objetivo comercial."
      });
    }
    return `<div class="grid-cards">${list.map(campaignCard).join("")}</div>`;
  }

  global.DGL_UI = global.DGL_UI || {};
  global.DGL_UI.campaignCard = campaignCard;
  global.DGL_UI.campaignGrid = campaignGrid;
})(window);
