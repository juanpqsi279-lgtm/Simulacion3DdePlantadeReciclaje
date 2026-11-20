// src/ui/domController.js
// Controlador de Interfaz HTML5/DOM en Vanilla JS puro.
// Suscrito al EventBus: gestiona HUD en primera persona tipo Minecraft, hotbar de inventario,
// modal de configuración y atornillado al colocar cada pieza, Laboratorio STEAM y telemetría.

import { EVENTOS } from "../core/bus/eventBus.js";
import {
  CONFIG_SENSORES_DEFAULT,
  ESPEC_SENSORES,
  PARAMETROS_MAQUINA_SUGERIDOS,
  evaluarSensorEstacion,
} from "../core/assembly/reglasMontaje.js";

// El sprite de iconos está en línea dentro de index.html (funciona tanto en localhost como empaquetado).
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

const ETIQUETAS_CORTAS = {
  banda: "Banda",
  tolva: "Tolva",
  separador: "Aluminio",
  escaner: "Plástico",
  desviador: "Vidrio",
  cont_aluminio: "Cesto Al",
  cont_plastico: "Cesto PET",
  cont_vidrio: "Cesto Vidrio",
  robot_walle: "WALL-E",
};

const ESPEC_PARAMETROS_MAQUINAS = [
  {
    modulo: "banda",
    titulo: "Banda Transportadora",
    controles: [
      {
        campo: "velocidadBandaMps",
        etiqueta: "Velocidad lineal de cinta",
        unidad: "m/s",
        min: 0.2,
        max: 1.4,
        step: 0.05,
        decimales: 2,
        sugerido: PARAMETROS_MAQUINA_SUGERIDOS.banda.velocidadBandaMps,
        optMin: 0.45,
        optMax: 0.9,
      },
      {
        campo: "tensionRodillosPct",
        etiqueta: "Tensión de rodillos",
        unidad: "%",
        min: 35,
        max: 100,
        step: 1,
        decimales: 0,
        sugerido: PARAMETROS_MAQUINA_SUGERIDOS.banda.tensionRodillosPct,
        optMin: 70,
        optMax: 98,
      },
      {
        campo: "potenciaMotorKw",
        etiqueta: "Potencia del motor motriz",
        unidad: "kW",
        min: 0.8,
        max: 6.0,
        step: 0.2,
        decimales: 1,
        sugerido: PARAMETROS_MAQUINA_SUGERIDOS.banda.potenciaMotorKw,
        optMin: 2.2,
        optMax: 4.5,
      },
    ],
  },
  {
    modulo: "tolva",
    titulo: "Tolva Vibratoria de Entrada",
    controles: [
      {
        campo: "potenciaVibradorKw",
        etiqueta: "Potencia del alimentador vibratorio",
        unidad: "kW",
        min: 0.1,
        max: 1.5,
        step: 0.05,
        decimales: 2,
        sugerido: PARAMETROS_MAQUINA_SUGERIDOS.tolva.potenciaVibradorKw,
        optMin: 0.4,
        optMax: 0.9,
      },
      {
        campo: "aperturaCompuertaPct",
        etiqueta: "Apertura de compuerta dosificadora",
        unidad: "%",
        min: 15,
        max: 100,
        step: 5,
        decimales: 0,
        sugerido: PARAMETROS_MAQUINA_SUGERIDOS.tolva.aperturaCompuertaPct,
        optMin: 55,
        optMax: 95,
      },
    ],
  },
  {
    modulo: "separador",
    titulo: "Separador Eddy Current (Aluminio)",
    controles: [
      {
        campo: "rpmTambor",
        etiqueta: "RPM rotor magnético Foucault",
        unidad: "RPM",
        min: 800,
        max: 4000,
        step: 100,
        decimales: 0,
        sugerido: PARAMETROS_MAQUINA_SUGERIDOS.separador.rpmTambor,
        optMin: 1800,
        optMax: 3400,
      },
    ],
  },
  {
    modulo: "escaner",
    titulo: "Escáner NIR (Plástico PET)",
    controles: [
      {
        campo: "longitudOndaNm",
        etiqueta: "Longitud de onda espectrométrica",
        unidad: "nm",
        min: 1100,
        max: 2100,
        step: 20,
        decimales: 0,
        sugerido: PARAMETROS_MAQUINA_SUGERIDOS.escaner.longitudOndaNm,
        optMin: 1520,
        optMax: 1780,
      },
    ],
  },
  {
    modulo: "desviador",
    titulo: "Desviador Óptico (Vidrio)",
    controles: [
      {
        campo: "sensibilidadOpticaPct",
        etiqueta: "Sensibilidad óptica umbral n=1.52",
        unidad: "%",
        min: 35,
        max: 100,
        step: 1,
        decimales: 0,
        sugerido: PARAMETROS_MAQUINA_SUGERIDOS.desviador.sensibilidadOpticaPct,
        optMin: 70,
        optMax: 98,
      },
    ],
  },
  {
    modulo: "cont_aluminio",
    titulo: "Cesto de Aluminio",
    controles: [
      {
        campo: "torqueAnclajeNm",
        etiqueta: "Torque de pernos de anclaje al piso",
        unidad: "N·m",
        min: 25,
        max: 140,
        step: 5,
        decimales: 0,
        sugerido: PARAMETROS_MAQUINA_SUGERIDOS.cont_aluminio.torqueAnclajeNm,
        optMin: 60,
        optMax: 120,
      },
    ],
  },
  {
    modulo: "cont_plastico",
    titulo: "Cesto de Plástico PET",
    controles: [
      {
        campo: "torqueAnclajeNm",
        etiqueta: "Torque de pernos de anclaje al piso",
        unidad: "N·m",
        min: 25,
        max: 140,
        step: 5,
        decimales: 0,
        sugerido: PARAMETROS_MAQUINA_SUGERIDOS.cont_plastico.torqueAnclajeNm,
        optMin: 60,
        optMax: 120,
      },
    ],
  },
  {
    modulo: "cont_vidrio",
    titulo: "Cesto de Vidrio",
    controles: [
      {
        campo: "torqueAnclajeNm",
        etiqueta: "Torque de pernos de anclaje al piso",
        unidad: "N·m",
        min: 25,
        max: 140,
        step: 5,
        decimales: 0,
        sugerido: PARAMETROS_MAQUINA_SUGERIDOS.cont_vidrio.torqueAnclajeNm,
        optMin: 60,
        optMax: 120,
      },
    ],
  },
  {
    modulo: "robot_walle",
    titulo: "Robot Recolector WALL-E",
    controles: [
      {
        campo: "velocidadMps",
        etiqueta: "Velocidad de patrulla y retorno",
        unidad: "m/s",
        min: 1.0,
        max: 6.0,
        step: 0.2,
        decimales: 1,
        sugerido: PARAMETROS_MAQUINA_SUGERIDOS.robot_walle.velocidadMps,
        optMin: 2.2,
        optMax: 4.5,
      },
      {
        campo: "potenciaBrazoW",
        etiqueta: "Potencia de brazo elevador",
        unidad: "W",
        min: 100,
        max: 400,
        step: 10,
        decimales: 0,
        sugerido: PARAMETROS_MAQUINA_SUGERIDOS.robot_walle.potenciaBrazoW,
        optMin: 160,
        optMax: 320,
      },
    ],
  },
];

