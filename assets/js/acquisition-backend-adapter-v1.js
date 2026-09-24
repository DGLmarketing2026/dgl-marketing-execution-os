/** Acquisition delegates all authentication and transport to the main adapter. */
(function(g){"use strict";
const base=()=>g.DGL_MARKETING_BACKEND_ADAPTER_V55;
const call=action=>base().authenticatedRequest(action,{});
g.DGL_ACQUISITION_BACKEND_V1={isConnected:()=>!!base()?.isConnected(),status:()=>call("v6AcqStatus"),run:()=>call("v6AcqRun"),setup:()=>call("v6AcqSetup"),pages:()=>call("v6AcqLandingPages"),signals:()=>call("v6AcqSignals"),routeLeads:()=>call("v6AcqRouteLeads"),installTrigger:()=>call("v6AcqInstallTrigger")};
})(window);
