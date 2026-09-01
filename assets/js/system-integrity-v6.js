(function(global){
"use strict";
const forbiddenLoaded=[
  ["DGL_AM_REQUESTS","AM Request intake runtime"],
  ["DGL_CAMPAIGN_OPPORTUNITY_CENTER_V5","Legacy AM opportunity center"]
];
function inspect(){
  const issues=[];
  forbiddenLoaded.forEach(([key,label])=>{if(global[key])issues.push(`${label} is loaded (${key})`);});
  const required=[
    ["DGL_MARKETING_BACKEND_ADAPTER_V55","Private backend adapter"],
    ["DGL_MARKETING_PLAYBOOKS","Governed playbooks"],
    ["DGL_CAMPAIGN_STUDIO_V6","Campaign Studio V6"],
    ["DGL_CAMPAIGN_SCOPE_BRIDGE_V6","Automatic scope bridge"],
    ["DGL_LIFECYCLE_MODULES_V6","Lifecycle modules"],
    ["DGL_ACCOUNT_CAMPAIGN_PIPELINE_V6","Account pipeline"]
  ];
  required.forEach(([key,label])=>{if(!global[key])issues.push(`${label} missing (${key})`);});
  return {ok:issues.length===0,issues,architecture:"AUTOMATION_FIRST_V6_6",checkedAt:new Date().toISOString()};
}
global.DGL_SYSTEM_INTEGRITY_V6={version:"6.6",inspect};
document.addEventListener("DOMContentLoaded",()=>setTimeout(()=>{
  const r=inspect();
  if(!r.ok)console.error("DGL V6.6 integrity check failed",r.issues);
  else console.info("DGL V6.6 canonical runtime loaded",r);
},0));
})(window);