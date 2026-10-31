// src/core/physics/conveyorPhysics.js
// Motor físico continuo + eventos discretos de la línea industrial en Vanilla JS puro (ES6).
// Integra:
//  - Resolución de colisiones cilíndricas 2D sobre banda mediante Spatial Hashing O(N) sin glitches.
//  - ROI Gating ("SIN_OBJETO" / "OBJETO_EN_ROI", Bautista & Morales, 2026).
//  - Cola FIFO desacoplada entre zona de sensado y actuador mecánico/neumático (Jordán Gamito, 2020).
//  - Emisión de telemetría por Pub/Sub Event Bus (de Prada et al., 2022) sin tocar DOM ni Babylon.js.

import { EVENTOS } from "../bus/eventBus.js";
import { ItemSpawner } from "../spawner/itemSpawner.js";

export const ESTACIONES = Object.freeze([
  {
    id: "separador",
    nombre: "Separador Foucault (Al)",
    material: "aluminio",
    eventoSensor: EVENTOS.SENSOR_ALUMINIO,
    xSensor: -0.95,
    xActuador: -0.42,
    roiAncho: 0.28,
    contenedor: { x: -0.3, z: -1.3 },
  },
  {
    id: "escaner",
    nombre: "Escáner NIR + Aire (PET)",
    material: "plastico",
    eventoSensor: EVENTOS.SENSOR_PLASTICO,
    xSensor: 1.05,
    xActuador: 1.55,
    roiAncho: 0.28,
    contenedor: { x: 1.7, z: -1.3 },
  },
  {
    id: "desviador",
    nombre: "Desviador Óptico (Vidrio)",
    material: "vidrio",
    eventoSensor: EVENTOS.SENSOR_VIDRIO,
    xSensor: 2.72,
    xActuador: 3.05,
    roiAncho: 0.28,
    contenedor: { x: 3.5, z: -1.3 },
  },
]);

const X_FIN_BANDA = 3.98;
const SEMIANCHO_UTIL_Z = 0.235;
const DURACION_VUELO_SEG = 0.72;
const ALTURA_CAIDA_CONTENEDOR = 0.34;
const TAM_CELDA_HASH = 0.16;

export class ConveyorSimulation {
  /**
   * @param {object} cfg configuración fusionada de materiales y línea
   * @param {{ bus?: import("../bus/eventBus.js").EventBus, rng?: () => number }} [opciones]
   */
  constructor(cfg, opciones = {}) {
    this.cfg = cfg;
    this.bus = opciones.bus ?? null;
    this.rng = opciones.rng ?? Math.random;
    this.spawner = new ItemSpawner(cfg, this.rng);
    this._celdas = new Map();
    this.reiniciar();
  }

  reiniciar() {
    this.tiempo = 0;
    this.items = [];
    this.spawner.reiniciar();
    this.velocidadBanda = this.cfg.linea.velocidadBandaMps;
    this.intervaloEntrada = this.cfg.linea.intervaloEntradaSeg;
    this.energiaAcumuladaKwh = 0;

    this.estaciones = Object.fromEntries(
      ESTACIONES.map((e) => [
        e.id,
        {
          roiOcupado: false,
          sensorActivoHasta: -1,
          actuadorActivoHasta: -1,
          ultimoResultado: "SIN_OBJETO",
          colaFifo: [],
          detecciones: 0,
          expulsiones: 0,
          fallos: 0,
        },
      ]),
    );

    const tipos = Object.keys(this.cfg.materiales);
    const ceros = () => Object.fromEntries(tipos.map((t) => [t, 0]));
    this.metricas = {
      ingresadas: 0,
      clasificadas: ceros(),
      rechazadas: ceros(),
      masaRecuperadaKg: ceros(),
      masaMermaKg: ceros(),
      colisionesResueltas: 0,
    };
  }

  fijarFlujoPorMinuto(piezasPorMinuto) {
    const max = this.cfg.linea.maxPiezasPorMinuto ?? 240;
    const pzm = Math.max(10, Math.min(max, Number(piezasPorMinuto) || 60));
    this.intervaloEntrada = 60 / pzm;
    return pzm;
  }

