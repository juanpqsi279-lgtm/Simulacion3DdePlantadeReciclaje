// src/main.js
// Orquestador del Gemelo Digital 3D optimizado para 60 FPS en el Main Thread:
// Toda la agregación estadística y preparación de series de Chart.js corre en un Web Worker dedicado,
// mientras el hilo principal se dedica al renderizado PBR/HDRI + Físicas Cinemáticas + ParticleSystem.

import "./styles/main.css";
import { cargarConfiguracionDinamica } from "./config/configLoader.js";
import { eventBus, EVENTOS } from "./core/bus/eventBus.js";
import { PlantStateMachine } from "./core/state/plantStateMachine.js";
import { ConveyorSimulation } from "./core/physics/conveyorPhysics.js";
import { crearControladorEscena3D } from "./engine3d/sceneController.js";
import { inicializarChartsDashboard } from "./analytics/chartsController.js";
import { inicializarDomController } from "./ui/domController.js";

async function iniciarGemeloDigital() {
  const config = await cargarConfiguracionDinamica("manifest.json");
  const tiposMaterial = Object.keys(config.materialesCfg.materiales);

  const fsm = new PlantStateMachine(config.ensamblajeCfg, eventBus);
  const sim = new ConveyorSimulation(config.materialesCfg, { bus: eventBus });
  let multiplicadorVelocidad = config.multiplicadorInicial;

  // Inicialización de UI y gráficas antes de arrancar el puente del Web Worker
  inicializarDomController(config, fsm, eventBus);
  inicializarChartsDashboard(
    {
      dona: document.getElementById("g-dona"),
      flujo: document.getElementById("g-flujo"),
      barras: document.getElementById("g-barras"),
      historial: document.getElementById("g-historial"),
    },
    config,
    eventBus,
  );

  // Activa el Web Worker estadístico desacoplado del Main Thread
  eventBus.iniciarPuenteWorker({
    tiposMaterial,
    intervaloSnapshotMs: 420,
    intervaloLoteMs: 120,
  });
  eventBus.emit(EVENTOS.CONFIG_CARGADA, config);

  // Suscripción de comandos de control
  eventBus.on(EVENTOS.COMANDO_FASE, (fase) => fsm.irAFase(fase));
  eventBus.on(EVENTOS.COMANDO_PASO_SIGUIENTE, () => fsm.siguientePaso());
  eventBus.on(EVENTOS.COMANDO_ENSAMBLAR_TODO, () => fsm.ensamblarProgresivo(340));
  eventBus.on(EVENTOS.COMANDO_DESMONTAR, () => {
    fsm.desmontar();
    sim.reiniciar();
  });
  eventBus.on(EVENTOS.COMANDO_ALTERNAR_OPERACION, () => fsm.alternarOperacion());
  eventBus.on(EVENTOS.COMANDO_REINICIAR, () => {
    if (fsm.operando) fsm.pausar();
    sim.reiniciar();
  });
  eventBus.on(EVENTOS.COMANDO_VELOCIDAD, (v) => {
    multiplicadorVelocidad = Math.max(0.25, Math.min(10, Number(v) || 1));
  });
  eventBus.on(EVENTOS.COMANDO_FLUJO, (pzm) => {
    sim.fijarFlujoPorMinuto(pzm);
  });

  // Inicialización del motor 3D WebGL2 / Babylon.js v9+
  const canvas3d = document.getElementById("canvas3d");
  let escena3d;
  try {
    escena3d = await crearControladorEscena3D(canvas3d, { config, bus: eventBus });
  } catch (err) {
    console.error(err);
    eventBus.emit(EVENTOS.MOTOR_3D_ERROR, err.message ?? String(err));
    return;
  }

  const contenedorEscena = document.getElementById("contenedor-escena");
  if (typeof ResizeObserver !== "undefined" && contenedorEscena) {
    new ResizeObserver(() => escena3d.redimensionar()).observe(contenedorEscena);
  }

  if (new URLSearchParams(location.search).has("auto")) {
    fsm.ensamblarProgresivo(280);
    const verif = setInterval(() => {
      if (!fsm.ensamblajeCompleto) return;
      clearInterval(verif);
      multiplicadorVelocidad = 4;
      const rngVel = document.getElementById("rng-velocidad");
      if (rngVel) {
        rngVel.value = "4";
        rngVel.dispatchEvent(new Event("input"));
      }
      fsm.iniciar();
    }, 250);
  }

  // Main Thread dedicado al renderizado 3D (60 FPS)
  let ultimoMs = performance.now();
  let acumPulsoWorker = 0;

  escena3d.engine.runRenderLoop(() => {
    const ahoraMs = performance.now();
    const dtReal = Math.min((ahoraMs - ultimoMs) / 1000, 0.1);
    ultimoMs = ahoraMs;

    const dtSimulado = dtReal * (fsm.operando ? multiplicadorVelocidad : 1);
    if (fsm.operando) {
      sim.actualizar(dtSimulado, fsm.potenciaActivaKw());
      acumPulsoWorker += dtReal;
      if (acumPulsoWorker >= 0.24) {
        acumPulsoWorker = 0;
        eventBus.emit(EVENTOS.PULSO_TIEMPO, {
          tiempo: sim.tiempo,
          enTransito: sim.items.length,
          potenciaKw: fsm.potenciaActivaKw(),
          colisionesResueltas: sim.metricas.colisionesResueltas,
        });
      }
    }

    escena3d.actualizarEscena(dtReal, dtSimulado, sim, fsm.operando);
    escena3d.scene.render();
  });
}

iniciarGemeloDigital();
