// Panel de gráficas con Chart.js
import { Chart, registerables } from "chart.js";

Chart.register(...registerables);
Chart.defaults.color = "#93a9b9";
Chart.defaults.borderColor = "#25435a";
Chart.defaults.font.family = '"Segoe UI", system-ui, sans-serif';
Chart.defaults.animation = false;
Chart.defaults.maintainAspectRatio = false;

const MAX_PUNTOS = 40;

export function crearDashboard(cfg, historial) {
  const tipos = Object.keys(cfg.materiales);
  const etiquetas = tipos.map((t) => cfg.materiales[t].etiqueta);
  const colores = tipos.map((t) => cfg.materiales[t].color);
  const leyenda = { labels: { boxWidth: 10, boxHeight: 10 } };

  const dona = new Chart(document.getElementById("g-dona"), {
    type: "doughnut",
    data: { labels: etiquetas, datasets: [{ data: tipos.map(() => 0), backgroundColor: colores, borderColor: "#172c3b" }] },
    options: { plugins: { legend: { position: "right", ...leyenda } }, cutout: "62%" },
  });

  const flujo = new Chart(document.getElementById("g-flujo"), {
    type: "line",
    data: {
      labels: [],
      datasets: [{ label: "Piezas/min", data: [], borderColor: "#2ecc71", backgroundColor: "rgba(46,204,113,.15)", fill: true, tension: 0.3, pointRadius: 0 }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { x: { title: { display: true, text: "Tiempo simulado (s)" }, ticks: { maxTicksLimit: 6 } }, y: { beginAtZero: true } },
    },
  });

  const barras = new Chart(document.getElementById("g-barras"), {
    type: "bar",
    data: {
      labels: etiquetas,
      datasets: [
        { label: "Clasificadas", data: tipos.map(() => 0), backgroundColor: "#2ecc71" },
        { label: "Rechazadas", data: tipos.map(() => 0), backgroundColor: "#e67e22" },
      ],
    },
    options: { plugins: { legend: { position: "bottom", ...leyenda } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
  });

  const turnos = historial.turnos;
  const hist = new Chart(document.getElementById("g-historial"), {
    type: "bar",
    data: {
      labels: [...turnos.map((t) => t.turno), "Actual"],
      datasets: [
        ...tipos.map((t) => ({
          label: cfg.materiales[t].etiqueta,
          data: [...turnos.map((x) => x[t]), 0],
          backgroundColor: cfg.materiales[t].color,
          stack: "p",
        })),
        { label: "Rechazo", data: [...turnos.map((x) => x.rechazo), 0], backgroundColor: "#e67e22", stack: "p" },
      ],
    },
    options: {
      plugins: { legend: { position: "bottom", ...leyenda } },
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
    },
  });

  let ultimoTotal = 0;
  let ultimoT = 0;

  return {
    actualizar(sim) {
      const m = sim.metricas;
      dona.data.datasets[0].data = tipos.map((t) => m.clasificadas[t]);
      barras.data.datasets[0].data = tipos.map((t) => m.clasificadas[t]);
      barras.data.datasets[1].data = tipos.map((t) => m.rechazadas[t]);
      tipos.forEach((t, i) => (hist.data.datasets[i].data[turnos.length] = m.clasificadas[t]));
      hist.data.datasets[tipos.length].data[turnos.length] = Object.values(m.rechazadas).reduce((a, b) => a + b, 0);

      if (sim.tiempo - ultimoT >= 2) {
        const r = sim.resumen();
        const dt = sim.tiempo - ultimoT;
        flujo.data.labels.push(Math.round(sim.tiempo));
        flujo.data.datasets[0].data.push(Math.round(((r.procesadas - ultimoTotal) / dt) * 60));
        if (flujo.data.labels.length > MAX_PUNTOS) {
          flujo.data.labels.shift();
          flujo.data.datasets[0].data.shift();
        }
        ultimoTotal = r.procesadas;
        ultimoT = sim.tiempo;
        flujo.update("none");
      }
      dona.update("none");
      barras.update("none");
      hist.update("none");
    },
    reiniciar() {
      flujo.data.labels = [];
      flujo.data.datasets[0].data = [];
      ultimoTotal = 0;
      ultimoT = 0;
    },
  };
}
