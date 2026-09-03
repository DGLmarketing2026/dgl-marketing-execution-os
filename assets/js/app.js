/**
 * DGL Marketing OS — Canonical Runtime V6.6.6
 * Full-module hardening: automation-first, no sample/demo workflow.
 */
(function (global) {
  "use strict";

  const VERSION = "6.6.6";
  const BASE_URL = "https://dglmarketing2026.github.io/dgl-marketing-execution-os/";
  const OWNER_KEY = "dgl_v6_owner_filter";
  const CONTEXT_KEY = "dgl_v5_campaign_context";

  const MODULE_GROUPS = [
    { label: "COMMAND", items: [
      { id: "command-center", label: "Marketing Campaign Command Center", icon: "layout-dashboard", group: "Comando Ejecutivo" }
    ]},
    { label: "CAMPAIGNS", items: [
      { id: "campaign-opportunities", label: "Campaign Opportunities", icon: "radar", group: "Campaigns" },
      { id: "campaign-execution", label: "Campaign Control", icon: "megaphone", group: "Campaigns" },
      { id: "campaign-studio", label: "Campaign Studio", icon: "palette", group: "Campaigns" },
      { id: "reactivation", label: "Reactivation Campaigns", icon: "refresh-cw", group: "Campaigns" },
      { id: "quoted-not-booked", label: "Quoted Not Booked", icon: "file-warning", group: "Campaigns" },
      { id: "growth", label: "Cross-Sell Campaigns", icon: "shuffle", group: "Campaigns" },
      { id: "retention", label: "Retention / Nurture", icon: "shield-check", group: "Campaigns" }
    ]},
    { label: "FUTURE ARCHITECTURE", items: [
      { id: "agent-control", label: "Agent Control · Future", icon: "bot", group: "Future Architecture" }
    ]},
    { label: "CAMPAIGNS BY SERVICE", items: [
      { id: "service-marketing", label: "Service Campaign Overview", icon: "layers-3", group: "Service Marketing" },
      { id: "ftl-marketing", label: "FTL Campaigns", icon: "truck", group: "Campaigns by Service" },
      { id: "ltl-marketing", label: "LTL Campaigns", icon: "package-open", group: "Campaigns by Service" },
      { id: "drayage-marketing", label: "Drayage Campaigns", icon: "container", group: "Campaigns by Service" }
    ]},
    { label: "CHANNELS", items: [
      { id: "email-marketing", label: "Email Marketing", icon: "mail", group: "Channels" },
      { id: "channel-orchestration", label: "Paid / Retargeting / LinkedIn", icon: "radio", group: "Channels" },
      { id: "content-library", label: "Content & Landing Assets", icon: "folder-open", group: "Channels" },
      { id: "automation-playbooks", label: "Automation Playbooks", icon: "workflow", group: "Channels" }
    ]},
    { label: "ACCOUNTS", items: [
      { id: "account-campaign-pipeline", label: "Account Campaign Pipeline", icon: "git-branch", group: "Accounts" },
      { id: "priority-queue", label: "Account Priority Queue", icon: "list-filter", group: "Accounts" },
      { id: "account-360", label: "Account 360", icon: "contact-round", group: "Accounts" }
    ]},
    { label: "ANALYTICS", items: [
      { id: "campaign-attribution", label: "Campaign Revenue Attribution", icon: "circle-dollar-sign", group: "Analytics" },
      { id: "analytics", label: "Marketing Analytics", icon: "bar-chart-3", group: "Analytics" },
      { id: "account-campaign-reports", label: "Account & Campaign Reports", icon: "file-bar-chart", group: "Analytics" }
    ]},
    { label: "ADMIN", items: [
      { id: "governance", label: "Governance & Approvals", icon: "check-square", group: "Admin" }
    ]}
  ];

  const ALL_MODULES = MODULE_GROUPS.flatMap(g => g.items);
  const DEFAULT_MODULE = "command-center";
  const FAMILY_ORDER = { QNB: 1, RETENTION: 2, REACTIVATION: 3, "CROSS-SELL": 4, NURTURE: 5 };
  const FAMILY_LABEL = { QNB: "Quoted Not Booked", RETENTION: "Retention", REACTIVATION: "Reactivation", "CROSS-SELL": "Cross-Sell", NURTURE: "Nurture / Relationship Renewal" };
  const PIPELINE_STAGES = ["OPPORTUNITY DETECTED","ELIGIBLE FOR CAMPAIGN","CAMPAIGN ACTIVE","RESPONDED","RFQ RECEIVED","QUOTED","LOAD / REACTIVATED","RETAINED / EXPANDED","COOLDOWN / NURTURE","CLOSED / SUPPRESSED"];

  // V6.6.6 safe aggregate recovery snapshot.
  // Contains owner-level opportunity/pipeline aggregates only; no account/contact PII.
  const RECOVERY_SNAPSHOT_AT = "2026-09-03T13:52:00-05:00";
  const RECOVERY_OWNERS = ["Alejandro Ochoa","Alex Cifuentes","Ali Pirela","Andres Bernal","Andy J. McNelly","Caroline Salamanca","Cindy Ave","Cristian Serna","DGL Accounts","Daniel Martin","David Cuestas","Fabian Lopez","German Cano","House Account","Juan Rodriguez","Juan Ruiz","Luis Simoes","Manuel Arias","Mateo Matallana","Nicolas Monroy","Santiago Villegas","Sebastian Crespo","Tatiana Lozano","Valentina Rico"];
  const RECOVERY_TYPES = ["CROSS-SELL","NURTURE","QNB","REACTIVATION","RETENTION"];
  const RECOVERY_SERVICES = ["Drayage","FTL","LTL","Multiservicio"];
  const RECOVERY_WINDOWS = ["","0-14","15-30","30+"];
  const RECOVERY_GROUPS_RAW = [[5,2,2,1,15,15,0],[2,2,2,2,14,14,0],[2,2,2,1,12,12,0],[16,2,0,3,12,12,0],[5,2,2,2,11,11,0],[2,2,2,3,10,10,0],[12,2,2,3,10,10,0],[16,2,2,1,8,8,0],[2,2,1,3,7,7,0],[17,2,2,3,6,6,0],[7,2,1,2,5,5,0],[11,2,0,3,5,5,0],[0,2,2,1,4,4,0],[2,2,1,1,4,4,0],[5,2,2,3,4,4,0],[11,2,1,3,4,4,0],[16,2,2,2,4,4,0],[20,2,2,1,4,4,0],[2,2,0,2,3,3,0],[5,2,1,2,3,3,0],[7,2,1,1,3,3,0],[7,2,1,3,3,3,0],[7,2,2,1,3,3,0],[12,2,2,2,3,3,0],[16,2,1,3,3,3,0],[16,2,1,1,3,3,0],[16,2,0,2,3,3,0],[20,2,2,3,3,3,0],[23,2,1,3,3,3,0],[23,2,1,1,3,3,0],[0,2,0,1,2,2,0],[2,2,1,2,2,2,0],[3,2,1,2,2,2,0],[5,2,0,1,2,2,0],[7,2,0,3,2,2,0],[7,2,2,3,2,2,0],[11,2,0,1,2,2,0],[11,2,2,3,2,2,0],[11,2,2,1,2,2,0],[12,2,1,3,2,2,0],[12,2,0,3,2,2,0],[16,2,0,1,2,2,0],[17,2,2,1,2,2,0],[17,2,1,3,2,2,0],[20,2,0,3,2,2,0],[23,2,2,1,2,2,0],[23,2,1,2,2,2,0],[0,2,2,3,1,1,0],[0,2,0,3,1,1,0],[0,2,1,3,1,1,0],[0,2,1,1,1,1,0],[1,2,0,3,1,1,0],[2,2,0,1,1,1,0],[3,2,1,3,1,1,0],[5,2,1,3,1,1,0],[5,2,0,2,1,1,0],[5,2,0,3,1,1,0],[5,2,1,1,1,1,0],[7,2,2,2,1,1,0],[11,2,1,1,1,1,0],[11,2,1,2,1,1,0],[11,2,2,2,1,1,0],[12,2,0,1,1,1,0],[12,2,1,1,1,1,0],[12,2,2,1,1,1,0],[14,2,2,2,1,1,0],[14,2,2,1,1,1,0],[15,2,0,1,1,1,0],[15,2,2,1,1,1,0],[16,2,1,2,1,1,0],[16,2,2,3,1,1,0],[17,2,0,1,1,1,0],[17,2,0,2,1,1,0],[17,2,0,3,1,1,0],[17,2,1,1,1,1,0],[20,2,1,3,1,1,0],[20,2,2,2,1,1,0],[20,2,1,1,1,1,0],[23,2,0,2,1,1,0],[23,2,2,2,1,1,0],[23,2,2,3,1,1,0],[13,2,2,3,14,0,14],[13,2,2,2,11,0,11],[13,2,2,1,4,0,4],[13,2,0,3,2,0,2],[7,2,3,3,1,0,1],[13,2,1,1,1,0,1],[13,2,0,1,1,0,1],[23,2,3,2,1,0,1],[12,4,3,0,8,4,4],[11,4,3,0,7,4,3],[2,4,3,0,12,3,9],[1,4,3,0,4,3,1],[5,4,3,0,9,2,7],[16,4,3,0,6,2,4],[20,4,3,0,5,2,3],[3,4,3,0,1,1,0],[9,4,3,0,1,1,0],[16,4,2,0,1,1,0],[16,4,1,0,1,1,0],[18,4,3,0,1,1,0],[20,4,0,0,1,1,0],[8,4,3,0,6,0,6],[0,4,3,0,2,0,2],[5,4,2,0,2,0,2],[13,4,3,0,2,0,2],[17,4,3,0,2,0,2],[5,4,1,0,1,0,1],[18,3,3,0,5,5,0],[5,3,3,0,10,4,6],[12,3,3,0,3,2,1],[17,3,3,0,3,2,1],[2,3,3,0,11,1,10],[16,3,3,0,7,1,6],[11,3,3,0,2,1,1],[23,3,3,0,2,1,1],[13,3,3,0,98,0,98],[8,3,3,0,28,0,28],[5,3,2,0,3,0,3],[16,3,2,0,3,0,3],[0,3,3,0,2,0,2],[3,3,3,0,2,0,2],[4,3,1,0,2,0,2],[0,3,2,0,1,0,1],[7,3,2,0,1,0,1],[11,3,2,0,1,0,1],[15,3,2,0,1,0,1],[16,3,1,0,1,0,1],[16,3,0,0,1,0,1],[20,3,3,0,1,0,1],[21,0,3,0,43,6,37],[10,0,3,0,6,2,4],[4,0,3,0,4,2,2],[14,0,3,0,4,2,2],[0,0,3,0,3,2,1],[1,0,3,0,3,2,1],[19,0,3,0,17,1,16],[6,0,3,0,4,1,3],[12,0,3,0,3,1,2],[20,0,3,0,3,1,2],[22,0,3,0,3,1,2],[3,0,3,0,6,0,6],[15,0,3,0,1,0,1],[5,1,3,0,4,1,3],[20,1,3,0,1,1,0],[5,1,2,0,3,0,3],[23,1,3,0,3,0,3],[2,1,3,0,2,0,2],[7,1,2,0,2,0,2],[11,1,0,0,2,0,2],[11,1,2,0,2,0,2],[0,1,1,0,1,0,1],[0,1,3,0,1,0,1],[0,1,2,0,1,0,1],[2,1,2,0,1,0,1],[12,1,3,0,1,0,1],[15,1,2,0,1,0,1],[16,1,3,0,1,0,1],[16,1,0,0,1,0,1],[16,1,2,0,1,0,1],[17,1,3,0,1,0,1],[20,1,1,0,1,0,1]];
  const RECOVERY_PIPELINE_STAGES = ["CLOSED / SUPPRESSED","OPPORTUNITY DETECTED"];
  const RECOVERY_PIPELINE_RAW = [[0,0,1],[0,1,12],[1,0,1],[1,1,6],[2,1,57],[3,0,1],[3,1,4],[4,0,2],[4,1,2],[5,1,46],[6,0,1],[6,1,1],[7,0,1],[7,1,19],[8,0,27],[9,1,1],[10,0,1],[10,1,2],[11,1,23],[12,1,27],[13,0,122],[14,1,4],[15,0,1],[15,1,2],[16,1,42],[17,1,16],[18,1,6],[19,0,1],[19,1,1],[20,1,17],[21,1,6],[22,1,1],[23,0,1],[23,1,14]];
  const RECOVERY_SUMMARY = { totalSignals:668, eligibleAccounts:309, suppressedAccounts:359, groupCount:162, ownerCount:24 };

  function recoveryGroups() {
    return RECOVERY_GROUPS_RAW.map((r,i)=>({
      groupId:`RECOVERY-GROUP-${i+1}`,
      amOwner:RECOVERY_OWNERS[r[0]],
      opportunityType:RECOVERY_TYPES[r[1]],
      service:RECOVERY_SERVICES[r[2]],
      window:RECOVERY_WINDOWS[r[3]],
      qnbWindow:RECOVERY_WINDOWS[r[3]],
      reasonCategory:"",
      detectedAccounts:r[4],
      eligibleAccounts:r[5],
      suppressedAccounts:r[6],
      priority:FAMILY_ORDER[family(RECOVERY_TYPES[r[1]])]||99,
      source:"DGL_MARKETING_DATA_HUB · SAFE AGGREGATE",
      campaignStatus:"OPPORTUNITY DETECTED",
      lastEngineRun:"2026-08-26T23:17:07.869Z",
      nextAction:"Evaluate campaign eligibility",
      recoverySnapshot:true
    }));
  }

  function recoveryPipeline() {
    const out=[];
    RECOVERY_PIPELINE_RAW.forEach(r=>{
      const owner=RECOVERY_OWNERS[r[0]], stage=RECOVERY_PIPELINE_STAGES[r[1]];
      for(let i=0;i<r[2];i++) out.push({amOwner:owner,currentStage:stage,recoveryAggregate:true});
    });
    return out;
  }

  function safeBackendError(error) {
    const raw=clean(error?.message||error||"V6 endpoint error");
    return raw.replace(/https?:\/\/\S+/gi,"").replace(/[A-Za-z0-9_-]{24,}/g,"[redacted]").slice(0,160);
  }

  const A = () => global.DGL_MARKETING_BACKEND_ADAPTER_V55;
  const R = global.DGL_MODULE_RENDERERS = global.DGL_MODULE_RENDERERS || {};
  const E = v => String(v == null ? "" : v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
  const U = v => String(v == null ? "" : v).trim().toUpperCase();
  const N = n => Number(n || 0).toLocaleString("en-US");
  const clean = v => String(v == null ? "" : v).trim();
  const connected = () => !!A()?.isConnected?.();
  const selectedOwner = () => sessionStorage.getItem(OWNER_KEY) || "ALL";
  const setOwner = v => sessionStorage.setItem(OWNER_KEY, v || "ALL");
  const providerStatus = () => global.DGL_CAMPAIGN_EXECUTION_V6?.providerStatus || "BULK PROVIDER NOT CONFIGURED";
  const providerReady = () => !/NOT CONFIGURED|BLOCKED/i.test(providerStatus());
  const readContext = () => { try { return JSON.parse(sessionStorage.getItem(CONTEXT_KEY) || "{}"); } catch (_) { return {}; } };
  const writeContext = x => { sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(x || {})); return x || {}; };

  function absoluteAsset(value) {
    const raw = clean(value);
    if (!raw) return "";
    if (/^(?:https?:|cid:|data:)/i.test(raw)) return raw;
    return BASE_URL + raw.replace(/^\.\//, "").replace(/^\//, "");
  }

  function absolutizeHtml(html) {
    let out = String(html || "");
    out = out.replace(/(["'(=])(?:\.\/)?assets\//gi, (_, lead) => `${lead}${BASE_URL}assets/`);
    out = out.replace(/url\(\s*(["']?)(?:\.\/)?assets\//gi, (_, quote) => `url(${quote}${BASE_URL}assets/`);
    return out;
  }

  function normalizeWindow(value) {
    const raw = clean(value), x = U(raw).replace(/[–—]/g, "-").replace(/\s/g, "");
    if (!raw) return "";
    if (["3-7","8-14","0-14"].includes(x)) return "0-14";
    if (x === "15-30") return "15-30";
    if ([">30","30+"].includes(x)) return "30+";
    if (/GMT|STANDARD TIME|HORA ESTÁNDAR|^\w{3}\s\w{3}\s\d{1,2}\s\d{4}/i.test(raw)) return "0-14";
    return raw;
  }

  function family(value) {
    const x = U(value);
    if (x.includes("QUOTE") || x.includes("QNB")) return "QNB";
    if (x.includes("RETENTION")) return "RETENTION";
    if (x.includes("REACTIVATION")) return "REACTIVATION";
    if (x.includes("CROSS")) return "CROSS-SELL";
    if (x.includes("NURTURE") || x.includes("RENEWAL")) return "NURTURE";
    return x || "UNKNOWN";
  }

  function objectiveFor(row) {
    const f = family(row?.opportunityType || row?.campaignFamily || row?.objective);
    if (f === "QNB") return "Quoted Not Booked";
    if (f === "CROSS-SELL") return "Cross-Sell";
    if (f === "RETENTION" || f === "NURTURE") return "Retention";
    return "Reactivation";
  }

  function slug(v) {
    return clean(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function scopeId(row) {
    const parts=["SCOPE",slug(row?.amOwner||"UNASSIGNED"),slug(family(row?.opportunityType)),slug(row?.service||"MULTISERVICIO")];
    const w=normalizeWindow(row?.window||row?.qnbWindow||"");
    if(w) parts.push(w==="30+"?"30-PLUS":slug(w));
    const reason=slug(row?.reasonCategory||"");
    if(reason) parts.push(reason);
    return parts.filter(Boolean).join("-");
  }

  function ownerList(groups) {
    return [...new Set((groups || []).map(x => clean(x.amOwner || "Unassigned")).filter(Boolean))].sort((a,b) => a.localeCompare(b));
  }

  function filterOwner(rows) {
    const owner = selectedOwner();
    return owner === "ALL" ? (rows || []) : (rows || []).filter(x => clean(x.amOwner || "Unassigned") === owner);
  }

  function contextCtaKey(ctx) {
    const objective = objectiveFor(ctx);
    if (objective === "Quoted Not Booked") return "Recover Quote";
    if (objective === "Retention") return "Reply";
    return "Generate Quote";
  }

  function normalizeCampaignContext(input) {
    const x = { ...(input || {}) };
    if (x.qnbWindow || x.window) x.qnbWindow = x.window = normalizeWindow(x.qnbWindow || x.window);
    const ids = {
      "DGL Executive Minimal":"editorial-white",
      "DGL Editorial White":"editorial-white",
      "DGL Split Hero":"split-hero",
      "DGL Route Intelligence":"route-intelligence",
      "DGL Service Architecture":"service-architecture",
      "DGL Case / Proof":"case-proof",
      "DGL Case/Proof or Editorial White":"case-proof"
    };
    if (ids[x.creativeSystem]) x.creativeSystem = ids[x.creativeSystem];
    const ctaKeys = Object.keys(global.DGL_CREATIVE_LIBRARY_V5?.CTA || {});
    if (!ctaKeys.includes(x.ctaIntent)) x.ctaIntent = contextCtaKey(x);
    if (objectiveFor(x) === "Quoted Not Booked" && !x.creativeSystem) x.creativeSystem = "editorial-white";
    return x;
  }

  function patchContracts() {
    const lib = global.DGL_CREATIVE_LIBRARY_V5;
    if (lib && !lib.__canonical666) {
      if (lib.OBJECTIVES?.["Quoted Not Booked"]) {
        lib.OBJECTIVES["Quoted Not Booked"].recommendedSystem = "editorial-white";
        lib.OBJECTIVES["Quoted Not Booked"].defaultCta = "Recover Quote";
      }
      const originalResolve = typeof lib.resolveAsset === "function" ? lib.resolveAsset.bind(lib) : () => "";
      lib.resolveAsset = input => {
        const x = input || {};
        const raw = x.objective === "Quoted Not Booked"
          ? ((lib.SERVICES?.[x.service] || lib.SERVICES?.Multiservicio || {}).asset || "")
          : originalResolve(x);
        return absoluteAsset(raw);
      };
      lib.__canonical666 = true;
    }

    const playbooks = global.DGL_MARKETING_PLAYBOOKS;
    if (playbooks && !playbooks.__canonical666) {
      const originalResolve = playbooks.resolveStrategy?.bind(playbooks);
      const originalGet = playbooks.getPlaybookForRequest?.bind(playbooks);
      const idMap = {
        "DGL Executive Minimal":"editorial-white",
        "DGL Editorial White":"editorial-white",
        "DGL Split Hero":"split-hero",
        "DGL Route Intelligence":"route-intelligence",
        "DGL Service Architecture":"service-architecture",
        "DGL Case/Proof or Editorial White":"case-proof"
      };
      const ctaKey = request => {
        const o = objectiveFor(request);
        if (o === "Quoted Not Booked") return "Recover Quote";
        if (o === "Retention") return "Reply";
        return "Generate Quote";
      };
      const qnbAngle = request => {
        const reason = U(request?.reasonCategory);
        if (reason.includes("EXTERNAL")) return "Reopen Opportunity";
        if (reason.includes("PRICE")) return "Update Requirement";
        return "Still Active";
      };
      if (originalGet) {
        playbooks.getPlaybookForRequest = request => {
          const p = originalGet(request);
          return p ? { ...p, creativeSystem: idMap[p.creativeSystem] || p.creativeSystem, ctaIntent: ctaKey(request) } : p;
        };
      }
      if (originalResolve) {
        playbooks.resolveStrategy = request => {
          const result = originalResolve(request);
          if (!result?.strategy) return result;
          const strategy = { ...result.strategy };
          strategy.creativeSystem = idMap[strategy.creativeSystem] || strategy.creativeSystem;
          strategy.ctaMessage = strategy.ctaIntent || strategy.CTA || "";
          strategy.ctaIntent = ctaKey(request);
          strategy.qnbWindow = normalizeWindow(strategy.qnbWindow || request?.qnbWindow || request?.window);
          if (objectiveFor(request) === "Quoted Not Booked") strategy.messageAngle = qnbAngle(request);
          return { ...result, strategy };
        };
      }
      playbooks.__canonical666 = true;
    }

    const seq = global.DGL_CAMPAIGN_SEQUENCES_V4;
    if (seq && !seq.__canonical666) {
      seq.getSequence = (objective, service, language, qnbWindow) => {
        const en = language === "English";
        const q = normalizeWindow(qnbWindow || readContext().qnbWindow || readContext().window || "0-14");
        const rows = objective === "Quoted Not Booked"
          ? (q === "30+" ? [[0,"Reopen Conversation"],[14,"Capability Reminder"],[30,"Cooldown / Nurture"]] : q === "15-30" ? [[0,"Quote Recovery"],[12,"Light Recovery Follow-Up"]] : [[0,"Quote Follow-Up"],[10,"Light Follow-Up"]])
          : objective === "Retention" ? [[0,"Relationship Check-In"],[14,"Planning Ahead"],[30,"Continuity Touch"]]
          : objective === "Cross-Sell" ? [[0,"Relevant Additional Capability"],[14,"Use Case / Proof"],[30,"Cooldown"]]
          : objective === "Service Campaign" ? [[0,"Service Capability"],[14,"Relevant Use Case"],[30,"Cooldown"]]
          : [[0,"Reactivation"],[12,"Capability Reminder"],[30,"Cooldown / Nurture"]];
        return rows.map(([day,purpose],i) => ({ touch:i+1, day, type:"Email", channel:"Email", purpose: en ? purpose : purpose, status:i===0?"READY":"SCHEDULED" }));
      };
      seq.__canonical666 = true;
    }

    const opp = global.DGL_MARKETING_OPPORTUNITY_ENGINE_V6;
    if (opp && !opp.__canonical666) {
      opp.groupOpportunities = rows => {
        const groups = new Map();
        (rows || []).forEach(row => {
          const w = normalizeWindow(row.qnbWindow || row.window || "");
          const key = [clean(row.amOwner || "Unassigned"),family(row.opportunityType),clean(row.service || "Unspecified"),w,U(row.reasonCategory || "")].join("|");
          const suppressed = U(row.eligibilityStatus) === "SUPPRESSED";
          if (!groups.has(key)) groups.set(key,{id:`OPP-${groups.size+1}`,amOwner:row.amOwner||"Unassigned",opportunityType:row.opportunityType||"Unknown",service:row.service||"Unspecified",window:w,qnbWindow:w,reasonCategory:row.reasonCategory||"",detectedAccounts:0,eligibleAccounts:0,suppressedAccounts:0,campaignStatus:"OPPORTUNITY DETECTED",priority:FAMILY_ORDER[family(row.opportunityType)]||99,source:row.sourceReport||row.source||"PRIVATE COMMERCIAL REPORTS",lastEngineRun:row.updatedAt||row.lastEngineRun||"—",nextAction:"Evaluate campaign eligibility"});
          const g = groups.get(key); g.detectedAccounts++; suppressed ? g.suppressedAccounts++ : g.eligibleAccounts++;
        });
        return [...groups.values()].sort((a,b)=>a.priority-b.priority||b.eligibleAccounts-a.eligibleAccounts);
      };
      opp.suppressCompeting = rows => {
        const best = new Map();
        (rows || []).forEach(row => { const id=clean(row.accountId), p=FAMILY_ORDER[family(row.opportunityType)]||99; if(id && (!best.has(id)||p<best.get(id))) best.set(id,p); });
        return (rows || []).map(row => { const id=clean(row.accountId), p=FAMILY_ORDER[family(row.opportunityType)]||99, blocked=id&&best.has(id)&&p>best.get(id); return {...row,eligible:blocked?false:row.eligible!==false,suppressionStatus:blocked?"HIGHER PRIORITY":row.suppressionStatus||"CLEAR"}; }).sort((a,b)=>(FAMILY_ORDER[family(a.opportunityType)]||99)-(FAMILY_ORDER[family(b.opportunityType)]||99));
      };
      opp.__canonical666 = true;
    }

    const studio = global.DGL_CAMPAIGN_STUDIO_V5;
    if (studio && !studio.__canonical666) {
      const originalHtml = studio.emailHtml?.bind(studio);
      const originalPreview = studio.getPreview?.bind(studio);
      if (originalHtml) studio.emailHtml = () => absolutizeHtml(originalHtml());
      if (originalPreview) studio.getPreview = () => { const p=originalPreview()||{}, strategy={...(p.strategy||{})}; if(strategy.heroUrl)strategy.heroUrl=absoluteAsset(strategy.heroUrl); if(strategy.logoUrl)strategy.logoUrl=absoluteAsset(strategy.logoUrl); return {...p,strategy,html:absolutizeHtml(p.html||"")}; };
      studio.__canonical666 = true;
    }

    const adapter = A();
    if (adapter && !adapter.__canonical666) {
      const originalDraft = adapter.createTestDraft?.bind(adapter);
      const originalState = adapter.getConnectionState?.bind(adapter);
      const originalCreateRequest = adapter.createRequest?.bind(adapter);
      const originalCreateCampaign = adapter.createCampaign?.bind(adapter);
      const scopeKey = x => clean(x?.scopeId || x?.audienceId || x?.sourceKey || x?.sourceLabel || x?.portfolioName || x?.context?.scopeId || x?.context?.audienceId);
      if (originalDraft) adapter.createTestDraft = (campaignId,draft) => originalDraft(campaignId,{...(draft||{}),htmlBody:absolutizeHtml(draft?.htmlBody||"")});
      if (originalState) adapter.getConnectionState = () => { const s=originalState(); return {...s,mode:s.connected?"PRIVATE_BACKEND":"PRIVATE_BACKEND_REQUIRED"}; };
      if (originalCreateRequest) adapter.createRequest = record => {
        const scope=scopeKey(record);
        const existing=scope?(adapter.getRequests?.()||[]).find(r=>scopeKey(r)===scope):null;
        return existing?Promise.resolve(existing):originalCreateRequest(record);
      };
      if (originalCreateCampaign) adapter.createCampaign = payload => {
        const strategy=payload?.strategy||payload?.context||payload||{},scope=scopeKey(strategy);
        const existing=scope?(adapter.getCampaigns?.()||[]).find(c=>scopeKey(c)===scope):null;
        return existing?Promise.resolve(existing):originalCreateCampaign(payload);
      };
      adapter.__canonical666 = true;
    }

    const ctx = normalizeCampaignContext(readContext());
    if (Object.keys(ctx).length) writeContext(ctx);
  }

  function statusTone(value) {
    const x = U(value);
    if (/CLEAR|READY|RESOLVED|APPROVED|LIVE|ENFORCED|AUTOMATIC|AVAILABLE/.test(x) && !/NOT READY|NOT CONFIGURED/.test(x)) return "live";
    if (/BLOCK|FAILED|NOT CONFIGURED|REQUIRED/.test(x)) return "blocked";
    if (/PENDING|PARTIAL|FALLBACK|REVIEW|NOT EVALUATED/.test(x)) return "warn";
    return "info";
  }

  const badge = (text,tone) => `<span class="life-badge ${tone || statusTone(text)}">${E(text)}</span>`;
  const kpis = rows => `<div class="kpi-grid">${rows.map(([label,value,numeric=true])=>`<div class="kpi-card"><div class="kpi-content"><div class="kpi-label">${E(label)}</div><div class="kpi-value">${numeric?N(value):E(value)}</div></div></div>`).join("")}</div>`;
  function backendBadge() {
    if(!connected()) return badge("PRIVATE BACKEND REQUIRED","warn");
    if(dataCache.runtime==="V6_LIVE") return badge("PRIVATE BACKEND / V6 LIVE","live");
    if(dataCache.runtime==="RECOVERED"||dataCache.runtime==="PARTIAL_RECOVERY") return badge("PRIVATE BACKEND / RECOVERED","warn");
    return badge("PRIVATE BACKEND / CONNECTED","info");
  }
  const header = (title,sub,eye="AUTOMATION LIFECYCLE · V6") => `<div class="page-head"><div><div class="eyebrow">${E(eye)}</div><h2>${E(title)}</h2><p class="lede">${E(sub)}</p></div><div class="page-head-actions">${backendBadge()}${connected()?'<button class="btn btn-secondary" data-canonical-refresh>REFRESH VIEW</button>':'<button class="btn btn-primary" data-canonical-connect>CONNECT PRIVATE BACKEND</button>'}</div></div>`;

  function currentScopeState() {
    const x = normalizeCampaignContext(readContext());
    const contacts = Number(x.eligibleContactCount || x.recipientCount || 0);
    const frequency = U(x.frequencyStatus || "");
    const exclusions = U(x.exclusionStatus || x.exclusionsStatus || "");
    const approval = U(x.policyApprovalStatus || x.approvalStatus || "");
    const audienceResolved = x.audienceResolved === true || U(x.audienceStatus) === "RECIPIENTS RESOLVED";
    const frequencyClear = ["CLEAR","PASSED"].includes(frequency);
    const exclusionsClear = x.exclusionsCleared === true || ["CLEAR","CLEARED","PASSED"].includes(exclusions);
    const policyApproved = x.policyApproved===true || (/\bAPPROVED\b/.test(approval) && !/NOT APPROVED|REJECTED|REJECT/.test(approval));
    return {...x,contacts,audienceResolved,frequencyClear,exclusionsClear,policyApproved};
  }

  function qnbMessageStrategy(row) {
    const r = U(row?.reasonCategory || "");
    if (r.includes("PRICE")) return "VALUE REPOSITIONING";
    if (r.includes("NO FEEDBACK") || r.includes("WORKING")) return "LIGHT FOLLOW-UP";
    if (r.includes("EXTERNAL")) return "LONG-TERM NURTURE";
    return "WINDOW-BASED FALLBACK";
  }

  function contextFor(row) {
    const f=family(row?.opportunityType), w=normalizeWindow(row?.window||row?.qnbWindow||""), id=scopeId(row);
    const objective=objectiveFor(row);
    return normalizeCampaignContext({source:"REPORT / DATA HUB",opportunitySource:"REPORT / DATA HUB",scopeId:id,audienceId:id,amOwner:row?.amOwner||"Unassigned",campaignFamily:f,objective,campaignName:`${FAMILY_LABEL[f]||f} · ${row?.service||"Multiservicio"}${w?` · ${w}`:""}`,service:row?.service||"Multiservicio",qnbWindow:w,window:w,reasonCategory:row?.reasonCategory||"",messageStrategy:f==="QNB"?qnbMessageStrategy(row):"PLAYBOOK DEFAULT",dataQualityStatus:f==="QNB"&&!row?.reasonCategory?"WINDOW SIGNAL AVAILABLE":"SOURCE SIGNAL AVAILABLE",coordinationStatus:["RETENTION","REACTIVATION"].includes(f)?"AM ACTIVITY EVENT NOT JOINED":"NOT REQUIRED",automationPolicy:"AUTOMATION-FIRST",detectedAccounts:Number(row?.detectedAccounts||0),eligibleAccounts:Number(row?.eligibleAccounts||0),suppressedAccounts:Number(row?.suppressedAccounts||0),accountCount:Number(row?.eligibleAccounts||0),contactsStatus:"CONTACTS PENDING",eligibleContactCount:0,frequencyStatus:"PENDING BACKEND EVALUATION",exclusionStatus:"PENDING BACKEND EVALUATION",policyApprovalStatus:"PENDING POLICY DECISION",requiresHumanReview:false,executionReadiness:"BLOCKED",priority:Number(row?.priority||FAMILY_ORDER[f]||99),lastEngineRun:row?.lastEngineRun||null});
  }

  let dataCache={ts:0,groups:[],summary:null,pipeline:[],pipelineSummary:null,runtime:null,errors:[]};
  function aggregatePipeline(records) {
    const by={}; PIPELINE_STAGES.forEach(s=>by[s]=0); (records||[]).forEach(r=>{const s=U(r.currentStage||r.stage||"OPPORTUNITY DETECTED");by[s]=(by[s]||0)+1;}); return {total:(records||[]).length,byCurrentStage:by};
  }
  async function loadData(force=false) {
    if (!connected()) return {groups:[],summary:null,pipeline:[],pipelineSummary:null,runtime:"DISCONNECTED",errors:[]};
    if (!force && Date.now()-dataCache.ts<10000) return dataCache;

    const results=await Promise.allSettled([
      Promise.resolve().then(()=>A().v6Opportunities()),
      Promise.resolve().then(()=>A().v6AccountPipeline())
    ]);
    const opps=results[0].status==="fulfilled"?results[0].value:null;
    const pipe=results[1].status==="fulfilled"?results[1].value:null;
    const errors=[];
    if(results[0].status==="rejected") errors.push("Opportunities: "+safeBackendError(results[0].reason));
    if(results[1].status==="rejected") errors.push("Pipeline: "+safeBackendError(results[1].reason));

    const liveGroups=Array.isArray(opps?.groups)?opps.groups:null;
    const livePipeline=Array.isArray(pipe?.records)?pipe.records:Array.isArray(pipe?.pipeline)?pipe.pipeline:null;
    const oppRecovered=!liveGroups||liveGroups.length===0;
    const pipeRecovered=!livePipeline;
    const groups=oppRecovered?recoveryGroups():liveGroups;
    const pipeline=pipeRecovered?recoveryPipeline():livePipeline;
    const runtime=oppRecovered&&pipeRecovered?"RECOVERED":(oppRecovered||pipeRecovered?"PARTIAL_RECOVERY":"V6_LIVE");
    if(oppRecovered&&!errors.some(x=>x.startsWith("Opportunities:"))) errors.push("Opportunities: empty/invalid V6 response; safe aggregate restored.");
    if(pipeRecovered&&!errors.some(x=>x.startsWith("Pipeline:"))) errors.push("Pipeline: invalid V6 response; safe aggregate restored.");

    dataCache={
      ts:Date.now(),
      groups,
      summary:oppRecovered?{...RECOVERY_SUMMARY,recoverySnapshotAt:RECOVERY_SNAPSHOT_AT}:opps?.summary||null,
      pipeline,
      pipelineSummary:aggregatePipeline(pipeline),
      runtime,
      errors
    };
    return dataCache;
  }
  function invalidate(){dataCache={ts:0,groups:[],summary:null,pipeline:[],pipelineSummary:null,runtime:null,errors:[]};}

  function ownerToolbar(groups) {
    const owners=ownerList(groups), sel=selectedOwner();
    return `<div class="auto-ownerbar"><div><span>ACCOUNT OWNER</span><strong>${sel==="ALL"?"ALL OWNERS":E(sel)}</strong><small>${owners.length} owners detected automatically</small></div><select class="auto-owner-select" data-canonical-owner aria-label="Account owner"><option value="ALL">All owners</option>${owners.map(o=>`<option value="${E(o)}" ${sel===o?"selected":""}>${E(o)}</option>`).join("")}</select></div>`;
  }

  function scopeCard(row) {
    const ctx=contextFor(row), current=currentScopeState(), same=current.scopeId===ctx.scopeId, contacts=same&&current.audienceResolved?`${N(current.contacts)} ELIGIBLE`:"RESOLVE IN STUDIO", contactTone=same&&current.audienceResolved?"life-good":"life-contact-block";
    return `<article class="life-scope-card"><div class="life-scope-top"><div><div class="auto-card-meta"><span class="auto-owner">${E(ctx.amOwner)}</span><span class="life-kicker">${E(ctx.campaignFamily)} · PRIORITY ${ctx.priority}</span></div><h3>${E(ctx.campaignName)}</h3><p>${E(ctx.service)}${ctx.window?` · ${E(ctx.window)}`:""}${ctx.reasonCategory?` · ${E(ctx.reasonCategory)}`:""}</p></div>${badge(ctx.eligibleAccounts?"SCOPE READY":"NO PRE-GATE ELIGIBLE",ctx.eligibleAccounts?"live":"warn")}</div><div class="life-metric-row"><div><span>Detected</span><strong>${N(ctx.detectedAccounts)}</strong></div><div><span>Pre-gate eligible</span><strong>${N(ctx.eligibleAccounts)}</strong></div><div><span>Suppressed</span><strong>${N(ctx.suppressedAccounts)}</strong></div><div><span>Contacts</span><strong class="${contactTone}">${contacts}</strong></div></div><div class="auto-signal-grid"><div><span>MESSAGE STRATEGY</span><strong>${E(ctx.messageStrategy)}</strong></div><div><span>DATA QUALITY</span><strong>${E(ctx.dataQualityStatus)}</strong></div><div><span>COORDINATION</span><strong>${E(ctx.coordinationStatus)}</strong></div><div><span>AUTOMATION POLICY</span><strong>${same&&current.policyApproved?"AUTO BY POLICY · APPROVED":"POLICY EVALUATED IN STUDIO"}</strong></div></div><div class="life-scope-foot"><div><strong>${same&&current.audienceResolved?"RECIPIENTS RESOLVED":"AUTOMATIC SCOPE READY"}</strong><p>${same&&current.audienceResolved?`${N(current.contacts)} eligible contacts resolved. Production remains governed by policy and provider gates.`:"Open Studio to create/reuse the governed campaign record and resolve recipients."}</p></div><button class="btn btn-primary" data-canonical-prepare="${E(ctx.scopeId)}">OPEN CAMPAIGN</button></div></article>`;
  }

  function required(container,title,sub){container.innerHTML=header(title,sub)+`<div class="life-empty"><strong>Private backend required</strong><p>This runtime does not use sample or demo customer data. Connect the governed backend to load live aggregates.</p></div>`;}

  async function scopeView(container,{title,sub,families=null,service=null,eye="CAMPAIGN ENGINE · LIVE"}){
    if(!connected())return required(container,title,sub);
    const d=await loadData(), all=d.groups||[]; let base=all;
    if(families)base=base.filter(x=>families.includes(family(x.opportunityType)));
    if(service)base=base.filter(x=>U(x.service)===U(service));
    const visible=filterOwner(base).sort((a,b)=>(Number(a.priority)||99)-(Number(b.priority)||99)||Number(b.eligibleAccounts||0)-Number(a.eligibleAccounts||0));
    const det=visible.reduce((s,x)=>s+Number(x.detectedAccounts||0),0), pre=visible.reduce((s,x)=>s+Number(x.eligibleAccounts||0),0), sup=visible.reduce((s,x)=>s+Number(x.suppressedAccounts||0),0);
    global.__DGL_CANONICAL_GROUPS=Object.fromEntries(all.map(x=>[scopeId(x),x]));
    const recoveryNotice=d.runtime==="RECOVERED"||d.runtime==="PARTIAL_RECOVERY"
      ? `<div class="life-status-strip"><div><span>DATA SOURCE</span><strong>SAFE DATA HUB RECOVERY</strong></div><p>Live V6 routing is degraded; owner and opportunity aggregates are restored from the governed Data Hub snapshot (${E(RECOVERY_SNAPSHOT_AT)}). No customer/contact PII is embedded.</p></div>`
      : "";
    container.innerHTML=header(title,sub,eye)+ownerToolbar(base)+recoveryNotice+kpis([["DETECTED SIGNALS",det],["PRE-GATE ELIGIBLE",pre],["SUPPRESSED",sup],["AUTOMATIC SCOPES",visible.length]])+`<div class="life-status-strip"><div><span>Operating rule</span><strong>AUTOMATIC SCOPE GENERATION</strong></div><p>Marketing does not maintain recurring manual account lists. Final recipient eligibility is evaluated after contact, exclusion and frequency gates.</p></div><div class="life-scope-stack">${visible.length?visible.map(scopeCard).join(""):`<div class="life-empty"><strong>No live scopes for ${E(selectedOwner())}</strong></div>`}</div>`;
  }

  async function commandCenter(container){
    if(!connected())return required(container,"Marketing Campaign Command Center","Automatic decision system from commercial signal to retained revenue.");
    const d=await loadData(true), groups=filterOwner(d.groups), owner=selectedOwner(), pipeline=owner==="ALL"?d.pipeline:d.pipeline.filter(x=>clean(x.amOwner||"Unassigned")===owner), by=aggregatePipeline(pipeline).byCurrentStage, current=currentScopeState(), det=groups.reduce((s,x)=>s+Number(x.detectedAccounts||0),0), pre=groups.reduce((s,x)=>s+Number(x.eligibleAccounts||0),0), sup=groups.reduce((s,x)=>s+Number(x.suppressedAccounts||0),0);
    const contactState=current.audienceResolved?`${N(current.contacts)} CURRENT-SCOPE CONTACTS RESOLVED`:"PER-CAMPAIGN RESOLUTION";
    const policyState=current.policyApproved?"CURRENT SCOPE APPROVED":"POLICY EVALUATED PER CAMPAIGN";
    container.innerHTML=header("Marketing Campaign Command Center","Reports → opportunity → priority → recipients → policy → execution → response → attribution.","AUTOMATION COMMAND · LIVE")+ownerToolbar(d.groups)+kpis([["SIGNALS",det],["PRE-GATE ELIGIBLE",pre],["SUPPRESSED",sup],["AUTOMATIC SCOPES",groups.length]])+`<section class="auto-panel"><div class="auto-panel-head"><div><span>AUTOMATION READINESS</span><h3>Decision engines</h3></div>${badge("AUTOMATION FIRST","live")}</div><div class="auto-engine-grid">${[["Signal ingestion","LIVE"],["Priority conflict","LIVE"],["Owner discovery","DYNAMIC"],["QNB window normalization","CANONICAL"],["Recipient resolution",contactState],["Frequency / exclusions",current.audienceResolved?(current.frequencyClear&&current.exclusionsClear?"CURRENT SCOPE CLEAR":"CURRENT SCOPE EVALUATED"):"EVALUATED WITH RECIPIENTS"],["Policy",policyState],["Bulk execution",providerStatus()]].map(([l,s])=>`<div class="auto-engine"><span>${E(l)}</span><strong>${E(s)}</strong>${badge(s,statusTone(s))}</div>`).join("")}</div></section><div class="life-grid-2"><section class="life-panel"><h3>Commercial progression</h3><div class="life-funnel">${["OPPORTUNITY DETECTED","ELIGIBLE FOR CAMPAIGN","CAMPAIGN ACTIVE","RESPONDED","RFQ RECEIVED","QUOTED","LOAD / REACTIVATED","RETAINED / EXPANDED"].map(s=>`<div><span>${E(s)}</span><strong>${N(by[s])}</strong></div>`).join("")}</div></section><section class="life-panel"><h3>Current execution gate</h3><p class="life-copy">${current.audienceResolved?`Recipients are resolved for the current scope. ${current.policyApproved?"Policy is approved. ":"Policy remains under evaluation. "}${providerReady()?"Provider is ready.":"Production bulk provider is not configured; Gmail remains QA-only."}`:"Open an automatic scope in Campaign Studio to resolve recipients and advance policy gates."}</p></section></div>`;
  }

  async function campaignControl(container){
    if(!connected())return required(container,"Campaign Control","Governed activation and execution status.");
    const campaigns=A().getCampaigns?.()||[], current=currentScopeState();
    const recipientLabel=current.audienceResolved?`${N(current.contacts)} RESOLVED`:"PER CAMPAIGN";
    const policyLabel=current.policyApproved?"AUTO APPROVED":"GOVERNED";
    const state=providerReady()?"PROVIDER READY":providerStatus();
    container.innerHTML=header("Campaign Control","Campaigns advance automatically when recipient, pressure and policy gates clear.","EXECUTION CONTROL · V6")+kpis([["CAMPAIGNS",campaigns.length],["RECIPIENTS",recipientLabel,false],["POLICY",policyLabel,false],["BULK PROVIDER",state,false]])+`<div class="life-status-strip ${providerReady()?"":"blocked"}"><div><span>Production execution</span><strong>${E(state)}</strong></div><p>${providerReady()?"Execution may proceed only for campaigns whose recipient, frequency, exclusion, approval and archive gates are clear.":"Gmail remains Test Draft / QA only. Production is intentionally blocked until a bulk provider is configured."}</p></div>`;
  }

  async function emailMarketing(container){
    if(!connected())return required(container,"Email Marketing","Governed email QA and delivery readiness.");
    const campaigns=A().getCampaigns?.()||[], activity=A().getActivity?.()||[], current=currentScopeState(), drafts=activity.filter(x=>U(x.actionType||x.action)==="TEST_DRAFT_CREATED").length;
    container.innerHTML=header("Email Marketing","Email QA, recipient readiness and response-safe execution.","CHANNEL · EMAIL")+kpis([["CAMPAIGNS",campaigns.length],["TEST DRAFTS",drafts],["CURRENT ELIGIBLE CONTACTS",current.audienceResolved?current.contacts:0],["PRODUCTION PROVIDER",providerStatus(),false]])+`<div class="life-grid-3"><section class="life-panel"><h3>Gmail QA</h3>${badge("TEST DRAFT ONLY","live")}<p class="life-copy">Logo and hero assets are converted to canonical HTTPS URLs before the QA draft is created.</p></section><section class="life-panel"><h3>Recipient resolution</h3>${badge(current.audienceResolved?"CURRENT SCOPE RESOLVED":"PER-CAMPAIGN","info")}<p class="life-copy">${current.audienceResolved?`${N(current.contacts)} eligible contacts are resolved for the current scope.`:"Recipient eligibility is evaluated privately when a campaign scope is prepared."}</p></section><section class="life-panel"><h3>Response stop</h3>${badge("ACCOUNT ONLY","live")}<p class="life-copy">A reply stops pending automation for that account; remaining eligible accounts continue.</p></section></div>`;
  }

  async function automationPlaybooks(container){
    if(!connected())return required(container,"Automation Playbooks","Automatic policies, data readiness and campaign logic.");
    const d=await loadData(true), current=currentScopeState(), reasonCoverage=(d.groups||[]).filter(x=>clean(x.reasonCategory)).length;
    container.innerHTML=header("Automation Playbooks","Rules select the next action; human intervention is reserved for explicit exceptions.","AUTOMATION POLICY · V6")+`<section class="auto-panel"><div class="auto-panel-head"><div><span>MASTER PRINCIPLE</span><h3>No recurring manual campaign lists</h3></div>${badge("ENFORCED","live")}</div><p class="life-copy">Priority, scope, cadence, recipient resolution, pressure, policy and response stop are governed by data and rules.</p></section><div class="auto-rule-grid"><article><span>QNB</span><strong>Canonical windows + reason routing</strong><p>0–14 → day 0/10 · 15–30 → day 0/12 · 30+ → day 0/14/30. Reason routing overrides the message angle when authoritative Reason is present.</p>${badge(reasonCoverage?"REASON DATA PARTIAL/LIVE":"WINDOW FALLBACK","warn")}</article><article><span>RETENTION</span><strong>Risk before dormancy</strong><p>Retention signals remain higher priority than reactivation and cross-sell.</p>${badge("PRIORITY 2","live")}</article><article><span>REACTIVATION</span><strong>Dormant account recovery</strong><p>Owner and exclusion rules must be clear before the account progresses.</p>${badge("PRIORITY 3","live")}</article><article><span>CROSS-SELL</span><strong>Service-gap opportunity</strong><p>Current model is service-gap led; richer scoring can be layered without manual lists.</p>${badge("PRIORITY 4","live")}</article><article><span>RECIPIENT POLICY</span><strong>Contact + frequency + exclusions</strong><p>${current.audienceResolved?`Current scope: ${N(current.contacts)} eligible contacts; frequency ${E(current.frequencyStatus||"evaluated")}; exclusions ${E(current.exclusionStatus||"evaluated")}.`:"Evaluated automatically when a campaign reaches recipient resolution."}</p>${badge(current.audienceResolved?"CURRENT SCOPE EVALUATED":"PER CAMPAIGN","info")}</article><article><span>APPROVAL</span><strong>Policy-based</strong><p>Normal campaigns auto-approve only after technical gates are clear. Strategic/restricted/material exceptions require human review.</p>${badge(current.policyApproved?"CURRENT SCOPE APPROVED":"POLICY DEFINED","live")}</article></div>`;
  }

  async function priorityQueue(container){
    if(!connected())return required(container,"Account Priority Queue","Priority view derived from the Opportunity Engine.");
    const d=await loadData(), all=d.groups||[], rows=filterOwner(all).sort((a,b)=>(Number(a.priority)||99)-(Number(b.priority)||99)||Number(b.eligibleAccounts||0)-Number(a.eligibleAccounts||0)).slice(0,60);
    global.__DGL_CANONICAL_GROUPS=Object.fromEntries(all.map(x=>[scopeId(x),x]));
    container.innerHTML=header("Account Priority Queue","Priority is computed from opportunity family and suppression rules, never from a hand-built list.","ACCOUNTS · AUTOMATIC PRIORITY")+ownerToolbar(all)+kpis([["QNB · P1",rows.filter(x=>(Number(x.priority)||FAMILY_ORDER[family(x.opportunityType)])===1).reduce((s,x)=>s+Number(x.eligibleAccounts||0),0)],["RETENTION · P2",rows.filter(x=>(Number(x.priority)||FAMILY_ORDER[family(x.opportunityType)])===2).reduce((s,x)=>s+Number(x.eligibleAccounts||0),0)],["REACTIVATION · P3",rows.filter(x=>(Number(x.priority)||FAMILY_ORDER[family(x.opportunityType)])===3).reduce((s,x)=>s+Number(x.eligibleAccounts||0),0)],["VISIBLE SCOPES",rows.length]])+`<div class="life-scope-stack">${rows.map(scopeCard).join("")}</div>`;
  }

  async function pipelineView(container){
    if(!connected())return required(container,"Account Campaign Pipeline","Private lifecycle state from opportunity to retained revenue.");
    const d=await loadData(true), owner=selectedOwner(), rows=owner==="ALL"?d.pipeline:d.pipeline.filter(x=>clean(x.amOwner||"Unassigned")===owner), summary=aggregatePipeline(rows), by=summary.byCurrentStage;
    container.innerHTML=header("Account Campaign Pipeline","One account state machine from detected opportunity to response, RFQ, quote, load and retained revenue.","ACCOUNT LIFECYCLE · V6")+ownerToolbar(d.groups)+kpis([["TOTAL PIPELINE ACCOUNTS",summary.total],["OPPORTUNITY DETECTED",by["OPPORTUNITY DETECTED"]],["CAMPAIGN ACTIVE",by["CAMPAIGN ACTIVE"]],["RESPONDED",by["RESPONDED"]]])+`<div class="v6-pipeline-board">${PIPELINE_STAGES.map((stage,i)=>`<article class="v6-pipeline-stage"><div><div class="v6-stage-index">STAGE ${String(i+1).padStart(2,"0")}</div><h3>${E(stage)}</h3></div><div class="v6-stage-count">${N(by[stage])}</div></article>`).join("")}</div>`;
  }

  async function analytics(container,title="Marketing Analytics",attribution=false){
    if(!connected())return required(container,title,"Real lifecycle funnel analytics.");
    const d=await loadData(true), owner=selectedOwner(), groups=filterOwner(d.groups||[]), rows=owner==="ALL"?d.pipeline:d.pipeline.filter(x=>clean(x.amOwner||"Unassigned")===owner), by=aggregatePipeline(rows).byCurrentStage, det=groups.reduce((s,x)=>s+Number(x.detectedAccounts||0),0), pre=groups.reduce((s,x)=>s+Number(x.eligibleAccounts||0),0);
    const stages=[["DETECTED",det],["PRE-GATE ELIGIBLE",pre],["ACTIVE",by["CAMPAIGN ACTIVE"]],["RESPONDED",by.RESPONDED],["RFQ",by["RFQ RECEIVED"]],["QUOTED",by.QUOTED],["LOAD",by["LOAD / REACTIVATED"]],["RETAINED",by["RETAINED / EXPANDED"]]];
    container.innerHTML=header(title,attribution?"Response → RFQ → Quote → Load → retained revenue. Real outcomes only.":"One governed funnel from source signal to retained / expanded revenue.",attribution?"ANALYTICS · ATTRIBUTION":"ANALYTICS · LIVE")+ownerToolbar(d.groups)+`<div class="life-analytics-funnel">${stages.map(([l,v])=>`<div><span>${E(l)}</span><strong>${N(v)}</strong></div>`).join("")}</div>`;
  }

  function staticCards(container,title,sub,eye,cards){container.innerHTML=header(title,sub,eye)+`<div class="life-grid-3">${cards.map(x=>`<section class="life-panel"><div class="life-panel-head"><div><span>${E(x[0])}</span><h3>${E(x[1])}</h3></div>${badge(x[2],x[3])}</div><p class="life-copy">${E(x[4])}</p></section>`).join("")}</div>`;}

  function account360(container){
    const current=currentScopeState();
    staticCards(container,"Account 360","Private account/contact identity remains in the authenticated backend; public GitHub never stores customer PII.","ACCOUNTS · PRIVATE",[["ACCOUNT MASTER","Authoritative identity",current.audienceResolved?"IN USE":"PRIVATE BACKEND","live","Salesforce-derived account identity is consumed privately by recipient resolution and lifecycle logic."],["CONTACT MASTER","Authorized recipients",current.audienceResolved?`${N(current.contacts)} CURRENT-SCOPE ELIGIBLE`:"RESOLVED PER CAMPAIGN",current.audienceResolved?"live":"info","Contact email, DNC and validity state stay private; only safe counts reach this UI."],["PRIVACY","Public Pages","ENFORCED","live","No account names, contact names, email addresses, pricing, credit or restricted commercial data are published to GitHub Pages."]]);
  }

  function channels(container){staticCards(container,"Paid / Retargeting / LinkedIn","Secondary channels remain downstream of the same account governance.","CHANNELS · SECONDARY",[["EMAIL","Lifecycle channel","PRIMARY","live","Email is primary because recipient resolution, pressure, stop-on-response and attribution rules are defined."],["PAID","Retargeting","NOT ACTIVATED","warn","Activate only after consent, exclusion, frequency and attribution policies inherit the same account state."],["LINKEDIN","LinkedIn","NOT ACTIVATED","warn","Activate only after the same governed identity and pressure controls are available."]]);}

  function contentLibrary(container){
    const lib=global.DGL_CREATIVE_LIBRARY_V5, systems=Object.values(lib?.CREATIVE_SYSTEMS||{}), services=Object.values(lib?.SERVICES||{});
    container.innerHTML=header("Content & Landing Assets","Canonical creative systems, service photography and anti-repetition controls.","CREATIVE · GOVERNED LIBRARY")+kpis([["CREATIVE SYSTEMS",systems.length],["SERVICE ASSETS",services.filter(x=>x.asset).length],["COPY MEMORY","90 DAYS / ACCOUNT",false],["ASSET COOLDOWN","90D ACCOUNT · 60D GLOBAL",false]])+`<div class="life-grid-3">${systems.map(s=>`<section class="life-panel"><div class="life-panel-head"><div><span>${E(s.use||"CREATIVE SYSTEM")}</span><h3>${E(s.name)}</h3></div>${badge("AVAILABLE","live")}</div><p class="life-copy">${E(s.desc||"")}</p></section>`).join("")}</div>`;
  }

  async function reports(container){
    if(!connected())return required(container,"Account & Campaign Reports","Execution, audit and archive status.");
    const d=await loadData(true), campaigns=A().getCampaigns?.()||[], current=currentScopeState();
    container.innerHTML=header("Account & Campaign Reports","Auditable aggregates from opportunity, campaign, lifecycle and execution ledgers.","REPORTING · LIVE")+kpis([["OPPORTUNITY GROUPS",(d.groups||[]).length],["CAMPAIGNS",campaigns.length],["PIPELINE ACCOUNTS",d.pipeline.length],["CURRENT RECIPIENT STATUS",current.audienceResolved?`${N(current.contacts)} RESOLVED`:"PER CAMPAIGN",false]])+`<div class="life-status-strip"><div><span>Archive policy</span><strong>EXECUTION ARCHIVE REQUIRED</strong></div><p>Production execution must archive the recipient snapshot, final HTML, copy and creative evidence. Test drafts do not count as production execution.</p></div>`;
  }

  function governance(container){staticCards(container,"Governance & Approvals","Automation policy is explicit; humans handle exceptions, not recurring campaign lists.","ADMIN · AUTOMATION POLICY",[["OPERATING MODEL","No manual campaign lists","ENFORCED","live","Report signals generate automatic scopes; recurring manual account selection is not part of the operating model."],["PRESSURE","2 touches / 30d","ENFORCED","live","Maximum Marketing pressure is two touches per rolling 30 days at account/contact level."],["FOLLOW-UP","10–14 days","ENFORCED","live","Legacy 3–8 day recurring follow-ups are removed from the canonical runtime."],["APPROVAL","Policy-based","ENFORCED","live","Normal campaigns auto-approve after technical gates; explicit exceptions require human review."],["RESPONSE","Stop account only","ENFORCED","live","A customer response stops that account only; other eligible accounts continue."],["PRODUCTION","Bulk provider","BLOCKED BY DESIGN","blocked","Gmail remains QA-only until the governed production provider is configured."]]);}

  function agentControl(container){
    staticCards(container,"Agent Control","Future automation architecture is intentionally isolated from current production execution.","FUTURE ARCHITECTURE",[["AGENT RUNTIME","Not connected","FUTURE","warn","No Claude/API agent is called by the active campaign workflow."],["CURRENT AUTOMATION","Deterministic rules","LIVE","live","The active system uses report signals, playbooks, recipient gates and policy rules—not a demo agent queue."],["ACTIVATION RULE","Explicit future release","NOT ACTIVE","warn","Agent execution must not be enabled until permissions, auditability, provider boundaries and rollback controls are approved."]]);
  }

  function studioPolish(){
    if(!location.hash.includes("campaign-studio"))return;
    const setText=(node,text)=>{if(node&&node.textContent!==text)node.textContent=text;};
    const setHtml=(node,html)=>{if(node&&node.innerHTML!==html)node.innerHTML=html;};
    const current=currentScopeState(), objective=clean(document.getElementById("v5Objective")?.value||current.objective), service=clean(document.getElementById("v5Service")?.value||current.service||"Service");
    let iconsDirty=false;
    document.querySelectorAll(".v6-status-card").forEach(card=>{
      const l=card.querySelector(".label"),v=card.querySelector(".value"),key=U(l?.textContent);
      if(key==="ELIGIBLE ACCOUNTS"||key==="PRE-GATE ELIGIBLE ACCOUNTS")setText(l,"PRE-GATE ELIGIBLE ACCOUNTS");
      if(key==="FREQUENCY GUARD"&&v)setText(v,current.audienceResolved?(current.frequencyStatus||"EVALUATED") : "NOT EVALUATED · RECIPIENTS PENDING");
      if(key==="EXCLUSIONS"&&v)setText(v,current.audienceResolved?(current.exclusionStatus||"EVALUATED") : "NOT EVALUATED · RECIPIENTS PENDING");
      if(key==="POLICY DECISION"&&v)setText(v,current.requiresHumanReview?"HUMAN EXCEPTION REVIEW":current.policyApproved?"AUTO BY POLICY · APPROVED":current.audienceResolved?"POLICY / TECHNICAL GATES PENDING":"POLICY PENDING RECIPIENTS");
      if(key==="ELIGIBLE CONTACTS"&&v&&current.audienceResolved)setText(v,N(current.contacts));
    });
    document.querySelectorAll(".v5-briefcell").forEach(cell=>{
      const l=cell.querySelector("span"),v=cell.querySelector("strong"),key=U(l?.textContent);
      if(key==="RECIPIENT STATUS"||key==="CAMPAIGN AUDIENCE"){
        setText(l,"RECIPIENT STATUS");
        setText(v,current.audienceResolved?`${N(current.contacts)} eligible contacts · recipients resolved`:`${N(current.eligibleAccounts||0)} pre-gate eligible accounts · contacts pending`);
      }
    });
    if(objective==="Quoted Not Booked"){
      const title=document.getElementById("v5HeroAssetTitle"),note=document.getElementById("v5HeroAssetNote"),cta=document.getElementById("v5CtaIntent");
      setText(title,`${service} recovery photography`);
      setText(note,"Approved service imagery for quote recovery.");
      if(cta&&cta.value!=="Recover Quote"&&[...cta.options].some(o=>o.value==="Recover Quote"||o.textContent==="Recover Quote"))cta.value="Recover Quote";
    }
    const qa=document.getElementById("qaApproval"),approve=document.querySelector("[data-v5-approve]");
    if(qa){
      const ok=current.policyApproved&&!current.requiresHumanReview;
      const html=`<i data-lucide="${ok?"check-circle-2":"circle"}"></i>${current.requiresHumanReview?"Human exception review required":ok?"Approved by V6 Policy":"Policy approval pending"}`;
      if(qa.innerHTML!==html){setHtml(qa,html);iconsDirty=true;}
    }
    if(approve){
      const display=current.requiresHumanReview?"":"none";
      if(approve.style.display!==display)approve.style.display=display;
      if(current.requiresHumanReview){const html='<i data-lucide="shield-alert"></i>Review Exception';if(approve.innerHTML!==html){setHtml(approve,html);iconsDirty=true;}}
    }
    if(iconsDirty)global.lucide?.createIcons();
  }

  function wrapStudioRenderer(){
    const base=R["campaign-studio"]; if(!base||base.__canonical666)return;
    const wrapped=container=>{
      const current=normalizeCampaignContext(readContext()); if(Object.keys(current).length)writeContext(current);
      const result=base(container);
      Promise.resolve(result).finally(()=>{setTimeout(studioPolish,0);setTimeout(studioPolish,250);});
      return result;
    };
    wrapped.__canonical666=true;R["campaign-studio"]=wrapped;
  }

  function installRenderers(){
    R["command-center"]=commandCenter;
    R["campaign-opportunities"]=c=>scopeView(c,{title:"Campaign Opportunities",sub:"All report-derived opportunities grouped into automatic governed scopes.",eye:"OPPORTUNITY ENGINE · LIVE"});
    R["campaign-execution"]=campaignControl;
    R["reactivation"]=c=>scopeView(c,{title:"Reactivation Campaigns",sub:"Dormant-account opportunities detected automatically under owner, suppression and pressure rules.",families:["REACTIVATION"],eye:"CAMPAIGN ENGINE · REACTIVATION"});
    R["quoted-not-booked"]=c=>scopeView(c,{title:"Quoted Not Booked",sub:"Priority-1 recovery with canonical QNB windows and reason-aware messaging when Reason exists.",families:["QNB"],eye:"PRIORITY 1 · QNB"});
    R["growth"]=c=>scopeView(c,{title:"Cross-Sell Campaigns",sub:"Report-derived service-gap opportunities governed by priority and frequency rules.",families:["CROSS-SELL"],eye:"CAMPAIGN ENGINE · CROSS-SELL"});
    R["retention"]=c=>scopeView(c,{title:"Retention / Nurture",sub:"Risk and relationship signals governed by priority, pressure and cooldown rules.",families:["RETENTION","NURTURE"],eye:"CAMPAIGN ENGINE · RETENTION"});
    R["service-marketing"]=c=>scopeView(c,{title:"Service Campaign Overview",sub:"Automatic scopes across FTL, LTL, Drayage and multiservice opportunities.",eye:"SERVICE CAMPAIGNS · LIVE"});
    R["ftl-marketing"]=c=>scopeView(c,{title:"FTL Campaigns",sub:"Automatic FTL scopes from the Opportunity Engine.",service:"FTL",eye:"SERVICE · FTL"});
    R["ltl-marketing"]=c=>scopeView(c,{title:"LTL Campaigns",sub:"Automatic LTL scopes from the Opportunity Engine.",service:"LTL",eye:"SERVICE · LTL"});
    R["drayage-marketing"]=c=>scopeView(c,{title:"Drayage Campaigns",sub:"Automatic Drayage scopes from the Opportunity Engine.",service:"Drayage",eye:"SERVICE · DRAYAGE"});
    R["email-marketing"]=emailMarketing;
    R["channel-orchestration"]=channels;
    R["content-library"]=contentLibrary;
    R["automation-playbooks"]=automationPlaybooks;
    R["account-campaign-pipeline"]=pipelineView;
    R["priority-queue"]=priorityQueue;
    R["account-360"]=account360;
    R["campaign-attribution"]=c=>analytics(c,"Campaign Revenue Attribution",true);
    R["analytics"]=c=>analytics(c);
    R["account-campaign-reports"]=reports;
    R["governance"]=governance;
    R["agent-control"]=agentControl;
    wrapStudioRenderer();
  }

  function safeSearch(query){
    const q=clean(query).toLowerCase(); if(!q)return[];
    const rows=[];
    ALL_MODULES.forEach(m=>{if(`${m.label} ${m.group}`.toLowerCase().includes(q))rows.push({label:m.label,sub:`Module · ${m.group}`,mod:m.id});});
    if(connected())(A().getCampaigns?.()||[]).forEach(c=>{const name=clean(c.campaignName||c.name);if(name.toLowerCase().includes(q))rows.push({label:name,sub:`Campaign · ${clean(c.status||c.marketingStatus||"Governed")}`,mod:"campaign-execution"});});
    return rows.slice(0,8);
  }

  function installLegacyGuards(){
    document.addEventListener("input",e=>{
      if(e.target?.id!=="globalSearchInput")return;
      e.stopImmediatePropagation();
      const input=e.target,q=input.value,host=input.closest(".global-search");if(!host)return;
      let dd=document.getElementById("globalSearchDropdown");if(!dd){dd=document.createElement("div");dd.id="globalSearchDropdown";dd.className="card";dd.style.cssText="position:absolute;top:56px;left:0;right:0;max-width:460px;margin:0 auto;z-index:250;max-height:340px;overflow-y:auto;padding:8px;display:none";host.style.position="relative";host.appendChild(dd);}
      if(!clean(q)){dd.style.display="none";return;}
      const results=safeSearch(q);dd.innerHTML=results.length?results.map(r=>`<div class="nav-item" style="margin:2px;cursor:pointer;white-space:normal;height:auto;align-items:flex-start" data-canonical-goto="${E(r.mod)}"><i data-lucide="corner-down-right"></i><span>${E(r.label)}<br><span style="font-size:10.5px;color:var(--muted)">${E(r.sub)}</span></span></div>`).join(""):`<div style="padding:14px;text-align:center;color:var(--muted);font-size:12px">No results</div>`;dd.style.display="block";global.lucide?.createIcons();
    },true);

    document.addEventListener("click",e=>{
      const plus=e.target.closest("#btnCreateCampaign");if(plus){e.preventDefault();e.stopImmediatePropagation();location.hash="#/campaign-studio";return;}
      const goto=e.target.closest("[data-canonical-goto]");if(goto){e.preventDefault();e.stopImmediatePropagation();location.hash="#/"+goto.dataset.canonicalGoto;const dd=document.getElementById("globalSearchDropdown");if(dd)dd.style.display="none";const input=document.getElementById("globalSearchInput");if(input)input.value="";return;}
      const legacy=e.target.closest("[data-action]");if(legacy){e.preventDefault();e.stopImmediatePropagation();global.DGL_INTERACTIONS?.toast?.("Legacy/demo action disabled in the canonical V6 runtime.","error");}
    },true);
  }

  function getModuleById(id){return ALL_MODULES.find(m=>m.id===id)||ALL_MODULES.find(m=>m.id===DEFAULT_MODULE);}
  function currentRouteId(){const hash=location.hash.replace("#/","").trim();return ALL_MODULES.some(m=>m.id===hash)?hash:DEFAULT_MODULE;}

  function renderShellOnce(){
    const root=document.getElementById("app");
    root.innerHTML=`<div class="app-shell" id="appShell">${global.DGL_UI.renderSidebar(MODULE_GROUPS,DEFAULT_MODULE)}<div class="shell-main"><div id="headerMount"></div><main class="main-content" id="mainContent"></main></div></div><div class="quick-actions-fab" id="quickFab" style="position:fixed;bottom:20px;right:20px;z-index:150"><a href="#/campaign-opportunities" class="btn btn-primary" title="Campaign Opportunities" style="border-radius:999px;width:54px;height:54px;padding:0;box-shadow:0 10px 26px rgba(119,184,42,.4);display:flex;align-items:center;justify-content:center"><i data-lucide="radar"></i></a></div><nav class="bottom-nav" id="bottomNav" style="position:fixed;bottom:0;left:0;right:0;background:#0a0c1e;border-top:1px solid var(--border);padding:8px 6px;justify-content:space-around;z-index:140"><a href="#/command-center" class="nav-item" style="flex-direction:column;gap:2px;font-size:9.5px;padding:6px"><i data-lucide="layout-dashboard"></i>Home</a><a href="#/campaign-opportunities" class="nav-item" style="flex-direction:column;gap:2px;font-size:9.5px;padding:6px"><i data-lucide="radar"></i>Opportunities</a><a href="#/campaign-studio" class="nav-item" style="flex-direction:column;gap:2px;font-size:9.5px;padding:6px"><i data-lucide="palette"></i>Studio</a><a href="#/service-marketing" class="nav-item" style="flex-direction:column;gap:2px;font-size:9.5px;padding:6px"><i data-lucide="layers-3"></i>Services</a><a href="#/campaign-attribution" class="nav-item" style="flex-direction:column;gap:2px;font-size:9.5px;padding:6px"><i data-lucide="circle-dollar-sign"></i>Revenue</a></nav>`;
  }

  function renderRoute(){
    const id=currentRouteId(),mod=getModuleById(id),main=document.getElementById("mainContent"),headerMount=document.getElementById("headerMount");
    headerMount.innerHTML=global.DGL_UI.renderHeader(mod);
    const search=document.getElementById("globalSearchInput");if(search)search.placeholder="Buscar módulos, campañas, servicios...";
    main.innerHTML=global.DGL_UI.skeletonKpis(4);global.lucide?.createIcons();
    requestAnimationFrame(()=>setTimeout(async()=>{try{const renderer=R[id];if(!renderer)throw new Error(`Renderer missing for ${id}`);await renderer(main);}catch(err){console.error("DGL canonical module render failed",id,err);main.innerHTML=global.DGL_UI.emptyState({icon:"alert-triangle",title:"Module unavailable",text:`${mod.label}: ${err?.message||err}`});}global.DGL_UI.setActiveNav(id);global.lucide?.createIcons();setTimeout(studioPolish,0);},60));
  }

  function audit(){
    const issues=[],warnings=[];
    ALL_MODULES.forEach(m=>{if(typeof R[m.id]!=="function")issues.push(`Missing renderer: ${m.id}`);});
    if(global.DGL_AM_REQUESTS)issues.push("Forbidden AM Request runtime loaded");
    if(global.DGL_CAMPAIGN_OPPORTUNITY_CENTER_V5)issues.push("Legacy opportunity center loaded");
    if(global.DGL_DATA)warnings.push("Legacy DGL_DATA global is present; canonical runtime does not consume it");
    const lib=global.DGL_CREATIVE_LIBRARY_V5;
    if(lib?.OBJECTIVES?.["Quoted Not Booked"]?.recommendedSystem!=="editorial-white")issues.push("QNB creative system is not canonical");
    const qnbAsset=lib?.resolveAsset?.({objective:"Quoted Not Booked",service:"LTL"});if(!qnbAsset)issues.push("QNB service hero missing");
    const p=global.DGL_MARKETING_PLAYBOOKS?.resolveStrategy?.({objective:"Quoted Not Booked",service:"LTL",qnbWindow:"15-30"});if(p?.strategy?.ctaIntent!=="Recover Quote")issues.push("QNB CTA contract mismatch");
    const seq=global.DGL_CAMPAIGN_SEQUENCES_V4?.getSequence?.("Quoted Not Booked","LTL","Spanish","15-30")||[];if(seq.some((x,i)=>i>0&&Number(x.day)<10))issues.push("Legacy short follow-up detected");
    const integrity=global.DGL_SYSTEM_INTEGRITY_V6?.inspect?.();if(integrity&&!integrity.ok)warnings.push(...(integrity.issues||[]));
    return {ok:issues.length===0,version:VERSION,architecture:"AUTOMATION_FIRST_V6_6",rendererCount:ALL_MODULES.filter(m=>typeof R[m.id]==="function").length,moduleCount:ALL_MODULES.length,issues,warnings,backend:connected()?"PRIVATE_BACKEND":"PRIVATE_BACKEND_REQUIRED",provider:providerStatus(),checkedAt:new Date().toISOString()};
  }

  function init(){
    try{
      if(global.__DGL_V66_OBSERVER?.disconnect){global.__DGL_V66_OBSERVER.disconnect();global.__DGL_V66_OBSERVER=null;}
      patchContracts();installRenderers();installLegacyGuards();renderShellOnce();
      global.DGL_INTERACTIONS.initShellInteractions();
      addEventListener("hashchange",renderRoute);
      addEventListener("dgl:v55-backend-change",()=>{invalidate();setTimeout(()=>{if(document.getElementById("mainContent"))renderRoute();},0);});
      addEventListener("dgl:v6-campaign-context-change",()=>setTimeout(studioPolish,0));
      document.addEventListener("change",e=>{const s=e.target.closest("[data-canonical-owner]");if(s){setOwner(s.value);invalidate();renderRoute();}});
      document.addEventListener("click",async e=>{
        if(e.target.closest("[data-canonical-refresh]")){invalidate();renderRoute();return;}
        if(e.target.closest("[data-canonical-connect]")){try{await A().connect();invalidate();renderRoute();}catch(err){global.DGL_INTERACTIONS?.toast?.(err.message,"error");}return;}
        const b=e.target.closest("[data-canonical-prepare]");if(b){const row=(global.__DGL_CANONICAL_GROUPS||{})[b.dataset.canonicalPrepare];if(row){writeContext(contextFor(row));dispatchEvent(new CustomEvent("dgl:v6-campaign-context-change"));location.hash="#/campaign-studio";}return;}
      });
      let polishQueued=false;
      const observer=new MutationObserver(()=>{
        if(!location.hash.includes("campaign-studio")||polishQueued)return;
        polishQueued=true;
        setTimeout(()=>{polishQueued=false;studioPolish();},30);
      });
      observer.observe(document.getElementById("app"),{childList:true,subtree:true});
      if(!location.hash)location.hash="#/"+DEFAULT_MODULE;renderRoute();global.lucide?.createIcons();global.__dglMarkReady?.();
      const report=audit();report.ok?console.info("DGL Marketing OS canonical runtime",report):console.error("DGL canonical runtime audit failed",report);
    }catch(err){console.error("DGL Marketing OS failed to initialize",err);global.__dglBootFail?.("Error al iniciar la aplicación: "+(err?.message||err));}
  }

  document.addEventListener("DOMContentLoaded",init);
  global.DGL_APP={VERSION,MODULE_GROUPS,ALL_MODULES,normalizeWindow,family,scopeId,contextFor,audit,absoluteAsset,absolutizeHtml,renderRoute,recoveryStatus:()=>({...RECOVERY_SUMMARY,snapshotAt:RECOVERY_SNAPSHOT_AT,runtime:dataCache.runtime,errors:[...(dataCache.errors||[])]})};
})(window);
