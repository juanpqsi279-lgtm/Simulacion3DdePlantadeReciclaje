// src/core/state/plantStateMachine.js
// Máquina de Estados Finita (FSM) en Vanilla JS para gestionar el ciclo de vida de la planta:
// Soporta 9 componentes individuales, inventario personal estilo Roblox, montaje libre en cualquier
// coordenada, parámetros técnicos detallados (velocidad, potencia, RPM, etc.) y laboratorio STEAM.

import { EVENTOS } from "../bus/eventBus.js";
import {
  evaluarMontaje,
  capacidadOperativa,
  CONFIG_SENSORES_DEFAULT,
  PARAMETROS_MAQUINA_SUGERIDOS,
} from "../assembly/reglasMontaje.js";

export const ESTADOS_PLANTA = Object.freeze({
  FASE_0: "FASE_0",
  FASE_1: "FASE_1",
  FASE_2: "FASE_2",
  FASE_3: "FASE_3",
  FASE_4: "FASE_4",
  FASE_5: "FASE_5",
  FASE_6: "FASE_6",
  FASE_7: "FASE_7",
  FASE_8: "FASE_8",
  FASE_9: "FASE_9",
  PAUSADO: "PAUSADO",
  OPERANDO: "OPERANDO",
});

const EQUIVALENTE_CONTENEDORES = ["cont_aluminio", "cont_plastico", "cont_vidrio", "robot_walle"];

export class PlantStateMachine {
  /**
   * @param {{ pasos: Array<{id: string, titulo: string, detalle: string, icono: string, tiempoEstimadoMin: number, potenciaKw: number}> }} datosEnsamblaje
   * @param {import("../bus/eventBus.js").EventBus} bus
   */
  constructor(datosEnsamblaje, bus) {
    if (!datosEnsamblaje?.pasos || datosEnsamblaje.pasos.length < 6) {
      throw new Error("PlantStateMachine requiere al menos 6 pasos de ensamblaje.");
    }
    this.pasos = datosEnsamblaje.pasos;
    this.bus = bus;
    this.estado = ESTADOS_PLANTA.FASE_0;
    /** @type {Set<string>} componentes montados actualmente en la planta */
    this.instalados = new Set();
    /** @type {Set<string>} componentes recogidos dentro del inventario del jugador */
    this.inventario = new Set();
    /** @type {Set<string>} componentes firmemente atornillados al piso o estructura */
    this.atornillados = new Set();
    /** @type {Record<string, {dx: number, dz: number}>} desplazamiento respecto a la posición nominal */
    this.posiciones = {};
    /** Configuración de función interna y flujo de aire de cada estación sensorial */
    this.sensores = structuredClone(CONFIG_SENSORES_DEFAULT);
    /** Parámetros técnicos detallados por componente (velocidad de banda, potencia tolva, etc.) */
    this.parametrosMaquina = structuredClone(PARAMETROS_MAQUINA_SUGERIDOS);
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
    return this._pasosInstalados().reduce((acc, p) => {
      if (p.id === "banda") return acc + (this.parametrosMaquina.banda?.potenciaMotorKw ?? p.potenciaKw);
      if (p.id === "tolva") return acc + (this.parametrosMaquina.tolva?.potenciaVibradorKw ?? p.potenciaKw);
      return acc + p.potenciaKw;
    }, 0);
  }

  potenciaActivaKw() {
    if (this.operando) return this.potenciaInstaladaKw();
    return this.faseEnsamblada > 0 ? Math.min(0.45, this.potenciaInstaladaKw() * 0.08) : 0;
  }

  minutosAcumulados() {
    return this._pasosInstalados().reduce((acc, p) => acc + p.tiempoEstimadoMin, 0);
  }

  estaInstalado(pasoId) {
    return this.instalados.has(pasoId);
  }

  estaEnInventario(pasoId) {
    return this.inventario.has(pasoId);
  }

