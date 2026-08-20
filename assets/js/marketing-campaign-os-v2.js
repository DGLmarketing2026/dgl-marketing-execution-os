/**
 * DGL Marketing Campaign OS V2
 * Turns NOVA/Salesforce signals into audiences, campaigns, channels and attribution.
 */
(function (global) {
  "use strict";

  const VERSION = "2.0";
  const D = () => global.DGL_DATA || {};
  const UI = () => global.DGL_UI || {};
  const esc = (v) => String(v == null ? "" : v)
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const n = (v) => Number(v || 0);

  function moneyCompact(v) {
    const x = n(v);
    if (x >= 1000000) return "$" + (x / 1000000).toFixed(2).replace(/\.00$/,"") + "M";
    if (x >= 1000) return "$" + Math.round(x / 1000) + "K";
    return "$" + Math.round(x).toLocaleString("en-US");
  }

  function customerSource() {
    return Array.isArray(D().customers) ? D().customers : [];
  }
  function quoteSource() {
    return Array.isArray(D().quotedNotBooked) ? D().quotedNotBooked : [];
  }
  function campaignSource() {
    return Array.isArray(D().campaigns) ? D().campaigns : [];
  }
  function servicesOf(c) {
    if (Array.isArray(c.servicesUsed)) return c.servicesUsed;
    return String(c.servicesUsed || "").split(",").map(x => x.trim()).filter(Boolean);
  }
  function status(c) { return String(c.status || "").toLowerCase(); }
  function daysLoad(c) {
    if (c.liveDaysSinceLastLoad != null) return n(c.liveDaysSinceLastLoad);
    if (c.daysSinceLastLoad != null) return n(c.daysSinceLastLoad);
    if (!c.lastLoadDate) return 999;
    const d = new Date(c.lastLoadDate + "T12:00:00");
    return Number.isNaN(d.getTime()) ? 999 : Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
  }
  function quoteService(q) { return String(q.service || "").toLowerCase(); }
  function hasService(c, service) {
    const target = service.toLowerCase();
    return servicesOf(c).some(s => String(s).toLowerCase().includes(target));
  }
  function isReactivation(c, minDays) {
    return daysLoad(c) >= minDays || /inactive|dormant/.test(status(c));
  }
  function isAtRisk(c) {
    return /risk/.test(status(c));
  }
  function crossSellEligible(c) {
    const rec = String(c.recommendedService || "").trim();
    return !!rec && !servicesOf(c).some(s => String(s).toLowerCase() === rec.toLowerCase());
  }

  function pageHead(title, lede, eyebrow, actionHtml) {
    return `
      <div class="page-head">
        <div>
          <div class="eyebrow">${esc(eyebrow || "Marketing Campaign OS")}</div>
          <h2>${esc(title)}</h2>
          <p class="lede">${esc(lede)}</p>
        </div>
        <div class="page-head-actions">
          ${actionHtml || ""}
          <span class="badge badge-success">NOVA-LED · V${VERSION}</span>
        </div>
      </div>`;
  }

  function dataModeBadge() {
    const live = !!(D().meta && D().meta.liveSync);
    return live
      ? '<span class="badge badge-success">SALESFORCE / NOVA · LIVE</span>'
      : '<span class="badge badge-muted">LOCAL / DEMO DATA</span>';
  }

  function buildAudiences() {
    const customers = customerSource();
    const quotes = quoteSource();
    const active = customers.filter(c => status(c) === "active");
    const re60 = customers.filter(c => isReactivation(c, 60));
    const re90 = customers.filter(c => isReactivation(c, 90));
    const risk = customers.filter(isAtRisk);
    const cross = customers.filter(crossSellEligible);
    const qnb0 = quotes.filter(q => n(q.daysNoResponse) <= 14);
    const qnb15 = quotes.filter(q => n(q.daysNoResponse) > 14 && n(q.daysNoResponse) <= 30);
    const qnb30 = quotes.filter(q => n(q.daysNoResponse) > 30);

    return [
      {
        id:"AUD-RE60", name:"Reactivation 60+", objective:"Reactivar cuentas existentes",
        source:"NOVA · reporteCuentas() + reporteMigracionTiers()", count:re60.length,
        rule:"60+ días sin carga o estado Inactive/Dormant", channel:"Email + Retargeting",
        campaignType:"Reactivación", service:"Multiservicio", records:re60
      },
      {
        id:"AUD-RE90", name:"Reactivation 90+", objective:"Recuperación de cuentas frías",
        source:"NOVA · reporteMigracionTiers()", count:re90.length,
        rule:"90+ días sin carga", channel:"Email + Nurture",
        campaignType:"Recuperación de Cuentas", service:"Multiservicio", records:re90
      },
      {
        id:"AUD-QNB14", name:"QNB 0–14 días", objective:"Recuperar cotizaciones recientes",
        source:"NOVA · closingRate() + reporteViernes()", count:qnb0.length,
        rule:"Cotización sin booking / respuesta dentro de 14 días", channel:"Email",
        campaignType:"Post-Cotización", service:"Por cotización", records:qnb0
      },
      {
        id:"AUD-QNB30", name:"QNB 15–30 días", objective:"Evitar enfriamiento de cotizaciones",
        source:"NOVA · closingRate()", count:qnb15.length,
        rule:"Cotización abierta entre 15 y 30 días", channel:"Email + Retargeting",
        campaignType:"Recuperación de Cotizaciones", service:"Por cotización", records:qnb15
      },
      {
        id:"AUD-QNBCOLD", name:"QNB 30+ días", objective:"Reabrir demanda dormida",
        source:"NOVA · closingRate()", count:qnb30.length,
        rule:"Cotización abierta por más de 30 días", channel:"Reactivation Email + Nurture",
        campaignType:"Recuperación de Cotizaciones", service:"Por cotización", records:qnb30
      },
      {
        id:"AUD-RISK", name:"Retention / At Risk", objective:"Prevenir pérdida de cuentas",
        source:"NOVA · reporteCuentas() + reporteMigracionTiers()", count:risk.length,
        rule:"Cuenta marcada At Risk o caída de actividad", channel:"Email + Content",
        campaignType:"Retención", service:"Multiservicio", records:risk
      },
      {
        id:"AUD-XSELL", name:"Cross-Sell Eligible", objective:"Desarrollar servicios dentro de la cartera",
        source:"NOVA/Salesforce + validación del área", count:cross.length,
        rule:"Servicio recomendado no utilizado actualmente", channel:"Email + Landing",
        campaignType:"Cross Selling", service:"Multiservicio", records:cross
      },
      {
        id:"AUD-NURTURE", name:"Existing Account Nurture", objective:"Mantener relevancia en cartera activa",
        source:"NOVA · ficha mensual + clientes recurrentes", count:active.length,
        rule:"Cuenta activa sin trigger urgente", channel:"Email + LinkedIn + Content",
        campaignType:"Nurture", service:"Multiservicio", records:active
      }
    ];
  }

  function serviceStats(service) {
    const customers = customerSource();
    const quotes = quoteSource();
    const qnb = quotes.filter(q => quoteService(q).includes(service.toLowerCase()));
    const reactivation = customers.filter(c => hasService(c, service) && isReactivation(c, 45));
    const active = customers.filter(c => hasService(c, service) && status(c) === "active");
    const crossSell = customers.filter(c => {
      const rec = String(c.recommendedService || "").toLowerCase();
      return rec.includes(service.toLowerCase()) && !hasService(c, service);
    });
    return { qnb:qnb.length, reactivation:reactivation.length, active:active.length, crossSell:crossSell.length };
  }

  function novaSignals() {
    return [
      { report:"closingRate()", signal:"Cotizaciones frías", marketing:"QNB Recovery", note:"Segmentar por antigüedad y servicio; el catálogo reporta un volumen relevante de 30+ días." },
      { report:"reporteCuentas()", signal:"Cuentas en riesgo / sin seguimiento", marketing:"Reactivation / Retention", note:"Excluir cobranza y cuentas con gestión activa antes de activar campañas." },
      { report:"reporteMigracionTiers()", signal:"Caída o recuperación de tier", marketing:"Retention Trigger", note:"La reacción debe ocurrir antes de que la cuenta se enfríe por completo." },
      { report:"reporteFichaClientes()", signal:"Perfil por cliente y branch", marketing:"Personalización", note:"Usar contexto de servicio y actividad para evitar mensajes genéricos." },
      { report:"reporteEmbudoComercial()", signal:"Quote → Load y arrastre", marketing:"Attribution", note:"Drayage requiere atribución 1 quote → N loads, no una relación 1:1." },
      { report:"reporteLanes()", signal:"Corredores fuertes", marketing:"Lane Campaigns", note:"Convertir lanes relevantes en mensajes y landings específicas." }
    ];
  }

  function audienceTable(audiences) {
    return `
      <div class="card" style="overflow:auto">
        <table class="data-table">
          <thead><tr><th>Audiencia</th><th>Fuente NOVA</th><th>Regla</th><th>Registros</th><th>Canal</th><th></th></tr></thead>
          <tbody>
            ${audiences.map(a => `
              <tr>
                <td><strong>${esc(a.name)}</strong><div class="text-muted" style="font-size:11px">${esc(a.objective)}</div></td>
                <td><span class="badge badge-info">${esc(a.source)}</span></td>
                <td>${esc(a.rule)}</td>
                <td><strong>${a.count}</strong></td>
                <td>${esc(a.channel)}</td>
                <td><button class="btn btn-sm" data-action="open-create-campaign" data-preset="${esc(a.campaignType)}">Crear campaña</button></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }

  function renderCommandCenter(container) {
    const audiences = buildAudiences();
    const customers = customerSource();
    const campaigns = campaignSource();
    const activeCampaigns = campaigns.filter(c => String(c.status).toLowerCase() === "active").length;
    const audienceVolume = audiences.reduce((s,a) => s + a.count, 0);
    const reactivation = audiences.find(a => a.id === "AUD-RE60").count;
    const qnb = quoteSource().length;
    const atRisk = audiences.find(a => a.id === "AUD-RISK").count;

    container.innerHTML = `
      ${pageHead(
        "DGL Marketing Campaign Command Center",
        "NOVA y Salesforce identifican las audiencias; Marketing convierte esas señales en campañas externas, automatizadas y medibles.",
        "Revenue Activation",
        `<button class="btn btn-primary" data-mco-sync><i data-lucide="refresh-cw"></i>Actualizar desde NOVA</button>`
      )}
      <div style="display:flex;justify-content:flex-end;margin:-4px 0 12px">${dataModeBadge()}</div>

      ${UI().kpiGrid ? UI().kpiGrid([
        {icon:"users", label:"Cuentas bajo gestión", value:customers.length, foot:"Cartera disponible para segmentación"},
        {icon:"database", label:"Registros en audiencias", value:audienceVolume, foot:"Una cuenta puede pertenecer a más de una audiencia"},
        {icon:"megaphone", label:"Campañas activas", value:activeCampaigns, foot:"Ejecución actual"},
        {icon:"refresh-cw", label:"Reactivation 60+", value:reactivation, foot:"Trigger de reactivación"},
      ]) : ""}

      <div style="height:16px"></div>
      ${UI().kpiGrid ? UI().kpiGrid([
        {icon:"file-warning", label:"Quoted Not Booked", value:qnb, foot:"Cotizaciones disponibles para recovery"},
        {icon:"shield-alert", label:"At Risk", value:atRisk, foot:"Cuentas para retention / nurture"},
        {icon:"layers-3", label:"Service Verticals", value:3, foot:"FTL · LTL · Drayage"},
        {icon:"radio", label:"Activation Channels", value:5, foot:"Email · Paid · Retargeting · LinkedIn · Landing"},
      ]) : ""}

      <div class="grid-2" style="margin-top:26px">
        <div class="card card-pad">
          <div class="section-heading" style="margin-top:0"><h3>NOVA → Marketing Activation</h3><span class="hint">Señales que se convierten en campañas</span></div>
          <div class="stack">
            ${audiences.slice(0,6).map(a => `
              <div class="flex justify-between items-center" style="padding:10px 0;border-bottom:1px solid var(--border);gap:12px">
                <div><strong>${esc(a.name)}</strong><div class="text-muted" style="font-size:11px">${esc(a.source)}</div></div>
                <div style="text-align:right"><strong style="font-size:18px">${a.count}</strong><div class="text-muted" style="font-size:10px">${esc(a.channel)}</div></div>
              </div>`).join("")}
          </div>
        </div>

        <div class="card card-pad">
          <div class="section-heading" style="margin-top:0"><h3>Marketing Operating Loop</h3><span class="hint">Modelo de trabajo</span></div>
          <div class="flow-strip" style="flex-wrap:wrap">
            ${[
              ["1","NOVA / Salesforce","Detecta"],
              ["2","Audience Engine","Segmenta"],
              ["3","Campaign Engine","Activa"],
              ["4","FTL/LTL/Drayage/AM","Convierte"],
              ["5","Salesforce","Registra"],
              ["6","Attribution","Mide revenue"]
            ].map((x,i)=>`
              <div class="flow-step" style="min-width:145px">
                <div class="flow-label">${x[0]}</div>
                <div class="flow-value">${x[1]}</div>
                <div class="text-muted" style="font-size:10px">${x[2]}</div>
              </div>${i<5?'<div class="flow-arrow"><i data-lucide="arrow-right"></i></div>':""}`).join("")}
          </div>
          <div class="card" style="margin-top:16px;padding:14px;border-color:rgba(119,184,42,.35)">
            <strong style="color:var(--secondary)">Principio operativo</strong>
            <p class="text-secondary" style="margin-top:6px">NOVA encuentra quién. Marketing decide cómo impactarlo. La automatización ejecuta. Salesforce registra qué ocurrió. Attribution demuestra el resultado.</p>
          </div>
        </div>
      </div>

      <div class="section-heading" style="margin-top:28px"><h3>Audiencias prioritarias</h3><span class="hint">Activables desde Marketing</span></div>
      ${audienceTable(audiences.slice(0,7))}
    `;
    if (global.lucide) global.lucide.createIcons();
  }

  function renderNOVAaudiences(container) {
    const audiences = buildAudiences();
    container.innerHTML = `
      ${pageHead(
        "NOVA Audience Engine",
        "Convierte reportes y señales de Salesforce en audiencias dinámicas para campañas. Marketing deja de construir listas manualmente.",
        "Audience Intelligence",
        `<button class="btn btn-primary" data-mco-sync><i data-lucide="refresh-cw"></i>Sincronizar</button>`
      )}
      <div style="display:flex;justify-content:flex-end;margin:-4px 0 12px">${dataModeBadge()}</div>
      ${UI().kpiGrid ? UI().kpiGrid([
        {icon:"database",label:"Audiencias configuradas",value:audiences.length,foot:"Triggers automáticos de Marketing"},
        {icon:"refresh-cw",label:"Reactivation",value:audiences.filter(a=>a.campaignType.includes("Reactiv")||a.campaignType.includes("Recuperación de Cuentas")).reduce((s,a)=>s+a.count,0)},
        {icon:"file-warning",label:"QNB",value:audiences.filter(a=>a.id.includes("QNB")).reduce((s,a)=>s+a.count,0)},
        {icon:"shuffle",label:"Cross-Sell",value:audiences.find(a=>a.id==="AUD-XSELL").count}
      ]) : ""}
      <div class="section-heading"><h3>Audiencias dinámicas</h3><span class="hint">Fuente → regla → campaña</span></div>
      ${audienceTable(audiences)}
      <div class="section-heading"><h3>Exclusiones obligatorias</h3><span class="hint">Gobernanza antes de activar</span></div>
      <div class="grid-3">
        ${[
          ["Cobranza","Excluir cuentas en gestión de cobro hasta que el estado permita contacto comercial."],
          ["Respuesta / Booking","Detener automáticamente la secuencia cuando Salesforce registre respuesta, Won/Booked o nueva carga."],
          ["Frecuencia","Aplicar frequency cap para evitar que una cuenta reciba Reactivation, QNB y Cross-Sell simultáneamente."]
        ].map(x=>`<div class="card card-pad"><div class="eyebrow">${x[0]}</div><p class="text-secondary" style="margin-top:7px">${x[1]}</p></div>`).join("")}
      </div>
      <div class="section-heading"><h3>Reportes NOVA que alimentan Marketing</h3><span class="hint">Catálogo de reportes → uso de campaña</span></div>
      <div class="card" style="overflow:auto"><table class="data-table"><thead><tr><th>Reporte</th><th>Señal</th><th>Uso en Marketing</th><th>Regla</th></tr></thead><tbody>
        ${novaSignals().map(s=>`<tr><td><strong>${esc(s.report)}</strong></td><td>${esc(s.signal)}</td><td><span class="badge badge-success">${esc(s.marketing)}</span></td><td>${esc(s.note)}</td></tr>`).join("")}
      </tbody></table></div>
    `;
    if (global.lucide) global.lucide.createIcons();
  }

  function serviceCard(service, title, description) {
    const s = serviceStats(service);
    return `
      <div class="card card-pad">
        <div class="flex justify-between items-center">
          <div><div class="eyebrow">${esc(service)} MARKETING</div><h3 style="font-size:20px;margin-top:5px">${esc(title)}</h3></div>
          <span class="badge badge-success">${s.qnb + s.reactivation + s.crossSell} signals</span>
        </div>
        <p class="text-secondary" style="margin-top:9px">${esc(description)}</p>
        <div class="grid-2" style="margin-top:15px">
          <div><div class="text-muted" style="font-size:10px">QNB</div><strong style="font-size:22px">${s.qnb}</strong></div>
          <div><div class="text-muted" style="font-size:10px">REACTIVATION</div><strong style="font-size:22px">${s.reactivation}</strong></div>
          <div><div class="text-muted" style="font-size:10px">ACTIVE BASE</div><strong style="font-size:22px">${s.active}</strong></div>
          <div><div class="text-muted" style="font-size:10px">CROSS-SELL</div><strong style="font-size:22px">${s.crossSell}</strong></div>
        </div>
        <div style="margin-top:15px"><a class="btn btn-primary btn-sm" href="#/${service.toLowerCase()}-marketing">Abrir vertical</a></div>
      </div>`;
  }

  function renderServiceOverview(container) {
    container.innerHTML = `
      ${pageHead("Service Campaign Overview","FTL, LTL y Drayage aparecen como verticales de Marketing: campañas externas, no dashboards operativos.","Service Marketing")}
      <div class="grid-3">
        ${serviceCard("FTL","FTL Campaign Engine","Reactivation, QNB, capacity/seasonal, retention y cross-sell sobre cuentas existentes.")}
        ${serviceCard("LTL","LTL Campaign Engine","Reactivation, QNB, education/nurture y cross-sell sobre audiencias validadas.")}
        ${serviceCard("Drayage","Drayage Campaign Engine","QNB, reactivation y campañas por puerto/mercado con atribución 1 quote → N loads.")}
      </div>
      <div class="section-heading"><h3>Qué hace Marketing</h3><span class="hint">Sin duplicar a las áreas</span></div>
      <div class="grid-3">
        ${[
          ["Audience","Recibe o construye la audiencia desde NOVA/Salesforce."],
          ["Activation","Define mensaje, creatividad, canal, secuencia, landing y CTA."],
          ["Measurement","Mide engagement, RFQ, carga y revenue atribuido/influenciado."]
        ].map(x=>`<div class="card card-pad"><div class="eyebrow">${x[0]}</div><p class="text-secondary" style="margin-top:8px">${x[1]}</p></div>`).join("")}
      </div>
    `;
    if (global.lucide) global.lucide.createIcons();
  }

  function renderServiceDetail(container, service) {
    const s = serviceStats(service);
    const isDrayage = service === "Drayage";
    const playbooks = service === "FTL" ? [
      ["FTL Reactivation 60","Historial FTL + 60 días sin carga","Email + retargeting","Volver a generar RFQ"],
      ["FTL QNB Recovery","Cotización FTL sin booking","Email contextual","Retomar cotización"],
      ["FTL Capacity / Seasonal","Cartera activa relevante","Email + landing","Activar demanda existente"],
      ["FTL Retention","Caída de frecuencia / tier","Nurture + contenido","Evitar enfriamiento"]
    ] : service === "LTL" ? [
      ["LTL Reactivation 60","Historial LTL + inactividad","Email sequence","Reactivar frecuencia"],
      ["LTL QNB Recovery","Cotización LTL sin booking","Email","Recuperar RFQ"],
      ["LTL Education","Cuentas existentes","Email + content","Mantener relevancia"],
      ["LTL Cross-Sell","Audiencia validada","Email + landing","Introducir servicio"]
    ] : [
      ["Drayage QNB Recovery","Cotización Drayage sin booking","Email + retargeting","Recuperar oportunidad"],
      ["Port Reactivation","Historial por puerto + inactividad","Email + landing","Reactivar movimiento"],
      ["Drayage + Inland","Audiencia validada","Email + landing","Expandir relación"],
      ["Port / Market Campaign","Miami, Houston, NY/NJ, LA/LB, etc.","Email + Paid","Activar demanda por mercado"]
    ];

    container.innerHTML = `
      ${pageHead(`${service} Marketing`, `Campañas de Marketing diseñadas para activar cuentas relacionadas con ${service}; el área operativa conserva la decisión y ejecución comercial.`, "Service Marketing",
        `<button class="btn btn-primary" data-action="open-create-campaign" data-preset="Por Tipo de Servicio"><i data-lucide="plus"></i>Nueva campaña ${service}</button>`)}
      ${UI().kpiGrid ? UI().kpiGrid([
        {icon:"file-warning",label:"QNB signals",value:s.qnb},
        {icon:"refresh-cw",label:"Reactivation signals",value:s.reactivation},
        {icon:"users",label:"Active base",value:s.active},
        {icon:"shuffle",label:"Cross-Sell signals",value:s.crossSell}
      ]) : ""}
      <div class="section-heading"><h3>Playbooks de campaña</h3><span class="hint">Audiencia → canal → objetivo</span></div>
      <div class="stack">
        ${playbooks.map(p=>`
          <div class="card card-pad">
            <div class="grid-4">
              <div><div class="text-muted" style="font-size:10px">CAMPAIGN</div><strong>${p[0]}</strong></div>
              <div><div class="text-muted" style="font-size:10px">AUDIENCE</div><span class="text-secondary">${p[1]}</span></div>
              <div><div class="text-muted" style="font-size:10px">CHANNEL</div><span class="text-secondary">${p[2]}</span></div>
              <div><div class="text-muted" style="font-size:10px">BUSINESS GOAL</div><span class="text-secondary">${p[3]}</span></div>
            </div>
          </div>`).join("")}
      </div>
      ${isDrayage ? `
        <div class="section-heading"><h3>Regla especial de atribución Drayage</h3><span class="hint">NOVA · reporteEmbudoComercial()</span></div>
        <div class="card card-pad" style="border-color:rgba(119,184,42,.35)">
          <div class="eyebrow">1 WON QUOTE → N LOADS</div>
          <h3 style="font-size:20px;margin-top:6px">No medir Drayage con una relación campaña → una carga.</h3>
          <p class="text-secondary" style="margin-top:7px">La atribución debe seguir las cargas posteriores vinculadas a la cotización ganada y acumular revenue durante la ventana definida.</p>
        </div>` : ""}
    `;
    if (global.lucide) global.lucide.createIcons();
  }

  function renderChannels(container) {
    const channels = [
      ["Email Marketing","Primary","Reactivation, QNB, nurture, cross-sell y service campaigns.","mail"],
      ["Paid / Retargeting","Amplifier","Reforzar exposición sobre cuentas y visitantes ya conocidos.","target"],
      ["LinkedIn","Account Reach","Contenido y paid account-based cuando sea viable.","linkedin"],
      ["Landing Pages","Conversion","Una landing por servicio/campaña con CTA y UTMs.","panels-top-left"],
      ["Content","Nurture","Casos, capacidades, temporadas y argumentos específicos.","file-text"]
    ];
    container.innerHTML = `
      ${pageHead("Channel Orchestration","Coordina canales alrededor de la misma audiencia. El objetivo no es publicar más, sino aumentar la probabilidad de respuesta de cuentas existentes.","Channels")}
      <div class="grid-3">
        ${channels.map(c=>`
          <div class="card card-pad">
            <div style="display:flex;justify-content:space-between;gap:12px">
              <div class="kpi-icon"><i data-lucide="${c[3]}"></i></div>
              <span class="badge badge-info">${c[1]}</span>
            </div>
            <h3 style="margin-top:12px">${c[0]}</h3>
            <p class="text-secondary" style="margin-top:7px">${c[2]}</p>
          </div>`).join("")}
      </div>
      <div class="section-heading"><h3>Journey recomendado</h3><span class="hint">Ejemplo multicanal</span></div>
      <div class="card card-pad"><div class="flow-strip" style="flex-wrap:wrap">
        ${[
          ["Día 0","Email","Activación"],
          ["Día 3–5","Paid / Retargeting","Refuerzo"],
          ["Día 7","Email #2","Prueba / capacidad"],
          ["Día 12–15","Content / Landing","Profundización"],
          ["Día 18–21","Direct CTA","RFQ"],
          ["Día 30","Nurture / Exit","Siguiente estado"]
        ].map((x,i)=>`<div class="flow-step" style="min-width:135px"><div class="flow-label">${x[0]}</div><div class="flow-value">${x[1]}</div><div class="text-muted" style="font-size:10px">${x[2]}</div></div>${i<5?'<div class="flow-arrow"><i data-lucide="arrow-right"></i></div>':""}`).join("")}
      </div></div>
    `;
    if (global.lucide) global.lucide.createIcons();
  }

  function campaignMetrics() {
    const cs = campaignSource();
    return cs.reduce((acc,c)=>{
      acc.sent += n(c.sent || c.emailsSent);
      acc.replies += n(c.replies || c.responsesLogged);
      acc.quotes += n(c.quotes);
      acc.loads += n(c.loads);
      acc.revenue += n(c.revenue);
      return acc;
    },{sent:0,replies:0,quotes:0,loads:0,revenue:0});
  }

  function renderAttribution(container) {
    const m = campaignMetrics();
    const analytics = D().analytics || {};
    const influenced = n(analytics.revenueInfluenced || m.revenue);
    container.innerHTML = `
      ${pageHead("Campaign Revenue Attribution","Conecta Campaign ID, respuesta, RFQ, carga y revenue. Las métricas de canal son diagnósticas; el cierre ejecutivo termina en negocio.","Analytics")}
      ${UI().kpiGrid ? UI().kpiGrid([
        {icon:"send",label:"Emails / Touches",value:m.sent,foot:"Actividad registrada"},
        {icon:"reply",label:"Responses",value:m.replies,foot:"Respuesta atribuible"},
        {icon:"file-text",label:"RFQs / Quotes",value:m.quotes,foot:"Oportunidades registradas"},
        {icon:"circle-dollar-sign",label:"Revenue Influenced",value:influenced,format:"currency-compact",foot:"Según Campaign / Analytics"}
      ]) : ""}
      <div class="section-heading"><h3>Modelo de atribución</h3><span class="hint">Definiciones de gobierno</span></div>
      <div class="grid-3">
        ${[
          ["GENERATED","La campaña origina la interacción que crea el RFQ u oportunidad."],
          ["INFLUENCED","La cuenta ya tenía actividad, pero recibió una campaña antes de la nueva acción comercial."],
          ["REACTIVATED","Una cuenta inactiva vuelve a cotizar o cargar dentro de la ventana definida."],
          ["CROSS-SELL","Primera oportunidad/carga de un servicio diferente posterior a la campaña."],
          ["UNATTRIBUTED","No existe evidencia suficiente para relacionar el resultado con Marketing."],
          ["DRAYAGE","Seguir revenue acumulado de N cargas posteriores a la quote ganada."]
        ].map(x=>`<div class="card card-pad"><div class="eyebrow">${x[0]}</div><p class="text-secondary" style="margin-top:7px">${x[1]}</p></div>`).join("")}
      </div>
      <div class="section-heading"><h3>Data contract mínimo</h3><span class="hint">Lo que debe regresar a Salesforce</span></div>
      <div class="card card-pad">
        <div class="grid-4">
          ${["Campaign ID","Account ID","Contact ID","Audience ID","Channel","First Touch","RFQ ID","Lane Quote ID","Load ID(s)","Service","Revenue","Attribution Type"].map(x=>`<div><span class="badge badge-muted">${x}</span></div>`).join("")}
        </div>
      </div>
    `;
    if (global.lucide) global.lucide.createIcons();
  }

  async function syncNOVA() {
    const toast = global.DGL_INTERACTIONS && global.DGL_INTERACTIONS.toast;
    if (global.DGL_ACCOUNT_GROWTH && typeof global.DGL_ACCOUNT_GROWTH.refreshLiveAccounts === "function") {
      if (toast) toast("Consultando Customers / Quotes desde Apps Script...");
      const ok = await global.DGL_ACCOUNT_GROWTH.refreshLiveAccounts();
      if (toast) toast(ok ? "Audiencias actualizadas desde la capa NOVA/Salesforce." : "No hubo datos nuevos; se conserva la data disponible.", ok ? undefined : "error");
      const route = location.hash.replace("#/","").trim() || "command-center";
      const mount = document.getElementById("mainContent");
      if (mount && global.DGL_MODULE_RENDERERS && global.DGL_MODULE_RENDERERS[route]) {
        global.DGL_MODULE_RENDERERS[route](mount, true);
      }
      return ok;
    }
    if (toast) toast("La conexión NOVA/Apps Script todavía no está disponible.", "error");
    return false;
  }

  document.addEventListener("click", function(event) {
    const sync = event.target.closest("[data-mco-sync]");
    if (sync) {
      event.preventDefault();
      syncNOVA();
    }
  });

  global.DGL_MODULE_RENDERERS = global.DGL_MODULE_RENDERERS || {};
  global.DGL_MODULE_RENDERERS["command-center"] = renderCommandCenter;
  global.DGL_MODULE_RENDERERS["nova-audiences"] = renderNOVAaudiences;
  global.DGL_MODULE_RENDERERS["service-marketing"] = renderServiceOverview;
  global.DGL_MODULE_RENDERERS["ftl-marketing"] = (c) => renderServiceDetail(c,"FTL");
  global.DGL_MODULE_RENDERERS["ltl-marketing"] = (c) => renderServiceDetail(c,"LTL");
  global.DGL_MODULE_RENDERERS["drayage-marketing"] = (c) => renderServiceDetail(c,"Drayage");
  global.DGL_MODULE_RENDERERS["channel-orchestration"] = renderChannels;
  global.DGL_MODULE_RENDERERS["campaign-attribution"] = renderAttribution;

  global.DGL_MARKETING_CAMPAIGN_OS = {
    VERSION, buildAudiences, serviceStats, novaSignals, renderCommandCenter,
    renderNOVAaudiences, renderServiceOverview, renderServiceDetail,
    renderChannels, renderAttribution, syncNOVA
  };
})(window);
