/**
 * DGL Copy Engine V4
 * Deterministic local creative rules. AI-ready but does not claim to call AI.
 */
(function (global) {
  "use strict";

  const L = () => global.DGL_CREATIVE_LIBRARY_V4;
  const v = (x, fallback="") => String(x == null || x === "" ? fallback : x);

  function lang(strategy) {
    return /^en/i.test(strategy.language || "") || strategy.language === "English" ? "en" : "es";
  }

  function service(strategy) {
    return (L().SERVICES[strategy.service] || L().SERVICES.Multiservicio);
  }

  function mergeVars(text, strategy) {
    return String(text || "")
      .replaceAll("{{firstName}}", strategy.personalizeFirstName === false ? "" : "{{firstName}}")
      .replaceAll("{{company}}", strategy.personalizeCompany === false ? "su empresa" : "{{company}}")
      .replaceAll("{{service}}", strategy.service || "servicio")
      .replaceAll("{{lane}}", strategy.personalizeLane ? "{{lane}}" : "");
  }

  function generateReactivation(s, lg, svc) {
    const rel = s.angle || "Previous Relationship";
    if (lg === "en") {
      return {
        subjectA: "{{firstName}}, any " + svc.name + " moves coming up?",
        subjectB: "{{firstName}}, DGL is ready for your next " + svc.name + " move",
        preheader: "We are available to review your next ground transportation requirements.",
        headline: rel === "Ready to Quote" ? "READY WHEN YOU ARE." : "LET'S MOVE AGAIN.",
        body: "We previously had the opportunity to support {{company}} and wanted to put DGL back at your disposal for upcoming {{service}} moves.",
        body2: "If you have anything to quote or schedule, send it over and we will review capacity and pricing.",
      };
    }
    return {
      subjectA: "{{firstName}}, ¿tienen movimientos " + svc.name + " próximos?",
      subjectB: "{{firstName}}, DGL está disponible para su próximo movimiento " + svc.name,
      preheader: "Estamos disponibles para revisar sus próximos requerimientos terrestres.",
      headline: rel === "Ready to Quote" ? "LISTOS CUANDO USTEDES LO ESTÉN." : "VOLVAMOS A MOVER CARGA.",
      body: "Hace un tiempo tuvimos la oportunidad de apoyar a {{company}} y quería volver a poner a DGL a su disposición para sus próximos movimientos {{service}}.",
      body2: "Si tienen algo por cotizar o programar, envíemelo y revisamos capacidad y tarifa.",
    };
  }

  function generateQNB(s, lg, svc) {
    if (lg === "en") {
      return {
        subjectA: "{{firstName}}, is this " + svc.name + " move still active?",
        subjectB: "{{firstName}}, should we revisit this quote?",
        preheader: "We can review the movement again if dates or requirements changed.",
        headline: "STILL ACTIVE?",
        body: "I wanted to confirm whether the {{service}} movement we quoted for {{company}} is still in process.",
        body2: "If the date, origin, destination or any requirement changed, send the update and we can review it again."
      };
    }
    return {
      subjectA: "{{firstName}}, ¿sigue activo este movimiento " + svc.name + "?",
      subjectB: "{{firstName}}, ¿revisamos nuevamente esta cotización?",
      preheader: "Podemos revisar el movimiento nuevamente si cambió la fecha o el requerimiento.",
      headline: "¿SIGUE ACTIVO?",
      body: "Quería confirmar si el movimiento {{service}} que cotizamos para {{company}} todavía sigue en proceso.",
      body2: "Si cambió la fecha, origen, destino o alguna condición, envíemela y lo revisamos nuevamente."
    };
  }

  function generateCrossSell(s, lg, svc) {
    if (lg === "en") {
      return {
        subjectA: "{{firstName}}, another option for {{company}}",
        subjectB: "{{company}} + DGL | " + svc.name + " capacity",
        preheader: "An additional DGL ground service for upcoming requirements.",
        headline: svc.heroHeadlineEN,
        body: "In addition to the services {{company}} already works with, we want to make DGL's {{service}} capacity available to your team.",
        body2: "If you have a movement where this option could fit, send us the details and we will review it."
      };
    }
    return {
      subjectA: "{{firstName}}, una opción adicional para {{company}}",
      subjectB: "{{company}} + DGL | capacidad " + svc.name,
      preheader: "Una capacidad terrestre adicional para sus próximos requerimientos.",
      headline: svc.heroHeadlineES,
      body: "Además de los servicios que {{company}} ya trabaja con DGL, queremos poner a su disposición nuestra capacidad {{service}}.",
      body2: "Si tienen un movimiento donde esta alternativa pueda encajar, compártanos los detalles y lo revisamos."
    };
  }

  function generateRetention(s, lg, svc) {
    if (lg === "en") {
      return {
        subjectA: "{{firstName}}, staying close to {{company}}'s next move",
        subjectB: "{{firstName}}, planning your next " + svc.name + " requirements",
        preheader: "DGL remains available for upcoming routes, volume changes and requirements.",
        headline: "STAYING CLOSE TO YOUR NEXT MOVE.",
        body: "We want to stay close to {{company}}'s transportation needs and remain available for upcoming {{service}} requirements.",
        body2: "If you have new lanes, volume changes or upcoming moves, we can review them with your team."
      };
    }
    return {
      subjectA: "{{firstName}}, seguimos cerca de los próximos movimientos de {{company}}",
      subjectB: "{{firstName}}, ¿revisamos sus próximos requerimientos " + svc.name + "?",
      preheader: "DGL sigue disponible para nuevas rutas, cambios de volumen y próximos movimientos.",
      headline: "CERCA DE SU PRÓXIMO MOVIMIENTO.",
      body: "Queremos mantenernos cerca de las necesidades de {{company}} y disponibles para sus próximos requerimientos {{service}}.",
      body2: "Si tienen nuevas rutas, cambios de volumen o movimientos próximos, podemos revisarlos con ustedes."
    };
  }

  function generateService(s, lg, svc) {
    if (lg === "en") {
      return {
        subjectA: "{{firstName}}, " + svc.name + " capacity for upcoming moves",
        subjectB: "DGL | " + svc.name + " support for {{company}}",
        preheader: "DGL ground capacity available for your upcoming requirements.",
        headline: svc.heroHeadlineEN,
        body: "DGL is available to support {{company}} with upcoming {{service}} requirements and coordinated ground capacity.",
        body2: "Send us the movement details and we will review the best available option."
      };
    }
    return {
      subjectA: "{{firstName}}, capacidad " + svc.name + " para sus próximos movimientos",
      subjectB: "DGL | apoyo " + svc.name + " para {{company}}",
      preheader: "Capacidad terrestre DGL disponible para sus próximos requerimientos.",
      headline: svc.heroHeadlineES,
      body: "DGL está disponible para apoyar a {{company}} con sus próximos requerimientos {{service}} y capacidad terrestre coordinada.",
      body2: "Envíenos los detalles del movimiento y revisamos la mejor alternativa disponible."
    };
  }

  function generate(strategy) {
    const lg = lang(strategy);
    const svc = service(strategy);
    let copy;

    switch (strategy.objective) {
      case "Quoted Not Booked": copy = generateQNB(strategy, lg, svc); break;
      case "Cross-Sell": copy = generateCrossSell(strategy, lg, svc); break;
      case "Retention": copy = generateRetention(strategy, lg, svc); break;
      case "Service Campaign": copy = generateService(strategy, lg, svc); break;
      default: copy = generateReactivation(strategy, lg, svc);
    }

    const ctaMap = L().CTA_INTENTS[strategy.ctaIntent] || L().CTA_INTENTS["Generate Quote"];
    const cta = lg === "en" ? ctaMap.en : ctaMap.es;

    return {
      ...copy,
      cta,
      serviceProof: svc.proof.slice(),
      visualBrief: svc.visualBrief,
      visualLabel: svc.visualLabel,
      systemId: strategy.creativeSystem,
      generatedBy: "DGL Creative Rules V4"
    };
  }

  global.DGL_COPY_ENGINE_V4 = { generate, mergeVars };
})(window);
