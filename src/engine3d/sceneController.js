// src/engine3d/sceneController.js
// Controlador 3D en Babylon.js v9+ optimizado para 60 FPS estables:
// - Cero acoplamiento DOM (comunicación 100 % por EventBus).
// - Materiales PBR realistas (vidrio con refracción IOR 1.52, aluminio metallic 1.0, PET roughness 0.24).
// - Físicas Cinemáticas (PhysicsMotionType.ANIMATED) en banda con impostores Caja/Esfera invisibles.
// - ParticleSystem puro para ráfaga de aire comprimido (plástico) y campo magnético (aluminio).

import "@babylonjs/loaders/glTF/index.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Camera } from "@babylonjs/core/Cameras/camera.js";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import "@babylonjs/core/Culling/ray.js";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { Plane } from "@babylonjs/core/Maths/math.plane.js";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents.js";
import { Axis, Space } from "@babylonjs/core/Maths/math.axis.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";

import { EVENTOS } from "../core/bus/eventBus.js";
import { configurarPipelineFotorealista } from "./renderingPipeline.js";
import { optimizarMaterialPbr, prepararBalizaSensor } from "./pbrEnhancer.js";
import { MaterialObjectPool } from "./objectPool.js";
import { inicializarFisicasBabylon } from "./babylonPhysics.js";
import { crearEfectosParticulasMaquinaria } from "./particleEffects.js";
import { fuenteModelo } from "../recursos/recursosLocales.js";
import { POSICION_NOMINAL, ajustarOffset, estaAlineado } from "../core/assembly/reglasMontaje.js";

const RUTA_MAQ = "maquinaria/";
const RUTA_MAT = "materiales/";

const DISENO_PLANTA = Object.freeze({
  banda_a: { archivo: "banda_transportadora.glb", pos: [-2, 0, 0], paso: "banda" },
  banda_b: { archivo: "banda_transportadora.glb", pos: [2, 0, 0], paso: "banda" },
  tolva: { archivo: "tolva_alimentacion.glb", pos: [-3.2, 0, 0], paso: "tolva" },
  separador: { archivo: "separador_aluminio.glb", pos: [-0.8, 0, 0], paso: "separador" },
  escaner: { archivo: "escaner_optico_plastico.glb", pos: [1.2, 0, 0], paso: "escaner" },
  desviador: { archivo: "desviador_vidrio.glb", pos: [3.0, 0, 0], paso: "desviador" },
  cont_aluminio: { archivo: "contenedor_aluminio.glb", pos: [-0.3, 0, -1.3], paso: "contenedores" },
  cont_plastico: { archivo: "contenedor_plastico.glb", pos: [1.7, 0, -1.3], paso: "contenedores" },
  cont_vidrio: { archivo: "contenedor_vidrio.glb", pos: [3.5, 0, -1.3], paso: "contenedores" },
  robot_walle: { archivo: "robot_walle.glb", pos: [4.35, 0, -1.85], paso: "contenedores" },
});

const PRESETS_CAMARA = Object.freeze({
  general: { alpha: Math.PI / 2 + 0.36, beta: 0.96, radius: 9.8, target: [0.2, 0.55, -0.45] },
  cenital: { alpha: Math.PI / 2, beta: 0.05, radius: 11.2, target: [0.2, 0.2, -0.45] },
  tolva: { alpha: Math.PI / 2 + 0.85, beta: 1.1, radius: 4.4, target: [-2.9, 0.95, 0] },
  salida: { alpha: Math.PI / 2 - 0.52, beta: 0.98, radius: 5.4, target: [2.2, 0.55, -0.65] },
});

function centrarPivoteRodillo(nodo) {
  const info = nodo.getBoundingInfo?.();
  if (info) nodo.setPivotPoint(info.boundingBox.center.clone());
}

