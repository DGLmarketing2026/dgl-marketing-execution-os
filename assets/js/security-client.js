/** Canonical public link destinations; never derive trust from backend-provided URLs. */
(function(g){"use strict";
const origins=Object.freeze(["https://dglus.com","https://www.dglus.com","https://dglmarketing2026.github.io"]);
function publishedUrl(value){try{const u=new URL(String(value||""));return u.protocol==="https:"&&!u.username&&!u.password&&origins.includes(u.origin)?u.href:"";}catch(_){return "";}}
g.DGL_SECURITY=Object.freeze({publishedUrl,origins});
})(window);
