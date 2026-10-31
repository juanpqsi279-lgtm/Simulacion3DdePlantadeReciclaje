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
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { Axis, Space } from "@babylonjs/core/Maths/math.axis.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";

import { EVENTOS } from "../core/bus/eventBus.js";
import { configurarPipelineFotorealista } from "./renderingPipeline.js";
import { optimizarMaterialPbr, prepararBalizaSensor } from "./pbrEnhancer.js";
import { MaterialObjectPool } from "./objectPool.js";
import { inicializarFisicasBabylon } from "./babylonPhysics.js";
import { crearEfectosParticulasMaquinaria } from "./particleEffects.js";

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
    const c = await LoadAssetContainerAsync(`${config.manifest?.modelos?.ruta ?? "assets/models/"}${RUTA_MAQ}${archivo}`, scene);
    c.materials.forEach((m) => optimizarMaterialPbr(m, scene));
    contenedoresMaq.set(archivo, c);
    activosCargados++;
    bus.emit(EVENTOS.CARGA_3D_PROGRESO, { progreso: activosCargados / totalActivos, archivo });
  }

  const contenedoresMat = {};
  for (const [tipo, m] of Object.entries(cfgMat.materiales)) {
    const c = await LoadAssetContainerAsync(`${config.manifest?.modelos?.ruta ?? "assets/models/"}${RUTA_MAT}${m.modelo}`, scene);
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
      m.isPickable = false;
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

  // Físicas Cinemáticas en banda + Impostores Caja/Esfera + Sistemas de Partículas puros
  const fisicasBabylon = await inicializarFisicasBabylon(scene, contenedoresMat, 21);
  const poolMateriales = new MaterialObjectPool(scene, contenedoresMat, fisicasBabylon, 20);
  const particulas = crearEfectosParticulasMaquinaria(scene);

  let anguloCompuerta = 0;
  let modoWireframe = false;
  let contenedoresInstalados = false;
  const desuscripciones = [];

  desuscripciones.push(
    bus.on(EVENTOS.ESTADO_PLANTA, (snap) => {
      const visibles = new Set(snap.idsVisibles);
      contenedoresInstalados = visibles.has("contenedores");
      entornoVisual.fijarModoSombrasDinamico(true);
      for (const [pasoId, grupo] of Object.entries(estadoVisualPasos)) {
        grupo.alphaObjetivo = visibles.has(pasoId) ? 1 : 0;
        if (grupo.alphaObjetivo > 0) {
          for (const n of grupo.nodos) n.setEnabled(true);
        }
      }
      if (snap.fase === 0) {
        poolMateriales.liberarTodos();
        fisicasBabylon.limpiarContenedores();
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
      if (contenedoresInstalados) fisicasBabylon.depositarPiezaEnContenedor(ev);
    }),
  );

  desuscripciones.push(
    bus.on(EVENTOS.COMANDO_REINICIAR, () => {
      poolMateriales.liberarTodos();
      fisicasBabylon.limpiarContenedores();
    }),
  );

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
    if (sombrasEnModoDinamico !== animandoMontaje) {
      sombrasEnModoDinamico = animandoMontaje;
      entornoVisual.fijarModoSombrasDinamico(animandoMontaje);
    }

    const bandaVisible = estadoVisualPasos.banda?.alphaActual > 0.5;
    const separadorVisible = estadoVisualPasos.separador?.alphaActual > 0.5;
    particulas.fijarEstadoOperativo(operando, separadorVisible);

    if (operando && bandaVisible) {
      const desp = sim.velocidadBanda * dtSimulado;
      for (const l of listaLamas) {
        l.position.x += desp;
        if (l.position.x > 3.95) l.position.x -= 8.0;
      }
      for (const r of rodillos) r.rotate(Axis.Z, -desp / 0.075, Space.LOCAL);
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

    poolMateriales.sincronizarConItems(sim.items);

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
      desuscripciones.forEach((off) => off());
      particulas.dispose();
      poolMateriales.dispose();
      fisicasBabylon.dispose();
      entornoVisual.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
