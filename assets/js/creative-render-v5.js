
(function(global){
  "use strict";
  // The canonical DGL premium email visual systems (editorial / split / route / service / case /
  // minimal), moved verbatim out of campaign-studio-v5.js so the governed Campaign Studio V6 and
  // the V5 studio render with ONE renderer. Pure: strategy + copy in, HTML out, no DOM access.
  // campaign-studio-v5.js passes its sample-token substitution and gets byte-identical output to
  // its previous inline renderer; V6 passes the identity (tokens stay for per-recipient merge).
  const clean=v=>String(v==null?"":v).replace(/\bundefined\b/gi,"").replace(/\s{2,}/g," ").replace(/\s+([,.;:!?])/g,"$1").trim();
  const esc=v=>clean(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
  const Lib=()=>global.DGL_CREATIVE_LIBRARY_V5;
  const BASE_URL="https://dglmarketing2026.github.io/dgl-marketing-execution-os/";
  function absUrl(u){
    const s=String(u||"").trim();
    if(!s)return s;
    if(/^(https?:|data:|mailto:)/i.test(s))return s;
    return BASE_URL+s.replace(/^\/+/,"");
  }
  const OFFICIAL_LOGO=absUrl("assets/brand/dgl-logo-white.png");
  const DGL_CANONICAL_REPLY_TO="info@dglus.com";

  function brandHeader(s){
    return `<div style="min-height:72px;display:flex;align-items:center;padding:0 34px;background:#05035C;border-bottom:4px solid #77B82A"><img src="${esc(absUrl(s.logoUrl||OFFICIAL_LOGO))}" alt="DGL — Dedicated Ground Logistics" style="display:block;width:184px;max-width:46%;height:52px;object-fit:contain;object-position:left center;border:0"></div>`;
  }

  function assetPath(s){
    return absUrl(s.heroUrl||Lib().resolveAsset({objective:s.objective,service:s.service,angle:s.angle}));
  }

  function heroAsset(s,height=250){
    const svc=Lib().SERVICES[s.service]||Lib().SERVICES.Multiservicio;
    return `<div style="height:${height}px;background:#E8EDF0;position:relative;overflow:hidden">
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Arial,sans-serif;text-align:center;color:#667085;font-size:11px">${esc(svc.visual||"Approved logistics asset")}</div>
      <img src="${esc(assetPath(s))}" alt="${esc(svc.visual||svc.name)}" onerror="this.style.display='none'" style="position:relative;display:block;width:100%;height:${height}px;object-fit:cover;border:0">
    </div>`;
  }

  // Automatic visual-system selection from the existing design library (creative-library-v5.js
  // selectSystem): objective + campaignType + service + angle -> system, with the reason. Accepts
  // a campaign context object, or a bare objective (then only objective-level rules apply).
  function selection(context){
    return Lib().selectSystem(typeof context==="object"&&context?context:{objective:context});
  }
  function systemFor(context){return selection(context).systemId;}

  // s: {creativeSystem,objective,service,angle,lane,heroUrl,logoUrl,serviceDisplay?}
  // c: {subjectA,preheader,headline,body,body2,cta}
  // opts: {sample?:(text,s)=>text, ctaSubject?:string}
  function render(s,c,opts={}){
    const sample=opts.sample||(t=>String(t||""));
    const sys=Lib().CREATIVE_SYSTEMS[s.creativeSystem]||Lib().CREATIVE_SYSTEMS["editorial-white"];
    const service=Lib().SERVICES[s.service]||Lib().SERVICES.Multiservicio;
    const h=sample(c.headline,s),b=sample(c.body,s),b2=sample(c.body2,s),cta=sample(c.cta,s),pre=sample(c.preheader,s);
    const subjectSample=opts.ctaSubject!=null?opts.ctaSubject:(sample(c.subjectA,s)||h);
    const proof=service.proof.map(x=>`<td style="padding:0 16px 0 0;font-family:Arial,sans-serif"><div style="width:18px;height:2px;background:#77B82A;margin-bottom:7px"></div><div style="font-size:9px;font-weight:800;line-height:1.35;color:#526071">${esc(x)}</div></td>`).join("");
    // PR #3 audit punto 2 -- functional CTA (mailto:), never href="#".
    const ctaHref=`mailto:${DGL_CANONICAL_REPLY_TO}?subject=${encodeURIComponent(subjectSample)}`;
    const button=`<table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#77B82A" style="border-radius:7px"><a href="${ctaHref}" style="display:inline-block;padding:14px 21px;font-family:Arial,sans-serif;font-size:12px;font-weight:900;color:#071005;text-decoration:none">${esc(cta)} →</a></td></tr></table>`;

    if(sys.layout==="minimal"){
      return `<!doctype html><html><body style="margin:0;background:#F4F5F7">
      <div style="display:none;max-height:0;overflow:hidden">${esc(pre)}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:34px 12px">
      <table role="presentation" width="620" style="width:100%;max-width:620px;background:#fff;border:1px solid #E5E7EB;border-radius:14px">
        <tr><td style="padding:0">${brandHeader(s)}</td></tr>
        <tr><td style="padding:18px 34px 38px;font-family:Arial,sans-serif">
          <div style="font-size:9px;color:#77B82A;font-weight:900;letter-spacing:1.4px">DIRECT COMMERCIAL NOTE</div>
          <div style="font-size:32px;line-height:1.08;font-weight:900;color:#05035C;margin-top:13px">${esc(h)}</div>
          <p style="font-size:15px;line-height:1.7;color:#4F5868;margin:23px 0 0">${esc(b)}</p>
          <p style="font-size:15px;line-height:1.7;color:#4F5868;margin:8px 0 24px">${esc(b2)}</p>${button}
        </td></tr>
        <tr><td style="border-top:1px solid #E7E9ED;padding:18px 34px;font-family:Arial,sans-serif;font-size:10px;color:#98A2B3">DGL Freight Broker · Your inland freight partner.</td></tr>
      </table></td></tr></table></body></html>`;
    }

    if(sys.layout==="split"){
      return `<!doctype html><html><body style="margin:0;background:#EFF1F4">
      <div style="display:none;max-height:0;overflow:hidden">${esc(pre)}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:30px 12px">
      <table role="presentation" width="680" style="width:100%;max-width:680px;background:#fff;border-radius:16px;overflow:hidden">
        <tr><td colspan="2" style="padding:0">${brandHeader(s)}</td></tr>
        <tr>
          <td width="52%" style="background:#05035C;padding:34px 30px;font-family:Arial,sans-serif;vertical-align:top">
            <div style="font-size:9px;color:#9BD54F;font-weight:900;letter-spacing:1.5px">${esc(service.label)}</div>
            <div style="font-size:31px;line-height:1.05;color:#fff;font-weight:900;margin-top:13px">${esc(h)}</div>
            <p style="font-size:14px;line-height:1.65;color:#D2D7E3;margin:21px 0 8px">${esc(b)}</p>
            <p style="font-size:14px;line-height:1.65;color:#D2D7E3;margin:0 0 24px">${esc(b2)}</p>${button}
          </td>
          <td width="48%" style="vertical-align:top">${heroAsset(s,360)}</td>
        </tr>
        <tr><td colspan="2" style="padding:18px 30px;border-top:1px solid #E8EAEE"><table role="presentation"><tr>${proof}</tr></table></td></tr>
      </table></td></tr></table></body></html>`;
    }

    if(sys.layout==="route"){
      return `<!doctype html><html><body style="margin:0;background:#F1F3F6">
      <div style="display:none;max-height:0;overflow:hidden">${esc(pre)}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:30px 12px">
      <table role="presentation" width="680" style="width:100%;max-width:680px;background:#fff;border-radius:16px;overflow:hidden">
        <tr><td style="padding:0">${brandHeader(s)}</td></tr>
        <tr><td style="position:relative;background:#07112E;padding:0;font-family:Arial,sans-serif">${heroAsset(s,235)}<div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(7,17,46,.94),rgba(7,17,46,.38));padding:34px 36px;box-sizing:border-box">
          <div style="font-size:9px;color:#95D54A;font-weight:900;letter-spacing:1.6px">ROUTE INTELLIGENCE</div>
          <div style="font-size:30px;line-height:1.08;color:#fff;font-weight:900;margin-top:12px">${esc(h)}</div>
          <div style="margin:26px 0 4px;border-top:3px dashed #77B82A;position:relative"></div>
          <div style="display:flex;justify-content:space-between;color:#fff;font-size:11px;font-weight:800;margin-top:8px"><span>${esc(s.lane||"ORIGIN")}</span><span>DGL CAPACITY</span></div>
        </div></td></tr>
        <tr><td style="padding:30px 36px;font-family:Arial,sans-serif">
          <p style="font-size:15px;line-height:1.7;color:#4F5868;margin:0">${esc(b)}</p>
          <p style="font-size:15px;line-height:1.7;color:#4F5868;margin:8px 0 23px">${esc(b2)}</p>${button}
        </td></tr>
      </table></td></tr></table></body></html>`;
    }

    if(sys.layout==="service"){
      return `<!doctype html><html><body style="margin:0;background:#EEF1F4">
      <div style="display:none;max-height:0;overflow:hidden">${esc(pre)}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:30px 12px">
      <table role="presentation" width="680" style="width:100%;max-width:680px;background:#fff;border-radius:16px;overflow:hidden">
        <tr><td style="padding:0">${brandHeader(s)}</td></tr>
        <tr><td>${heroAsset(s,230)}</td></tr>
        <tr><td style="padding:30px 34px;font-family:Arial,sans-serif">
          <div style="font-size:30px;line-height:1.06;font-weight:900;color:#05035C">${esc(h)}</div>
          <p style="font-size:14px;line-height:1.65;color:#566071;margin:20px 0 8px">${esc(b)}</p>
          <p style="font-size:14px;line-height:1.65;color:#566071;margin:0 0 22px">${esc(b2)}</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:22px"><tr>
          ${service.proof.map(x=>`<td width="33%" style="border-top:3px solid #77B82A;padding:11px 10px 0 0;font-size:10px;font-family:Arial,sans-serif;font-weight:900;color:#05035C">${esc(x)}</td>`).join("")}
          </tr></table>${button}
        </td></tr>
      </table></td></tr></table></body></html>`;
    }

    if(sys.layout==="case"){
      return `<!doctype html><html><body style="margin:0;background:#050916">
      <div style="display:none;max-height:0;overflow:hidden">${esc(pre)}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:30px 12px">
      <table role="presentation" width="680" style="width:100%;max-width:680px;background:#07112E;border-radius:16px;overflow:hidden">
        <tr><td style="padding:0">${brandHeader(s)}</td></tr>
        <tr><td style="position:relative;padding:0;font-family:Arial,sans-serif">${heroAsset(s,270)}<div style="position:absolute;inset:0;padding:24px 34px 12px;background:linear-gradient(90deg,rgba(7,17,46,.97),rgba(7,17,46,.42));box-sizing:border-box">
          <div style="display:inline-block;background:#77B82A;color:#071005;padding:8px 13px;border-radius:7px;font-size:10px;font-weight:900">CASE / PROOF</div>
          <div style="font-size:31px;line-height:1.08;color:#fff;font-weight:900;margin-top:18px">${esc(h)}</div>
          <p style="font-size:14px;line-height:1.65;color:#D2D7E3;margin:19px 0 8px">${esc(b)}</p>
          <p style="font-size:14px;line-height:1.65;color:#D2D7E3;margin:0 0 23px">${esc(b2)}</p>
        </div></td></tr>
        <tr><td style="padding:8px 34px 30px"><table role="presentation" width="100%"><tr>
          <td style="border-right:1px solid #29304B;padding:14px;font-family:Arial,sans-serif"><div style="font-size:9px;color:#77B82A;font-weight:900">SOLUTION</div><div style="color:#fff;font-size:12px;margin-top:7px">${esc(s.serviceDisplay!=null?s.serviceDisplay:s.service)}</div></td>
          <td style="border-right:1px solid #29304B;padding:14px;font-family:Arial,sans-serif"><div style="font-size:9px;color:#77B82A;font-weight:900">RESULT</div><div style="color:#fff;font-size:12px;margin-top:7px">Commercial continuity</div></td>
          <td style="padding:14px;font-family:Arial,sans-serif"><div style="font-size:9px;color:#77B82A;font-weight:900">NEXT STEP</div><div style="color:#fff;font-size:12px;margin-top:7px">${esc(cta)}</div></td>
        </tr></table></td></tr>
      </table></td></tr></table></body></html>`;
    }

    /* editorial default */
    return `<!doctype html><html><body style="margin:0;background:#F1F3F6">
    <div style="display:none;max-height:0;overflow:hidden">${esc(pre)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:30px 12px">
    <table role="presentation" width="680" style="width:100%;max-width:680px;background:#fff;border-radius:16px;overflow:hidden">
      <tr><td colspan="2" style="padding:0">${brandHeader(s)}</td></tr>
      <tr>
        <td width="58%" style="padding:34px 26px 36px 34px;font-family:Arial,sans-serif;vertical-align:top">
          <div style="width:36px;height:4px;background:#77B82A;border-radius:99px"></div>
          <div style="font-size:34px;line-height:1.05;font-weight:900;color:#05035C;margin-top:19px">${esc(h)}</div>
          <p style="font-size:14px;line-height:1.68;color:#535D6E;margin:22px 0 8px">${esc(b)}</p>
          <p style="font-size:14px;line-height:1.68;color:#535D6E;margin:0 0 24px">${esc(b2)}</p>${button}
        </td>
        <td width="42%" style="vertical-align:bottom">${heroAsset(s,390)}</td>
      </tr>
      <tr><td colspan="2" style="padding:18px 34px;border-top:1px solid #E7E9ED"><table role="presentation"><tr>${proof}</tr></table></td></tr>
    </table></td></tr></table></body></html>`;
  }

  global.DGL_CREATIVE_RENDER_V5={render,systemFor,selection,brandHeader,assetPath,heroAsset,absUrl,OFFICIAL_LOGO,BASE_URL};
})(window);
