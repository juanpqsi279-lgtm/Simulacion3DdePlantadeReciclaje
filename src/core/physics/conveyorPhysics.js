// src/core/physics/conveyorPhysics.js
// Motor físico continuo + eventos discretos de la línea industrial en Vanilla JS puro (ES6).
// Integra:
//  - Resolución de colisiones cilíndricas 2D sobre banda mediante Spatial Hashing O(N) sin glitches.
//  - ROI Gating ("SIN_OBJETO" / "OBJETO_EN_ROI", Bautista & Morales, 2026).
//  - Cola FIFO desacoplada entre zona de sensado y actuador mecánico/neumático (Jordán Gamito, 2020).
//  - Emisión de telemetría por Pub/Sub Event Bus (de Prada et al., 2022) sin tocar DOM ni Babylon.js.

import { EVENTOS } from "../bus/eventBus.js";
import { ItemSpawner } from "../spawner/itemSpawner.js";
import {
  CONFIG_SENSORES_DEFAULT,
  PARAMETROS_MAQUINA_SUGERIDOS,
  POSICION_NOMINAL,
  CESTO_POR_ESTACION,
  evaluarSensorEstacion,
  posicionMundo,
} from "../assembly/reglasMontaje.js";

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
    // Montaje libre: por defecto la línea está completa. main.js las ajusta según los módulos que el usuario montó.
    /** @type {Set<string>|null} ids de estación operativas (null = todas) */
    this.estacionesHabilitadas = null;
    /** Si es false no ingresan piezas nuevas (p. ej. no hay tolva de alimentación). */
    this.entradaHabilitada = true;
    /** Configuración de la lógica interna y flujo de aire (L/min) de cada estación */
    this.configSensores = structuredClone(CONFIG_SENSORES_DEFAULT);
    /** Estado real de montaje (posiciones y parámetros técnicos) cuando opera desde la UI */
    this.montajeReal = null;
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
   * Reintroduce una pieza rescatada por el robot WALL-E en el dispensador/tolva inicial.
   * @param {string} material
   */
  recircularPieza(material) {
    this.spawner.encolarMaterialEspecifico(material);
  }

  /**
   * Actualiza la lógica interna armada y el flujo de aire (L/min) por estación.
   * @param {object} sensores
   */
  fijarConfigSensores(sensores) {
    if (sensores) this.configSensores = structuredClone(sensores);
  }

  /**
   * Sincroniza la simulación física con las posiciones reales y parámetros detallados armados por el usuario.
   * Permite encender la planta aunque esté mal montada para evidenciar físicamente los errores.
   */
  fijarMontajeReal(snap) {
    if (!snap) {
      this.montajeReal = null;
      return;
    }
    this.montajeReal = {
      instalados: new Set(snap.idsVisibles ?? []),
      posiciones: structuredClone(snap.posiciones ?? {}),
      parametrosMaquina: structuredClone(snap.parametrosMaquina ?? PARAMETROS_MAQUINA_SUGERIDOS),
    };
    if (snap.sensores) this.fijarConfigSensores(snap.sensores);
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

    const mr = this.montajeReal;
    let intervaloEfectivo = this.intervaloEntrada;
    let xEntradaReal = this.cfg.linea.xEntrada;
    let zEntradaReal = 0;
    let bandaMontada = true;
    let tolvaMontada = this.entradaHabilitada;
    let tolvaSobreBanda = true;

    if (mr) {
      const pm = mr.parametrosMaquina;
      const velBase = pm?.banda?.velocidadBandaMps ?? this.cfg.linea.velocidadBandaMps;
      const tension = pm?.banda?.tensionRodillosPct ?? 85;
      const potMotor = pm?.banda?.potenciaMotorKw ?? 3.2;
      const factorTension = tension < 65 ? 0.45 + (tension / 65) * 0.45 : 1.0;
      const factorMotor = potMotor < 2.0 ? 0.55 + (potMotor / 2.0) * 0.45 : 1.0;
      this.velocidadBanda = +(velBase * factorTension * factorMotor).toFixed(3);

      const potVib = pm?.tolva?.potenciaVibradorKw ?? 0.6;
      const apertura = pm?.tolva?.aperturaCompuertaPct ?? 75;
      const factorVib = potVib < 0.3 ? 0.3 : Math.min(1.4, 0.75 + potVib * 0.4);
      const factorAp = Math.max(0.25, apertura / 75);
      intervaloEfectivo = this.intervaloEntrada / (factorVib * factorAp);

      bandaMontada = mr.instalados.has("banda");
      tolvaMontada = mr.instalados.has("tolva");
      const posBanda = posicionMundo(mr.posiciones, "banda");
      const posTolva = posicionMundo(mr.posiciones, "tolva");
      xEntradaReal = posTolva.x;
      zEntradaReal = posTolva.z;
      tolvaSobreBanda =
        bandaMontada &&
        Math.abs(posTolva.z - posBanda.z) <= 0.42 &&
        posTolva.x >= posBanda.x - 3.85 &&
        posTolva.x <= posBanda.x + 3.85;
    }

    const nuevos = tolvaMontada
      ? this.spawner.actualizar(dt, intervaloEfectivo, this.items, xEntradaReal, zEntradaReal)
      : [];
    for (const it of nuevos) {
      if (mr && !tolvaSobreBanda) {
        // Si la tolva fue puesta sin banda debajo, el envase cae directo al piso debajo de la tolva
        it.estado = "rechazo";
        it.progreso = 0;
        it.desde = { x: it.x, y: 0.88, z: it.z };
        it.destino = {
          x: it.x + (this.rng() - 0.5) * 0.28,
          y: 0.06,
          z: it.z + (this.rng() - 0.5) * 0.28,
        };
        it.destinoId = null;
        it.motivoRechazo = "tolva_sin_banda";
      }
      const esReciclada = Boolean(it.recirculado);
      if (esReciclada) {
        if (this.metricas.rechazadas[it.tipo] > 0) {
          this.metricas.rechazadas[it.tipo]--;
          this.metricas.masaMermaKg[it.tipo] = Math.max(0, this.metricas.masaMermaKg[it.tipo] - it.masaKg);
        }
        this.bus?.emit(EVENTOS.ITEM_RECIRCULADO, {
          itemId: it.id,
          material: it.tipo,
          masaKg: it.masaKg,
          t: this.tiempo,
        });
      } else {
        this.metricas.ingresadas++;
        this.bus?.emit(EVENTOS.ITEM_INGRESADO, {
          itemId: it.id,
          material: it.tipo,
          t: this.tiempo,
        });
      }
    }

    // 1. Tracción viscosa de la banda y avance cinemático
    const kTraccion = Math.min(1, dt * 14);
    const posBandaActual = mr ? posicionMundo(mr.posiciones, "banda") : null;
    for (const it of this.items) {
      if (it.estado === "banda") {
        const fueraDeHuellaBanda =
          posBandaActual &&
          bandaMontada &&
          (Math.abs(it.z - posBandaActual.z) > 0.45 || it.x < posBandaActual.x - 4.05);
        if ((mr && !bandaMontada) || fueraDeHuellaBanda) {
          it.estado = "rechazo";
          it.progreso = 0;
          it.desde = { x: it.x, y: it.y, z: it.z };
          it.destino = { x: it.x, y: 0.06, z: it.z };
          it.destinoId = null;
          it.motivoRechazo = bandaMontada ? "fuera_de_banda" : "sin_banda";
          continue;
        }
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
    const centroZ = this.montajeReal ? posicionMundo(this.montajeReal.posiciones, "banda").z : 0;

    for (const it of this.items) {
      if (it.estado !== "banda") continue;
      // Contención elástica contra los rieles guía laterales de la banda
      const limZ = SEMIANCHO_UTIL_Z - it.radioM;
      if (it.z > centroZ + limZ) {
        it.z = centroZ + limZ;
        it.vz = -Math.abs(it.vz) * it.restitucion;
      } else if (it.z < centroZ - limZ) {
        it.z = centroZ - limZ;
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
            a.z = Math.max(centroZ - limA, Math.min(centroZ + limA, a.z));
            b.z = Math.max(centroZ - limB, Math.min(centroZ + limB, b.z));

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
    const mr = this.montajeReal;
    const bandaMontada = mr ? mr.instalados.has("banda") : true;
    const posBanda = mr ? posicionMundo(mr.posiciones, "banda") : { x: 0, z: 0 };

    for (const est of ESTACIONES) {
      if (mr) {
        if (!bandaMontada || !mr.instalados.has(est.id)) continue;
      } else if (this.estacionesHabilitadas && !this.estacionesHabilitadas.has(est.id)) {
        continue;
      }

      const posEst = mr ? posicionMundo(mr.posiciones, est.id) : POSICION_NOMINAL[est.id];
      const sobreBanda =
        !mr ||
        (Math.abs(posEst.z - posBanda.z) <= 0.38 &&
          posEst.x >= posBanda.x - 3.9 &&
          posEst.x <= posBanda.x + 3.9);
      if (!sobreBanda) continue;

      const dxEst = posEst.x - POSICION_NOMINAL[est.id].x;
      const xSensorReal = est.xSensor + dxEst;
      const xActuadorReal = est.xActuador + dxEst;

      const estadoEst = this.estaciones[est.id];
      const evalSensor = evaluarSensorEstacion(
        est.id,
        this.configSensores?.[est.id] ?? CONFIG_SENSORES_DEFAULT[est.id],
      );
      let hayObjetoEnRoi = false;

      for (const it of this.items) {
        if (it.estado !== "banda") continue;

        // Ventana ROI con Gating (evita disparos en vacío)
        if (Math.abs(it.x - xSensorReal) <= est.roiAncho * 0.5) {
          hayObjetoEnRoi = true;
        }

        // Flanco de cruce por la ventana física del sensor 3D
        if (
          !it.sensadas.has(est.id) &&
          it.x >= xSensorReal - est.roiAncho * 0.5 &&
          it.x <= xSensorReal + est.roiAncho * 0.85
        ) {
          it.sensadas.add(est.id);
          if (it.tipo === est.material) {
            let precisionBase = this.cfg.materiales[it.tipo].precisionSeparador;
            if (mr) {
              const pm = mr.parametrosMaquina;
              if (this.velocidadBanda > 1.15) precisionBase *= 0.62;
              if (est.id === "separador" && (pm?.separador?.rpmTambor ?? 2600) < 1700) {
                precisionBase *= Math.max(0.15, (pm.separador.rpmTambor ?? 2600) / 2400);
              } else if (est.id === "escaner") {
                const nm = pm?.escaner?.longitudOndaNm ?? 1660;
                if (nm < 1580 || nm > 1740) precisionBase = 0.05;
              } else if (est.id === "desviador" && (pm?.desviador?.sensibilidadOpticaPct ?? 88) < 65) {
                precisionBase *= (pm.desviador.sensibilidadOpticaPct ?? 88) / 100;
              }
            }
            const confianza = +(0.82 + this.rng() * 0.17).toFixed(2);
            const logicaLecturaOk = evalSensor.transductorOk && evalSensor.condicionOk;
            const detectado = logicaLecturaOk && this.rng() < precisionBase;
            estadoEst.sensorActivoHasta = this.tiempo + 0.35;

            if (detectado) {
              estadoEst.detecciones++;
              estadoEst.ultimoResultado = est.material.toUpperCase();
              if (evalSensor.sincronizacionOk) {
                estadoEst.colaFifo.push(it.id);
              } else {
                estadoEst.actuadorActivoHasta = this.tiempo + 0.25;
              }
            } else {
              estadoEst.fallos++;
              estadoEst.ultimoResultado = logicaLecturaOk ? "NO_CLASIFICADO" : "LOGICA_ERRONEA";
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

        // Llegada a la ventana física de acción del actuador (desencolado FIFO)
        if (!it.actuadas.has(est.id) && it.x >= xActuadorReal && it.x <= xActuadorReal + 0.55) {
          it.actuadas.add(est.id);
          const idxCola = estadoEst.colaFifo.indexOf(it.id);
          if (idxCola !== -1) {
            estadoEst.colaFifo.splice(idxCola, 1);
            estadoEst.actuadorActivoHasta = this.tiempo + 0.48;
            estadoEst.expulsiones++;

            it.estado = "expulsado";
            it.progreso = 0;
            it.desde = { x: it.x, y: it.y, z: it.z };

            const xExp = posEst.x + (est.contenedor.x - POSICION_NOMINAL[est.id].x);
            const zExp = posEst.z + est.contenedor.z * evalSensor.ratioFlujo;

            const cestoId = CESTO_POR_ESTACION[est.id];
            const cestoInstalado = !mr || mr.instalados.has(cestoId);
            const posCesto = mr ? posicionMundo(mr.posiciones, cestoId) : est.contenedor;
            const cestoEnAlcance = cestoInstalado && Math.hypot(posCesto.x - xExp, posCesto.z - zExp) <= 0.55;
            const xNomRel = posEst.x + (est.contenedor.x - POSICION_NOMINAL[est.id].x);
            const zNomRel = posEst.z + est.contenedor.z;
            const cestoCercaNominal =
              cestoInstalado && Math.hypot(posCesto.x - xNomRel, posCesto.z - zNomRel) <= 0.55;

            if (cestoEnAlcance) {
              it.destino = {
                x: posCesto.x + (this.rng() - 0.5) * 0.36,
                y: ALTURA_CAIDA_CONTENEDOR,
                z: posCesto.z + (this.rng() - 0.5) * 0.22,
              };
              it.destinoId = est.id;
              it.motivoRechazo = null;
            } else {
              it.destino = {
                x: xExp + (this.rng() - 0.5) * 0.24,
                y: 0.06,
                z: Math.max(-4.5, Math.min(2.0, zExp)),
              };
              it.destinoId = null;
              it.motivoRechazo =
                cestoCercaNominal && evalSensor.estadoFlujo === "corto"
                  ? "flujo_corto"
                  : cestoCercaNominal && evalSensor.estadoFlujo === "excesivo"
                    ? "flujo_excesivo"
                    : "sin_cesto_en_destino";
            }

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
    const xFinBanda = (mr ? posBanda.x : 0) + (X_FIN_BANDA);
    for (const it of this.items) {
      if (it.estado === "banda" && it.x >= xFinBanda) {
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
        xFinal: it.destino.x,
        zFinal: it.destino.z,
        motivo: it.motivoRechazo ?? "sin_clasificar",
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
