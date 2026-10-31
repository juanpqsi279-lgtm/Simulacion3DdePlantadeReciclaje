// tools/generar-modelos.mjs
// Genera los modelos 3D iniciales (.glb) de la Planta de Reciclaje en Lumbreras.
// JavaScript puro (ES modules), sin dependencias. Unidades: metros. Eje Y hacia arriba.
// Uso:  node tools/generar-modelos.mjs [carpeta_salida]
// Salida por defecto: public/assets/models

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const SALIDA = process.argv[2] ?? join(AQUI, "..", "public", "assets", "models");

// ───────────────────────── Materiales PBR ─────────────────────────
const hex = (h, a = 1) => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255,
  a,
];
const MAT = {
  acero: { name: "acero", color: hex("#b8c2cc"), metal: 0.9, rough: 0.26 },
  acero_oscuro: { name: "acero_oscuro", color: hex("#424b54"), metal: 0.82, rough: 0.36 },
  banda_goma: { name: "banda_goma", color: hex("#1b1f23"), metal: 0.04, rough: 0.88 },
  pintura_amarilla: { name: "pintura_amarilla", color: hex("#f2b705"), metal: 0.18, rough: 0.34 },
  pintura_azul: { name: "pintura_azul", color: hex("#1f6fb5"), metal: 0.18, rough: 0.34 },
  pintura_roja: { name: "pintura_roja", color: hex("#c0392b"), metal: 0.18, rough: 0.34 },
  luz_verde: { name: "luz_verde", color: hex("#2ecc71"), metal: 0.0, rough: 0.18, emissive: [0.15, 0.95, 0.4] },
  lente: { name: "lente", color: hex("#0c141d"), metal: 0.1, rough: 0.03 },
  // Materiales a separar con propiedades PBR físicamente calibradas
  pet: { name: "pet_transparente", color: hex("#cbeaff", 0.58), metal: 0.0, rough: 0.06, blend: true, doble: true },
  tapa_azul: { name: "tapa_azul", color: hex("#1d74c4"), metal: 0.05, rough: 0.38 },
  etiqueta: { name: "etiqueta", color: hex("#f6f7f2"), metal: 0.0, rough: 0.62 },
  aluminio: { name: "aluminio", color: hex("#e3e7eb"), metal: 0.98, rough: 0.18 },
  lata_roja: { name: "lata_banda_roja", color: hex("#cc2f26"), metal: 0.78, rough: 0.24 },
  vidrio_verde: { name: "vidrio_verde", color: hex("#289c52", 0.56), metal: 0.0, rough: 0.03, blend: true, doble: true },
  chapa: { name: "chapa_corona", color: hex("#dbb22c"), metal: 0.94, rough: 0.22 },
  cont_azul: { name: "contenedor_plastico", color: hex("#1f6fb5"), metal: 0.22, rough: 0.44 },
  cont_gris: { name: "contenedor_aluminio", color: hex("#8d99a6"), metal: 0.55, rough: 0.34 },
  cont_verde: { name: "contenedor_vidrio", color: hex("#2f8f4e"), metal: 0.22, rough: 0.44 },
};

// ───────────────────────── Geometría ─────────────────────────
// Una "geo" es { pos:[x,y,z...], nor:[...], idx:[...] }. Siempre se corrige el sentido de las caras
// para que apunten hacia afuera (según la normal del vértice).

function nuevaGeo() { return { pos: [], nor: [], idx: [] }; }

function normalizar(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function arreglarSentido(g) {
  for (let i = 0; i < g.idx.length; i += 3) {
    const [a, b, c] = [g.idx[i], g.idx[i + 1], g.idx[i + 2]];
    const P = (k) => [g.pos[k * 3], g.pos[k * 3 + 1], g.pos[k * 3 + 2]];
    const [pa, pb, pc] = [P(a), P(b), P(c)];
    const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const na = [g.nor[a * 3], g.nor[a * 3 + 1], g.nor[a * 3 + 2]];
    const dot = n[0] * na[0] + n[1] * na[1] + n[2] * na[2];
    if (dot < 0) { g.idx[i + 1] = c; g.idx[i + 2] = b; }
  }
  return g;
}

function caja(cx, cy, cz, sx, sy, sz) {
  const g = nuevaGeo();
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const caras = [
    [[1, 0, 0], [[hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz]]],
    [[-1, 0, 0], [[-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-hx, -hy, -hz]]],
    [[0, 1, 0], [[-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz]]],
    [[0, -1, 0], [[-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz]]],
    [[0, 0, 1], [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]]],
    [[0, 0, -1], [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]]],
  ];
  for (const [n, vs] of caras) {
    const base = g.pos.length / 3;
    for (const v of vs) { g.pos.push(v[0] + cx, v[1] + cy, v[2] + cz); g.nor.push(...n); }
    g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return arreglarSentido(g);
}

