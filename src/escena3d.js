// Capa 3D con Babylon.js (v9+). Carga los .glb, arma la planta y sincroniza el estado de la simulaciÃ³n.
import "@babylonjs/loaders/glTF";
import {
  Engine, Scene, Camera, ArcRotateCamera, HemisphericLight, DirectionalLight, ShadowGenerator,
  Vector3, Color3, Color4, MeshBuilder, StandardMaterial, TransformNode, Quaternion, Axis, Space,
  LoadAssetContainerAsync,
} from "@babylonjs/core";

const RUTA_MAQ = "maquinaria/";
const RUTA_MAT = "materiales/";

// DÃ³nde va cada pieza de maquinaria (coincide con la escena de vista previa).
const DISENO = {
  banda_a: { archivo: "banda_transportadora.glb", pos: [-2, 0, 0], paso: "banda" },
  banda_b: { archivo: "banda_transportadora.glb", pos: [2, 0, 0], paso: "banda" },
  tolva: { archivo: "tolva_alimentacion.glb", pos: [-3.2, 0, 0], paso: "tolva" },
  separador: { archivo: "separador_aluminio.glb", pos: [-0.8, 0, 0], paso: "separador" },
  escaner: { archivo: "escaner_optico_plastico.glb", pos: [1.2, 0, 0], paso: "escaner" },
  desviador: { archivo: "desviador_vidrio.glb", pos: [3.0, 0, 0], paso: "desviador" },
  cont_aluminio: { archivo: "contenedor_aluminio.glb", pos: [-0.3, 0, -1.3], paso: "contenedores" },
  cont_plastico: { archivo: "contenedor_plastico.glb", pos: [1.7, 0, -1.3], paso: "contenedores" },
  cont_vidrio: { archivo: "contenedor_vidrio.glb", pos: [3.5, 0, -1.3], paso: "contenedores" },
};

const CAMARAS = {
  general: { alpha: Math.PI / 2 + 0.35, beta: 0.85, radius: 9.5, target: [0.2, 0.5, -0.5] },
  cenital: { alpha: Math.PI / 2, beta: 0.01, radius: 11, target: [0.2, 0, -0.4] },
  tolva: { alpha: Math.PI / 2 + 0.9, beta: 1.15, radius: 4.5, target: [-3, 0.9, 0] },
  salida: { alpha: Math.PI / 2 - 0.6, beta: 1.0, radius: 5.2, target: [2.6, 0.5, -0.6] },
};

function ajustarMaterial(mat) {
  // Sin mapa de entorno, un metal puro se ve negro: se suaviza para que las luces directas lo iluminen.
  if (mat.metallic !== undefined) mat.metallic = Math.min(mat.metallic ?? 0, 0.35);
  if (mat.roughness !== undefined) mat.roughness = Math.max(mat.roughness ?? 0.5, 0.45);
}

function indexar(raiz) {
  const mapa = new Map();
  for (const n of raiz.getDescendants(false)) mapa.set(n.name, n);
  return mapa;
}

function fijarPivote(nodo) {
  const info = nodo.getBoundingInfo?.();
  if (info) nodo.setPivotPoint(info.boundingBox.center.clone());
}

