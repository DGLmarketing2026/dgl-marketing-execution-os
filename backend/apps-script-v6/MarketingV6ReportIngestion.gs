var MKT_V6_REPORT_SOURCE_ID='1XPZC_VUPLsmta--MPXi4MHswz9oiYxKbiq58a_khPp4';

function v6ReportRows_(sheetName){
  var s=SpreadsheetApp.openById(MKT_V6_REPORT_SOURCE_ID).getSheetByName(sheetName);
  if(!s)return [];
  var values=s.getDataRange().getValues();
  if(values.length<2)return [];
  var headers=values.shift();
  return values.filter(function(r){return r.some(function(v){return String(v||'').trim()!=='';});}).map(function(r){
    var o={};
    headers.forEach(function(h,i){o[String(h||'').trim()]=r[i];});
    return o;
  });
}

function v6NormAccount_(v){return String(v||'').trim().toLowerCase().replace(/\s+/g,' ');}
function v6Text_(v){return String(v==null?'':v).trim();}
function v6Yes_(v){var x=v6Text_(v).toUpperCase();return x==='SI'||x==='SÍ'||x==='YES'||x==='TRUE'||x==='1';}
function v6ServiceName_(v){
  var x=v6Text_(v).toUpperCase();
  if(x==='FTL')return 'FTL';
  if(x==='LTL')return 'LTL';
  if(x==='DRAYAGE')return 'Drayage';
  if(x==='CROSS BORDER'||x==='CROSS-BORDER')return 'Cross Border';
  if(x==='REEFER')return 'Reefer';
  if(x==='INTERMODAL')return 'Intermodal';
  return 'Multiservicio';
}
function v6IsoDate_(v){
  if(!v)return '';
  var d=v instanceof Date?v:new Date(v);
  return isNaN(d.getTime())?'':Utilities.formatDate(d,Session.getScriptTimeZone()||'America/Bogota','yyyy-MM-dd');
}
function v6HashKey_(text){
  var bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,String(text||''),Utilities.Charset.UTF_8);
  return bytes.map(function(b){var n=(b<0?b+256:b).toString(16);return n.length===1?'0'+n:n;}).join('').substring(0,12).toUpperCase();
}
function v6OppId_(type,key){return 'OPP-'+String(type||'GEN').replace(/[^A-Z0-9]/gi,'').toUpperCase()+'-'+v6HashKey_(key);}

function v6FichaIndex_(){
  var rows=v6ReportRows_('FICHA_CLIENTES'),idx={};
  rows.forEach(function(r){idx[v6NormAccount_(r.Cliente)]=r;});
  return idx;
}
function v6CuentasIndex_(){
  var rows=v6ReportRows_('CUENTAS'),idx={};
  rows.forEach(function(r){idx[v6NormAccount_(r.Cuenta)]=r;});
  return idx;
}
function v6ServiceFromFicha_(row){
  if(!row)return 'Multiservicio';
  var used=[];
  ['FTL','LTL','Drayage'].forEach(function(s){if(Number(row[s]||0)>0)used.push(s);});
  return used.length===1?used[0]:'Multiservicio';
}

function v6BuildQnbOpportunities_(nowIso){
  var rows=v6ReportRows_('LQS_SIN_RESPUESTA'),latest={};
  rows.forEach(function(r){
    var key=v6NormAccount_(r.Cliente);if(!key)return;
    var stamp=new Date(r['Fecha creacion']||0).getTime();if(isNaN(stamp))stamp=0;
    if(!latest[key]||stamp>latest[key]._stamp){r._stamp=stamp;latest[key]=r;}
  });
  return Object.keys(latest).map(function(key){
    var r=latest[key],reason='';
    if(v6Text_(r.Agente).toLowerCase()==='house account')reason='OWNER REQUIRED';
    else if(v6Text_(r.Area).toLowerCase()==='sin area')reason='SERVICE UNRESOLVED';
    return {
      opportunityId:v6OppId_('QNB',key),accountId:'ACC-'+v6HashKey_(key),accountName:v6Text_(r.Cliente),amOwner:v6Text_(r.Agente),
      opportunityType:'Quoted Not Booked',service:v6ServiceName_(r.Area),signalDate:v6IsoDate_(r['Fecha creacion']),
      qnbWindow:v6Text_(r.Bucket),lane:'',sourceReport:'LQS_SIN_RESPUESTA',sourceRecordId:v6Text_(r.LQ),
      priorityRank:1,eligibilityStatus:reason?'SUPPRESSED':'DETECTED',suppressionReason:reason,campaignId:'',detectedAt:nowIso,updatedAt:nowIso
    };
  });
}

