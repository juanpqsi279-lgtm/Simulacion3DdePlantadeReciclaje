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
  sim.fijarMontajeReal(fsm.snapshot());
  let multiplicadorVelocidad = config.multiplicadorInicial;

  eventBus.on(EVENTOS.ESTADO_PLANTA, (snap) => sim.fijarMontajeReal(snap));

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
  // Montaje libre: el usuario decide qué módulo colocar, quitar o mover (la planta NO se arma sola)
  eventBus.on(EVENTOS.COMANDO_COLOCAR, ({ id, dx, dz }) =>
    fsm.colocar(id, dx !== undefined || dz !== undefined ? { dx: dx ?? 0, dz: dz ?? 0 } : null),
  );
  eventBus.on(EVENTOS.COMANDO_QUITAR, ({ id }) => fsm.quitar(id));
  eventBus.on(EVENTOS.COMANDO_MOVER, ({ id, dx, dz }) => fsm.mover(id, dx, dz));
  eventBus.on(EVENTOS.COMANDO_RECOGER_INVENTARIO, ({ id }) => fsm.recogerAlInventario(id));
  eventBus.on(EVENTOS.COMANDO_SACAR_INVENTARIO, ({ id }) => fsm.sacarDeInventarioAlAlmacen(id));
  eventBus.on(EVENTOS.COMANDO_RECOGER_TODO_INVENTARIO, () => fsm.recogerTodoAlInventario());
  eventBus.on(EVENTOS.COMANDO_DEVOLVER_ALMACEN, () => {
    if (fsm.operando) fsm.pausar(true);
    fsm.devolverTodoAlAlmacen();
    sim.reiniciar();
  });
  eventBus.on(EVENTOS.COMANDO_CONFIG_SENSOR, ({ estacion, cambios }) => {
    if (estacion === "todos" && cambios?.restaurarOptimo) {
      fsm.restaurarSensoresOptimos();
    } else {
      fsm.configurarSensor(estacion, cambios);
    }
    sim.fijarConfigSensores(fsm.sensores);
  });
  eventBus.on(EVENTOS.COMANDO_PARAM_MAQUINA, ({ modulo, cambios }) => {
    if (modulo === "todos" && cambios?.restaurarSugeridos) {
      fsm.restaurarParametrosSugeridos();
    } else {
      fsm.configurarParametroMaquina(modulo, cambios);
    }
  });
  eventBus.on(EVENTOS.COMANDO_RETO_STEAM, () => {
    if (fsm.operando) fsm.pausar(true);
    fsm.activarRetoSteam();
    sim.fijarConfigSensores(fsm.sensores);
    sim.reiniciar();
  });
  eventBus.on(EVENTOS.COMANDO_FASE, (fase) => fsm.irAFase(fase));
  eventBus.on(EVENTOS.COMANDO_DESMONTAR, () => {
    if (fsm.operando) fsm.pausar(true);
    fsm.desmontar();
    sim.reiniciar();
  });
  eventBus.on(EVENTOS.COMANDO_ALTERNAR_OPERACION, () => fsm.alternarOperacion(true));
  eventBus.on(EVENTOS.COMANDO_REINICIAR, () => {
    if (fsm.operando) fsm.pausar(true);
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