  estaAtornillado(pasoId) {
    return this.atornillados.has(pasoId);
  }

  idsVisibles() {
    return this._pasosInstalados().map((p) => p.id);
  }

  /** Qué partes de la línea están en posición nominal (para compatibilidad de pruebas). */
  capacidad() {
    return capacidadOperativa({ instalados: this.instalados, posiciones: this.posiciones });
  }

  /** Avisos de validación del montaje y calibración actual (nunca bloquean). */
  avisos() {
    return evaluarMontaje({
      instalados: this.instalados,
      orden: this.pasos.map((p) => p.id),
      posiciones: this.posiciones,
      operando: this.operando,
      sensores: this.sensores,
      parametrosMaquina: this.parametrosMaquina,
      atornillados: this.atornillados,
    });
  }

  configurarSensor(estacionId, parcial) {
    if (!this.sensores[estacionId] || !parcial) return null;
    this.sensores[estacionId] = { ...this.sensores[estacionId], ...parcial };
    return this._publicar(this.estado);
  }

  configurarParametroMaquina(moduloId, parcial) {
    if (!this.parametrosMaquina[moduloId] || !parcial) return null;
    this.parametrosMaquina[moduloId] = { ...this.parametrosMaquina[moduloId], ...parcial };
    return this._publicar(this.estado);
  }

  restaurarSensoresOptimos() {
    this.sensores = structuredClone(CONFIG_SENSORES_DEFAULT);
    return this._publicar(this.estado);
  }

  restaurarParametrosSugeridos() {
    this.parametrosMaquina = structuredClone(PARAMETROS_MAQUINA_SUGERIDOS);
    this.sensores = structuredClone(CONFIG_SENSORES_DEFAULT);
    return this._publicar(this.estado);
  }

  /** Modo Reto STEAM: devuelve todo a la esquina y descalibra sensores + parámetros técnicos. */
  activarRetoSteam() {
    this.cancelarAutoEnsamblaje();
    const estadoAnterior = this.estado;
    this.instalados.clear();
    this.inventario.clear();
    this.atornillados.clear();
    this.posiciones = {};
    this.ultimoColocado = null;
    this.estado = ESTADOS_PLANTA.FASE_0;
    this.sensores = {
      separador: { transductor: "optico", condicion: "absorcion_nir", sincronizacion: "inmediato_sin_memoria", flujoAireLpm: 45 },
      escaner: { transductor: "foucault", condicion: "refraccion_alta", sincronizacion: "inmediato_sin_memoria", flujoAireLpm: 240 },
      desviador: { transductor: "nir", condicion: "conductividad_alta", sincronizacion: "inmediato_sin_memoria", flujoAireLpm: 130 },
    };
    this.parametrosMaquina = {
      banda: { velocidadBandaMps: 1.4, tensionRodillosPct: 55, potenciaMotorKw: 1.6 },
      tolva: { potenciaVibradorKw: 0.2, aperturaCompuertaPct: 90 },
      separador: { rpmTambor: 1150 },
      escaner: { longitudOndaNm: 1320 },
      desviador: { sensibilidadOpticaPct: 45 },
      cont_aluminio: { torqueAnclajeNm: 40 },
      cont_plastico: { torqueAnclajeNm: 40 },
      cont_vidrio: { torqueAnclajeNm: 40 },
      robot_walle: { velocidadMps: 2.0, potenciaBrazoW: 120 },
    };
    return this._publicar(estadoAnterior);
  }

  _recalcularEstado() {
    const operativo = this.estado === ESTADOS_PLANTA.OPERANDO || this.estado === ESTADOS_PLANTA.PAUSADO;
    if (operativo) return;
    this.estado = ESTADOS_PLANTA[`FASE_${this.faseEnsamblada}`] ?? `FASE_${this.faseEnsamblada}`;
  }