var MKT_V6_RETENTION_AM_REVIEW_BUCKETS=['6. COTIZAN Y NO CIERRAN','7. CASOS EXTREMOS','8. GESTIONADAS SIN OPERAR'];
var MKT_V6_RETENTION_NO_MANAGEMENT_BUCKETS=['2. OPERA SIN GESTION','3. SIN GESTION CRITICO','4. SIN GESTION ALTO','5. SIN GESTION MEDIO'];

function v6RetentionAmActivityReason_(r,match){
  if(v6Yes_(r['Sin dueno'])||v6Text_(r['Sales Rep']).toLowerCase()==='house account')return 'OWNER REQUIRED';
  // Canonical architecture: NOVA / SALESFORCE -> AM PLATFORM / AM INTELLIGENCE -> AURA.
  // A Retention candidate with no AM Intelligence (CUENTAS) record must not advance on
  // NOVA-only fields alone (MIGRACION_CAIDAS) -- that would be a NOVA->AURA path that
  // skips AM. Hold it instead of auto-detecting.
  if(!match)return 'AM CONTEXT REQUIRED';
  if(v6Text_(match.Bucket)==='1. SIN DUENO'||v6Text_(match['Sales Rep']).toLowerCase()==='house account')return 'OWNER REQUIRED';
  if(v6Yes_(match['Falso positivo']))return 'FALSE POSITIVE';
  if(v6Yes_(match['Solo cobranza']))return 'COLLECTIONS';
  var bucket=v6Text_(match.Bucket);
  if(MKT_V6_RETENTION_AM_REVIEW_BUCKETS.indexOf(bucket)>=0)return 'AM ACTIVITY REVIEW REQUIRED';
  if(MKT_V6_RETENTION_NO_MANAGEMENT_BUCKETS.indexOf(bucket)>=0&&v6Text_(match['Tipo gestion']).trim().toUpperCase()==='COMERCIAL')return 'AM ACTIVITY REVIEW REQUIRED';
  return '';
}

function v6BuildRetentionOpportunities_(nowIso,ficha,cuentas){
  var cuentasIdx=cuentas||{};
  return v6ReportRows_('MIGRACION_CAIDAS').map(function(r){
    var key=v6NormAccount_(r.Cuenta),match=cuentasIdx[key]||null,reason=v6RetentionAmActivityReason_(r,match);
    return {
      opportunityId:v6OppId_('RETENTION',key),accountId:'ACC-'+v6HashKey_(key),accountName:v6Text_(r.Cuenta),amOwner:v6Text_(r['Sales Rep']),
      opportunityType:'Retention',service:v6ServiceFromFicha_(ficha[key]),signalDate:v6IsoDate_(r['Ultimo load']),qnbWindow:'',lane:'',
      sourceReport:'MIGRACION_CAIDAS',sourceRecordId:v6Text_(r['Tier origen'])+'>'+v6Text_(r['Tier destino']),priorityRank:2,
      eligibilityStatus:reason?'SUPPRESSED':'DETECTED',suppressionReason:reason,campaignId:'',detectedAt:nowIso,updatedAt:nowIso,
      amActivityBucket:match?v6Text_(match.Bucket):'',amActivityTipoGestion:match?v6Text_(match['Tipo gestion']):'',
      amActivityUltimoChatter:match?v6IsoDate_(match['Ultimo Chatter']):'',amActivityAutorChatter:match?v6Text_(match['Autor Chatter']):''
    };
  });
}

