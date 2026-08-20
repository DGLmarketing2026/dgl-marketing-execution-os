/**
 * DGL Campaign Sequences V4
 * Sequence recommendations only; no automatic sending.
 */
(function (global) {
  "use strict";

  function getSequence(objective, service, language) {
    const en = language === "English";
    const sequences = {
      "Quoted Not Booked": [
        { day: 0, type: "Designed Email", purpose: en ? "Confirm if movement is still active" : "Confirmar si el movimiento sigue activo" },
        { day: 4, type: "Short Follow-up", purpose: en ? "Ask for changed dates or requirements" : "Preguntar por cambios de fecha o requerimiento" },
        { day: 10, type: "Final Recovery Touch", purpose: en ? "Close the loop or reopen the quote" : "Cerrar ciclo o reabrir la cotización" }
      ],
      "Reactivation": [
        { day: 0, type: "Designed Email", purpose: en ? "Reopen relationship" : "Reabrir la relación" },
        { day: 5, type: "Personal Follow-up", purpose: en ? "Simple reply-driven follow-up" : "Seguimiento corto orientado a respuesta" },
        { day: 12, type: "Service Value Email", purpose: en ? "Reinforce relevant service capacity" : "Reforzar capacidad del servicio relevante" }
      ],
      "Retention": [
        { day: 0, type: "Executive Email", purpose: en ? "Stay close to upcoming requirements" : "Mantener cercanía con próximos requerimientos" },
        { day: 7, type: "Check-in", purpose: en ? "Ask about lanes or volume changes" : "Preguntar por rutas o cambios de volumen" },
        { day: 21, type: "Nurture", purpose: en ? "Remain visible without pressure" : "Mantener presencia sin presión" }
      ],
      "Cross-Sell": [
        { day: 0, type: "Service Introduction", purpose: en ? "Introduce additional capability" : "Introducir capacidad adicional" },
        { day: 8, type: "Service Proof", purpose: en ? "Reinforce service fit" : "Reforzar encaje del servicio" },
        { day: 20, type: "Follow-up", purpose: en ? "Ask for a movement to evaluate" : "Solicitar un movimiento para evaluar" }
      ],
      "Service Campaign": [
        { day: 0, type: "Service Hero", purpose: en ? "Activate current capacity" : "Activar capacidad disponible" },
        { day: 6, type: "Operational Proof", purpose: en ? "Reinforce coverage and execution" : "Reforzar cobertura y ejecución" },
        { day: 14, type: "Final CTA", purpose: en ? "Request a live opportunity" : "Solicitar oportunidad vigente" }
      ]
    };
    return sequences[objective] || sequences.Reactivation;
  }

  global.DGL_CAMPAIGN_SEQUENCES_V4 = { getSequence };
})(window);