  /**
   * Avanza la física continua y la lógica discreta usando sub-pasos fijos para estabilidad numérica.
   * @param {number} dt segundos simulados
   * @param {number} [potenciaKw] potencia instantánea activa para integrar energía (kWh)
   */
  actualizar(dt, potenciaKw = 15.2) {
    if (dt <= 0) return;
    const maxPaso = 1 / 120; // 120 Hz internos: cero túneles ni glitches a alta densidad
    const nPasos = Math.max(1, Math.ceil(dt / maxPaso));
    const subDt = dt / nPasos;

    for (let s = 0; s < nPasos; s++) {
      this._pasoInterno(subDt, potenciaKw);
    }
  }

  _pasoInterno(dt, potenciaKw) {
    this.tiempo += dt;
    this.energiaAcumuladaKwh += (potenciaKw * dt) / 3600;

    const nuevos = this.spawner.actualizar(dt, this.intervaloEntrada, this.items);
    for (const it of nuevos) {
      this.metricas.ingresadas++;
      this.bus?.emit(EVENTOS.ITEM_INGRESADO, {
        itemId: it.id,
        material: it.tipo,
        t: this.tiempo,
      });
    }

    // 1. Tracción viscosa de la banda y avance cinemático
    const kTraccion = Math.min(1, dt * 14);
    for (const it of this.items) {
      if (it.estado === "banda") {
        it.vx += (this.velocidadBanda - it.vx) * kTraccion;
        it.vz *= Math.max(0, 1 - dt * 9);
        it.x += it.vx * dt;
        it.z += it.vz * dt;
        it.giro += it.velGiro * dt * 0.35;
      } else if (it.estado === "expulsado" || it.estado === "rechazo") {
        this._avanzarVuelo(it, dt);
      }
    }

    // 2. Resolución espacial O(N) de colisiones cuerpo a cuerpo y rieles laterales
    this._resolverColisionesBanda();

    // 3. Evaluación de ROI, sensores y colas FIFO de actuadores
    this._evaluarSensoresYActuadores();

    // 4. Purga limpia de piezas que ya aterrizaron en contenedor o tolva de rechazo
    if (this.items.some((i) => i.estado === "fin")) {
      this.items = this.items.filter((i) => i.estado !== "fin");
    }
  }

  _resolverColisionesBanda() {
    this._celdas.clear();
    const enBanda = [];

    for (const it of this.items) {
      if (it.estado !== "banda") continue;
      // Contención elástica contra los rieles guía laterales de la banda
      const limZ = SEMIANCHO_UTIL_Z - it.radioM;
      if (it.z > limZ) {
        it.z = limZ;
        it.vz = -Math.abs(it.vz) * it.restitucion;
      } else if (it.z < -limZ) {
        it.z = -limZ;
        it.vz = Math.abs(it.vz) * it.restitucion;
      }

      const cx = Math.floor(it.x / TAM_CELDA_HASH);
      let lista = this._celdas.get(cx);
      if (!lista) {
        lista = [];
        this._celdas.set(cx, lista);
      }
      lista.push(it);
      enBanda.push(it);
    }

    // 2 iteraciones Gauss-Seidel sobre celdas vecinas para impedir cualquier solapamiento
    for (let iter = 0; iter < 2; iter++) {
      for (const a of enBanda) {
        const cx = Math.floor(a.x / TAM_CELDA_HASH);
        for (let dxCelda = -1; dxCelda <= 1; dxCelda++) {
          const vecinos = this._celdas.get(cx + dxCelda);
          if (!vecinos) continue;
          for (const b of vecinos) {
            if (b.id <= a.id) continue;
            const dx = b.x - a.x;
            const dz = b.z - a.z;
            const distMin = a.radioM + b.radioM + 0.006;
            const dist2 = dx * dx + dz * dz;
            if (dist2 >= distMin * distMin) continue;

            const dist = Math.sqrt(dist2) || 0.0001;
            const nx = dx / dist;
            const nz = dz / dist;
            const penetracion = distMin - dist;

            // Separación posicional ponderada por masa inversa
            const invMa = 1 / a.masaKg;
            const invMb = 1 / b.masaKg;
            const invSuma = invMa + invMb;
            a.x -= nx * penetracion * (invMa / invSuma);
            a.z -= nz * penetracion * (invMa / invSuma);
            b.x += nx * penetracion * (invMb / invSuma);
            b.z += nz * penetracion * (invMb / invSuma);

            // Re-clamp inmediato contra rieles guía tras la corrección
            const limA = SEMIANCHO_UTIL_Z - a.radioM;
            const limB = SEMIANCHO_UTIL_Z - b.radioM;
            a.z = Math.max(-limA, Math.min(limA, a.z));
            b.z = Math.max(-limB, Math.min(limB, b.z));

            // Impulso elástico amortiguado en velocidades relativas
            const rvx = b.vx - a.vx;
            const rvz = b.vz - a.vz;
            const velNormal = rvx * nx + rvz * nz;
            if (velNormal < 0) {
              const e = Math.min(a.restitucion, b.restitucion);
              const j = (-(1 + e) * velNormal) / invSuma;
              a.vx -= j * nx * invMa;
              a.vz -= j * nz * invMa;
              b.vx += j * nx * invMb;
              b.vz += j * nz * invMb;
            }
            if (iter === 0) this.metricas.colisionesResueltas++;
          }
        }
      }
    }
  }

