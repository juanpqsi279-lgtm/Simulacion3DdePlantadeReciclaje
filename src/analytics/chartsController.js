// src/analytics/chartsController.js
// Controlador analítico en Chart.js suscrito exclusivamente al EventBus (Pub/Sub).
// Escucha eventos de detección de sensores 3D y ticks de telemetría sin acoplamiento con Babylon.js.

import { Chart, registerables } from "chart.js";
import { EVENTOS } from "../core/bus/eventBus.js";

Chart.register(...registerables);
Chart.defaults.color = "#9cb3c5";
Chart.defaults.borderColor = "rgba(56, 93, 122, 0.35)";
Chart.defaults.font.family = '"Segoe UI", system-ui, -apple-system, sans-serif';
Chart.defaults.font.size = 11;
Chart.defaults.animation = false;
Chart.defaults.maintainAspectRatio = false;

const MAX_MUESTRAS_FLUJO = 36;

export function inicializarChartsDashboard(canvases, config, bus) {
  const cfgMat = config.materialesCfg;
  const historial = config.historialCfg;
  const tipos = Object.keys(cfgMat.materiales);
  const etiquetas = tipos.map((t) => cfgMat.materiales[t].etiqueta);
  const colores = tipos.map((t) => cfgMat.materiales[t].color);
  const leyendaCompacta = { labels: { boxWidth: 10, boxHeight: 10, padding: 8 } };

  // 1. Dona de distribución y pureza de recuperación
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

  // 2. Caudal instantáneo (piezas/min) y detecciones de sensores en tiempo real
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

  // 3. Eficacia por corriente: Clasificadas vs. Merma/Rechazo
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

  // 4. Comparativa histórica multiturno (mock) frente a corrida actual
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

  let deteccionesAcumuladas = 0;
  let ultimoTotalProcesadas = 0;
  let ultimoTotalDetecciones = 0;
  let ultimoTiempoMuestra = 0;

  const desuscripciones = [];

  // Reacción directa al evento emitido por los sensores 3D (Aluminio, Plástico, Vidrio)
  desuscripciones.push(
    bus.on(EVENTOS.SENSOR_DETECCION, (ev) => {
      if (ev.detectado) deteccionesAcumuladas++;
    }),
  );

  // Actualización periódica desacoplada vía telemetría
  desuscripciones.push(
    bus.on(EVENTOS.TELEMETRIA_TICK, (resumen) => {
      chartDona.data.datasets[0].data = tipos.map((t) => resumen.clasificadasPorTipo[t] ?? 0);
      chartBarras.data.datasets[0].data = tipos.map((t) => resumen.clasificadasPorTipo[t] ?? 0);
      chartBarras.data.datasets[1].data = tipos.map((t) => resumen.rechazadasPorTipo[t] ?? 0);

      tipos.forEach((t, idx) => {
        chartHistorial.data.datasets[idx].data[turnos.length] = resumen.clasificadasPorTipo[t] ?? 0;
      });
      chartHistorial.data.datasets[tipos.length].data[turnos.length] = resumen.rechazadas;

      if (resumen.tiempo - ultimoTiempoMuestra >= 2.0) {
        const dt = resumen.tiempo - ultimoTiempoMuestra;
        const tasaSalida = Math.round(((resumen.procesadas - ultimoTotalProcesadas) / dt) * 60);
        const tasaSensado = Math.round(((deteccionesAcumuladas - ultimoTotalDetecciones) / dt) * 60);

        chartFlujo.data.labels.push(`${Math.round(resumen.tiempo)}s`);
        chartFlujo.data.datasets[0].data.push(tasaSalida);
        chartFlujo.data.datasets[1].data.push(tasaSensado);

        if (chartFlujo.data.labels.length > MAX_MUESTRAS_FLUJO) {
          chartFlujo.data.labels.shift();
          chartFlujo.data.datasets[0].data.shift();
          chartFlujo.data.datasets[1].data.shift();
        }

        ultimoTotalProcesadas = resumen.procesadas;
        ultimoTotalDetecciones = deteccionesAcumuladas;
        ultimoTiempoMuestra = resumen.tiempo;
        chartFlujo.update("none");
      }

      chartDona.update("none");
      chartBarras.update("none");
      chartHistorial.update("none");
    }),
  );

  function limpiarSeries() {
    deteccionesAcumuladas = 0;
    ultimoTotalProcesadas = 0;
    ultimoTotalDetecciones = 0;
    ultimoTiempoMuestra = 0;
    chartFlujo.data.labels = [];
    chartFlujo.data.datasets[0].data = [];
    chartFlujo.data.datasets[1].data = [];
    chartDona.data.datasets[0].data = [0, 0, 0];
    chartBarras.data.datasets[0].data = [0, 0, 0];
    chartBarras.data.datasets[1].data = [0, 0, 0];
    tipos.forEach((_, idx) => {
      chartHistorial.data.datasets[idx].data[turnos.length] = 0;
    });
    chartHistorial.data.datasets[tipos.length].data[turnos.length] = 0;
    chartDona.update("none");
    chartFlujo.update("none");
    chartBarras.update("none");
    chartHistorial.update("none");
  }

  desuscripciones.push(bus.on(EVENTOS.COMANDO_REINICIAR, limpiarSeries));
  desuscripciones.push(
    bus.on(EVENTOS.ESTADO_PLANTA, (snap) => {
      if (snap.fase === 0) limpiarSeries();
    }),
  );

  return {
    limpiarSeries,
    dispose() {
      desuscripciones.forEach((off) => off());
      chartDona.destroy();
      chartFlujo.destroy();
      chartBarras.destroy();
      chartHistorial.destroy();
    },
  };
}
