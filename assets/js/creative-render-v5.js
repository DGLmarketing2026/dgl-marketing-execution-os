
(function(global){
  "use strict";
  // The canonical DGL premium email visual systems (editorial / split / route / service / case /
  // minimal), shared by Campaign Studio V5 and the governed Campaign Studio V6: ONE renderer.
  // Pure: strategy + copy in, HTML out, no DOM access. V5 passes its sample-token substitution;
  // V6 passes the identity (tokens stay for the per-recipient governed merge).
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

  // ---- Premium module kit (2026-09-30 upgrade, from the DGL email reference bank) -------------
  // Email-safe: nested presentation tables, inline styles, bgcolor fallbacks, full-width <img>
  // heroes (no absolute positioning / CSS overlays), a single <style> block used only to stack
  // columns on phones. Dark systems: black/navy with white + green; light systems: white with
  // navy + green. Shared hierarchy: navy brand bar with market line, photographic hero, green
  // kicker, two-tone headline with short green rule, body, bordered CTA card with green button,
  // divided service/proof strip, dark footer band.
  const FONT="Arial,Helvetica,sans-serif";
  const C={navy:"#05035C",ink:"#0B1020",black:"#07090F",green:"#77B82A",greenText:"#8BD13A",body:"#475467",muted:"#667085",line:"#E4E7EC",darkLine:"#26303F",paper:"#F3F5F7"};
  const MARKETS="USA · MEXICO · CANADA";
  function systemMarker(id){return `<!--dgl-system:${id}-->`;}
  function doc(id,bg,pre,inner){
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media only screen and (max-width:620px){.dgl-col{display:block!important;width:100%!important;box-sizing:border-box!important}.dgl-hero{width:100%!important;height:auto!important}.dgl-pad{padding-left:22px!important;padding-right:22px!important}.dgl-h1{font-size:28px!important;line-height:1.12!important}.dgl-hide-m{display:none!important}.dgl-divider{border-left:0!important;border-top:1px solid ${C.line}!important}.dgl-btn{white-space:normal!important;padding:14px 16px!important}.dgl-cardpad{padding:18px 16px!important}}</style></head><body style="margin:0;padding:0;background:${bg}">${systemMarker(id)}
      <div style="display:none;max-height:0;overflow:hidden">${esc(pre)}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="${bg}"><tr><td align="center" style="padding:28px 10px">
      <table role="presentation" width="680" cellspacing="0" cellpadding="0" style="width:100%;max-width:680px;border-radius:16px;overflow:hidden">${inner}</table>
      </td></tr></table></body></html>`;
  }
  function brandHeader(s){
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="${C.navy}" style="background:${C.navy};border-bottom:4px solid ${C.green}"><tr>
      <td class="dgl-pad" style="padding:20px 34px"><img src="${esc(absUrl(s.logoUrl||OFFICIAL_LOGO))}" alt="DGL — Dedicated Ground Logistics" width="168" style="display:block;width:168px;max-width:60%;height:auto;border:0"></td>
      <td class="dgl-pad dgl-hide-m" align="right" style="padding:20px 34px;font-family:${FONT};font-size:10px;letter-spacing:1.6px;font-weight:700;color:#FFFFFF;white-space:nowrap">${MARKETS}<div style="width:36px;height:2px;background:${C.green};margin:8px 0 0 auto;font-size:0;line-height:0">&nbsp;</div></td>
    </tr></table>`;
  }

  function assetPath(s){
    return absUrl(s.heroUrl||Lib().resolveAsset({objective:s.objective,service:s.service,angle:s.angle}));
  }

  function heroAsset(s,height=250){
    const svc=Lib().SERVICES[s.service]||Lib().SERVICES.Multiservicio;
    return `<img class="dgl-hero" src="${esc(assetPath(s))}" alt="${esc(svc.visual||svc.name)}" width="680" height="${height}" style="display:block;width:100%;max-width:680px;height:${height}px;object-fit:cover;border:0;background:#E8EDF0">`;
  }
  function greenBar(h=4){return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td bgcolor="${C.green}" style="height:${h}px;font-size:0;line-height:0;background:${C.green}">&nbsp;</td></tr></table>`;}
  function rule(align="left"){return `<div style="width:56px;height:3px;background:${C.green};margin:${align==="center"?"18px auto 0":"18px 0 0"};font-size:0;line-height:0">&nbsp;</div>`;}
  function kicker(text,color){return text?`<div style="font-family:${FONT};font-size:10px;letter-spacing:1.8px;font-weight:800;color:${color};text-transform:uppercase">${esc(text)}</div>`:"";}
  // Two-tone headline: the closing words carry the green accent, the rest the base colour.
  function headline(text,base,accent,size=34,align="left"){
    const words=clean(text).split(" ");
    const n=words.length>2?(words[words.length-1].length<=4?2:1):0;
    const lead=words.slice(0,words.length-n).join(" "),tail=words.slice(words.length-n).join(" ");
    return `<div class="dgl-h1" style="font-family:${FONT};font-size:${size}px;line-height:1.08;font-weight:900;color:${base};text-align:${align};margin-top:12px;text-transform:uppercase">${esc(lead)}${tail?` <span style="color:${accent}">${esc(tail)}</span>`:""}</div>`;
  }
  function paragraph(text,color,size=15,margin="18px 0 0"){return text?`<p style="font-family:${FONT};font-size:${size}px;line-height:1.7;color:${color};margin:${margin}">${esc(text)}</p>`:"";}
  function button(cta,ctaHref,dark){
    return `<table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="${C.green}" style="border-radius:8px;background:${C.green}"><a class="dgl-btn" href="${ctaHref}" style="display:inline-block;padding:15px 22px;font-family:${FONT};font-size:12px;letter-spacing:.6px;white-space:nowrap;font-weight:900;color:${dark?"#071005":"#071005"};text-decoration:none;text-transform:uppercase">${esc(cta)} &rarr;</a></td></tr></table>`;
  }
  // Bordered CTA card: kicker + question line on the left, green button on the right.
  function ctaCard(label,line,cta,ctaHref,dark){
    const bg=dark?"#0E131C":C.navy,border=dark?"#2F4A1C":C.navy;
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="${bg}" style="background:${bg};border:1px solid ${border};border-radius:12px"><tr>
      <td class="dgl-col dgl-cardpad" style="padding:22px 24px;font-family:${FONT};vertical-align:middle">${kicker(label,C.greenText)}<div style="font-size:16px;line-height:1.4;font-weight:800;color:#FFFFFF;margin-top:6px">${esc(line)}</div></td>
      <td class="dgl-col dgl-cardpad" align="right" style="padding:22px 24px;vertical-align:middle">${button(cta,ctaHref,dark)}</td>
    </tr></table>`;
  }
  // Service / proof strip: equal columns, green top accent, thin vertical dividers.
  function proofStrip(items,dark){
    const w=Math.floor(100/Math.max(1,items.length));
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${items.map((x,i)=>`<td class="dgl-col${i?" dgl-divider":""}" width="${w}%" style="padding:14px 14px 4px;vertical-align:top;${i?`border-left:1px solid ${dark?C.darkLine:C.line};`:""}font-family:${FONT}"><div style="width:22px;height:3px;background:${C.green};margin-bottom:9px;font-size:0;line-height:0">&nbsp;</div><div style="font-size:12px;font-weight:900;letter-spacing:.6px;color:${dark?"#FFFFFF":C.navy};text-transform:uppercase">${esc(x)}</div>${(Lib().SERVICES[x]||{}).descriptor?`<div style="font-size:11px;line-height:1.4;color:${dark?"#AEB7C6":C.muted};margin-top:4px">${esc(Lib().SERVICES[x].descriptor)}</div>`:""}</td>`).join("")}</tr></table>`;
  }
  function footer(dark,serviceLine){
    const bg=dark?C.black:C.navy;
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="${bg}" style="background:${bg};border-top:3px solid ${C.green}"><tr>
      <td class="dgl-col dgl-pad" style="padding:24px 34px;font-family:${FONT};vertical-align:middle"><div style="font-size:13px;font-weight:900;letter-spacing:1.4px;color:#FFFFFF">DGL FREIGHT BROKER</div><div style="font-size:11px;letter-spacing:1px;color:#AEB7C6;margin-top:6px">${esc(serviceLine)}</div></td>
      <td class="dgl-col dgl-pad" align="right" style="padding:24px 34px;font-family:${FONT};font-size:12px;font-weight:700;vertical-align:middle"><a href="https://www.dglus.com" style="color:${C.greenText};text-decoration:none">www.dglus.com</a><div style="font-size:11px;color:#AEB7C6;margin-top:6px">${MARKETS}</div></td>
    </tr></table>`;
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
    // PR #3 audit punto 2 -- functional CTA (mailto:), never href="#".
    const ctaHref=`mailto:${DGL_CANONICAL_REPLY_TO}?subject=${encodeURIComponent(subjectSample)}`;
    const serviceName=s.serviceDisplay!=null?s.serviceDisplay:s.service;
    const proofLine=service.proof.join(" · ");

    if(sys.layout==="minimal"){
      // Executive minimal (light): direct commercial note, no hero, one clear action.
      return doc(sys.id,C.paper,pre,`
        <tr><td style="padding:0">${brandHeader(s)}</td></tr>
        <tr><td bgcolor="#FFFFFF" class="dgl-pad" style="background:#FFFFFF;padding:34px 40px 38px;border-left:1px solid ${C.line};border-right:1px solid ${C.line}">
          ${kicker("Direct commercial note",C.green)}${headline(h,C.navy,C.green,30)}${rule()}
          ${paragraph(b,C.body,15,"22px 0 0")}${paragraph(b2,C.body,15,"10px 0 26px")}${button(cta,ctaHref,false)}
        </td></tr>
        <tr><td style="padding:0">${footer(false,proofLine)}</td></tr>`);
    }

    if(sys.layout==="split"){
      // Split hero (dark): copy on navy/black left, photograph right, CTA card and divided
      // capability strip below -- the dark premium reference system.
      return doc(sys.id,C.ink,pre,`
        <tr><td style="padding:0">${brandHeader(s)}</td></tr>
        <tr><td bgcolor="${C.black}" style="background:${C.black};padding:0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
          <td class="dgl-col dgl-pad" width="54%" bgcolor="${C.black}" style="background:${C.black};padding:38px 30px 36px 34px;vertical-align:top">
            ${kicker(service.label,C.greenText)}${headline(h,"#FFFFFF",C.greenText,32)}${rule()}
            ${paragraph(b,"#D0D5DD",14,"20px 0 0")}${paragraph(b2,"#D0D5DD",14,"10px 0 0")}
          </td>
          <td class="dgl-col" width="46%" bgcolor="${C.black}" style="padding:0;vertical-align:top;background:${C.black}">${heroAsset(s,380)}</td>
        </tr></table></td></tr>
        <tr><td style="padding:0">${greenBar(4)}</td></tr>
        <tr><td bgcolor="${C.black}" class="dgl-pad" style="background:${C.black};padding:26px 34px 10px">${ctaCard(service.label,pre||b2,cta,ctaHref,true)}</td></tr>
        <tr><td bgcolor="${C.black}" class="dgl-pad" style="background:${C.black};padding:14px 20px 26px">${proofStrip(service.proof,true)}</td></tr>
        <tr><td style="padding:0">${footer(true,service.descriptor)}</td></tr>`);
    }

    if(sys.layout==="route"){
      // Route intelligence (light): corridor treatment -- origin node, green dashed route,
      // DGL capacity node -- next to navy capability tiles.
      const node=(label,filled)=>`<td align="center" style="font-family:${FONT};vertical-align:top;padding:0 4px"><div style="width:16px;height:16px;border-radius:50%;background:${filled?C.green:"#FFFFFF"};border:3px solid ${C.green};margin:0 auto;font-size:0;line-height:0">&nbsp;</div><div style="font-size:10px;font-weight:900;letter-spacing:1px;color:${C.navy};margin-top:8px;text-transform:uppercase">${esc(label)}</div></td>`;
      const route=`<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${node(s.lane||"Origin",false)}<td width="56%" style="padding:0 0 18px;vertical-align:middle"><div style="border-top:3px dashed ${C.green};font-size:0;line-height:0">&nbsp;</div></td>${node("DGL capacity",true)}</tr></table>`;
      const tiles=service.proof.map(x=>`<tr><td style="padding:0 0 10px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="${C.navy}" style="background:${C.navy};border-radius:10px"><tr><td style="padding:14px 16px;font-family:${FONT};font-size:12px;font-weight:900;letter-spacing:.6px;color:#FFFFFF;text-transform:uppercase"><span style="color:${C.greenText}">&#9679;</span>&nbsp; ${esc(x)}</td></tr></table></td></tr>`).join("");
      return doc(sys.id,C.paper,pre,`
        <tr><td style="padding:0">${brandHeader(s)}</td></tr>
        <tr><td bgcolor="#FFFFFF" class="dgl-pad" style="background:#FFFFFF;padding:36px 36px 8px">${kicker("Route intelligence",C.green)}${headline(h,C.navy,C.green,32)}${rule()}</td></tr>
        <tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;padding:0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
          <td class="dgl-col dgl-pad" width="58%" style="padding:18px 20px 24px 36px;vertical-align:top">${paragraph(b,C.body,15,"0")}${paragraph(b2,C.body,15,"10px 0 22px")}${route}</td>
          <td class="dgl-col dgl-pad" width="42%" style="padding:18px 36px 24px 12px;vertical-align:top"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${tiles}</table></td>
        </tr></table></td></tr>
        <tr><td style="padding:0">${heroAsset(s,220)}</td></tr>
        <tr><td bgcolor="#FFFFFF" class="dgl-pad" style="background:#FFFFFF;padding:26px 36px 30px">${ctaCard(service.label,s.lane||pre||b2,cta,ctaHref,false)}</td></tr>
        <tr><td style="padding:0">${footer(false,proofLine)}</td></tr>`);
    }

    if(sys.layout==="service"){
      // Service architecture (light): photographic hero, headline, titled solutions grid of
      // capability modules, navy CTA band.
      const modules=service.proof.map(x=>`<td class="dgl-col" width="${Math.floor(100/service.proof.length)}%" style="padding:0 6px 12px;vertical-align:top"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#FFFFFF" style="background:#FFFFFF;border:1px solid ${C.line};border-top:3px solid ${C.green};border-radius:10px"><tr><td align="center" style="padding:18px 12px;font-family:${FONT};font-size:12px;font-weight:900;letter-spacing:.6px;color:${C.navy};text-transform:uppercase">${esc(x)}</td></tr></table></td>`).join("");
      return doc(sys.id,C.paper,pre,`
        <tr><td style="padding:0">${brandHeader(s)}</td></tr>
        <tr><td style="padding:0">${heroAsset(s,260)}</td></tr>
        <tr><td style="padding:0">${greenBar(4)}</td></tr>
        <tr><td bgcolor="#FFFFFF" class="dgl-pad" style="background:#FFFFFF;padding:34px 36px 8px">${kicker(service.label,C.green)}${headline(h,C.navy,C.green,32)}${rule()}${paragraph(b,C.body,15,"20px 0 0")}${paragraph(b2,C.body,15,"10px 0 0")}</td></tr>
        <tr><td bgcolor="#FFFFFF" class="dgl-pad" style="background:#FFFFFF;padding:24px 30px 8px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${modules}</tr></table></td></tr>
        <tr><td bgcolor="#FFFFFF" class="dgl-pad" style="background:#FFFFFF;padding:10px 36px 32px">${ctaCard(service.descriptor,pre||b2,cta,ctaHref,false)}</td></tr>
        <tr><td style="padding:0">${footer(false,proofLine)}</td></tr>`);
    }

    if(sys.layout==="case"){
      // Case / proof (dark): photograph, badge + headline, numbered proof band
      // (solution / result / next step) and a real CTA.
      const step=(n,label,value)=>`<td class="dgl-col${n>1?" dgl-divider":""}" width="33%" style="padding:18px 16px;vertical-align:top;font-family:${FONT};${n>1?`border-left:1px solid ${C.darkLine};`:""}"><div style="font-size:22px;font-weight:900;color:${C.greenText}">0${n}</div><div style="font-size:10px;letter-spacing:1.4px;font-weight:900;color:#AEB7C6;margin-top:6px">${label}</div><div style="font-size:13px;font-weight:700;color:#FFFFFF;margin-top:6px">${esc(value)}</div></td>`;
      return doc(sys.id,C.black,pre,`
        <tr><td style="padding:0">${brandHeader(s)}</td></tr>
        <tr><td style="padding:0">${heroAsset(s,250)}</td></tr>
        <tr><td style="padding:0">${greenBar(4)}</td></tr>
        <tr><td bgcolor="${C.black}" class="dgl-pad" style="background:${C.black};padding:32px 36px 8px"><span style="display:inline-block;background:${C.green};color:#071005;padding:7px 12px;border-radius:6px;font-family:${FONT};font-size:10px;font-weight:900;letter-spacing:1.2px">CASE / PROOF</span>${headline(h,"#FFFFFF",C.greenText,32)}${rule()}${paragraph(b,"#D0D5DD",14,"20px 0 0")}${paragraph(b2,"#D0D5DD",14,"10px 0 0")}</td></tr>
        <tr><td bgcolor="${C.black}" class="dgl-pad" style="background:${C.black};padding:22px 36px 6px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#0E131C" style="background:#0E131C;border:1px solid ${C.darkLine};border-radius:12px"><tr>${step(1,"SOLUTION",serviceName)}${step(2,"RESULT","Commercial continuity")}${step(3,"NEXT STEP",cta)}</tr></table></td></tr>
        <tr><td bgcolor="${C.black}" class="dgl-pad" style="background:${C.black};padding:20px 36px 32px">${button(cta,ctaHref,true)}</td></tr>
        <tr><td style="padding:0">${footer(true,service.descriptor)}</td></tr>`);
    }

    /* editorial default -- Editorial white (light): copy left with two-tone headline, photograph
       right, green action, divided service strip. */
    return doc(sys.id,C.paper,pre,`
      <tr><td style="padding:0">${brandHeader(s)}</td></tr>
      <tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;padding:0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
        <td class="dgl-col dgl-pad" width="56%" style="padding:38px 24px 34px 36px;vertical-align:top">
          ${kicker(service.label,C.green)}${headline(h,C.navy,C.green,32)}${rule()}
          ${paragraph(b,C.body,14,"20px 0 0")}${paragraph(b2,C.body,14,"10px 0 24px")}${button(cta,ctaHref,false)}
        </td>
        <td class="dgl-col" width="44%" bgcolor="#FFFFFF" style="padding:0;vertical-align:top;background:#FFFFFF">${heroAsset(s,420)}</td>
      </tr></table></td></tr>
      <tr><td bgcolor="#FFFFFF" class="dgl-pad" style="background:#FFFFFF;padding:10px 22px 26px;border-top:1px solid ${C.line}">${proofStrip(service.proof,false)}</td></tr>
      <tr><td style="padding:0">${footer(false,service.descriptor)}</td></tr>`);
  }

  global.DGL_CREATIVE_RENDER_V5={render,systemFor,selection,brandHeader,assetPath,heroAsset,absUrl,OFFICIAL_LOGO,BASE_URL};
})(window);
