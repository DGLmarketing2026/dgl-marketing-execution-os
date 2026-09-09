// DGL Acquisition Public Runtime — standalone Apps Script web app.
// Purpose: serve the SAME design DGL Marketing OS shows internally, and
// receive lead forms. Deploy separately from the private Marketing OS
// backend. Script property required: MKT_DATA_HUB_ID

var ACQ_PUBLIC_LP_SHEET='MKT_ACQ_LANDING_PAGES';
var ACQ_PUBLIC_LEAD_SHEET='MKT_ACQ_LEADS';
var ACQ_PUBLIC_ASSET_BASE='https://dglmarketing2026.github.io/dgl-marketing-execution-os/';
var ACQ_PUBLIC_LANGUAGES=['en','es','pt-BR'];
var ACQ_PUBLIC_LANGUAGE_NAME={en:'English',es:'Español','pt-BR':'Português (Brasil)'};

function acqPubText_(v){return String(v==null?'':v).trim();}
function acqPubEsc_(v){return acqPubText_(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function acqPubBook_(){var id=PropertiesService.getScriptProperties().getProperty('MKT_DATA_HUB_ID');if(!id)throw new Error('MKT_DATA_HUB_ID NOT CONFIGURED');return SpreadsheetApp.openById(id);}
function acqPubRows_(name){var sh=acqPubBook_().getSheetByName(name);if(!sh||sh.getLastRow()<2)return [];var h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(acqPubText_),v=sh.getRange(2,1,sh.getLastRow()-1,h.length).getValues();return v.map(function(row){var r={};h.forEach(function(k,i){r[k]=row[i];});return r;});}
function acqPubAppend_(name,record){var sh=acqPubBook_().getSheetByName(name);if(!sh)throw new Error(name+' NOT FOUND');var h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(acqPubText_);sh.appendRow(h.map(function(k){return record[k]==null?'':record[k];}));}
function acqPubFindLanding_(slug){return acqPubRows_(ACQ_PUBLIC_LP_SHEET).filter(function(r){return acqPubText_(r.slug)===acqPubText_(slug)&&['LIVE','READY_TO_PUBLISH'].indexOf(acqPubText_(r.status))>=0;})[0]||null;}
// The language switch on a live page must open the real sibling variant of
// the SAME campaign, never a client-side "translation" of invented copy.
function acqPubSiblings_(campaignKey,currentSlug){
  return acqPubRows_(ACQ_PUBLIC_LP_SHEET).filter(function(r){return acqPubText_(r.campaignKey)===acqPubText_(campaignKey)&&['LIVE','READY_TO_PUBLISH'].indexOf(acqPubText_(r.status))>=0;});
}
function acqPubLabels_(lang){
  if(lang==='pt-BR')return {firstName:'Nome',lastName:'Sobrenome',company:'Empresa',email:'E-mail corporativo',phone:'Telefone',country:'País',service:'Serviço',origin:'Origem',destination:'Destino',notes:'Necessidade',submit:'ENVIAR NECESSIDADE',thanks:'Obrigado. Recebemos sua solicitação.',thanksSub:'Nossa equipe vai avaliar sua necessidade e retornar em breve.'};
  if(lang==='es')return {firstName:'Nombre',lastName:'Apellido',company:'Empresa',email:'Email corporativo',phone:'Teléfono',country:'País',service:'Servicio',origin:'Origen',destination:'Destino',notes:'Requerimiento',submit:'ENVIAR REQUERIMIENTO',thanks:'Gracias. Recibimos su requerimiento.',thanksSub:'Nuestro equipo revisará su requerimiento y responderá en breve.'};
  return {firstName:'First name',lastName:'Last name',company:'Company',email:'Business email',phone:'Phone',country:'Country',service:'Service',origin:'Origin',destination:'Destination',notes:'Requirement',submit:'SUBMIT REQUIREMENT',thanks:'Thank you. We received your requirement.',thanksSub:'Our team will review it and follow up shortly.'};
}
// Backward-compatible design lookup for landing rows generated before the
// designSystem/assetPath/supportingCopy/seo columns existed.
var ACQ_PUBLIC_DESIGN_FALLBACK={
  FTL:{designSystem:'SPLIT FREIGHT',assetPath:'assets/creative/dgl-ftl-truck.webp'},
  LTL:{designSystem:'EDITORIAL WHITE',assetPath:'assets/creative/dgl-ltl-terminal.png'},
  Drayage:{designSystem:'ROUTE INTELLIGENCE',assetPath:'assets/creative/dgl-container-transload.jpg'}
};
function acqPubDesign_(lp){
  if(acqPubText_(lp.designSystem)&&acqPubText_(lp.assetPath))return {designSystem:lp.designSystem,assetPath:lp.assetPath};
  return ACQ_PUBLIC_DESIGN_FALLBACK[acqPubText_(lp.service)]||ACQ_PUBLIC_DESIGN_FALLBACK.FTL;
}
function acqPubAssetUrl_(assetPath){return ACQ_PUBLIC_ASSET_BASE+acqPubText_(assetPath).replace(/^\//,'');}

function doGet(e){
  var p=e&&e.parameter||{};
  if(p.health==='1')return ContentService.createTextOutput(JSON.stringify({ok:true,status:'DGL ACQUISITION PUBLIC RUNTIME'})).setMimeType(ContentService.MimeType.JSON);
  var landing=acqPubFindLanding_(p.slug);
  if(!landing)return HtmlService.createHtmlOutput(acqPubUnavailableHtml_()).setTitle('DGL');
  return HtmlService.createHtmlOutput(acqPubLandingHtml_(landing,p)).setTitle(acqPubText_(landing.seoTitle)||acqPubText_(landing.headline)||'DGL').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function doPost(e){
  var p=e&&e.parameter||{},honeypot=acqPubText_(p.website);if(honeypot)return HtmlService.createHtmlOutput('OK');
  var landing=acqPubFindLanding_(p.slug);if(!landing)return HtmlService.createHtmlOutput(acqPubUnavailableHtml_()).setTitle('DGL');
  var email=acqPubText_(p.email).toLowerCase(),company=acqPubText_(p.company),service=acqPubText_(p.service||landing.service);
  if(!company||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!service)return HtmlService.createHtmlOutput(acqPubErrorHtml_(landing));
  var now=new Date().toISOString(),leadId='LEAD-'+Utilities.getUuid().replace(/-/g,'').slice(0,18).toUpperCase();
  var record={leadId:leadId,landingPageId:landing.landingPageId,signalId:landing.signalId,createdAt:now,firstName:acqPubText_(p.firstName),lastName:acqPubText_(p.lastName),company:company,email:email,phone:acqPubText_(p.phone),country:acqPubText_(p.country),service:service,origin:acqPubText_(p.origin),destination:acqPubText_(p.destination),notes:acqPubText_(p.notes),utmSource:acqPubText_(p.utm_source||landing.utmSource),utmMedium:acqPubText_(p.utm_medium||landing.utmMedium),utmCampaign:acqPubText_(p.utm_campaign||landing.utmCampaign),validationStatus:'PENDING',dedupeStatus:'PENDING',existingContactId:'',existingAccountId:'',qualificationStatus:'PENDING',scoreStatus:'PENDING',routingStatus:'PENDING',salesforceLeadId:'',salesforceLeadOwner:'',routedAt:'',updatedAt:now};
  // Lead PII is appended only to the private Data Hub, guarded by a script
  // lock so concurrent submissions cannot race/overwrite each other. It is
  // never written to GitHub or any public-readable location.
  var lock=LockService.getScriptLock();lock.waitLock(10000);try{acqPubAppend_(ACQ_PUBLIC_LEAD_SHEET,record);}finally{lock.releaseLock();}
  return HtmlService.createHtmlOutput(acqPubThanksHtml_(landing)).setTitle('DGL').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function acqPubErrorHtml_(lp){
  var lang=acqPubText_(lp.language)||'en',msg=lang==='pt-BR'?'Revise os campos obrigatórios e tente novamente.':lang==='es'?'Revise los campos obligatorios e intente nuevamente.':'Please review the required fields and try again.';
  return '<!doctype html><html lang="'+acqPubEsc_(lang)+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+acqPubCss_()+'</style></head><body><main class="thanks"><h1>'+acqPubEsc_(msg)+'</h1><a class="backlink" href="javascript:history.back()">&larr;</a></main></body></html>';
}
function acqPubUnavailableHtml_(){
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+acqPubCss_()+'</style></head><body><main class="thanks"><h1>This page is not active.</h1></main></body></html>';
}
function acqPubThanksHtml_(lp){
  var l=acqPubLabels_(acqPubText_(lp.language)||'en');
  return '<!doctype html><html lang="'+acqPubEsc_(lp.language||'en')+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+acqPubCss_()+'</style></head><body><header><b>DGL</b><span>Dedicated Ground Logistics</span></header><main class="thanks"><h1>'+acqPubEsc_(l.thanks)+'</h1><p>'+acqPubEsc_(l.thanksSub)+'</p></main><footer>DGL &middot; Your inland freight partner</footer></body></html>';
}
function acqPubLangSwitch_(lp){
  var siblings=acqPubSiblings_(lp.campaignKey),links=ACQ_PUBLIC_LANGUAGES.map(function(lang){
    var row=siblings.filter(function(r){return acqPubText_(r.language)===lang;})[0];
    var active=acqPubText_(lp.language)===lang;
    var name=ACQ_PUBLIC_LANGUAGE_NAME[lang]||lang;
    if(!row)return '';
    // A language switch always opens the REAL sibling landing (same
    // campaignKey, its own generated slug) — never a client-side
    // translation of this page's content.
    return '<a class="'+(active?'active':'')+'" href="?slug='+encodeURIComponent(row.slug)+'"'+(active?' aria-current="true"':'')+'>'+acqPubEsc_(name)+'</a>';
  }).filter(Boolean).join('');
  return '<nav class="langswitch" aria-label="Language">'+links+'</nav>';
}
function acqPubLandingHtml_(lp,query){
  var l=acqPubLabels_(lp.language),url=ScriptApp.getService().getUrl(),service=acqPubEsc_(lp.service||'Inland Freight');
  var design=acqPubDesign_(lp),heroUrl=acqPubAssetUrl_(design.assetPath),skin=design.designSystem==='EDITORIAL WHITE'?'editorial':design.designSystem==='ROUTE INTELLIGENCE'?'route':'split';
  var seoTitle=acqPubText_(lp.seoTitle)||acqPubText_(lp.headline),seoDescription=acqPubText_(lp.seoDescription)||acqPubText_(lp.subheadline),canonical=acqPubEsc_(url+'?slug='+encodeURIComponent(lp.slug));
  var supportingCopy=acqPubText_(lp.supportingCopy);
  function field(name,label,type){return '<label><span>'+acqPubEsc_(label)+'</span><input '+(type?'type="'+type+'" ':'')+'name="'+name+'" '+((name==='company'||name==='email')?'required':'')+'></label>';}
  var head='<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<title>'+acqPubEsc_(seoTitle)+'</title>'
    +'<meta name="description" content="'+acqPubEsc_(seoDescription)+'">'
    +'<link rel="canonical" href="'+canonical+'">'
    +'<meta property="og:title" content="'+acqPubEsc_(seoTitle)+'"><meta property="og:description" content="'+acqPubEsc_(seoDescription)+'"><meta property="og:type" content="website">'
    +'<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    +'<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet">'
    +'<style>'+acqPubCss_()+'</style></head>';
  var hero='<section class="hero skin-'+skin+'" style="background-image:url(\''+acqPubEsc_(heroUrl)+'\')"><div class="hero-overlay"><div class="hero-copy">'
    +'<small>'+acqPubEsc_(design.designSystem)+' &middot; '+service+'</small>'
    +'<h1>'+acqPubEsc_(lp.headline)+'</h1>'
    +'<p class="sub">'+acqPubEsc_(lp.subheadline)+'</p>'
    +(supportingCopy?'<p class="support">'+acqPubEsc_(supportingCopy)+'</p>':'')
    +'<a class="cta" href="#lead">'+acqPubEsc_(lp.ctaLabel)+'</a>'
    +'</div></div></section>';
  var value='<section class="value"><b>USA Inland Freight</b><p>FTL &middot; LTL &middot; Drayage &middot; Cross-border support</p></section>';
  var form='<section id="lead" class="formwrap"><h2>'+acqPubEsc_(lp.ctaLabel)+'</h2><form method="post" action="'+acqPubEsc_(url)+'">'
    +'<input type="hidden" name="slug" value="'+acqPubEsc_(lp.slug)+'">'
    +'<input type="hidden" name="service" value="'+service+'">'
    +'<input type="hidden" name="utm_source" value="'+acqPubEsc_(query.utm_source||lp.utmSource)+'">'
    +'<input type="hidden" name="utm_medium" value="'+acqPubEsc_(query.utm_medium||lp.utmMedium)+'">'
    +'<input type="hidden" name="utm_campaign" value="'+acqPubEsc_(query.utm_campaign||lp.utmCampaign)+'">'
    +'<input class="trap" name="website" tabindex="-1" autocomplete="off">'
    +field('firstName',l.firstName)+field('lastName',l.lastName)+field('company',l.company)+field('email',l.email,'email')+field('phone',l.phone,'tel')+field('country',l.country)+field('origin',l.origin)+field('destination',l.destination)
    +'<label class="full"><span>'+acqPubEsc_(l.notes)+'</span><textarea name="notes"></textarea></label>'
    +'<button type="submit">'+acqPubEsc_(l.submit)+'</button>'
    +'</form></section>';
  return '<!doctype html><html lang="'+acqPubEsc_(lp.language||'en')+'">'+head
    +'<body><header><b>DGL</b><span>Dedicated Ground Logistics</span>'+acqPubLangSwitch_(lp)+'</header>'
    +'<main>'+hero+value+form+'</main>'
    +'<footer>DGL &middot; Your inland freight partner</footer></body></html>';
}
function acqPubCss_(){
  return "*{box-sizing:border-box}body{margin:0;font-family:'Montserrat',Arial,sans-serif;color:#101828;background:#fff}"
    +"h1,h2{font-family:'Poppins',Arial,sans-serif}"
    +"header{display:flex;align-items:center;gap:14px;background:#05035C;color:#fff;padding:18px 6%;border-bottom:4px solid #77B82A;flex-wrap:wrap}"
    +"header b{font-size:20px;font-family:'Poppins',Arial,sans-serif}header span{opacity:.78;font-size:12px}"
    +".langswitch{margin-left:auto;display:flex;gap:6px}.langswitch a{color:#cbd3e6;text-decoration:none;font-size:11px;font-weight:700;padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.25)}"
    +".langswitch a.active{background:#77B82A;border-color:#77B82A;color:#06210a}"
    +".hero{position:relative;background-size:cover;background-position:center;min-height:360px;display:flex;align-items:stretch}"
    +".hero-overlay{width:100%;display:flex;align-items:flex-end;background:linear-gradient(180deg,rgba(5,3,92,.35),rgba(5,3,92,.92))}"
    +".hero-copy{padding:50px 6%;max-width:760px;color:#fff}"
    +".hero-copy small{color:#9BD54F;font-weight:700;letter-spacing:.14em;font-size:11px}"
    +".hero-copy h1{font-size:40px;line-height:1.08;margin:14px 0}"
    +".hero-copy .sub{font-size:17px;line-height:1.55;color:#dfe4ef;margin:0 0 10px}"
    +".hero-copy .support{font-size:14px;line-height:1.6;color:#c3cadd;margin:0 0 18px}"
    +".hero-copy .cta{display:inline-block;background:#77B82A;color:#0b1d05;padding:14px 20px;border-radius:8px;font-weight:800;text-decoration:none}"
    +".skin-editorial .hero-overlay{background:linear-gradient(180deg,rgba(5,3,92,.18),rgba(5,3,92,.94))}"
    +".skin-route{min-height:420px}"
    +".value{padding:26px 6%;border-top:1px solid #e7eaf0;border-bottom:1px solid #e7eaf0}.value b{color:#05035C;font-size:20px}.value p{color:#667085}"
    +".formwrap{padding:55px 6%;max-width:900px;margin:auto}.formwrap h2{color:#05035C}"
    +"form{display:grid;grid-template-columns:1fr 1fr;gap:15px}label{display:grid;gap:6px}label span{font-size:12px;font-weight:600;color:#475467}"
    +"input,textarea{border:1px solid #d7dce5;border-radius:8px;padding:12px;font:inherit}.full,button{grid-column:1/-1}textarea{min-height:90px}"
    +"button{border:0;border-radius:8px;background:#77B82A;padding:15px;font-weight:800;font-family:'Poppins',Arial,sans-serif;cursor:pointer}"
    +".trap{position:absolute;left:-9999px}"
    +"footer{padding:30px 6%;background:#05035C;color:#fff;text-align:center}"
    +".thanks{padding:80px 6%;text-align:center}.thanks h1{color:#05035C}.thanks .backlink{display:inline-block;margin-top:16px}"
    +"@media(max-width:760px){.hero-copy{padding:34px 6%}.hero-copy h1{font-size:30px}form{grid-template-columns:1fr}.full,button{grid-column:1}header{padding:14px 6%}.langswitch{width:100%;margin-left:0;order:3}}";
}