export async function crearEscena3D(canvas, { cfg, onProgreso = () => {} }) {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false }, true);
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true; // el generador de modelos usa ejes de glTF (derecho)
  scene.clearColor = Color4.FromHexString("#0b1620ff");
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = Color3.FromHexString("#0b1620");
  scene.fogStart = 14;
  scene.fogEnd = 32;

  const camara = new ArcRotateCamera("camara", 0, 0, 1, Vector3.Zero(), scene);
  camara.lowerRadiusLimit = 2;
  camara.upperRadiusLimit = 22;
  camara.upperBetaLimit = Math.PI / 2 - 0.02;
  camara.wheelPrecision = 40;
  camara.panningSensibility = 1500;
  camara.minZ = 0.05;
  camara.fov = 0.9;
  camara.fovMode = Camera.FOVMODE_HORIZONTAL_FIXED;
  camara.attachControl(canvas, true);

  let destinoCam = null;
  const aplicarCamara = (nombre, inmediato) => {
    const c = CAMARAS[nombre];
    if (!c) return;
    destinoCam = { alpha: c.alpha, beta: c.beta, radius: c.radius, target: new Vector3(...c.target) };
    if (inmediato) {
      camara.target = destinoCam.target.clone(); // asignar el target primero: recalcula alpha/beta/radius
      camara.alpha = c.alpha; camara.beta = c.beta; camara.radius = c.radius;
      destinoCam = null;
    }
  };
  aplicarCamara("general", true);
  canvas.addEventListener("pointerdown", () => { destinoCam = null; });

  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0.2), scene);
  hemi.intensity = 0.85;
  hemi.groundColor = Color3.FromHexString("#33414d");
  const sol = new DirectionalLight("sol", new Vector3(-0.5, -1, -0.4), scene);
  sol.position = new Vector3(6, 10, 6);
  sol.intensity = 1.1;
  const sombras = new ShadowGenerator(1024, sol);
  sombras.useBlurExponentialShadowMap = true;
  sombras.blurKernel = 12;

  // Piso y lÃ­neas de seguridad
  const piso = MeshBuilder.CreateGround("piso", { width: 24, height: 16 }, scene);
  const matPiso = new StandardMaterial("matPiso", scene);
  matPiso.diffuseColor = Color3.FromHexString("#27333d");
  matPiso.specularColor = Color3.Black();
  piso.material = matPiso;
  piso.receiveShadows = true;
  const matLinea = new StandardMaterial("matLinea", scene);
  matLinea.diffuseColor = Color3.FromHexString("#f2b705");
  matLinea.emissiveColor = Color3.FromHexString("#5a4400");
  for (const [w, d, x, z] of [[11, 0.08, 0, 1.4], [11, 0.08, 0, -2.2], [0.08, 3.68, -5.5, -0.4], [0.08, 3.68, 5.5, -0.4]]) {
    const l = MeshBuilder.CreateBox("linea", { width: w, height: 0.004, depth: d }, scene);
    l.position.set(x, 0.003, z);
    l.material = matLinea;
  }

  // â”€â”€â”€â”€â”€ Carga de modelos â”€â”€â”€â”€â”€
  const total = new Set(Object.values(DISENO).map((d) => d.archivo)).size + Object.keys(cfg.materiales).length;
  let cargados = 0;
  const avance = (txt) => onProgreso(++cargados / total, txt);

  const contMaq = new Map();
  for (const d of Object.values(DISENO)) {
    if (contMaq.has(d.archivo)) continue;
    const c = await LoadAssetContainerAsync(`assets/models/${RUTA_MAQ}${d.archivo}`, scene);
    c.materials.forEach(ajustarMaterial);
    contMaq.set(d.archivo, c);
    avance(d.archivo);
  }
  const contMat = {};
  for (const [tipo, m] of Object.entries(cfg.materiales)) {
    const c = await LoadAssetContainerAsync(`assets/models/${RUTA_MAT}${m.modelo}`, scene);
    c.materials.forEach(ajustarMaterial);
    contMat[tipo] = c;
    avance(m.modelo);
  }

  // â”€â”€â”€â”€â”€ Ensamblado de la planta â”€â”€â”€â”€â”€
  const grupos = {};   // paso -> [TransformNode]
  const partes = {};   // id de diseÃ±o -> Map(nombre -> nodo)
  const luces = [];    // luces de estado { mesh, estacion }
  const rodillos = []; // nodos que giran con la banda
  const tambores = [];
  let gate = null;

  for (const [id, d] of Object.entries(DISENO)) {
    const entradas = contMaq.get(d.archivo).instantiateModelsToScene((n) => `${id}_${n}`, true, { doNotInstantiate: true });
    const raiz = new TransformNode(`grupo_${id}`, scene);
    entradas.rootNodes.forEach((r) => (r.parent = raiz));
    raiz.position.set(...d.pos);
    raiz.setEnabled(false);
    (grupos[d.paso] ??= []).push(raiz);
    const idx = new Map();
    for (const n of raiz.getDescendants(false)) idx.set(n.name.slice(id.length + 1), n);
    partes[id] = idx;
    raiz.getChildMeshes().forEach((m) => { sombras.addShadowCaster(m); m.receiveShadows = true; });
  }

  for (const id of ["banda_a", "banda_b"]) {
    for (const [nombre, nodo] of partes[id]) {
      if (nombre === "rodillo_inicio" || nombre === "rodillo_fin" || nombre.startsWith("rodillo_soporte")) {
        fijarPivote(nodo);
        rodillos.push(nodo);
      }
    }
  }
  partes.banda_a.get("motor")?.setEnabled(false); // el motor queda solo en el extremo final
  for (const id of ["separador"]) for (const n of ["tambor_magnetico", "aspas_tambor"]) {
    const nodo = partes[id].get(n);
    if (nodo) { fijarPivote(nodo); tambores.push(nodo); }
  }
  for (const [id, estacion] of [["separador", "separador"], ["escaner", "escaner"], ["desviador", "desviador"]]) {
    const luz = partes[id].get("luz_estado");
    if (luz) luces.push({ mesh: luz, estacion });
  }
  const bocas = [...partes.escaner.entries()].filter(([n]) => n.startsWith("boquilla_")).map(([, n]) => n);
  gate = partes.desviador.get("compuerta_pivote") ?? null;
  if (gate) gate.rotationQuaternion = Quaternion.FromEulerAngles(0, 0, 0);

  // Lamas de la banda para dar sensaciÃ³n de movimiento
  const lamas = new TransformNode("lamas", scene);
  (grupos.banda ??= []).push(lamas);
  lamas.setEnabled(false);
  const matLama = new StandardMaterial("matLama", scene);
  matLama.diffuseColor = Color3.FromHexString("#4a5560");
  matLama.specularColor = Color3.Black();
  const listaLamas = [];
  for (let i = 0; i < 16; i++) {
    const l = MeshBuilder.CreateBox(`lama_${i}`, { width: 0.04, height: 0.003, depth: 0.5 }, scene);
    l.material = matLama;
    l.parent = lamas;
    l.position.set(-4 + 0.25 + i * 0.5, 0.8165, 0);
    listaLamas.push(l);
  }

  // â”€â”€â”€â”€â”€ AnimaciÃ³n de montaje â”€â”€â”€â”€â”€
  const caidas = []; // { nodo, y0, t }
  const instalados = new Set();
  function instalarPaso(id, animar = true) {
    if (instalados.has(id)) return;
    instalados.add(id);
    for (const nodo of grupos[id] ?? []) {
      nodo.setEnabled(true);
      if (animar && nodo.name !== "lamas") {
        const y0 = nodo.position.y;
        nodo.position.y = y0 + 3;
        caidas.push({ nodo, y0, t: 0 });
      }
    }
  }
  function desmontar() {
    instalados.clear();
    caidas.length = 0;
    for (const lista of Object.values(grupos)) for (const n of lista) {
      n.setEnabled(false);
      if (n.name !== "lamas") n.position.y = 0;
    }
  }
  const estaInstalado = (id) => instalados.has(id);

  // â”€â”€â”€â”€â”€ Elementos en movimiento â”€â”€â”€â”€â”€
  const visuales = new Map(); // id de item -> { raiz, entradas }
  const pitido = { gate: 0 };

  function crearVisual(it) {
    const entradas = contMat[it.tipo].instantiateModelsToScene(undefined, false);
    const raiz = entradas.rootNodes[0];
    raiz.rotationQuaternion = null;
    visuales.set(it.id, { raiz, entradas });
    return visuales.get(it.id);
  }

  function limpiarItems() {
    for (const v of visuales.values()) v.entradas.dispose();
    visuales.clear();
  }

  function actualizar(dt, sim, corriendo) {
    // cÃ¡mara suave
    if (destinoCam) {
      const k = 1 - Math.exp(-6 * dt);
      const alpha = camara.alpha + (destinoCam.alpha - camara.alpha) * k;
      const beta = camara.beta + (destinoCam.beta - camara.beta) * k;
      const radius = camara.radius + (destinoCam.radius - camara.radius) * k;
      camara.target = Vector3.Lerp(camara.target, destinoCam.target, k); // recalcula los Ã¡ngulos, se reponen abajo
      camara.alpha = alpha; camara.beta = beta; camara.radius = radius;
      if (Math.abs(destinoCam.radius - camara.radius) < 0.01 && Math.abs(destinoCam.alpha - camara.alpha) < 0.002) destinoCam = null;
    }

    // caÃ­da de piezas al montar
    for (let i = caidas.length - 1; i >= 0; i--) {
      const c = caidas[i];
      c.t = Math.min(c.t + dt / 0.9, 1);
      const e = 1 - Math.pow(1 - c.t, 3);
      c.nodo.position.y = c.y0 + 3 * (1 - e);
      if (c.t >= 1) caidas.splice(i, 1);
    }

    const movimiento = corriendo && estaInstalado("banda") ? sim.velocidadBanda * dt : 0;
    if (movimiento) {
      for (const l of listaLamas) {
        l.position.x += movimiento;
        if (l.position.x > 4 - 0.05) l.position.x -= 8;
      }
      for (const r of rodillos) r.rotate(Axis.Z, -movimiento / 0.075, Space.LOCAL);
    }
    if (corriendo) for (const t of tambores) t.rotate(Axis.Z, dt * 9, Space.LOCAL);

    // luces de estado, compuerta y boquillas
    for (const { mesh, estacion } of luces) {
      const activa = sim.estaciones[estacion].activaHasta > sim.tiempo;
      const mat = mesh.material;
      if (mat?.emissiveColor) mat.emissiveColor = activa ? new Color3(1, 0.45, 0.05) : corriendo ? new Color3(0.1, 0.8, 0.3) : new Color3(0.2, 0.2, 0.2);
      if (mat?.albedoColor) mat.albedoColor = activa ? new Color3(1, 0.45, 0.05) : corriendo ? new Color3(0.18, 0.8, 0.44) : new Color3(0.25, 0.25, 0.25);
    }
    if (gate) {
      const activa = sim.estaciones.desviador.activaHasta > sim.tiempo;
      pitido.gate += ((activa ? -0.75 : 0) - pitido.gate) * (1 - Math.exp(-12 * dt));
      gate.rotationQuaternion = Quaternion.FromEulerAngles(0, pitido.gate, 0);
    }
    const sopla = sim.estaciones.escaner.activaHasta > sim.tiempo;
    for (const b of bocas) b.scaling.y = sopla ? 1.8 : 1;

    // items
    const vivos = new Set();
    for (const it of sim.items) {
      vivos.add(it.id);
      const v = visuales.get(it.id) ?? crearVisual(it);
      v.raiz.position.set(it.x, it.y, it.z);
      v.raiz.rotation.y = it.giro;
    }
    for (const [id, v] of visuales) {
      if (vivos.has(id)) continue;
      v.entradas.dispose();
      visuales.delete(id);
    }
  }

  engine.resize();
  window.addEventListener("resize", () => engine.resize());

  return {
    engine, scene, actualizar, instalarPaso, desmontar, estaInstalado, limpiarItems,
    camara: aplicarCamara,
    dispose: () => { limpiarItems(); scene.dispose(); engine.dispose(); },
  };
}



