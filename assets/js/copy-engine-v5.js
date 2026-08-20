
(function(global){
  "use strict";
  const L=()=>global.DGL_CREATIVE_LIBRARY_V5;

  function language(s){return s.language==="English"?"en":"es"}
  function svc(s){return L().SERVICES[s.service]||L().SERVICES.Multiservicio}
  function cta(s,lg){
    const c=L().CTA[s.ctaIntent]||L().CTA["Generate Quote"];
    return lg==="en"?c.en:c.es;
  }

  function qnb(s,lg,service){
    const w=s.qnbWindow||"0-14";
    if(lg==="en"){
      if(w==="30+") return {
        subjectA:`{{firstName}}, should we reopen this ${service} requirement?`,
        subjectB:"{{firstName}}, any update on this previous quote?",
        preheader:"If the requirement changed, we can build a fresh quote around the current movement.",
        headline:"SHOULD WE REOPEN IT?",
        body:`We quoted a {{service}} movement for {{company}} some time ago and wanted to check whether a similar requirement is still on your radar.`,
        body2:"If the dates, lane or conditions changed, send the current details and we can start from there."
      };
      if(w==="15-30") return {
        subjectA:`{{firstName}}, is this ${service} requirement still moving?`,
        subjectB:"{{firstName}}, should we update this quote?",
        preheader:"We can review the quote again if dates or requirements changed.",
        headline:"DOES THIS STILL NEED COVERAGE?",
        body:"I wanted to check whether the {{service}} movement we quoted for {{company}} is still in process.",
        body2:"If the date, lane or any requirement changed, send the update and we will review it again."
      };
      return {
        subjectA:`{{firstName}}, is this ${service} move still active?`,
        subjectB:"{{firstName}}, should we revisit this quote?",
        preheader:"We can review the movement again if dates or requirements changed.",
        headline:"STILL ACTIVE?",
        body:"I wanted to confirm whether the {{service}} movement we quoted for {{company}} is still in process.",
        body2:"If the date, origin, destination or any requirement changed, send the update and we can review it again."
      };
    }
    if(w==="30+") return {
      subjectA:`{{firstName}}, ¿retomamos este requerimiento ${service}?`,
      subjectB:"{{firstName}}, ¿hay alguna actualización sobre esta cotización?",
      preheader:"Si el requerimiento cambió, podemos preparar una nueva cotización con la información actual.",
      headline:"¿LO RETOMAMOS?",
      body:"Hace un tiempo cotizamos un movimiento {{service}} para {{company}} y quería validar si todavía tienen una necesidad similar en curso.",
      body2:"Si cambiaron las fechas, la ruta o las condiciones, envíeme la información actual y lo revisamos desde ahí."
    };
    if(w==="15-30") return {
      subjectA:`{{firstName}}, ¿este requerimiento ${service} sigue en movimiento?`,
      subjectB:"{{firstName}}, ¿actualizamos esta cotización?",
      preheader:"Podemos revisar nuevamente la tarifa si cambió la fecha o el requerimiento.",
      headline:"¿TODAVÍA NECESITAN COBERTURA?",
      body:"Quería validar si el movimiento {{service}} que cotizamos para {{company}} todavía sigue en proceso.",
      body2:"Si cambió la fecha, la ruta o alguna condición, envíeme la actualización y lo revisamos nuevamente."
    };
    return {
      subjectA:`{{firstName}}, ¿sigue activo este movimiento ${service}?`,
      subjectB:"{{firstName}}, ¿revisamos nuevamente esta cotización?",
      preheader:"Podemos revisar el movimiento nuevamente si cambió la fecha o el requerimiento.",
      headline:"¿SIGUE ACTIVO?",
      body:"Quería confirmar si el movimiento {{service}} que cotizamos para {{company}} todavía sigue en proceso.",
      body2:"Si cambió la fecha, origen, destino o alguna condición, envíemela y lo revisamos nuevamente."
    };
  }

  function generate(s){
    const lg=language(s), service=svc(s);
    let x;
    if(s.objective==="Quoted Not Booked") x=qnb(s,lg,service.name);
    else if(s.objective==="Retention"){
      x=lg==="en"?{
        subjectA:"{{firstName}}, staying close to {{company}}'s next move",
        subjectB:`{{firstName}}, planning your next ${service.name} requirements`,
        preheader:"DGL remains available for upcoming routes, volume changes and requirements.",
        headline:"STAYING CLOSE TO YOUR NEXT MOVE.",
        body:"We want to stay close to {{company}}'s transportation needs and remain available for upcoming {{service}} requirements.",
        body2:"If you have new lanes, volume changes or upcoming moves, we can review them with your team."
      }:{
        subjectA:"{{firstName}}, seguimos cerca de los próximos movimientos de {{company}}",
        subjectB:`{{firstName}}, ¿revisamos sus próximos requerimientos ${service.name}?`,
        preheader:"DGL sigue disponible para nuevas rutas, cambios de volumen y próximos movimientos.",
        headline:"CERCA DE SU PRÓXIMO MOVIMIENTO.",
        body:"Queremos mantenernos cerca de las necesidades de {{company}} y disponibles para sus próximos requerimientos {{service}}.",
        body2:"Si tienen nuevas rutas, cambios de volumen o movimientos próximos, podemos revisarlos con ustedes."
      };
    }
    else if(s.objective==="Cross-Sell"){
      x=lg==="en"?{
        subjectA:"{{firstName}}, another option for {{company}}",
        subjectB:`{{company}} + DGL | ${service.name} capacity`,
        preheader:"An additional DGL ground service for upcoming requirements.",
        headline:service.headlineEN,
        body:"In addition to the services {{company}} already works with, we want to make DGL's {{service}} capacity available to your team.",
        body2:"If you have a movement where this option could fit, send us the details and we will review it."
      }:{
        subjectA:"{{firstName}}, una opción adicional para {{company}}",
        subjectB:`{{company}} + DGL | capacidad ${service.name}`,
        preheader:"Una capacidad terrestre adicional para sus próximos requerimientos.",
        headline:service.headlineES,
        body:"Además de los servicios que {{company}} ya trabaja con DGL, queremos poner a su disposición nuestra capacidad {{service}}.",
        body2:"Si tienen un movimiento donde esta alternativa pueda encajar, compártanos los detalles y lo revisamos."
      };
    }
    else if(s.objective==="Lane Campaign"){
      x=lg==="en"?{
        subjectA:`{{firstName}}, capacity around ${s.lane||"this lane"}`,
        subjectB:"{{company}} | DGL lane opportunity",
        preheader:"A relevant DGL corridor for upcoming ground movements.",
        headline:"A STRONGER ROUTE FOR THE NEXT MOVE.",
        body:`DGL has a commercial opportunity around ${s.lane||"a relevant corridor"} and we wanted to make it available to {{company}}.`,
        body2:"If you have a current or upcoming movement on this lane, send us the details and we will review capacity."
      }:{
        subjectA:`{{firstName}}, capacidad para ${s.lane||"esta ruta"}`,
        subjectB:"{{company}} | oportunidad de corredor DGL",
        preheader:"Un corredor relevante de DGL para sus próximos movimientos terrestres.",
        headline:"UNA MEJOR RUTA PARA EL PRÓXIMO MOVIMIENTO.",
        body:`DGL tiene una oportunidad comercial alrededor de ${s.lane||"un corredor relevante"} y queremos ponerla a disposición de {{company}}.`,
        body2:"Si tienen un movimiento actual o próximo en esta ruta, envíenos los detalles y revisamos capacidad."
      };
    }
    else if(s.objective==="Service Campaign"){
      x=lg==="en"?{
        subjectA:`{{firstName}}, ${service.name} capacity for upcoming moves`,
        subjectB:`DGL | ${service.name} support for {{company}}`,
        preheader:"DGL ground capacity available for your upcoming requirements.",
        headline:service.headlineEN,
        body:"DGL is available to support {{company}} with upcoming {{service}} requirements and coordinated ground capacity.",
        body2:"Send us the movement details and we will review the best available option."
      }:{
        subjectA:`{{firstName}}, capacidad ${service.name} para sus próximos movimientos`,
        subjectB:`DGL | apoyo ${service.name} para {{company}}`,
        preheader:"Capacidad terrestre DGL disponible para sus próximos requerimientos.",
        headline:service.headlineES,
        body:"DGL está disponible para apoyar a {{company}} con sus próximos requerimientos {{service}} y capacidad terrestre coordinada.",
        body2:"Envíenos los detalles del movimiento y revisamos la mejor alternativa disponible."
      };
    }
    else{
      x=lg==="en"?{
        subjectA:`{{firstName}}, any ${service.name} moves coming up?`,
        subjectB:`{{firstName}}, DGL is ready for your next ${service.name} move`,
        preheader:"We are available to review your next ground transportation requirements.",
        headline:"LET'S MOVE AGAIN.",
        body:"We previously had the opportunity to support {{company}} and wanted to put DGL back at your disposal for upcoming {{service}} moves.",
        body2:"If you have anything to quote or schedule, send it over and we will review capacity and pricing."
      }:{
        subjectA:`{{firstName}}, ¿tienen movimientos ${service.name} próximos?`,
        subjectB:`{{firstName}}, DGL está disponible para su próximo movimiento ${service.name}`,
        preheader:"Estamos disponibles para revisar sus próximos requerimientos terrestres.",
        headline:"VOLVAMOS A MOVER CARGA.",
        body:"Hace un tiempo tuvimos la oportunidad de apoyar a {{company}} y quería volver a poner a DGL a su disposición para sus próximos movimientos {{service}}.",
        body2:"Si tienen algo por cotizar o programar, envíemelo y revisamos capacidad y tarifa."
      };
    }
    return {...x,cta:cta(s,lg),serviceProof:service.proof,serviceLabel:service.label};
  }

  global.DGL_COPY_ENGINE_V5={generate};
})(window);
