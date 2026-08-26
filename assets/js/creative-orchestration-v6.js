(function(global){
  "use strict";
  function eligible(asset,context){const a=asset||{},c=context||{};if(a.approved!==true||a.mediaType!=="REAL PHOTO")return false;if(c.objective==="Quoted Not Booked"&&c.allowNoHero)return false;if(Number(a.daysSinceAccountUse||999)<90&&!c.directContinuation)return false;if(Number(a.daysSinceLastUsed||999)<60)return false;if(c.lastHeroId&&a.id===c.lastHeroId&&c.alternativesExist)return false;return true;}
  function selectAsset(assets,context){const options=(assets||[]).filter(a=>eligible(a,context)).sort((a,b)=>Number(a.use90d||0)-Number(b.use90d||0)||Number(b.daysSinceLastUsed||0)-Number(a.daysSinceLastUsed||0));if(context?.objective==="Quoted Not Booked"&&context?.allowNoHero)return {status:"APPROVED",asset:null,creativeSystem:"DGL Executive Minimal"};return options.length?{status:"APPROVED",asset:options[0]}:{status:"BACKEND FEATURE NOT DEPLOYED",asset:null};}
  global.DGL_CREATIVE_ORCHESTRATION_V6={version:"6.0",eligible,selectAsset,fields:["CREATIVE ASSET","REAL PHOTO","LAST USED","90D USE","ASSET COOLDOWN","APPROVED"]};
})(window);
