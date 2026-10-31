import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RGBE_ReadHeader, RGBE_ReadPixels } from "@babylonjs/core/Misc/HighDynamicRange/hdr.js";

import { EventBus, EVENTOS } from "../src/core/bus/eventBus.js";
import { PlantStateMachine, ESTADOS_PLANTA } from "../src/core/state/plantStateMachine.js";
import { crearRng } from "../src/core/spawner/itemSpawner.js";
import { ConveyorSimulation } from "../src/core/physics/conveyorPhysics.js";
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