function easeOutBackSuave(t) {
  const c1 = 1.15;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export async function crearControladorEscena3D(canvas, { config, bus }) {
  // adaptToDeviceRatio = false evita renderizar 4K en pantallas HiDPI y sostiene 60 FPS con MSAA
  const engine = new Engine(
    canvas,
    true,
    { preserveDrawingBuffer: false, stencil: false, powerPreference: "high-performance" },
    false,
  );
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = Color4.FromHexString("#08121bff");
  scene.skipPointerMovePicking = true;
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.018;
  scene.fogColor = Color3.FromHexString("#08121b");

  const camara = new ArcRotateCamera("camaraGemelo", 0, 0, 10, Vector3.Zero(), scene);
  camara.lowerRadiusLimit = 2.2;
  camara.upperRadiusLimit = 22.0;
  camara.upperBetaLimit = Math.PI / 2 - 0.04;
  camara.wheelPrecision = 38;
  camara.panningSensibility = 1400;
  camara.minZ = 0.05;
  camara.fov = 0.85;
  camara.fovMode = Camera.FOVMODE_HORIZONTAL_FIXED;
  camara.attachControl(canvas, true);

  let destinoCamara = null;
  function irACamara(nombre, inmediato = false) {
    const p = PRESETS_CAMARA[nombre];
    if (!p) return;
    destinoCamara = {
      alpha: p.alpha,
      beta: p.beta,
      radius: p.radius,
      target: new Vector3(...p.target),
    };
    if (inmediato) {
      camara.target = destinoCamara.target.clone();
      camara.alpha = p.alpha;
      camara.beta = p.beta;
      camara.radius = p.radius;
      destinoCamara = null;
    }
  }
  irACamara("general", true);
  canvas.addEventListener("pointerdown", () => {
    destinoCamara = null;
  });

  // Pipeline HDRI + MSAA + Bloom + Sombras PCF optimizadas
  const entornoVisual = configurarPipelineFotorealista(scene, camara, {
    hdrUrl: config.entornoHdr,
    muestrasMsaa: 4,
  });

  // Piso epóxico PBR estático congelado
  const piso = MeshBuilder.CreateGround("pisoPlanta", { width: 28, height: 18 }, scene);
  const matPiso = new PBRMaterial("matPisoEpoxico", scene);
  matPiso.albedoColor = Color3.FromHexString("#1b2630");
  matPiso.metallic = 0.12;
  matPiso.roughness = 0.62;
  matPiso.environmentIntensity = 0.7;
  matPiso.freeze();
  piso.material = matPiso;
  piso.receiveShadows = true;
  piso.isPickable = false;
  piso.freezeWorldMatrix();

  const matFranja = new StandardMaterial("matFranjaSeguridad", scene);
  matFranja.diffuseColor = Color3.FromHexString("#f2b705");
  matFranja.emissiveColor = Color3.FromHexString("#4b3902");
  matFranja.freeze();
  for (const [w, d, x, z] of [
    [11.2, 0.07, 0, 1.35],
    [11.2, 0.07, 0, -2.25],
    [0.07, 3.67, -5.6, -0.45],
    [0.07, 3.67, 5.6, -0.45],
  ]) {
    const franja = MeshBuilder.CreateBox("franjaSeguridad", { width: w, height: 0.004, depth: d }, scene);
    franja.position.set(x, 0.003, z);
    franja.material = matFranja;
    franja.isPickable = false;
    franja.freezeWorldMatrix();
  }

  // Carga de contenedores .glb y calibración PBR (refracción en vidrio, aluminio 100% metálico, PET rugoso)
  const cfgMat = config.materialesCfg;
  const archivosMaqUnicos = [...new Set(Object.values(DISENO_PLANTA).map((d) => d.archivo))];
  const totalActivos = archivosMaqUnicos.length + Object.keys(cfgMat.materiales).length;
  let activosCargados = 0;

  const contenedoresMaq = new Map();
  for (const archivo of archivosMaqUnicos) {
    const c = await LoadAssetContainerAsync(fuenteModelo(`${config.manifest?.modelos?.ruta ?? "assets/models/"}${RUTA_MAQ}${archivo}`), scene, {
      pluginExtension: ".glb",
    });
    c.materials.forEach((m) => optimizarMaterialPbr(m, scene));
    contenedoresMaq.set(archivo, c);
    activosCargados++;
    bus.emit(EVENTOS.CARGA_3D_PROGRESO, { progreso: activosCargados / totalActivos, archivo });
  }

  const contenedoresMat = {};
  for (const [tipo, m] of Object.entries(cfgMat.materiales)) {
    const c = await LoadAssetContainerAsync(fuenteModelo(`${config.manifest?.modelos?.ruta ?? "assets/models/"}${RUTA_MAT}${m.modelo}`), scene, {
      pluginExtension: ".glb",
    });
    c.materials.forEach((mat) => optimizarMaterialPbr(mat, scene));
    contenedoresMat[tipo] = c;
    activosCargados++;
    bus.emit(EVENTOS.CARGA_3D_PROGRESO, { progreso: activosCargados / totalActivos, archivo: m.modelo });
  }

  // Instanciación de módulos de maquinaria para la Máquina de Estados (Fase 1..6)
  const estadoVisualPasos = {};
  const partesPorModulo = {};
  const rodillos = [];
  const tambores = [];
  const balizas = [];
  const hacesSensores = [];
  const todasMallasMaquinaria = [];

  for (const [id, d] of Object.entries(DISENO_PLANTA)) {
    const inst = contenedoresMaq
      .get(d.archivo)
      .instantiateModelsToScene((n) => `${id}_${n}`, true, { doNotInstantiate: true });
    const raiz = new TransformNode(`modulo_${id}`, scene);
    inst.rootNodes.forEach((r) => (r.parent = raiz));
    raiz.position.set(...d.pos);
    raiz.scaling.setAll(0.02);
    raiz.setEnabled(false);

    const grupo = (estadoVisualPasos[d.paso] ??= {
      nodos: [],
      mallas: [],
      alphaActual: 0,
      alphaObjetivo: 0,
    });
    grupo.nodos.push(raiz);

    const indiceNodos = new Map();
    for (const desc of raiz.getDescendants(false)) {
      indiceNodos.set(desc.name.slice(id.length + 1), desc);
    }
    partesPorModulo[id] = indiceNodos;

    for (const m of raiz.getChildMeshes()) {
      m.visibility = 0;
      // Pickable solo para poder arrastrar el módulo ya montado (se filtra por metadata.paso)
      m.isPickable = true;
      m.metadata = { paso: d.paso };
      entornoVisual.generadorSombras.addShadowCaster(m);
      m.receiveShadows = true;
      grupo.mallas.push(m);
      todasMallasMaquinaria.push(m);
    }
  }

  partesPorModulo.banda_a.get("motor")?.setEnabled(false);
  for (const id of ["banda_a", "banda_b"]) {
    for (const [nombre, nodo] of partesPorModulo[id]) {
      if (nombre === "rodillo_inicio" || nombre === "rodillo_fin" || nombre.startsWith("rodillo_soporte")) {
        centrarPivoteRodillo(nodo);
        rodillos.push(nodo);
      }
    }
  }
  for (const nombre of ["tambor_magnetico", "aspas_tambor"]) {
    const n = partesPorModulo.separador.get(nombre);
    if (n) {
      centrarPivoteRodillo(n);
      tambores.push(n);
    }
  }

  const configCortinas = [
    { id: "separador", x: -0.95, color: "#38bdf8", paso: "separador" },
    { id: "escaner", x: 1.05, color: "#fbbf24", paso: "escaner" },
    { id: "desviador", x: 2.72, color: "#4ade80", paso: "desviador" },
  ];
  for (const c of configCortinas) {
    const meshLuz = partesPorModulo[c.id].get("luz_estado");
    if (meshLuz) {
      const matClon = prepararBalizaSensor(meshLuz, `matBaliza_${c.id}`);
      balizas.push({ estacion: c.id, mat: matClon });
    }
    const cortina = MeshBuilder.CreateBox(`haz_${c.id}`, { width: 0.018, height: 0.36, depth: 0.54 }, scene);
    cortina.position.set(c.x, 1.0, 0);
    const matHaz = new StandardMaterial(`matHaz_${c.id}`, scene);
    matHaz.diffuseColor = Color3.Black();
    matHaz.emissiveColor = Color3.FromHexString(c.color);
    matHaz.alpha = 0.16;
    matHaz.disableLighting = true;
    cortina.material = matHaz;
    cortina.isPickable = false;
    cortina.setEnabled(false);
    estadoVisualPasos[c.paso].nodos.push(cortina);
    estadoVisualPasos[c.paso].mallas.push(cortina);
    hacesSensores.push({ estacion: c.id, mesh: cortina, mat: matHaz, baseColor: Color3.FromHexString(c.color) });
  }

  const boquillas = [...partesPorModulo.escaner.entries()]
    .filter(([n]) => n.startsWith("boquilla_"))
    .map(([, n]) => n);
  const compuertaVidrio = partesPorModulo.desviador.get("compuerta_pivote") ?? null;
  if (compuertaVidrio) compuertaVidrio.rotationQuaternion = Quaternion.FromEulerAngles(0, 0, 0);

  const raizLamas = new TransformNode("lamasBanda", scene);
  raizLamas.setEnabled(false);
  estadoVisualPasos.banda.nodos.push(raizLamas);
  const matLama = new PBRMaterial("matLamaGoma", scene);
  matLama.albedoColor = Color3.FromHexString("#38424b");
  matLama.metallic = 0.15;
  matLama.roughness = 0.72;
  matLama.freeze();
  const listaLamas = [];
  for (let i = 0; i < 16; i++) {
    const l = MeshBuilder.CreateBox(`lama_${i}`, { width: 0.035, height: 0.004, depth: 0.5 }, scene);
    l.material = matLama;
    l.parent = raizLamas;
    l.position.set(-4 + 0.25 + i * 0.5, 0.817, 0);
    l.visibility = 0;
    l.isPickable = false;
    l.doNotSyncBoundingInfo = true;
    estadoVisualPasos.banda.mallas.push(l);
    listaLamas.push(l);
  }

  const nodoWalle = estadoVisualPasos.contenedores?.nodos.find((n) => n.name === "modulo_robot_walle") ?? null;
  const luzWalle = partesPorModulo.robot_walle?.get("luz_estado") ?? null;
  const matBalizaWalle = luzWalle ? prepararBalizaSensor(luzWalle, "matBaliza_walle") : null;

  // Posición base de cada nodo de módulo: el montaje libre desplaza todo el módulo respecto a ella
  const posicionBase = new Map();
  for (const g of Object.values(estadoVisualPasos)) {
    for (const n of g.nodos) posicionBase.set(n, n.position.clone());
  }
  const offsetsActuales = {};
  function fijarOffsetPaso(pasoId, dx, dz) {
    const grupo = estadoVisualPasos[pasoId];
    if (!grupo) return;
    offsetsActuales[pasoId] = { dx, dz };
    for (const n of grupo.nodos) {
      if (n === nodoWalle && walleEstado.fase !== "reposo") continue;
      const base = posicionBase.get(n);
      n.position.x = base.x + dx;
      n.position.z = base.z + dz;
    }
  }

  // Físicas Cinemáticas en banda + Impostores Caja/Esfera + Sistemas de Partículas puros
  const fisicasBabylon = await inicializarFisicasBabylon(scene, contenedoresMat, 21);
  const poolMateriales = new MaterialObjectPool(scene, contenedoresMat, fisicasBabylon, 20);
  const particulas = crearEfectosParticulasMaquinaria(scene);

  // ───── Robot recolector WALL-E: recoge la basura no recolectada (merma) y la lleva al dispensador/tolva ─────
  const basuraEnSuelo = [];
  const MAX_BASURA_SUELO = 14;
  const walleEstado = {
    fase: "reposo", // reposo | ir_a_basura | recogiendo | llevando_a_tolva | entregando | volviendo
    objetivo: null,
    relojFase: 0,
    orientacionY: Math.PI,
  };

  // Instancia visual de cada tipo de residuo sobre la bandeja frontal de WALL-E
  const cargaWallePorTipo = {};
  if (nodoWalle) {
    nodoWalle.rotationQuaternion = Quaternion.FromEulerAngles(0, Math.PI, 0);
    for (const [tipo, cont] of Object.entries(contenedoresMat)) {
      const inst = cont.instantiateModelsToScene((n) => `walle_carga_${tipo}_${n}`, false);
      const raizCarga = inst.rootNodes[0];
      raizCarga.parent = nodoWalle;
      raizCarga.position.set(0.28, 0.22, 0);
      raizCarga.rotationQuaternion = null;
      for (const m of raizCarga.getChildMeshes()) m.isPickable = false;
      raizCarga.setEnabled(false);
      cargaWallePorTipo[tipo] = { inst, raiz: raizCarga };
    }
  }

  function mostrarCargaEnWalle(tipoActivo) {
    for (const [tipo, obj] of Object.entries(cargaWallePorTipo)) {
      obj.raiz.setEnabled(tipo === tipoActivo);
    }
  }

  function agregarBasuraAlSuelo(ev) {
    const cont = contenedoresMat[ev.material];
    if (!cont) return;
    if (basuraEnSuelo.length >= MAX_BASURA_SUELO) {
      const viejo = basuraEnSuelo.shift();
      viejo.inst.dispose();
      viejo.nodo.dispose();
    }
    const nodo = new TransformNode(`merma_suelo_${ev.itemId ?? Math.random()}`, scene);
    const xCaida = (ev.xFinal ?? 4.36) + (Math.random() - 0.5) * 0.28;
    const zCaida = (ev.zFinal ?? 0) + (Math.random() - 0.5) * 0.34;
    nodo.position.set(xCaida, 0.035, zCaida);
    nodo.rotationQuaternion = Quaternion.FromEulerAngles(
      (Math.random() - 0.5) * 0.4,
      Math.random() * Math.PI * 2,
      (Math.random() - 0.5) * 0.4,
    );
    const inst = cont.instantiateModelsToScene((n) => `merma_mesh_${n}`, false);
    const raiz = inst.rootNodes[0];
    raiz.parent = nodo;
    raiz.position.set(0, 0, 0);
    for (const m of raiz.getChildMeshes()) m.isPickable = false;
    basuraEnSuelo.push({ material: ev.material, masaKg: ev.masaKg, x: xCaida, z: zCaida, nodo, inst });
  }

  function limpiarBasuraSuelo() {
    while (basuraEnSuelo.length > 0) {
      const b = basuraEnSuelo.pop();
      b.inst.dispose();
      b.nodo.dispose();
    }
    if (walleEstado.objetivo) {
      walleEstado.objetivo.inst?.dispose();
      walleEstado.objetivo.nodo?.dispose();
      walleEstado.objetivo = null;
    }
    mostrarCargaEnWalle(null);
    walleEstado.fase = "reposo";
    if (nodoWalle) {
      const base = posicionBase.get(nodoWalle);
      const off = offsetsActuales.contenedores ?? { dx: 0, dz: 0 };
      if (base) nodoWalle.position.set(base.x + off.dx, 0, base.z + off.dz);
    }
  }

  function moverWalleHacia(destX, destZ, vel, dt) {
    if (!nodoWalle) return true;
    const dx = destX - nodoWalle.position.x;
    const dz = destZ - nodoWalle.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.005) {
      const angDestino = Math.atan2(-dz, dx);
      let diff = angDestino - walleEstado.orientacionY;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      walleEstado.orientacionY += diff * Math.min(1, dt * 10);
      Quaternion.FromEulerAnglesToRef(0, walleEstado.orientacionY, 0, nodoWalle.rotationQuaternion);
    }
    const paso = vel * dt;
    if (dist <= Math.max(0.06, paso)) {
      nodoWalle.position.x = destX;
      nodoWalle.position.z = destZ;
      return true;
    }
    nodoWalle.position.x += (dx / dist) * paso;
    nodoWalle.position.z += (dz / dist) * paso;
    return false;
  }

  function actualizarRobotWalle(dtSimulado, sim, operando) {
    if (!nodoWalle || (estadoVisualPasos.contenedores?.alphaActual ?? 0) < 0.5) return;
    const base = posicionBase.get(nodoWalle);
    const offCont = offsetsActuales.contenedores ?? { dx: 0, dz: 0 };
    const homeX = (base?.x ?? 4.35) + offCont.dx;
    const homeZ = (base?.z ?? -1.85) + offCont.dz;

    const offTolva = offsetsActuales.tolva ?? { dx: 0, dz: 0 };
    const tolvaX = -3.2 + offTolva.dx;
    const tolvaZ = -0.95 + offTolva.dz;
    const carrilZ = -1.92;
    const vel = 2.45; // m/s

    if (matBalizaWalle) {
      const trabajando = walleEstado.fase !== "reposo" && walleEstado.fase !== "volviendo";
      matBalizaWalle.albedoColor = trabajando ? new Color3(1.0, 0.72, 0.12) : new Color3(0.18, 0.85, 0.45);
      matBalizaWalle.emissiveColor = trabajando ? new Color3(1.0, 0.62, 0.08) : new Color3(0.12, 0.85, 0.38);
      matBalizaWalle.emissiveIntensity = trabajando ? 3.8 : 2.1;
    }

    if (!operando) return;

    switch (walleEstado.fase) {
      case "reposo":
        if (basuraEnSuelo.length > 0) {
          walleEstado.objetivo = basuraEnSuelo.shift();
          walleEstado.fase = "ir_a_basura";
        }
        break;
      case "ir_a_basura": {
        const obj = walleEstado.objetivo;
        if (!obj) {
          walleEstado.fase = "reposo";
          break;
        }
        if (moverWalleHacia(obj.x - 0.25, obj.z, vel, dtSimulado)) {
          walleEstado.fase = "recogiendo";
          walleEstado.relojFase = 0.28;
        }
        break;
      }
      case "recogiendo":
        walleEstado.relojFase -= dtSimulado;
        if (walleEstado.relojFase <= 0) {
          const obj = walleEstado.objetivo;
          if (obj) {
            obj.inst.dispose();
            obj.nodo.dispose();
            mostrarCargaEnWalle(obj.material);
          }
          walleEstado.fase = "ruta_hacia_carril";
        }
        break;
      case "ruta_hacia_carril":
        if (moverWalleHacia(nodoWalle.position.x, carrilZ, vel, dtSimulado)) {
          walleEstado.fase = "llevando_a_tolva";
        }
        break;
      case "llevando_a_tolva":
        if (moverWalleHacia(tolvaX, carrilZ, vel * 1.15, dtSimulado)) {
          walleEstado.fase = "acercar_a_tolva";
        }
        break;
      case "acercar_a_tolva":
        if (moverWalleHacia(tolvaX, tolvaZ, vel, dtSimulado)) {
          walleEstado.fase = "entregando";
          walleEstado.relojFase = 0.32;
        }
        break;
      case "entregando":
        walleEstado.relojFase -= dtSimulado;
        if (walleEstado.relojFase <= 0) {
          const obj = walleEstado.objetivo;
          mostrarCargaEnWalle(null);
          if (obj) {
            sim.recircularPieza(obj.material);
          }
          walleEstado.objetivo = null;
          walleEstado.fase = basuraEnSuelo.length > 0 ? "regresar_carril_tolva" : "volviendo_carril";
        }
        break;
      case "regresar_carril_tolva":
        if (moverWalleHacia(tolvaX, carrilZ, vel, dtSimulado)) {
          walleEstado.objetivo = basuraEnSuelo.shift() ?? null;
          walleEstado.fase = walleEstado.objetivo ? "volver_por_mas" : "volviendo";
        }
        break;
      case "volver_por_mas":
        if (moverWalleHacia(homeX, carrilZ, vel * 1.15, dtSimulado)) {
          walleEstado.fase = "ir_a_basura";
        }
        break;
      case "volviendo_carril":
        if (moverWalleHacia(tolvaX, carrilZ, vel, dtSimulado)) {
          walleEstado.fase = "volviendo";
        }
        break;
      case "volviendo":
        if (basuraEnSuelo.length > 0) {
          walleEstado.objetivo = basuraEnSuelo.shift();
          walleEstado.fase = "ir_a_basura";
          break;
        }
        if (moverWalleHacia(homeX, homeZ, vel, dtSimulado)) {
          walleEstado.fase = "reposo";
        }
        break;
    }
  }

  let anguloCompuerta = 0;
  let modoWireframe = false;
  let contenedoresInstalados = false; // montados Y en su sitio (si no, las piezas caen al piso)
  let bandaOperativa = false;
  let arrastrando = false;
  const desuscripciones = [];

  desuscripciones.push(
    bus.on(EVENTOS.ESTADO_PLANTA, (snap) => {
      const visibles = new Set(snap.idsVisibles);
      contenedoresInstalados = visibles.has("contenedores") && estaAlineado(snap.posiciones, "contenedores");
      bandaOperativa = Boolean(snap.capacidad?.banda);
      entornoVisual.fijarModoSombrasDinamico(true);
      for (const [pasoId, grupo] of Object.entries(estadoVisualPasos)) {
        if (visibles.has(pasoId)) {
          const pos = snap.posiciones?.[pasoId] ?? { dx: 0, dz: 0 };
          const previo = offsetsActuales[pasoId];
          if (!previo || previo.dx !== pos.dx || previo.dz !== pos.dz) fijarOffsetPaso(pasoId, pos.dx, pos.dz);
        }
        grupo.alphaObjetivo = visibles.has(pasoId) ? 1 : 0;
        if (grupo.alphaObjetivo > 0) {
          for (const n of grupo.nodos) n.setEnabled(true);
        }
      }
      if (snap.fase === 0) {
        poolMateriales.liberarTodos();
        fisicasBabylon.limpiarContenedores();
        limpiarBasuraSuelo();
      }
    }),
  );

  desuscripciones.push(bus.on(EVENTOS.COMANDO_CAMARA, (nombre) => irACamara(nombre, false)));

  desuscripciones.push(
    bus.on(EVENTOS.COMANDO_WIREFRAME, () => {
      modoWireframe = !modoWireframe;
      for (const m of todasMallasMaquinaria) {
        if (m.material) m.material.wireframe = modoWireframe;
      }
    }),
  );

  // Feedback visual con ParticleSystem cuando actúan el escáner óptico (aire) y el separador de aluminio (campo magnético)
  desuscripciones.push(
    bus.on(EVENTOS.SENSOR_PLASTICO, () => {
      if (estadoVisualPasos.escaner?.alphaActual > 0.5) particulas.dispararAirePlastico(35);
    }),
  );
  desuscripciones.push(
    bus.on(EVENTOS.SENSOR_ALUMINIO, () => {
      if (estadoVisualPasos.separador?.alphaActual > 0.5) particulas.dispararCampoAluminio(40);
    }),
  );
  desuscripciones.push(
    bus.on(EVENTOS.ACTUADOR_DISPARO, (ev) => {
      if (ev.estacion === "escaner") particulas.dispararAirePlastico(55);
      else if (ev.estacion === "separador") particulas.dispararCampoAluminio(65);
    }),
  );

  desuscripciones.push(
    bus.on(EVENTOS.ITEM_CLASIFICADO, (ev) => {
      // Sin contenedores (o fuera de su sitio) las piezas expulsadas caen al piso y WALL-E también puede rescatarlas
      if (contenedoresInstalados) {
        fisicasBabylon.depositarPiezaEnContenedor(ev);
      } else {
        agregarBasuraAlSuelo(ev);
      }
    }),
  );

  desuscripciones.push(
    bus.on(EVENTOS.ITEM_RECHAZADO, (ev) => {
      agregarBasuraAlSuelo(ev);
    }),
  );

  desuscripciones.push(
    bus.on(EVENTOS.COMANDO_REINICIAR, () => {
      poolMateriales.liberarTodos();
      fisicasBabylon.limpiarContenedores();
      limpiarBasuraSuelo();
    }),
  );

  // ───── Montaje libre: arrastrar módulos ya colocados y soltar módulos desde la lista ─────
  const planoSuelo = Plane.FromPositionAndNormal(Vector3.Zero(), Vector3.Up());
  function puntoEnSuelo(xPx, yPx) {
    const rayo = scene.createPickingRay(xPx, yPx, null, camara);
    const dist = rayo.intersectsPlane(planoSuelo);
    return dist === null ? null : rayo.origin.add(rayo.direction.scale(dist));
  }

  let arrastre = null;
  function terminarArrastre(confirmar) {
    if (!arrastre) return;
    const { id, ultimo } = arrastre;
    arrastre = null;
    arrastrando = false;
    canvas.style.cursor = "";
    if (confirmar && ultimo) bus.emit(EVENTOS.COMANDO_MOVER, { id, dx: ultimo.dx, dz: ultimo.dz });
  }

  scene.onPrePointerObservable.add((info) => {
    const ev = info.event;
    if (info.type === PointerEventTypes.POINTERDOWN && ev.button === 0) {
      const pick = scene.pick(scene.pointerX, scene.pointerY, (m) => {
        const paso = m.metadata?.paso;
        const g = paso ? estadoVisualPasos[paso] : null;
        return Boolean(g) && g.alphaObjetivo === 1 && g.alphaActual > 0.5;
      });
      if (!pick?.hit) return;
      const id = pick.pickedMesh.metadata.paso;
      const punto = puntoEnSuelo(scene.pointerX, scene.pointerY);
      if (!punto) return;
      const off = offsetsActuales[id] ?? { dx: 0, dz: 0 };
      arrastre = { id, inicio: punto, off, ultimo: null };
      arrastrando = true;
      canvas.style.cursor = "grabbing";
      info.skipOnPointerObservable = true; // la cámara no debe rotar mientras se mueve una pieza
    } else if (arrastre && info.type === PointerEventTypes.POINTERMOVE) {
      info.skipOnPointerObservable = true;
      const punto = puntoEnSuelo(scene.pointerX, scene.pointerY);
      if (!punto) return;
      const nuevo = ajustarOffset(
        arrastre.off.dx + (punto.x - arrastre.inicio.x),
        arrastre.off.dz + (punto.z - arrastre.inicio.z),
      );
      arrastre.ultimo = nuevo;
      fijarOffsetPaso(arrastre.id, nuevo.dx, nuevo.dz);
    } else if (arrastre && info.type === PointerEventTypes.POINTERUP) {
      info.skipOnPointerObservable = true;
      terminarArrastre(true);
    }
  });
  const alSoltarFueraDelCanvas = () => terminarArrastre(true);
  window.addEventListener("pointerup", alSoltarFueraDelCanvas);

  const alArrastrarSobreEscena = (ev) => {
    if (ev.dataTransfer?.types?.includes("text/plain")) {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "copy";
    }
  };
  const alSoltarEnEscena = (ev) => {
    const id = ev.dataTransfer?.getData("text/plain");
    if (!id || !POSICION_NOMINAL[id]) return;
    ev.preventDefault();
    const r = canvas.getBoundingClientRect();
    const punto = puntoEnSuelo(
      (ev.clientX - r.left) * (engine.getRenderWidth() / r.width),
      (ev.clientY - r.top) * (engine.getRenderHeight() / r.height),
    );
    const nominal = POSICION_NOMINAL[id];
    const { dx, dz } = punto ? ajustarOffset(punto.x - nominal.x, punto.z - nominal.z) : { dx: 0, dz: 0 };
    bus.emit(EVENTOS.COMANDO_COLOCAR, { id, dx, dz });
  };
  canvas.addEventListener("dragover", alArrastrarSobreEscena);
  canvas.addEventListener("drop", alSoltarEnEscena);
  let acumFps = 0;
  let sombrasEnModoDinamico = true;

  function actualizarEscena(dtReal, dtSimulado, sim, operando) {
    if (destinoCamara) {
      const k = 1 - Math.exp(-6.5 * dtReal);
      const a = camara.alpha + (destinoCamara.alpha - camara.alpha) * k;
      const b = camara.beta + (destinoCamara.beta - camara.beta) * k;
      const r = camara.radius + (destinoCamara.radius - camara.radius) * k;
      camara.target = Vector3.Lerp(camara.target, destinoCamara.target, k);
      camara.alpha = a;
      camara.beta = b;
      camara.radius = r;
      if (Math.abs(destinoCamara.radius - r) < 0.012 && Math.abs(destinoCamara.alpha - a) < 0.002) {
        destinoCamara = null;
      }
    }

    // Animación progresiva (scaling + alpha) gobernada por la Máquina de Estados
    let animandoMontaje = false;
    for (const grupo of Object.values(estadoVisualPasos)) {
      if (Math.abs(grupo.alphaActual - grupo.alphaObjetivo) > 0.002) {
        animandoMontaje = true;
        const vel = grupo.alphaObjetivo > grupo.alphaActual ? 2.6 : 3.8;
        const dir = Math.sign(grupo.alphaObjetivo - grupo.alphaActual);
        grupo.alphaActual = Math.max(0, Math.min(1, grupo.alphaActual + dir * dtReal * vel));

        const escala = grupo.alphaActual <= 0.001 ? 0.02 : Math.max(0.02, easeOutBackSuave(grupo.alphaActual));
        for (const n of grupo.nodos) {
          if (n.name !== "lamasBanda") n.scaling.setAll(escala);
        }
        for (const m of grupo.mallas) {
          m.visibility = grupo.alphaActual;
        }
        if (grupo.alphaActual <= 0.002 && grupo.alphaObjetivo === 0) {
          for (const n of grupo.nodos) n.setEnabled(false);
        }
      }
    }
    const sombrasDinamicas = animandoMontaje || arrastrando;
    if (sombrasEnModoDinamico !== sombrasDinamicas) {
      sombrasEnModoDinamico = sombrasDinamicas;
      entornoVisual.fijarModoSombrasDinamico(sombrasDinamicas);
    }

    const bandaVisible = estadoVisualPasos.banda?.alphaActual > 0.5 && bandaOperativa;
    const separadorVisible =
      estadoVisualPasos.separador?.alphaActual > 0.5 &&
      estaAlineado(offsetsActuales, "separador");
    particulas.fijarEstadoOperativo(operando, separadorVisible);

    if (operando && bandaVisible) {
      const desp = sim.velocidadBanda * dtSimulado;
      for (const l of listaLamas) {
        l.position.x += desp;
        if (l.position.x > 3.95) l.position.x -= 8.0;
      }
      for (const r of rodillos) r.rotate(Axis.Z, -desp / 0.075, Space.LOCAL);
    }
    if (operando && estadoVisualPasos.separador?.alphaActual > 0.5) {
      for (const t of tambores) t.rotate(Axis.Z, dtSimulado * 10.5, Space.LOCAL);
    }

    for (const { estacion, mat } of balizas) {
      if (!mat) continue;
      const est = sim.estaciones[estacion];
      const detectando = est.sensorActivoHasta > sim.tiempo || est.actuadorActivoHasta > sim.tiempo;
      if (detectando) {
        mat.albedoColor = new Color3(1.0, 0.52, 0.08);
        mat.emissiveColor = new Color3(1.0, 0.48, 0.05);
        mat.emissiveIntensity = 4.2;
      } else if (operando) {
        mat.albedoColor = new Color3(0.18, 0.85, 0.45);
        mat.emissiveColor = new Color3(0.12, 0.85, 0.38);
        mat.emissiveIntensity = 2.35;
      } else {
        mat.albedoColor = new Color3(0.22, 0.26, 0.30);
        mat.emissiveColor = new Color3(0.05, 0.07, 0.09);
        mat.emissiveIntensity = 0.5;
      }
    }

    for (const h of hacesSensores) {
      const est = sim.estaciones[h.estacion];
      const pulso = est.sensorActivoHasta > sim.tiempo;
      h.mat.alpha = operando ? (pulso ? 0.42 : 0.14) : 0.04;
      h.mat.emissiveColor = pulso ? new Color3(1.0, 0.72, 0.2) : h.baseColor;
    }

    if (compuertaVidrio) {
      const abierta = sim.estaciones.desviador.actuadorActivoHasta > sim.tiempo;
      const meta = abierta ? -0.78 : 0;
      anguloCompuerta += (meta - anguloCompuerta) * (1 - Math.exp(-15 * dtReal));
      compuertaVidrio.rotationQuaternion = Quaternion.FromEulerAngles(0, anguloCompuerta, 0);
    }

    const soplando = sim.estaciones.escaner.actuadorActivoHasta > sim.tiempo;
    for (const b of boquillas) b.scaling.y = soplando ? 1.85 : 1.0;

    // Sin banda (o banda fuera de eje) no hay dónde mostrar las piezas: la simulación queda en pausa
    poolMateriales.sincronizarConItems(bandaOperativa ? sim.items : []);
    actualizarRobotWalle(dtSimulado, sim, operando);

    acumFps += dtReal;
    if (acumFps >= 0.5) {
      acumFps = 0;
      const fps = Math.round(engine.getFps());
      bus.emit(EVENTOS.RENDIMIENTO_3D, {
        fps,
        frameMs: +(1000 / Math.max(1, fps)).toFixed(1),
        havokActivo: fisicasBabylon.activo,
        poolActivos: poolMateriales.enUso.size,
      });
    }
  }

  engine.resize();
  const alRedimensionar = () => engine.resize();
  window.addEventListener("resize", alRedimensionar);

  bus.emit(EVENTOS.MOTOR_3D_LISTO, {
    webglVersion: engine.webGLVersion,
    havokActivo: fisicasBabylon.activo,
  });

  return {
    engine,
    scene,
    actualizarEscena,
    redimensionar: () => engine.resize(),
    dispose() {
      window.removeEventListener("resize", alRedimensionar);
      window.removeEventListener("pointerup", alSoltarFueraDelCanvas);
      canvas.removeEventListener("dragover", alArrastrarSobreEscena);
      canvas.removeEventListener("drop", alSoltarEnEscena);
      desuscripciones.forEach((off) => off());
      limpiarBasuraSuelo();
      for (const obj of Object.values(cargaWallePorTipo)) obj.inst.dispose();
      particulas.dispose();
      poolMateriales.dispose();
      fisicasBabylon.dispose();
      entornoVisual.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
