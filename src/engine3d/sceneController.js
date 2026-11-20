// src/engine3d/sceneController.js
// Controlador 3D en Babylon.js v9+ optimizado para 60 FPS estables:
// - Cero acoplamiento DOM (comunicación 100 % por EventBus y adaptador pointerLock inyectado).
// - Primera persona estilo Minecraft (Pointer Lock, aceleración/frenado suave, sprint, agacharse [C],
//   vuelo creativo con doble Espacio, head-bob sutil, rueda del ratón).
// - Arrastre ULTRA SUAVE con interpolación exponencial y límite de distancia.
// - Mecánica de atornillado 3D con pernos hexagonales animados [F] + vibración física si está suelta.
// - Estética PBR industrial mejorada (piso epóxico cuadriculado procedural, arcos guía pulsantes).

import "@babylonjs/loaders/glTF/index.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Camera } from "@babylonjs/core/Cameras/camera.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
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
import { ARCHIVOS_ENTORNO, cargarEntornoPlanta } from "./entornoPlanta.js";
import { inicializarFisicasBabylon } from "./babylonPhysics.js";
import { crearEfectosParticulasMaquinaria } from "./particleEffects.js";
import { fuenteModelo } from "../recursos/recursosLocales.js";
import {
  POSICION_NOMINAL,
  OFFSET_ALMACEN,
  CESTO_POR_ESTACION,
  ajustarOffset,
  estaAlineado,
  posicionMundo,
} from "../core/assembly/reglasMontaje.js";

const RUTA_MAQ = "maquinaria/";
const RUTA_MAT = "materiales/";
const RUTA_ENTORNO = "entorno/";

const DISENO_PLANTA = Object.freeze({
  banda_a: { archivo: "banda_transportadora.glb", pos: [-2, 0, 0], paso: "banda" },
  banda_b: { archivo: "banda_transportadora.glb", pos: [2, 0, 0], paso: "banda" },
  tolva: { archivo: "tolva_alimentacion.glb", pos: [-3.2, 0, 0], paso: "tolva" },
  separador: { archivo: "separador_aluminio.glb", pos: [-0.8, 0, 0], paso: "separador" },
  escaner: { archivo: "escaner_optico_plastico.glb", pos: [1.2, 0, 0], paso: "escaner" },
  desviador: { archivo: "desviador_vidrio.glb", pos: [3.0, 0, 0], paso: "desviador" },
  cont_aluminio: { archivo: "contenedor_aluminio.glb", pos: [-0.3, 0, -1.3], paso: "cont_aluminio" },
  cont_plastico: { archivo: "contenedor_plastico.glb", pos: [1.7, 0, -1.3], paso: "cont_plastico" },
  cont_vidrio: { archivo: "contenedor_vidrio.glb", pos: [3.5, 0, -1.3], paso: "cont_vidrio" },
  robot_walle: { archivo: "robot_walle.glb", pos: [4.35, 0, -1.85], paso: "robot_walle" },
});

const HUELLA_PERNOS = Object.freeze({
  banda: [[-3.82, -0.34], [3.82, -0.34], [-3.82, 0.34], [3.82, 0.34]],
  tolva: [[-0.44, -0.38], [0.44, -0.38], [-0.44, 0.38], [0.44, 0.38]],
  separador: [[-0.46, -0.38], [0.46, -0.38], [-0.46, 0.38], [0.46, 0.38]],
  escaner: [[-0.46, -0.38], [0.46, -0.38], [-0.46, 0.38], [0.46, 0.38]],
  desviador: [[-0.44, -0.38], [0.44, -0.38], [-0.44, 0.38], [0.44, 0.38]],
  cont_aluminio: [[-0.46, -0.36], [0.46, -0.36], [-0.46, 0.36], [0.46, 0.36]],
  cont_plastico: [[-0.46, -0.36], [0.46, -0.36], [-0.46, 0.36], [0.46, 0.36]],
  cont_vidrio: [[-0.46, -0.36], [0.46, -0.36], [-0.46, 0.36], [0.46, 0.36]],
  robot_walle: [[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]],
});

// Puntos de teletransporte rápido en primera persona
const TELEPORT_FP = Object.freeze({
  general: { pos: [0.0, 1.72, 6.2], target: [0.0, 1.15, 0.2] },
  almacen: { pos: [0.0, 1.72, 6.6], target: [0.0, 0.8, 3.0] },
  tolva: { pos: [-3.2, 1.72, 2.5], target: [-3.2, 1.1, 0.0] },
  salida: { pos: [2.2, 1.72, 2.6], target: [2.0, 0.85, -1.0] },
  recepcion: { pos: [-7.2, 1.72, 4.2], target: [-9.8, 1.2, 0.0] },
});

function centrarPivoteRodillo(nodo) {
  const info = nodo.getBoundingInfo?.();
  if (info) nodo.setPivotPoint(info.boundingBox.center.clone());
}

/** Genera textura procedural de piso epóxico industrial con cuadrícula técnica y losas. */
function crearTexturaPisoEpoxico(scene) {
  const tam = 512;
  const tex = new DynamicTexture("texPisoEpoxico", { width: tam, height: tam }, scene, true);
  const ctx = tex.getContext();

  ctx.fillStyle = "#192533";
  ctx.fillRect(0, 0, tam, tam);

  // Cuadrantes sutiles (2x2 losas por mosaico)
  const mitad = tam / 2;
  ctx.fillStyle = "rgba(255, 255, 255, 0.018)";
  ctx.fillRect(0, 0, mitad, mitad);
  ctx.fillRect(mitad, mitad, mitad, mitad);

  // Sub-rejilla fina de medición
  ctx.strokeStyle = "rgba(105, 165, 215, 0.075)";
  ctx.lineWidth = 1;
  const pasoSub = tam / 8;
  for (let i = 1; i < 8; i++) {
    const p = i * pasoSub;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, tam);
    ctx.moveTo(0, p);
    ctx.lineTo(tam, p);
    ctx.stroke();
  }

  // Juntas principales entre losas
  ctx.strokeStyle = "#0e1722";
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, tam - 3, tam - 3);
  ctx.beginPath();
  ctx.moveTo(mitad, 0);
  ctx.lineTo(mitad, tam);
  ctx.moveTo(0, mitad);
  ctx.lineTo(tam, mitad);
  ctx.stroke();

  tex.update(true);
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.uScale = 16;
  tex.vScale = 11;
  tex.anisotropicFilteringLevel = 8;
  return tex;
}

/** Suaviza el movimiento con rejilla fina de 2.5 cm e imán suave cerca del punto nominal. */
function ajustarPosicionArrastreSuave(dxRaw, dzRaw, rangoIman = 0.24) {
  const dx = Math.max(-12.0, Math.min(12.0, dxRaw));
  const dz = Math.max(-7.5, Math.min(7.5, dzRaw));
  if (Math.hypot(dx, dz) <= rangoIman) return { dx: 0, dz: 0 };
  const paso = 0.025;
  return {
    dx: +(Math.round(dx / paso) * paso).toFixed(3),
    dz: +(Math.round(dz / paso) * paso).toFixed(3),
  };
}

