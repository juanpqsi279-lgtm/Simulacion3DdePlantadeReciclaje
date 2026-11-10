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
  // Maquinaria: paleta limpia estilo Apple (aluminio cepillado, grafito, blanco cerámico + acentos). Prefijo "maq_"
  // para que pbrEnhancer.js los reconozca; "aluminio_cepillado" recibe la textura de cepillado procedural.
  aluminio_cepillado: { name: "maq_aluminio_cepillado", color: hex("#d6dade"), metal: 1.0, rough: 0.34 },
  grafito: { name: "maq_grafito", color: hex("#3a3e44"), metal: 0.85, rough: 0.4 },
  blanco: { name: "maq_blanco_ceramico", color: hex("#dde1e6"), metal: 0.06, rough: 0.36 },
  blanco_dc: { name: "maq_blanco_ceramico_dc", color: hex("#dde1e6"), metal: 0.06, rough: 0.36, doble: true },
  goma: { name: "maq_goma_banda", color: hex("#16181b"), metal: 0.02, rough: 0.86 },
  acento_azul: { name: "maq_acento_azul", color: hex("#0a84ff"), metal: 0.2, rough: 0.32 },
  acento_ambar: { name: "maq_acento_ambar", color: hex("#ff9f0a"), metal: 0.2, rough: 0.32 },
  acento_coral: { name: "maq_acento_coral", color: hex("#ff453a"), metal: 0.2, rough: 0.32 },
  luz_verde: { name: "luz_verde", color: hex("#2ecc71"), metal: 0.0, rough: 0.18, emissive: [0.15, 0.95, 0.4] },
  lente: { name: "maq_lente", color: hex("#0b1117"), metal: 0.1, rough: 0.03 },  // Materiales a separar con propiedades PBR físicamente calibradas
  pet: { name: "pet_transparente", color: hex("#cbeaff", 0.58), metal: 0.0, rough: 0.06, blend: true, doble: true },
  tapa_azul: { name: "tapa_azul", color: hex("#1d74c4"), metal: 0.05, rough: 0.38 },
  etiqueta: { name: "etiqueta", color: hex("#f6f7f2"), metal: 0.0, rough: 0.62 },
  aluminio: { name: "aluminio", color: hex("#e3e7eb"), metal: 0.98, rough: 0.18 },
  lata_roja: { name: "lata_banda_roja", color: hex("#cc2f26"), metal: 0.78, rough: 0.24 },
  vidrio_verde: { name: "vidrio_verde", color: hex("#289c52", 0.56), metal: 0.0, rough: 0.03, blend: true, doble: true },
  chapa: { name: "chapa_corona", color: hex("#dbb22c"), metal: 0.94, rough: 0.22 },
  cont_azul: { name: "maq_cont_plastico", color: hex("#3d86e6"), metal: 0.15, rough: 0.4 },
  cont_gris: { name: "maq_cont_aluminio", color: hex("#a3adb8"), metal: 0.8, rough: 0.36 },
  cont_verde: { name: "maq_cont_vidrio", color: hex("#3aa866"), metal: 0.15, rough: 0.4 },
};

// ───────────────────────── Geometría ─────────────────────────
// Una "geo" es { pos:[x,y,z...], nor:[...], idx:[...] }. Siempre se corrige el sentido de las caras
// para que apunten hacia afuera (según la normal del vértice).