  /** Coloca un componente en la planta (sacándolo del inventario si estaba ahí y dejándolo sin atornillar). */
  colocar(id, pos = null) {
    if (id === "contenedores" && !this.pasos.some((p) => p.id === "contenedores")) {
      const estadoAnterior = this.estado;
      for (const subId of EQUIVALENTE_CONTENEDORES) {
        if (this.pasos.some((p) => p.id === subId)) {
          this.inventario.delete(subId);
          this.instalados.add(subId);
          this.atornillados.delete(subId);
          this.posiciones[subId] = pos ? { dx: pos.dx ?? 0, dz: pos.dz ?? 0 } : (this.posiciones[subId] ?? { dx: 0, dz: 0 });
        }
      }
      this.ultimoColocado = "robot_walle";
      this._recalcularEstado();
      return this._publicar(estadoAnterior);
    }
    if (!this.pasos.some((p) => p.id === id)) return null;
    const estadoAnterior = this.estado;
    this.inventario.delete(id);
    this.instalados.add(id);
    this.atornillados.delete(id);
    this.ultimoColocado = id;
    this.posiciones[id] = pos ? { dx: pos.dx ?? 0, dz: pos.dz ?? 0 } : (this.posiciones[id] ?? { dx: 0, dz: 0 });
    this._recalcularEstado();
    return this._publicar(estadoAnterior);
  }

  /** Retira un componente de la planta devolviéndolo a la esquina de almacén. */
  quitar(id) {
    if (id === "contenedores" && !this.pasos.some((p) => p.id === "contenedores")) {
      const estadoAnterior = this.estado;
      for (const subId of EQUIVALENTE_CONTENEDORES) {
        this.instalados.delete(subId);
        this.atornillados.delete(subId);
        delete this.posiciones[subId];
      }
      this._recalcularEstado();
      return this._publicar(estadoAnterior);
    }
    if (!this.instalados.has(id)) return null;
    const estadoAnterior = this.estado;
    this.instalados.delete(id);
    this.atornillados.delete(id);
    delete this.posiciones[id];
    if (this.ultimoColocado === id) this.ultimoColocado = null;
    this._recalcularEstado();
    return this._publicar(estadoAnterior);
  }

  /** Atornilla o desatornilla una pieza instalada en planta. */
  atornillar(id, estado = true) {
    if (!this.instalados.has(id)) return null;
    if (estado) this.atornillados.add(id);
    else this.atornillados.delete(id);
    return this._publicar(this.estado);
  }

  atornillarTodas() {
    for (const id of this.instalados) this.atornillados.add(id);
    return this._publicar(this.estado);
  }

  /** Recoge un componente (de la esquina o de la planta) y lo guarda en el inventario personal. */
  recogerAlInventario(id) {
    if (!this.pasos.some((p) => p.id === id)) return null;
    const estadoAnterior = this.estado;
    this.instalados.delete(id);
    this.atornillados.delete(id);
    delete this.posiciones[id];
    if (this.ultimoColocado === id) this.ultimoColocado = null;
    this.inventario.add(id);
    this._recalcularEstado();
    return this._publicar(estadoAnterior);
  }

  /** Devuelve un componente del inventario a la esquina de almacén. */
  sacarDeInventarioAlAlmacen(id) {
    if (!this.inventario.has(id)) return null;
    const estadoAnterior = this.estado;
    this.inventario.delete(id);
    this._recalcularEstado();
    return this._publicar(estadoAnterior);
  }

  /** Recoge al inventario todos los componentes que no estén montados actualmente. */
  recogerTodoAlInventario() {
    const estadoAnterior = this.estado;
    for (const p of this.pasos) {
      if (!this.instalados.has(p.id)) this.inventario.add(p.id);
    }
    return this._publicar(estadoAnterior);
  }

