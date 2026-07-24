/**
 * DGL Marketing Execution OS — Sample Data Layer
 * ------------------------------------------------
 * All data in this file is SIMULATED for demonstration purposes.
 * No real customer, financial or operational data is contained here.
 * Structure is designed to mirror a future integration with
 * Salesforce (CRM / Lane Quotes) and Nova (TMS / Loads).
 */

(function (global) {
  "use strict";

  const SERVICES = [
    "FTL", "LTL", "Drayage", "Intermodal", "Cross Border",
    "Warehousing", "Transloading", "HazMat", "Refrigerated",
    "Flatbed", "Oversize"
  ];

  const REGIONS = [
    "US Midwest", "US Southeast", "US Southwest", "US Northeast",
    "Texas / Mexico Border", "California / Pacific", "Great Lakes"
  ];

  /* ------------------------------------------------------------------
   * 1. CUSTOMER PORTFOLIO (existing book of business)
   * ------------------------------------------------------------------ */
  const customers = [
    { id: "C-1001", name: "Meridian Auto Components", industry: "Automotive Manufacturing", tier: "Strategic", status: "Active", region: "US Midwest", accountManager: "J. Ortega", servicesUsed: ["FTL", "Intermodal"], recommendedService: "Cross Border", lastLoadDate: "2026-07-02", lastQuoteDate: "2026-07-05", daysSinceLastLoad: 8, loadsLast90d: 14, revenueYTD: 486000, revenueHistoric: 1240000, opportunityScore: 82, coolingReason: null, nextAction: "Proponer expansión Cross Border para planta en Monterrey" },
    { id: "C-1002", name: "Harborline Import Group", industry: "Retail Import/Export", tier: "Strategic", status: "At Risk", region: "California / Pacific", accountManager: "M. Chen", servicesUsed: ["Drayage", "Warehousing"], recommendedService: "Transloading", lastLoadDate: "2026-05-28", lastQuoteDate: "2026-06-30", daysSinceLastLoad: 43, loadsLast90d: 5, revenueYTD: 312000, revenueHistoric: 980000, opportunityScore: 61, coolingReason: "Reducción de volumen 38% vs. trimestre anterior", nextAction: "Activar campaña de retención Tier + llamada de Account Management" },
    { id: "C-1003", name: "Prairie Foods Distribution", industry: "Food & Beverage", tier: "Key", status: "Active", region: "US Midwest", accountManager: "R. Salas", servicesUsed: ["Refrigerated", "FTL"], recommendedService: "LTL", lastLoadDate: "2026-07-08", lastQuoteDate: "2026-07-08", daysSinceLastLoad: 2, loadsLast90d: 22, revenueYTD: 540000, revenueHistoric: 1510000, opportunityScore: 74, coolingReason: null, nextAction: "Ofrecer consolidación LTL para pedidos pequeños recurrentes" },
    { id: "C-1004", name: "Vantage Steel Works", industry: "Industrial Manufacturing", tier: "Key", status: "Inactive-60", region: "Great Lakes", accountManager: "J. Ortega", servicesUsed: ["Flatbed", "Oversize"], recommendedService: "Flatbed", lastLoadDate: "2026-05-10", lastQuoteDate: "2026-05-22", daysSinceLastLoad: 61, loadsLast90d: 0, revenueYTD: 96000, revenueHistoric: 645000, opportunityScore: 55, coolingReason: "Sin cotizaciones nuevas en 45 días", nextAction: "Lanzar secuencia de reactivación 60 días" },
    { id: "C-1005", name: "Cascadia Electronics", industry: "Electronics / Tech", tier: "Standard", status: "Quoted-Not-Booked", region: "US Northeast", accountManager: "L. Nguyen", servicesUsed: ["LTL"], recommendedService: "FTL", lastLoadDate: "2026-04-15", lastQuoteDate: "2026-07-06", daysSinceLastLoad: 86, loadsLast90d: 1, revenueYTD: 41000, revenueHistoric: 210000, opportunityScore: 48, coolingReason: "Cotizó 2 veces, no cerró por precio", nextAction: "Enviar mensaje de valor (no descuento) + follow-up 72h" },
    { id: "C-1006", name: "Rio Grande Produce Co.", industry: "Agriculture / Perishables", tier: "Key", status: "Active", region: "Texas / Mexico Border", accountManager: "R. Salas", servicesUsed: ["Refrigerated", "Cross Border"], recommendedService: "Warehousing", lastLoadDate: "2026-07-09", lastQuoteDate: "2026-07-09", daysSinceLastLoad: 1, loadsLast90d: 31, revenueYTD: 712000, revenueHistoric: 1980000, opportunityScore: 88, coolingReason: null, nextAction: "Presentar propuesta de cross-docking en temporada alta" },
    { id: "C-1007", name: "Summit Building Materials", industry: "Construction", tier: "Standard", status: "Inactive-90", region: "US Southwest", accountManager: "M. Chen", servicesUsed: ["Flatbed"], recommendedService: "Oversize", lastLoadDate: "2026-04-08", lastQuoteDate: "2026-04-20", daysSinceLastLoad: 93, loadsLast90d: 0, revenueYTD: 18000, revenueHistoric: 305000, opportunityScore: 39, coolingReason: "Proyecto finalizado, sin nueva demanda comunicada", nextAction: "Reactivación 90 días + oferta de temporada de construcción" },
    { id: "C-1008", name: "Nordic Freight Forwarders LLC", industry: "Freight Forwarding", tier: "Strategic", status: "Active", region: "US Northeast", accountManager: "L. Nguyen", servicesUsed: ["Intermodal", "Drayage", "Warehousing"], recommendedService: "Transloading", lastLoadDate: "2026-07-07", lastQuoteDate: "2026-07-09", daysSinceLastLoad: 3, loadsLast90d: 19, revenueYTD: 601000, revenueHistoric: 1720000, opportunityScore: 79, coolingReason: null, nextAction: "Fortalecer relación FF: reunión trimestral + one-pager Transloading" },
    { id: "C-1009", name: "Bluepeak Chemical Solutions", industry: "Chemicals", tier: "Key", status: "Active", region: "US Southeast", accountManager: "J. Ortega", servicesUsed: ["HazMat", "FTL"], recommendedService: "Cross Border", lastLoadDate: "2026-07-04", lastQuoteDate: "2026-07-06", daysSinceLastLoad: 6, loadsLast90d: 12, revenueYTD: 388000, revenueHistoric: 890000, opportunityScore: 70, coolingReason: null, nextAction: "Explorar expansión HazMat cross-border a Querétaro" },
    { id: "C-1010", name: "Desert Sun Solar Components", industry: "Renewable Energy", tier: "Standard", status: "Dormant-was-recurrent", region: "US Southwest", accountManager: "M. Chen", servicesUsed: ["FTL"], recommendedService: "Oversize", lastLoadDate: "2026-02-18", lastQuoteDate: "2026-03-01", daysSinceLastLoad: 142, loadsLast90d: 0, revenueYTD: 0, revenueHistoric: 420000, opportunityScore: 33, coolingReason: "Cliente recurrente que dejó de mover carga sin causa aparente", nextAction: "Campaña de recuperación de cuenta perdida + llamada ejecutiva" },
    { id: "C-1011", name: "Lakeshore Consumer Goods", industry: "CPG / Retail", tier: "Key", status: "At Risk", region: "Great Lakes", accountManager: "R. Salas", servicesUsed: ["LTL", "Warehousing"], recommendedService: "FTL", lastLoadDate: "2026-06-12", lastQuoteDate: "2026-06-28", daysSinceLastLoad: 28, loadsLast90d: 9, revenueYTD: 214000, revenueHistoric: 560000, opportunityScore: 58, coolingReason: "Frecuencia de carga cayó de semanal a quincenal", nextAction: "Activar playbook de retención por caída de frecuencia" },
    { id: "C-1012", name: "Alamo Border Logistics Partners", industry: "3PL / Freight Forwarding", tier: "Strategic", status: "Active", region: "Texas / Mexico Border", accountManager: "L. Nguyen", servicesUsed: ["Cross Border", "Drayage", "Intermodal"], recommendedService: "Warehousing", lastLoadDate: "2026-07-09", lastQuoteDate: "2026-07-10", daysSinceLastLoad: 1, loadsLast90d: 27, revenueYTD: 665000, revenueHistoric: 1890000, opportunityScore: 85, coolingReason: null, nextAction: "Presentar propuesta de warehousing dedicado en Laredo" },
    { id: "C-1013", name: "Coastal Textile Mills", industry: "Textiles", tier: "Standard", status: "Quoted-Not-Booked", region: "US Southeast", accountManager: "J. Ortega", servicesUsed: ["LTL"], recommendedService: "FTL", lastLoadDate: "2026-05-30", lastQuoteDate: "2026-07-03", daysSinceLastLoad: 41, loadsLast90d: 2, revenueYTD: 34000, revenueHistoric: 165000, opportunityScore: 44, coolingReason: "Cotizó FTL, no respondió tras envío de tarifa", nextAction: "Enviar script de objeción de precio + reenviar cotización" },
    { id: "C-1014", name: "Northgate Pharma Distribution", industry: "Pharmaceutical", tier: "Strategic", status: "Active", region: "US Northeast", accountManager: "M. Chen", servicesUsed: ["Refrigerated", "FTL"], recommendedService: "Warehousing", lastLoadDate: "2026-07-06", lastQuoteDate: "2026-07-08", daysSinceLastLoad: 4, loadsLast90d: 17, revenueYTD: 455000, revenueHistoric: 1120000, opportunityScore: 76, coolingReason: null, nextAction: "Explorar almacenamiento controlado por temperatura" },
    { id: "C-1015", name: "Trailhead Outdoor Equipment", industry: "Consumer Goods", tier: "Standard", status: "Inactive-120", region: "US Southwest", accountManager: "R. Salas", servicesUsed: ["LTL"], recommendedService: "FTL", lastLoadDate: "2026-02-02", lastQuoteDate: "2026-02-10", daysSinceLastLoad: 158, loadsLast90d: 0, revenueYTD: 0, revenueHistoric: 128000, opportunityScore: 21, coolingReason: "Sin actividad por más de 120 días", nextAction: "Última campaña de recuperación antes de reclasificar cuenta" },
    { id: "C-1016", name: "Iron Ridge Mining Supply", industry: "Mining / Industrial", tier: "Key", status: "Active", region: "US Southwest", accountManager: "J. Ortega", servicesUsed: ["Flatbed", "Oversize"], recommendedService: "Cross Border", lastLoadDate: "2026-07-05", lastQuoteDate: "2026-07-07", daysSinceLastLoad: 5, loadsLast90d: 11, revenueYTD: 298000, revenueHistoric: 710000, opportunityScore: 66, coolingReason: null, nextAction: "Ofrecer capacidad Oversize dedicada para temporada" },
    { id: "C-1017", name: "Union Pacific Wholesale Foods", industry: "Food & Beverage", tier: "Key", status: "At Risk", region: "US Midwest", accountManager: "L. Nguyen", servicesUsed: ["Refrigerated"], recommendedService: "FTL", lastLoadDate: "2026-06-20", lastQuoteDate: "2026-07-01", daysSinceLastLoad: 20, loadsLast90d: 8, revenueYTD: 176000, revenueHistoric: 480000, opportunityScore: 52, coolingReason: "Competidor ganó 2 lanes recientes según Account Manager", nextAction: "Enviar comparativo de valor + reforzar relación con AM" },
    { id: "C-1018", name: "Pacific Rim Trading Co.", industry: "Import/Export", tier: "Strategic", status: "Active", region: "California / Pacific", accountManager: "M. Chen", servicesUsed: ["Drayage", "Intermodal", "Cross Border"], recommendedService: "Transloading", lastLoadDate: "2026-07-08", lastQuoteDate: "2026-07-09", daysSinceLastLoad: 2, loadsLast90d: 24, revenueYTD: 588000, revenueHistoric: 1650000, opportunityScore: 81, coolingReason: null, nextAction: "Proponer transloading para consolidación de contenedores" },
    { id: "C-1019", name: "Redwood Furniture Manufacturing", industry: "Furniture / Manufacturing", tier: "Standard", status: "Quoted-Not-Booked", region: "California / Pacific", accountManager: "R. Salas", servicesUsed: ["FTL"], recommendedService: "Intermodal", lastLoadDate: "2026-06-01", lastQuoteDate: "2026-07-04", daysSinceLastLoad: 39, loadsLast90d: 3, revenueYTD: 52000, revenueHistoric: 190000, opportunityScore: 47, coolingReason: "Cotizó Intermodal, sin respuesta en 5 días", nextAction: "Follow-up con estudio de ahorro Intermodal vs FTL" },
    { id: "C-1020", name: "Granite State Hardware", industry: "Hardware / Retail", tier: "Standard", status: "Inactive-30", region: "US Northeast", accountManager: "J. Ortega", servicesUsed: ["LTL"], recommendedService: "FTL", lastLoadDate: "2026-06-08", lastQuoteDate: "2026-06-15", daysSinceLastLoad: 32, loadsLast90d: 2, revenueYTD: 29000, revenueHistoric: 142000, opportunityScore: 40, coolingReason: "Sin carga en 30+ días, patrón irregular", nextAction: "Enviar recordatorio de capacidad disponible en su lane" },
    { id: "C-1021", name: "Monterrey Auto Parts Exports", industry: "Automotive", tier: "Strategic", status: "Active", region: "Texas / Mexico Border", accountManager: "L. Nguyen", servicesUsed: ["Cross Border", "FTL", "Drayage"], recommendedService: "Warehousing", lastLoadDate: "2026-07-09", lastQuoteDate: "2026-07-09", daysSinceLastLoad: 1, loadsLast90d: 33, revenueYTD: 745000, revenueHistoric: 2100000, opportunityScore: 90, coolingReason: null, nextAction: "Cuenta ABM prioritaria: preparar QBR + propuesta de warehousing" },
    { id: "C-1022", name: "Copperfield Appliances", industry: "Consumer Electronics", tier: "Key", status: "At Risk", region: "US Southeast", accountManager: "M. Chen", servicesUsed: ["FTL", "Warehousing"], recommendedService: "Cross Border", lastLoadDate: "2026-06-15", lastQuoteDate: "2026-06-29", daysSinceLastLoad: 25, loadsLast90d: 7, revenueYTD: 198000, revenueHistoric: 520000, opportunityScore: 56, coolingReason: "Reducción de frecuencia + sin respuesta a última cotización", nextAction: "Activar campaña de retención + llamada consultiva" },
    { id: "C-1023", name: "Blue Harbor Seafood Co.", industry: "Food & Beverage", tier: "Standard", status: "Active", region: "US Southeast", accountManager: "R. Salas", servicesUsed: ["Refrigerated"], recommendedService: "Cross Border", lastLoadDate: "2026-07-07", lastQuoteDate: "2026-07-07", daysSinceLastLoad: 3, loadsLast90d: 15, revenueYTD: 267000, revenueHistoric: 610000, opportunityScore: 69, coolingReason: null, nextAction: "Explorar corredor refrigerado cross-border a CDMX" },
    { id: "C-1024", name: "Frontier Oilfield Equipment", industry: "Energy / Industrial", tier: "Key", status: "Inactive-60", region: "US Southwest", accountManager: "J. Ortega", servicesUsed: ["Flatbed", "Oversize"], recommendedService: "Flatbed", lastLoadDate: "2026-05-08", lastQuoteDate: "2026-05-15", daysSinceLastLoad: 63, loadsLast90d: 0, revenueYTD: 61000, revenueHistoric: 390000, opportunityScore: 45, coolingReason: "Ciclo de proyecto en pausa según último contacto", nextAction: "Reactivación 60 días con enfoque en disponibilidad de equipo" }
  ];

  /* ------------------------------------------------------------------
   * 2. QUOTED NOT BOOKED — cotizaciones sin conversión
   * ------------------------------------------------------------------ */
  const quotedNotBooked = [
    { id: "Q-5001", customer: "Cascadia Electronics", customerId: "C-1005", service: "FTL", quotedValue: 8400, quoteDate: "2026-07-06", daysNoResponse: 4, lossReason: "Precio", recoveryProbability: "Media", recommendedEmail: "Valor diferencial vs. precio (no descuento)", recommendedScript: "Objeción de precio — enfoque en confiabilidad y visibilidad", nextAction: "Enviar email de seguimiento 72h" },
    { id: "Q-5002", customer: "Coastal Textile Mills", customerId: "C-1013", service: "LTL → FTL", quotedValue: 5200, quoteDate: "2026-07-03", daysNoResponse: 7, lossReason: "Sin respuesta", recoveryProbability: "Media", recommendedEmail: "Reenvío de cotización + ventana de capacidad", recommendedScript: "Reactivación de cotización silenciosa", nextAction: "Llamada de seguimiento del Freight Manager" },
    { id: "Q-5003", customer: "Redwood Furniture Manufacturing", customerId: "C-1019", service: "Intermodal", quotedValue: 6100, quoteDate: "2026-07-04", daysNoResponse: 6, lossReason: "Evaluando alternativas", recoveryProbability: "Alta", recommendedEmail: "Comparativo de ahorro Intermodal vs FTL", recommendedScript: "Presentar ahorro proyectado y tiempo de tránsito", nextAction: "Enviar comparativo + agendar llamada" },
    { id: "Q-5004", customer: "Granite State Hardware", customerId: "C-1020", service: "FTL", quotedValue: 3900, quoteDate: "2026-06-15", daysNoResponse: 25, lossReason: "Sin respuesta", recoveryProbability: "Baja", recommendedEmail: "Última oportunidad — disponibilidad limitada", recommendedScript: "Cierre por urgencia de capacidad", nextAction: "Última llamada antes de archivar oportunidad" },
    { id: "Q-5005", customer: "Vantage Steel Works", customerId: "C-1004", service: "Flatbed", quotedValue: 11200, quoteDate: "2026-05-22", daysNoResponse: 49, lossReason: "Proyecto pausado", recoveryProbability: "Media", recommendedEmail: "Check-in de proyecto + nueva cotización", recommendedScript: "Reactivación por pausa de proyecto", nextAction: "Activar secuencia de recuperación 72h+" },
    { id: "Q-5006", customer: "Trailhead Outdoor Equipment", customerId: "C-1015", service: "FTL", quotedValue: 4700, quoteDate: "2026-02-10", daysNoResponse: 150, lossReason: "Sin respuesta", recoveryProbability: "Baja", recommendedEmail: "Campaña de recuperación de cuenta perdida", recommendedScript: "Reconexión ejecutiva", nextAction: "Evaluar reclasificación de cuenta" },
    { id: "Q-5007", customer: "Copperfield Appliances", customerId: "C-1022", service: "Cross Border", quotedValue: 9800, quoteDate: "2026-06-29", daysNoResponse: 11, lossReason: "Evaluando competidor", recoveryProbability: "Media", recommendedEmail: "Diferenciadores DGL vs. competencia", recommendedScript: "Battlecard competitiva", nextAction: "Enviar battlecard + llamada de retención" },
    { id: "Q-5008", customer: "Frontier Oilfield Equipment", customerId: "C-1024", service: "Flatbed", quotedValue: 7600, quoteDate: "2026-05-15", daysNoResponse: 56, lossReason: "Ciclo de proyecto en pausa", recoveryProbability: "Media", recommendedEmail: "Disponibilidad de equipo especializado", recommendedScript: "Reactivación por disponibilidad de capacidad", nextAction: "Activar secuencia de recuperación 60 días" }
  ];

  /* ------------------------------------------------------------------
   * 3. CAMPAIGNS
   * ------------------------------------------------------------------ */
  const campaigns = [
    { id: "CMP-01", name: "Reactivación 60 Días — Manufactura Industrial", type: "Reactivación", objective: "Reactivar cuentas industriales sin carga en 60 días", segment: "Inactive-60 · Industrial / Flatbed", status: "Active", owner: "C. Serna", startDate: "2026-07-01", nextAction: "Enviar email 2 de secuencia a 6 cuentas", channel: "Email + Llamada", kpi: "Cuentas reactivadas", expectedResult: "4 cuentas reactivadas en 30 días", cta: "Reactivar cotización" },
    { id: "CMP-02", name: "Seguimiento Post-Cotización 24/48/72h", type: "Post-Cotización", objective: "Convertir Lane Quotes abiertas en cargas", segment: "Todas las cotizaciones activas", status: "Active", owner: "L. Nguyen", startDate: "2026-06-20", nextAction: "8 cotizaciones en ventana de 24h", channel: "Email automatizado", kpi: "Tasa de conversión cotización → carga", expectedResult: "+12% conversión vs. mes anterior", cta: "Ver cotizaciones" },
    { id: "CMP-03", name: "Recuperación Quoted-Not-Booked", type: "Recuperación de Cotizaciones", objective: "Recuperar cotizaciones perdidas por precio o silencio", segment: "8 cuentas — ver Quoted Not Booked Center", status: "Active", owner: "C. Serna", startDate: "2026-07-05", nextAction: "Revisar respuestas de 3 cuentas", channel: "Email + Script comercial", kpi: "Cotizaciones recuperadas", expectedResult: "3 cotizaciones convertidas", cta: "Ver panel de recuperación" },
    { id: "CMP-04", name: "Retención Cuentas Tier Estratégicas", type: "Retención", objective: "Prevenir fuga de cuentas Strategic/Key en riesgo", segment: "At Risk · Tier Strategic/Key", status: "Active", owner: "R. Salas", startDate: "2026-06-25", nextAction: "Llamada consultiva a Lakeshore y Union Pacific", channel: "Email + Account Management", kpi: "Cuentas retenidas", expectedResult: "0 cuentas perdidas este trimestre", cta: "Ver cuentas en riesgo" },
    { id: "CMP-05", name: "Cross Selling — Drayage → Transloading", type: "Cross Selling", objective: "Ofrecer Transloading a clientes activos de Drayage", segment: "Clientes con Drayage sin Transloading", status: "Scheduled", owner: "M. Chen", startDate: "2026-07-14", nextAction: "Finalizar one-pager de Transloading", channel: "Email + Sales Enablement", kpi: "Pipeline Cross Selling generado", expectedResult: "$120K pipeline generado", cta: "Ver oportunidades" },
    { id: "CMP-06", name: "Upselling por Volumen — FTL a Cuentas Top 20%", type: "Upselling", objective: "Incrementar frecuencia de carga en cuentas de alto volumen", segment: "Top 20% por revenue histórico", status: "Active", owner: "J. Ortega", startDate: "2026-07-02", nextAction: "Enviar propuesta de capacidad dedicada", channel: "Email + Presentación ejecutiva", kpi: "Incremento de frecuencia", expectedResult: "+2 cargas/mes por cuenta", cta: "Ver cuentas elegibles" },
    { id: "CMP-07", name: "Recuperación de Cuentas Perdidas", type: "Recuperación de Cuentas", objective: "Reconectar con cuentas dormidas de alto valor histórico", segment: "Dormant-was-recurrent", status: "Active", owner: "C. Serna", startDate: "2026-06-15", nextAction: "Llamada ejecutiva a Desert Sun Solar", channel: "Email + Llamada ejecutiva", kpi: "Cuentas recuperadas", expectedResult: "2 cuentas recuperadas", cta: "Ver cuentas dormidas" },
    { id: "CMP-08", name: "Campaña de Temporada — Pico Logístico Q3", type: "Temporada Logística", objective: "Anticipar necesidades de capacidad en temporada alta Q3", segment: "Toda la cartera activa", status: "Scheduled", owner: "R. Salas", startDate: "2026-07-20", nextAction: "Aprobar contenido de campaña", channel: "Email masivo segmentado", kpi: "Solicitudes de cotización generadas", expectedResult: "+18 RFQs en 3 semanas", cta: "Ver calendario" },
    { id: "CMP-09", name: "Campaña por Servicio — Refrigerado Cross-Border", type: "Por Tipo de Servicio", objective: "Posicionar capacidad refrigerada cross-border en cuentas Food & Beverage", segment: "Industria Food & Beverage", status: "Draft", owner: "M. Chen", startDate: "2026-07-22", nextAction: "Definir lista de cuentas objetivo", channel: "Email + LinkedIn", kpi: "Cotizaciones generadas", expectedResult: "6 cotizaciones nuevas", cta: "Configurar campaña" },
    { id: "CMP-10", name: "Reactivación 90+ Días — Construcción", type: "Reactivación", objective: "Reactivar cuentas de construcción antes del pico de proyectos", segment: "Inactive-90 · Construcción", status: "Completed", owner: "J. Ortega", startDate: "2026-05-01", nextAction: "Cerrada — revisar resultados", channel: "Email + Llamada", kpi: "Cuentas reactivadas", expectedResult: "1 de 3 cuentas reactivada", cta: "Ver resultados" }
  ];

  /* ------------------------------------------------------------------
   * 4. EMAIL SEQUENCES
   * ------------------------------------------------------------------ */
  const emailSequences = [
    {
      id: "SEQ-01", name: "Post Quote Follow-Up (24h / 48h / 72h)", trigger: "Lane Quote enviada sin respuesta",
      segment: "Todas las cotizaciones activas", status: "Active",
      metrics: { sent: 214, openRate: 58, replyRate: 21 },
      emails: [
        { step: 1, timing: "24 horas", subject: "¿Alguna pregunta sobre su cotización de {service}?", preheader: "Capacidad confirmada para su lane esta semana" },
        { step: 2, timing: "48 horas", subject: "Su capacidad reservada vence pronto", preheader: "Aseguremos su espacio antes del cierre de semana" },
        { step: 3, timing: "72 horas", subject: "Última actualización sobre su cotización", preheader: "Le compartimos una alternativa que puede interesarle" }
      ]
    },
    {
      id: "SEQ-02", name: "Reactivación 60 Días", trigger: "Cuenta sin carga por 60 días",
      segment: "Inactive-60", status: "Active",
      metrics: { sent: 38, openRate: 44, replyRate: 15 },
      emails: [
        { step: 1, timing: "Día 60", subject: "Notamos que no hemos movido carga con usted recientemente", preheader: "Queremos entender cómo podemos apoyarle mejor" },
        { step: 2, timing: "Día 67", subject: "Capacidad disponible en su corredor habitual", preheader: "Tarifas competitivas listas para su próximo embarque" },
        { step: 3, timing: "Día 74", subject: "¿Seguimos siendo su aliado logístico?", preheader: "Nos encantaría retomar el servicio" }
      ]
    },
    {
      id: "SEQ-03", name: "Reactivación 90 Días", trigger: "Cuenta sin carga por 90 días",
      segment: "Inactive-90", status: "Active",
      metrics: { sent: 19, openRate: 39, replyRate: 11 },
      emails: [
        { step: 1, timing: "Día 90", subject: "Ha pasado un tiempo — pongámonos al día", preheader: "Actualización de capacidad y tarifas para su industria" },
        { step: 2, timing: "Día 97", subject: "Nueva capacidad disponible para {service}", preheader: "Aprovechamos para compartirle disponibilidad actualizada" },
        { step: 3, timing: "Día 104", subject: "Antes de reclasificar su cuenta, queremos hablar con usted", preheader: "Un Account Manager está disponible esta semana" }
      ]
    },
    {
      id: "SEQ-04", name: "Cliente que Cotiza y No Cierra", trigger: "2+ cotizaciones sin conversión",
      segment: "Quoted-Not-Booked", status: "Active",
      metrics: { sent: 27, openRate: 51, replyRate: 24 },
      emails: [
        { step: 1, timing: "Inmediato", subject: "Más allá del precio: por qué las empresas eligen DGL", preheader: "Visibilidad, control operativo y respuesta rápida" },
        { step: 2, timing: "+3 días", subject: "Un caso similar al suyo: cómo resolvimos su reto logístico", preheader: "Resultados reales de clientes en su industria" },
        { step: 3, timing: "+7 días", subject: "¿Seguimos siendo una opción para su próximo embarque?", preheader: "Estamos listos cuando usted lo esté" }
      ]
    },
    {
      id: "SEQ-05", name: "Cross Selling por Servicio", trigger: "Cliente usa 1 solo servicio activo",
      segment: "Cuentas mono-servicio", status: "Active",
      metrics: { sent: 45, openRate: 47, replyRate: 13 },
      emails: [
        { step: 1, timing: "Envío único", subject: "Servicios que complementan su operación actual", preheader: "Descubra cómo simplificar su cadena logística" },
        { step: 2, timing: "+5 días", subject: "Caso de éxito: cómo un cliente redujo costos combinando servicios", preheader: "Vea el impacto de una solución integrada" }
      ]
    },
    {
      id: "SEQ-06", name: "Retención Tier Account", trigger: "Cuenta Strategic/Key marcada At Risk",
      segment: "At Risk · Tier Strategic/Key", status: "Active",
      metrics: { sent: 12, openRate: 66, replyRate: 33 },
      emails: [
        { step: 1, timing: "Inmediato", subject: "Su Account Manager quiere conversar sobre su operación", preheader: "Revisemos juntos su desempeño y necesidades" },
        { step: 2, timing: "+4 días", subject: "Actualización de capacidad prioritaria para cuentas estratégicas", preheader: "Acceso preferente en temporada alta" }
      ]
    },
    {
      id: "SEQ-07", name: "Recuperación de Cliente Perdido", trigger: "Cuenta Dormant 120+ días con historial alto",
      segment: "Dormant-was-recurrent", status: "Active",
      metrics: { sent: 8, openRate: 35, replyRate: 8 },
      emails: [
        { step: 1, timing: "Envío único", subject: "Nos gustaría recuperar la relación con {company}", preheader: "Una nota personal de nuestro equipo ejecutivo" },
        { step: 2, timing: "+10 días", subject: "Novedades en capacidad y servicio que pueden interesarle", preheader: "Actualización directa de nuestro equipo comercial" }
      ]
    }
  ];

  /* ------------------------------------------------------------------
   * 5. AUTOMATION PLAYBOOKS
   * ------------------------------------------------------------------ */
  const playbooks = [
    { id: "PB-01", name: "Follow-up automático 24h post-cotización", trigger: "Cotización enviada sin respuesta en 24h", segment: "Todas las cotizaciones", action: "Enviar Email 1 de secuencia Post Quote Follow-Up", channel: "Email automatizado", owner: "Marketing Automation", executionTime: "Inmediato", kpi: "Tasa de respuesta 24h", status: "Active" },
    { id: "PB-02", name: "Activar recuperación a las 72h", trigger: "Cotización sin respuesta en 72h", segment: "Todas las cotizaciones", action: "Mover a Quoted Not Booked Recovery + notificar Freight Manager", channel: "Email + Alerta interna", owner: "Marketing + Ventas", executionTime: "Automático", kpi: "Cotizaciones recuperadas", status: "Active" },
    { id: "PB-03", name: "Reactivación por 60 días sin carga", trigger: "60 días sin actividad de carga", segment: "Inactive-60", action: "Inscribir en secuencia Reactivación 60 Días", channel: "Email + Llamada", owner: "Marketing", executionTime: "Diario (batch)", kpi: "Cuentas reactivadas", status: "Active" },
    { id: "PB-04", name: "Retención por caída de frecuencia", trigger: "Frecuencia de carga cae >30% vs. promedio histórico", segment: "Cuentas activas con caída de volumen", action: "Activar campaña de retención + alertar Account Manager", channel: "Email + Account Management", owner: "Marketing + AM", executionTime: "Semanal", kpi: "Cuentas retenidas", status: "Active" },
    { id: "PB-05", name: "Cross Selling por servicio único", trigger: "Cliente usa un solo servicio por 90+ días", segment: "Cuentas mono-servicio", action: "Inscribir en secuencia Cross Selling por Servicio", channel: "Email", owner: "Marketing", executionTime: "Mensual (batch)", kpi: "Pipeline Cross Selling", status: "Active" },
    { id: "PB-06", name: "Mensaje de valor ante pérdida por precio", trigger: "Cotización perdida — motivo: precio", segment: "Quoted-Not-Booked / Motivo Precio", action: "Enviar mensaje de valor diferenciado (no descuento automático)", channel: "Email + Script comercial", owner: "Marketing + Ventas", executionTime: "Inmediato", kpi: "Recuperación por valor vs. descuento", status: "Active" },
    { id: "PB-07", name: "Prioridad cuentas Tier inactivas", trigger: "Cuenta Strategic/Key sin actividad 30+ días", segment: "Tier Strategic/Key inactivas", action: "Activar campaña prioritaria + escalar a Account Management", channel: "Email + Llamada ejecutiva", owner: "Marketing + AM", executionTime: "Inmediato", kpi: "Cuentas Tier recuperadas", status: "Active" }
  ];

  /* ------------------------------------------------------------------
   * 6. CONTENT & SALES ENABLEMENT ASSETS
   * ------------------------------------------------------------------ */
  const assetTypes = ["Script de Llamada", "Email Listo", "One-Pager", "Brochure", "Presentación", "Argumentario de Precio", "Objeciones y Respuestas", "Battlecard", "Caso de Uso", "Propuesta Comercial"];

  const assets = [
    { id: "AST-01", title: "Script — Reactivación de cuenta inactiva 60 días", type: "Script de Llamada", service: "General", segment: "Inactive-60", status: "Actualizado", updatedDate: "2026-06-28", recommendedUse: "Usar en llamadas de reactivación tras Email 1" },
    { id: "AST-02", title: "Script — Objeción de precio (no ceder por descuento)", type: "Objeciones y Respuestas", service: "General", segment: "Quoted-Not-Booked", status: "Actualizado", updatedDate: "2026-07-01", recommendedUse: "Cuando el motivo de pérdida es precio" },
    { id: "AST-03", title: "One-Pager — Capacidad Cross Border Texas/México", type: "One-Pager", service: "Cross Border", segment: "Manufactura / Automotriz", status: "Actualizado", updatedDate: "2026-06-20", recommendedUse: "Adjuntar en propuestas de expansión Cross Border" },
    { id: "AST-04", title: "Battlecard — DGL vs. Freight Brokers Regionales", type: "Battlecard", service: "General", segment: "Cuentas en riesgo por competencia", status: "Actualizado", updatedDate: "2026-06-15", recommendedUse: "Usar cuando el cliente evalúa competidores" },
    { id: "AST-05", title: "Brochure — Warehousing & Transloading", type: "Brochure", service: "Warehousing", segment: "Freight Forwarders / Importadores", status: "Actualizado", updatedDate: "2026-06-10", recommendedUse: "Enviar en campañas de Cross Selling" },
    { id: "AST-06", title: "Presentación — Capacidad Refrigerada Cross-Border", type: "Presentación", service: "Refrigerated", segment: "Food & Beverage", status: "En revisión", updatedDate: "2026-07-02", recommendedUse: "QBRs y reuniones ejecutivas de cuentas Food & Beverage" },
    { id: "AST-07", title: "Email — Seguimiento post-cotización 24h", type: "Email Listo", service: "General", segment: "Todas las cotizaciones", status: "Actualizado", updatedDate: "2026-07-05", recommendedUse: "Parte de la secuencia Post Quote Follow-Up" },
    { id: "AST-08", title: "Argumentario — Valor vs. Precio en FTL", type: "Argumentario de Precio", service: "FTL", segment: "General", status: "Actualizado", updatedDate: "2026-06-18", recommendedUse: "Sustentar tarifas frente a comparativos de precio" },
    { id: "AST-09", title: "Caso de Uso — Reducción de tránsito Intermodal", type: "Caso de Uso", service: "Intermodal", segment: "Manufactura", status: "Actualizado", updatedDate: "2026-05-30", recommendedUse: "Apoyar conversión de FTL a Intermodal" },
    { id: "AST-10", title: "Propuesta Comercial — Programa Dedicado Flatbed/Oversize", type: "Propuesta Comercial", service: "Flatbed", segment: "Industrial / Construcción", status: "Actualizado", updatedDate: "2026-06-22", recommendedUse: "Cuentas con demanda estacional de equipo especializado" },
    { id: "AST-11", title: "One-Pager — Programa HazMat Certificado", type: "One-Pager", service: "HazMat", segment: "Químicos / Industrial", status: "Actualizado", updatedDate: "2026-06-05", recommendedUse: "Cuentas que requieren cumplimiento HazMat" },
    { id: "AST-12", title: "Script — Cross Selling Drayage a Transloading", type: "Script de Llamada", service: "Transloading", segment: "Clientes activos de Drayage", status: "Nuevo", updatedDate: "2026-07-08", recommendedUse: "Ventas al presentar oportunidad de Transloading" }
  ];

  /* ------------------------------------------------------------------
   * 7. ABM — ACCOUNT-BASED MARKETING
   * ------------------------------------------------------------------ */
  const abmAccounts = [
    { id: "ABM-01", customerId: "C-1021", name: "Monterrey Auto Parts Exports", profile: "Exportador automotriz Tier 1, alto volumen cross-border", commercialStatus: "Cuenta ancla — expansión activa", currentServices: ["Cross Border", "FTL", "Drayage"], suggestedServices: ["Warehousing"], recommendedMessage: "Propuesta de warehousing dedicado en frontera para reducir tiempos de espera", activeCampaign: "Upselling por Volumen", assets: ["AST-03", "AST-10"], lastContact: "2026-07-08", nextAction: "Preparar QBR ejecutivo + propuesta de warehousing", opportunityScore: 90 },
    { id: "ABM-02", customerId: "C-1012", name: "Alamo Border Logistics Partners", profile: "3PL / Freight Forwarder con operación multiservicio en frontera", commercialStatus: "Cuenta estratégica activa", currentServices: ["Cross Border", "Drayage", "Intermodal"], suggestedServices: ["Warehousing"], recommendedMessage: "Warehousing dedicado en Laredo para consolidar operación de FF", activeCampaign: "Cross Selling — Drayage → Transloading", assets: ["AST-05"], lastContact: "2026-07-06", nextAction: "Agendar reunión de expansión de servicio", opportunityScore: 85 },
    { id: "ABM-03", customerId: "C-1008", name: "Nordic Freight Forwarders LLC", profile: "Freight Forwarder internacional, socio multi-servicio", commercialStatus: "Cuenta estratégica activa", currentServices: ["Intermodal", "Drayage", "Warehousing"], suggestedServices: ["Transloading"], recommendedMessage: "Transloading para optimizar consolidación de carga de FF internacionales", activeCampaign: "Cross Selling — Drayage → Transloading", assets: ["AST-05", "AST-12"], lastContact: "2026-07-09", nextAction: "Reunión trimestral + envío de one-pager Transloading", opportunityScore: 79 },
    { id: "ABM-04", customerId: "C-1002", name: "Harborline Import Group", profile: "Importador retail con operación en costa oeste", commercialStatus: "En riesgo — requiere intervención", currentServices: ["Drayage", "Warehousing"], suggestedServices: ["Transloading"], recommendedMessage: "Reforzar valor de servicio + explorar Transloading como diferenciador", activeCampaign: "Retención Cuentas Tier Estratégicas", assets: ["AST-04"], lastContact: "2026-07-01", nextAction: "Llamada de Account Management esta semana", opportunityScore: 61 },
    { id: "ABM-05", customerId: "C-1014", name: "Northgate Pharma Distribution", profile: "Distribuidor farmacéutico con requerimientos de cadena de frío", commercialStatus: "Cuenta estratégica activa", currentServices: ["Refrigerated", "FTL"], suggestedServices: ["Warehousing"], recommendedMessage: "Almacenamiento controlado por temperatura como extensión del servicio", activeCampaign: "Campaña por Servicio — Refrigerado Cross-Border", assets: ["AST-06"], lastContact: "2026-07-08", nextAction: "Presentar propuesta de almacenamiento controlado", opportunityScore: 76 }
  ];

  /* ------------------------------------------------------------------
   * 8. RETENTION CAMPAIGNS (preventivas)
   * ------------------------------------------------------------------ */
  const retentionCampaigns = [
    { id: "RET-01", name: "Actualización de Capacidad — Temporada Alta Q3", type: "Comunicado de valor", segment: "Toda la cartera activa", status: "Scheduled", nextSend: "2026-07-15" },
    { id: "RET-02", name: "Alerta de Congestión Portuaria — Costa Oeste", type: "Alerta logística", segment: "Clientes Drayage / Intermodal Pacífico", status: "Active", nextSend: "2026-07-11" },
    { id: "RET-03", name: "Recordatorio de Capacidad Disponible — Frontera Texas", type: "Recordatorio de capacidad", segment: "Cross Border / Texas", status: "Active", nextSend: "2026-07-12" },
    { id: "RET-04", name: "Continuidad Operativa — Cierre de Trimestre", type: "Mensaje de continuidad", segment: "Cuentas Strategic/Key", status: "Scheduled", nextSend: "2026-07-25" },
    { id: "RET-05", name: "Update de Mercado — Tarifas Spot vs. Contrato", type: "Update de mercado", segment: "Toda la cartera activa", status: "Draft", nextSend: "2026-07-28" }
  ];

  /* ------------------------------------------------------------------
   * 9. GROWTH OPPORTUNITIES (Cross Sell / Upsell matrix)
   * ------------------------------------------------------------------ */
  function growthRationale(current, suggested) {
    const map = {
      "Transloading": "Consolidación de carga y reducción de manejos",
      "Warehousing": "Extensión natural de la operación con almacenamiento controlado",
      "Cross Border": "Expansión de corredor hacia México con visibilidad total",
      "FTL": "Mayor volumen justifica capacidad dedicada de camión completo",
      "LTL": "Consolidación de embarques pequeños y recurrentes",
      "Intermodal": "Reducción de costo en distancias largas con tránsito comparable",
      "Oversize": "Necesidad recurrente de equipo especializado en temporada",
      "Flatbed": "Disponibilidad de equipo especializado para carga industrial"
    };
    return map[suggested] || "Oportunidad de expansión de servicio identificada";
  }

  const growthOpportunities = customers
    .filter((c) => c.status === "Active" || c.status === "At Risk")
    .map((c) => ({
      customerId: c.id,
      customer: c.name,
      currentServices: c.servicesUsed,
      suggestedService: c.recommendedService,
      rationale: growthRationale(c.servicesUsed, c.recommendedService),
      opportunityScore: c.opportunityScore,
      estimatedUplift: Math.round((c.revenueYTD * 0.18) / 1000) * 1000
    }));

  /* ------------------------------------------------------------------
   * 10. ANALYTICS / KPIs
   * ------------------------------------------------------------------ */
  const analytics = {
    revenueInfluenced: 1284500,
    revenueInfluencedDelta: 14.2,
    accountsReactivated: 7,
    accountsReactivatedDelta: 2,
    quotesRecovered: 11,
    quotesRecoveredDelta: 3,
    activeCampaigns: 7,
    emailsSent: 386,
    responseRate: 19.4,
    responseRateDelta: 3.1,
    quoteToLoadConversion: 41.5,
    quoteToLoadConversionDelta: 5.8,
    pipelineGenerated: 612000,
    crossSellGenerated: 214000,
    upsellGenerated: 168000,
    accountsRetained: 22,
    roiEstimate: 6.4,
    monthlyRevenueTrend: [
      { month: "Feb", influenced: 610000, total: 4200000 },
      { month: "Mar", influenced: 742000, total: 4450000 },
      { month: "Abr", influenced: 815000, total: 4380000 },
      { month: "May", influenced: 940000, total: 4610000 },
      { month: "Jun", influenced: 1120000, total: 4790000 },
      { month: "Jul", influenced: 1284500, total: 4950000 }
    ],
    campaignPerformance: [
      { name: "Reactivación 60d", conversion: 34 },
      { name: "Post-Cotización", conversion: 41 },
      { name: "Quoted-Not-Booked", conversion: 38 },
      { name: "Retención Tier", conversion: 52 },
      { name: "Cross Selling", conversion: 27 },
      { name: "Upselling", conversion: 46 }
    ],
    funnelByStage: [
      { stage: "Cotizaciones abiertas", value: 96 },
      { stage: "Seguimiento activo", value: 62 },
      { stage: "En negociación", value: 34 },
      { stage: "Recuperadas / Convertidas", value: 19 }
    ]
  };

  /* ------------------------------------------------------------------
   * 11. NOVA & SALESFORCE INSIGHTS (conceptual integration)
   * ------------------------------------------------------------------ */
  const novaInsights = {
    laneQuotesOpen: 96,
    quotesLostLast30d: 22,
    loadsPerCustomerAvg: 9.4,
    inactiveAccounts: 8,
    avgResponseTimeHours: 6.2,
    topRequestedServices: [
      { service: "FTL", volume: 38 },
      { service: "Cross Border", volume: 24 },
      { service: "Drayage", volume: 19 },
      { service: "Refrigerated", volume: 15 },
      { service: "LTL", volume: 14 },
      { service: "Intermodal", volume: 11 }
    ],
    lossReasons: [
      { reason: "Precio", pct: 41 },
      { reason: "Sin respuesta", pct: 29 },
      { reason: "Tiempo de tránsito", pct: 14 },
      { reason: "Disponibilidad de equipo", pct: 9 },
      { reason: "Otro", pct: 7 }
    ],
    volumeDropAccounts: ["Lakeshore Consumer Goods", "Union Pacific Wholesale Foods", "Copperfield Appliances"],
    growthOpportunityAccounts: ["Monterrey Auto Parts Exports", "Alamo Border Logistics Partners", "Rio Grande Produce Co."]
  };

  /* ------------------------------------------------------------------
   * 12. BUSINESS INTELLIGENCE FOR MARKETING
   * ------------------------------------------------------------------ */
  const biIntel = [
    { id: "BI-01", title: "Nearshoring impulsa demanda de Cross Border en la frontera Texas-México", category: "Nearshoring", relevance: "Alta", impact: "Oportunidad de campaña dirigida a manufactura automotriz e industrial", date: "2026-07-03" },
    { id: "BI-02", title: "Congestión en puertos de la Costa Oeste afecta tiempos de Drayage", category: "Puertos", relevance: "Alta", impact: "Argumento de valor: visibilidad y planeación anticipada", date: "2026-07-06" },
    { id: "BI-03", title: "Temporada alta Q3 incrementa demanda de capacidad Flatbed/Oversize en construcción", category: "Temporada", relevance: "Media", impact: "Campaña de disponibilidad de equipo especializado", date: "2026-06-28" },
    { id: "BI-04", title: "Nuevas regulaciones de transporte refrigerado en cruces fronterizos", category: "Regulación", relevance: "Media", impact: "Contenido educativo para cuentas Food & Beverage", date: "2026-06-20" },
    { id: "BI-05", title: "Competidores regionales reducen tarifas spot en el Medio Oeste", category: "Competencia", relevance: "Alta", impact: "Reforzar mensaje de valor sobre precio en cuentas en riesgo", date: "2026-07-08" }
  ];

  /* ------------------------------------------------------------------
   * 13. SEO / GEO INTELLIGENCE (soporte, no prioridad)
   * ------------------------------------------------------------------ */
  const seoGeo = {
    strategicKeywords: [
      { keyword: "freight broker cross border Texas Mexico", volume: 320, visibility: 62, trend: "up" },
      { keyword: "FTL freight broker USA", volume: 880, visibility: 41, trend: "flat" },
      { keyword: "drayage services port congestion", volume: 210, visibility: 55, trend: "up" },
      { keyword: "refrigerated freight broker cross border", volume: 140, visibility: 47, trend: "up" },
      { keyword: "nearshoring logistics partner Mexico", volume: 190, visibility: 38, trend: "up" }
    ],
    organicVisibility: 46,
    aiVisibility: 29,
    criticalPages: [
      { page: "/services/cross-border", status: "Optimizada", priority: "Alta" },
      { page: "/services/drayage", status: "Requiere actualización", priority: "Alta" },
      { page: "/industries/automotive", status: "Optimizada", priority: "Media" },
      { page: "/services/refrigerated", status: "En progreso", priority: "Media" }
    ],
    contentRecommendations: [
      "Publicar guía de nearshoring para manufactura automotriz",
      "Actualizar página de Drayage con datos de congestión portuaria",
      "Crear contenido comparativo FTL vs. Intermodal para SEO + ventas"
    ]
  };

  /* ------------------------------------------------------------------
   * 14. GOVERNANCE & APPROVALS
   * ------------------------------------------------------------------ */
  const governance = [
    { id: "GOV-01", campaign: "Reactivación 60 Días — Manufactura Industrial", status: "Aprobada", checklist: { branding: true, legal: true, qa: true }, owner: "C. Serna", publishDate: "2026-07-01", channel: "Email" },
    { id: "GOV-02", campaign: "Campaña de Temporada — Pico Logístico Q3", status: "En revisión", checklist: { branding: true, legal: false, qa: false }, owner: "R. Salas", publishDate: "2026-07-20", channel: "Email masivo" },
    { id: "GOV-03", campaign: "Campaña por Servicio — Refrigerado Cross-Border", status: "Pendiente", checklist: { branding: false, legal: false, qa: false }, owner: "M. Chen", publishDate: "2026-07-22", channel: "Email + LinkedIn" },
    { id: "GOV-04", campaign: "Alerta de Congestión Portuaria — Costa Oeste", status: "Aprobada", checklist: { branding: true, legal: true, qa: true }, owner: "L. Nguyen", publishDate: "2026-07-11", channel: "Email" },
    { id: "GOV-05", campaign: "Update de Mercado — Tarifas Spot vs. Contrato", status: "En revisión", checklist: { branding: true, legal: true, qa: false }, owner: "C. Serna", publishDate: "2026-07-28", channel: "Email" }
  ];

  /* ------------------------------------------------------------------
   * 15. MONDAY ACTION PLAN
   * ------------------------------------------------------------------ */
  const mondayActionPlan = [
    { priority: "Crítica", action: "Activar secuencia de recuperación para 3 cotizaciones con 72h+ sin respuesta", owner: "L. Nguyen", module: "Quoted Not Booked Recovery" },
    { priority: "Crítica", action: "Llamada de retención a Harborline Import Group y Lakeshore Consumer Goods (At Risk)", owner: "M. Chen / R. Salas", module: "Customer Retention" },
    { priority: "Alta", action: "Enviar Email 2 de Reactivación 60 Días a 6 cuentas industriales", owner: "C. Serna", module: "Reactivation Center" },
    { priority: "Alta", action: "Finalizar one-pager de Transloading para campaña Cross Selling", owner: "M. Chen", module: "Content & Asset Library" },
    { priority: "Media", action: "Preparar QBR y propuesta de Warehousing para Monterrey Auto Parts Exports", owner: "L. Nguyen", module: "Account-Based Marketing" },
    { priority: "Media", action: "Aprobar contenido de Campaña de Temporada Q3", owner: "R. Salas", module: "Governance & Approvals" }
  ];

  /* ------------------------------------------------------------------
   * EXPORT
   * ------------------------------------------------------------------ */
  global.DGL_DATA = {
    meta: {
      generatedAs: "SAMPLE DATA — para demostración de plataforma, sin datos reales",
      company: "Dedicated Ground Logistics (DGL)",
      lastSync: "2026-07-10T08:00:00Z"
    },
    services: SERVICES,
    regions: REGIONS,
    customers,
    quotedNotBooked,
    campaigns,
    emailSequences,
    playbooks,
    assets,
    assetTypes,
    abmAccounts,
    retentionCampaigns,
    growthOpportunities,
    analytics,
    novaInsights,
    biIntel,
    seoGeo,
    governance,
    mondayActionPlan
  };
})(window);

