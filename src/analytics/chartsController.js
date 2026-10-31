// src/analytics/chartsController.js
// Controlador ligero de Chart.js en el Main Thread.
// CERO procesamiento estadístico local: solo pinta los arreglos precalculados (seriesChart)
// enviados de forma dosificada por el Web Worker a través del EventBus.

import { Chart, registerables } from "chart.js";
import { EVENTOS } from "../core/bus/eventBus.js";

Chart.register(...registerables);
Chart.defaults.color = "#9cb3c5";
Chart.defaults.borderColor = "rgba(56, 93, 122, 0.35)";
Chart.defaults.font.family = '"Segoe UI", system-ui, -apple-system, sans-serif';
Chart.defaults.font.size = 11;
Chart.defaults.animation = false;
Chart.defaults.maintainAspectRatio = false;

export function inicializarChartsDashboard(canvases, config, bus) {
  const cfgMat = config.materialesCfg;
  const historial = config.historialCfg;
  const tipos = Object.keys(cfgMat.materiales);
  const etiquetas = tipos.map((t) => cfgMat.materiales[t].etiqueta);
  const colores = tipos.map((t) => cfgMat.materiales[t].color);
  const leyendaCompacta = { labels: { boxWidth: 10, boxHeight: 10, padding: 8 } };

  const chartDona = new Chart(canvases.dona, {
    type: "doughnut",
    data: {
      labels: etiquetas,
      datasets: [
        {
          data: [0, 0, 0],
          backgroundColor: colores,
          borderColor: "#132635",
          borderWidth: 2,
          hoverOffset: 4,
        },
      ],
    },
    options: {
      cutout: "64%",
      plugins: { legend: { position: "right", ...leyendaCompacta } },
    },
  });

  const chartFlujo = new Chart(canvases.flujo, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Caudal salida (pzs/min)",
          data: [],
          borderColor: "#2ecc71",
          backgroundColor: "rgba(46, 204, 113, 0.16)",
          fill: true,
          tension: 0.32,
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: "Detecciones sensor/min",
          data: [],
          borderColor: "#38bdf8",
          borderDash: [4, 3],
          fill: false,
          tension: 0.32,
          pointRadius: 0,
          borderWidth: 1.6,
        },
      ],
    },
    options: {
      plugins: { legend: { position: "bottom", ...leyendaCompacta } },
      scales: {
        x: { ticks: { maxTicksLimit: 6 } },
        y: { beginAtZero: true },
      },
    },
  });

  const chartBarras = new Chart(canvases.barras, {
    type: "bar",
    data: {
      labels: etiquetas,
      datasets: [
        { label: "Clasificadas", data: [0, 0, 0], backgroundColor: "#2ecc71", borderRadius: 4 },
        { label: "Merma / Rechazo", data: [0, 0, 0], backgroundColor: "#e67e22", borderRadius: 4 },
      ],
    },
    options: {
      plugins: { legend: { position: "bottom", ...leyendaCompacta } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });

  const turnos = historial.turnos;
  const chartHistorial = new Chart(canvases.historial, {
    type: "bar",
    data: {
      labels: [...turnos.map((t) => t.turno), "Actual"],
      datasets: [
        ...tipos.map((t) => ({
          label: cfgMat.materiales[t].etiqueta,
          data: [...turnos.map((x) => x[t]), 0],
          backgroundColor: cfgMat.materiales[t].color,
          stack: "turno",
        })),
        {
          label: "Merma",
          data: [...turnos.map((x) => x.rechazo), 0],
          backgroundColor: "#e67e22",
          stack: "turno",
        },
      ],
    },
    options: {
      plugins: { legend: { position: "bottom", ...leyendaCompacta } },
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true },
      },
    },
  });

  // Recepción directa del snapshot precalculado por el Web Worker
  const offTick = bus.on(EVENTOS.TELEMETRIA_TICK, (snapshot) => {
    const s = snapshot.seriesChart;
    if (!s) return;

    chartDona.data.datasets[0].data = s.dona;
    chartBarras.data.datasets[0].data = s.barrasClasificadas;
    chartBarras.data.datasets[1].data = s.barrasMerma;

    chartFlujo.data.labels = s.flujoLabels;
    chartFlujo.data.datasets[0].data = s.flujoSalida;
    chartFlujo.data.datasets[1].data = s.flujoSensado;

    s.dona.forEach((val, idx) => {
      chartHistorial.data.datasets[idx].data[turnos.length] = val;
    });
    chartHistorial.data.datasets[tipos.length].data[turnos.length] = snapshot.rechazadas;

    chartDona.update("none");
    chartFlujo.update("none");
    chartBarras.update("none");
    chartHistorial.update("none");
  });

  return {
    dispose() {
      offTick();
      chartDona.destroy();
      chartFlujo.destroy();
      chartBarras.destroy();
      chartHistorial.destroy();
    },
  };
}