  /** Devuelve todos los componentes (instalados y del inventario) a la esquina de almacén. */
  devolverTodoAlAlmacen() {
    this.cancelarAutoEnsamblaje();
    const estadoAnterior = this.estado;
    this.instalados.clear();
    this.inventario.clear();
    this.atornillados.clear();
    this.posiciones = {};
    this.ultimoColocado = null;
    this.estado = ESTADOS_PLANTA.FASE_0;
    return this._publicar(estadoAnterior);
  }

  alternarModulo(id) {
    return this.instalados.has(id) ? this.quitar(id) : this.colocar(id);
  }

  mover(id, dx, dz) {
    if (!this.instalados.has(id)) return null;
    this.posiciones[id] = { dx, dz };
    this.atornillados.delete(id);
    return this._publicar(this.estado);
  }

  irAFase(nuevaFase) {
    const destino = Math.max(0, Math.min(this.totalFases, Math.trunc(nuevaFase)));
    const estadoAnterior = this.estado;
    const faseAnterior = this.faseEnsamblada;

    this.inventario.clear();
    this.instalados = new Set(this.pasos.slice(0, destino).map((p) => p.id));
    this.atornillados = new Set(this.instalados);
    this.posiciones = {};
    this.estado = ESTADOS_PLANTA[`FASE_${destino}`] ?? `FASE_${destino}`;

    if (estadoAnterior === this.estado && faseAnterior === destino) {
      return this.snapshot(estadoAnterior);
    }
    return this._publicar(estadoAnterior);
  }

  siguientePaso() {
    if (this.ensamblajeCompleto) return null;
    const siguiente = this.pasos.find((p) => !this.instalados.has(p.id));
    return this.colocar(siguiente.id);
  }

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

  desmontar() {
    return this.devolverTodoAlAlmacen();
  }

  /**
   * Inicia la operación continua. Con `forzar = true` (usado por la UI), permite encender aunque
   * falten piezas o estén mal puestas para que el alumno vea por sí mismo el error de montaje.
   */
  iniciar(forzar = false) {
    if (this.faseEnsamblada === 0 && !forzar) {
      return null;
    }
    if (this.estado === ESTADOS_PLANTA.OPERANDO) return this.snapshot(this.estado);
    const estadoAnterior = this.estado;
    this.estado = ESTADOS_PLANTA.OPERANDO;
    return this._publicar(estadoAnterior);
  }

  pausar(forzar = false) {
    if (this.faseEnsamblada === 0 && !forzar) return null;
    if (this.estado === ESTADOS_PLANTA.PAUSADO) return this.snapshot(this.estado);
    const estadoAnterior = this.estado;
    this.estado = ESTADOS_PLANTA.PAUSADO;
    return this._publicar(estadoAnterior);
  }

  alternarOperacion(forzar = false) {
    if (this.faseEnsamblada === 0 && !forzar) return null;
    return this.operando ? this.pausar(forzar) : this.iniciar(forzar);
  }

  snapshot(estadoAnterior = this.estado) {
    const siguiente = this.pasos.find((p) => !this.instalados.has(p.id)) ?? null;
    const ultimo = this.ultimoColocado ? this.pasos.find((p) => p.id === this.ultimoColocado) : null;
    const cap = this.capacidad();
    return {
      estadoAnterior,
      estado: this.estado,
      fase: this.faseEnsamblada,
      totalFases: this.totalFases,
      progreso: this.progreso,
      ensamblajeCompleto: this.ensamblajeCompleto,
      operando: this.operando,
      idsVisibles: this.idsVisibles(),
      inventario: [...this.inventario],
      atornillados: [...this.atornillados],
      posiciones: structuredClone(this.posiciones),
      sensores: structuredClone(this.sensores),
      parametrosMaquina: structuredClone(this.parametrosMaquina),
      avisos: this.avisos(),
      capacidad: {
        entrada: cap.entrada,
        banda: cap.banda,
        estaciones: [...cap.estaciones],
        cestos: [...cap.cestos],
        walle: cap.walle,
      },
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
