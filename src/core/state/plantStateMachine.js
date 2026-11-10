// src/core/state/plantStateMachine.js
// Máquina de Estados Finita (FSM) en Vanilla JS para gestionar el ciclo de vida de la planta:
// Estados de ensamblaje (FASE_0 .. FASE_6 = cantidad de módulos montados) y estados operativos (PAUSADO, OPERANDO).
// El montaje es LIBRE: cualquier módulo puede colocarse o retirarse en cualquier orden y moverse a cualquier
// posición. Las reglas de validación (reglasMontaje.js) solo emiten avisos, nunca bloquean la acción.

import { EVENTOS } from "../bus/eventBus.js";
import { evaluarMontaje, capacidadOperativa } from "../assembly/reglasMontaje.js";

export const ESTADOS_PLANTA = Object.freeze({
  FASE_0: "FASE_0",
  FASE_1: "FASE_1",
  FASE_2: "FASE_2",
  FASE_3: "FASE_3",
  FASE_4: "FASE_4",
  FASE_5: "FASE_5",
  FASE_6: "FASE_6",
  PAUSADO: "PAUSADO",
  OPERANDO: "OPERANDO",
});

export class PlantStateMachine {
  /**
   * @param {{ pasos: Array<{id: string, titulo: string, detalle: string, icono: string, tiempoEstimadoMin: number, potenciaKw: number}> }} datosEnsamblaje
   * @param {import("../bus/eventBus.js").EventBus} bus
   */
  constructor(datosEnsamblaje, bus) {
    if (!datosEnsamblaje?.pasos || datosEnsamblaje.pasos.length !== 6) {
      throw new Error("PlantStateMachine requiere exactamente 6 pasos de ensamblaje.");
    }
    this.pasos = datosEnsamblaje.pasos;
    this.bus = bus;
    this.estado = ESTADOS_PLANTA.FASE_0;
    /** @type {Set<string>} módulos actualmente montados (en cualquier orden) */
    this.instalados = new Set();
    /** @type {Record<string, {dx: number, dz: number}>} desplazamiento respecto a la posición nominal */
    this.posiciones = {};
    this.ultimoColocado = null;
    this._temporizadorAuto = null;
  }

  get faseEnsamblada() {
    return this.instalados.size;
  }

  get totalFases() {
    return this.pasos.length;
  }

  get ensamblajeCompleto() {
    return this.faseEnsamblada >= this.totalFases;
  }

  get operando() {
    return this.estado === ESTADOS_PLANTA.OPERANDO;
  }

  get progreso() {
    return this.faseEnsamblada / this.totalFases;
  }

  _pasosInstalados() {
    return this.pasos.filter((p) => this.instalados.has(p.id));
  }

  potenciaInstaladaKw() {
    return this._pasosInstalados().reduce((acc, p) => acc + p.potenciaKw, 0);
  }

  potenciaActivaKw() {
    if (this.operando) return this.potenciaInstaladaKw();
    // Consumo base de sensores/PLC en espera (standby) cuando hay equipos montados
    return this.faseEnsamblada > 0 ? Math.min(0.45, this.potenciaInstaladaKw() * 0.08) : 0;
  }

  minutosAcumulados() {
    return this._pasosInstalados().reduce((acc, p) => acc + p.tiempoEstimadoMin, 0);
  }

  estaInstalado(pasoId) {
    return this.instalados.has(pasoId);
  }

  idsVisibles() {
    return this._pasosInstalados().map((p) => p.id);
  }

  /** Qué partes de la línea pueden procesar material con el montaje actual (consumido por main.js). */
  capacidad() {
    return capacidadOperativa({ instalados: this.instalados, posiciones: this.posiciones });
  }

  /** Avisos de validación del montaje actual (no bloqueantes). */
  avisos() {
    return evaluarMontaje({
      instalados: this.instalados,
      orden: this.pasos.map((p) => p.id),
      posiciones: this.posiciones,
      operando: this.operando,
    });
  }

  /** Recalcula el estado: conserva OPERANDO/PAUSADO elegidos por el usuario mientras haya piezas montadas. */
  _recalcularEstado() {
    const operativo = this.estado === ESTADOS_PLANTA.OPERANDO || this.estado === ESTADOS_PLANTA.PAUSADO;
    if (operativo && this.faseEnsamblada > 0) return;
    this.estado = ESTADOS_PLANTA[`FASE_${this.faseEnsamblada}`];
  }

  /** Coloca un módulo en cualquier momento. `pos` opcional: desplazamiento respecto a su posición nominal. */
  colocar(id, pos = null) {
    if (!this.pasos.some((p) => p.id === id)) return null;
    const estadoAnterior = this.estado;
    this.instalados.add(id);
    this.ultimoColocado = id;
    this.posiciones[id] = pos ? { dx: pos.dx ?? 0, dz: pos.dz ?? 0 } : (this.posiciones[id] ?? { dx: 0, dz: 0 });
    this._recalcularEstado();
    return this._publicar(estadoAnterior);
  }