// Sólido de revolución alrededor del eje Y. perfil = [[radio, y], ...] de abajo hacia arriba.
function torno(perfil, seg = 28, cx = 0, cy = 0, cz = 0) {
  const g = nuevaGeo();
  for (let i = 0; i < perfil.length - 1; i++) {
    const [r0, y0] = perfil[i], [r1, y1] = perfil[i + 1];
    const dr = r1 - r0, dy = y1 - y0;
    const nrm = normalizar([dy, -dr, 0]); // (componente radial, componente y)
    const base = g.pos.length / 3;
    for (let s = 0; s <= seg; s++) {
      const t = (s / seg) * Math.PI * 2;
      const c = Math.cos(t), sn = Math.sin(t);
      g.pos.push(r0 * c + cx, y0 + cy, r0 * sn + cz);
      g.nor.push(nrm[0] * c, nrm[1], nrm[0] * sn);
      g.pos.push(r1 * c + cx, y1 + cy, r1 * sn + cz);
      g.nor.push(nrm[0] * c, nrm[1], nrm[0] * sn);
    }
    for (let s = 0; s < seg; s++) {
      const a = base + s * 2;
      g.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  return arreglarSentido(g);
}

// Cilindro cerrado. eje: "x" | "y" | "z"
function cilindro(cx, cy, cz, radio, largo, eje = "y", seg = 28) {
  const g = torno([[0, -largo / 2], [radio, -largo / 2], [radio, largo / 2], [0, largo / 2]], seg);
  rotarEje(g, eje);
  mover(g, cx, cy, cz);
  return arreglarSentido(g);
}

function rotarEje(g, eje) {
  if (eje === "y") return;
  for (let i = 0; i < g.pos.length; i += 3) {
    for (const arr of [g.pos, g.nor]) {
      const [x, y, z] = [arr[i], arr[i + 1], arr[i + 2]];
      if (eje === "x") { arr[i] = y; arr[i + 1] = -x; arr[i + 2] = z; }
      else if (eje === "z") { arr[i] = x; arr[i + 1] = -z; arr[i + 2] = y; }
    }
  }
}

function mover(g, dx, dy, dz) {
  for (let i = 0; i < g.pos.length; i += 3) { g.pos[i] += dx; g.pos[i + 1] += dy; g.pos[i + 2] += dz; }
  return g;
}

// Tronco de pirámide (tolva). Abierto arriba y abajo, se usa con material de doble cara.
function tronco(cx, yBase, cz, anchoBase, fondoBase, anchoTop, fondoTop, alto) {
  const g = nuevaGeo();
  const b = [[-anchoBase / 2, -fondoBase / 2], [anchoBase / 2, -fondoBase / 2], [anchoBase / 2, fondoBase / 2], [-anchoBase / 2, fondoBase / 2]];
  const t = [[-anchoTop / 2, -fondoTop / 2], [anchoTop / 2, -fondoTop / 2], [anchoTop / 2, fondoTop / 2], [-anchoTop / 2, fondoTop / 2]];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const p = [
      [b[i][0] + cx, yBase, b[i][1] + cz], [b[j][0] + cx, yBase, b[j][1] + cz],
      [t[j][0] + cx, yBase + alto, t[j][1] + cz], [t[i][0] + cx, yBase + alto, t[i][1] + cz],
    ];
    const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const v = [p[3][0] - p[0][0], p[3][1] - p[0][1], p[3][2] - p[0][2]];
    const n = normalizar([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
    const base = g.pos.length / 3;
    for (const q of p) { g.pos.push(...q); g.nor.push(...n); }
    g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return g; // sin arreglarSentido: la cara visible se decide con material de doble cara
}

// ───────────────────────── Escritor GLB ─────────────────────────
// parte = { nombre, geo, mat (clave de MAT), trasl?:[x,y,z], rotY?:radianes, hijos? }
function escribirGLB(nombreArchivo, partes, extras = {}) {
  const usados = [...new Set(partes.map((p) => p.mat))];
  const materials = usados.map((k) => {
    const m = MAT[k];
    const o = {
      name: m.name,
      pbrMetallicRoughness: { baseColorFactor: m.color, metallicFactor: m.metal, roughnessFactor: m.rough },
    };
    if (m.blend) o.alphaMode = "BLEND";
    if (m.doble) o.doubleSided = true;
    if (m.emissive) o.emissiveFactor = m.emissive;
    return o;
  });
  const bufs = [];
  let offset = 0;
  const bufferViews = [], accessors = [], meshes = [], nodes = [];
  const empujar = (typed, target) => {
    const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (bytes.length % 4)) % 4;
    bufs.push(bytes, Buffer.alloc(pad));
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target });
    offset += bytes.length + pad;
    return bufferViews.length - 1;
  };

  for (const p of partes) {
    const pos = new Float32Array(p.geo.pos);
    const nor = new Float32Array(p.geo.nor);
    const grande = p.geo.pos.length / 3 > 65535;
    const idx = grande ? new Uint32Array(p.geo.idx) : new Uint16Array(p.geo.idx);
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], pos[i + k]); mx[k] = Math.max(mx[k], pos[i + k]); }
    const vp = empujar(pos, 34962), vn = empujar(nor, 34962), vi = empujar(idx, 34963);
    accessors.push({ bufferView: vp, componentType: 5126, count: pos.length / 3, type: "VEC3", min: mn, max: mx });
    const aP = accessors.length - 1;
    accessors.push({ bufferView: vn, componentType: 5126, count: nor.length / 3, type: "VEC3" });
    const aN = accessors.length - 1;
    accessors.push({ bufferView: vi, componentType: grande ? 5125 : 5123, count: idx.length, type: "SCALAR" });
    const aI = accessors.length - 1;
    meshes.push({
      name: p.nombre,
      primitives: [{ attributes: { POSITION: aP, NORMAL: aN }, indices: aI, material: usados.indexOf(p.mat), mode: 4 }],
    });
    const nodo = { name: p.nombre, mesh: meshes.length - 1 };
    if (p.trasl) nodo.translation = p.trasl;
    if (p.rotY) nodo.rotation = [0, Math.sin(p.rotY / 2), 0, Math.cos(p.rotY / 2)];
    nodes.push(nodo);
  }

  const raiz = { name: extras.nombreRaiz ?? nombreArchivo.replace(/\.glb$/, ""), children: nodes.map((_, i) => i + 1) };
  const gltf = {
    asset: { version: "2.0", generator: "tools/generar-modelos.mjs (Simulación 3D Planta de Reciclaje)" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [raiz, ...nodes],
    meshes, materials, accessors, bufferViews,
    buffers: [{ byteLength: offset }],
  };

  let json = Buffer.from(JSON.stringify(gltf), "utf8");
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const bin = Buffer.concat(bufs);
  const total = 12 + 8 + json.length + 8 + bin.length;
  const h = Buffer.alloc(12);
  h.write("glTF", 0, "ascii"); h.writeUInt32LE(2, 4); h.writeUInt32LE(total, 8);
  const cj = Buffer.alloc(8); cj.writeUInt32LE(json.length, 0); cj.write("JSON", 4, "ascii");
  const cb = Buffer.alloc(8); cb.writeUInt32LE(bin.length, 0); cb.write("BIN\0", 4, "latin1");
  const dir = extras.carpeta ? join(SALIDA, extras.carpeta) : SALIDA;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, nombreArchivo), Buffer.concat([h, cj, json, cb, bin]));
  return { archivo: join(extras.carpeta ?? "", nombreArchivo), bytes: total, partes: partes.length };
}