function v6BuildReactivationOpportunities_(nowIso,ficha){
  return v6ReportRows_('CUENTAS').map(function(r){
    var key=v6NormAccount_(r.Cuenta),reason='';
    if(v6Yes_(r['Falso positivo']))reason='FALSE POSITIVE';
    else if(v6Yes_(r['Solo cobranza']))reason='COLLECTIONS';
    else if(v6Text_(r.Bucket)==='1. SIN DUENO'||v6Text_(r['Sales Rep']).toLowerCase()==='house account')reason='OWNER REQUIRED';
    return {
      opportunityId:v6OppId_('REACTIVATION',key),accountId:'ACC-'+v6HashKey_(key),accountName:v6Text_(r.Cuenta),amOwner:v6Text_(r['Sales Rep']),
      opportunityType:'Reactivation',service:v6ServiceFromFicha_(ficha[key]),signalDate:v6IsoDate_(r['Ultima quote']),qnbWindow:'',lane:'',
      sourceReport:'CUENTAS',sourceRecordId:v6Text_(r.Bucket),priorityRank:3,eligibilityStatus:reason?'SUPPRESSED':'DETECTED',
      suppressionReason:reason,campaignId:'',detectedAt:nowIso,updatedAt:nowIso
    };
  });
}

function v6BuildCrossSellOpportunities_(nowIso){
  var out=[];
  v6ReportRows_('FICHA_CLIENTES').forEach(function(r){
    var used=[];['FTL','LTL','Drayage'].forEach(function(s){if(Number(r[s]||0)>0)used.push(s);});
    if(used.length!==1)return;
    var variation=Number(r['Variacion %']||0),reason=variation<-20?'RETENTION PRIORITY':'';
    var key=v6NormAccount_(r.Cliente);
    out.push({
      opportunityId:v6OppId_('CROSSSELL',key),accountId:'ACC-'+v6HashKey_(key),accountName:v6Text_(r.Cliente),amOwner:v6Text_(r['Dispatcher principal']),
      opportunityType:'Cross-Sell',service:'Multiservicio',signalDate:'',qnbWindow:'',lane:'',sourceReport:'FICHA_CLIENTES',
      sourceRecordId:'ONLY_'+used[0],priorityRank:4,eligibilityStatus:reason?'SUPPRESSED':'DETECTED',suppressionReason:reason,
      campaignId:'',detectedAt:nowIso,updatedAt:nowIso
    });
  });
  return out;
}

function v6BuildNurtureOpportunities_(nowIso,ficha){
  return v6ReportRows_('MIGRACION_RECUPERADAS').map(function(r){
    var key=v6NormAccount_(r.Cuenta),reason='';
    if(v6Yes_(r['Sin dueno'])||v6Text_(r['Sales Rep']).toLowerCase()==='house account')reason='OWNER REQUIRED';
    return {
      opportunityId:v6OppId_('NURTURE',key),accountId:'ACC-'+v6HashKey_(key),accountName:v6Text_(r.Cuenta),amOwner:v6Text_(r['Sales Rep']),
      opportunityType:'Nurture',service:v6ServiceFromFicha_(ficha[key]),signalDate:v6IsoDate_(r['Ultimo load']),qnbWindow:'',lane:'',
      sourceReport:'MIGRACION_RECUPERADAS',sourceRecordId:v6Text_(r['Tier origen'])+'>'+v6Text_(r['Tier destino']),priorityRank:5,
      eligibilityStatus:reason?'SUPPRESSED':'DETECTED',suppressionReason:reason,campaignId:'',detectedAt:nowIso,updatedAt:nowIso
    };
  });
}

