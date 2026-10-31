// src/workers/telemetryWorker.js
// Hilo secundario dedicado (Web Worker ES6) para procesar toda la carga estadística y las series
// de Chart.js fuera del Main Thread, garantizando 60 FPS estables en Babylon.js.

import { TelemetryProcessor } from "./telemetryProcessor.js";

let procesador = new TelemetryProcessor();
let intervaloMinMs = 420;
let ultimoEnvioMs = 0;
let timerPendiente = null;

function emitirSnapshotInmediato() {
  if (timerPendiente !== null) {
    clearTimeout(timerPendiente);
    timerPendiente = null;
  }
  ultimoEnvioMs = performance.now();
  self.postMessage({
    tipo: "TELEMETRIA_SNAPSHOT",
    snapshot: procesador.generarSnapshot(),
  });
}

function programarSnapshot() {
  const ahora = performance.now();
  const transcurrido = ahora - ultimoEnvioMs;
  if (transcurrido >= intervaloMinMs) {
    emitirSnapshotInmediato();
  } else if (timerPendiente === null) {
    timerPendiente = setTimeout(emitirSnapshotInmediato, intervaloMinMs - transcurrido);
  }
}

self.onmessage = (ev) => {
  const data = ev.data;
  if (!data) return;

  if (data.tipo === "CONFIGURAR") {
    procesador = new TelemetryProcessor(data.tiposMaterial);
    if (typeof data.intervaloMs === "number") intervaloMinMs = data.intervaloMs;
    emitirSnapshotInmediato();
    return;
  }

  if (data.tipo === "LOTE_EVENTOS" && Array.isArray(data.lote)) {
    const incluyeReinicio = data.lote.some((e) => e.tipo === "REINICIAR");
    procesador.procesarLote(data.lote);
    if (incluyeReinicio) {
      emitirSnapshotInmediato();
    } else {
      programarSnapshot();
    }
  }
};
