// DGL Marketing OS — New Business Acquisition Automation V2
// Separate from NOVA -> AM -> AURA -> Existing Account Growth.
// All normal operations are event/trigger driven. No manual lead lists.
// Every signal generates all 3 language variants (EN/ES/PT-BR). Market
// routing only decides which variant is defaultForMarket; none is skipped.

var MKT_V6_ACQ_SCHEMA={
  MKT_ACQ_SIGNALS:['signalId','source','channel','market','service','objective','campaignBrief','priority','languageOverride','status','sourceUpdatedAt','createdAt','processedAt','updatedAt'],
  MKT_ACQ_LANDING_PAGES:['landingPageId','signalId','variantKey','language','defaultForMarket','campaignKey','channel','market','service','objective','designSystem','assetPath','slug','headline','subheadline','supportingCopy','ctaLabel','seoTitle','seoDescription','formVariant','utmSource','utmMedium','utmCampaign','status','publishedUrl','wpPageId','wpUrl','cycleId','createdAt','updatedAt'],
  MKT_ACQ_LEADS:['leadId','landingPageId','signalId','createdAt','firstName','lastName','company','email','phone','country','service','origin','destination','notes','utmSource','utmMedium','utmCampaign','validationStatus','dedupeStatus','existingContactId','existingAccountId','qualificationStatus','scoreStatus','routingStatus','salesforceLeadId','salesforceLeadOwner','cycleId','routedAt','updatedAt'],
  MKT_ACQ_RUNS:['runId','startedAt','finishedAt','signalsEvaluated','landingsGenerated','landingsReady','leadsEvaluated','leadsQualified','leadsDeduped','salesforceRouted','blocked','status','updatedAt']
};

var MKT_V6_ACQ_LANGUAGES=['en','es','pt-BR'];

function v6AcqText_(v){return String(v==null?'':v).trim();}
function v6AcqNow_(){return new Date().toISOString();}
function v6AcqId_(prefix){return prefix+'-'+Utilities.getUuid().replace(/-/g,'').slice(0,18).toUpperCase();}
function v6AcqBook_(){
  var anchor=(typeof v6Sheet_==='function'&&(v6Sheet_('MKT_OPPORTUNITIES')||v6Sheet_('MKT_ACCOUNT_PIPELINE')))||null;
  if(anchor)return anchor.getParent();
  var id=PropertiesService.getScriptProperties().getProperty('MKT_DATA_HUB_ID');
  if(id)return SpreadsheetApp.openById(id);
  throw new Error('DATA HUB NOT RESOLVED');
}
function v6AcqSheet_(name){return v6AcqBook_().getSheetByName(name);}
function v6AcqEnsureSheet_(name,headers){
  var ss=v6AcqBook_(),sheet=ss.getSheetByName(name)||ss.insertSheet(name),last=sheet.getLastColumn();
  var existing=last?sheet.getRange(1,1,1,last).getValues()[0].map(v6AcqText_):[];
  if(!existing.length||!existing.some(Boolean)){sheet.getRange(1,1,1,headers.length).setValues([headers]);return sheet;}
  var missing=headers.filter(function(h){return existing.indexOf(h)<0;});
  if(missing.length)sheet.getRange(1,last+1,1,missing.length).setValues([missing]);
  return sheet;
}
function v6AcqHeaders_(sheet){var n=sheet.getLastColumn();return n?sheet.getRange(1,1,1,n).getValues()[0].map(v6AcqText_):[];}
function v6AcqRows_(name){
  var sheet=v6AcqSheet_(name);if(!sheet||sheet.getLastRow()<2)return [];
  var headers=v6AcqHeaders_(sheet),values=sheet.getRange(2,1,sheet.getLastRow()-1,headers.length).getValues();
  return values.map(function(row){var r={};headers.forEach(function(h,i){r[h]=row[i];});return r;});
}
function v6AcqUpsert_(name,keys,record){
  var sheet=v6AcqEnsureSheet_(name,MKT_V6_ACQ_SCHEMA[name]),headers=v6AcqHeaders_(sheet),rows=v6AcqRows_(name),idx=-1;
  rows.some(function(r,i){var ok=keys.every(function(k){return v6AcqText_(r[k])===v6AcqText_(record[k]);});if(ok){idx=i;return true;}return false;});
  var values=headers.map(function(h){return record[h]==null?'':record[h];});
  if(idx>=0)sheet.getRange(idx+2,1,1,headers.length).setValues([values]);else sheet.appendRow(values);
  return record;
}
function v6AcqSetup_(){
  Object.keys(MKT_V6_ACQ_SCHEMA).forEach(function(name){v6AcqEnsureSheet_(name,MKT_V6_ACQ_SCHEMA[name]);});
  var boot=v6AcqBootstrapEvergreenSignals_(),trigger=v6AcqInstallAutomationTrigger_();
  return {status:'ACQUISITION AUTOMATION READY',sheets:Object.keys(MKT_V6_ACQ_SCHEMA).length,evergreenSignals:boot.created,trigger:trigger.status};
}

