/**
 * DGL Marketing Execution OS — Chart Rendering Layer
 * Thin wrapper around Chart.js with a dark, executive theme applied
 * consistently across the platform. Keeps chart instances registered
 * so they can be destroyed on route change (avoids memory leaks / canvas reuse errors).
 */
(function (global) {
  "use strict";

  const activeCharts = {};

  function destroyChart(id) {
    if (activeCharts[id]) {
      activeCharts[id].destroy();
      delete activeCharts[id];
    }
  }

  function destroyAllCharts() {
    Object.keys(activeCharts).forEach(destroyChart);
  }

  function baseGrid() {
    return { color: "rgba(255,255,255,0.06)", drawTicks: false };
  }
  function baseTicks() {
    return { color: "#AAB3C5", font: { family: "Inter", size: 11 } };
  }

  /**
   * Guards every chart call against Chart.js failing to load from its CDN
   * (offline environment, blocked script, corporate proxy, etc). Instead of
   * throwing and breaking the whole module render, the canvas is swapped
   * for a small inline notice so the rest of the page stays fully usable.
   */
  function chartJsReady(canvasId) {
    if (typeof Chart !== "undefined") return true;
    const ctx = document.getElementById(canvasId);
    if (ctx && ctx.parentElement) {
      ctx.parentElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#6B7280;font-size:12px;text-align:center;padding:16px">Gráfico no disponible: no se pudo cargar Chart.js desde el CDN. Verifica la conexión a internet.</div>';
    }
    return false;
  }

  function revenueTrendChart(canvasId, trend) {
    if (!chartJsReady(canvasId)) return;
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    activeCharts[canvasId] = new Chart(ctx, {
      type: "line",
      data: {
        labels: trend.map((t) => t.month),
        datasets: [
          {
            label: "Revenue influenciado por Marketing",
            data: trend.map((t) => t.influenced),
            borderColor: "#77B82A",
            backgroundColor: "rgba(119,184,42,0.14)",
            fill: true,
            tension: 0.4,
            pointRadius: 3,
            pointBackgroundColor: "#77B82A",
            borderWidth: 2.5
          },
          {
            label: "Revenue total de cartera",
            data: trend.map((t) => t.total),
            borderColor: "#38BDF8",
            backgroundColor: "transparent",
            borderDash: [4, 4],
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 1.5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "bottom", labels: { color: "#AAB3C5", boxWidth: 8, boxHeight: 8, usePointStyle: true, font: { family: "Inter", size: 11 } } },
          tooltip: {
            backgroundColor: "#161e33", borderColor: "rgba(255,255,255,0.1)", borderWidth: 1,
            titleColor: "#fff", bodyColor: "#AAB3C5", padding: 10,
            callbacks: { label: (c) => `${c.dataset.label}: $${c.parsed.y.toLocaleString("en-US")}` }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: baseTicks() },
          y: { grid: baseGrid(), ticks: { ...baseTicks(), callback: (v) => "$" + (v / 1000) + "K" } }
        }
      }
    });
  }

  function campaignPerformanceChart(canvasId, data) {
    if (!chartJsReady(canvasId)) return;
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    activeCharts[canvasId] = new Chart(ctx, {
      type: "bar",
      data: {
        labels: data.map((d) => d.name),
        datasets: [{
          label: "Tasa de conversión (%)",
          data: data.map((d) => d.conversion),
          backgroundColor: data.map((d) => d.conversion >= 45 ? "#77B82A" : d.conversion >= 30 ? "#38BDF8" : "#F59E0B"),
          borderRadius: 6,
          maxBarThickness: 34
        }]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: "#161e33", padding: 10 } },
        scales: {
          x: { grid: baseGrid(), ticks: { ...baseTicks(), callback: (v) => v + "%" }, max: 60 },
          y: { grid: { display: false }, ticks: baseTicks() }
        }
      }
    });
  }

  function funnelBars(containerId, stages) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const max = Math.max(...stages.map((s) => s.value));
    el.innerHTML = stages.map((s) => `
      <div style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px">
          <span class="text-secondary">${s.stage}</span><span style="font-weight:700">${s.value}</span>
        </div>
        <div class="progress-track" style="height:10px">
          <div class="progress-fill" style="width:${(s.value / max) * 100}%"></div>
        </div>
      </div>
    `).join("");
  }

  function lossReasonsDonut(canvasId, reasons) {
    if (!chartJsReady(canvasId)) return;
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const colors = ["#EF4444", "#F59E0B", "#38BDF8", "#77B82A", "#6B7280"];
    activeCharts[canvasId] = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: reasons.map((r) => r.reason),
        datasets: [{ data: reasons.map((r) => r.pct), backgroundColor: colors, borderColor: "#111827", borderWidth: 3 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "68%",
        plugins: {
          legend: { position: "bottom", labels: { color: "#AAB3C5", boxWidth: 8, boxHeight: 8, usePointStyle: true, font: { family: "Inter", size: 10.5 } } },
          tooltip: { backgroundColor: "#161e33", padding: 10, callbacks: { label: (c) => `${c.label}: ${c.parsed}%` } }
        }
      }
    });
  }

  function serviceVolumeBar(canvasId, services) {
    if (!chartJsReady(canvasId)) return;
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    activeCharts[canvasId] = new Chart(ctx, {
      type: "bar",
      data: {
        labels: services.map((s) => s.service),
        datasets: [{
          label: "Lane Quotes",
          data: services.map((s) => s.volume),
          backgroundColor: "#14108a",
          hoverBackgroundColor: "#77B82A",
          borderRadius: 6,
          maxBarThickness: 30
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: "#161e33", padding: 10 } },
        scales: {
          x: { grid: { display: false }, ticks: baseTicks() },
          y: { grid: baseGrid(), ticks: baseTicks() }
        }
      }
    });
  }

  function keywordVisibilityBar(canvasId, keywords) {
    if (!chartJsReady(canvasId)) return;
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    activeCharts[canvasId] = new Chart(ctx, {
      type: "bar",
      data: {
        labels: keywords.map((k) => k.keyword.length > 26 ? k.keyword.slice(0, 24) + "…" : k.keyword),
        datasets: [{
          label: "Visibilidad (%)",
          data: keywords.map((k) => k.visibility),
          backgroundColor: "#38BDF8",
          borderRadius: 6,
          maxBarThickness: 26
        }]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: "#161e33", padding: 10 } },
        scales: {
          x: { grid: baseGrid(), ticks: { ...baseTicks(), callback: (v) => v + "%" }, max: 100 },
          y: { grid: { display: false }, ticks: { ...baseTicks(), font: { size: 10.5 } } }
        }
      }
    });
  }

  if (global.Chart) {
    global.Chart.defaults.font.family = "Inter";
    global.Chart.defaults.color = "#AAB3C5";
  }

  global.DGL_CHARTS = {
    destroyChart, destroyAllCharts,
    revenueTrendChart, campaignPerformanceChart, funnelBars,
    lossReasonsDonut, serviceVolumeBar, keywordVisibilityBar
  };
})(window);