export async function crearControladorEscena3D(canvas, { config, bus, pointerLock = null }) {
  const engine = new Engine(
    canvas,
    true,
    { preserveDrawingBuffer: false, stencil: false, powerPreference: "high-performance" },
    false,
  );
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = Color4.FromHexString("#0b1520ff");
  scene.skipPointerMovePicking = true;
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.004;
  scene.fogColor = Color3.FromHexString("#0b1520");

  // ───── Cámara en Primera Persona estilo Minecraft ─────
  const ALTURA_PIE = 1.72;
  const ALTURA_AGACHADO = 1.3;
  const FOV_BASE = 0.98;
  const FOV_SPRINT = 1.08;
  const jugador = {
    x: 0.0,
    y: ALTURA_PIE,
    z: 6.2,
    vx: 0,
    vz: 0,
    velY: 0,
    enSuelo: true,
    yaw: Math.PI,
    pitch: -0.14,
    alturaActual: ALTURA_PIE,
    fovActual: FOV_BASE,
    pasoFase: 0,
    volando: false,
    agachado: false,
    corriendo: false,
    ultimoWMs: 0,
    ultimoSpaceMs: 0,
    sprintPorDobleW: false,
  };
  const camara = new FreeCamera("camaraPrimeraPersona", new Vector3(jugador.x, jugador.y, jugador.z), scene);
  camara.minZ = 0.05;
  camara.fov = FOV_BASE;
  camara.fovMode = Camera.FOVMODE_HORIZONTAL_FIXED;

  function sincronizarCamaraFP(bobY = 0) {
    camara.position.set(jugador.x, jugador.y + bobY, jugador.z);
    camara.fov = jugador.fovActual;
    const cosP = Math.cos(jugador.pitch);
    const dirX = Math.sin(jugador.yaw) * cosP;
    const dirY = Math.sin(jugador.pitch);
    const dirZ = Math.cos(jugador.yaw) * cosP;
    camara.setTarget(new Vector3(jugador.x + dirX, jugador.y + bobY + dirY, jugador.z + dirZ));
  }

  function teletransportarFP(nombre) {
    const p = TELEPORT_FP[nombre];
    if (!p) return;
    jugador.x = p.pos[0];
    jugador.y = p.pos[1];
    jugador.z = p.pos[2];
    jugador.vx = 0;
    jugador.vz = 0;
    jugador.velY = 0;
    jugador.volando = false;
    jugador.enSuelo = p.pos[1] <= ALTURA_PIE + 0.05;
    const dx = p.target[0] - p.pos[0];
    const dy = p.target[1] - p.pos[1];
    const dz = p.target[2] - p.pos[2];
    const horiz = Math.hypot(dx, dz) || 1;
    jugador.yaw = Math.atan2(dx, dz);
    jugador.pitch = Math.max(-1.25, Math.min(1.25, Math.atan2(dy, horiz)));
    sincronizarCamaraFP();
  }
  teletransportarFP("general");

  // Pipeline HDRI + Iluminación 3 puntos + MSAA + Bloom + ACES + Viñeta
  const entornoVisual = configurarPipelineFotorealista(scene, camara, {
    hdrUrl: config.entornoHdr,
    muestrasMsaa: 4,
  });

  // Piso epóxico PBR cuadriculado estático
  const texturaPiso = crearTexturaPisoEpoxico(scene);
  const piso = MeshBuilder.CreateGround("pisoPlanta", { width: 46, height: 32 }, scene);
  const matPiso = new PBRMaterial("matPisoEpoxico", scene);
  matPiso.albedoTexture = texturaPiso;
  matPiso.albedoColor = Color3.FromHexString("#ffffff");
  matPiso.metallic = 0.16;
  matPiso.roughness = 0.48;
  matPiso.environmentIntensity = 0.95;
  matPiso.freeze();
  piso.material = matPiso;
  piso.receiveShadows = true;
  piso.isPickable = false;
  piso.freezeWorldMatrix();

  const matFranja = new StandardMaterial("matFranjaSeguridad", scene);
  matFranja.diffuseColor = Color3.FromHexString("#f2b705");
  matFranja.emissiveColor = Color3.FromHexString("#634b04");
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

  // Demarcación en el piso de la Zona de Almacén en la Esquina
  const matFranjaAlmacen = new StandardMaterial("matFranjaAlmacen", scene);
  matFranjaAlmacen.diffuseColor = Color3.FromHexString("#38bdf8");
  matFranjaAlmacen.emissiveColor = Color3.FromHexString("#0e5a85");
  matFranjaAlmacen.freeze();
  for (const [w, d, x, z] of [
    [11.6, 0.07, 0.0, 1.95],
    [11.6, 0.07, 0.0, 4.55],
    [0.07, 2.67, -5.8, 3.25],
    [0.07, 2.67, 5.8, 3.25],
  ]) {
    const franja = MeshBuilder.CreateBox("franjaAlmacen", { width: w, height: 0.004, depth: d }, scene);
    franja.position.set(x, 0.003, z);
    franja.material = matFranjaAlmacen;
    franja.isPickable = false;
    franja.freezeWorldMatrix();
  }

  // Aros guía pulsantes en el piso
  const aroSugerido = MeshBuilder.CreateTorus("aroPosicionSugerida", { diameter: 0.95, thickness: 0.045, tessellation: 32 }, scene);
  const matAroSugerido = new StandardMaterial("matAroSugerido", scene);
  matAroSugerido.diffuseColor = Color3.Black();
  matAroSugerido.emissiveColor = Color3.FromHexString("#2ecc71");
  matAroSugerido.alpha = 0.78;
  matAroSugerido.disableLighting = true;
  aroSugerido.material = matAroSugerido;
  aroSugerido.isPickable = false;
  aroSugerido.setEnabled(false);

  const aroColocar = MeshBuilder.CreateTorus("aroColocarInventario", { diameter: 0.85, thickness: 0.04, tessellation: 32 }, scene);
  const matAroColocar = new StandardMaterial("matAroColocar", scene);
  matAroColocar.diffuseColor = Color3.Black();
  matAroColocar.emissiveColor = Color3.FromHexString("#38bdf8");
  matAroColocar.alpha = 0.86;
  matAroColocar.disableLighting = true;
  aroColocar.material = matAroColocar;
  aroColocar.isPickable = false;
  aroColocar.setEnabled(false);

  // Carga de contenedores .glb y calibración PBR
  const cfgMat = config.materialesCfg;
  const archivosMaqUnicos = [...new Set(Object.values(DISENO_PLANTA).map((d) => d.archivo))];
  const archivosEntorno = config.manifest?.modelos?.entorno ?? ARCHIVOS_ENTORNO;
  const totalVariantes = Object.values(cfgMat.materiales).reduce((n, m) => n + (m.variantes?.length ?? 0), 0);
  const totalActivos = archivosMaqUnicos.length + Object.keys(cfgMat.materiales).length + totalVariantes + archivosEntorno.length;
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
  const variantesPorTipo = {};
  for (const [tipo, m] of Object.entries(cfgMat.materiales)) {
    const c = await LoadAssetContainerAsync(fuenteModelo(`${config.manifest?.modelos?.ruta ?? "assets/models/"}${RUTA_MAT}${m.modelo}`), scene, {
      pluginExtension: ".glb",
    });
    c.materials.forEach((mat) => optimizarMaterialPbr(mat, scene));
    contenedoresMat[tipo] = c;
    variantesPorTipo[tipo] = [c];
    activosCargados++;
    bus.emit(EVENTOS.CARGA_3D_PROGRESO, { progreso: activosCargados / totalActivos, archivo: m.modelo });
    for (const archivoVar of m.variantes ?? []) {
      const cv = await LoadAssetContainerAsync(fuenteModelo(`${config.manifest?.modelos?.ruta ?? "assets/models/"}${RUTA_MAT}${archivoVar}`), scene, {
        pluginExtension: ".glb",
      });
      cv.materials.forEach((mat) => optimizarMaterialPbr(mat, scene));
      variantesPorTipo[tipo].push(cv);
      activosCargados++;
      bus.emit(EVENTOS.CARGA_3D_PROGRESO, { progreso: activosCargados / totalActivos, archivo: archivoVar });
    }
  }

  // Entorno de la nave
  const entornoPlanta = await cargarEntornoPlanta({
    cargar: (archivo) =>
      LoadAssetContainerAsync(fuenteModelo(`${config.manifest?.modelos?.ruta ?? "assets/models/"}${RUTA_ENTORNO}${archivo}`), scene, {
        pluginExtension: ".glb",
      }),
    optimizar: (mat) => optimizarMaterialPbr(mat, scene),
    archivos: archivosEntorno,
    scene,
    camara,
    onProgreso: (archivo) => {
      activosCargados++;
      bus.emit(EVENTOS.CARGA_3D_PROGRESO, { progreso: activosCargados / totalActivos, archivo });
    },
  });

  // Instanciación de los 9 componentes individuales
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
    raiz.scaling.setAll(1);
    raiz.setEnabled(true);

    const grupo = (estadoVisualPasos[d.paso] ??= {
      nodos: [],
      auxiliares: [],
      mallas: [],
    });
    grupo.nodos.push(raiz);

    const indiceNodos = new Map();
    for (const desc of raiz.getDescendants(false)) {
      indiceNodos.set(desc.name.slice(id.length + 1), desc);
    }
    partesPorModulo[id] = indiceNodos;

    for (const m of raiz.getChildMeshes()) {
      m.visibility = 1;
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
    estadoVisualPasos[c.paso].auxiliares.push(cortina);
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
  estadoVisualPasos.banda.auxiliares.push(raizLamas);
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
    l.visibility = 1;
    l.isPickable = false;
    l.doNotSyncBoundingInfo = true;
    estadoVisualPasos.banda.mallas.push(l);
    listaLamas.push(l);
  }

  // ───── Pernos hexagonales 3D + collares LED para mecánica de atornillado ─────
  const matPernoMetal = new PBRMaterial("matPernoHexMetal", scene);
  matPernoMetal.albedoColor = Color3.FromHexString("#c8d6e5");
  matPernoMetal.metallic = 0.92;
  matPernoMetal.roughness = 0.24;
  matPernoMetal.freeze();

  const pernosPorPaso = {};
  for (const [pasoId, puntos] of Object.entries(HUELLA_PERNOS)) {
    const nom = POSICION_NOMINAL[pasoId] ?? { x: 0, z: 0 };
    const raiz = new TransformNode(`pernos_${pasoId}`, scene);
    raiz.position.set(nom.x, 0, nom.z);
    raiz.setEnabled(false);

    const matLed = new StandardMaterial(`matLedPerno_${pasoId}`, scene);
    matLed.diffuseColor = Color3.Black();
    matLed.emissiveColor = Color3.FromHexString("#f59e0b");
    matLed.disableLighting = true;

    const pernos = [];
    for (let i = 0; i < puntos.length; i++) {
      const [px, pz] = puntos[i];
      const collar = MeshBuilder.CreateTorus(
        `collarPerno_${pasoId}_${i}`,
        { diameter: 0.14, thickness: 0.022, tessellation: 16 },
        scene,
      );
      collar.parent = raiz;
      collar.position.set(px, 0.015, pz);
      collar.material = matLed;
      collar.isPickable = false;

      const perno = MeshBuilder.CreateCylinder(
        `pernoHex_${pasoId}_${i}`,
        { diameter: 0.075, height: 0.14, tessellation: 6 },
        scene,
      );
      perno.parent = raiz;
      perno.position.set(px, 0.14, pz);
      perno.material = matPernoMetal;
      perno.isPickable = false;
      pernos.push(perno);
    }
    pernosPorPaso[pasoId] = { raiz, matLed, pernos };
  }

  const offsetsActuales = {};

  // ───── Banda inclinada de recepción ─────
  const INC_X_A = -12.8;
  const INC_Y_A = 0.55;
  const INC_X_B = -3.7;
  const INC_Y_B = 2.58;
  const INC_PEND = (INC_Y_B - INC_Y_A) / (INC_X_B - INC_X_A);
  const INC_ANGULO = Math.atan2(INC_Y_B - INC_Y_A, INC_X_B - INC_X_A);
  const yBandaInclinada = (x) => INC_Y_A + INC_PEND * (x - INC_X_A);

  const INC_LAMAS_X0 = -12.5;
  const INC_LAMAS_X1 = -3.75;
  const INC_LAMAS_SPAN = INC_LAMAS_X1 - INC_LAMAS_X0;
  const raizLamasInclinadas = new TransformNode("lamasBandaInclinada", scene);
  const lamasInclinadas = [];
  for (let i = 0; i < 14; i++) {
    const x = INC_LAMAS_X0 + (i / 14) * INC_LAMAS_SPAN;
    const lama = MeshBuilder.CreateBox(`lamaInc_${i}`, { width: 0.065, height: 0.09, depth: 0.88 }, scene);
    lama.material = matLama;
    lama.parent = raizLamasInclinadas;
    lama.position.set(x, yBandaInclinada(x) + 0.082, 0);
    lama.rotation.z = INC_ANGULO;
    lama.isPickable = false;
    lama.doNotSyncBoundingInfo = true;
    lamasInclinadas.push(lama);
  }

  const INC_CARRILES_Z = [-0.28, -0.11, 0.09, 0.27];
  const INC_TIPOS = Object.keys(variantesPorTipo);
  const INC_PIEZAS_X0 = -12.35;
  const INC_FRAC_BANDA = 0.86;
  const piezasBandaInclinada = [];
  for (let i = 0; i < 18; i++) {
    const tipo = INC_TIPOS[i % INC_TIPOS.length];
    const vars = variantesPorTipo[tipo] ?? [contenedoresMat[tipo]];
    const contVar = vars[i % vars.length];
    if (!contVar) continue;
    const nodo = new TransformNode(`piezaInc_${i}`, scene);
    const inst = contVar.instantiateModelsToScene((n) => `inc_${i}_${n}`, false);
    const raiz = inst.rootNodes[0];
    raiz.parent = nodo;
    raiz.position.set(0, 0, 0);
    for (const m of raiz.getChildMeshes()) {
      m.isPickable = false;
      m.alwaysSelectAsActiveMesh = true;
    }
    const zCarril = INC_CARRILES_Z[i % INC_CARRILES_Z.length] + (((i * 37) % 11) - 5) * 0.008;
    const giro = (i * 1.37) % (Math.PI * 2);
    nodo.rotationQuaternion = Quaternion.FromEulerAngles(0, giro, -INC_ANGULO * 0.4);
    piezasBandaInclinada.push({
      nodo,
      inst,
      progreso: i / 18,
      zCarril,
      giro,
      velGiro: (i % 2 === 0 ? 1 : -1) * 0.45,
    });
  }

  function posicionarPiezaInclinada(p, tolvaVisible) {
    const offTolva = offsetsActuales.tolva ?? { dx: 0, dz: 0 };
    if (p.progreso < INC_FRAC_BANDA) {
      const t = p.progreso / INC_FRAC_BANDA;
      const x = INC_PIEZAS_X0 + t * (INC_X_B - INC_PIEZAS_X0);
      p.nodo.setEnabled(true);
      p.nodo.position.set(x, yBandaInclinada(x) + 0.088, p.zCarril);
      Quaternion.FromEulerAnglesToRef(0, p.giro, -INC_ANGULO * 0.35, p.nodo.rotationQuaternion);
    } else {
      if (!tolvaVisible) {
        p.nodo.setEnabled(false);
        return;
      }
      const t = (p.progreso - INC_FRAC_BANDA) / (1 - INC_FRAC_BANDA);
      const xFinTolva = -3.22 + offTolva.dx;
      const zFinTolva = p.zCarril * 0.45 + offTolva.dz;
      const x = INC_X_B + t * (xFinTolva - INC_X_B);
      const z = p.zCarril + t * (zFinTolva - p.zCarril);
      const y = INC_Y_B + 0.088 + (1.55 - (INC_Y_B + 0.088)) * (t * t) + 0.11 * Math.sin(Math.PI * t);
      p.nodo.setEnabled(true);
      p.nodo.position.set(x, y, z);
      Quaternion.FromEulerAnglesToRef(t * 0.8, p.giro + t * 2.1, t * 0.6, p.nodo.rotationQuaternion);
    }
  }

  for (const p of piezasBandaInclinada) posicionarPiezaInclinada(p, false);

  function actualizarBandaInclinada(dtSimulado, operando, tolvaVisible, velocidadBanda) {
    const avanzando = operando && tolvaVisible;
    if (avanzando) {
      const velInclinada = Math.max(0.35, velocidadBanda) * 1.15;
      const despX = velInclinada * dtSimulado;
      for (const lama of lamasInclinadas) {
        lama.position.x += despX;
        if (lama.position.x > INC_LAMAS_X1) lama.position.x -= INC_LAMAS_SPAN;
        lama.position.y = yBandaInclinada(lama.position.x) + 0.082;
      }
      const incProg = (velInclinada / 10.0) * dtSimulado;
      for (const p of piezasBandaInclinada) {
        p.progreso = (p.progreso + incProg) % 1;
        p.giro += p.velGiro * dtSimulado;
        posicionarPiezaInclinada(p, tolvaVisible);
      }
    } else {
      for (const p of piezasBandaInclinada) posicionarPiezaInclinada(p, tolvaVisible);
    }
  }

  const nodoWalle = estadoVisualPasos.robot_walle?.nodos.find((n) => n.name === "modulo_robot_walle") ?? null;
  const luzWalle = partesPorModulo.robot_walle?.get("luz_estado") ?? null;
  const matBalizaWalle = luzWalle ? prepararBalizaSensor(luzWalle, "matBaliza_walle") : null;

  const posicionBase = new Map();
  for (const g of Object.values(estadoVisualPasos)) {
    for (const n of g.nodos) posicionBase.set(n, n.position.clone());
  }
  const offsetsObjetivo = {};
  const instaladosSet = new Set();
  const atornilladosSet = new Set();
  const inventarioSet = new Set();
  const walleEstado = {
    fase: "reposo",
    objetivo: null,
    relojFase: 0,
    orientacionY: Math.PI,
  };
  let velocidadWalleMps = 3.2;

  function fijarOffsetPaso(pasoId, dx, dz, vibX = 0, vibZ = 0) {
    const grupo = estadoVisualPasos[pasoId];
    if (!grupo) return;
    offsetsActuales[pasoId] = { dx, dz };
    for (const n of grupo.nodos) {
      if (n === nodoWalle && walleEstado.fase !== "reposo") continue;
      const base = posicionBase.get(n);
      n.position.x = base.x + dx + vibX;
      n.position.z = base.z + dz + vibZ;
    }
    const regPerno = pernosPorPaso[pasoId];
    if (regPerno && POSICION_NOMINAL[pasoId]) {
      const nom = POSICION_NOMINAL[pasoId];
      regPerno.raiz.position.set(nom.x + dx + vibX, 0, nom.z + dz + vibZ);
    }
  }

  for (const pasoId of Object.keys(estadoVisualPasos)) {
    const offIni = OFFSET_ALMACEN[pasoId] ?? { dx: 0, dz: 0 };
    offsetsObjetivo[pasoId] = { ...offIni };
    fijarOffsetPaso(pasoId, offIni.dx, offIni.dz);
  }

  const fisicasBabylon = await inicializarFisicasBabylon(scene, contenedoresMat, 21);
  const poolMateriales = new MaterialObjectPool(scene, contenedoresMat, fisicasBabylon, 20, variantesPorTipo);
  const particulas = crearEfectosParticulasMaquinaria(scene);

  // ───── Robot recolector WALL-E ─────
  const basuraEnSuelo = [];
  const MAX_BASURA_SUELO = 14;
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

  function reiniciarEstadoWalle() {
    if (walleEstado.objetivo) {
      walleEstado.objetivo.inst?.dispose();
      walleEstado.objetivo.nodo?.dispose();
      walleEstado.objetivo = null;
    }
    mostrarCargaEnWalle(null);
    walleEstado.fase = "reposo";
    if (nodoWalle) {
      const base = posicionBase.get(nodoWalle);
      const off = offsetsActuales.robot_walle ?? OFFSET_ALMACEN.robot_walle;
      if (base) nodoWalle.position.set(base.x + off.dx, 0, base.z + off.dz);
    }
  }

  function limpiarBasuraSuelo() {
    while (basuraEnSuelo.length > 0) {
      const b = basuraEnSuelo.pop();
      b.inst.dispose();
      b.nodo.dispose();
    }
    reiniciarEstadoWalle();
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
    if (!nodoWalle || !instaladosSet.has("robot_walle")) return;
    const base = posicionBase.get(nodoWalle);
    const offWalle = offsetsActuales.robot_walle ?? { dx: 0, dz: 0 };
    const homeX = (base?.x ?? 4.35) + offWalle.dx;
    const homeZ = (base?.z ?? -1.85) + offWalle.dz;

    const accesoFosoX = -6.75;
    const montonX = -8.6;
    const montonZ = -1.1;
    const carrilZ = -1.92;
    const vel = velocidadWalleMps;

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
          walleEstado.fase = "llevando_a_monton";
        }
        break;
      case "llevando_a_monton":
        if (moverWalleHacia(accesoFosoX, carrilZ, vel * 1.35, dtSimulado)) {
          walleEstado.fase = "entrar_al_foso";
        }
        break;
      case "entrar_al_foso":
        if (moverWalleHacia(accesoFosoX, montonZ, vel, dtSimulado)) {
          walleEstado.fase = "acercar_a_monton";
        }
        break;
      case "acercar_a_monton":
        if (moverWalleHacia(montonX, montonZ, vel, dtSimulado)) {
          walleEstado.fase = "entregando";
          walleEstado.relojFase = 0.32;
        }
        break;
      case "entregando": {
        const angMonton = Math.atan2(-(0 - montonZ), -11.3 - montonX);
        let diff = angMonton - walleEstado.orientacionY;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        walleEstado.orientacionY += diff * Math.min(1, dtSimulado * 12);
        Quaternion.FromEulerAnglesToRef(0, walleEstado.orientacionY, 0, nodoWalle.rotationQuaternion);

        walleEstado.relojFase -= dtSimulado;
        if (walleEstado.relojFase <= 0) {
          const obj = walleEstado.objetivo;
          mostrarCargaEnWalle(null);
          if (obj) sim.recircularPieza(obj.material);
          walleEstado.objetivo = null;
          walleEstado.fase = basuraEnSuelo.length > 0 ? "salir_del_foso_mas" : "salir_del_foso";
        }
        break;
      }
      case "salir_del_foso_mas":
        if (moverWalleHacia(accesoFosoX, montonZ, vel, dtSimulado)) {
          walleEstado.fase = "regresar_carril_monton";
        }
        break;
      case "regresar_carril_monton":
        if (moverWalleHacia(accesoFosoX, carrilZ, vel, dtSimulado)) {
          walleEstado.objetivo = basuraEnSuelo.shift() ?? null;
          walleEstado.fase = walleEstado.objetivo ? "volver_por_mas" : "volviendo";
        }
        break;
      case "volver_por_mas":
        if (moverWalleHacia(homeX, carrilZ, vel * 1.35, dtSimulado)) {
          walleEstado.fase = "ir_a_basura";
        }
        break;
      case "salir_del_foso":
        if (moverWalleHacia(accesoFosoX, montonZ, vel, dtSimulado)) {
          walleEstado.fase = "volviendo_carril";
        }
        break;
      case "volviendo_carril":
        if (moverWalleHacia(accesoFosoX, carrilZ, vel, dtSimulado)) {
          walleEstado.fase = "volviendo";
        }
        break;
      case "volviendo":
        if (basuraEnSuelo.length > 0) {
          walleEstado.objetivo = basuraEnSuelo.shift();
          walleEstado.fase = "volver_por_mas";
          break;
        }
        if (moverWalleHacia(homeX, homeZ, vel * 1.25, dtSimulado)) {
          walleEstado.fase = "reposo";
        }
        break;
    }
  }

  let anguloCompuerta = 0;
  let modoWireframe = false;
  let arrastrando = false;
  let equipadoInventarioId = null;
  let objetivoMirillaActual = null;
  let arrastre = null;
  let atornillando = null;
  let relojVisual = 0;
  const desuscripciones = [];

  function emitirEstadoMovilidad(forzar = false) {
    const payload = {
      pointerLock: Boolean(pointerLock?.estaActivo?.()),
      volando: jugador.volando,
      agachado: jugador.agachado,
      corriendo: jugador.corriendo,
      agarrandoId: arrastre?.id ?? null,
      atornillandoId: atornillando?.id ?? null,
      desatornillar: Boolean(atornillando?.desatornillar),
      progresoAtornillar: atornillando ? Math.min(1, atornillando.progreso) : 0,
    };
    if (forzar) bus.emit(EVENTOS.ESTADO_MOVILIDAD_FP, payload);
    else bus.emit(EVENTOS.ESTADO_MOVILIDAD_FP, payload);
  }

  function aplicarVisibilidadGrupos() {
    for (const [pasoId, grupo] of Object.entries(estadoVisualPasos)) {
      const enInv = inventarioSet.has(pasoId);
      const instalado = instaladosSet.has(pasoId);
      for (const n of grupo.nodos) {
        if (grupo.auxiliares.includes(n)) {
          n.setEnabled(instalado && !enInv);
        } else {
          n.setEnabled(!enInv);
        }
      }
    }
  }

  desuscripciones.push(
    bus.on(EVENTOS.ESTADO_PLANTA, (snap) => {
      instaladosSet.clear();
      for (const id of snap.idsVisibles ?? []) instaladosSet.add(id);
      atornilladosSet.clear();
      for (const id of snap.atornillados ?? []) atornilladosSet.add(id);
      inventarioSet.clear();
      for (const id of snap.inventario ?? []) inventarioSet.add(id);

      if (equipadoInventarioId && !inventarioSet.has(equipadoInventarioId)) {
        equipadoInventarioId = null;
        aroColocar.setEnabled(false);
        aroSugerido.setEnabled(false);
      }

      velocidadWalleMps = snap.parametrosMaquina?.robot_walle?.velocidadMps ?? 3.2;

      if (!instaladosSet.has("robot_walle")) reiniciarEstadoWalle();

      for (const [estId, cestoId] of Object.entries(CESTO_POR_ESTACION)) {
        const pos = instaladosSet.has(cestoId) ? posicionMundo(snap.posiciones, cestoId) : { x: 99, z: 99 };
        fisicasBabylon.actualizarPosicionContenedor(estId, pos.x, pos.z);
      }

      aplicarVisibilidadGrupos();
      entornoVisual.fijarModoSombrasDinamico(true);

      for (const pasoId of Object.keys(estadoVisualPasos)) {
        if (inventarioSet.has(pasoId) || arrastre?.id === pasoId) continue;
        const instalado = instaladosSet.has(pasoId);
        const meta = instalado
          ? (snap.posiciones?.[pasoId] ?? { dx: 0, dz: 0 })
          : (OFFSET_ALMACEN[pasoId] ?? { dx: 0, dz: 0 });
        offsetsObjetivo[pasoId] = { dx: meta.dx ?? 0, dz: meta.dz ?? 0 };
      }

      if (snap.fase === 0 && !snap.operando && (snap.inventario?.length ?? 0) === 0) {
        poolMateriales.liberarTodos();
        fisicasBabylon.limpiarContenedores();
        limpiarBasuraSuelo();
      }
    }),
  );

  desuscripciones.push(
    bus.on(EVENTOS.COMANDO_SELECCIONAR_INVENTARIO, ({ id }) => {
      equipadoInventarioId = id && inventarioSet.has(id) ? id : null;
      if (!equipadoInventarioId) {
        aroColocar.setEnabled(false);
        aroSugerido.setEnabled(false);
      }
    }),
  );

  desuscripciones.push(
    bus.on(EVENTOS.COMANDO_ABRIR_CONFIG_PIEZA, () => {
      // Al abrir el modal de configuración liberamos el ratón si estaba capturado tipo Minecraft
      pointerLock?.liberar?.();
      emitirEstadoMovilidad();
    }),
  );

  desuscripciones.push(bus.on(EVENTOS.COMANDO_CAMARA, (nombre) => teletransportarFP(nombre)));

  desuscripciones.push(
    bus.on(EVENTOS.COMANDO_WIREFRAME, () => {
      modoWireframe = !modoWireframe;
      for (const m of todasMallasMaquinaria) {
        if (m.material) m.material.wireframe = modoWireframe;
      }
    }),
  );

  desuscripciones.push(
    bus.on(EVENTOS.SENSOR_PLASTICO, () => {
      if (instaladosSet.has("escaner")) particulas.dispararAirePlastico(35);
    }),
  );
  desuscripciones.push(
    bus.on(EVENTOS.SENSOR_ALUMINIO, () => {
      if (instaladosSet.has("separador")) particulas.dispararCampoAluminio(40);
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
      fisicasBabylon.depositarPiezaEnContenedor(ev);
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

  if (pointerLock?.alCambiar) {
    desuscripciones.push(
      pointerLock.alCambiar(() => {
        emitirEstadoMovilidad();
      }),
    );
  }

  // ───── Picking acotado para arrastre ultrasuave y colocación ─────
  const planoSuelo = Plane.FromPositionAndNormal(Vector3.Zero(), Vector3.Up());
  function puntoEnSueloAcotado(xPx, yPx, distMax = 10.5, distFija = null) {
    const rayo = scene.createPickingRay(xPx, yPx, null, camara);
    if (distFija === null) {
      const dist = rayo.intersectsPlane(planoSuelo);
      if (dist !== null && dist >= 0.4 && dist <= distMax) {
        const p = rayo.origin.add(rayo.direction.scale(dist));
        return { x: p.x, z: p.z, dist };
      }
    }
    // Proyección estable sobre el plano horizontal si el jugador mira muy arriba/horizonte
    const horiz = Math.hypot(rayo.direction.x, rayo.direction.z) || 1;
    const d = Math.max(2.0, Math.min(distMax, distFija ?? distMax));
    return {
      x: Math.max(-13.5, Math.min(13.5, jugador.x + (rayo.direction.x / horiz) * d)),
      z: Math.max(-8.2, Math.min(8.2, jugador.z + (rayo.direction.z / horiz) * d)),
      dist: d,
    };
  }

  function coordenadasMirillaPx() {
    if (pointerLock?.estaActivo?.()) {
      return { x: engine.getRenderWidth() * 0.5, y: engine.getRenderHeight() * 0.5 };
    }
    const x = scene.pointerX > 0 ? scene.pointerX : engine.getRenderWidth() * 0.5;
    const y = scene.pointerY > 0 ? scene.pointerY : engine.getRenderHeight() * 0.5;
    return { x, y };
  }

  function pickPieza(xPx, yPx) {
    return scene.pick(xPx, yPx, (m) => {
      const paso = m.metadata?.paso;
      return Boolean(paso && estadoVisualPasos[paso] && !inventarioSet.has(paso));
    });
  }

  function iniciarArrastreSuave(id, px, py, modoTeclaG = false) {
    if (!id || !POSICION_NOMINAL[id]) return;
    if (id === "robot_walle") reiniciarEstadoWalle();
    const p = puntoEnSueloAcotado(px, py, 10.5);
    const off = offsetsActuales[id] ?? { dx: 0, dz: 0 };
    const nom = POSICION_NOMINAL[id];
    const distReal = Math.max(2.2, Math.min(8.5, Math.hypot(nom.x + off.dx - jugador.x, nom.z + off.dz - jugador.z)));
    arrastre = {
      id,
      inicioSuelo: p,
      offInicial: { ...off },
      meta: { ...off },
      distAgarre: distReal,
      modoTeclaG,
      movido: modoTeclaG,
    };
    arrastrando = true;
    aroSugerido.position.set(nom.x, 0.025, nom.z);
    aroSugerido.setEnabled(true);
    emitirEstadoMovilidad();
  }

  function terminarArrastre(confirmar) {
    if (!arrastre) return;
    const { id, meta, movido } = arrastre;
    arrastre = null;
    arrastrando = false;
    aroSugerido.setEnabled(false);
    canvas.style.cursor = "";
    emitirEstadoMovilidad();
    if (confirmar && meta && movido) {
      offsetsObjetivo[id] = { dx: meta.dx, dz: meta.dz };
      bus.emit(EVENTOS.COMANDO_COLOCAR, { id, dx: meta.dx, dz: meta.dz, abrirConfig: true });
    }
  }

  // ───── Teclado estilo Minecraft (WASD, doble W Sprint, C Sneak, 2×Espacio Volar, E/F/G/R) ─────
  const teclas = new Set();
  const esCampoEdicion = (ev) => ["INPUT", "SELECT", "TEXTAREA"].includes(ev.target?.tagName);

  const alKeyDown = (ev) => {
    if (esCampoEdicion(ev)) return;
    const code = ev.code;
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "KeyC", "ControlLeft"].includes(code)) {
      if (code.startsWith("Arrow")) ev.preventDefault();
      if (code === "KeyW" && !ev.repeat) {
        const ahora = performance.now();
        if (ahora - jugador.ultimoWMs < 260) jugador.sprintPorDobleW = true;
        jugador.ultimoWMs = ahora;
      }
      teclas.add(code);
    } else if (code === "Space") {
      ev.preventDefault();
      if (!ev.repeat) {
        const ahora = performance.now();
        if (ahora - jugador.ultimoSpaceMs < 280) {
          jugador.volando = !jugador.volando;
          jugador.velY = 0;
          if (jugador.volando) jugador.enSuelo = false;
          emitirEstadoMovilidad();
        } else if (!jugador.volando && jugador.enSuelo) {
          jugador.velY = 5.6;
          jugador.enSuelo = false;
        }
        jugador.ultimoSpaceMs = ahora;
      }
      teclas.add(code);
    } else if (code === "KeyE" && !ev.repeat) {
      if (objetivoMirillaActual?.id) {
        if (arrastre?.id === objetivoMirillaActual.id) terminarArrastre(false);
        bus.emit(EVENTOS.COMANDO_RECOGER_INVENTARIO, { id: objetivoMirillaActual.id });
      }
    } else if (code === "KeyG" && !ev.repeat) {
      if (arrastre) {
        terminarArrastre(true);
      } else if (objetivoMirillaActual?.id) {
        const { x, y } = coordenadasMirillaPx();
        iniciarArrastreSuave(objetivoMirillaActual.id, x, y, true);
      }
    } else if (code === "KeyF" && !ev.repeat) {
      const id = objetivoMirillaActual?.id;
      if (id && instaladosSet.has(id) && !atornillando) {
        atornillando = {
          id,
          desatornillar: atornilladosSet.has(id),
          progreso: 0,
        };
        emitirEstadoMovilidad();
      }
    } else if (code === "KeyR" && !ev.repeat) {
      const id = objetivoMirillaActual?.id;
      if (id) {
        bus.emit(EVENTOS.COMANDO_ABRIR_CONFIG_PIEZA, { id });
      }
    } else if (code === "Escape") {
      if (arrastre) terminarArrastre(false);
      if (equipadoInventarioId) bus.emit(EVENTOS.COMANDO_SELECCIONAR_INVENTARIO, { id: null });
    }
  };

  const alKeyUp = (ev) => {
    teclas.delete(ev.code);
    if (ev.code === "KeyW") jugador.sprintPorDobleW = false;
    if (ev.code === "KeyF" && atornillando) {
      atornillando = null;
      emitirEstadoMovilidad();
    }
  };
  const alPerderFoco = () => {
    teclas.clear();
    jugador.sprintPorDobleW = false;
    atornillando = null;
    if (arrastre) terminarArrastre(false);
  };
  window.addEventListener("keydown", alKeyDown);
  window.addEventListener("keyup", alKeyUp);
  window.addEventListener("blur", alPerderFoco);

  // Rueda del ratón: con pieza agarrada ajusta la distancia suavemente (2.2 m - 8.5 m)
  const alWheel = (ev) => {
    if (!arrastre) return;
    ev.preventDefault();
    arrastre.distAgarre = Math.max(2.2, Math.min(8.5, arrastre.distAgarre - Math.sign(ev.deltaY) * 0.55));
  };
  canvas.addEventListener("wheel", alWheel, { passive: false });

  // ───── Pointer Lock y ratón sobre el visor ─────
  let rotandoVista = null;
  let pendienteLock = null;
  const alContextMenu = (ev) => ev.preventDefault();
  canvas.addEventListener("contextmenu", alContextMenu);

  const alMouseMoveLock = (ev) => {
    if (!pointerLock?.estaActivo?.()) return;
    const sens = 0.0022;
    jugador.yaw -= (ev.movementX || 0) * sens;
    jugador.pitch = Math.max(-1.28, Math.min(1.28, jugador.pitch - (ev.movementY || 0) * sens));
    sincronizarCamaraFP();
  };
  window.addEventListener("mousemove", alMouseMoveLock);

  scene.onPrePointerObservable.add((info) => {
    const ev = info.event;
    const enLock = Boolean(pointerLock?.estaActivo?.());

    if (info.type === PointerEventTypes.POINTERDOWN) {
      if (enLock) {
        if (ev.button !== 0) return;
        if (equipadoInventarioId) {
          const { x, y } = coordenadasMirillaPx();
          const p = puntoEnSueloAcotado(x, y, 10.5);
          const id = equipadoInventarioId;
          const nom = POSICION_NOMINAL[id];
          const { dx, dz } = ajustarPosicionArrastreSuave(p.x - nom.x, p.z - nom.z);
          bus.emit(EVENTOS.COMANDO_COLOCAR, { id, dx, dz, abrirConfig: true });
          bus.emit(EVENTOS.COMANDO_SELECCIONAR_INVENTARIO, { id: null });
          info.skipOnPointerObservable = true;
          return;
        }
        if (arrastre) {
          terminarArrastre(true);
          info.skipOnPointerObservable = true;
          return;
        }
        const { x, y } = coordenadasMirillaPx();
        const pick = pickPieza(x, y);
        if (pick?.hit) {
          iniciarArrastreSuave(pick.pickedMesh.metadata.paso, x, y, false);
          info.skipOnPointerObservable = true;
        }
        return;
      }

      // Modo cursor libre (Pointer Lock desactivado)
      if (ev.button === 2) {
        rotandoVista = { x: ev.clientX, y: ev.clientY, boton: 2 };
        canvas.style.cursor = "grabbing";
        info.skipOnPointerObservable = true;
        return;
      }
      if (ev.button !== 0) return;

      if (equipadoInventarioId) {
        const punto = puntoEnSueloAcotado(scene.pointerX, scene.pointerY, 10.5);
        const id = equipadoInventarioId;
        const nom = POSICION_NOMINAL[id];
        const { dx, dz } = ajustarPosicionArrastreSuave(punto.x - nom.x, punto.z - nom.z);
        bus.emit(EVENTOS.COMANDO_COLOCAR, { id, dx, dz, abrirConfig: true });
        bus.emit(EVENTOS.COMANDO_SELECCIONAR_INVENTARIO, { id: null });
        info.skipOnPointerObservable = true;
        return;
      }

      const pick = pickPieza(scene.pointerX, scene.pointerY);
      if (pick?.hit) {
        canvas.style.cursor = "grabbing";
        iniciarArrastreSuave(pick.pickedMesh.metadata.paso, scene.pointerX, scene.pointerY, false);
        info.skipOnPointerObservable = true;
        return;
      }

      // En espacio vacío con cursor libre: clic rápido entra en Modo Minecraft; si arrastra gira la cámara
      pendienteLock = { x: ev.clientX, y: ev.clientY };
      rotandoVista = { x: ev.clientX, y: ev.clientY, boton: 0 };
      canvas.style.cursor = "move";
      info.skipOnPointerObservable = true;
    } else if (info.type === PointerEventTypes.POINTERMOVE) {
      if (enLock) return;
      if (rotandoVista) {
        const dxPx = ev.clientX - rotandoVista.x;
        const dyPx = ev.clientY - rotandoVista.y;
        rotandoVista.x = ev.clientX;
        rotandoVista.y = ev.clientY;
        if (pendienteLock && Math.hypot(ev.clientX - pendienteLock.x, ev.clientY - pendienteLock.y) > 5) {
          pendienteLock = null;
        }
        jugador.yaw -= dxPx * 0.004;
        jugador.pitch = Math.max(-1.28, Math.min(1.28, jugador.pitch - dyPx * 0.004));
        sincronizarCamaraFP();
        info.skipOnPointerObservable = true;
        return;
      }
      if (arrastre && !arrastre.modoTeclaG) {
        info.skipOnPointerObservable = true;
        const p = puntoEnSueloAcotado(scene.pointerX, scene.pointerY, 10.5);
        const dX = p.x - arrastre.inicioSuelo.x;
        const dZ = p.z - arrastre.inicioSuelo.z;
        if (Math.hypot(dX, dZ) > 0.02) arrastre.movido = true;
        arrastre.meta = ajustarPosicionArrastreSuave(arrastre.offInicial.dx + dX, arrastre.offInicial.dz + dZ);
      }
    } else if (info.type === PointerEventTypes.POINTERUP) {
      if (rotandoVista && ev.button === rotandoVista.boton) {
        const pedirMc = Boolean(pendienteLock && ev.button === 0);
        pendienteLock = null;
        rotandoVista = null;
        canvas.style.cursor = "";
        info.skipOnPointerObservable = true;
        if (pedirMc) pointerLock?.solicitar?.();
      }
      if (arrastre && !arrastre.modoTeclaG && ev.button === 0) {
        info.skipOnPointerObservable = true;
        terminarArrastre(true);
      }
    }
  });

  const alSoltarFueraDelCanvas = () => {
    pendienteLock = null;
    rotandoVista = null;
    if (arrastre && !arrastre.modoTeclaG) terminarArrastre(true);
  };
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
    const punto = puntoEnSueloAcotado(
      (ev.clientX - r.left) * (engine.getRenderWidth() / r.width),
      (ev.clientY - r.top) * (engine.getRenderHeight() / r.height),
      10.5,
    );
    const nominal = POSICION_NOMINAL[id];
    const { dx, dz } = ajustarPosicionArrastreSuave(punto.x - nominal.x, punto.z - nominal.z);
    bus.emit(EVENTOS.COMANDO_COLOCAR, { id, dx, dz, abrirConfig: true });
  };
  canvas.addEventListener("dragover", alArrastrarSobreEscena);
  canvas.addEventListener("drop", alSoltarEnEscena);

  let acumFps = 0;
  let acumPick = 0;
  let sombrasEnModoDinamico = true;
  let bobYActual = 0;

  function actualizarMovimientoFP(dtReal) {
    let adelante = 0;
    let lateral = 0;
    if (teclas.has("KeyW") || teclas.has("ArrowUp")) adelante += 1;
    if (teclas.has("KeyS") || teclas.has("ArrowDown")) adelante -= 1;
    if (teclas.has("KeyD") || teclas.has("ArrowRight")) lateral += 1;
    if (teclas.has("KeyA") || teclas.has("ArrowLeft")) lateral -= 1;

    const agachadoAhora = !jugador.volando && (teclas.has("KeyC") || teclas.has("ControlLeft"));
    const corriendoAhora =
      !agachadoAhora && adelante > 0 && (teclas.has("ShiftLeft") || teclas.has("ShiftRight") || jugador.sprintPorDobleW);

    const cambioEstado = agachadoAhora !== jugador.agachado || corriendoAhora !== jugador.corriendo;
    jugador.agachado = agachadoAhora;
    jugador.corriendo = corriendoAhora;

    // Altura de ojos suave al agacharse
    const alturaObjetivo = jugador.agachado ? ALTURA_AGACHADO : ALTURA_PIE;
    const kAlt = 1 - Math.exp(-14 * dtReal);
    const prevAltura = jugador.alturaActual;
    jugador.alturaActual += (alturaObjetivo - jugador.alturaActual) * kAlt;
    if (jugador.enSuelo && !jugador.volando) {
      jugador.y = jugador.alturaActual;
    } else {
      jugador.y += jugador.alturaActual - prevAltura;
    }

    // FOV dinámico suave en sprint
    const fovMeta = corriendoAhora ? FOV_SPRINT : FOV_BASE;
    jugador.fovActual += (fovMeta - jugador.fovActual) * (1 - Math.exp(-10 * dtReal));

    // Velocidad horizontal con aceleración y frenado suave
    const velMax = jugador.volando ? (corriendoAhora ? 9.5 : 6.2) : agachadoAhora ? 2.1 : corriendoAhora ? 7.4 : 4.5;
    let targetVx = 0;
    let targetVz = 0;
    if (adelante !== 0 || lateral !== 0) {
      const mag = Math.hypot(adelante, lateral);
      const nf = adelante / mag;
      const nl = lateral / mag;
      const sinY = Math.sin(jugador.yaw);
      const cosY = Math.cos(jugador.yaw);
      // Right-Handed: adelante = (sinY, cosY), derecha = (-cosY, sinY)
      const rx = -cosY;
      const rz = sinY;
      targetVx = (sinY * nf + rx * nl) * velMax;
      targetVz = (cosY * nf + rz * nl) * velMax;
    }
    const factorVel = 1 - Math.exp(-(adelante !== 0 || lateral !== 0 ? 14 : 12) * dtReal);
    jugador.vx += (targetVx - jugador.vx) * factorVel;
    jugador.vz += (targetVz - jugador.vz) * factorVel;

    jugador.x = Math.max(-14.2, Math.min(14.2, jugador.x + jugador.vx * dtReal));
    jugador.z = Math.max(-8.8, Math.min(8.8, jugador.z + jugador.vz * dtReal));

    // Gravedad / salto / vuelo creativo
    if (jugador.volando) {
      let vyMeta = 0;
      if (teclas.has("Space")) vyMeta += 4.6;
      if (teclas.has("KeyC") || teclas.has("ControlLeft")) vyMeta -= 4.6;
      jugador.velY += (vyMeta - jugador.velY) * (1 - Math.exp(-10 * dtReal));
      jugador.y = Math.min(9.5, jugador.y + jugador.velY * dtReal);
      if (jugador.y <= jugador.alturaActual) {
        jugador.y = jugador.alturaActual;
        jugador.velY = 0;
        jugador.volando = false;
        jugador.enSuelo = true;
        emitirEstadoMovilidad();
      }
    } else if (!jugador.enSuelo || jugador.velY !== 0) {
      jugador.velY -= 16.0 * dtReal;
      jugador.y += jugador.velY * dtReal;
      if (jugador.y <= jugador.alturaActual) {
        jugador.y = jugador.alturaActual;
        jugador.velY = 0;
        jugador.enSuelo = true;
      }
    }

    // Head-bob muy sutil solo cuando camina sobre el suelo
    const velPlanar = Math.hypot(jugador.vx, jugador.vz);
    if (jugador.enSuelo && !jugador.volando && velPlanar > 0.35 && !arrastrando) {
      jugador.pasoFase += dtReal * (corriendoAhora ? 11.5 : 8.2);
      const bobMeta = Math.sin(jugador.pasoFase) * (corriendoAhora ? 0.022 : 0.015);
      bobYActual += (bobMeta - bobYActual) * (1 - Math.exp(-15 * dtReal));
    } else {
      bobYActual *= Math.exp(-12 * dtReal);
    }

    if (cambioEstado) emitirEstadoMovilidad();
    sincronizarCamaraFP(bobYActual);
  }

  function actualizarMirilla(dtReal) {
    // Mientras arrastra con Pointer Lock o tecla G, actualizar meta suavemente siguiendo la mira
    if (arrastre && (arrastre.modoTeclaG || pointerLock?.estaActivo?.())) {
      const { x, y } = coordenadasMirillaPx();
      const p = puntoEnSueloAcotado(x, y, 10.5, arrastre.distAgarre);
      const nom = POSICION_NOMINAL[arrastre.id];
      arrastre.meta = ajustarPosicionArrastreSuave(p.x - nom.x, p.z - nom.z);
      arrastre.movido = true;
    }

    acumPick += dtReal;
    if (acumPick < 0.07) return;
    acumPick = 0;

    if (equipadoInventarioId) {
      const { x, y } = coordenadasMirillaPx();
      const pSuelo = puntoEnSueloAcotado(x, y, 10.5);
      const nom = POSICION_NOMINAL[equipadoInventarioId];
      aroColocar.position.set(pSuelo.x, 0.025, pSuelo.z);
      aroColocar.setEnabled(true);
      aroSugerido.position.set(nom.x, 0.025, nom.z);
      aroSugerido.setEnabled(true);
      bus.emit(EVENTOS.OBJETIVO_MIRILLA, { id: null, equipadoId: equipadoInventarioId });
      return;
    }

    const { x, y } = coordenadasMirillaPx();
    let pick = pickPieza(x, y);
    if (!pick?.hit && !pointerLock?.estaActivo?.()) {
      pick = pickPieza(engine.getRenderWidth() * 0.5, engine.getRenderHeight() * 0.5);
    }
    const id = pick?.hit ? pick.pickedMesh.metadata.paso : null;
    const prevId = objetivoMirillaActual?.id ?? null;
    const prevInst = objetivoMirillaActual?.instalado ?? false;
    const prevAtorn = objetivoMirillaActual?.atornillado ?? false;
    const inst = Boolean(id && instaladosSet.has(id));
    const atorn = Boolean(id && atornilladosSet.has(id));
    objetivoMirillaActual = id ? { id, instalado: inst, atornillado: atorn } : null;
    if (id !== prevId || inst !== prevInst || atorn !== prevAtorn) {
      bus.emit(
        EVENTOS.OBJETIVO_MIRILLA,
        objetivoMirillaActual ?? { id: null, instalado: false, atornillado: false, equipadoId: null },
      );
    }
  }

  function actualizarEscena(dtReal, dtSimulado, sim, operando) {
    relojVisual += dtReal;
    actualizarMovimientoFP(dtReal);
    actualizarMirilla(dtReal);

    // Pulso elegante de los aros guía en el piso
    if (aroSugerido.isEnabled()) {
      aroSugerido.scaling.setAll(1 + 0.055 * Math.sin(relojVisual * 4.5));
      aroSugerido.rotation.y += dtReal * 0.8;
    }
    if (aroColocar.isEnabled()) {
      aroColocar.scaling.setAll(1 + 0.045 * Math.sin(relojVisual * 6.0));
      aroColocar.rotation.y -= dtReal * 1.1;
    }

    // Avance de atornillado manteniendo [F]
    if (atornillando) {
      if (!instaladosSet.has(atornillando.id) || objetivoMirillaActual?.id !== atornillando.id) {
        atornillando = null;
        emitirEstadoMovilidad();
      } else {
        atornillando.progreso = Math.min(1, atornillando.progreso + dtReal / 1.0);
        emitirEstadoMovilidad();
        if (atornillando.progreso >= 1) {
          const idFinal = atornillando.id;
          const nuevoEstado = !atornillando.desatornillar;
          atornillando = null;
          bus.emit(EVENTOS.COMANDO_ATORNILLAR, { id: idFinal, atornillado: nuevoEstado });
          emitirEstadoMovilidad();
        }
      }
    }

    // Interpolación suave tanto en arrastre activo como al montar / devolver al almacén + vibración si suelta
    let animandoMontaje = false;
    const kSmooth = 1 - Math.exp(-(arrastre ? 8.5 : 11.0) * dtReal);
    const maxPasoArrastre = (jugador.agachado ? 2.4 : 7.5) * dtReal;

    for (const pasoId of Object.keys(estadoVisualPasos)) {
      if (inventarioSet.has(pasoId)) continue;
      const act = offsetsActuales[pasoId];
      const meta = arrastre?.id === pasoId ? arrastre.meta : offsetsObjetivo[pasoId];
      if (!act || !meta) continue;

      let ex = meta.dx - act.dx;
      let ez = meta.dz - act.dz;
      let nuevoDx = act.dx;
      let nuevoDz = act.dz;

      if (Math.abs(ex) > 0.0015 || Math.abs(ez) > 0.0015) {
        animandoMontaje = true;
        let stepX = ex * kSmooth;
        let stepZ = ez * kSmooth;
        if (arrastre?.id === pasoId) {
          const distStep = Math.hypot(stepX, stepZ);
          if (distStep > maxPasoArrastre && distStep > 0) {
            const f = maxPasoArrastre / distStep;
            stepX *= f;
            stepZ *= f;
          }
        }
        nuevoDx += stepX;
        nuevoDz += stepZ;
      } else {
        nuevoDx = meta.dx;
        nuevoDz = meta.dz;
      }

      // Vibración mecánica sutil si está encendida y la pieza no está atornillada
      let vibX = 0;
      let vibZ = 0;
      if (operando && instaladosSet.has(pasoId) && !atornilladosSet.has(pasoId) && arrastre?.id !== pasoId) {
        vibX = Math.sin(relojVisual * 48 + pasoId.length) * 0.0075;
        vibZ = Math.cos(relojVisual * 42 + pasoId.length * 2) * 0.0075;
      }
      if (nuevoDx !== act.dx || nuevoDz !== act.dz || vibX !== 0 || vibZ !== 0) {
        fijarOffsetPaso(pasoId, nuevoDx, nuevoDz, vibX, vibZ);
      }
    }

    // Animación de los 4 pernos hexagonales 3D por pieza instalada
    for (const [pasoId, reg] of Object.entries(pernosPorPaso)) {
      const visible = instaladosSet.has(pasoId) && !inventarioSet.has(pasoId);
      reg.raiz.setEnabled(visible);
      if (!visible) continue;
      const fija = atornilladosSet.has(pasoId);
      const enProgreso = atornillando?.id === pasoId ? atornillando.progreso : null;

      if (enProgreso !== null) {
        const t = atornillando.desatornillar ? 1 - enProgreso : enProgreso;
        reg.matLed.emissiveColor = new Color3(1.0 - t * 0.82, 0.62 + t * 0.2, 0.15);
        for (const p of reg.pernos) {
          p.position.y = 0.14 + (0.035 - 0.14) * t;
          p.rotation.y += dtReal * 18;
        }
      } else if (fija) {
        reg.matLed.emissiveColor = new Color3(0.18, 0.85, 0.45);
        for (const p of reg.pernos) p.position.y = 0.035;
      } else {
        reg.matLed.emissiveColor = new Color3(0.96, 0.62, 0.06);
        const flotar = 0.14 + 0.025 * Math.sin(relojVisual * 4.0);
        for (const p of reg.pernos) {
          p.position.y = flotar;
          p.rotation.y += dtReal * 1.4;
        }
      }
    }

    const sombrasDinamicas = animandoMontaje || arrastrando;
    if (sombrasEnModoDinamico !== sombrasDinamicas) {
      sombrasEnModoDinamico = sombrasDinamicas;
      entornoVisual.fijarModoSombrasDinamico(sombrasDinamicas);
    }

    particulas.fijarPosiciones(offsetsActuales);
    const bandaVisible = instaladosSet.has("banda");
    const separadorVisible = instaladosSet.has("separador") && estaAlineado(offsetsActuales, "separador");
    particulas.fijarEstadoOperativo(operando, separadorVisible);

    if (operando && bandaVisible) {
      const desp = sim.velocidadBanda * dtSimulado;
      for (const l of listaLamas) {
        l.position.x += desp;
        if (l.position.x > 3.95) l.position.x -= 8.0;
      }
      for (const r of rodillos) r.rotate(Axis.Z, -desp / 0.075, Space.LOCAL);
    }
    if (operando && instaladosSet.has("separador")) {
      const rpm = sim.montajeReal?.parametrosMaquina?.separador?.rpmTambor ?? 2600;
      for (const t of tambores) t.rotate(Axis.Z, dtSimulado * (rpm / 250), Space.LOCAL);
    }

    for (const { estacion, mat } of balizas) {
      if (!mat) continue;
      const est = sim.estaciones[estacion];
      const enLinea = instaladosSet.has(estacion);
      const detectando = enLinea && (est.sensorActivoHasta > sim.tiempo || est.actuadorActivoHasta > sim.tiempo);
      if (detectando) {
        mat.albedoColor = new Color3(1.0, 0.52, 0.08);
        mat.emissiveColor = new Color3(1.0, 0.48, 0.05);
        mat.emissiveIntensity = 4.2;
      } else if (operando && enLinea) {
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
      const abierta = instaladosSet.has("desviador") && sim.estaciones.desviador.actuadorActivoHasta > sim.tiempo;
      const meta = abierta ? -0.78 : 0;
      anguloCompuerta += (meta - anguloCompuerta) * (1 - Math.exp(-15 * dtReal));
      compuertaVidrio.rotationQuaternion = Quaternion.FromEulerAngles(0, anguloCompuerta, 0);
    }

    const soplando = instaladosSet.has("escaner") && sim.estaciones.escaner.actuadorActivoHasta > sim.tiempo;
    for (const b of boquillas) b.scaling.y = soplando ? 1.85 : 1.0;

    const tolvaVisible = instaladosSet.has("tolva");
    actualizarBandaInclinada(dtSimulado, operando, tolvaVisible, sim.velocidadBanda);

    poolMateriales.sincronizarConItems(sim.items);
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
  emitirEstadoMovilidad();

  return {
    engine,
    scene,
    actualizarEscena,
    redimensionar: () => engine.resize(),
    alternarEntorno: (visible) => entornoPlanta.alternar(visible),
    dispose() {
      window.removeEventListener("resize", alRedimensionar);
      window.removeEventListener("pointerup", alSoltarFueraDelCanvas);
      window.removeEventListener("mousemove", alMouseMoveLock);
      window.removeEventListener("keydown", alKeyDown);
      window.removeEventListener("keyup", alKeyUp);
      window.removeEventListener("blur", alPerderFoco);
      canvas.removeEventListener("wheel", alWheel);
      canvas.removeEventListener("contextmenu", alContextMenu);
      canvas.removeEventListener("dragover", alArrastrarSobreEscena);
      canvas.removeEventListener("drop", alSoltarEnEscena);
      desuscripciones.forEach((off) => off());
      limpiarBasuraSuelo();
      for (const p of piezasBandaInclinada) {
        p.inst.dispose();
        p.nodo.dispose();
      }
      for (const l of lamasInclinadas) l.dispose();
      raizLamasInclinadas.dispose();
      for (const obj of Object.values(cargaWallePorTipo)) obj.inst.dispose();
      texturaPiso.dispose();
      particulas.dispose();
      poolMateriales.dispose();
      fisicasBabylon.dispose();
      entornoVisual.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
