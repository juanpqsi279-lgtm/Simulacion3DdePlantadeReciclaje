// src/core/bus/eventBus.js
// Bus de Eventos Pub/Sub en Vanilla JS puro con puente asíncrono por lotes hacia un Web Worker.
// El Main Thread se dedica exclusivamente a renderizar el 3D a 60 FPS mientras el Worker procesa
// estadísticas masivas y precalcula los datasets de Chart.js en un hilo separado.

import { TelemetryProcessor } from "../../workers/telemetryProcessor.js";

export const EVENTOS = Object.freeze({
  CONFIG_CARGADA: "sistema:configCargada",
  CARGA_3D_PROGRESO: "motor3d:progresoCarga",
  MOTOR_3D_LISTO: "motor3d:listo",
  MOTOR_3D_ERROR: "motor3d:error",
  ESTADO_PLANTA: "planta:estadoCambiado",
  COMANDO_FASE: "comando:irAFase",
  COMANDO_PASO_SIGUIENTE: "comando:siguientePaso",
  COMANDO_ENSAMBLAR_TODO: "comando:ensamblarTodo",
  COMANDO_DESMONTAR: "comando:desmontar",
  COMANDO_ALTERNAR_OPERACION: "comando:alternarOperacion",
  COMANDO_REINICIAR: "comando:reiniciarSimulacion",
  COMANDO_VELOCIDAD: "comando:velocidadSimulacion",
  COMANDO_FLUJO: "comando:flujoMaterial",
  COMANDO_CAMARA: "comando:camara",
  COMANDO_WIREFRAME: "comando:wireframe",
  ITEM_INGRESADO: "linea:itemIngresado",
  SENSOR_ROI_ESTADO: "sensor:roiEstado",
  SENSOR_DETECCION: "sensor:deteccion",
  SENSOR_ALUMINIO: "sensor:aluminio",
  SENSOR_PLASTICO: "sensor:plastico",
  SENSOR_VIDRIO: "sensor:vidrio",
  ACTUADOR_DISPARO: "actuador:disparo",
  ITEM_CLASIFICADO: "linea:itemClasificado",
  ITEM_RECHAZADO: "linea:itemRechazado",
  PULSO_TIEMPO: "simulacion:pulsoTiempo",
  TELEMETRIA_TICK: "telemetria:tick",
  RENDIMIENTO_3D: "rendimiento:fps",
});