const OPC_TRANSDUCTOR = [
  ["foucault", "Bobina Foucault (inducción EM)"],
  ["nir", "Sensor NIR (infrarrojo 1660 nm)"],
  ["optico", "Haz óptico (refracción láser)"],
];
const OPC_CONDICION = [
  ["conductividad_alta", "Conductividad no ferrosa (Al)"],
  ["absorcion_nir", "Pico espectral polímero (PET)"],
  ["refraccion_alta", "Índice refracción n = 1.52 (Vidrio)"],
];
const OPC_SINCRONIA = [
  ["fifo_roi", "Cola FIFO + retardo d/v"],
  ["inmediato_sin_memoria", "Disparo inmediato (sin memoria)"],
];
const ET_T_CORTO = { foucault: "Foucault", nir: "NIR", optico: "Óptico" };
const ET_C_CORTO = { conductividad_alta: "Conductividad", absorcion_nir: "Espectro PET", refraccion_alta: "n=1.52" };
const ET_S_CORTO = { fifo_roi: "FIFO(d/v)", inmediato_sin_memoria: "Directo" };
const CIRCUNFERENCIA_ANILLO = 94.25;

export function inicializarDomController(config, stateMachine, bus) {
  const $ = (id) => document.getElementById(id);

  const elLayout = $("layout-principal");
  const elBtnColapsar = $("btn-colapsar-panel");
  const elBtnModoMc = $("btn-modo-mc");
  const elBannerLock = $("banner-pointerlock");
  const elPillModoMov = $("pill-modo-mov");
  const elCanvas3d = $("canvas3d");
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
  const elPanelSensoresSteam = $("panel-sensores-steam");
  const elBtnRetoSteam = $("btn-reto-steam");
  const elBtnCalibrarSensores = $("btn-calibrar-sensores");
  const elPanelConfigMaquinas = $("panel-config-maquinas");
  const elBtnValoresSugeridos = $("btn-valores-sugeridos");
  const elEtiquetaMirilla = $("etiqueta-mirilla");
  const elProgAtornillar = $("progreso-atornillar");
  const elAnilloAtornillar = $("anillo-atornillar");
  const elHotbarInventario = $("hotbar-inventario");
  const elBtnRecogerTodo = $("btn-recoger-todo");
  const elBtnDevolverAlmacen = $("btn-devolver-almacen");

  // Modal emergente de configuración al colocar cada pieza
  const elModalPieza = $("modal-config-pieza");
  const elModalTitulo = $("modal-pieza-titulo");
  const elModalDesc = $("modal-pieza-desc");
  const elModalBadgeAnclaje = $("modal-pieza-badge-anclaje");
  const elModalCampos = $("modal-pieza-campos");
  const elBtnModalSugerido = $("btn-modal-sugerido");
  const elBtnModalAtornillar = $("btn-modal-atornillar");
  const elBtnModalCerrar = $("btn-modal-cerrar");

  const chipsSensor = {
    separador: $("chip-sensor-aluminio"),
    escaner: $("chip-sensor-plastico"),
    desviador: $("chip-sensor-vidrio"),
  };

  let equipadoInventarioId = null;
  let modalPiezaId = null;
  let controlesModalActivos = [];
  let tarjetaSensorModal = null;
  let ultimoSnapshot = stateMachine.snapshot();
  let estadoMovilidadActual = {
    pointerLock: false,
    volando: false,
    agachado: false,
    corriendo: false,
    agarrandoId: null,
    atornillandoId: null,
    progresoAtornillar: 0,
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

  // Helpers compartidos para crear filas de parámetro y tarjetas de sensores STEAM sin duplicación
  function crearFilaParametro(modulo, spec) {
    const row = document.createElement("div");
    row.className = "param-row";
    row.innerHTML = `
      <div class="param-row__top">
        <span>${spec.etiqueta}</span>
        <b data-role="valor">${spec.sugerido.toFixed(spec.decimales)} ${spec.unidad}</b>
      </div>
      <input type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}" value="${spec.sugerido}" />
      <div class="param-row__meta">
        <span class="param-row__sugerido">Sugerido: <b>${spec.sugerido.toFixed(spec.decimales)} ${spec.unidad}</b></span>
        <span class="param-row__estado ok" data-role="estado">Óptimo</span>
      </div>
    `;
    const input = row.querySelector("input");
    const elValor = row.querySelector('[data-role="valor"]');
    const elEstado = row.querySelector('[data-role="estado"]');
    input.addEventListener("input", () => {
      bus.emit(EVENTOS.COMANDO_PARAM_MAQUINA, {
        modulo,
        cambios: { [spec.campo]: Number(input.value) },
      });
    });
    return { row, ctrl: { modulo, spec, input, elValor, elEstado } };
  }

  function sincronizarControlParametro(ctrl, params) {
    const val = params?.[ctrl.modulo]?.[ctrl.spec.campo];
    if (val === undefined) return;
    if (Number(ctrl.input.value) !== Number(val)) ctrl.input.value = String(val);
    ctrl.elValor.textContent = `${Number(val).toFixed(ctrl.spec.decimales)} ${ctrl.spec.unidad}`;
    const ok = Number(val) >= ctrl.spec.optMin && Number(val) <= ctrl.spec.optMax;
    ctrl.elEstado.textContent = ok
      ? "✔ En rango sugerido"
      : Number(val) < ctrl.spec.optMin
        ? "⚠ Bajo (puede fallar)"
        : "⚠ Excesivo";
    ctrl.elEstado.classList.toggle("ok", ok);
    ctrl.elEstado.classList.toggle("mal", !ok);
  }

  function crearTarjetaSensorSteam(estId) {
    const spec = ESPEC_SENSORES[estId];
    if (!spec) return null;
    const opcionesHtml = (lista) => lista.map(([v, txt]) => `<option value="${v}">${txt}</option>`).join("");
    const art = document.createElement("article");
    art.className = "sensor-card";
    art.innerHTML = `
      <div class="sensor-card__head">
        <strong>${spec.titulo}</strong>
        <span class="sensor-card__masa">Masa: ${spec.masaG} g · Sugerido: ${spec.flujoOptimoLpm} L/min</span>
      </div>
      <div class="sensor-card__grid">
        <label><span>1. Transductor (Ciencia)</span><select data-campo="transductor">${opcionesHtml(OPC_TRANSDUCTOR)}</select></label>
        <label><span>2. Comparador (Lógica)</span><select data-campo="condicion">${opcionesHtml(OPC_CONDICION)}</select></label>
        <label><span>3. Sincronización (Tecnología)</span><select data-campo="sincronizacion">${opcionesHtml(OPC_SINCRONIA)}</select></label>
      </div>
      <div class="sensor-card__formula" data-role="formula"></div>
      <div class="sensor-card__flujo">
        <div class="sensor-card__flujo-head">
          <span>4. Flujo de aire (Matemáticas)</span>
          <b data-role="flujo-valor">${spec.flujoOptimoLpm} L/min</b>
        </div>
        <input type="range" data-campo="flujoAireLpm" min="20" max="450" step="5" value="${spec.flujoOptimoLpm}" />
        <div class="sensor-card__diag" data-role="diagnostico"></div>
      </div>
    `;

    for (const sel of art.querySelectorAll("select[data-campo]")) {
      sel.addEventListener("change", () => {
        bus.emit(EVENTOS.COMANDO_CONFIG_SENSOR, {
          estacion: estId,
          cambios: { [sel.dataset.campo]: sel.value },
        });
      });
    }
    const rng = art.querySelector('input[data-campo="flujoAireLpm"]');
    rng.addEventListener("input", () => {
      bus.emit(EVENTOS.COMANDO_CONFIG_SENSOR, {
        estacion: estId,
        cambios: { flujoAireLpm: Number(rng.value) },
      });
    });

    return {
      estId,
      art,
      transductor: art.querySelector('select[data-campo="transductor"]'),
      condicion: art.querySelector('select[data-campo="condicion"]'),
      sincronizacion: art.querySelector('select[data-campo="sincronizacion"]'),
      flujo: rng,
      flujoValor: art.querySelector('[data-role="flujo-valor"]'),
      formula: art.querySelector('[data-role="formula"]'),
      diagnostico: art.querySelector('[data-role="diagnostico"]'),
    };
  }

  function sincronizarTarjetaSensor(dom, sensores) {
    if (!dom || !sensores) return;
    const cfg = sensores[dom.estId];
    const ev = evaluarSensorEstacion(dom.estId, cfg);
    if (!cfg || !ev) return;

    if (dom.transductor.value !== cfg.transductor) dom.transductor.value = cfg.transductor;
    if (dom.condicion.value !== cfg.condicion) dom.condicion.value = cfg.condicion;
    if (dom.sincronizacion.value !== cfg.sincronizacion) dom.sincronizacion.value = cfg.sincronizacion;
    if (Number(dom.flujo.value) !== Number(cfg.flujoAireLpm)) dom.flujo.value = String(cfg.flujoAireLpm);

    dom.flujoValor.textContent = `${cfg.flujoAireLpm} L/min`;
    dom.formula.textContent =
      `f(x) = SI(${ET_T_CORTO[cfg.transductor]} ∧ ${ET_C_CORTO[cfg.condicion]}) → ${ET_S_CORTO[cfg.sincronizacion]} ` +
      (ev.funcionInternaOk ? "✔" : "✖");
    dom.formula.classList.toggle("ok", ev.funcionInternaOk);
    dom.formula.classList.toggle("mal", !ev.funcionInternaOk);

    const estadoTxt =
      ev.estadoFlujo === "optimo"
        ? "✔ Cae al cesto"
        : ev.estadoFlujo === "corto"
          ? "⚠ Chorro corto (cae antes)"
          : "⚠ Chorro excesivo (rebasa)";
    dom.diagnostico.textContent = `Δz = 1.30·(${cfg.flujoAireLpm}/${ev.spec.flujoOptimoLpm}) = ${ev.alcanceM.toFixed(2)} m · ${estadoTxt}`;
    dom.diagnostico.classList.toggle("ok", ev.estadoFlujo === "optimo");
    dom.diagnostico.classList.toggle("mal", ev.estadoFlujo !== "optimo");
  }

  function renderizarHotbarInventario(snap) {
    if (!elHotbarInventario) return;
    const invSet = new Set(snap.inventario ?? []);
    const instSet = new Set(snap.idsVisibles ?? []);
    const atornSet = new Set(snap.atornillados ?? []);
    if (equipadoInventarioId && !invSet.has(equipadoInventarioId)) {
      equipadoInventarioId = null;
    }

    elHotbarInventario.innerHTML = stateMachine.pasos
      .map((p, idx) => {
        const num = idx + 1;
        const enInv = invSet.has(p.id);
        const enPlanta = instSet.has(p.id);
        const atorn = enPlanta && atornSet.has(p.id);
        const activa = enInv && equipadoInventarioId === p.id;
        const claseEstado = enInv ? "en-inventario" : enPlanta ? "instalada" : "en-esquina";
        const tag = enInv ? (activa ? "EQUIPADA" : "EN BOLSA") : enPlanta ? (atorn ? "FIJA ✔" : "SIN FIJAR") : "ESQUINA";
        const hint = enInv
          ? `Clic o tecla ${num} para equipar y colocar con clic izquierdo en el piso`
          : enPlanta
            ? `${p.titulo} instalada en planta · clic para recoger al inventario`
            : `${p.titulo} en la esquina · clic para recoger al inventario`;
        return `<button type="button" class="hotbar__slot ${claseEstado}${activa ? " activa" : ""}" data-slot-id="${p.id}" title="${hint}">
          <span class="hotbar__num">${num}</span>
          ${svgIcono(p.icono.replace(".svg", ""))}
          <span class="hotbar__nombre">${ETIQUETAS_CORTAS[p.id] ?? p.titulo}</span>
          <span class="hotbar__tag">${tag}</span>
        </button>`;
      })
      .join("");
  }

  function renderizarPasos(snap) {
    ultimoSnapshot = snap;
    const invSet = new Set(snap.inventario ?? []);
    const atornSet = new Set(snap.atornillados ?? []);
    elProgresoEnsamblaje.style.width = `${Math.round(snap.progreso * 100)}%`;
    elEstadoFsm.textContent = snap.estado;
    elEstadoFsm.dataset.estado = snap.operando ? "operando" : snap.ensamblajeCompleto ? "listo" : "montaje";
    elResumenMontaje.textContent = `${snap.fase}/${snap.totalFases} colocadas · ${atornSet.size} atornilladas · ${invSet.size} inv. · ${snap.potenciaInstaladaKw.toFixed(1)} kW`;

    elListaPasos.innerHTML = stateMachine.pasos
      .map((p) => {
        const completado = snap.idsVisibles.includes(p.id);
        const atornillado = completado && atornSet.has(p.id);
        const enInv = invSet.has(p.id);
        const pos = snap.posiciones?.[p.id];
        const movido = completado && pos && (pos.dx !== 0 || pos.dz !== 0);
        const estadoTexto = completado
          ? atornillado
            ? movido
              ? "Movido · Fija"
              : "Fijada ✔"
            : movido
              ? "Movido · Sin fijar"
              : "Sin atornillar"
          : enInv
            ? "Inventario"
            : "Esquina";
        const nombreIco = completado ? "correcto" : p.icono.replace(".svg", "");
        const titulo = completado
          ? "Clic para devolver a la esquina · usa [F] en 3D para atornillar"
          : enInv
            ? "Clic para equipar desde tu inventario y colocarlo en el piso"
            : "Clic para colocar en zona sugerida y abrir su configuración";
        const btnInvTxt = enInv ? "↩ Esquina" : "🎒 Inv.";
        const clases = [
          completado ? "hecho" : "",
          completado && !atornillado ? "sin-atornillar" : "",
          movido ? "movido" : "",
          enInv ? "en-inventario" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return `<li class="${clases}" data-paso="${p.id}" draggable="${completado ? "false" : "true"}" tabindex="0" role="button" title="${titulo}">
          ${svgIcono(nombreIco)}
          <div>
            <strong>${p.titulo}</strong>
            <small>${p.detalle} · ${p.tiempoEstimadoMin} min · ${p.potenciaKw} kW</small>
          </div>
          <div class="pasos__acciones">
            <span class="pasos__estado">${estadoTexto}</span>
            <button type="button" class="pasos__btn-cfg" data-accion="cfg-pieza" data-paso="${p.id}" title="Configurar valores y atornillar">⚙</button>
            <button type="button" class="pasos__btn-inv" data-accion="toggle-inv" data-paso="${p.id}" title="${enInv ? "Devolver a esquina" : "Guardar en inventario"}">${btnInvTxt}</button>
          </div>
        </li>`;
      })
      .join("");

    elBtnDesmontar.disabled = snap.fase === 0 && invSet.size === 0;
    elBtnPlay.disabled = false;
    elBtnPlay.classList.toggle("activo-operando", snap.operando);

    elTxtPlay.textContent = snap.operando ? "Pausar" : "Encender";
    elIcoPlay.setAttribute("href", `${SPRITE_URL}#icono-${snap.operando ? "pausa" : "play"}`);

    if (snap.operando) {
      const hayAlertas = snap.avisos.some((a) => a.severidad === "aviso");
      fijarBadgeGlobal(
        hayAlertas ? `Encendida con avisos (${snap.fase}/${snap.totalFases})` : "Gemelo en operación",
        hayAlertas ? "aviso" : "ok",
      );
    } else if (snap.ensamblajeCompleto) {
      fijarBadgeGlobal(
        atornSet.size >= snap.totalFases ? "Planta armada y fijada ✔" : "Faltan piezas por atornillar",
        atornSet.size >= snap.totalFases ? "ok" : "aviso",
      );
    } else if (snap.fase === 0 && invSet.size === 0) {
      fijarBadgeGlobal("Modo Minecraft · Camina y arma la planta", "aviso");
    } else {
      fijarBadgeGlobal(`Montaje libre (${snap.fase}/${snap.totalFases} · ${atornSet.size} fijas)`, "aviso");
    }

    renderizarHotbarInventario(snap);
    renderizarAvisos(snap);
    actualizarPanelSensoresSteam(snap);
    actualizarPanelConfigMaquinas(snap);
    actualizarModalPieza(snap);
  }

  // ───── Panel lateral: Configuración Técnica Detallada de las 9 Máquinas ─────
  const controlesMaquinaDom = [];
  if (elPanelConfigMaquinas) {
    for (const grupo of ESPEC_PARAMETROS_MAQUINAS) {
      const box = document.createElement("article");
      box.className = "maquina-card";
      const head = document.createElement("div");
      head.className = "maquina-card__head";
      head.innerHTML = `<strong>${grupo.titulo}</strong>`;
      box.append(head);

      for (const spec of grupo.controles) {
        const { row, ctrl } = crearFilaParametro(grupo.modulo, spec);
        box.append(row);
        controlesMaquinaDom.push(ctrl);
      }
      elPanelConfigMaquinas.append(box);
    }
  }

  function actualizarPanelConfigMaquinas(snap) {
    if (!snap.parametrosMaquina) return;
    for (const item of controlesMaquinaDom) {
      sincronizarControlParametro(item, snap.parametrosMaquina);
    }
  }

  // ───── Panel lateral: Laboratorio STEAM ─────
  const tarjetasSensorDom = {};
  if (elPanelSensoresSteam) {
    for (const estId of ["separador", "escaner", "desviador"]) {
      const card = crearTarjetaSensorSteam(estId);
      if (card) {
        elPanelSensoresSteam.append(card.art);
        tarjetasSensorDom[estId] = card;
      }
    }
  }

  function actualizarPanelSensoresSteam(snap) {
    if (!snap.sensores) return;
    for (const estId of ["separador", "escaner", "desviador"]) {
      sincronizarTarjetaSensor(tarjetasSensorDom[estId], snap.sensores);
    }
  }

  // ───── Modal emergente al colocar o configurar una pieza [R] ─────
  function abrirModalConfigPieza(id) {
    if (!elModalPieza || !id) return;
    const paso = stateMachine.pasos.find((p) => p.id === id);
    const grupo = ESPEC_PARAMETROS_MAQUINAS.find((g) => g.modulo === id);
    if (!paso) return;

    if (document.pointerLockElement) document.exitPointerLock?.();
    modalPiezaId = id;
    elModalTitulo.textContent = `Configurar: ${paso.titulo}`;
    elModalDesc.textContent = `${paso.detalle} · Ajusta los parámetros operativos y fija los pernos de anclaje.`;

    elModalCampos.replaceChildren();
    controlesModalActivos = [];
    tarjetaSensorModal = null;

    if (grupo) {
      const card = document.createElement("div");
      card.className = "maquina-card";
      for (const spec of grupo.controles) {
        const { row, ctrl } = crearFilaParametro(grupo.modulo, spec);
        card.append(row);
        controlesModalActivos.push(ctrl);
      }
      elModalCampos.append(card);
    }

    if (["separador", "escaner", "desviador"].includes(id)) {
      const cardSteam = crearTarjetaSensorSteam(id);
      if (cardSteam) {
        elModalCampos.append(cardSteam.art);
        tarjetaSensorModal = cardSteam;
      }
    }

    elModalPieza.hidden = false;
    actualizarModalPieza(ultimoSnapshot);
    if (elBannerLock) elBannerLock.hidden = true;
  }

  function cerrarModalPieza() {
    if (!elModalPieza) return;
    elModalPieza.hidden = true;
    modalPiezaId = null;
    controlesModalActivos = [];
    tarjetaSensorModal = null;
    if (elBannerLock) elBannerLock.hidden = estadoMovilidadActual.pointerLock;
  }

  function actualizarModalPieza(snap) {
    if (!modalPiezaId || !elModalPieza || elModalPieza.hidden) return;
    for (const ctrl of controlesModalActivos) {
      sincronizarControlParametro(ctrl, snap.parametrosMaquina);
    }
    if (tarjetaSensorModal) {
      sincronizarTarjetaSensor(tarjetaSensorModal, snap.sensores);
    }

    const instalado = (snap.idsVisibles ?? []).includes(modalPiezaId);
    const atorn = instalado && (snap.atornillados ?? []).includes(modalPiezaId);
    elModalBadgeAnclaje.textContent = !instalado
      ? "En almacén / inventario"
      : atorn
        ? "Atornillada ✔"
        : "Sin atornillar — vibra al encender";
    elModalBadgeAnclaje.classList.toggle("ok", atorn);

    if (elBtnModalAtornillar) {
      elBtnModalAtornillar.disabled = !instalado;
      const torque = snap.parametrosMaquina?.[modalPiezaId]?.torqueAnclajeNm ?? 85;
      elBtnModalAtornillar.innerHTML = `${svgIcono("llave")} ${atorn ? "Desatornillar pieza" : `Atornillar pieza (${torque} N·m)`}`;
      elBtnModalAtornillar.classList.toggle("activo-operando", atorn);
    }
  }

  elBtnModalCerrar?.addEventListener("click", cerrarModalPieza);
  elModalPieza?.addEventListener("click", (ev) => {
    if (ev.target === elModalPieza) cerrarModalPieza();
  });
  elBtnModalAtornillar?.addEventListener("click", () => {
    if (!modalPiezaId) return;
    bus.emit(EVENTOS.COMANDO_ATORNILLAR, {
      id: modalPiezaId,
      atornillado: !stateMachine.estaAtornillado(modalPiezaId),
    });
  });
  elBtnModalSugerido?.addEventListener("click", () => {
    if (!modalPiezaId) return;
    const def = PARAMETROS_MAQUINA_SUGERIDOS[modalPiezaId];
    if (def) {
      bus.emit(EVENTOS.COMANDO_PARAM_MAQUINA, { modulo: modalPiezaId, cambios: structuredClone(def) });
    }
    if (CONFIG_SENSORES_DEFAULT[modalPiezaId]) {
      bus.emit(EVENTOS.COMANDO_CONFIG_SENSOR, {
        estacion: modalPiezaId,
        cambios: structuredClone(CONFIG_SENSORES_DEFAULT[modalPiezaId]),
      });
    }
  });

  // Avisos no bloqueantes
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
    setTimeout(quitar, 10000);
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

  // Interacción colapsable responsiva del panel lateral [Tab]
  function alternarPanelLateral() {
    const colapsado = elLayout.classList.toggle("panel-colapsado");
    elBtnColapsar.setAttribute("aria-expanded", String(!colapsado));
    elBtnColapsar.title = colapsado ? "Expandir panel lateral [Tab]" : "Colapsar panel lateral [Tab]";
  }
  elBtnColapsar.addEventListener("click", alternarPanelLateral);

  const solicitarPointerLock = () => {
    try {
      elCanvas3d?.requestPointerLock?.();
    } catch {}
  };
  elBtnModoMc?.addEventListener("click", solicitarPointerLock);
  elBannerLock?.addEventListener("click", solicitarPointerLock);

  // Montaje libre, configuración e inventario desde lista
  function alternarPasoDesdeLista(item) {
    const id = item?.dataset.paso;
    if (!id) return;
    if (stateMachine.inventario.has(id)) {
      const siguiente = equipadoInventarioId === id ? null : id;
      bus.emit(EVENTOS.COMANDO_SELECCIONAR_INVENTARIO, { id: siguiente });
      return;
    }
    bus.emit(stateMachine.estaInstalado(id) ? EVENTOS.COMANDO_QUITAR : EVENTOS.COMANDO_COLOCAR, { id });
  }
  elListaPasos.addEventListener("click", (ev) => {
    const btnCfg = ev.target.closest('button[data-accion="cfg-pieza"]');
    if (btnCfg) {
      ev.stopPropagation();
      abrirModalConfigPieza(btnCfg.dataset.paso);
      return;
    }
    const btnInv = ev.target.closest('button[data-accion="toggle-inv"]');
    if (btnInv) {
      ev.stopPropagation();
      const id = btnInv.dataset.paso;
      if (stateMachine.inventario.has(id)) {
        bus.emit(EVENTOS.COMANDO_SACAR_INVENTARIO, { id });
      } else {
        bus.emit(EVENTOS.COMANDO_RECOGER_INVENTARIO, { id });
      }
      return;
    }
    alternarPasoDesdeLista(ev.target.closest("li[data-paso]"));
  });
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

  // Hotbar de Inventario Minecraft (clics, teclas 1..9 y rueda del ratón)
  elHotbarInventario?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-slot-id]");
    if (!btn) return;
    const id = btn.dataset.slotId;
    if (stateMachine.inventario.has(id)) {
      const nextId = equipadoInventarioId === id ? null : id;
      bus.emit(EVENTOS.COMANDO_SELECCIONAR_INVENTARIO, { id: nextId });
    } else {
      bus.emit(EVENTOS.COMANDO_RECOGER_INVENTARIO, { id });
    }
  });

  const onTeclaGlobal = (ev) => {
    if (ev.code === "Escape" && modalPiezaId) {
      cerrarModalPieza();
      return;
    }
    const tag = ev.target?.tagName?.toLowerCase();
    if (ev.code === "Tab" && tag !== "input" && tag !== "select" && tag !== "textarea") {
      ev.preventDefault();
      alternarPanelLateral();
      return;
    }
    if (tag === "input" || tag === "select" || tag === "textarea") return;
    const m = /^Digit([1-9])$/.exec(ev.code);
    if (!m) return;
    const idx = Number(m[1]) - 1;
    const paso = stateMachine.pasos[idx];
    if (!paso) return;
    if (stateMachine.inventario.has(paso.id)) {
      const nextId = equipadoInventarioId === paso.id ? null : paso.id;
      bus.emit(EVENTOS.COMANDO_SELECCIONAR_INVENTARIO, { id: nextId });
    } else {
      bus.emit(EVENTOS.COMANDO_RECOGER_INVENTARIO, { id: paso.id });
    }
  };
  window.addEventListener("keydown", onTeclaGlobal);

  const onRuedaHotbar = (ev) => {
    if (estadoMovilidadActual.agarrandoId || modalPiezaId) return;
    const enInv = stateMachine.pasos.filter((p) => stateMachine.inventario.has(p.id));
    if (enInv.length === 0) return;
    const dir = Math.sign(ev.deltaY);
    if (!dir) return;
    const idxActual = enInv.findIndex((p) => p.id === equipadoInventarioId);
    const nextIdx = idxActual === -1 ? 0 : (idxActual + dir + enInv.length) % enInv.length;
    bus.emit(EVENTOS.COMANDO_SELECCIONAR_INVENTARIO, { id: enInv[nextIdx].id });
  };
  elCanvas3d?.addEventListener("wheel", onRuedaHotbar, { passive: true });

  // Botones de acción -> EventBus
  elBtnDesmontar.addEventListener("click", () => bus.emit(EVENTOS.COMANDO_DESMONTAR));
  elBtnPlay.addEventListener("click", () => bus.emit(EVENTOS.COMANDO_ALTERNAR_OPERACION));
  elBtnReiniciar.addEventListener("click", () => bus.emit(EVENTOS.COMANDO_REINICIAR));
  elBtnRecogerTodo?.addEventListener("click", () => bus.emit(EVENTOS.COMANDO_RECOGER_TODO_INVENTARIO));
  elBtnDevolverAlmacen?.addEventListener("click", () => bus.emit(EVENTOS.COMANDO_DEVOLVER_ALMACEN));
  elBtnValoresSugeridos?.addEventListener("click", () =>
    bus.emit(EVENTOS.COMANDO_PARAM_MAQUINA, { modulo: "todos", cambios: { restaurarSugeridos: true } }),
  );
  elBtnRetoSteam?.addEventListener("click", () => bus.emit(EVENTOS.COMANDO_RETO_STEAM));
  elBtnCalibrarSensores?.addEventListener("click", () =>
    bus.emit(EVENTOS.COMANDO_CONFIG_SENSOR, { estacion: "todos", cambios: { restaurarOptimo: true } }),
  );

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

  elBtnWireframe?.addEventListener("click", () => {
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
        `Motor Babylon.js v9 listo (WebGL${webglVersion}, Primera Persona Minecraft + Atornillado 3D, Havok: ${havokActivo ? "activo" : "cinemático"})`,
        "ok",
      );
    }),
    bus.on(EVENTOS.MOTOR_3D_ERROR, (mensaje) => {
      elCargaTexto.textContent = `Error al iniciar WebGL: ${mensaje}`;
      fijarBadgeGlobal("Error 3D", "aviso");
      registrarEventoLog(`Fallo motor 3D: ${mensaje}`, "mal");
    }),
    bus.on(EVENTOS.COMANDO_SELECCIONAR_INVENTARIO, ({ id }) => {
      equipadoInventarioId = id && stateMachine.inventario.has(id) ? id : null;
      renderizarHotbarInventario(ultimoSnapshot);
    }),
    bus.on(EVENTOS.COMANDO_ABRIR_CONFIG_PIEZA, ({ id }) => {
      abrirModalConfigPieza(id);
    }),
    bus.on(EVENTOS.ESTADO_MOVILIDAD_FP, (ev) => {
      estadoMovilidadActual = ev;
      if (elPillModoMov) {
        const modoCam = ev.pointerLock ? "Minecraft" : "Cursor libre";
        const accion = ev.volando ? "Volando" : ev.agachado ? "Agachado" : ev.corriendo ? "Sprint" : "Caminando";
        const p = ev.agarrandoId ? stateMachine.pasos.find((x) => x.id === ev.agarrandoId) : null;
        elPillModoMov.textContent = `${modoCam} · ${accion}${p ? ` · Moviendo ${ETIQUETAS_CORTAS[p.id] ?? p.titulo}` : ""}`;
        elPillModoMov.classList.toggle("mc-activo", ev.pointerLock);
      }
      if (elBannerLock) {
        elBannerLock.hidden = ev.pointerLock || Boolean(modalPiezaId);
      }
      if (elProgAtornillar && elAnilloAtornillar) {
        const activo = ev.progresoAtornillar > 0;
        elProgAtornillar.classList.toggle("activo", activo);
        elAnilloAtornillar.style.strokeDashoffset = String(
          CIRCUNFERENCIA_ANILLO * (1 - (ev.progresoAtornillar || 0)),
        );
      }
      if (elEtiquetaMirilla && ev.agarrandoId) {
        const p = stateMachine.pasos.find((x) => x.id === ev.agarrandoId);
        elEtiquetaMirilla.textContent = `Moviendo: ${p?.titulo ?? ev.agarrandoId} · Rueda acerca/aleja · Clic o [G] colocar · [Esc] cancelar`;
        elEtiquetaMirilla.classList.remove("equipado");
        elEtiquetaMirilla.classList.add("agarrando");
        elEtiquetaMirilla.hidden = false;
      } else {
        elEtiquetaMirilla?.classList.remove("agarrando");
      }
    }),
    bus.on(EVENTOS.OBJETIVO_MIRILLA, ({ id, instalado, atornillado, equipadoId }) => {
      if (!elEtiquetaMirilla || estadoMovilidadActual.agarrandoId) return;
      if (equipadoId) {
        const p = stateMachine.pasos.find((x) => x.id === equipadoId);
        elEtiquetaMirilla.textContent = `Equipado: ${p?.titulo ?? equipadoId} · Clic izquierdo en el piso para montar y configurar ([Esc] cancelar)`;
        elEtiquetaMirilla.hidden = false;
        elEtiquetaMirilla.classList.add("equipado");
        return;
      }
      elEtiquetaMirilla.classList.remove("equipado");
      if (!id) {
        elEtiquetaMirilla.hidden = true;
        return;
      }
      const p = stateMachine.pasos.find((x) => x.id === id);
      if (instalado) {
        elEtiquetaMirilla.textContent = atornillado
          ? `${p?.titulo ?? id} (Fijada ✔) · [G] mover · [R] config · Mantén [F] soltar · [E] inv.`
          : `${p?.titulo ?? id} (Sin atornillar) · Mantén [F] atornillar · [G] mover · [R] config · [E] inv.`;
      } else {
        elEtiquetaMirilla.textContent = `${p?.titulo ?? id} (En almacén) · [E] recoger · [G]/clic arrastrar suave · [R] config`;
      }
      elEtiquetaMirilla.hidden = false;
    }),
    bus.on(EVENTOS.ESTADO_PLANTA, (snap) => {
      const idsAntes = idsPrevios;
      idsPrevios = snap.idsVisibles;
      renderizarPasos(snap);
      const titulo = (id) => stateMachine.pasos.find((p) => p.id === id)?.titulo ?? id;
      const colocados = snap.idsVisibles.filter((id) => !idsAntes.includes(id));
      const quitados = idsAntes.filter((id) => !snap.idsVisibles.includes(id));
      if (snap.fase === 0 && idsAntes.length > 0 && (snap.inventario?.length ?? 0) === 0) {
        registrarEventoLog("[FASE_0] Todas las piezas en la esquina de almacén", "info");
      } else if (colocados.length || quitados.length) {
        for (const id of colocados) registrarEventoLog(`[${snap.estado}] Colocado: ${titulo(id)} (sin atornillar)`, "ok");
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
      const detalleMotivo =
        ev.motivo === "flujo_corto"
          ? "por chorro de aire corto"
          : ev.motivo === "flujo_excesivo"
            ? "por chorro de aire excesivo"
            : ev.motivo === "tolva_sin_banda"
              ? "al piso (tolva sin banda debajo)"
              : ev.motivo === "fuera_de_banda"
                ? "al piso (banda desplazada)"
                : ev.motivo === "sin_cesto_en_destino"
                  ? "al piso (sin cesto en destino)"
                  : "a merma";
      registrarEventoLog(`#${ev.itemId} (${etiquetasMat[ev.material]}) cayó ${detalleMotivo}`, "mal", ev.t);
    }),
    bus.on(EVENTOS.ITEM_RECIRCULADO, (ev) => {
      registrarEventoLog(`WALL-E llevó #${ev.itemId} (${etiquetasMat[ev.material]}) al montón de basura -> sube al dispensador`, "ok", ev.t);
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
      window.removeEventListener("keydown", onTeclaGlobal);
      elCanvas3d?.removeEventListener("wheel", onRuedaHotbar);
    },
  };
}