// ───────────────────────── Materiales a separar ─────────────────────────
// Origen en la base, centrado. Eje Y hacia arriba.

function botellaPlastico() {
  const cuerpo = torno([
    [0, 0.0], [0.026, 0.0], [0.033, 0.008], [0.033, 0.13], [0.030, 0.15],
    [0.019, 0.172], [0.0145, 0.180], [0.0145, 0.196], [0.0, 0.196],
  ], 28);
  const etiqueta = torno([[0.0336, 0.05], [0.0336, 0.11]], 28); // banda de papel (solo pared)
  const tapa = torno([[0, 0.194], [0.0168, 0.194], [0.0168, 0.214], [0, 0.214]], 20);
  return [
    { nombre: "botella_pet_cuerpo", geo: cuerpo, mat: "pet" },
    { nombre: "botella_pet_etiqueta", geo: etiqueta, mat: "etiqueta" },
    { nombre: "botella_pet_tapa", geo: tapa, mat: "tapa_azul" },
  ];
}

function lataAluminio() {
  const cuerpo = torno([
    [0, 0.006], [0.021, 0.0], [0.029, 0.002], [0.033, 0.012], [0.033, 0.104],
    [0.031, 0.111], [0.027, 0.115], [0.027, 0.1175], [0.0, 0.1175],
  ], 28);
  const banda = torno([[0.0332, 0.035], [0.0332, 0.085]], 28);
  const anillo = torno([[0.0275, 0.1175], [0.0275, 0.1215], [0.0245, 0.1215], [0.0245, 0.1175]], 28);
  return [
    { nombre: "lata_cuerpo", geo: cuerpo, mat: "aluminio" },
    { nombre: "lata_banda", geo: banda, mat: "lata_roja" },
    { nombre: "lata_borde", geo: anillo, mat: "aluminio" },
  ];
}

