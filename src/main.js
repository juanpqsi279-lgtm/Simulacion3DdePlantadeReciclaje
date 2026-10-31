// src/main.js
// Orquestador del Gemelo Digital 3D: inicializa Configuración Dinámica (manifest.json + mocks),
// Bus de Eventos Pub/Sub, Máquina de Estados Finita, Física de Línea, Motor 3D Babylon.js v9+ y Dashboard Chart.js.

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
  eventBus.emit(EVENTOS.CONFIG_CARGADA, config);

  const fsm = new PlantStateMachine(config.ensamblajeCfg, eventBus);
  const sim = new ConveyorSimulation(config.materialesCfg, { bus: eventBus });

  let multiplicadorVelocidad = config.multiplicadorInicial;

  // Conexión de comandos de usuario publicados en el EventBus hacia la Máquina de Estados y la Simulación
  eventBus.on(EVENTOS.COMANDO_FASE, (fase) => fsm.irAFase(fase));
  eventBus.on(EVENTOS.COMANDO_PASO_SIGUIENTE, () => fsm.siguientePaso());
  eventBus.on(EVENTOS.COMANDO_ENSAMBLAR_TODO, () => fsm.ensamblarProgresivo(340));
  eventBus.on(EVENTOS.COMANDO_DESMONTAR, () => {
    fsm.desmontar();
    sim.reiniciar();
    eventBus.emit(EVENTOS.TELEMETRIA_TICK, sim.resumen(fsm.potenciaActivaKw()));
  });
  eventBus.on(EVENTOS.COMANDO_ALTERNAR_OPERACION, () => fsm.alternarOperacion());
  eventBus.on(EVENTOS.COMANDO_REINICIAR, () => {
    if (fsm.operando) fsm.pausar();
    sim.reiniciar();
    eventBus.emit(EVENTOS.TELEMETRIA_TICK, sim.resumen(fsm.potenciaActivaKw()));
  });
  eventBus.on(EVENTOS.COMANDO_VELOCIDAD, (v) => {
    multiplicadorVelocidad = Math.max(0.25, Math.min(10, Number(v) || 1));
  });
  eventBus.on(EVENTOS.COMANDO_FLUJO, (pzm) => {
    sim.fijarFlujoPorMinuto(pzm);
  });

  // Inicialización de las vistas suscritas al EventBus (DOM + Chart.js)
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
  eventBus.emit(EVENTOS.TELEMETRIA_TICK, sim.resumen(fsm.potenciaActivaKw()));

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

  // Redimensionado reactivo automático cuando el panel lateral colapsa o se expande
  const contenedorEscena = document.getElementById("contenedor-escena");
  if (typeof ResizeObserver !== "undefined" && contenedorEscena) {
    new ResizeObserver(() => escena3d.redimensionar()).observe(contenedorEscena);
  }

  // Modo demostración automatizada (?auto=1)
  if (new URLSearchParams(location.search).has("auto")) {
    fsm.ensamblarProgresivo(300);
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

  // Bucle maestro de simulación y renderizado de alta precisión
  let ultimoMs = performance.now();
  let acumTelemetria = 0;

  escena3d.engine.runRenderLoop(() => {
    const ahoraMs = performance.now();
    const dtReal = Math.min((ahoraMs - ultimoMs) / 1000, 0.1);
    ultimoMs = ahoraMs;

    const dtSimulado = dtReal * (fsm.operando ? multiplicadorVelocidad : 1);
    if (fsm.operando) {
      sim.actualizar(dtSimulado, fsm.potenciaActivaKw());
      acumTelemetria += dtReal;
      if (acumTelemetria >= 0.22) {
        acumTelemetria = 0;
        eventBus.emit(EVENTOS.TELEMETRIA_TICK, sim.resumen(fsm.potenciaActivaKw()));
      }
    }

    escena3d.actualizarEscena(dtReal, dtSimulado, sim, fsm.operando);
    escena3d.scene.render();
  });
}

iniciarGemeloDigital();
