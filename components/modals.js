/**
 * Component: Modals
 * Minimal modal controller — single overlay reused across the app.
 */
(function (global) {
  "use strict";

  function ensureOverlay() {
    let overlay = document.getElementById("dgl-modal-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "dgl-modal-overlay";
      overlay.className = "modal-overlay";
      overlay.innerHTML = `
        <div class="modal-box" role="dialog" aria-modal="true">
          <div class="modal-head">
            <h3 id="dgl-modal-title"></h3>
            <button class="modal-close" data-action="close-modal"><i data-lucide="x"></i></button>
          </div>
          <div class="modal-body" id="dgl-modal-body"></div>
          <div class="modal-foot" id="dgl-modal-foot"></div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeModal();
      });
    }
    return overlay;
  }

  function openModal({ title, bodyHtml, footHtml }) {
    const overlay = ensureOverlay();
    overlay.querySelector("#dgl-modal-title").textContent = title || "";
    overlay.querySelector("#dgl-modal-body").innerHTML = bodyHtml || "";
    overlay.querySelector("#dgl-modal-foot").innerHTML = footHtml || `
      <button class="btn btn-ghost" data-action="close-modal">Cancelar</button>
      <button class="btn btn-primary" data-action="close-modal">Entendido</button>`;
    overlay.classList.add("open");
    if (window.lucide) window.lucide.createIcons();
  }

  function closeModal() {
    const overlay = document.getElementById("dgl-modal-overlay");
    if (overlay) overlay.classList.remove("open");
  }

  document.addEventListener("click", (e) => {
    const trigger = e.target.closest('[data-action="close-modal"]');
    if (trigger) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  global.DGL_UI = global.DGL_UI || {};
  global.DGL_UI.openModal = openModal;
  global.DGL_UI.closeModal = closeModal;
})(window);
