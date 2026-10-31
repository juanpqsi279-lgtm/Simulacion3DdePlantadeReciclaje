// src/core/state/plantStateMachine.js
// Máquina de Estados Finita (FSM) en Vanilla JS para gestionar el ciclo de vida de la planta:
// Estados de ensamblaje progresivo (FASE_0 .. FASE_6) y estados operativos (PAUSADO, OPERANDO).

import { EVENTOS } from "../bus/eventBus.js";

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
    this.faseEnsamblada = 0; // 0..6
    this._temporizadorAuto = null;
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

  potenciaInstaladaKw() {
    return this.pasos
      .slice(0, this.faseEnsamblada)
      .reduce((acc, p) => acc + p.potenciaKw, 0);
  }

  potenciaActivaKw() {
    if (this.operando) return this.potenciaInstaladaKw();
    // Consumo base de sensores/PLC en espera (standby) cuando hay equipos montados
    return this.faseEnsamblada > 0 ? Math.min(0.45, this.potenciaInstaladaKw() * 0.08) : 0;
  }

  minutosAcumulados() {
    return this.pasos
      .slice(0, this.faseEnsamblada)
      .reduce((acc, p) => acc + p.tiempoEstimadoMin, 0);
  }

  estaInstalado(pasoId) {
    return this.pasos.slice(0, this.faseEnsamblada).some((p) => p.id === pasoId);
  }

  idsVisibles() {
    return this.pasos.slice(0, this.faseEnsamblada).map((p) => p.id);
  }

  /**
   * Transiciona a una fase específica de ensamblaje (0 a 6).
   * Si estaba OPERANDO y se reduce la fase por debajo de 6, detiene automáticamente la operación.
   * @param {number} nuevaFase entero entre 0 y 6
   */
  irAFase(nuevaFase) {
    const destino = Math.max(0, Math.min(this.totalFases, Math.trunc(nuevaFase)));
    const estadoAnterior = this.estado;
    const faseAnterior = this.faseEnsamblada;

    this.faseEnsamblada = destino;
    this.estado = ESTADOS_PLANTA[`FASE_${destino}`];

    if (estadoAnterior === this.estado && faseAnterior === destino) {
      return this.snapshot(estadoAnterior);
    }
    return this._publicar(estadoAnterior);
  }

  /** Avanza un paso en la secuencia de ensamblaje (Fase N -> Fase N+1). */
  siguientePaso() {
    if (this.ensamblajeCompleto) return null;
    return this.irAFase(this.faseEnsamblada + 1);
  }

  /** Ejecuta secuencialmente los pasos restantes de ensamblaje con intervalo suave. */
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

  /** Inicia la operación continua de la planta (solo permitido desde FASE_6 o PAUSADO). */
  iniciar() {
    if (!this.ensamblajeCompleto) {
      return null;
    }
    if (this.estado === ESTADOS_PLANTA.OPERANDO) return this.snapshot(this.estado);
    const estadoAnterior = this.estado;
    this.estado = ESTADOS_PLANTA.OPERANDO;
    return this._publicar(estadoAnterior);
  }

  /** Pausa la línea industrial manteniendo los 6 módulos ensamblados. */
  pausar() {
    if (!this.ensamblajeCompleto) return null;
    if (this.estado === ESTADOS_PLANTA.PAUSADO) return this.snapshot(this.estado);
    const estadoAnterior = this.estado;
    this.estado = ESTADOS_PLANTA.PAUSADO;
    return this._publicar(estadoAnterior);
  }

  alternarOperacion() {
    if (!this.ensamblajeCompleto) return null;
    return this.operando ? this.pausar() : this.iniciar();
  }

  snapshot(estadoAnterior = this.estado) {
    return {
      estadoAnterior,
      estado: this.estado,
      fase: this.faseEnsamblada,
      totalFases: this.totalFases,
      progreso: this.progreso,
      ensamblajeCompleto: this.ensamblajeCompleto,
      operando: this.operando,
      idsVisibles: this.idsVisibles(),
      pasoActual: this.faseEnsamblada > 0 ? this.pasos[this.faseEnsamblada - 1] : null,
      siguientePaso: this.ensamblajeCompleto ? null : this.pasos[this.faseEnsamblada],
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