// Market routing decides only the DEFAULT variant. All 3 languages are
// always generated for every signal (see v6AcqEnsureLandingVariants_).
function v6AcqLanguageForMarket_(market,override){
  var o=v6AcqText_(override);if(MKT_V6_ACQ_LANGUAGES.indexOf(o)>=0)return o;
  var m=v6AcqText_(market).toUpperCase();
  if(['BR','BRAZIL','BRASIL','SÃO PAULO','SAO PAULO'].some(function(x){return m.indexOf(x)>=0;}))return 'pt-BR';
  var es=['MEXICO','MÉXICO','COLOMBIA','PANAMA','PANAMÁ','PERU','PERÚ','CHILE','ARGENTINA','ECUADOR','COSTA RICA','GUATEMALA','EL SALVADOR','HONDURAS','NICARAGUA','DOMINICAN','REPÚBLICA DOMINICANA','REPUBLICA DOMINICANA','URUGUAY','PARAGUAY','BOLIVIA','LATAM','LATIN'];
  if(es.some(function(x){return m.indexOf(x)>=0;}))return 'es';
  return 'en';
}
function v6AcqSlug_(v){return v6AcqText_(v).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80);}

// Design systems: FTL/LTL/Drayage each map to a governed visual system and
// a real repository asset. Multiservice/other falls back to the FTL visual
// (same DGL brand system) rather than inventing a new one.
var MKT_V6_ACQ_DESIGN={
  FTL:{designSystem:'SPLIT FREIGHT',assetPath:'assets/creative/dgl-ftl-truck.webp'},
  LTL:{designSystem:'EDITORIAL WHITE',assetPath:'assets/creative/dgl-ltl-terminal.png'},
  Drayage:{designSystem:'ROUTE INTELLIGENCE',assetPath:'assets/creative/dgl-container-transload.jpg'}
};
function v6AcqDesignFor_(service){return MKT_V6_ACQ_DESIGN[v6AcqText_(service)]||{designSystem:'SPLIT FREIGHT',assetPath:'assets/creative/dgl-ftl-truck.webp'};}