function nuevaGeo() { return { pos: [], nor: [], uv: [], idx: [] }; }

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
    const uvs = p.geo.uv && p.geo.uv.length === (p.geo.pos.length / 3) * 2 ? new Float32Array(p.geo.uv) : null;
    const vp = empujar(pos, 34962), vn = empujar(nor, 34962), vi = empujar(idx, 34963);
    const vt = uvs ? empujar(uvs, 34962) : null;
    accessors.push({ bufferView: vp, componentType: 5126, count: pos.length / 3, type: "VEC3", min: mn, max: mx });
    const aP = accessors.length - 1;
    accessors.push({ bufferView: vn, componentType: 5126, count: nor.length / 3, type: "VEC3" });
    const aN = accessors.length - 1;
    accessors.push({ bufferView: vi, componentType: grande ? 5125 : 5123, count: idx.length, type: "SCALAR" });
    const aI = accessors.length - 1;
    const atributos = { POSITION: aP, NORMAL: aN };
    if (vt !== null) {
      accessors.push({ bufferView: vt, componentType: 5126, count: uvs.length / 2, type: "VEC2" });
      atributos.TEXCOORD_0 = accessors.length - 1;
    }
    meshes.push({
      name: p.nombre,
      primitives: [{ attributes: atributos, indices: aI, material: usados.indexOf(p.mat), mode: 4 }],
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

// ───────────────────────── Geometría redondeada (estilo Apple) ─────────────────────────
// Todas las piezas de maquinaria usan: cajas con esquinas generosamente redondeadas, cilindros biselados,
// lofts suaves (tolva, contenedores) y normales suavizadas. Cada vértice lleva UV en metros para que el
// acabado de aluminio cepillado se aplique en Babylon.js (ver src/engine3d/pbrEnhancer.js).

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Caja redondeada: malla cúbica subdividida cuyos vértices se proyectan sobre una "caja interior" + radio r.
function cajaRedondeada(cx, cy, cz, sx, sy, sz, r = 0.03, seg = 4) {
  const h = [sx / 2, sy / 2, sz / 2];
  r = Math.min(r, h[0], h[1], h[2]);
  const g = nuevaGeo();
  const cuadricula = (hh) => {
    const v = [];
    for (let i = 0; i <= seg; i++) v.push(-hh + (r * i) / seg);
    for (let i = 0; i <= seg; i++) v.push(hh - r + (r * i) / seg);
    return v;
  };
  const grids = h.map(cuadricula);
  for (let k = 0; k < 3; k++) {
    const u = (k + 1) % 3, v = (k + 2) % 3;
    for (const s of [-1, 1]) {
      const base = g.pos.length / 3;
      for (let j = 0; j < grids[v].length; j++) {
        for (let i = 0; i < grids[u].length; i++) {
          const p = [0, 0, 0];
          p[k] = s * h[k]; p[u] = grids[u][i]; p[v] = grids[v][j];
          const inner = p.map((c, a) => clamp(c, -(h[a] - r), h[a] - r));
          let d = p.map((c, a) => c - inner[a]);
          const len = Math.hypot(...d) || 1;
          d = d.map((c) => c / len);
          g.pos.push(inner[0] + d[0] * r + cx, inner[1] + d[1] * r + cy, inner[2] + d[2] * r + cz);
          g.nor.push(...d);
          g.uv.push((p[u] + h[u]) * 2, (p[v] + h[v]) * 2);
        }
      }
      const w = grids[u].length;
      for (let j = 0; j < grids[v].length - 1; j++) {
        for (let i = 0; i < w - 1; i++) {
          const a = base + j * w + i;
          g.idx.push(a, a + 1, a + w + 1, a, a + w + 1, a + w);
        }
      }
    }
  }
  return arreglarSentido(g);
}

// Sólido de revolución (eje Y) con normales analíticas suaves. perfil = [[radio, y], ...] de abajo hacia arriba.
function tornoSuave(perfil, seg = 32) {
  const g = nuevaGeo();
  const n = perfil.length;
  const acum = [0];
  for (let i = 1; i < n; i++) acum.push(acum[i - 1] + Math.hypot(perfil[i][0] - perfil[i - 1][0], perfil[i][1] - perfil[i - 1][1]));
  const nrm = perfil.map((_, i) => {
    const a = perfil[Math.max(0, i - 1)], b = perfil[Math.min(n - 1, i + 1)];
    const t = normalizar([b[0] - a[0], b[1] - a[1], 0]);
    return [t[1], -t[0]]; // (componente radial, componente y)
  });
  const rMax = Math.max(...perfil.map((p) => p[0]));
  for (let i = 0; i < n; i++) {
    for (let s = 0; s <= seg; s++) {
      const t = (s / seg) * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t);
      g.pos.push(perfil[i][0] * c, perfil[i][1], perfil[i][0] * sn);
      g.nor.push(nrm[i][0] * c, nrm[i][1], nrm[i][0] * sn);
      g.uv.push((s / seg) * Math.PI * 2 * rMax * 2, acum[i] * 2);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let s = 0; s < seg; s++) {
      const a = i * (seg + 1) + s, b = a + seg + 1;
      g.idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return arreglarSentido(g);
}

// Cilindro con bordes biselados en forma de arco. eje: "x" | "y" | "z"
function cilindroRedondeado(cx, cy, cz, radio, largo, eje = "y", seg = 32, bisel = 0.012) {
  const b = Math.min(bisel, radio * 0.9, largo * 0.45);
  const perfil = [[0, -largo / 2]];
  const arco = (centroR, centroY, a0, a1) => {
    for (let k = 0; k <= 4; k++) {
      const a = a0 + ((a1 - a0) * k) / 4;
      perfil.push([centroR + b * Math.cos(a), centroY + b * Math.sin(a)]);
    }
  };
  arco(radio - b, -largo / 2 + b, -Math.PI / 2, 0);
  arco(radio - b, largo / 2 - b, 0, Math.PI / 2);
  perfil.push([0, largo / 2]);
  const g = tornoSuave(perfil, seg);
  rotarEje(g, eje);
  mover(g, cx, cy, cz);
  return g;
}

// Contorno de rectángulo con esquinas redondeadas (sentido antihorario). Devuelve puntos [x, z].
function contornoRedondeado(w, d, r, segEsq = 6) {
  r = Math.max(0.001, Math.min(r, w / 2, d / 2));
  const pts = [];
  const esquinas = [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, (3 * Math.PI) / 2]];
  for (const [sx, sz, a0] of esquinas) {
    const cx = sx * (w / 2 - r), cz = sz * (d / 2 - r);
    for (let k = 0; k <= segEsq; k++) {
      const a = a0 + ((Math.PI / 2) * k) / segEsq;
      pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
  }
  return pts;
}

// Fila (sección) de un loft: contorno redondeado a la altura y, centrado en (cx, cz).
function seccion(y, w, d, r, cx = 0, cz = 0, segEsq = 6) {
  return contornoRedondeado(w, d, r, segEsq).map(([x, z]) => [x + cx, y, z + cz]);
}

// Malla a partir de una rejilla de filas (cada fila = lazo cerrado con el mismo nº de puntos).
// Normales suaves por diferencias finitas: normal = tv × tu. Con filas ordenadas de abajo hacia arriba y
// lazos antihorarios, el lado exterior apunta hacia afuera; una tira continua que sube por fuera, cruza el
// labio y baja por dentro queda orientada de forma coherente en ambas caras.
function mallaDeFilas(filas) {
  const g = nuevaGeo();
  const nF = filas.length, n = filas[0].length;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const acumV = [0];
  for (let j = 1; j < nF; j++) acumV.push(acumV[j - 1] + Math.hypot(...sub(filas[j][0], filas[j - 1][0])));
  for (let j = 0; j < nF; j++) {
    let acumU = 0;
    for (let i = 0; i <= n; i++) {
      const ii = i % n;
      const tu = sub(filas[j][(ii + 1) % n], filas[j][(ii - 1 + n) % n]);
      const tv = sub(filas[Math.min(nF - 1, j + 1)][ii], filas[Math.max(0, j - 1)][ii]);
      const nm = normalizar(cruz(tv, tu));
      g.pos.push(...filas[j][ii]);
      g.nor.push(...nm);
      if (i > 0) acumU += Math.hypot(...sub(filas[j][ii], filas[j][(ii - 1 + n) % n]));
      g.uv.push(acumU * 2, acumV[j] * 2);
    }
  }
  for (let j = 0; j < nF - 1; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + n + 1;
      g.idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return g;
}

// Tapa plana (abanico) a partir de una fila; normal fija hacia arriba (+1) o abajo (-1).
function tapa(fila, sentidoY) {
  const g = nuevaGeo();
  const c = fila.reduce((acc, p) => [acc[0] + p[0] / fila.length, p[1], acc[2] + p[2] / fila.length], [0, 0, 0]);
  g.pos.push(...c); g.nor.push(0, sentidoY, 0); g.uv.push(c[0] * 2, c[2] * 2);
  fila.forEach((p) => { g.pos.push(...p); g.nor.push(0, sentidoY, 0); g.uv.push(p[0] * 2, p[2] * 2); });
  for (let i = 0; i < fila.length; i++) g.idx.push(0, 1 + i, 1 + ((i + 1) % fila.length));
  return arreglarSentido(g);
}

function unir(geos) {
  const g = nuevaGeo();
  for (const o of geos) {
    const base = g.pos.length / 3;
    g.pos.push(...o.pos); g.nor.push(...o.nor); g.uv.push(...o.uv);
    g.idx.push(...o.idx.map((i) => i + base));
  }
  return g;
}

function rotarZ(g, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  for (const arr of [g.pos, g.nor]) {
    for (let i = 0; i < arr.length; i += 3) {
      const [x, y] = [arr[i], arr[i + 1]];
      arr[i] = x * c - y * s; arr[i + 1] = x * s + y * c;
    }
  }
  return g;
}

// ───────────────────────── Maquinaria ─────────────────────────
// Convención: la línea corre a lo largo del eje X (+X = dirección del flujo).
// La superficie superior de la banda queda en y = 0.815 m. El ancho útil de la banda es 0.56 m (eje Z).
// Los nombres de nodos (motor, rodillo_*, tambor_magnetico, aspas_tambor, luz_estado, boquilla_*, compuerta_pivote…)
// se conservan: sceneController.js los anima por nombre.

const ALTURA_BANDA = 0.815;

function bandaTransportadora(largo = 4.0) {
  const p = [];
  for (const z of [-0.32, 0.32]) {
    p.push({ nombre: `riel_${z < 0 ? "izq" : "der"}`, geo: cajaRedondeada(0, 0.74, z, largo, 0.12, 0.05, 0.024, 3), mat: "aluminio_cepillado" });
  }
  p.push({ nombre: "banda", geo: cajaRedondeada(0, 0.80, 0, largo - 0.1, 0.03, 0.56, 0.014, 3), mat: "goma" });
  p.push({ nombre: "rodillo_inicio", geo: cilindroRedondeado(-largo / 2 + 0.06, 0.74, 0, 0.075, 0.58, "z", 36, 0.016), mat: "aluminio_cepillado" });
  p.push({ nombre: "rodillo_fin", geo: cilindroRedondeado(largo / 2 - 0.06, 0.74, 0, 0.075, 0.58, "z", 36, 0.016), mat: "aluminio_cepillado" });
  const nIdler = 6;
  for (let i = 0; i < nIdler; i++) {
    const x = -largo / 2 + 0.4 + (i * (largo - 0.8)) / (nIdler - 1);
    p.push({ nombre: `rodillo_soporte_${i + 1}`, geo: cilindroRedondeado(x, 0.72, 0, 0.025, 0.56, "z", 20, 0.008), mat: "grafito" });
  }
  let n = 1;
  for (const x of [-largo / 2 + 0.25, largo / 2 - 0.25]) {
    for (const z of [-0.32, 0.32]) {
      p.push({ nombre: `pata_${n++}`, geo: cajaRedondeada(x, 0.34, z, 0.06, 0.68, 0.06, 0.03, 3), mat: "grafito" });
    }
  }
  p.push({ nombre: "motor", geo: cilindroRedondeado(largo / 2 + 0.05, 0.74, 0.0, 0.09, 0.2, "z", 28, 0.03), mat: "grafito" });
  return p;
}

function tolvaAlimentacion() {
  const p = [];
  // Embudo suave: sección rectangular de esquinas muy redondeadas que se abre con una curva ligera, con labio superior
  const filas = [];
  const yBase = 1.1, alto = 0.9, pasos = 9;
  for (let k = 0; k <= pasos; k++) {
    const t = k / pasos, e = Math.pow(t, 1.15);
    filas.push(seccion(yBase + t * alto, 0.4 + 1.0 * e, 0.4 + 1.0 * e, 0.07 + 0.2 * e, 0, 0, 6));
  }
  const yTop = yBase + alto;
  filas.push(seccion(yTop + 0.012, 1.425, 1.425, 0.285, 0, 0, 6));
  filas.push(seccion(yTop + 0.028, 1.41, 1.41, 0.28, 0, 0, 6));
  filas.push(seccion(yTop + 0.032, 1.37, 1.37, 0.27, 0, 0, 6));
  p.push({ nombre: "tolva_cuerpo", geo: arreglarSentido(mallaDeFilas(filas)), mat: "blanco_dc" });
  p.push({ nombre: "tolva_boca", geo: cajaRedondeada(0, 0.97, 0, 0.4, 0.26, 0.4, 0.09, 4), mat: "aluminio_cepillado" });
  let n = 1;
  for (const x of [-0.45, 0.45]) for (const z of [-0.45, 0.45]) {
    p.push({ nombre: `pata_${n++}`, geo: cajaRedondeada(x, 0.78, z, 0.07, 1.56, 0.07, 0.035, 3), mat: "grafito" });
  }
  p.push({ nombre: "compuerta_salida", geo: cajaRedondeada(0, 0.88, 0, 0.42, 0.02, 0.42, 0.01, 3), mat: "grafito" });
  return p;
}

function portico(ancho = 1.0, altoPortico = 1.6) {
  const p = [];
  for (const z of [-ancho / 2, ancho / 2]) {
    p.push({ nombre: `poste_${z < 0 ? "izq" : "der"}`, geo: cajaRedondeada(0, altoPortico / 2, z, 0.1, altoPortico, 0.1, 0.05, 4), mat: "aluminio_cepillado" });
  }
  return p;
}

function separadorAluminio() {
  // Separador por corrientes de Foucault (eddy current) para aluminio
  const p = portico(1.1, 1.7);
  p.push({ nombre: "carcasa", geo: cajaRedondeada(0, 1.55, 0, 0.9, 0.35, 1.1, 0.14, 5), mat: "blanco" });
  p.push({ nombre: "franja_acento", geo: cajaRedondeada(0, 1.55, 0, 0.915, 0.05, 1.115, 0.024, 3), mat: "acento_azul" });
  p.push({ nombre: "tambor_magnetico", geo: cilindroRedondeado(0, 1.2, 0, 0.22, 0.56, "z", 40, 0.025), mat: "grafito" });
  // Aspas: 10 aletas redondeadas para que la rotación del tambor sea visible
  const aletas = [];
  for (let k = 0; k < 10; k++) {
    aletas.push(rotarZ(cajaRedondeada(0.165, 0, 0, 0.11, 0.04, 0.30, 0.018, 3), (k * Math.PI * 2) / 10));
  }
  const aspas = unir(aletas);
  mover(aspas, 0, 1.2, 0);
  p.push({ nombre: "aspas_tambor", geo: aspas, mat: "acento_azul" });
  p.push({ nombre: "divisor", geo: cajaRedondeada(0.45, 0.92, 0, 0.5, 0.02, 0.56, 0.01, 3), mat: "aluminio_cepillado" });
  p.push({ nombre: "luz_estado", geo: cilindroRedondeado(0, 1.78, 0, 0.04, 0.1, "y", 24, 0.02), mat: "luz_verde" });
  return p;
}

function escanerOptico() {
  // Clasificador óptico (infrarrojo cercano) con barra de boquillas de aire para plástico
  const p = portico(1.1, 1.5);
  p.push({ nombre: "carcasa_sensores", geo: cajaRedondeada(0, 1.42, 0, 0.5, 0.3, 1.1, 0.13, 5), mat: "blanco" });
  p.push({ nombre: "franja_acento", geo: cajaRedondeada(0, 1.42, 0, 0.515, 0.045, 1.115, 0.022, 3), mat: "acento_ambar" });
  p.push({ nombre: "lente_1", geo: cilindroRedondeado(0, 1.24, -0.15, 0.05, 0.05, "y", 28, 0.015), mat: "lente" });
  p.push({ nombre: "lente_2", geo: cilindroRedondeado(0, 1.24, 0.15, 0.05, 0.05, "y", 28, 0.015), mat: "lente" });
  p.push({ nombre: "barra_boquillas", geo: cajaRedondeada(0.35, 0.95, 0, 0.06, 0.05, 0.56, 0.024, 3), mat: "aluminio_cepillado" });
  for (let i = 0; i < 7; i++) {
    p.push({ nombre: `boquilla_${i + 1}`, geo: cilindroRedondeado(0.35, 0.915, -0.24 + i * 0.08, 0.012, 0.03, "y", 14, 0.005), mat: "grafito" });
  }
  p.push({ nombre: "luz_estado", geo: cilindroRedondeado(0, 1.62, 0, 0.04, 0.1, "y", 24, 0.02), mat: "luz_verde" });
  return p;
}

function desviadorVidrio() {
  // Desviador de compuerta para vidrio (la compuerta pivota sobre su eje vertical → animable)
  const p = portico(1.1, 1.3);
  p.push({ nombre: "carcasa_actuador", geo: cajaRedondeada(0, 1.22, 0, 0.5, 0.25, 1.1, 0.12, 5), mat: "grafito" });
  p.push({ nombre: "franja_acento", geo: cajaRedondeada(0, 1.22, 0, 0.515, 0.04, 1.115, 0.02, 3), mat: "acento_coral" });
  p.push({ nombre: "actuador", geo: cilindroRedondeado(0, 1.0, -0.4, 0.04, 0.3, "y", 24, 0.012), mat: "aluminio_cepillado" });
  // Compuerta: el nodo está en la bisagra (0,0.9,-0.28); la geometría se extiende hacia +Z
  p.push({
    nombre: "compuerta_pivote",
    geo: cajaRedondeada(0, 0, 0.28, 0.02, 0.2, 0.56, 0.01, 3),
    mat: "aluminio_cepillado",
    trasl: [0, 0.9, -0.28],
    rotY: 0,
  });
  p.push({ nombre: "luz_estado", geo: cilindroRedondeado(0, 1.4, 0, 0.04, 0.1, "y", 24, 0.02), mat: "luz_verde" });
  return p;
}

function contenedor(matClave) {
  // Recipiente de paredes suaves: una sola tira que sube por fuera, cruza el labio y baja por dentro
  const e = 0.035; // espesor de pared
  const exterior = [
    [0.0, 0.72, 0.52, 0.10], [0.022, 0.80, 0.60, 0.12], [0.06, 0.855, 0.655, 0.135],
    [0.35, 0.885, 0.685, 0.14], [0.675, 0.895, 0.695, 0.14],
  ];
  const filas = exterior.map(([y, w, d, r]) => seccion(y, w, d, r));
  // Labio redondeado
  filas.push(seccion(0.700, 0.90, 0.70, 0.14));
  filas.push(seccion(0.708, 0.885 - e, 0.685 - e, 0.14 - e / 2));
  filas.push(seccion(0.690, 0.895 - 2 * e, 0.695 - 2 * e, 0.14 - e));
  // Pared interior hacia el fondo
  filas.push(seccion(0.40, 0.885 - 2 * e, 0.685 - 2 * e, 0.14 - e));
  filas.push(seccion(0.10, 0.855 - 2 * e, 0.655 - 2 * e, 0.135 - e));
  filas.push(seccion(0.05, 0.80 - 2 * e, 0.60 - 2 * e, 0.12 - e));
  const cuerpo = arreglarSentido(mallaDeFilas(filas));
  const fondoExt = tapa(filas[0], -1);
  const fondoInt = tapa(filas[filas.length - 1], 1);
  return [
    { nombre: "cuerpo", geo: unir([cuerpo, fondoExt, fondoInt]), mat: matClave },
    { nombre: "cinta_superior", geo: cajaRedondeada(0, 0.62, 0.352, 0.6, 0.035, 0.012, 0.006, 2), mat: "aluminio_cepillado" },
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
      geo: { pos: p.geo.pos.map((v, i) => (i % 3 === 0 ? v + dx : i % 3 === 1 ? v + dy : v + dz)), nor: p.geo.nor, uv: p.geo.uv, idx: p.geo.idx },
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
