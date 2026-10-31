import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RGBE_ReadHeader, RGBE_ReadPixels } from "@babylonjs/core/Misc/HighDynamicRange/hdr.js";

import { EventBus, EVENTOS } from "../src/core/bus/eventBus.js";
import { PlantStateMachine, ESTADOS_PLANTA } from "../src/core/state/plantStateMachine.js";
import { crearRng } from "../src/core/spawner/itemSpawner.js";
import { ConveyorSimulation } from "../src/core/physics/conveyorPhysics.js";
import { fusionarConfiguracion } from "../src/config/configLoader.js";

const leerJson = (ruta) => JSON.parse(readFileSync(new URL(ruta, import.meta.url), "utf8"));
const manifest = leerJson("../public/manifest.json");
const config = fusionarConfiguracion(manifest);

test("EventBus Pub/Sub desacopla emisores y suscriptores (on, once, off, emit)", () => {
  const bus = new EventBus();
  const recibidos = [];
  const off = bus.on(EVENTOS.SENSOR_ALUMINIO, (p) => recibidos.push(p.itemId));
  let unaVez = 0;
  bus.once(EVENTOS.SENSOR_ALUMINIO, () => unaVez++);

  bus.emit(EVENTOS.SENSOR_ALUMINIO, { itemId: 10 });
  bus.emit(EVENTOS.SENSOR_ALUMINIO, { itemId: 20 });
  off();
  bus.emit(EVENTOS.SENSOR_ALUMINIO, { itemId: 30 });

  assert.deepEqual(recibidos, [10, 20]);
  assert.equal(unaVez, 1);
});

test("PlantStateMachine gestiona FASE_0..FASE_6, PAUSADO y OPERANDO con validaciones", () => {
  const bus = new EventBus();
  const historialEstados = [];
  bus.on(EVENTOS.ESTADO_PLANTA, (s) => historialEstados.push(s.estado));

  const fsm = new PlantStateMachine(config.ensamblajeCfg, bus);
  assert.equal(fsm.estado, ESTADOS_PLANTA.FASE_0);
  assert.equal(fsm.iniciar(), null, "No debe operar antes de completar las 6 fases");

  for (let i = 1; i <= 6; i++) {
    const snap = fsm.siguientePaso();
    assert.equal(snap.estado, `FASE_${i}`);
    assert.equal(snap.idsVisibles.length, i);
  }
  assert.equal(fsm.ensamblajeCompleto, true);

  fsm.iniciar();
  assert.equal(fsm.estado, ESTADOS_PLANTA.OPERANDO);
  assert.ok(fsm.potenciaActivaKw() > 14);

  fsm.pausar();
  assert.equal(fsm.estado, ESTADOS_PLANTA.PAUSADO);

  // Retroceder a Fase 3 oculta las fases 4..6 y desactiva operación
  fsm.irAFase(3);
  assert.equal(fsm.estado, ESTADOS_PLANTA.FASE_3);
  assert.equal(fsm.ensamblajeCompleto, false);

  fsm.desmontar();
  assert.equal(fsm.estado, ESTADOS_PLANTA.FASE_0);
  assert.ok(historialEstados.length >= 9);
});

test("Integración dinámica de manifest.json alimenta kW, velocidad de banda y cadencia inicial", () => {
  assert.equal(config.materialesCfg.linea.velocidadBandaMps, manifest.simulacionInicial.velocidadBandaMps);
  assert.equal(config.materialesCfg.linea.piezasPorMinuto, manifest.simulacionInicial.piezasPorMinuto);
  const pasoSep = config.ensamblajeCfg.pasos.find((p) => p.id === "separador");
  assert.equal(pasoSep.potenciaKw, manifest.simulacionInicial.ensamblajeOverrides.separador.potenciaKw);
});

test("Físicas de banda y colisiones a máxima cadencia (240 piezas/min) sin superposiciones ni glitches", () => {
  const bus = new EventBus();
  let eventosAluminio = 0;
  let eventosDeteccion = 0;
  bus.on(EVENTOS.SENSOR_ALUMINIO, () => eventosAluminio++);
  bus.on(EVENTOS.SENSOR_DETECCION, () => eventosDeteccion++);

  const sim = new ConveyorSimulation(config.materialesCfg, { bus, rng: crearRng(42) });
  sim.fijarFlujoPorMinuto(240);

  let superposicionesDetectadas = 0;
  for (let t = 0; t < 90; t += 0.05) {
    sim.actualizar(0.05, 15.2);
    superposicionesDetectadas += sim.contarSuperposicionesCriticas();
  }

  const r = sim.resumen(15.2);
  assert.equal(superposicionesDetectadas, 0, "Cero glitches o solapamientos entre objetos a 240 pzs/min");
  assert.ok(r.procesadas > 180, `Se esperaban >180 piezas procesadas, hubo ${r.procesadas}`);
  assert.ok(eventosAluminio > 30, "El sensor de aluminio debe publicar detecciones en el EventBus");
  assert.ok(eventosDeteccion >= eventosAluminio);
  assert.ok(r.purezaPct > 85);
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
