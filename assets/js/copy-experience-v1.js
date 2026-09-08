/**
 * DGL Copy Experience V1
 * Adds native pt-BR and replaces generic campaign copy with concise,
 * freight-specific commercial messaging for ES / EN / PT-BR.
 */
(function(global){
  "use strict";
  const base = global.DGL_COPY_ENGINE_V5;
  if(!base || typeof base.generate !== "function") return;
  const original = base.generate.bind(base);

  const clean = v => String(v == null ? "" : v).trim();
  const lg = s => {
    const x = clean(s.language).toLowerCase();
    if (x === "pt-br" || x.includes("portugu")) return "pt-BR";
    if (x === "english" || x === "en") return "en";
    return "es";
  };
  const svc = s => clean(s.service) || "FTL";

  const CTA = {
    es: {
      Retention:"ENVIAR PRÓXIMO REQUERIMIENTO",
      Reactivation:"ENVIAR REQUERIMIENTO",
      "Quoted Not Booked":"ACTUALIZAR MOVIMIENTO",
      "Cross-Sell":"REVISAR ESTA OPCIÓN",
      "Service Campaign":"SOLICITAR CAPACIDAD",
      "Lane Campaign":"ENVIAR RUTA"
    },
    en: {
      Retention:"SHARE YOUR NEXT REQUIREMENT",
      Reactivation:"SEND YOUR NEXT REQUIREMENT",
      "Quoted Not Booked":"UPDATE THIS MOVE",
      "Cross-Sell":"REVIEW THIS OPTION",
      "Service Campaign":"REQUEST CAPACITY",
      "Lane Campaign":"SEND YOUR LANE"
    },
    "pt-BR": {
      Retention:"ENVIAR PRÓXIMA NECESSIDADE",
      Reactivation:"ENVIAR NOVA NECESSIDADE",
      "Quoted Not Booked":"ATUALIZAR ESTE EMBARQUE",
      "Cross-Sell":"AVALIAR ESTA OPÇÃO",
      "Service Campaign":"SOLICITAR CAPACIDADE",
      "Lane Campaign":"ENVIAR ROTA"
    }
  };

  function retention(lang, service){
    const x = {
      es:{
        subjectA:`{{firstName}}, ¿tiene algún movimiento ${service} en planificación?`,
        subjectB:`{{company}} | revisemos lo que viene`,
        preheader:"Si tiene una ruta o movimiento próximo, podemos revisar capacidad y operación con anticipación.",
        headline:"PREPAREMOS EL PRÓXIMO MOVIMIENTO.",
        body:`Si {{company}} tiene algún movimiento ${service} en planificación para las próximas semanas, podemos revisarlo con anticipación.`,
        body2:"Envíenos origen, destino, fecha y requerimientos principales. Revisamos capacidad y el siguiente paso con el equipo."
      },
      en:{
        subjectA:`{{firstName}}, any ${service} moves coming up?`,
        subjectB:`{{company}} | let's review what is next`,
        preheader:"Share an upcoming lane or movement and we can review capacity before the date gets close.",
        headline:"LET'S PREPARE THE NEXT MOVE.",
        body:`If {{company}} has an upcoming ${service} movement, we can review the lane and operating requirements ahead of time.`,
        body2:"Send origin, destination, timing and the main requirements. We will review capacity and the next step with the team."
      },
      "pt-BR":{
        subjectA:`{{firstName}}, há algum embarque ${service} previsto?`,
        subjectB:`{{company}} | vamos avaliar os próximos movimentos`,
        preheader:"Envie uma próxima rota ou necessidade para avaliarmos capacidade com antecedência.",
        headline:"VAMOS PREPARAR O PRÓXIMO EMBARQUE.",
        body:`Se a {{company}} tiver algum embarque ${service} previsto para as próximas semanas, podemos avaliar a rota e os requisitos com antecedência.`,
        body2:"Envie origem, destino, data e os principais requisitos. Avaliamos capacidade e o próximo passo com a equipe."
      }
    };
    return x[lang];
  }

  function reactivation(lang, service){
    const x = {
      es:{
        subjectA:`{{firstName}}, ¿tiene una nueva ruta ${service} en puerta?`,
        subjectB:`{{company}} | envíenos su próximo movimiento`,
        preheader:"Compártanos el próximo requerimiento y revisamos una opción actual con DGL.",
        headline:"¿QUÉ MOVIMIENTO TIENE EN PUERTA?",
        body:`Si {{company}} tiene un nuevo movimiento ${service}, envíenos la ruta y la fecha.`,
        body2:"Revisamos capacidad, condiciones actuales y la alternativa que mejor encaje con el requerimiento."
      },
      en:{
        subjectA:`{{firstName}}, any new ${service} lanes coming up?`,
        subjectB:`{{company}} | send us your next move`,
        preheader:"Share the next requirement and we will review a current DGL option.",
        headline:"WHAT'S YOUR NEXT MOVE?",
        body:`If {{company}} has a new ${service} movement coming up, send us the lane and timing.`,
        body2:"We will review current capacity, operating requirements and the best available option."
      },
      "pt-BR":{
        subjectA:`{{firstName}}, há alguma nova rota ${service} prevista?`,
        subjectB:`{{company}} | envie seu próximo embarque`,
        preheader:"Envie a próxima necessidade e avaliamos uma opção atual com a DGL.",
        headline:"QUAL É O PRÓXIMO EMBARQUE?",
        body:`Se a {{company}} tiver um novo embarque ${service}, envie a rota e a data prevista.`,
        body2:"Avaliamos capacidade, requisitos operacionais e a opção mais adequada para a necessidade."
      }
    };
    return x[lang];
  }

  function qnb(lang, service, window){
    const older = window === "30+";
    const x = {
      es:{
        subjectA: older ? `{{firstName}}, ¿retomamos este movimiento ${service}?` : `{{firstName}}, ¿este movimiento ${service} sigue vigente?`,
        subjectB:"{{firstName}}, ¿actualizamos esta cotización?",
        preheader:"Si cambió la fecha, la ruta o el requerimiento, podemos revisarlo con la información actual.",
        headline: older ? "¿LO RETOMAMOS?" : "¿SIGUE VIGENTE?",
        body:`Quería validar si el movimiento ${service} que cotizamos para {{company}} todavía requiere cobertura.`,
        body2:"Si cambió la fecha, origen, destino, volumen o equipo, envíenos la actualización y revisamos la cotización con los datos actuales."
      },
      en:{
        subjectA: older ? `{{firstName}}, should we reopen this ${service} move?` : `{{firstName}}, is this ${service} move still active?`,
        subjectB:"{{firstName}}, should we update this quote?",
        preheader:"If timing, lane or requirements changed, we can review it with the current information.",
        headline: older ? "SHOULD WE REOPEN IT?" : "STILL ACTIVE?",
        body:`I wanted to confirm whether the ${service} movement we quoted for {{company}} still needs coverage.`,
        body2:"If timing, origin, destination, volume or equipment changed, send the update and we will review the quote with the current details."
      },
      "pt-BR":{
        subjectA: older ? `{{firstName}}, retomamos este embarque ${service}?` : `{{firstName}}, este embarque ${service} ainda está ativo?`,
        subjectB:"{{firstName}}, atualizamos esta cotação?",
        preheader:"Se a data, rota ou requisitos mudaram, podemos revisar com as informações atuais.",
        headline: older ? "RETOMAMOS ESTE EMBARQUE?" : "AINDA ESTÁ ATIVO?",
        body:`Quero confirmar se o embarque ${service} que cotamos para a {{company}} ainda precisa de cobertura.`,
        body2:"Se mudaram data, origem, destino, volume ou equipamento, envie a atualização e revisamos a cotação com os dados atuais."
      }
    };
    return x[lang];
  }

  function crossSell(lang, service){
    const x = {
      es:{
        subjectA:`{{firstName}}, ¿también necesita apoyo ${service}?`,
        subjectB:`{{company}} | sumemos una opción ${service}`,
        preheader:"Podemos revisar este servicio dentro de la misma relación comercial con DGL.",
        headline:`SUMEMOS ${service} CUANDO LO NECESITE.`,
        body:`Además de la operación que ya trabajamos con {{company}}, podemos revisar requerimientos ${service} cuando necesite una alternativa adicional.`,
        body2:"Envíenos una próxima ruta o movimiento y validamos si esta opción encaja operativamente."
      },
      en:{
        subjectA:`{{firstName}}, do you also need ${service} support?`,
        subjectB:`{{company}} | add a ${service} option`,
        preheader:"We can review this service through the DGL relationship you already use.",
        headline:`ADD ${service} WHEN IT FITS.`,
        body:`Alongside the work we already support for {{company}}, we can review ${service} requirements when you need another ground option.`,
        body2:"Send an upcoming lane or movement and we will validate the operating fit."
      },
      "pt-BR":{
        subjectA:`{{firstName}}, também precisa de suporte ${service}?`,
        subjectB:`{{company}} | adicione uma opção ${service}`,
        preheader:"Podemos avaliar este serviço dentro da relação comercial que você já tem com a DGL.",
        headline:`ADICIONE ${service} QUANDO FIZER SENTIDO.`,
        body:`Além da operação que já apoiamos para a {{company}}, podemos avaliar necessidades ${service} quando sua equipe precisar de outra opção terrestre.`,
        body2:"Envie uma próxima rota ou embarque e validamos o encaixe operacional."
      }
    };
    return x[lang];
  }

  function serviceCampaign(lang, service, lane){
    const laneBit = lane ? ` ${lane}` : "";
    const x = {
      es:{
        subjectA:`{{firstName}}, capacidad ${service}${laneBit} para su próximo movimiento`,
        subjectB:`DGL | revisemos una próxima ruta ${service}`,
        preheader:"Compártanos origen, destino y fecha para revisar capacidad actual.",
        headline:"ENVÍENOS LA PRÓXIMA RUTA.",
        body:`DGL puede revisar capacidad ${service} para próximos requerimientos de {{company}}.`,
        body2:"Envíenos origen, destino, fecha y equipo requerido. Revisamos cobertura y la opción disponible."
      },
      en:{
        subjectA:`{{firstName}}, ${service} capacity${laneBit} for your next move`,
        subjectB:`DGL | let's review an upcoming ${service} lane`,
        preheader:"Share origin, destination and timing so we can review current capacity.",
        headline:"SEND US THE NEXT LANE.",
        body:`DGL can review ${service} capacity for upcoming {{company}} requirements.`,
        body2:"Send origin, destination, timing and equipment requirements. We will review coverage and the available option."
      },
      "pt-BR":{
        subjectA:`{{firstName}}, capacidade ${service}${laneBit} para o próximo embarque`,
        subjectB:`DGL | vamos avaliar uma próxima rota ${service}`,
        preheader:"Envie origem, destino e data para avaliarmos capacidade atual.",
        headline:"ENVIE A PRÓXIMA ROTA.",
        body:`A DGL pode avaliar capacidade ${service} para próximas necessidades da {{company}}.`,
        body2:"Envie origem, destino, data e equipamento necessário. Avaliamos cobertura e a opção disponível."
      }
    };
    return x[lang];
  }

  function copyFor(s, lang){
    const service = svc(s);
    if(s.objective === "Retention") return retention(lang, service);
    if(s.objective === "Reactivation") return reactivation(lang, service);
    if(s.objective === "Quoted Not Booked") return qnb(lang, service, s.qnbWindow || "0-14");
    if(s.objective === "Cross-Sell") return crossSell(lang, service);
    if(s.objective === "Lane Campaign" || s.objective === "Service Campaign") return serviceCampaign(lang, service, clean(s.lane));
    return reactivation(lang, service);
  }

  base.generate = function(s){
    const lang = lg(s || {});
    let old = {};
    try { old = original(s || {}) || {}; } catch(_) {}
    const c = copyFor(s || {}, lang);
    return {
      ...old,
      ...c,
      cta: (CTA[lang] && CTA[lang][s.objective]) || (lang==="pt-BR" ? "ENVIAR NECESSIDADE" : lang==="en" ? "SEND REQUIREMENT" : "ENVIAR REQUERIMIENTO"),
      languageCode: lang
    };
  };

  function ensurePortuguese(){
    const sel = document.getElementById("v5Language");
    if(!sel) return;
    const has = [...sel.options].some(o => o.value === "pt-BR" || /Portugu/.test(o.textContent));
    if(!has){
      const o = document.createElement("option");
      o.value = "pt-BR";
      o.textContent = "Português (Brasil)";
      sel.appendChild(o);
    }
    try{
      const incoming = JSON.parse(sessionStorage.getItem("dgl_v5_campaign_context") || "null");
      if(incoming && (incoming.language === "pt-BR" || /Portugu/.test(incoming.language || "")) && sel.value !== "pt-BR"){
        sel.value = "pt-BR";
        sel.dispatchEvent(new Event("change",{bubbles:true}));
      }
    }catch(_){}
  }

  const observer = new MutationObserver(ensurePortuguese);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener("DOMContentLoaded",ensurePortuguese);
  global.DGL_COPY_EXPERIENCE_V1 = { languageCode: lg, ensurePortuguese };
})(window);
