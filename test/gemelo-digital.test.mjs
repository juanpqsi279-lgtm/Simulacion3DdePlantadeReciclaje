import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RGBE_ReadHeader, RGBE_ReadPixels } from "@babylonjs/core/Misc/HighDynamicRange/hdr.js";

import { EventBus, EVENTOS } from "../src/core/bus/eventBus.js";
import { PlantStateMachine, ESTADOS_PLANTA } from "../src/core/state/plantStateMachine.js";
import { crearRng } from "../src/core/spawner/itemSpawner.js";
import { ConveyorSimulation } from "../src/core/physics/conveyorPhysics.js";
import { evaluarMontaje, ajustarOffset } from "../src/core/assembly/reglasMontaje.js";
import { fusionarConfiguracion } from "../src/config/configLoader.js";
import { TelemetryProcessor } from "../src/workers/telemetryProcessor.js";

const leerJson = (ruta) => JSON.parse(readFileSync(new URL(ruta, import.meta.url), "utf8"));
const manifest = leerJson("../public/manifest.json");
const config = fusionarConfiguracion(manifest);

test("EventBus Pub/Sub desacopla emisores y puente estadístico Web Worker (lotes y snapshots)", () => {
  const bus = new EventBus();
  let ultimoSnapshot = null;
  bus.on(EVENTOS.TELEMETRIA_TICK, (s) => {
    ultimoSnapshot = s;
  });

  bus.iniciarPuenteWorker({
    tiposMaterial: ["plastico", "aluminio", "vidrio"],
    intervaloSnapshotMs: 50,
    intervaloLoteMs: 20,
  });

  bus.emit(EVENTOS.ITEM_INGRESADO, { material: "aluminio", t: 0.5 });
  bus.emit(EVENTOS.SENSOR_DETECCION, { estacion: "separador", material: "aluminio", detectado: true, t: 1.0 });
  bus.emit(EVENTOS.ITEM_CLASIFICADO, { material: "aluminio", masaKg: 0.015, t: 1.5 });
  bus.emit(EVENTOS.PULSO_TIEMPO, { tiempo: 2.5, enTransito: 3, potenciaKw: 15.2, colisionesResueltas: 2 });
  bus.vaciarColaWorker();

  assert.ok(ultimoSnapshot !== null, "Debe recibirse snapshot precalculado desde el procesador de telemetría");
  assert.equal(ultimoSnapshot.ingresadas, 1);
  assert.equal(ultimoSnapshot.clasificadas, 1);
  assert.deepEqual(ultimoSnapshot.seriesChart.dona, [0, 1, 0]);
  assert.equal(ultimoSnapshot.seriesChart.flujoLabels.length, 1);
  bus.clear();
});

test("TelemetryProcessor calcula estadísticas y series Chart.js fuera del hilo principal", () => {
  const proc = new TelemetryProcessor(["plastico", "aluminio", "vidrio"]);
  proc.procesarLote([
    { tipo: "INGRESO", payload: { material: "plastico" } },
    { tipo: "INGRESO", payload: { material: "vidrio" } },
    { tipo: "DETECCION", payload: { detectado: true } },
    { tipo: "CLASIFICADO", payload: { material: "plastico", masaKg: 0.025 } },
    { tipo: "RECHAZADO", payload: { material: "vidrio", masaKg: 0.2 } },
    { tipo: "PULSO_TIEMPO", payload: { tiempo: 3.0, enTransito: 0, potenciaKw: 14.0, colisionesResueltas: 1 } },
  ]);

  const snap = proc.generarSnapshot();
  assert.equal(snap.purezaPct, 50);
  assert.deepEqual(snap.seriesChart.barrasClasificadas, [1, 0, 0]);
  assert.deepEqual(snap.seriesChart.barrasMerma, [0, 0, 1]);
  assert.ok(snap.whPorKg > 0);
});

