// src/core/bus/eventBus.js
// Bus de Eventos Pub/Sub ligero en Vanilla JavaScript puro (ES6).
// Actúa como middleware desacoplado entre el motor 3D (Babylon.js), la física discreta/continua,
// el panel analítico (Chart.js) y el controlador DOM (arquitectura de Gemelo Digital, de Prada et al., 2022).

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
  TELEMETRIA_TICK: "telemetria:tick",
  RENDIMIENTO_3D: "rendimiento:fps",
});

export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._suscriptores = new Map();
  }

  /**
   * Suscribe un manejador a un tópico y devuelve una función para cancelar la suscripción.
   * @param {string} evento
   * @param {(payload: any) => void} callback
   * @returns {() => void}
   */
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

  /**
   * Suscribe un manejador que se ejecuta una única vez.
   * @param {string} evento
   * @param {(payload: any) => void} callback
   * @returns {() => void}
   */
  once(evento, callback) {
    const envoltorio = (payload) => {
      this.off(evento, envoltorio);
      callback(payload);
    };
    return this.on(evento, envoltorio);
  }

  /**
   * Elimina un manejador específico de un tópico.
   * @param {string} evento
   * @param {Function} callback
   */
  off(evento, callback) {
    const conjunto = this._suscriptores.get(evento);
    if (!conjunto) return;
    conjunto.delete(callback);
    if (conjunto.size === 0) this._suscriptores.delete(evento);
  }

  /**
   * Publica un evento de forma síncrona y aislada a todos los oyentes suscritos.
   * @param {string} evento
   * @param {any} [payload]
   */
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

  /** Limpia todas las suscripciones (útil en pruebas unitarias o desmontaje). */
  clear() {
    this._suscriptores.clear();
  }
}

export const eventBus = new EventBus();