function botellaVidrio() {
  const cuerpo = torno([
    [0, 0.003], [0.024, 0.0], [0.030, 0.004], [0.030, 0.115], [0.027, 0.140],
    [0.019, 0.165], [0.0145, 0.185], [0.0138, 0.215], [0.0158, 0.218],
    [0.0158, 0.230], [0.0, 0.230],
  ], 28);
  const chapa = torno([[0, 0.228], [0.0172, 0.228], [0.0172, 0.234], [0, 0.234]], 24);
  return [
    { nombre: "botella_vidrio_cuerpo", geo: cuerpo, mat: "vidrio_verde" },
    { nombre: "botella_vidrio_chapa", geo: chapa, mat: "chapa" },
  ];
}

// ───────────────────────── Maquinaria ─────────────────────────
// Convención: la línea corre a lo largo del eje X (+X = dirección del flujo).
// La superficie superior de la banda queda en y = 0.815 m. El ancho útil de la banda es 0.56 m (eje Z).

const ALTURA_BANDA = 0.815;

function bandaTransportadora(largo = 4.0) {
  const ancho = 0.6;
  const p = [];
  for (const z of [-0.32, 0.32]) {
    p.push({ nombre: `riel_${z < 0 ? "izq" : "der"}`, geo: caja(0, 0.74, z, largo, 0.12, 0.05), mat: "pintura_azul" });
  }
  p.push({ nombre: "banda", geo: caja(0, 0.80, 0, largo - 0.1, 0.03, 0.56), mat: "banda_goma" });
  p.push({ nombre: "rodillo_inicio", geo: cilindro(-largo / 2 + 0.06, 0.74, 0, 0.075, 0.58, "z"), mat: "acero" });
  p.push({ nombre: "rodillo_fin", geo: cilindro(largo / 2 - 0.06, 0.74, 0, 0.075, 0.58, "z"), mat: "acero" });
  const nIdler = 6;
  for (let i = 0; i < nIdler; i++) {
    const x = -largo / 2 + 0.4 + (i * (largo - 0.8)) / (nIdler - 1);
    p.push({ nombre: `rodillo_soporte_${i + 1}`, geo: cilindro(x, 0.72, 0, 0.025, 0.56, "z", 16), mat: "acero_oscuro" });
  }
  let n = 1;
  for (const x of [-largo / 2 + 0.25, largo / 2 - 0.25]) {
    for (const z of [-0.32, 0.32]) {
      p.push({ nombre: `pata_${n++}`, geo: caja(x, 0.34, z, 0.06, 0.68, 0.06), mat: "acero_oscuro" });
    }
  }
  p.push({ nombre: "motor", geo: cilindro(largo / 2 + 0.05, 0.74, 0.0, 0.09, 0.2, "z", 20), mat: "pintura_roja" });
  return p;
}

function tolvaAlimentacion() {
  const p = [];
  p.push({ nombre: "tolva_cuerpo", geo: tronco(0, 1.1, 0, 0.4, 0.4, 1.4, 1.4, 0.9), mat: "pintura_amarilla" });
  p.push({ nombre: "tolva_boca", geo: caja(0, 0.97, 0, 0.4, 0.26, 0.4), mat: "pintura_amarilla" });
  let n = 1;
  for (const x of [-0.45, 0.45]) for (const z of [-0.45, 0.45]) {
    p.push({ nombre: `pata_${n++}`, geo: caja(x, 0.8, z, 0.07, 1.6, 0.07), mat: "acero_oscuro" });
  }
  p.push({ nombre: "compuerta_salida", geo: caja(0, 0.88, 0, 0.42, 0.02, 0.42), mat: "acero" });
  return p;
}

