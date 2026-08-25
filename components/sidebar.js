/**
 * Component: Sidebar
 * Renders grouped navigation from the module registry defined in app.js
 * (window.DGL_MODULES). Handles active state + badges.
 */
(function (global) {
  "use strict";

  function navItem(mod, activeId) {
    const isActive = mod.id === activeId;
    const badge = mod.badge ? `<span class="nav-badge">${mod.badge}</span>` : "";
    return `
    <a href="#/${mod.id}" class="nav-item ${isActive ? "active" : ""}" data-module-id="${mod.id}">
      <i data-lucide="${mod.icon}"></i>
      <span class="label">${mod.label}</span>
      ${badge}
    </a>`;
  }

  function renderSidebar(groups, activeId) {
    const groupsHtml = groups.map((g) => `
      <div class="nav-group">
        <div class="nav-group-label">${g.label}</div>
        ${g.items.map((m) => navItem(m, activeId)).join("")}
      </div>
    `).join("");

    return `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-brand">
        <div class="mark">DG</div>
        <div class="brand-text">
          <div class="name">DGL Marketing OS</div>
          <div class="sub">V5.5 · AM → Marketing Automation</div>
        </div>
      </div>
      <nav class="sidebar-nav">${groupsHtml}</nav>
      <div class="sidebar-footer">
        <button class="sidebar-toggle" id="sidebarToggle">
          <i data-lucide="panel-left-close"></i>
          <span>Colapsar</span>
        </button>
      </div>
    </aside>`;
  }

  function setActiveNav(activeId) {
    document.querySelectorAll(".nav-item").forEach((el) => {
      el.classList.toggle("active", el.getAttribute("data-module-id") === activeId);
    });
  }

  global.DGL_UI = global.DGL_UI || {};
  global.DGL_UI.renderSidebar = renderSidebar;
  global.DGL_UI.setActiveNav = setActiveNav;
})(window);