export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._suscriptores = new Map();
    this._worker = null;
    this._colaWorker = [];
    this._timerFlush = null;
    this._desuscripcionesPuente = [];
    this._procesadorLocal = null;
  }

  on(evento, callback) {
    if (typeof callback !== "function") {
      throw new TypeError(`El suscriptor para "${evento}" debe ser una función.`);
    }
    let conjunto = this._suscriptores.get(evento);
    if (!conjunto) {
      conjunto = new Set();
      this._suscriptores.set(evento, conjunto);
    }
    conjunto.add(callback);
    return () => this.off(evento, callback);
  }

  once(evento, callback) {
    const envoltorio = (payload) => {
      this.off(evento, envoltorio);
      callback(payload);
    };
    return this.on(evento, envoltorio);
  }

  off(evento, callback) {
    const conjunto = this._suscriptores.get(evento);
    if (!conjunto) return;
    conjunto.delete(callback);
    if (conjunto.size === 0) this._suscriptores.delete(evento);
  }

  emit(evento, payload) {
    const conjunto = this._suscriptores.get(evento);
    if (!conjunto || conjunto.size === 0) return 0;
    let notificados = 0;
    for (const cb of [...conjunto]) {
      cb(payload);
      notificados++;
    }
    return notificados;
  }

  /**
   * Activa el procesamiento estadístico en segundo plano mediante un Web Worker dedicado.
   * Agrupa eventos de alta frecuencia en micro-lotes (cada 120 ms) para evitar overhead de postMessage.
   * @param {{ tiposMaterial?: string[], intervaloSnapshotMs?: number, intervaloLoteMs?: number }} [opciones]
   */
  iniciarPuenteWorker(opciones = {}) {
    this.detenerPuenteWorker();
    const tiposMaterial = opciones.tiposMaterial ?? ["plastico", "aluminio", "vidrio"];
    const intervaloSnapshotMs = opciones.intervaloSnapshotMs ?? 420;
    const intervaloLoteMs = opciones.intervaloLoteMs ?? 120;

    if (typeof Worker !== "undefined") {
      this._worker = new Worker(new URL("../../workers/telemetryWorker.js", import.meta.url), {
        type: "module",
      });
      this._worker.onmessage = (ev) => {
        if (ev.data?.tipo === "TELEMETRIA_SNAPSHOT") {
          this.emit(EVENTOS.TELEMETRIA_TICK, ev.data.snapshot);
        }
      };
      this._worker.postMessage({
        tipo: "CONFIGURAR",
        tiposMaterial,
        intervaloMs: intervaloSnapshotMs,
      });
    } else {
      // Respaldo asíncrono para entornos CLI de pruebas (Node.js sin Web Worker DOM global)
      this._procesadorLocal = new TelemetryProcessor(tiposMaterial);
    }

    const encolar = (tipo, payload, inmediato = false) => {
      this._colaWorker.push({ tipo, payload });
      if (inmediato) {
        this.vaciarColaWorker();
      } else if (this._timerFlush === null) {
        this._timerFlush = setTimeout(() => this.vaciarColaWorker(), intervaloLoteMs);
      }
    };

    this._desuscripcionesPuente.push(
      this.on(EVENTOS.ITEM_INGRESADO, (p) => encolar("INGRESO", { material: p.material })),
      this.on(EVENTOS.SENSOR_DETECCION, (p) => encolar("DETECCION", { detectado: p.detectado })),
      this.on(EVENTOS.ITEM_CLASIFICADO, (p) =>
        encolar("CLASIFICADO", { material: p.material, masaKg: p.masaKg }),
      ),
      this.on(EVENTOS.ITEM_RECHAZADO, (p) =>
        encolar("RECHAZADO", { material: p.material, masaKg: p.masaKg }),
      ),
      this.on(EVENTOS.PULSO_TIEMPO, (p) => encolar("PULSO_TIEMPO", p)),
      this.on(EVENTOS.COMANDO_REINICIAR, () => encolar("REINICIAR", null, true)),
      this.on(EVENTOS.ESTADO_PLANTA, (snap) => {
        if (snap.fase === 0) encolar("REINICIAR", null, true);
      }),
    );

    if (this._procesadorLocal) {
      queueMicrotask(() => {
        if (this._procesadorLocal) {
          this.emit(EVENTOS.TELEMETRIA_TICK, this._procesadorLocal.generarSnapshot());
        }
      });
    }
  }

  vaciarColaWorker() {
    if (this._timerFlush !== null) {
      clearTimeout(this._timerFlush);
      this._timerFlush = null;
    }
    if (this._colaWorker.length === 0) return;
    const lote = this._colaWorker.splice(0, this._colaWorker.length);

    if (this._worker) {
      this._worker.postMessage({ tipo: "LOTE_EVENTOS", lote });
    } else if (this._procesadorLocal) {
      this._procesadorLocal.procesarLote(lote);
      this.emit(EVENTOS.TELEMETRIA_TICK, this._procesadorLocal.generarSnapshot());
    }
  }

  detenerPuenteWorker() {
    if (this._timerFlush !== null) {
      clearTimeout(this._timerFlush);
      this._timerFlush = null;
    }
    for (const off of this._desuscripcionesPuente) off();
    this._desuscripcionesPuente.length = 0;
    this._colaWorker.length = 0;
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
    this._procesadorLocal = null;
  }

  clear() {
    this.detenerPuenteWorker();
    this._suscriptores.clear();
  }
}

export const eventBus = new EventBus();