  /** Retira un módulo; la planta queda en el estado que el usuario eligió (aunque no opere bien). */
  quitar(id) {
    if (!this.instalados.has(id)) return null;
    const estadoAnterior = this.estado;
    this.instalados.delete(id);
    delete this.posiciones[id];
    if (this.ultimoColocado === id) this.ultimoColocado = null;
    this._recalcularEstado();
    return this._publicar(estadoAnterior);
  }

  alternarModulo(id) {
    return this.instalados.has(id) ? this.quitar(id) : this.colocar(id);
  }

  /** Mueve un módulo ya montado a un desplazamiento (dx, dz) respecto a su posición nominal. */
  mover(id, dx, dz) {
    if (!this.instalados.has(id)) return null;
    this.posiciones[id] = { dx, dz };
    return this._publicar(this.estado);
  }

  /**
   * Utilidad de pruebas: monta los primeros N módulos en el orden de la lista (FASE_N) en posición nominal.
   * Si estaba OPERANDO y se reduce la fase, detiene la operación.
   * @param {number} nuevaFase entero entre 0 y 6
   */
  irAFase(nuevaFase) {
    const destino = Math.max(0, Math.min(this.totalFases, Math.trunc(nuevaFase)));
    const estadoAnterior = this.estado;
    const faseAnterior = this.faseEnsamblada;

    this.instalados = new Set(this.pasos.slice(0, destino).map((p) => p.id));
    this.posiciones = {};
    this.estado = ESTADOS_PLANTA[`FASE_${destino}`];

    if (estadoAnterior === this.estado && faseAnterior === destino) {
      return this.snapshot(estadoAnterior);
    }
    return this._publicar(estadoAnterior);
  }

  /** Avanza un paso en la secuencia sugerida (utilidad de pruebas / API; la UI ya no la expone). */
  siguientePaso() {
    if (this.ensamblajeCompleto) return null;
    const siguiente = this.pasos.find((p) => !this.instalados.has(p.id));
    return this.colocar(siguiente.id);
  }

  /** Ejecuta secuencialmente los pasos restantes de ensamblaje con intervalo suave (solo API). */
  ensamblarProgresivo(intervaloMs = 380) {
    this.cancelarAutoEnsamblaje();
    if (this.ensamblajeCompleto) return;
    const avanzarUno = () => {
      if (this.ensamblajeCompleto) {
        this._temporizadorAuto = null;
        return;
      }
      this.siguientePaso();
      if (!this.ensamblajeCompleto) {
        this._temporizadorAuto = setTimeout(avanzarUno, intervaloMs);
      } else {
        this._temporizadorAuto = null;
      }
    };
    avanzarUno();
  }

  cancelarAutoEnsamblaje() {
    if (this._temporizadorAuto !== null) {
      clearTimeout(this._temporizadorAuto);
      this._temporizadorAuto = null;
    }
  }

  /** Desmonta toda la planta regresando al estado inicial FASE_0. */
  desmontar() {
    this.cancelarAutoEnsamblaje();
    return this.irAFase(0);
  }

  /** Inicia la operación continua. Se permite con cualquier montaje (>0 piezas); los avisos explican las carencias. */
  iniciar() {
    if (this.faseEnsamblada === 0) {
      return null;
    }
    if (this.estado === ESTADOS_PLANTA.OPERANDO) return this.snapshot(this.estado);
    const estadoAnterior = this.estado;
    this.estado = ESTADOS_PLANTA.OPERANDO;
    return this._publicar(estadoAnterior);
  }

  /** Pausa la línea manteniendo los módulos montados. */
  pausar() {
    if (this.faseEnsamblada === 0) return null;
    if (this.estado === ESTADOS_PLANTA.PAUSADO) return this.snapshot(this.estado);
    const estadoAnterior = this.estado;
    this.estado = ESTADOS_PLANTA.PAUSADO;
    return this._publicar(estadoAnterior);
  }

  alternarOperacion() {
    if (this.faseEnsamblada === 0) return null;
    return this.operando ? this.pausar() : this.iniciar();
  }

  snapshot(estadoAnterior = this.estado) {
    const siguiente = this.pasos.find((p) => !this.instalados.has(p.id)) ?? null;
    const ultimo = this.ultimoColocado ? this.pasos.find((p) => p.id === this.ultimoColocado) : null;
    return {
      estadoAnterior,
      estado: this.estado,
      fase: this.faseEnsamblada,
      totalFases: this.totalFases,
      progreso: this.progreso,
      ensamblajeCompleto: this.ensamblajeCompleto,
      operando: this.operando,
      idsVisibles: this.idsVisibles(),
      posiciones: structuredClone(this.posiciones),
      avisos: this.avisos(),
      capacidad: (({ entrada, banda, estaciones }) => ({ entrada, banda, estaciones: [...estaciones] }))(this.capacidad()),
      pasoActual: ultimo ?? null,
      siguientePaso: siguiente,
      potenciaInstaladaKw: this.potenciaInstaladaKw(),
      potenciaActivaKw: this.potenciaActivaKw(),
      minutosAcumulados: this.minutosAcumulados(),
    };
  }

  _publicar(estadoAnterior) {
    const snap = this.snapshot(estadoAnterior);
    this.bus?.emit(EVENTOS.ESTADO_PLANTA, snap);
    return snap;
  }
}