test("PlantStateMachine gestiona FASE_0..FASE_6, PAUSADO y OPERANDO con validaciones", () => {
  const bus = new EventBus();
  const historialEstados = [];
  bus.on(EVENTOS.ESTADO_PLANTA, (s) => historialEstados.push(s.estado));

  const fsm = new PlantStateMachine(config.ensamblajeCfg, bus);
  assert.equal(fsm.estado, ESTADOS_PLANTA.FASE_0);
  assert.equal(fsm.iniciar(), null);

  for (let i = 1; i <= 6; i++) {
    const snap = fsm.siguientePaso();
    assert.equal(snap.estado, `FASE_${i}`);
  }
  assert.equal(fsm.ensamblajeCompleto, true);

  fsm.iniciar();
  assert.equal(fsm.estado, ESTADOS_PLANTA.OPERANDO);
  fsm.pausar();
  assert.equal(fsm.estado, ESTADOS_PLANTA.PAUSADO);
  fsm.irAFase(3);
  assert.equal(fsm.estado, ESTADOS_PLANTA.FASE_3);
  fsm.desmontar();
  assert.equal(fsm.estado, ESTADOS_PLANTA.FASE_0);
  assert.ok(historialEstados.length >= 9);
});

test("Físicas de banda y colisiones a máxima cadencia (240 piezas/min) sin superposiciones ni glitches", () => {
  const bus = new EventBus();
  let eventosAluminio = 0;
  let eventosPlastico = 0;
  bus.on(EVENTOS.SENSOR_ALUMINIO, () => eventosAluminio++);
  bus.on(EVENTOS.SENSOR_PLASTICO, () => eventosPlastico++);

  const sim = new ConveyorSimulation(config.materialesCfg, { bus, rng: crearRng(42) });
  sim.fijarFlujoPorMinuto(240);

  let superposicionesDetectadas = 0;
  for (let t = 0; t < 90; t += 0.05) {
    sim.actualizar(0.05, 15.2);
    superposicionesDetectadas += sim.contarSuperposicionesCriticas();
  }

  const r = sim.resumen(15.2);
  assert.equal(superposicionesDetectadas, 0);
  assert.ok(r.procesadas > 180);
  assert.ok(eventosAluminio > 30);
  assert.ok(eventosPlastico > 30);
});

test("Mapa de entorno PBR HDRI (.hdr) es válido para HDRCubeTexture de Babylon.js", () => {
  const bytes = new Uint8Array(
    readFileSync(new URL("../public/assets/environment/planta_industrial.hdr", import.meta.url)),
  );
  const info = RGBE_ReadHeader(bytes);
  assert.equal(info.width, 256);
  assert.equal(info.height, 128);
  const pixeles = RGBE_ReadPixels(bytes, info);
  assert.equal(pixeles.length, 256 * 128 * 3);
});


test("Montaje libre: cualquier orden y posición, sin bloqueos; avisos claros explican qué no funcionará", () => {
  const bus = new EventBus();
  const fsm = new PlantStateMachine(config.ensamblajeCfg, bus);
  assert.equal(fsm.faseEnsamblada, 0, "la planta no se arma sola al iniciar");
  assert.deepEqual(fsm.avisos(), []);

  // Orden arbitrario: primero un separador (sin banda ni contenedores) -> se permite y se avisa
  const snap = fsm.colocar("separador");
  assert.deepEqual(snap.idsVisibles, ["separador"]);
  const ids = snap.avisos.map((a) => a.id);
  assert.ok(ids.includes("sin-banda-estaciones"));
  assert.ok(ids.includes("sin-contenedores"));
  assert.ok(snap.avisos.every((a) => a.titulo && a.mensaje.length > 20));

  // Se puede iniciar con montaje incompleto (no se impide); la capacidad refleja lo que realmente funciona
  fsm.colocar("tolva");
  assert.ok(fsm.iniciar(), "iniciar no se bloquea con montaje parcial");
  assert.equal(fsm.operando, true);
  assert.equal(fsm.capacidad().banda, false);
  assert.ok(fsm.avisos().some((a) => a.id === "operando-incompleto"));

  // Con banda en su sitio, la tolva alimenta y el separador actúa
  fsm.colocar("banda");
  const cap = fsm.capacidad();
  assert.equal(cap.entrada, true);
  assert.deepEqual([...cap.estaciones], ["separador"]);

  // Mover un equipo fuera de su punto de trabajo: se permite, se avisa y deja de operar
  const movido = fsm.mover("separador", 1.5, 0.6);
  assert.ok(movido.avisos.some((a) => a.id === "separador-desalineado"));
  assert.equal(fsm.capacidad().estaciones.size, 0);

  // Quitar piezas no detiene la acción del usuario: la planta se queda como la dejó
  fsm.quitar("banda");
  assert.equal(fsm.operando, true);
  assert.ok(fsm.avisos().some((a) => a.id === "sin-banda-tolva"));
  fsm.desmontar();
  assert.equal(fsm.estado, ESTADOS_PLANTA.FASE_0);
});