// Real, freight-specific, non-literal-translation copy per language. Every
// field a landing needs (headline/subheadline/supportingCopy/cta/SEO/slug)
// is generated here so EN/ES/PT-BR are equally complete, never a fallback
// translation of one master language.
function v6AcqI18n_(service){
  var s=v6AcqText_(service);
  if(s==='FTL')return {
    en:{headline:"U.S. FTL capacity when your operation cannot wait.",subheadline:"Share your lane and ship date. DGL can review 53' dry van capacity across the U.S. inland network.",supportingCopy:"Full truckload coverage with dedicated equipment, shipment visibility and bilingual support from pickup to delivery.",cta:"REQUEST FTL CAPACITY",seoTitle:"FTL Trucking Capacity in the U.S. | DGL",seoDescription:"Request U.S. full truckload (FTL) capacity from DGL. Dedicated 53' dry van coverage, inland lanes and a fast response.",slugBase:"ftl-capacity-usa"},
    es:{headline:"Capacidad FTL en EE.UU. cuando su operación no puede esperar.",subheadline:"Comparta su ruta y fecha de embarque. DGL revisa capacidad de dry van de 53' en la red terrestre de EE.UU.",supportingCopy:"Cobertura FTL con equipo dedicado, visibilidad del embarque y soporte bilingüe de la recolección a la entrega.",cta:"SOLICITAR CAPACIDAD FTL",seoTitle:"Capacidad de Transporte FTL en EE.UU. | DGL",seoDescription:"Solicite capacidad FTL en Estados Unidos con DGL. Cobertura de dry van 53', rutas inland y respuesta rápida.",slugBase:"capacidad-ftl-eeuu"},
    'pt-BR':{headline:"Capacidade FTL nos EUA quando sua operação não pode esperar.",subheadline:"Envie a rota e a data do embarque. A DGL avalia capacidade de dry van de 53 pés na rede terrestre dos EUA.",supportingCopy:"Cobertura FTL com equipamento dedicado, visibilidade do embarque e suporte bilíngue da coleta à entrega.",cta:"SOLICITAR CAPACIDADE FTL",seoTitle:"Capacidade de Transporte FTL nos EUA | DGL",seoDescription:"Solicite capacidade FTL nos Estados Unidos com a DGL. Cobertura de dry van de 53 pés, rotas inland e resposta rápida.",slugBase:"capacidade-ftl-eua"}
  };
  if(s==='LTL')return {
    en:{headline:"Smaller shipment. Same precision.",subheadline:"Ship less than a full trailer with shipment visibility across your U.S. lanes.",supportingCopy:"LTL coverage with consolidated freight handling, shipment tracking and estimated transit windows.",cta:"REQUEST LTL QUOTE",seoTitle:"LTL Freight Shipping in the U.S. | DGL",seoDescription:"Request an LTL freight quote from DGL. Less-than-truckload coverage with shipment visibility across the U.S.",slugBase:"ltl-shipping-usa"},
    es:{headline:"Menos volumen. La misma precisión.",subheadline:"Envíe menos de un tráiler completo con visibilidad del embarque en sus rutas de EE.UU.",supportingCopy:"Cobertura LTL con manejo consolidado de carga, rastreo del embarque y ventanas de tránsito estimadas.",cta:"SOLICITAR COTIZACIÓN LTL",seoTitle:"Transporte LTL en EE.UU. | DGL",seoDescription:"Solicite una cotización LTL con DGL. Cobertura de carga parcial con visibilidad del embarque en EE.UU.",slugBase:"transporte-ltl-eeuu"},
    'pt-BR':{headline:"Menor volume. A mesma precisão.",subheadline:"Envie menos que um caminhão completo com visibilidade do embarque nas suas rotas dos EUA.",supportingCopy:"Cobertura LTL com manuseio consolidado de carga, rastreamento do embarque e janelas de trânsito estimadas.",cta:"SOLICITAR COTAÇÃO LTL",seoTitle:"Transporte LTL nos EUA | DGL",seoDescription:"Solicite uma cotação LTL com a DGL. Cobertura de carga fracionada com visibilidade do embarque nos EUA.",slugBase:"transporte-ltl-eua"}
  };
  if(s==='Drayage')return {
    en:{headline:"From port to the next stop, without losing visibility.",subheadline:"Container drayage across major U.S. ports with coordinated inland transload and delivery.",supportingCopy:"Port-to-inland drayage with container tracking, transload coordination and appointment coordination.",cta:"REQUEST DRAYAGE CAPACITY",seoTitle:"Container Drayage Services in the U.S. | DGL",seoDescription:"Request drayage capacity from DGL. Port-to-inland container moves with shipment visibility across major U.S. ports.",slugBase:"drayage-services-usa"},
    es:{headline:"Del puerto al siguiente punto, sin perder visibilidad.",subheadline:"Drayage de contenedores en los principales puertos de EE.UU. con transload y entrega inland coordinados.",supportingCopy:"Drayage de puerto a inland con rastreo de contenedores, coordinación de transload y coordinación de citas.",cta:"SOLICITAR CAPACIDAD DE DRAYAGE",seoTitle:"Servicios de Drayage de Contenedores en EE.UU. | DGL",seoDescription:"Solicite capacidad de drayage con DGL. Movimientos de contenedores de puerto a inland con visibilidad del embarque en los principales puertos de EE.UU.",slugBase:"drayage-eeuu"},
    'pt-BR':{headline:"Do porto ao próximo ponto, sem perder visibilidade.",subheadline:"Drayage de contêineres nos principais portos dos EUA com transload e entrega inland coordenados.",supportingCopy:"Drayage de porto a inland com rastreamento de contêineres, coordenação de transload e coordenação de agendamentos.",cta:"SOLICITAR CAPACIDADE DE DRAYAGE",seoTitle:"Serviços de Drayage de Contêineres nos EUA | DGL",seoDescription:"Solicite capacidade de drayage com a DGL. Movimentações de contêineres de porto a inland com visibilidade do embarque nos principais portos dos EUA.",slugBase:"drayage-eua"}
  };
  return {
    en:{headline:"Need a reliable inland freight partner?",subheadline:"Share your lane and requirements. DGL can review FTL, LTL and Drayage options across the U.S.",supportingCopy:"One relationship for FTL, LTL and Drayage coverage, with shipment visibility and bilingual support.",cta:"REQUEST A QUOTE",seoTitle:"Inland Freight Broker in the U.S. | DGL",seoDescription:"Request inland freight support from DGL across FTL, LTL and Drayage in the U.S.",slugBase:"inland-freight-usa"},
    es:{headline:"¿Necesita mover carga terrestre en Estados Unidos?",subheadline:"Compártanos la ruta y el requerimiento. DGL revisa opciones de FTL, LTL y Drayage para su operación inland.",supportingCopy:"Una sola relación para cobertura FTL, LTL y Drayage, con visibilidad del embarque y soporte bilingüe.",cta:"ENVIAR REQUERIMIENTO",seoTitle:"Bróker de Carga Terrestre en EE.UU. | DGL",seoDescription:"Solicite apoyo de carga terrestre con DGL en FTL, LTL y Drayage en EE.UU.",slugBase:"carga-terrestre-eeuu"},
    'pt-BR':{headline:"Precisa movimentar carga terrestre nos Estados Unidos?",subheadline:"Envie a rota e os detalhes da operação. A DGL avalia opções de FTL, LTL e Drayage para sua carga nos EUA.",supportingCopy:"Uma única relação para cobertura FTL, LTL e Drayage, com visibilidade do embarque e suporte bilíngue.",cta:"SOLICITAR COTAÇÃO",seoTitle:"Despachante de Carga Terrestre nos EUA | DGL",seoDescription:"Solicite apoio de carga terrestre com a DGL em FTL, LTL e Drayage nos EUA.",slugBase:"carga-terrestre-eua"}
  };
}
function v6AcqCampaignKey_(signal){return [signal.source,signal.channel,signal.market,signal.service,signal.objective].map(v6AcqSlug_).filter(Boolean).join('-');}
function v6AcqPublicBase_(){return v6AcqText_(PropertiesService.getScriptProperties().getProperty('ACQ_PUBLIC_LANDING_BASE_URL')).replace(/\/$/,'');}