function v6ApplyPrioritySuppression_(rows){
  var best={};
  rows.forEach(function(r){
    if(r.eligibilityStatus!=='DETECTED')return;
    var k=v6NormAccount_(r.accountName),p=Number(r.priorityRank||99);
    if(best[k]==null||p<best[k])best[k]=p;
  });
  rows.forEach(function(r){
    var k=v6NormAccount_(r.accountName),p=Number(r.priorityRank||99);
    if(r.eligibilityStatus==='DETECTED'&&best[k]!=null&&p>best[k]){
      r.eligibilityStatus='SUPPRESSED';r.suppressionReason='HIGHER PRIORITY SIGNAL';
    }
  });
  return rows;
}

function v6WriteOpportunities_(rows){
  var s=v6Sheet_('MKT_OPPORTUNITIES');
  if(!s)throw new Error('MKT_OPPORTUNITIES missing');
  var headers=s.getRange(1,1,1,s.getLastColumn()).getValues()[0].filter(function(h){return String(h||'').trim()!=='';});
  if(s.getLastRow()>1)s.getRange(2,1,s.getLastRow()-1,headers.length).clearContent();
  if(!rows.length)return;
  var values=rows.map(function(r){return headers.map(function(h){return r[h]==null?'':r[h];});});
  s.getRange(2,1,values.length,headers.length).setValues(values);
}

function v6OpportunityMetrics_(rows){
  var byType={},detected=0,suppressed=0;
  rows.forEach(function(r){
    var t=r.opportunityType||'Unknown';if(!byType[t])byType[t]={total:0,detected:0,suppressed:0};byType[t].total++;
    if(r.eligibilityStatus==='DETECTED'){detected++;byType[t].detected++;}else{suppressed++;byType[t].suppressed++;}
  });
  return {total:rows.length,detected:detected,suppressed:suppressed,byType:byType};
}

function v6RetentionCuentasJoinCoverage_(retentionRows,cuentas){
  if(!retentionRows.length)return 0;
  var matched=retentionRows.filter(function(r){return !!cuentas[v6NormAccount_(r.accountName)];}).length;
  return matched/retentionRows.length;
}

function v6RefreshOpportunitiesFromReports_(){
  var nowIso=new Date().toISOString(),ficha=v6FichaIndex_(),cuentas=v6CuentasIndex_(),rows=[];
  var retentionRows=v6BuildRetentionOpportunities_(nowIso,ficha,cuentas);
  rows=rows.concat(v6BuildQnbOpportunities_(nowIso));
  rows=rows.concat(retentionRows);
  rows=rows.concat(v6BuildReactivationOpportunities_(nowIso,ficha));
  rows=rows.concat(v6BuildCrossSellOpportunities_(nowIso));
  rows=rows.concat(v6BuildNurtureOpportunities_(nowIso,ficha));
  rows=v6ApplyPrioritySuppression_(rows);
  v6WriteOpportunities_(rows);
  return {status:'REPORT_SOURCE_SYNCED',sourceSpreadsheetId:MKT_V6_REPORT_SOURCE_ID,metrics:v6OpportunityMetrics_(rows),retentionCuentasJoinCoverage:v6RetentionCuentasJoinCoverage_(retentionRows,cuentas),syncedAt:nowIso};
}

function v6InstallOpportunityRefreshTrigger_(){
  ScriptApp.getProjectTriggers().forEach(function(t){if(t.getHandlerFunction()==='v6ScheduledOpportunityRefresh_')ScriptApp.deleteTrigger(t);});
  ScriptApp.newTrigger('v6ScheduledOpportunityRefresh_').timeBased().everyHours(6).create();
  return {ok:true,handler:'v6ScheduledOpportunityRefresh_',frequency:'EVERY_6_HOURS'};
}
function v6ScheduledOpportunityRefresh_(){return v6RefreshOpportunitiesFromReports_();}