test("Reglas de montaje: orden del flujo, solapes y desalineaciones se reportan sin impedir nada", () => {
  const todos = ["banda", "tolva", "separador", "escaner", "desviador", "contenedores"];
  const base = { instalados: todos, orden: todos, posiciones: {} };
  assert.deepEqual(evaluarMontaje(base), [], "la planta completa en su sitio no genera avisos");

  const solape = evaluarMontaje({ ...base, posiciones: { escaner: { dx: 1.8, dz: 0 } } });
  assert.ok(solape.some((a) => a.id.startsWith("solape-")), "escáner sobre el desviador");

  const invertido = evaluarMontaje({ ...base, posiciones: { separador: { dx: 3.2, dz: 0 } } });
  assert.ok(invertido.some((a) => a.id.startsWith("orden-")), "orden del flujo invertido");

  assert.deepEqual(ajustarOffset(0.12, -0.1), { dx: 0, dz: 0 }, "imán a la posición nominal");
  assert.deepEqual(ajustarOffset(1.04, 0.52), { dx: 1.05, dz: 0.5 }, "rejilla de 5 cm");
});

test("Simulación: estaciones deshabilitadas no sensan y sin tolva no ingresa material (lógica por defecto intacta)", () => {
  const sinSeparador = new ConveyorSimulation(config.materialesCfg, { rng: crearRng(7) });
  sinSeparador.estacionesHabilitadas = new Set(["escaner", "desviador"]);
  const sinTolva = new ConveyorSimulation(config.materialesCfg, { rng: crearRng(7) });
  sinTolva.entradaHabilitada = false;
  for (let t = 0; t < 60; t += 0.05) {
    sinSeparador.actualizar(0.05, 15.2);
    sinTolva.actualizar(0.05, 15.2);
  }
  assert.equal(sinSeparador.estaciones.separador.detecciones, 0);
  assert.ok(sinSeparador.estaciones.escaner.detecciones > 0);
  assert.equal(sinTolva.metricas.ingresadas, 0);
});

test("Robot WALL-E recircula piezas de merma hacia el dispensador/tolva inicial descontando merma", () => {
  const bus = new EventBus();
  let eventosRecirculados = 0;
  bus.on(EVENTOS.ITEM_RECIRCULADO, () => eventosRecirculados++);

  const sim = new ConveyorSimulation(config.materialesCfg, { bus, rng: crearRng(99) });
  // Forzamos que todas las estaciones estén apagadas inicialmente para generar merma al final de la banda
  sim.estacionesHabilitadas = new Set();
  for (let t = 0; t < 25; t += 0.05) sim.actualizar(0.05, 15.2);

  const mermaAluminioAntes = sim.metricas.rechazadas.aluminio;
  assert.ok(mermaAluminioAntes > 0, "debe haber caído al menos una lata a merma");

  // WALL-E recoge una lata del suelo y la deposita en la tolva
  sim.recircularPieza("aluminio");
  for (let t = 0; t < 3; t += 0.05) sim.actualizar(0.05, 15.2);

  assert.equal(eventosRecirculados, 1, "debe emitirse EVENTOS.ITEM_RECIRCULADO cuando entra a la tolva");
});
