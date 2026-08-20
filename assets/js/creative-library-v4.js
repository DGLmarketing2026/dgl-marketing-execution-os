/**
 * DGL Creative Library V4
 * Approved creative systems, service profiles and campaign rules.
 * No customer data. No credentials.
 */
(function (global) {
  "use strict";

  const VERSION = "4.0";

  const CREATIVE_SYSTEMS = {
    "relationship-premium": {
      id: "relationship-premium",
      name: "Relationship Premium",
      use: "Reactivation",
      description: "Relacional, elegante y orientado a reabrir conversación.",
      mode: "dark",
      layout: "relationship",
      recommendedFor: ["Reactivation", "Retention"]
    },
    "recovery-minimal": {
      id: "recovery-minimal",
      name: "Recovery Minimal",
      use: "Quoted Not Booked",
      description: "Seguimiento ejecutivo, corto y poco promocional.",
      mode: "light",
      layout: "minimal",
      recommendedFor: ["Quoted Not Booked"]
    },
    "service-hero": {
      id: "service-hero",
      name: "Service Hero",
      use: "FTL / LTL / Drayage",
      description: "Servicio al frente con visual fuerte y CTA de cotización.",
      mode: "dark",
      layout: "hero",
      recommendedFor: ["Cross-Sell", "Service Campaign", "Reactivation"]
    },
    "executive-white": {
      id: "executive-white",
      name: "Executive White",
      use: "Strategic / C-Level",
      description: "Editorial, sobrio y centrado en relación y valor.",
      mode: "light",
      layout: "executive",
      recommendedFor: ["Retention", "Reactivation", "Cross-Sell"]
    },
    "momentum": {
      id: "momentum",
      name: "Momentum",
      use: "Capacity / Seasonality",
      description: "Más dinámico para capacidad, ventanas de oportunidad o temporada.",
      mode: "dark",
      layout: "momentum",
      recommendedFor: ["Service Campaign", "Cross-Sell"]
    }
  };

  const OBJECTIVES = {
    "Reactivation": {
      label: "Reactivation",
      recommendedSystem: "relationship-premium",
      defaultAngle: "Previous Relationship",
      allowedAngles: ["Previous Relationship", "Ready to Quote", "Service Reminder"],
      defaultCtaIntent: "Generate Quote"
    },
    "Quoted Not Booked": {
      label: "Quoted Not Booked",
      recommendedSystem: "recovery-minimal",
      defaultAngle: "Still Active",
      allowedAngles: ["Still Active", "Update Requirement", "Second Look"],
      defaultCtaIntent: "Recover Quote"
    },
    "Cross-Sell": {
      label: "Cross-Sell",
      recommendedSystem: "service-hero",
      defaultAngle: "Additional Capability",
      allowedAngles: ["Additional Capability", "One Partner", "Service Expansion"],
      defaultCtaIntent: "Generate Quote"
    },
    "Retention": {
      label: "Retention",
      recommendedSystem: "executive-white",
      defaultAngle: "Stay Close",
      allowedAngles: ["Stay Close", "Planning Ahead", "Relationship Continuity"],
      defaultCtaIntent: "Reply"
    },
    "Service Campaign": {
      label: "Service Campaign",
      recommendedSystem: "service-hero",
      defaultAngle: "Capacity Available",
      allowedAngles: ["Capacity Available", "Lane Opportunity", "Seasonal Window"],
      defaultCtaIntent: "Generate Quote"
    }
  };

  const SERVICES = {
    "FTL": {
      name: "FTL",
      descriptor: "Full Truckload",
      visualLabel: "53' DRY VAN · USA NATIONWIDE",
      proof: ["53' Dry Van", "Nationwide Capacity", "Bilingual Support"],
      heroHeadlineES: "CAPACIDAD FTL. CUANDO LA NECESITAN.",
      heroHeadlineEN: "FTL CAPACITY. WHEN YOU NEED IT.",
      visualBrief: "American Class 8 tractor with 53-foot dry van on a U.S. highway, premium corporate logistics photography."
    },
    "LTL": {
      name: "LTL",
      descriptor: "Less Than Truckload",
      visualLabel: "PALLETIZED FREIGHT · FLEXIBLE CAPACITY",
      proof: ["LTL Coverage", "Shipment Visibility", "Operational Support"],
      heroHeadlineES: "MENOS QUE UN CAMIÓN. TODO EL SOPORTE DGL.",
      heroHeadlineEN: "LESS THAN A TRUCKLOAD. FULL DGL SUPPORT.",
      visualBrief: "Modern U.S. freight dock with palletized cargo and LTL handling, clean and premium corporate photography."
    },
    "Drayage": {
      name: "Drayage",
      descriptor: "Port & Inland",
      visualLabel: "PORT · CONTAINER · INLAND",
      proof: ["Port-to-Inland", "Container Drayage", "Major U.S. Ports"],
      heroHeadlineES: "DEL PUERTO AL SIGUIENTE MOVIMIENTO.",
      heroHeadlineEN: "FROM PORT TO NEXT MOVE.",
      visualBrief: "U.S. container terminal with drayage truck, chassis and containers, premium port logistics photography."
    },
    "Cross Border": {
      name: "Cross Border",
      descriptor: "Mexico · USA · Canada",
      visualLabel: "MEXICO · USA · CANADA",
      proof: ["Cross-Border Coordination", "Inland Capacity", "Bilingual Support"],
      heroHeadlineES: "PRECISIÓN SIN FRONTERAS.",
      heroHeadlineEN: "PRECISION WITHOUT BORDERS.",
      visualBrief: "North American cross-border freight scene with American truck and subtle U.S.-Mexico corridor context."
    },
    "Reefer": {
      name: "Reefer",
      descriptor: "Temperature Controlled",
      visualLabel: "TEMPERATURE CONTROLLED",
      proof: ["Reefer Capacity", "Produce & Food", "Operational Visibility"],
      heroHeadlineES: "TEMPERATURA CONTROLADA. EJECUCIÓN CONTROLADA.",
      heroHeadlineEN: "CONTROLLED TEMPERATURE. CONTROLLED EXECUTION.",
      visualBrief: "American refrigerated truck at a modern distribution center, premium cold-chain logistics photography."
    },
    "Intermodal": {
      name: "Intermodal",
      descriptor: "Rail & Inland",
      visualLabel: "RAIL · RAMP · INLAND",
      proof: ["Intermodal Options", "Rail & Inland", "Network Coverage"],
      heroHeadlineES: "MÁS FORMAS DE MOVER SU CARGA.",
      heroHeadlineEN: "MORE WAYS TO MOVE YOUR FREIGHT.",
      visualBrief: "North American intermodal rail ramp with containers and tractors, clean corporate logistics photography."
    },
    "Multiservicio": {
      name: "Multiservicio",
      descriptor: "DGL Ground Solutions",
      visualLabel: "FTL · LTL · DRAYAGE",
      proof: ["FTL", "LTL", "Drayage"],
      heroHeadlineES: "UNA RELACIÓN. MÁS OPCIONES.",
      heroHeadlineEN: "ONE RELATIONSHIP. MORE OPTIONS.",
      visualBrief: "Premium North American ground logistics composition combining truck, port and freight terminal."
    }
  };

  const TONES = {
    "Executive Natural": "Profesional, claro, breve y humano; evita lenguaje de plantilla.",
    "Consultative": "Abre conversación desde contexto y disponibilidad, sin presión.",
    "Direct": "Muy breve, orientado a una acción concreta.",
    "Relationship-Based": "Prioriza continuidad de relación y contexto previo."
  };

  const CTA_INTENTS = {
    "Generate Quote": { es: "ENVIAR MOVIMIENTO", en: "SEND A SHIPMENT" },
    "Recover Quote": { es: "ACTUALIZAR COTIZACIÓN", en: "UPDATE QUOTE" },
    "Reply": { es: "RESPONDER A DGL", en: "REPLY TO DGL" },
    "Meeting": { es: "AGENDAR CONVERSACIÓN", en: "SCHEDULE A CONVERSATION" },
    "Review Service": { es: "REVISAR SERVICIO", en: "REVIEW SERVICE" }
  };

  global.DGL_CREATIVE_LIBRARY_V4 = {
    VERSION,
    CREATIVE_SYSTEMS,
    OBJECTIVES,
    SERVICES,
    TONES,
    CTA_INTENTS
  };
})(window);
