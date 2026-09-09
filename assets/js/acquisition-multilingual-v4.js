/**
 * DGL Acquisition Multilingual V4
 * Canonical rule: every New Business Acquisition Landing Page and every
 * social/ad creative is generated automatically in English, Español and
 * Português (Brasil) — real localized content per field, never a literal
 * generic translation. Market routing decides the default language only;
 * all three languages always exist.
 */
(function(g){
"use strict";

const FORM_LABELS={
  en:{firstName:"First name",lastName:"Last name",company:"Company",email:"Business email",country:"Country",service:"Service",origin:"Origin",destination:"Destination",notes:"Requirement",button:"REQUEST A QUOTE",confirmation:"Thank you. We received your requirement and will follow up shortly."},
  es:{firstName:"Nombre",lastName:"Apellido",company:"Empresa",email:"Email corporativo",country:"País",service:"Servicio",origin:"Origen",destination:"Destino",notes:"Requerimiento",button:"ENVIAR REQUERIMIENTO",confirmation:"Gracias. Recibimos su requerimiento y le daremos seguimiento en breve."},
  "pt-BR":{firstName:"Nome",lastName:"Sobrenome",company:"Empresa",email:"E-mail corporativo",country:"País",service:"Serviço",origin:"Origem",destination:"Destino",notes:"Necessidade",button:"SOLICITAR COTAÇÃO",confirmation:"Obrigado. Recebemos sua solicitação e retornaremos em breve."}
};

/* MARKET ROUTING — decides only the DEFAULT preview language.
   All three languages are always generated; nothing is skipped. */
function marketDefaultLanguage(market){
  const m=String(market||"").trim().toUpperCase();
  if(m.includes("BRAZIL")||m.includes("BRASIL"))return "pt-BR";
  if(m.includes("LATAM")||m.includes("LATIN")||m.includes("MEXICO")||m.includes("COLOMBIA")||m.includes("PERU")||m.includes("CHILE"))return "es";
  return "en";
}

const SERVICES=[
  {
    id:"FTL",system:"SPLIT FREIGHT",asset:"assets/creative/dgl-ftl-truck.webp",skin:"split",
    landing:{
      en:{headline:"U.S. FTL capacity when your operation cannot wait.",subheadline:"Share your lane and ship date. DGL confirms 53' dry van capacity across the U.S. inland network.",supportingCopy:"Full truckload coverage with dedicated equipment, real-time visibility and bilingual support from pickup to delivery.",cta:"REQUEST FTL CAPACITY",seo:{title:"FTL Trucking Capacity in the U.S. | DGL",description:"Request U.S. full truckload (FTL) capacity from DGL. Dedicated 53' dry van coverage, nationwide lanes and fast quote turnaround."},slugBase:"ftl-capacity-usa",utm:{source:"landing",medium:"organic",campaign:"ftl-capacity-usa"}},
      es:{headline:"Capacidad FTL en EE.UU. cuando su operación no puede esperar.",subheadline:"Comparta su ruta y fecha de embarque. DGL confirma capacidad de tráiler seco de 53' en la red terrestre de EE.UU.",supportingCopy:"Cobertura FTL con equipo dedicado, visibilidad en tiempo real y soporte bilingüe de la recolección a la entrega.",cta:"SOLICITAR CAPACIDAD FTL",seo:{title:"Capacidad de Transporte FTL en EE.UU. | DGL",description:"Solicite capacidad FTL en Estados Unidos con DGL. Cobertura dedicada de tráiler seco de 53', rutas nacionales y respuesta rápida."},slugBase:"capacidad-ftl-eeuu",utm:{source:"landing",medium:"organico",campaign:"capacidad-ftl-eeuu"}},
      "pt-BR":{headline:"Capacidade FTL nos EUA quando sua operação não pode esperar.",subheadline:"Envie a rota e a data do embarque. A DGL confirma capacidade de caminhão seco de 53' na rede terrestre dos EUA.",supportingCopy:"Cobertura FTL com equipamento dedicado, visibilidade em tempo real e suporte bilíngue da coleta à entrega.",cta:"SOLICITAR CAPACIDADE FTL",seo:{title:"Capacidade de Transporte FTL nos EUA | DGL",description:"Solicite capacidade FTL nos Estados Unidos com a DGL. Cobertura dedicada de caminhão seco de 53', rotas nacionais e resposta rápida."},slugBase:"capacidade-ftl-eua",utm:{source:"landing",medium:"organico",campaign:"capacidade-ftl-eua"}}
    },
    creative:{
      en:{headline:"U.S. FTL capacity when your operation cannot wait.",supportingLine:"Dedicated 53' dry van coverage, nationwide.",cta:"Request Capacity",socialPost:"Need a truck now? DGL confirms U.S. FTL capacity fast — dedicated equipment, real lanes, real answers.",description:"DGL full truckload capacity across the U.S. inland network.",hashtags:["#FTL","#Trucking","#FreightBroker","#DGL","#Logistics"]},
      es:{headline:"Capacidad FTL en EE.UU. cuando su operación no puede esperar.",supportingLine:"Cobertura dedicada de tráiler seco 53', a nivel nacional.",cta:"Solicitar Capacidad",socialPost:"¿Necesita un tráiler ahora? DGL confirma capacidad FTL en EE.UU. rápido — equipo dedicado, rutas reales, respuestas reales.",description:"Capacidad de tráiler completo (FTL) de DGL en la red terrestre de EE.UU.",hashtags:["#FTL","#TransporteDeCarga","#FreightBroker","#DGL","#Logistica"]},
      "pt-BR":{headline:"Capacidade FTL nos EUA quando sua operação não pode esperar.",supportingLine:"Cobertura dedicada de caminhão seco 53', em todo o país.",cta:"Solicitar Capacidade",socialPost:"Precisa de um caminhão agora? A DGL confirma capacidade FTL nos EUA rápido — equipamento dedicado, rotas reais, respostas reais.",description:"Capacidade de caminhão completo (FTL) da DGL na rede terrestre dos EUA.",hashtags:["#FTL","#TransporteDeCarga","#FreightBroker","#DGL","#Logistica"]}
    }
  },
  {
    id:"LTL",system:"EDITORIAL WHITE",asset:"assets/creative/dgl-ltl-terminal.png",skin:"editorial",
    landing:{
      en:{headline:"Smaller shipment. Same precision.",subheadline:"Ship less than a full trailer without losing visibility or reliability across every U.S. lane.",supportingCopy:"LTL coverage with consolidated freight handling, shipment tracking and dependable transit windows.",cta:"REQUEST LTL QUOTE",seo:{title:"LTL Freight Shipping in the U.S. | DGL",description:"Get an LTL freight quote from DGL. Reliable less-than-truckload coverage with full shipment visibility across the U.S."},slugBase:"ltl-shipping-usa",utm:{source:"landing",medium:"organic",campaign:"ltl-shipping-usa"}},
      es:{headline:"Menos volumen. La misma precisión.",subheadline:"Envíe menos de un tráiler completo sin perder visibilidad ni confiabilidad en cualquier ruta de EE.UU.",supportingCopy:"Cobertura LTL con manejo consolidado de carga, rastreo del embarque y tiempos de tránsito confiables.",cta:"SOLICITAR COTIZACIÓN LTL",seo:{title:"Transporte LTL en EE.UU. | DGL",description:"Obtenga una cotización LTL con DGL. Cobertura confiable de carga parcial con visibilidad total del embarque en EE.UU."},slugBase:"transporte-ltl-eeuu",utm:{source:"landing",medium:"organico",campaign:"transporte-ltl-eeuu"}},
      "pt-BR":{headline:"Menor volume. A mesma precisão.",subheadline:"Envie menos que um caminhão completo sem perder visibilidade ou confiabilidade em qualquer rota dos EUA.",supportingCopy:"Cobertura LTL com manuseio consolidado de carga, rastreamento do embarque e prazos de trânsito confiáveis.",cta:"SOLICITAR COTAÇÃO LTL",seo:{title:"Transporte LTL nos EUA | DGL",description:"Solicite uma cotação LTL com a DGL. Cobertura confiável de carga fracionada com visibilidade total do embarque nos EUA."},slugBase:"transporte-ltl-eua",utm:{source:"landing",medium:"organico",campaign:"transporte-ltl-eua"}}
    },
    creative:{
      en:{headline:"Smaller shipment. Same precision.",supportingLine:"Consolidated LTL coverage with full visibility.",cta:"Request LTL Quote",socialPost:"Don't need a full trailer? DGL LTL gets your shipment there with the same precision — tracked, on time, every lane.",description:"DGL less-than-truckload coverage across the U.S.",hashtags:["#LTL","#Freight","#SupplyChain","#DGL","#Logistics"]},
      es:{headline:"Menos volumen. La misma precisión.",supportingLine:"Cobertura LTL consolidada con visibilidad total.",cta:"Solicitar Cotización LTL",socialPost:"¿No necesita un tráiler completo? DGL LTL lleva su embarque con la misma precisión — rastreado, a tiempo, en cada ruta.",description:"Cobertura de carga parcial (LTL) de DGL en EE.UU.",hashtags:["#LTL","#Carga","#SupplyChain","#DGL","#Logistica"]},
      "pt-BR":{headline:"Menor volume. A mesma precisão.",supportingLine:"Cobertura LTL consolidada com visibilidade total.",cta:"Solicitar Cotação LTL",socialPost:"Não precisa de um caminhão completo? A DGL LTL leva seu embarque com a mesma precisão — rastreado, no prazo, em cada rota.",description:"Cobertura de carga fracionada (LTL) da DGL nos EUA.",hashtags:["#LTL","#Carga","#SupplyChain","#DGL","#Logistica"]}
    }
  },
  {
    id:"Drayage",system:"ROUTE INTELLIGENCE",asset:"assets/creative/dgl-container-transload.jpg",skin:"route",
    landing:{
      en:{headline:"From port to the next stop, without losing visibility.",subheadline:"Container drayage across major U.S. ports with coordinated inland transload and delivery.",supportingCopy:"Port-to-inland drayage with container tracking, transload coordination and on-time appointment management.",cta:"REQUEST DRAYAGE CAPACITY",seo:{title:"Container Drayage Services in the U.S. | DGL",description:"Request drayage capacity from DGL. Port-to-inland container moves with full visibility across major U.S. ports."},slugBase:"drayage-services-usa",utm:{source:"landing",medium:"organic",campaign:"drayage-services-usa"}},
      es:{headline:"Del puerto al siguiente punto, sin perder visibilidad.",subheadline:"Drayage de contenedores en los principales puertos de EE.UU. con transload y entrega inland coordinados.",supportingCopy:"Drayage de puerto a inland con rastreo de contenedores, coordinación de transload y gestión puntual de citas.",cta:"SOLICITAR CAPACIDAD DE DRAYAGE",seo:{title:"Servicios de Drayage de Contenedores en EE.UU. | DGL",description:"Solicite capacidad de drayage con DGL. Movimientos de contenedores de puerto a inland con visibilidad total en los principales puertos de EE.UU."},slugBase:"drayage-eeuu",utm:{source:"landing",medium:"organico",campaign:"drayage-eeuu"}},
      "pt-BR":{headline:"Do porto ao próximo ponto, sem perder visibilidade.",subheadline:"Drayage de contêineres nos principais portos dos EUA com transload e entrega inland coordenados.",supportingCopy:"Drayage de porto a inland com rastreamento de contêineres, coordenação de transload e gestão pontual de agendamentos.",cta:"SOLICITAR CAPACIDADE DE DRAYAGE",seo:{title:"Serviços de Drayage de Contêineres nos EUA | DGL",description:"Solicite capacidade de drayage com a DGL. Movimentações de contêineres de porto a inland com visibilidade total nos principais portos dos EUA."},slugBase:"drayage-eua",utm:{source:"landing",medium:"organico",campaign:"drayage-eua"}}
    },
    creative:{
      en:{headline:"From port to the next stop, without losing visibility.",supportingLine:"Container drayage across major U.S. ports.",cta:"Request Drayage Capacity",socialPost:"Port to inland, fully tracked. DGL drayage keeps your container moving — and visible — every step of the way.",description:"DGL container drayage and inland transload services.",hashtags:["#Drayage","#Container","#PortLogistics","#DGL","#Logistics"]},
      es:{headline:"Del puerto al siguiente punto, sin perder visibilidad.",supportingLine:"Drayage de contenedores en los principales puertos de EE.UU.",cta:"Solicitar Capacidad de Drayage",socialPost:"Del puerto al inland, totalmente rastreado. El drayage de DGL mantiene su contenedor en movimiento — y visible — en cada paso.",description:"Servicios de drayage de contenedores y transload inland de DGL.",hashtags:["#Drayage","#Contenedores","#LogisticaPortuaria","#DGL","#Logistica"]},
      "pt-BR":{headline:"Do porto ao próximo ponto, sem perder visibilidade.",supportingLine:"Drayage de contêineres nos principais portos dos EUA.",cta:"Solicitar Capacidade de Drayage",socialPost:"Do porto ao inland, totalmente rastreado. O drayage da DGL mantém seu contêiner em movimento — e visível — em cada etapa.",description:"Serviços de drayage de contêineres e transload inland da DGL.",hashtags:["#Drayage","#Conteineres","#LogisticaPortuaria","#DGL","#Logistica"]}
    }
  }
];

const LANGUAGES=["en","es","pt-BR"];

function landingContent(serviceId,lang){
  const s=SERVICES.find(x=>x.id===serviceId);
  if(!s)return null;
  const l=s.landing[lang]||s.landing.en;
  const fl=FORM_LABELS[lang]||FORM_LABELS.en;
  return {
    service:s.id,language:lang,
    headline:l.headline,subheadline:l.subheadline,supportingCopy:l.supportingCopy,cta:l.cta,
    formLabels:fl,confirmation:fl.confirmation,
    seoTitle:l.seo.title,seoDescription:l.seo.description,
    slug:`${l.slugBase}-${lang.toLowerCase()}`,
    utm:{utm_source:l.utm.source,utm_medium:l.utm.medium,utm_campaign:l.utm.campaign,utm_content:lang}
  };
}
function creativeContent(serviceId,lang){
  const s=SERVICES.find(x=>x.id===serviceId);
  if(!s)return null;
  const c=s.creative[lang]||s.creative.en;
  return {service:s.id,language:lang,...c};
}
function allLanguages(serviceId,kind){
  return LANGUAGES.map(lang=>kind==="creative"?creativeContent(serviceId,lang):landingContent(serviceId,lang));
}

g.DGL_ACQUISITION_I18N_V4={
  SERVICES,LANGUAGES,FORM_LABELS,
  marketDefaultLanguage,
  landingContent,creativeContent,allLanguages
};
})(window);
