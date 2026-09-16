// AURA Retention data-freshness gate.
//
// Investigated first (per docs/README_INSTALL_V6.md, DGL_MARKETING_OS_CANONICAL_STATE.md,
// AUDIT_FINDINGS_2026-09-02.md, confirmed by direct inspection): there is no documented or
// implemented automated cadence anywhere in this codebase that refreshes the upstream
// report source spreadsheet itself (MKT_V6_REPORT_SOURCE_ID / the real 'DGL_REPORT_SOURCE_V6')
// from Salesforce/NOVA. The only existing cadence is v6InstallOpportunityRefreshTrigger_'s
// six-hour trigger, which reads that source snapshot to rebuild MKT_OPPORTUNITIES -- it does
// not, and cannot, refresh the source itself. AUDIT_FINDINGS_2026-09-02.md explicitly names
// this as an open gap ("the opportunity layer is consuming an August snapshot rather than an
// automatically refreshed upstream source").
//
// Since no separate freshness threshold is documented anywhere for the source itself, this
// gate reuses the exact same six-hour constant as the trigger that consumes it (not a new,
// invented number): the source should be at least as fresh as the cycle that depends on it.
//
// What remains an external gap this code cannot invent: an automated Salesforce/NOVA ->
// MKT_V6_REPORT_SOURCE_ID refresh (typically a scheduled Salesforce Data Export, a Flow, or
// an ETL connector) -- see docs/AURA_DEPLOYMENT.md.
var MKT_V6_REPORT_FRESHNESS_STALE_THRESHOLD_HOURS=6;

function v6AuraCheckReportFreshness_(){
  var file=DriveApp.getFileById(MKT_V6_REPORT_SOURCE_ID),lastUpdated=file.getLastUpdated(),now=new Date();
  var hoursSinceLastUpdate=(now.getTime()-lastUpdated.getTime())/3600000;
  var stale=hoursSinceLastUpdate>MKT_V6_REPORT_FRESHNESS_STALE_THRESHOLD_HOURS;
  return {
    status:stale?'STALE':'FRESH',
    hoursSinceLastUpdate:hoursSinceLastUpdate,
    staleThresholdHours:MKT_V6_REPORT_FRESHNESS_STALE_THRESHOLD_HOURS,
    lastUpdatedIso:lastUpdated.toISOString()
  };
}

// --- Source arbitration --------------------------------------------------------
// Root-cause fix for a real production incident: the canonical NOVA report source
// (v6AuraCheckReportFreshness_ above) can be genuinely stale (confirmed live: 16+ days)
// while a separately-ingested, already-validated AM Intelligence source (the Gmail AM
// report pipeline, MarketingV6AuraGmailIngest.gs, when present in the deployment) is
// current. Previously nothing arbitrated between the two -- the Retention cycle only ever
// looked at the NOVA check and refused to run, even though a real, AM-sourced, schema-
// validated signal already existed. This does not weaken the freshness gate: it still
// fails closed (STALE_SOURCE) when NEITHER source qualifies, and it never marks anything
// FRESH artificially -- every condition below is read from data the ingestion engine
// itself already recorded (MarketingV6AuraGmailIngest.gs's own MKT_AURA_INGEST_LOG /
// v6AuraGmailFreshnessStatus_), never invented here.
//
// Priority, in order (first that qualifies wins):
//   1. NOVA / Salesforce canonical source (v6AuraCheckReportFreshness_) -- if FRESH.
//   2. AM Intelligence approved source (Gmail AM report), when ALL of these hold, using
//      only fields the ingestion engine already produces:
//        - v6AuraGmailFreshnessStatus_ is present in this deployment (typeof-guarded --
//          this file must not assume MarketingV6AuraGmailIngest.gs is always deployed);
//        - its status is 'OK' (a report was actually received and processed, not
//          'NO_REPORT_RECEIVED');
//        - its own freshness classification is 'CURRENT' (the ingestion engine's own
//          age thresholds -- <=8 days -- are reused verbatim here, not redefined);
//        - rowsAccepted > 0 (the most recent report actually produced usable rows).
//      No numeric cap is applied to rowsRejected: no such policy is documented anywhere
//      in this codebase, and CLAUDE.md prohibits inventing a threshold that does not
//      exist -- rowsRejected is surfaced for visibility only, never gates arbitration.
//   3. Neither qualifies -> STALE_SOURCE, fail closed, no campaign cycle runs.
function v6AuraResolveFreshnessSource_(){
  var nova=v6AuraCheckReportFreshness_();
  if(nova.status==='FRESH'){
    return {status:'FRESH',selectedSource:'NOVA_CANONICAL',nova:nova,amIntelligence:null};
  }
  var gmail=(typeof v6AuraGmailFreshnessStatus_==='function')?v6AuraGmailFreshnessStatus_():{status:'SOURCE_NOT_DEPLOYED'};
  var qualifies=gmail&&gmail.status==='OK'&&gmail.freshness==='CURRENT'&&Number(gmail.rowsAccepted||0)>0;
  if(qualifies){
    return {status:'FRESH',selectedSource:'AM_INTELLIGENCE_GMAIL',nova:nova,amIntelligence:gmail};
  }
  return {status:'STALE_SOURCE',selectedSource:'NONE',nova:nova,amIntelligence:gmail};
}
