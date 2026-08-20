/**
 * Component: Header (Topbar)
 * Global search, breadcrumbs, quick actions, notifications, user chip.
 */
(function (global) {
  "use strict";

  function renderHeader(mod) {
    return `
    <header class="topbar">
      <button class="icon-btn mobile-menu-btn" id="mobileMenuBtn" style="display:none">
        <i data-lucide="menu"></i>
      </button>
      <div class="topbar-title-block">
        <div class="topbar-breadcrumbs">
          <span>DGL Marketing OS</span>
          <i data-lucide="chevron-right" style="width:12px;height:12px"></i>
          <span class="crumb-current">${mod.group}</span>
        </div>
        <h1>${mod.label}</h1>
      </div>

      <div class="global-search">
        <i data-lucide="search" style="width:15px;height:15px"></i>
        <input type="text" id="globalSearchInput" placeholder="Buscar cuentas, campañas, cotizaciones, assets..." />
        <span class="kbd">/</span>
      </div>

      <div class="topbar-actions">
        <button class="icon-btn" id="btnCreateCampaign" title="Crear campaña">
          <i data-lucide="plus"></i>
        </button>
        <button class="icon-btn" title="Notificaciones">
          <i data-lucide="bell"></i>
          <span class="dot"></span>
        </button>
        <div class="user-chip">
          <div class="avatar">CS</div>
          <div>
            <div class="name">Cristian Serna</div>
            <div class="role">Team Leader Marketing</div>
          </div>
        </div>
      </div>
    </header>`;
  }

  global.DGL_UI = global.DGL_UI || {};
  global.DGL_UI.renderHeader = renderHeader;
})(window);