// Idempotent: signal + language = one variant, never duplicated across runs.
// Every signal always produces all 3 language variants; defaultForMarket
// marks exactly one of them (per v6AcqLanguageForMarket_) without skipping
// the other two.
function v6AcqEnsureLandingVariants_(signal){
  var base=v6AcqPublicBase_(),defaultLanguage=v6AcqLanguageForMarket_(signal.market,signal.languageOverride);
  var design=v6AcqDesignFor_(signal.service),i18n=v6AcqI18n_(signal.service),key=v6AcqCampaignKey_(signal),now=v6AcqNow_();
  var existingAll=v6AcqRows_('MKT_ACQ_LANDING_PAGES').filter(function(r){return v6AcqText_(r.signalId)===v6AcqText_(signal.signalId);});
  var createdCount=0,records=[];
  MKT_V6_ACQ_LANGUAGES.forEach(function(language){
    var existing=existingAll.filter(function(r){return v6AcqText_(r.language)===language;})[0];
    var isDefault=language===defaultLanguage;
    if(existing){
      var changed=false;
      if(v6AcqText_(existing.defaultForMarket)!==String(isDefault)){existing.defaultForMarket=isDefault;changed=true;}
      if(base&&(!v6AcqText_(existing.publishedUrl)||v6AcqText_(existing.status)!=='LIVE')){existing.status='LIVE';existing.publishedUrl=base+'?slug='+encodeURIComponent(existing.slug);changed=true;}
      if(changed){existing.updatedAt=now;v6AcqUpsert_('MKT_ACQ_LANDING_PAGES',['signalId','language'],existing);}
      records.push(existing);
      return;
    }
    var content=i18n[language],slug=v6AcqSlug_((signal.service||'inland')+'-'+(signal.market||'usa')+'-'+language+'-'+signal.signalId.slice(-6));
    var record={
      landingPageId:v6AcqId_('LP'),signalId:signal.signalId,variantKey:key+'-'+language,language:language,defaultForMarket:isDefault,
      campaignKey:key,channel:signal.channel||'',market:signal.market||'',service:signal.service||'Multiservice',objective:signal.objective||'Lead Generation',
      designSystem:design.designSystem,assetPath:design.assetPath,slug:slug,
      headline:content.headline,subheadline:content.subheadline,supportingCopy:content.supportingCopy,ctaLabel:content.cta,
      seoTitle:content.seoTitle,seoDescription:content.seoDescription,formVariant:'NEW_BUSINESS_REQUIREMENT',
      utmSource:v6AcqSlug_(signal.source||signal.channel||'direct'),utmMedium:v6AcqSlug_(signal.channel||'landing'),utmCampaign:key,
      status:base?'LIVE':'READY_TO_PUBLISH',publishedUrl:base?(base+'?slug='+encodeURIComponent(slug)):'',
      createdAt:now,updatedAt:now
    };
    v6AcqUpsert_('MKT_ACQ_LANDING_PAGES',['signalId','language'],record);
    createdCount++;records.push(record);
  });
  return {created:createdCount,records:records};
}