/**
 * DGL Marketing Execution OS — Campaign Execution API Client
 * ------------------------------------------------------------
 * Talks to the Google Apps Script Web App that backs the "Campañas"
 * sheet (real persistence, real audience generation, real Gmail
 * drafts). This replaces the static campaigns sample array above
 * with live data once the page finishes its first synchronous render.
 *
 * Fails silently to the sample data if the API is unreachable
 * (offline, deploy URL changed, etc.) — console.warn only, never throws,
 * so the rest of the platform keeps working exactly as before.
 */
(function (global) {
  "use strict";

  const API_BASE = "https://script.google.com/macros/s/AKfycbxBQ7R7Rjx6qerjZ1MeMWjO73sUkV53yAhpbMNACVae3ZFZLyPOn9CW8YVjEihT9z_iWw/exec";

  async function apiGet(action, params) {
    const qs = new URLSearchParams(Object.assign({ action: action }, params || {})).toString();
    const res = await fetch(API_BASE + "?" + qs);
    return res.json();
  }

  async function apiPost(body) {
    const res = await fetch(API_BASE, { method: "POST", body: JSON.stringify(body) });
    return res.json();
  }

  async function refreshCampaignsFromAPI() {
    try {
      const json = await apiGet("campaigns");
      if (json && json.ok && Array.isArray(json.campaigns)) {
        const arr = global.DGL_DATA.campaigns;
        arr.length = 0;
        json.campaigns.forEach(function (c) {
          if (!c.cta) c.cta = "Ver Campaña";
          arr.push(c);
        });
        global.DGL_DATA.meta.liveSync = true;
        global.DGL_DATA.meta.lastSync = new Date().toISOString();
        return true;
      }
    } catch (err) {
      console.warn("DGL_API: no se pudo sincronizar campañas reales, se mantiene sample data.", err);
    }
    return false;
  }

  async function createCampaign(payload) {
    return apiPost(Object.assign({ action: "create" }, payload));
  }

  async function updateCampaign(id, fields) {
    return apiPost({ action: "update", id: id, fields: fields });
  }

  async function generateAudience(id, segmentFilter) {
    return apiPost({ action: "generateAudience", id: id, segmentFilter: segmentFilter });
  }

  async function sendCampaignEmails(id) {
    return apiPost({ action: "sendCampaignEmails", id: id });
  }

  async function logResponse(id) {
    return apiPost({ action: "logResponse", id: id });
  }

  global.DGL_API = {
    API_BASE: API_BASE,
    refreshCampaignsFromAPI: refreshCampaignsFromAPI,
    createCampaign: createCampaign,
    updateCampaign: updateCampaign,
    generateAudience: generateAudience,
    sendCampaignEmails: sendCampaignEmails,
    logResponse: logResponse
  };
})(window);