function portico(ancho = 1.0, altoPortico = 1.6) {
  const p = [];
  for (const z of [-ancho / 2, ancho / 2]) {
    p.push({ nombre: `poste_${z < 0 ? "izq" : "der"}`, geo: caja(0, altoPortico / 2, z, 0.1, altoPortico, 0.1), mat: "pintura_azul" });
  }
  return p;
}

function separadorAluminio() {
  // Separador por corrientes de Foucault (eddy current) para aluminio
  const p = portico(1.1, 1.7);
  p.push({ nombre: "carcasa", geo: caja(0, 1.55, 0, 0.9, 0.35, 1.1), mat: "pintura_azul" });
  p.push({ nombre: "tambor_magnetico", geo: cilindro(0, 1.2, 0, 0.22, 0.56, "z", 32), mat: "acero_oscuro" });
  p.push({ nombre: "aspas_tambor", geo: cilindro(0, 1.2, 0, 0.226, 0.30, "z", 32), mat: "pintura_roja" });
  p.push({ nombre: "divisor", geo: caja(0.45, 0.92, 0, 0.5, 0.02, 0.56), mat: "acero" });
  p.push({ nombre: "luz_estado", geo: cilindro(0, 1.78, 0, 0.04, 0.1, "y", 16), mat: "luz_verde" });
  return p;
}

function escanerOptico() {
  // Clasificador óptico (infrarrojo cercano) con barra de boquillas de aire para plástico
  const p = portico(1.1, 1.5);
  p.push({ nombre: "carcasa_sensores", geo: caja(0, 1.42, 0, 0.5, 0.3, 1.1), mat: "pintura_amarilla" });
  p.push({ nombre: "lente_1", geo: cilindro(0, 1.24, -0.15, 0.05, 0.05, "y", 20), mat: "lente" });
  p.push({ nombre: "lente_2", geo: cilindro(0, 1.24, 0.15, 0.05, 0.05, "y", 20), mat: "lente" });
  p.push({ nombre: "barra_boquillas", geo: caja(0.35, 0.95, 0, 0.06, 0.05, 0.56), mat: "acero" });
  for (let i = 0; i < 7; i++) {
    p.push({ nombre: `boquilla_${i + 1}`, geo: cilindro(0.35, 0.915, -0.24 + i * 0.08, 0.012, 0.03, "y", 10), mat: "acero_oscuro" });
  }
  p.push({ nombre: "luz_estado", geo: cilindro(0, 1.62, 0, 0.04, 0.1, "y", 16), mat: "luz_verde" });
  return p;
}

function desviadorVidrio() {
  // Desviador de compuerta para vidrio (la compuerta pivota sobre su eje vertical → animable)
  const p = portico(1.1, 1.3);
  p.push({ nombre: "carcasa_actuador", geo: caja(0, 1.22, 0, 0.5, 0.25, 1.1), mat: "pintura_roja" });
  p.push({ nombre: "actuador", geo: cilindro(0, 1.0, -0.4, 0.04, 0.3, "y", 16), mat: "acero" });
  // Compuerta: el nodo está en la bisagra (0,0.9,-0.28); la geometría se extiende hacia +Z
  p.push({
    nombre: "compuerta_pivote",
    geo: caja(0, 0, 0.28, 0.02, 0.2, 0.56),
    mat: "acero",
    trasl: [0, 0.9, -0.28],
    rotY: 0,
  });
  p.push({ nombre: "luz_estado", geo: cilindro(0, 1.4, 0, 0.04, 0.1, "y", 16), mat: "luz_verde" });
  return p;
}