function v6AcqBootstrapEvergreenSignals_(){
  v6AcqEnsureSheet_('MKT_ACQ_SIGNALS',MKT_V6_ACQ_SCHEMA.MKT_ACQ_SIGNALS);
  var existing=v6AcqRows_('MKT_ACQ_SIGNALS'),defs=[
    {signalId:'ACQ-EVERGREEN-USA-INLAND',source:'EVERGREEN',channel:'Organic / Paid',market:'USA',service:'Multiservice',objective:'Lead Generation',campaignBrief:'USA inland freight acquisition',priority:1},
    {signalId:'ACQ-EVERGREEN-LATAM-INLAND',source:'EVERGREEN',channel:'Organic / Paid',market:'LATAM / Mexico Colombia Panama Peru',service:'Multiservice',objective:'Lead Generation',campaignBrief:'LATAM companies needing inland freight in USA',priority:1,languageOverride:'es'},
    {signalId:'ACQ-EVERGREEN-BRAZIL-INLAND',source:'EVERGREEN',channel:'Organic / Paid',market:'Brazil',service:'Multiservice',objective:'Lead Generation',campaignBrief:'Brazil companies needing inland freight in USA',priority:1,languageOverride:'pt-BR'},
    {signalId:'ACQ-EVERGREEN-USA-FTL',source:'EVERGREEN',channel:'Organic / Paid',market:'USA',service:'FTL',objective:'Lead Generation',campaignBrief:'FTL acquisition',priority:2},
    {signalId:'ACQ-EVERGREEN-USA-LTL',source:'EVERGREEN',channel:'Organic / Paid',market:'USA',service:'LTL',objective:'Lead Generation',campaignBrief:'LTL acquisition',priority:2},
    {signalId:'ACQ-EVERGREEN-USA-DRAYAGE',source:'EVERGREEN',channel:'Organic / Paid',market:'USA',service:'Drayage',objective:'Lead Generation',campaignBrief:'Drayage acquisition',priority:2}
  ],created=0,now=v6AcqNow_();
  defs.forEach(function(d){if(existing.some(function(r){return v6AcqText_(r.signalId)===d.signalId;}))return;d.status='DETECTED';d.sourceUpdatedAt=now;d.createdAt=now;d.processedAt='';d.updatedAt=now;v6AcqUpsert_('MKT_ACQ_SIGNALS',['signalId'],d);created++;});
  return {created:created,total:defs.length};
}
function v6AcqIngestSignal_(payload){
  var p=payload||{},id=v6AcqText_(p.signalId)||v6AcqId_('SIG'),now=v6AcqNow_();
  if(!v6AcqText_(p.source))throw new Error('source REQUIRED');
  if(!v6AcqText_(p.market))throw new Error('market REQUIRED');
  var row={signalId:id,source:v6AcqText_(p.source),channel:v6AcqText_(p.channel)||'Unknown',market:v6AcqText_(p.market),service:v6AcqText_(p.service)||'Multiservice',objective:v6AcqText_(p.objective)||'Lead Generation',campaignBrief:v6AcqText_(p.campaignBrief),priority:Number(p.priority||3),languageOverride:v6AcqText_(p.languageOverride),status:'DETECTED',sourceUpdatedAt:v6AcqText_(p.sourceUpdatedAt)||now,createdAt:v6AcqText_(p.createdAt)||now,processedAt:'',updatedAt:now};
  return v6AcqUpsert_('MKT_ACQ_SIGNALS',['signalId'],row);
}
function v6AcqEvaluateSignals_(){
  v6AcqBootstrapEvergreenSignals_();var rows=v6AcqRows_('MKT_ACQ_SIGNALS'),evaluated=0,generated=0,ready=0,now=v6AcqNow_();
  rows.forEach(function(r){
    var st=v6AcqText_(r.status).toUpperCase();if(['DETECTED','NEW','READY'].indexOf(st)<0)return;
    evaluated++;
    var result=v6AcqEnsureLandingVariants_(r);
    generated+=result.created;
    ready+=result.records.filter(function(x){return x.status==='LIVE'||x.status==='READY_TO_PUBLISH';}).length;
    r.status='PROCESSED';r.processedAt=now;r.updatedAt=now;v6AcqUpsert_('MKT_ACQ_SIGNALS',['signalId'],r);
  });
  return {evaluated:evaluated,generated:generated,ready:ready};
}

