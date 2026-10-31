import "./style.css";
import { Simulacion, ESTACIONES } from "./logica/simulacion.js";
import { Ensamblaje } from "./logica/ensamblaje.js";
import { crearEscena3D } from "./escena3d.js";
import { crearDashboard } from "./dashboard.js";
import { $, pintarPasos, pintarKpis, Registro } from "./ui.js";
import cfg from "./mocks/materiales.json";
import datosEnsamblaje from "./mocks/ensamblaje.json";
import historial from "./mocks/historial.json";

const estadoGlobal = $("estado-global");
const registro = new Registro($("log"));

function estado(texto, clase = "") {
  estadoGlobal.textContent = texto;
  estadoGlobal.className = `barra__estado ${clase}`.trim();
}

async function cargarManifest() {
  try {
    const r = await fetch("manifest.json");
    if (!r.ok) throw new Error(r.statusText);
    return await r.json();
  } catch (e) {
    registro.agregar(`No se pudo leer manifest.json (${e.message})`, "mal");
    return null;
  }
}

async function iniciar() {
  const manifest = await cargarManifest();
  if (manifest) registro.agregar(`Proyecto: ${manifest.name} v${manifest.version}`, "info");

  const etiquetas = { plastico: "plástico", aluminio: "aluminio", vidrio: "vidrio" };
  let planta;
  const sim = new Simulacion(cfg, {
    onEvento(e) {
      const nombre = etiquetas[e.item.tipo];
      if (e.tipo === "entrada") registro.agregar(`#${e.item.id} entra a la banda (${nombre})`, "info", e.t);
      else if (e.tipo === "expulsion") registro.agregar(`#${e.item.id} ${nombre} detectado en ${e.estacion}`, "ok", e.t);
      else if (e.tipo === "falloDeteccion") registro.agregar(`#${e.item.id} ${nombre} NO detectado en ${e.estacion}`, "mal", e.t);
      else if (e.tipo === "rechazada") registro.agregar(`#${e.item.id} ${nombre} al rechazo`, "mal", e.t);
    },
  });

  const ensamblaje = new Ensamblaje(datosEnsamblaje, (c) => {
    if (c.tipo === "paso") {
      planta?.instalarPaso(c.paso.id);
      registro.agregar(`Ensamblaje ${c.indice}/${ensamblaje.total}: ${c.paso.titulo}`, "ok");
    } else if (c.tipo === "reinicio") {
      planta?.desmontar();
      registro.agregar("Planta desmontada", "info");
    }
    refrescarEnsamblaje();
  });

  const dash = crearDashboard(cfg, historial);
  let corriendo = false;
  let velocidad = 1;

  function refrescarEnsamblaje() {
    pintarPasos($("lista-pasos"), ensamblaje);
    $("progreso-ensamblaje").style.width = `${ensamblaje.progreso * 100}%`;
    $("btn-paso").disabled = ensamblaje.completo;
    $("btn-auto").disabled = ensamblaje.completo;
    $("btn-desmontar").disabled = ensamblaje.completados === 0;
    $("btn-play").disabled = !ensamblaje.completo;
    if (!ensamblaje.completo && corriendo) fijarCorriendo(false);
    estado(
      ensamblaje.completo ? "Planta lista" : `Ensamblaje ${ensamblaje.completados}/${ensamblaje.total}`,
      ensamblaje.completo ? "ok" : "aviso",
    );
  }

  function fijarCorriendo(v) {
    corriendo = v;
    $("txt-play").textContent = v ? "Pausar" : "Iniciar";
    $("ico-play").setAttribute("href", `assets/ui/sprite.svg#icono-${v ? "pausa" : "play"}`);
    if (ensamblaje.completo) estado(v ? "Línea en operación" : "Línea en pausa", v ? "ok" : "aviso");
  }

  function reiniciarSimulacion() {
    sim.reiniciar();
    sim.intervaloEntrada = 60 / Number($("rng-flujo").value);
    planta?.limpiarItems();
    dash.reiniciar();
    registro.limpiar();
    fijarCorriendo(false);
    registro.agregar("Simulación reiniciada", "info");
    dash.actualizar(sim);
    pintarKpis($("kpis"), sim, ensamblaje);
  }

  // Controles
  $("btn-paso").addEventListener("click", () => ensamblaje.avanzar());
  $("btn-auto").addEventListener("click", () => {
    let i = 0;
    const siguiente = () => {
      if (ensamblaje.completo) return;
      ensamblaje.avanzar();
      if (++i < ensamblaje.total) setTimeout(siguiente, 450);
    };
    siguiente();
  });
  $("btn-desmontar").addEventListener("click", () => { ensamblaje.reiniciar(); reiniciarSimulacion(); });
  $("btn-play").addEventListener("click", () => fijarCorriendo(!corriendo));
  $("btn-reiniciar").addEventListener("click", reiniciarSimulacion);
  $("rng-velocidad").addEventListener("input", (e) => {
    velocidad = Number(e.target.value);
    $("lbl-velocidad").textContent = `${velocidad}×`;
  });
  $("rng-flujo").addEventListener("input", (e) => {
    $("lbl-flujo").textContent = e.target.value;
    sim.intervaloEntrada = 60 / Number(e.target.value);
  });
  document.querySelectorAll("[data-camara]").forEach((b) =>
    b.addEventListener("click", () => planta?.camara(b.dataset.camara)),
  );

  refrescarEnsamblaje();
  pintarKpis($("kpis"), sim, ensamblaje);
  dash.actualizar(sim);

  // Escena 3D
  try {
    planta = await crearEscena3D($("canvas3d"), {
      cfg,
      onProgreso: (p, archivo) => ($("carga-texto").textContent = `Cargando modelos 3D… ${Math.round(p * 100)} % (${archivo})`),
    });
  } catch (e) {
    console.error(e);
    $("carga-texto").textContent = "No se pudo iniciar el motor 3D (¿WebGL desactivado?)";
    estado("Error 3D", "aviso");
    registro.agregar(`Error 3D: ${e.message}`, "mal");
    return;
  }
  $("carga").classList.add("oculto");
  registro.agregar(`${ESTACIONES.length} estaciones de separación listas. Ensambla la planta para comenzar.`, "info");
  refrescarEnsamblaje();

  // Modo demostración: index.html?auto=1 ensambla la planta e inicia la línea sola.
  if (new URLSearchParams(location.search).has("auto")) {
    $("btn-auto").click();
    const espera = setInterval(() => {
      if (!ensamblaje.completo) return;
      clearInterval(espera);
      $("rng-velocidad").value = 4;
      $("rng-velocidad").dispatchEvent(new Event("input"));
      fijarCorriendo(true);
    }, 300);
  }

  // Bucle principal
  let ultimo = performance.now();
  let acumKpi = 0;
  planta.engine.runRenderLoop(() => {
    const ahora = performance.now();
    const dt = Math.min((ahora - ultimo) / 1000, 0.1);
    ultimo = ahora;
    if (corriendo) {
      let restante = dt * velocidad;
      while (restante > 0) {
        const paso = Math.min(restante, 0.05);
        sim.actualizar(paso);
        restante -= paso;
      }
      acumKpi += dt;
      if (acumKpi >= 0.25) {
        acumKpi = 0;
        pintarKpis($("kpis"), sim, ensamblaje);
        dash.actualizar(sim);
      }
    }
    planta.actualizar(dt * (corriendo ? velocidad : 1), sim, corriendo);
    planta.scene.render();
  });
}

iniciar();

