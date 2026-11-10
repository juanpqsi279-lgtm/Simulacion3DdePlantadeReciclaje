// src/ui/domController.js
// Controlador de Interfaz HTML5/DOM en Vanilla JS puro.
// Suscrito al EventBus: actualiza telemetría, badges de sensores, estados de la Máquina de Estados,
// panel lateral colapsable responsivo y microinteracciones sin tocar Babylon.js.

import { EVENTOS } from "../core/bus/eventBus.js";

// El sprite de iconos está en línea dentro de index.html (funciona al abrirlo con doble clic).
const SPRITE_URL = "";

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
  const elTarjetaAvisos = $("tarjeta-avisos");
  const elListaAvisos = $("lista-avisos");
  const elBadgeAvisos = $("badge-avisos");
  const elToasts = $("toasts");
  const elZonaSoltar = $("zona-soltar");
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
        const completado = snap.idsVisibles.includes(p.id);
        const clase = completado ? "hecho" : "";
        const nombreIco = completado ? "correcto" : p.icono.replace(".svg", "");
        const pos = snap.posiciones?.[p.id];
        const movido = completado && pos && (pos.dx !== 0 || pos.dz !== 0);
        const titulo = completado
          ? "Clic para quitar · arrastra la pieza en la escena para moverla"
          : "Clic para colocar · o arrástralo hasta la escena 3D";
        return `<li class="${clase}${movido ? " movido" : ""}" data-paso="${p.id}" draggable="${completado ? "false" : "true"}" tabindex="0" role="button" title="${titulo}">
          ${svgIcono(nombreIco)}
          <div>
            <strong>${p.titulo}</strong>
            <small>${p.detalle} · ${p.tiempoEstimadoMin} min · ${p.potenciaKw} kW</small>
          </div>
          <span class="pasos__estado">${completado ? (movido ? "Movido" : "Colocado") : "Disponible"}</span>
        </li>`;
      })
      .join("");

    elBtnDesmontar.disabled = snap.fase === 0;
    // Sin bloqueos: se puede iniciar con cualquier montaje; los avisos explican qué no funcionará.
    elBtnPlay.disabled = snap.fase === 0;
    elBtnPlay.classList.toggle("activo-operando", snap.operando);

    elTxtPlay.textContent = snap.operando ? "Pausar" : "Iniciar";
    elIcoPlay.setAttribute("href", `${SPRITE_URL}#icono-${snap.operando ? "pausa" : "play"}`);

    if (snap.operando) {
      fijarBadgeGlobal("Gemelo en operación", "ok");
    } else if (snap.ensamblajeCompleto) {
      fijarBadgeGlobal("Planta ensamblada · En espera", "ok");
    } else if (snap.fase === 0) {
      fijarBadgeGlobal("Planta vacía · Coloca los módulos", "aviso");
    } else {
      fijarBadgeGlobal(`Montaje libre (${snap.fase}/${snap.totalFases})`, "aviso");
    }
    renderizarAvisos(snap);
  }

  // Avisos de validación NO bloqueantes: panel permanente + aviso emergente cuando aparece uno nuevo
  const avisosYaNotificados = new Set();
  function renderizarAvisos(snap) {
    const avisos = snap.avisos ?? [];
    elTarjetaAvisos.hidden = avisos.length === 0;
    elBadgeAvisos.textContent = String(avisos.length);
    elListaAvisos.replaceChildren(
      ...avisos.map((a) => {
        const li = document.createElement("li");
        li.className = a.severidad;
        const b = document.createElement("strong");
        b.textContent = a.titulo;
        const s = document.createElement("span");
        s.textContent = a.mensaje;
        li.append(b, s);
        return li;
      }),
    );
    const ids = new Set(avisos.map((a) => a.id));
    for (const id of [...avisosYaNotificados]) if (!ids.has(id)) avisosYaNotificados.delete(id);
    for (const a of avisos) {
      if (avisosYaNotificados.has(a.id)) continue;
      avisosYaNotificados.add(a.id);
      // Los avisos "info" (módulos que simplemente aún no se han colocado) solo van al panel; no interrumpen
      if (a.severidad === "aviso") mostrarToast(a);
      registrarEventoLog(`Aviso: ${a.titulo}`, a.severidad === "aviso" ? "mal" : "info");
      bus.emit(EVENTOS.AVISO_MONTAJE, a);
    }
  }

  function mostrarToast(aviso) {
    const el = document.createElement("div");
    el.className = `toast ${aviso.severidad}`;
    el.setAttribute("role", "alert");
    const cuerpo = document.createElement("div");
    const t = document.createElement("strong");
    t.textContent = aviso.titulo;
    const m = document.createElement("span");
    m.textContent = aviso.mensaje;
    cuerpo.append(t, m);
    const cerrar = document.createElement("button");
    cerrar.type = "button";
    cerrar.className = "toast__cerrar";
    cerrar.setAttribute("aria-label", "Cerrar aviso");
    cerrar.textContent = "×";
    const quitar = () => {
      el.classList.add("saliendo");
      setTimeout(() => el.remove(), 260);
    };
    cerrar.addEventListener("click", quitar);
    el.append(cuerpo, cerrar);
    elToasts.append(el);
    while (elToasts.children.length > 4) elToasts.firstElementChild.remove();
    setTimeout(quitar, 11000);
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

  // Montaje libre: clic/teclado coloca o quita un módulo; arrastrar desde la lista lo suelta en la escena 3D
  function alternarPasoDesdeLista(item) {
    const id = item?.dataset.paso;
    if (!id) return;
    bus.emit(stateMachine.estaInstalado(id) ? EVENTOS.COMANDO_QUITAR : EVENTOS.COMANDO_COLOCAR, { id });
  }
  elListaPasos.addEventListener("click", (ev) => alternarPasoDesdeLista(ev.target.closest("li[data-paso]")));
  elListaPasos.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const item = ev.target.closest("li[data-paso]");
    if (!item) return;
    ev.preventDefault();
    alternarPasoDesdeLista(item);
  });
  elListaPasos.addEventListener("dragstart", (ev) => {
    const item = ev.target.closest("li[data-paso]");
    if (!item || stateMachine.estaInstalado(item.dataset.paso)) {
      ev.preventDefault();
      return;
    }
    ev.dataTransfer.setData("text/plain", item.dataset.paso);
    ev.dataTransfer.effectAllowed = "copy";
    elZonaSoltar.hidden = false;
  });
  elListaPasos.addEventListener("dragend", () => {
    elZonaSoltar.hidden = true;
  });
  document.addEventListener("drop", () => {
    elZonaSoltar.hidden = true;
  });

  // Botones de acción -> emiten intenciones al EventBus
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
  let idsPrevios = [];
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
      const idsAntes = idsPrevios;
      idsPrevios = snap.idsVisibles;
      renderizarPasos(snap);
      const titulo = (id) => stateMachine.pasos.find((p) => p.id === id)?.titulo ?? id;
      const colocados = snap.idsVisibles.filter((id) => !idsAntes.includes(id));
      const quitados = idsAntes.filter((id) => !snap.idsVisibles.includes(id));
      if (snap.fase === 0 && idsAntes.length > 0) {
        registrarEventoLog("[FASE_0] Planta desmontada completamente", "info");
      } else if (colocados.length || quitados.length) {
        for (const id of colocados) registrarEventoLog(`[${snap.estado}] Colocado: ${titulo(id)}`, "ok");
        for (const id of quitados) registrarEventoLog(`[${snap.estado}] Retirado: ${titulo(id)}`, "info");
      } else if (snap.estado !== snap.estadoAnterior) {
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
