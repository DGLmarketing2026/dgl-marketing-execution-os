
(function(global){
  "use strict";
  const VERSION="5.2";

  const CREATIVE_SYSTEMS={
    "editorial-white":{
      id:"editorial-white",name:"DGL Editorial White",
      use:"Reactivation / Retention",
      desc:"Composición blanca, headline dominante, fotografía integrada y mucho aire.",
      thumb:"editorial",layout:"editorial",recommendedFor:["Reactivation","Retention"]
    },
    "split-hero":{
      id:"split-hero",name:"DGL Split Hero",
      use:"FTL / LTL / Drayage",
      desc:"Copy y visual en composición 50/50 o 60/40 con presencia logística fuerte.",
      thumb:"split",layout:"split",recommendedFor:["Service Campaign","Cross-Sell","Reactivation"]
    },
    "route-intelligence":{
      id:"route-intelligence",name:"DGL Route Intelligence",
      use:"Lane / Cross-Border",
      desc:"Ruta, corredor o puerto como argumento visual y comercial.",
      thumb:"route",layout:"route",recommendedFor:["Service Campaign","Cross-Sell"]
    },
    "service-architecture":{
      id:"service-architecture",name:"DGL Service Architecture",
      use:"Cross-Sell / Capabilities",
      desc:"Hero + módulos de servicio + beneficios claros y jerarquía corporativa.",
      thumb:"service",layout:"service",recommendedFor:["Cross-Sell","Service Campaign"]
    },
    "case-proof":{
      id:"case-proof",name:"DGL Case / Proof",
      use:"Proof / Strategic Accounts",
      desc:"Problema → solución → resultado → CTA. Ideal para evidencia comercial.",
      thumb:"case",layout:"case",recommendedFor:["Retention","Cross-Sell"]
    },
    "executive-minimal":{
      id:"executive-minimal",name:"DGL Executive Minimal",
      use:"Quoted Not Booked",
      desc:"Seguimiento limpio, poco promocional y orientado a respuesta.",
      thumb:"minimal",layout:"minimal",recommendedFor:["Quoted Not Booked"]
    }
  };

  const OBJECTIVES={
    "Reactivation":{
      recommendedSystem:"editorial-white",
      angles:["Previous Relationship","Ready to Quote","Service Reminder"],
      defaultAngle:"Previous Relationship",defaultCta:"Generate Quote"
    },
    "Quoted Not Booked":{
      recommendedSystem:"executive-minimal",
      angles:["Still Active","Update Requirement","Reopen Opportunity"],
      defaultAngle:"Still Active",defaultCta:"Recover Quote"
    },
    "Cross-Sell":{
      recommendedSystem:"service-architecture",
      angles:["Additional Capability","One Partner","Service Expansion"],
      defaultAngle:"Additional Capability",defaultCta:"Generate Quote"
    },
    "Retention":{
      recommendedSystem:"editorial-white",
      angles:["Stay Close","Planning Ahead","Relationship Continuity"],
      defaultAngle:"Stay Close",defaultCta:"Reply"
    },
    "Service Campaign":{
      recommendedSystem:"split-hero",
      angles:["Capacity Available","Lane Opportunity","Seasonal Window"],
      defaultAngle:"Capacity Available",defaultCta:"Generate Quote"
    },
    "Lane Campaign":{
      recommendedSystem:"route-intelligence",
      angles:["Lane Opportunity","Port Capacity","Cross-Border Corridor"],
      defaultAngle:"Lane Opportunity",defaultCta:"Generate Quote"
    }
  };

  const SERVICES={
    "FTL":{
      name:"FTL",
      descriptor:"Full Truckload",proof:["53' Dry Van","Nationwide Capacity","Bilingual Support"],
      label:"FTL · U.S. GROUND CAPACITY",
      headlineES:"CAPACIDAD FTL PARA SU PRÓXIMO MOVIMIENTO.",
      headlineEN:"FTL CAPACITY FOR YOUR NEXT MOVE."
    },
    "LTL":{
      name:"LTL",
      descriptor:"Less Than Truckload",proof:["LTL Coverage","Shipment Visibility","Operational Support"],
      label:"LTL · FLEXIBLE GROUND CAPACITY",
      headlineES:"LTL QUE TRABAJA DE FORMA MÁS INTELIGENTE.",
      headlineEN:"LTL THAT WORKS SMARTER."
    },
    "Drayage":{
      name:"Drayage",
      descriptor:"Port & Inland",proof:["Port-to-Inland","Container Drayage","Major U.S. Ports"],
      label:"DRAYAGE · PORT TO INLAND",
      headlineES:"DEL PUERTO AL SIGUIENTE MOVIMIENTO.",
      headlineEN:"FROM PORT TO NEXT MOVE."
    },
    "Cross Border":{
      name:"Cross Border",
      descriptor:"Mexico · USA · Canada",proof:["Cross-Border Coordination","Inland Capacity","Bilingual Support"],
      label:"MEXICO · USA · CANADA",
      headlineES:"PRECISIÓN SIN FRONTERAS.",
      headlineEN:"PRECISION WITHOUT BORDERS."
    },
    "Reefer":{
      name:"Reefer",
      descriptor:"Temperature Controlled",proof:["Reefer Capacity","Produce & Food","Operational Visibility"],
      label:"TEMPERATURE CONTROLLED",
      headlineES:"TEMPERATURA CONTROLADA. EJECUCIÓN CONTROLADA.",
      headlineEN:"CONTROLLED TEMPERATURE. CONTROLLED EXECUTION."
    },
    "Intermodal":{
      name:"Intermodal",
      descriptor:"Rail & Inland",proof:["Intermodal Options","Rail & Inland","Network Coverage"],
      label:"RAIL · RAMP · INLAND",
      headlineES:"MÁS FORMAS DE MOVER SU CARGA.",
      headlineEN:"MORE WAYS TO MOVE YOUR FREIGHT."
    },
    "Multiservicio":{
      name:"Multiservicio",
      descriptor:"DGL Ground Solutions",proof:["FTL","LTL","Drayage"],
      label:"DGL GROUND SOLUTIONS",
      headlineES:"UNA RELACIÓN. MÁS OPCIONES.",
      headlineEN:"ONE RELATIONSHIP. MORE OPTIONS."
    }
  };

  const CTA={
    "Generate Quote":{es:"ENVIAR MOVIMIENTO",en:"SEND A SHIPMENT"},
    "Recover Quote":{es:"ACTUALIZAR COTIZACIÓN",en:"UPDATE QUOTE"},
    "Reply":{es:"RESPONDER A DGL",en:"REPLY TO DGL"},
    "Meeting":{es:"AGENDAR CONVERSACIÓN",en:"SCHEDULE A CONVERSATION"},
    "Review Service":{es:"REVISAR SERVICIO",en:"REVIEW SERVICE"}
  };

  global.DGL_CREATIVE_LIBRARY_V5={VERSION,CREATIVE_SYSTEMS,OBJECTIVES,SERVICES,CTA};
})(window);