function v6AcqNormalizeEmail_(v){return v6AcqText_(v).toLowerCase();}
function v6AcqValidEmail_(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v6AcqNormalizeEmail_(v));}
function v6AcqRouteLead_(lead){
  var now=v6AcqNow_(),email=v6AcqNormalizeEmail_(lead.email),required=v6AcqText_(lead.company)&&email&&v6AcqText_(lead.service),complete=v6AcqText_(lead.origin)&&v6AcqText_(lead.destination);
  lead.validationStatus=required&&v6AcqValidEmail_(email)?'VALID':'INVALID';lead.email=email;
  if(lead.validationStatus!=='VALID'){lead.routingStatus='BLOCKED_VALIDATION';lead.updatedAt=now;return v6AcqUpsert_('MKT_ACQ_LEADS',['leadId'],lead);}
  var secure=[];try{if(typeof v6Rows_==='function')secure=v6Rows_('MKT_CONTACTS_SECURE');}catch(_){secure=[];}
  var match=secure.filter(function(r){return v6AcqNormalizeEmail_(r.email)===email;})[0]||null;
  if(match){lead.dedupeStatus='EXISTING_CONTACT';lead.existingContactId=v6AcqText_(match.contactId);lead.existingAccountId=v6AcqText_(match.accountId);lead.qualificationStatus='EXISTING_ACCOUNT_MATCH';lead.scoreStatus='NOT_APPLICABLE';lead.routingStatus='EXISTING_ACCOUNT_POLICY';lead.updatedAt=now;return v6AcqUpsert_('MKT_ACQ_LEADS',['leadId'],lead);}
  var duplicates=v6AcqRows_('MKT_ACQ_LEADS').filter(function(r){return v6AcqText_(r.leadId)!==v6AcqText_(lead.leadId)&&v6AcqNormalizeEmail_(r.email)===email;});
  if(duplicates.length){lead.dedupeStatus='DUPLICATE_NEW_LEAD';lead.qualificationStatus='DUPLICATE';lead.scoreStatus='NOT_APPLICABLE';lead.routingStatus='SUPPRESSED_DUPLICATE';lead.updatedAt=now;return v6AcqUpsert_('MKT_ACQ_LEADS',['leadId'],lead);}
  lead.dedupeStatus='NEW';lead.qualificationStatus=complete?'QUALIFIED_REQUIREMENT':'NURTURE_REQUIRED';lead.scoreStatus=PropertiesService.getScriptProperties().getProperty('ACQ_SCORE_RULES_JSON')?'RULESET_CONFIGURED':'DATA_DRIVEN_SCORE_NOT_CONFIGURED';
  var endpoint=v6AcqText_(PropertiesService.getScriptProperties().getProperty('ACQ_SALESFORCE_LEAD_ENDPOINT')),token=v6AcqText_(PropertiesService.getScriptProperties().getProperty('ACQ_SALESFORCE_TOKEN'));
  if(!endpoint){lead.routingStatus='READY_FOR_SALESFORCE';lead.updatedAt=now;return v6AcqUpsert_('MKT_ACQ_LEADS',['leadId'],lead);}
  try{
    var response=UrlFetchApp.fetch(endpoint,{method:'post',contentType:'application/json',headers:token?{Authorization:'Bearer '+token}:{},payload:JSON.stringify({source:'DGL_MARKETING_OS',leadId:lead.leadId,firstName:lead.firstName,lastName:lead.lastName,company:lead.company,email:lead.email,phone:lead.phone,country:lead.country,service:lead.service,origin:lead.origin,destination:lead.destination,notes:lead.notes,utmSource:lead.utmSource,utmMedium:lead.utmMedium,utmCampaign:lead.utmCampaign}),muteHttpExceptions:true});
    var code=response.getResponseCode(),body={};try{body=JSON.parse(response.getContentText()||'{}');}catch(_){}
    // The owner is only ever taken from the Salesforce response. If Salesforce
    // does not return one, salesforceLeadOwner stays empty — never invented.
    if(code>=200&&code<300){lead.routingStatus='ROUTED_TO_SALESFORCE';lead.salesforceLeadId=v6AcqText_(body.id||body.leadId);lead.salesforceLeadOwner=v6AcqText_(body.ownerName||body.owner||'');lead.routedAt=now;}else lead.routingStatus='SALESFORCE_ERROR_'+code;
  }catch(err){lead.routingStatus='SALESFORCE_ERROR';}
  lead.updatedAt=now;return v6AcqUpsert_('MKT_ACQ_LEADS',['leadId'],lead);
}
function v6AcqRouteLeads_(){
  var rows=v6AcqRows_('MKT_ACQ_LEADS'),evaluated=0,qualified=0,deduped=0,routed=0,blocked=0;
  rows.forEach(function(r){var st=v6AcqText_(r.routingStatus).toUpperCase();if(['ROUTED_TO_SALESFORCE','EXISTING_ACCOUNT_POLICY','SUPPRESSED_DUPLICATE','BLOCKED_VALIDATION'].indexOf(st)>=0)return;evaluated++;var out=v6AcqRouteLead_(r);if(out.qualificationStatus==='QUALIFIED_REQUIREMENT')qualified++;if(out.dedupeStatus&&out.dedupeStatus!=='NEW')deduped++;if(out.routingStatus==='ROUTED_TO_SALESFORCE')routed++;if(/^BLOCKED|ERROR|SALESFORCE_ERROR/.test(out.routingStatus))blocked++;});
  return {evaluated:evaluated,qualified:qualified,deduped:deduped,routed:routed,blocked:blocked};
}
function v6AcqAutomationTick_(){
  v6AcqSetupSheetsOnly_();var runId=v6AcqId_('RUN'),start=v6AcqNow_(),signals=v6AcqEvaluateSignals_(),leads=v6AcqRouteLeads_(),end=v6AcqNow_(),row={runId:runId,startedAt:start,finishedAt:end,signalsEvaluated:signals.evaluated,landingsGenerated:signals.generated,landingsReady:signals.ready,leadsEvaluated:leads.evaluated,leadsQualified:leads.qualified,leadsDeduped:leads.deduped,salesforceRouted:leads.routed,blocked:leads.blocked,status:'COMPLETED',updatedAt:end};v6AcqUpsert_('MKT_ACQ_RUNS',['runId'],row);
  // WordPress publishing + the bimonthly cycle gate + (optional) automated
  // QA all live in MarketingV6AcquisitionWordPress.gs and run inside this
  // SAME hourly heartbeat — no separate manual workflow is ever required.
  if(typeof v6AcqWordPressTick_==='function'){try{row.wordpress=v6AcqWordPressTick_();}catch(err){row.wordpress={status:'ERROR',error:String(err&&err.message||err)};}}
  return row;
}
function v6AcqSetupSheetsOnly_(){Object.keys(MKT_V6_ACQ_SCHEMA).forEach(function(name){v6AcqEnsureSheet_(name,MKT_V6_ACQ_SCHEMA[name]);});return true;}
function v6AcqInstallAutomationTrigger_(){
  var fn='v6AcqAutomationTick_',triggers=ScriptApp.getProjectTriggers(),found=false;triggers.forEach(function(t){if(t.getHandlerFunction()===fn){if(!found)found=true;else ScriptApp.deleteTrigger(t);}});if(!found)ScriptApp.newTrigger(fn).timeBased().everyHours(1).create();return {status:found?'TRIGGER EXISTS':'TRIGGER INSTALLED',handler:fn,cadence:'HOURLY'};
}
function v6AcqLandingPages_(){return {records:v6AcqRows_('MKT_ACQ_LANDING_PAGES').map(function(r){return {landingPageId:r.landingPageId,signalId:r.signalId,variantKey:r.variantKey,language:r.language,defaultForMarket:r.defaultForMarket,campaignKey:r.campaignKey,channel:r.channel,market:r.market,service:r.service,objective:r.objective,designSystem:r.designSystem,assetPath:r.assetPath,slug:r.slug,headline:r.headline,subheadline:r.subheadline,supportingCopy:r.supportingCopy,ctaLabel:r.ctaLabel,seoTitle:r.seoTitle,seoDescription:r.seoDescription,utmSource:r.utmSource,utmMedium:r.utmMedium,utmCampaign:r.utmCampaign,status:r.status,publishedUrl:r.publishedUrl,wpPageId:r.wpPageId,wpUrl:r.wpUrl,cycleId:r.cycleId,createdAt:r.createdAt,updatedAt:r.updatedAt};})};}
function v6AcqSignals_(){return {records:v6AcqRows_('MKT_ACQ_SIGNALS').map(function(r){return {signalId:r.signalId,source:r.source,channel:r.channel,market:r.market,service:r.service,objective:r.objective,priority:r.priority,status:r.status,sourceUpdatedAt:r.sourceUpdatedAt,processedAt:r.processedAt};})};}
function v6AcqStatus_(){
  v6AcqSetupSheetsOnly_();var signals=v6AcqRows_('MKT_ACQ_SIGNALS'),pages=v6AcqRows_('MKT_ACQ_LANDING_PAGES'),leads=v6AcqRows_('MKT_ACQ_LEADS'),runs=v6AcqRows_('MKT_ACQ_RUNS'),props=PropertiesService.getScriptProperties(),last=runs.sort(function(a,b){return v6AcqText_(b.finishedAt).localeCompare(v6AcqText_(a.finishedAt));})[0]||{};
  var health={landingRuntime:v6AcqPublicBase_()?'READY':'NOT CONFIGURED',leadIntake:v6AcqPublicBase_()?'READY':'NOT CONFIGURED',salesforceRouting:props.getProperty('ACQ_SALESFORCE_LEAD_ENDPOINT')?'READY':'NOT CONFIGURED',paidMedia:props.getProperty('ACQ_PAID_CONNECTOR')?'READY':'NOT CONFIGURED',linkedin:props.getProperty('ACQ_LINKEDIN_CONNECTOR')?'READY':'NOT CONFIGURED',outbound:props.getProperty('ACQ_OUTBOUND_CONNECTOR')?'READY':'NOT CONFIGURED',attribution:props.getProperty('ACQ_ATTRIBUTION_CONNECTOR')?'READY':'NOT CONFIGURED',wordpress:(props.getProperty('ACQ_WP_BASE_URL')&&props.getProperty('ACQ_WP_USERNAME')&&props.getProperty('ACQ_WP_APP_PASSWORD'))?'READY':'NOT CONFIGURED',ga4:props.getProperty('ACQ_GA4_PROPERTY_ID')?'CONNECTOR REQUIRED':'NOT CONFIGURED'};
  var routedLeadsWithOwner=leads.filter(function(r){return v6AcqText_(r.routingStatus)==='ROUTED_TO_SALESFORCE'&&v6AcqText_(r.salesforceLeadOwner);}).sort(function(a,b){return v6AcqText_(b.routedAt).localeCompare(v6AcqText_(a.routedAt));});
  var languageCoverage={};MKT_V6_ACQ_LANGUAGES.forEach(function(l){languageCoverage[l]=pages.filter(function(r){return v6AcqText_(r.language)===l;}).length;});
  return {
    status:'ACQUISITION_AUTOMATION',signals:signals.length,
    signalsPending:signals.filter(function(r){return ['DETECTED','NEW','READY'].indexOf(v6AcqText_(r.status).toUpperCase())>=0;}).length,
    landingPages:pages.length,landingLive:pages.filter(function(r){return v6AcqText_(r.status)==='LIVE';}).length,landingReady:pages.filter(function(r){return v6AcqText_(r.status)==='READY_TO_PUBLISH';}).length,
    languageCoverage:languageCoverage,
    leads:leads.length,qualified:leads.filter(function(r){return v6AcqText_(r.qualificationStatus)==='QUALIFIED_REQUIREMENT';}).length,
    routed:leads.filter(function(r){return v6AcqText_(r.routingStatus)==='ROUTED_TO_SALESFORCE';}).length,
    existingMatches:leads.filter(function(r){return v6AcqText_(r.routingStatus)==='EXISTING_ACCOUNT_POLICY';}).length,
    // Never invented: empty unless a real Salesforce response supplied an owner.
    newBusinessOwner:routedLeadsWithOwner.length?v6AcqText_(routedLeadsWithOwner[0].salesforceLeadOwner):'',
    lastRunAt:last.finishedAt||'',nextCadence:'HOURLY',health:health,
    cycle:(typeof v6AcqCycleStatus_==='function')?v6AcqCycleStatus_():null
  };
}
function v6AcqRun_(){return {run:v6AcqAutomationTick_(),status:v6AcqStatus_()};}
