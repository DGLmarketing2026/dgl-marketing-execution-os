/**
 * DGL Marketing OS — V6 Router Extension FINAL
 * Lazy routing: each V6 action resolves only its own handler.
 * One missing module can no longer break Opportunities, Pipeline or the rest of V6.
 */
function routeMarketingV6_(action, payload) {
  var p = payload || {};
  var a = String(action || '');

  switch (a) {
    case 'v6Opportunities':
      return typeof v6Opportunities_ === 'function' ? v6Opportunities_(p) : v6RouteMissing_(a, 'v6Opportunities_');
    case 'v6RunOpportunityEngine':
      return typeof v6RunOpportunityEngine_ === 'function' ? v6RunOpportunityEngine_(p) : v6RouteMissing_(a, 'v6RunOpportunityEngine_');
    case 'v6OpportunitySummary':
      return typeof v6OpportunitySummary_ === 'function' ? v6OpportunitySummary_(p) : v6RouteMissing_(a, 'v6OpportunitySummary_');
    case 'v6FrequencyStatus':
      return typeof v6FrequencyStatus_ === 'function' ? v6FrequencyStatus_(p) : v6RouteMissing_(a, 'v6FrequencyStatus_');
    case 'v6EvaluateCampaignPressure':
      return typeof v6EvaluateCampaignPressure_ === 'function' ? v6EvaluateCampaignPressure_(p) : v6RouteMissing_(a, 'v6EvaluateCampaignPressure_');
    case 'v6AccountPipeline':
      return typeof v6AccountPipeline_ === 'function' ? v6AccountPipeline_(p) : v6RouteMissing_(a, 'v6AccountPipeline_');
    case 'v6PipelineSummary':
      return typeof v6PipelineSummary_ === 'function' ? v6PipelineSummary_(p) : v6RouteMissing_(a, 'v6PipelineSummary_');
    case 'v6PipelineTransition':
      return typeof v6PipelineTransition_ === 'function' ? v6PipelineTransition_(p) : v6RouteMissing_(a, 'v6PipelineTransition_');
    case 'v6PipelineSyncSignals':
      return typeof v6PipelineSyncSignals_ === 'function' ? v6PipelineSyncSignals_(p) : v6RouteMissing_(a, 'v6PipelineSyncSignals_');
    case 'v6CreateExecution':
      return typeof v6CreateExecution_ === 'function' ? v6CreateExecution_(p) : v6RouteMissing_(a, 'v6CreateExecution_');
    case 'v6QueueExecution':
      return typeof v6QueueExecution_ === 'function' ? v6QueueExecution_(p) : v6RouteMissing_(a, 'v6QueueExecution_');
    case 'v6StartExecution':
      return typeof v6StartExecution_ === 'function' ? v6StartExecution_(p) : v6RouteMissing_(a, 'v6StartExecution_');
    case 'v6ExecutionStatus':
      return typeof v6ExecutionStatus_ === 'function' ? v6ExecutionStatus_(p) : v6RouteMissing_(a, 'v6ExecutionStatus_');
    case 'v6ExecutionArchiveStatus':
      return typeof v6ExecutionArchiveStatus_ === 'function' ? v6ExecutionArchiveStatus_(p) : v6RouteMissing_(a, 'v6ExecutionArchiveStatus_');
    case 'v6CopyUsage':
      return typeof v6CopyUsage_ === 'function' ? v6CopyUsage_(p) : v6RouteMissing_(a, 'v6CopyUsage_');
    case 'v6RecordCopyUsage':
      return typeof v6RecordCopyUsage_ === 'function' ? v6RecordCopyUsage_(p) : v6RouteMissing_(a, 'v6RecordCopyUsage_');
    case 'v6CreativeUsage':
      return typeof v6CreativeUsage_ === 'function' ? v6CreativeUsage_(p) : v6RouteMissing_(a, 'v6CreativeUsage_');
    case 'v6RecordCreativeUsage':
      return typeof v6RecordCreativeUsage_ === 'function' ? v6RecordCreativeUsage_(p) : v6RouteMissing_(a, 'v6RecordCreativeUsage_');
    case 'v6IngestAuthoritativeContacts':
      return typeof v6IngestAuthoritativeContacts_ === 'function' ? v6IngestAuthoritativeContacts_(p) : v6RouteMissing_(a, 'v6IngestAuthoritativeContacts_');
    case 'v6ResolveRecipients':
    case 'v55ResolveRecipients':
      return typeof v6ResolveRecipients_ === 'function' ? v6ResolveRecipients_(p) : v6RouteMissing_(a, 'v6ResolveRecipients_');
    case 'v6AudienceStatus':
    case 'v55AudienceStatus':
      return typeof v6AudienceStatus_ === 'function' ? v6AudienceStatus_(p) : v6RouteMissing_(a, 'v6AudienceStatus_');
    case 'v6ClassifyResponseEvent':
      return typeof v6ClassifyResponseEvent_ === 'function' ? v6ClassifyResponseEvent_(p) : v6RouteMissing_(a, 'v6ClassifyResponseEvent_');
    case 'v6IngestCommercialOutcomes':
      return typeof v6IngestCommercialOutcomes_ === 'function' ? v6IngestCommercialOutcomes_(p) : v6RouteMissing_(a, 'v6IngestCommercialOutcomes_');
    case 'v6AuraEvaluateRetention':
      return typeof v6AuraEvaluateRetention_ === 'function' ? v6AuraEvaluateRetention_(p) : v6RouteMissing_(a, 'v6AuraEvaluateRetention_');
    case 'v6AuraStatus':
      return typeof v6AuraStatus_ === 'function' ? v6AuraStatus_(p) : v6RouteMissing_(a, 'v6AuraStatus_');
    case 'v6AuraEnsureCampaignScope':
      return typeof v6AuraEnsureCampaignScope_ === 'function' ? v6AuraEnsureCampaignScope_(p) : v6RouteMissing_(a, 'v6AuraEnsureCampaignScope_');
    case 'v6AuraCreateAccountStop':
      return typeof v6AuraCreateAccountStop_ === 'function' ? v6AuraCreateAccountStop_(p) : v6RouteMissing_(a, 'v6AuraCreateAccountStop_');
    case 'v6AuraCreateAmHandoff':
      return typeof v6AuraCreateAmHandoff_ === 'function' ? v6AuraCreateAmHandoff_(p) : v6RouteMissing_(a, 'v6AuraCreateAmHandoff_');
    case 'v6DeploymentAudit':
      return typeof v6DeploymentAudit_ === 'function' ? v6DeploymentAudit_(p) : { status: 'NOT AVAILABLE' };
    case 'v6AcqSetup':
      return typeof v6AcqSetup_ === 'function' ? v6AcqSetup_(p) : v6RouteMissing_(a, 'v6AcqSetup_');
    case 'v6AcqStatus':
      return typeof v6AcqStatus_ === 'function' ? v6AcqStatus_(p) : v6RouteMissing_(a, 'v6AcqStatus_');
    case 'v6AcqRun':
      return typeof v6AcqRun_ === 'function' ? v6AcqRun_(p) : v6RouteMissing_(a, 'v6AcqRun_');
    case 'v6AcqLandingPages':
      return typeof v6AcqLandingPages_ === 'function' ? v6AcqLandingPages_(p) : v6RouteMissing_(a, 'v6AcqLandingPages_');
    case 'v6AcqSignals':
      return typeof v6AcqSignals_ === 'function' ? v6AcqSignals_(p) : v6RouteMissing_(a, 'v6AcqSignals_');
    case 'v6AcqIngestSignal':
      return typeof v6AcqIngestSignal_ === 'function' ? v6AcqIngestSignal_(p) : v6RouteMissing_(a, 'v6AcqIngestSignal_');
    case 'v6AcqRouteLeads':
      return typeof v6AcqRouteLeads_ === 'function' ? v6AcqRouteLeads_(p) : v6RouteMissing_(a, 'v6AcqRouteLeads_');
    case 'v6AcqInstallTrigger':
      return typeof v6AcqInstallAutomationTrigger_ === 'function' ? v6AcqInstallAutomationTrigger_(p) : v6RouteMissing_(a, 'v6AcqInstallAutomationTrigger_');
    case 'v6AcqCycleStatus':
      return typeof v6AcqCycleStatus_ === 'function' ? v6AcqCycleStatus_(p) : v6RouteMissing_(a, 'v6AcqCycleStatus_');
    case 'v6AcqCycleReport':
      return typeof v6AcqCycleReport_ === 'function' ? v6AcqCycleReport_((p || {}).cycleId) : v6RouteMissing_(a, 'v6AcqCycleReport_');
    case 'v6AcqWpPublishNow':
      return typeof v6AcqWpPublishAllEvergreen_ === 'function' ? v6AcqWpPublishAllEvergreen_((p || {}).cycleId || (typeof v6AcqDueCycle_ === 'function' ? v6AcqDueCycle_().cycleId : '')) : v6RouteMissing_(a, 'v6AcqWpPublishAllEvergreen_');
    case 'v6AcqWpQaRun':
      return typeof v6AcqWpQaRun_ === 'function' ? v6AcqWpQaRun_(p) : v6RouteMissing_(a, 'v6AcqWpQaRun_');
    case 'v6AcqGa4Status':
      return typeof v6AcqGa4Status_ === 'function' ? v6AcqGa4Status_(p) : v6RouteMissing_(a, 'v6AcqGa4Status_');
    case 'v6AcqLandingReport':
      return typeof v6AcqLandingReport_ === 'function' ? v6AcqLandingReport_(p) : v6RouteMissing_(a, 'v6AcqLandingReport_');
    case 'v6AuraAutomationTick':
      return typeof v6AuraAutomationTick_ === 'function' ? v6AuraAutomationTick_(p) : v6RouteMissing_(a, 'v6AuraAutomationTick_');
    case 'v6AuraAutomaticReportStatus':
      return typeof v6AuraAutomaticReportStatus_ === 'function' ? v6AuraAutomaticReportStatus_(p) : v6RouteMissing_(a, 'v6AuraAutomaticReportStatus_');
    case 'v6AuraExecutionReport':
      return typeof v6AuraExecutionReport_ === 'function' ? v6AuraExecutionReport_(p) : v6RouteMissing_(a, 'v6AuraExecutionReport_');
    default:
      return null;
  }
}

function v6RouteMissing_(action, handler) {
  throw new Error('V6_HANDLER_NOT_DEPLOYED: ' + action + ' -> ' + handler);
}
