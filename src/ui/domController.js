// src/ui/domController.js
// Controlador de Interfaz HTML5/DOM en Vanilla JS puro.
// Suscrito al EventBus: actualiza telemetría, badges de sensores, estados de la Máquina de Estados,
// panel lateral colapsable responsivo y microinteracciones sin tocar Babylon.js.

import { EVENTOS } from "../core/bus/eventBus.js";

const SPRITE_URL = "assets/ui/sprite.svg";

function svgIcono(id) {
  return `<svg class="ico" aria-hidden="true"><use href="${SPRITE_URL}#icono-${id}" /></svg>`;
}

export function formatearReloj(seg) {
  const total = Math.max(0, Math.floor(seg));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function inicializarDomController(config, stateMachine, bus) {
  const $ = (id) => document.getElementById(id);

  const elLayout = $("layout-principal");
  const elBtnColapsar = $("btn-colapsar-panel");
  const elEstadoGlobal = $("estado-global");
  const elEstadoFsm = $("badge-fsm");
  const elCarga = $("carga");
  const elCargaTexto = $("carga-texto");
  const elProgresoEnsamblaje = $("progreso-ensamblaje");
  const elListaPasos = $("lista-pasos");
  const elResumenMontaje = $("resumen-montaje");
  const elBtnPaso = $("btn-paso");
  const elBtnAuto = $("btn-auto");
  const elBtnDesmontar = $("btn-desmontar");
  const elBtnPlay = $("btn-play");
  const elTxtPlay = $("txt-play");
  const elIcoPlay = $("ico-play");
  const elBtnReiniciar = $("btn-reiniciar");
  const elRngVelocidad = $("rng-velocidad");
  const elLblVelocidad = $("lbl-velocidad");
  const elRngFlujo = $("rng-flujo");
  const elLblFlujo = $("lbl-flujo");
  const elKpis = $("kpis");
  const elLog = $("log");
  const elHudFps = $("hud-fps");
  const elBtnWireframe = $("btn-wireframe");

  const chipsSensor = {
    separador: $("chip-sensor-aluminio"),
    escaner: $("chip-sensor-plastico"),
    desviador: $("chip-sensor-vidrio"),
  };

  // Valores iniciales alimentados dinámicamente desde manifest.json + mocks
  const flujoInicial = config.materialesCfg.linea.piezasPorMinuto;
  const maxFlujo = config.materialesCfg.linea.maxPiezasPorMinuto;
  elRngFlujo.max = String(maxFlujo);
  elRngFlujo.value = String(flujoInicial);
  elLblFlujo.textContent = String(flujoInicial);

  elRngVelocidad.value = String(config.multiplicadorInicial);
  elLblVelocidad.textContent = `${config.multiplicadorInicial}×`;

  function fijarBadgeGlobal(texto, variante = "") {
    elEstadoGlobal.textContent = texto;
    elEstadoGlobal.className = `barra__estado ${variante}`.trim();
  }

  const colaLogsPendientes = [];
  let timerVolcadoLog = null;

  function volcarColaLog() {
    timerVolcadoLog = null;
    if (colaLogsPendientes.length === 0) return;
    const frag = document.createDocumentFragment();
    for (let i = colaLogsPendientes.length - 1; i >= 0; i--) {
      const { mensaje, nivel, t } = colaLogsPendientes[i];
      const li = document.createElement("li");
      li.className = nivel;
      const marca = document.createElement("span");
      marca.className = "t";
      marca.textContent = t === null ? "--:--" : formatearReloj(t);
      li.append(marca, document.createTextNode(mensaje));
      frag.append(li);
    }
    colaLogsPendientes.length = 0;
    elLog.prepend(frag);
    while (elLog.children.length > 70) {
      elLog.lastChild.remove();
    }
  }

  function registrarEventoLog(mensaje, nivel = "info", t = null) {
    colaLogsPendientes.push({ mensaje, nivel, t });
    if (colaLogsPendientes.length > 25) colaLogsPendientes.shift();
    if (timerVolcadoLog === null) {
      timerVolcadoLog = setTimeout(volcarColaLog, 300);
    }
  }

  function renderizarPasos(snap) {
    elProgresoEnsamblaje.style.width = `${Math.round(snap.progreso * 100)}%`;
    elEstadoFsm.textContent = snap.estado;
    elEstadoFsm.dataset.estado = snap.operando ? "operando" : snap.ensamblajeCompleto ? "listo" : "montaje";
    elResumenMontaje.textContent = `${snap.fase}/${snap.totalFases} fases · ${snap.minutosAcumulados} min · ${snap.potenciaInstaladaKw.toFixed(1)} kW instalados`;

    elListaPasos.innerHTML = stateMachine.pasos
      .map((p, idx) => {
        const numFase = idx + 1;
        const completado = numFase <= snap.fase;
        const esSiguiente = numFase === snap.fase + 1;
        const clase = completado ? "hecho" : esSiguiente ? "siguiente" : "";
        const nombreIco = completado ? "correcto" : p.icono.replace(".svg", "");
        return `<li class="${clase}" data-fase="${numFase}" tabindex="0" role="button" title="Ir a Fase ${numFase}">
          ${svgIcono(nombreIco)}
          <div>
            <strong>${numFase}. ${p.titulo}</strong>
            <small>${p.detalle} · ${p.tiempoEstimadoMin} min · ${p.potenciaKw} kW</small>
          </div>
        </li>`;
      })
      .join("");

    elBtnPaso.disabled = snap.ensamblajeCompleto;
    elBtnAuto.disabled = snap.ensamblajeCompleto;
    elBtnDesmontar.disabled = snap.fase === 0;
    elBtnPlay.disabled = !snap.ensamblajeCompleto;
    elBtnPlay.classList.toggle("activo-operando", snap.operando);

    elTxtPlay.textContent = snap.operando ? "Pausar" : "Iniciar";
    elIcoPlay.setAttribute("href", `${SPRITE_URL}#icono-${snap.operando ? "pausa" : "play"}`);

    if (snap.operando) {
      fijarBadgeGlobal("Gemelo en operación", "ok");
    } else if (snap.ensamblajeCompleto) {
      fijarBadgeGlobal("Planta ensamblada · En espera", "ok");
    } else {
      fijarBadgeGlobal(`Ensamblaje (${snap.fase}/${snap.totalFases})`, "aviso");
    }
  }

  function renderizarKpis(resumen) {
    const tarjetas = [
      ["Tiempo", formatearReloj(resumen.tiempo)],
      ["Ingresadas", resumen.ingresadas],
      ["Clasificadas", resumen.clasificadas],
      ["Merma", resumen.rechazadas],
      ["Pureza", `${resumen.purezaPct.toFixed(1)} %`],
      ["Caudal", `${Math.round(resumen.porHora)} /h`],
      ["Recuperado", `${resumen.masaRecuperadaKg.toFixed(2)} kg`],
      ["Potencia", `${resumen.potenciaKw.toFixed(1)} kW`],
      ["Consumo esp.", `${resumen.whPorKg.toFixed(1)} Wh/kg`],
    ];
    elKpis.innerHTML = tarjetas
      .map(([etiqueta, valor]) => `<div class="kpi"><b>${valor}</b><span>${etiqueta}</span></div>`)
      .join("");
  }

  // Interacción colapsable responsiva del panel lateral
  function alternarPanelLateral() {
    const colapsado = elLayout.classList.toggle("panel-colapsado");
    elBtnColapsar.setAttribute("aria-expanded", String(!colapsado));
    elBtnColapsar.title = colapsado ? "Expandir panel de telemetría" : "Colapsar panel lateral";
  }
  elBtnColapsar.addEventListener("click", alternarPanelLateral);

  // Clic o teclado sobre pasos individuales para demostrar la Máquina de Estados (Fase 1..6)
  elListaPasos.addEventListener("click", (ev) => {
    const item = ev.target.closest("li[data-fase]");
    if (!item) return;
    bus.emit(EVENTOS.COMANDO_FASE, Number(item.dataset.fase));
  });
  elListaPasos.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const item = ev.target.closest("li[data-fase]");
    if (!item) return;
    ev.preventDefault();
    bus.emit(EVENTOS.COMANDO_FASE, Number(item.dataset.fase));
  });

  // Botones de acción -> emiten intenciones al EventBus
  elBtnPaso.addEventListener("click", () => bus.emit(EVENTOS.COMANDO_PASO_SIGUIENTE));
  elBtnAuto.addEventListener("click", () => bus.emit(EVENTOS.COMANDO_ENSAMBLAR_TODO));
  elBtnDesmontar.addEventListener("click", () => bus.emit(EVENTOS.COMANDO_DESMONTAR));
  elBtnPlay.addEventListener("click", () => bus.emit(EVENTOS.COMANDO_ALTERNAR_OPERACION));
  elBtnReiniciar.addEventListener("click", () => bus.emit(EVENTOS.COMANDO_REINICIAR));

  elRngVelocidad.addEventListener("input", (e) => {
    const v = Number(e.target.value);
    elLblVelocidad.textContent = `${v}×`;
    bus.emit(EVENTOS.COMANDO_VELOCIDAD, v);
  });

  elRngFlujo.addEventListener("input", (e) => {
    const pzm = Number(e.target.value);
    elLblFlujo.textContent = String(pzm);
    bus.emit(EVENTOS.COMANDO_FLUJO, pzm);
  });

  document.querySelectorAll("[data-camara]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-camara]").forEach((b) => b.classList.remove("cam-activa"));
      btn.classList.add("cam-activa");
      bus.emit(EVENTOS.COMANDO_CAMARA, btn.dataset.camara);
    });
  });

  elBtnWireframe.addEventListener("click", () => {
    elBtnWireframe.classList.toggle("cam-activa");
    bus.emit(EVENTOS.COMANDO_WIREFRAME);
  });

  // Suscripciones del DOM al EventBus
  const etiquetasMat = { plastico: "Plástico PET", aluminio: "Aluminio", vidrio: "Vidrio" };
  const temporizadoresChip = {};
  const desuscripciones = [
    bus.on(EVENTOS.CARGA_3D_PROGRESO, ({ progreso, archivo }) => {
      elCargaTexto.textContent = `Cargando activos PBR (.glb)… ${Math.round(progreso * 100)} % (${archivo})`;
    }),
    bus.on(EVENTOS.MOTOR_3D_LISTO, ({ webglVersion, havokActivo }) => {
      elCarga.classList.add("oculto");
      registrarEventoLog(
        `Motor Babylon.js v9 listo (WebGL${webglVersion}, HDRI + MSAA + Bloom, Havok: ${havokActivo ? "activo" : "cinemático"})`,
        "ok",
      );
    }),
    bus.on(EVENTOS.MOTOR_3D_ERROR, (mensaje) => {
      elCargaTexto.textContent = `Error al iniciar WebGL: ${mensaje}`;
      fijarBadgeGlobal("Error 3D", "aviso");
      registrarEventoLog(`Fallo motor 3D: ${mensaje}`, "mal");
    }),
    bus.on(EVENTOS.ESTADO_PLANTA, (snap) => {
      renderizarPasos(snap);
      if (snap.pasoActual && snap.estado.startsWith("FASE_")) {
        registrarEventoLog(`[${snap.estado}] ${snap.pasoActual.titulo}`, "ok");
      } else if (snap.fase === 0) {
        registrarEventoLog("[FASE_0] Planta desmontada completamente", "info");
      } else {
        registrarEventoLog(`Estado operativo -> ${snap.estado}`, "info");
      }
    }),
    bus.on(EVENTOS.SENSOR_DETECCION, (ev) => {
      const chip = chipsSensor[ev.estacion];
      if (chip) {
        chip.classList.toggle("pulso-ok", ev.detectado);
        chip.classList.toggle("pulso-fallo", !ev.detectado);
        clearTimeout(temporizadoresChip[ev.estacion]);
        temporizadoresChip[ev.estacion] = setTimeout(() => {
          chip.classList.remove("pulso-ok", "pulso-fallo");
        }, 420);
      }
      const matNombre = etiquetasMat[ev.material] ?? ev.material;
      if (ev.detectado) {
        registrarEventoLog(
          `Sensor ${ev.nombreEstacion}: #${ev.itemId} ${matNombre} (conf. ${(ev.confianza * 100).toFixed(0)}%, FIFO:${ev.colaFifoLen})`,
          "ok",
          ev.t,
        );
      } else {
        registrarEventoLog(`Sensor ${ev.nombreEstacion}: #${ev.itemId} ${matNombre} no clasificado`, "mal", ev.t);
      }
    }),
    bus.on(EVENTOS.ITEM_RECHAZADO, (ev) => {
      registrarEventoLog(`#${ev.itemId} (${etiquetasMat[ev.material]}) cayó a tolva de merma`, "mal", ev.t);
    }),
    bus.on(EVENTOS.TELEMETRIA_TICK, (resumen) => {
      renderizarKpis(resumen);
    }),
    bus.on(EVENTOS.RENDIMIENTO_3D, ({ fps, frameMs, havokActivo }) => {
      elHudFps.textContent = `${fps} FPS · ${frameMs} ms · ${havokActivo ? "Havok V2" : "SpatialSim"}`;
    }),
    bus.on(EVENTOS.COMANDO_REINICIAR, () => {
      elLog.replaceChildren();
      registrarEventoLog("Telemetría y contadores reiniciados", "info");
    }),
  ];

  if (config.manifest?.name) {
    registrarEventoLog(`Configuración cargada: ${config.manifest.name} v${config.manifest.version}`, "info");
  }
  renderizarPasos(stateMachine.snapshot());

  return {
    renderizarKpis,
    dispose() {
      desuscripciones.forEach((off) => off());
    },
  };
}