  _evaluarSensoresYActuadores() {
    for (const est of ESTACIONES) {
      const estadoEst = this.estaciones[est.id];
      let hayObjetoEnRoi = false;

      for (const it of this.items) {
        if (it.estado !== "banda") continue;

        // Ventana ROI con Gating (evita disparos en vacío)
        if (Math.abs(it.x - est.xSensor) <= est.roiAncho * 0.5) {
          hayObjetoEnRoi = true;
        }

        // Flanco de cruce por el sensor 3D
        if (!it.sensadas.has(est.id) && it.x >= est.xSensor) {
          it.sensadas.add(est.id);
          if (it.tipo === est.material) {
            const precisionBase = this.cfg.materiales[it.tipo].precisionSeparador;
            const confianza = +(0.82 + this.rng() * 0.17).toFixed(2);
            const detectado = this.rng() < precisionBase;
            estadoEst.sensorActivoHasta = this.tiempo + 0.35;

            if (detectado) {
              estadoEst.detecciones++;
              estadoEst.ultimoResultado = est.material.toUpperCase();
              estadoEst.colaFifo.push(it.id);
            } else {
              estadoEst.fallos++;
              estadoEst.ultimoResultado = "NO_CLASIFICADO";
            }

            const eventoPayload = {
              estacion: est.id,
              nombreEstacion: est.nombre,
              material: it.tipo,
              itemId: it.id,
              detectado,
              confianza,
              colaFifoLen: estadoEst.colaFifo.length,
              t: this.tiempo,
            };
            this.bus?.emit(EVENTOS.SENSOR_DETECCION, eventoPayload);
            if (detectado) this.bus?.emit(est.eventoSensor, eventoPayload);
          }
        }

        // Llegada a la línea de acción del actuador (desencolado FIFO)
        if (!it.actuadas.has(est.id) && it.x >= est.xActuador) {
          it.actuadas.add(est.id);
          const idxCola = estadoEst.colaFifo.indexOf(it.id);
          if (idxCola !== -1) {
            estadoEst.colaFifo.splice(idxCola, 1);
            estadoEst.actuadorActivoHasta = this.tiempo + 0.48;
            estadoEst.expulsiones++;

            it.estado = "expulsado";
            it.progreso = 0;
            it.desde = { x: it.x, y: it.y, z: it.z };
            it.destino = {
              x: est.contenedor.x + (this.rng() - 0.5) * 0.36,
              y: ALTURA_CAIDA_CONTENEDOR,
              z: est.contenedor.z + (this.rng() - 0.5) * 0.28,
            };
            it.destinoId = est.id;

            this.bus?.emit(EVENTOS.ACTUADOR_DISPARO, {
              estacion: est.id,
              material: it.tipo,
              itemId: it.id,
              t: this.tiempo,
            });
          }
        }
      }

      if (estadoEst.roiOcupado !== hayObjetoEnRoi) {
        estadoEst.roiOcupado = hayObjetoEnRoi;
        if (!hayObjetoEnRoi && estadoEst.sensorActivoHasta < this.tiempo) {
          estadoEst.ultimoResultado = "SIN_OBJETO";
        }
        this.bus?.emit(EVENTOS.SENSOR_ROI_ESTADO, {
          estacion: est.id,
          ocupado: hayObjetoEnRoi,
          estadoGating: hayObjetoEnRoi ? "OBJETO_EN_ROI" : "SIN_OBJETO",
          t: this.tiempo,
        });
      }
    }

    // Extremo final de la banda -> caída por gravedad a merma/rechazo
    for (const it of this.items) {
      if (it.estado === "banda" && it.x >= X_FIN_BANDA) {
        it.estado = "rechazo";
        it.progreso = 0;
        it.desde = { x: it.x, y: it.y, z: it.z };
        it.destino = { x: it.x + 0.38, y: 0.06, z: it.z };
        it.destinoId = null;
      }
    }
  }

