var MKT_V6_PROVIDER_READY=false;
function v6CreateExecution_(payload){var id='EXEC-'+Utilities.getUuid().slice(0,8).toUpperCase();return {executionId:id,status:'CREATED',bulkProviderReady:MKT_V6_PROVIDER_READY,archive:v6ArchiveExecution_(id,payload||{})};}
function v6QueueExecution_(payload){return MKT_V6_PROVIDER_READY?{status:'QUEUED',executionId:payload.executionId}:{status:'BULK PROVIDER NOT CONFIGURED',blocked:true};}
function v6StartExecution_(payload){return MKT_V6_PROVIDER_READY?{status:'ACTIVE',executionId:payload.executionId}:{status:'BULK PROVIDER NOT CONFIGURED',blocked:true};}
function v6ExecutionStatus_(payload){var rows=v6Rows_('MKT_CAMPAIGN_EXECUTIONS').filter(function(x){return String(x.executionId)===String(payload.executionId);});return rows[0]||{status:'NOT FOUND'};}
function v6ExecutionArchiveStatus_(payload){return {executionId:payload.executionId,csvArchiveReady:false,status:'ARCHIVE PENDING'};}