function contenedor(matClave) {
  const [ancho, fondo, alto, e] = [0.9, 0.7, 0.7, 0.04];
  return [
    { nombre: "base", geo: caja(0, e / 2, 0, ancho, e, fondo), mat: matClave },
    { nombre: "pared_frontal", geo: caja(0, alto / 2, fondo / 2 - e / 2, ancho, alto, e), mat: matClave },
    { nombre: "pared_trasera", geo: caja(0, alto / 2, -fondo / 2 + e / 2, ancho, alto, e), mat: matClave },
    { nombre: "pared_izq", geo: caja(-ancho / 2 + e / 2, alto / 2, 0, e, alto, fondo - 2 * e), mat: matClave },
    { nombre: "pared_der", geo: caja(ancho / 2 - e / 2, alto / 2, 0, e, alto, fondo - 2 * e), mat: matClave },
    { nombre: "borde_superior", geo: caja(0, alto + 0.01, fondo / 2 - e / 2, ancho + 0.03, 0.02, e + 0.03), mat: "acero_oscuro" },
  ];
}

// ───────────────────────── Escena de vista previa ─────────────────────────
function desplazar(partes, dx, dy, dz, prefijo) {
  return partes.map((p) => {
    const nombre = `${prefijo}_${p.nombre}`;
    // Si la parte tiene su propio nodo trasladado (p. ej. una compuerta con bisagra), solo se mueve el nodo.
    if (p.trasl) return { ...p, nombre, trasl: [p.trasl[0] + dx, p.trasl[1] + dy, p.trasl[2] + dz] };
    return {
      ...p,
      nombre,
      geo: { pos: p.geo.pos.map((v, i) => (i % 3 === 0 ? v + dx : i % 3 === 1 ? v + dy : v + dz)), nor: p.geo.nor, idx: p.geo.idx },
    };
  });
}

function plantaVistaPrevia() {
  let partes = [];
  partes.push(...desplazar(bandaTransportadora(8.0), 0, 0, 0, "banda"));
  partes.push(...desplazar(tolvaAlimentacion(), -3.2, 0, 0, "tolva"));
  partes.push(...desplazar(separadorAluminio(), -0.8, 0, 0, "sep_aluminio"));
  partes.push(...desplazar(escanerOptico(), 1.2, 0, 0, "sep_plastico"));
  partes.push(...desplazar(desviadorVidrio(), 3.0, 0, 0, "sep_vidrio"));
  partes.push(...desplazar(contenedor("cont_gris"), -0.3, 0, -1.3, "cont_aluminio"));
  partes.push(...desplazar(contenedor("cont_azul"), 1.7, 0, -1.3, "cont_plastico"));
  partes.push(...desplazar(contenedor("cont_verde"), 3.5, 0, -1.3, "cont_vidrio"));
  const y = ALTURA_BANDA;
  partes.push(...desplazar(botellaPlastico(), -2.0, y, 0.1, "muestra_pet"));
  partes.push(...desplazar(lataAluminio(), -1.6, y, -0.1, "muestra_lata"));
  partes.push(...desplazar(botellaVidrio(), -1.2, y, 0.05, "muestra_vidrio"));
  return partes;
}

// ───────────────────────── Ejecución ─────────────────────────
const resultados = [
  escribirGLB("botella_plastico.glb", botellaPlastico(), { carpeta: "materiales" }),
  escribirGLB("lata_aluminio.glb", lataAluminio(), { carpeta: "materiales" }),
  escribirGLB("botella_vidrio.glb", botellaVidrio(), { carpeta: "materiales" }),
  escribirGLB("banda_transportadora.glb", bandaTransportadora(4.0), { carpeta: "maquinaria" }),
  escribirGLB("tolva_alimentacion.glb", tolvaAlimentacion(), { carpeta: "maquinaria" }),
  escribirGLB("separador_aluminio.glb", separadorAluminio(), { carpeta: "maquinaria" }),
  escribirGLB("escaner_optico_plastico.glb", escanerOptico(), { carpeta: "maquinaria" }),
  escribirGLB("desviador_vidrio.glb", desviadorVidrio(), { carpeta: "maquinaria" }),
  escribirGLB("contenedor_plastico.glb", contenedor("cont_azul"), { carpeta: "maquinaria" }),
  escribirGLB("contenedor_aluminio.glb", contenedor("cont_gris"), { carpeta: "maquinaria" }),
  escribirGLB("contenedor_vidrio.glb", contenedor("cont_verde"), { carpeta: "maquinaria" }),
  escribirGLB("planta_vista_previa.glb", plantaVistaPrevia(), { carpeta: "preview" }),
];
for (const r of resultados) console.log(`${r.archivo.padEnd(46)} ${String(r.partes).padStart(3)} partes  ${(r.bytes / 1024).toFixed(1)} KB`);
console.log(`\nListo → ${SALIDA}`);