  _avanzarVuelo(it, dt) {
    it.progreso += dt / DURACION_VUELO_SEG;
    const p = Math.min(1, it.progreso);
    it.x = it.desde.x + (it.destino.x - it.desde.x) * p;
    it.z = it.desde.z + (it.destino.z - it.desde.z) * p;
    const arcoParabola = it.estado === "expulsado" ? 0.28 * Math.sin(Math.PI * p) : 0;
    it.y = it.desde.y + (it.destino.y - it.desde.y) * p * p + arcoParabola;
    it.giro += dt * 5.8;

    if (it.progreso < 1) return;
    it.estado = "fin";

    if (it.destinoId) {
      this.metricas.clasificadas[it.tipo]++;
      this.metricas.masaRecuperadaKg[it.tipo] += it.masaKg;
      this.bus?.emit(EVENTOS.ITEM_CLASIFICADO, {
        itemId: it.id,
        material: it.tipo,
        estacion: it.destinoId,
        masaKg: it.masaKg,
        xFinal: it.destino.x,
        zFinal: it.destino.z,
        t: this.tiempo,
      });
    } else {
      this.metricas.rechazadas[it.tipo]++;
      this.metricas.masaMermaKg[it.tipo] += it.masaKg;
      this.bus?.emit(EVENTOS.ITEM_RECHAZADO, {
        itemId: it.id,
        material: it.tipo,
        masaKg: it.masaKg,
        t: this.tiempo,
      });
    }
  }

  /** Verifica que ningún par de objetos en la banda viole la distancia mínima de no-interpenetración. */
  contarSuperposicionesCriticas() {
    const enBanda = this.items.filter((i) => i.estado === "banda");
    let solapamientos = 0;
    for (let i = 0; i < enBanda.length; i++) {
      for (let j = i + 1; j < enBanda.length; j++) {
        const a = enBanda[i];
        const b = enBanda[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const minPermitido = (a.radioM + b.radioM) * 0.85;
        if (dx * dx + dz * dz < minPermitido * minPermitido) solapamientos++;
      }
    }
    return solapamientos;
  }

  resumen(potenciaActivaKw = 0) {
    const sumar = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
    const clasificadas = sumar(this.metricas.clasificadas);
    const rechazadas = sumar(this.metricas.rechazadas);
    const procesadas = clasificadas + rechazadas;
    const masaRecuperadaKg = sumar(this.metricas.masaRecuperadaKg);
    const masaMermaKg = sumar(this.metricas.masaMermaKg);

    return {
      tiempo: this.tiempo,
      ingresadas: this.metricas.ingresadas,
      enTransito: this.items.length,
      procesadas,
      clasificadas,
      rechazadas,
      purezaPct: procesadas > 0 ? (clasificadas / procesadas) * 100 : 0,
      masaRecuperadaKg,
      masaMermaKg,
      porMinuto: this.tiempo > 0 ? (procesadas / this.tiempo) * 60 : 0,
      porHora: this.tiempo > 0 ? (procesadas / this.tiempo) * 3600 : 0,
      potenciaKw: potenciaActivaKw,
      energiaKwh: this.energiaAcumuladaKwh,
      whPorKg: masaRecuperadaKg > 0 ? (this.energiaAcumuladaKwh * 1000) / masaRecuperadaKg : 0,
      colisionesResueltas: this.metricas.colisionesResueltas,
      clasificadasPorTipo: { ...this.metricas.clasificadas },
      rechazadasPorTipo: { ...this.metricas.rechazadas },
    };
  }
}
