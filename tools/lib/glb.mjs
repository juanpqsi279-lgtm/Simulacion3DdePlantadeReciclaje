// tools/lib/glb.mjs
// Tabla de materiales PBR y escritor de archivos .glb (glTF 2.0 binario). JavaScript puro, sin dependencias.
//
// IMPORTANTE: src/engine3d/pbrEnhancer.js calibra las propiedades físicas según el NOMBRE del material
// (contiene "vidrio", "aluminio", "pet", "acero", "pintura", "banda_goma", "lente", "etiqueta", "chapa",
// "lata_banda", "tapa_azul"; los que empiezan con "contenedor" tienen prioridad). No renombrar sin revisar ese archivo.

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { finalizar, copiar } from "./geometria.mjs";
import { textura } from "./texturas.mjs";

const hex = (h, a = 1) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255, a];
const BLANCO = [1, 1, 1, 1];

export const MAT = {
  // Maquinaria: paleta del equipo (aluminio cepillado, grafito, blanco cerámico + acentos). El prefijo "maq_" hace que
  // pbrEnhancer.js los reconozca (cepillado procedural, barniz/clear coat en acentos y blanco).
  acero: { name: "maq_aluminio_cepillado", color: hex("#d6dade"), metal: 1.0, rough: 0.34 },
  acero_oscuro: { name: "maq_grafito", color: hex("#3a3e44"), metal: 0.85, rough: 0.4 },
  blanco: { name: "maq_blanco_ceramico", color: hex("#dde1e6"), metal: 0.06, rough: 0.36 },
  blanco_dc: { name: "maq_blanco_ceramico_dc", color: hex("#dde1e6"), metal: 0.06, rough: 0.36, doble: true },
  acento_azul: { name: "maq_acento_azul", color: hex("#0a84ff"), metal: 0.2, rough: 0.32 },
  acento_ambar: { name: "maq_acento_ambar", color: hex("#ff9f0a"), metal: 0.2, rough: 0.32 },
  acento_coral: { name: "maq_acento_coral", color: hex("#ff453a"), metal: 0.2, rough: 0.32 },
  acento_verde: { name: "maq_acento_verde", color: hex("#30d158"), metal: 0.2, rough: 0.32 },
  banda_goma: { name: "maq_goma_banda", color: BLANCO, metal: 0.02, rough: 0.86, tex: "banda" },
  goma: { name: "maq_goma_banda", color: hex("#16181b"), metal: 0.02, rough: 0.86 },
  pintura_peligro: { name: "maq_peligro", color: BLANCO, metal: 0.1, rough: 0.4, tex: "peligro" },
  luz_verde: { name: "luz_verde", color: hex("#2ecc71"), metal: 0.0, rough: 0.18, emissive: [0.15, 0.95, 0.4] },
  luz_ambar: { name: "luz_verde_ambar", color: hex("#ffb020"), metal: 0.0, rough: 0.2, emissive: [0.9, 0.55, 0.05] },
  lente: { name: "maq_lente", color: hex("#0b1117"), metal: 0.1, rough: 0.03 },
  // Materiales a separar (calibrados por nombre en pbrEnhancer.js)
  pet: { name: "pet_transparente", color: hex("#cbeaff", 0.58), metal: 0.0, rough: 0.06, blend: true, doble: true },
  pet_cola: { name: "pet_transparente_cola", color: hex("#7a4a22", 0.62), metal: 0.0, rough: 0.06, blend: true, doble: true },
  pet_azul: { name: "pet_transparente_azul", color: hex("#8fd0ff", 0.6), metal: 0.0, rough: 0.06, blend: true, doble: true },
  tapa_azul: { name: "tapa_azul", color: hex("#1d74c4"), metal: 0.05, rough: 0.38 },
  tapa_roja: { name: "tapa_azul_roja", color: hex("#d63a2c"), metal: 0.05, rough: 0.38 },
  tapa_negra: { name: "tapa_azul_negra", color: hex("#1c1f23"), metal: 0.05, rough: 0.38 },
  etiqueta_pet: { name: "etiqueta", color: BLANCO, metal: 0.0, rough: 0.62, tex: "etiquetaPET" },
  etiqueta_cola: { name: "etiqueta", color: BLANCO, metal: 0.0, rough: 0.6, tex: "etiquetaCola" },
  etiqueta_vidrio: { name: "etiqueta", color: BLANCO, metal: 0.0, rough: 0.66, tex: "etiquetaVidrio" },
  etiqueta_ambar: { name: "etiqueta", color: BLANCO, metal: 0.0, rough: 0.66, tex: "etiquetaAmbar" },
  aluminio: { name: "aluminio", color: hex("#e3e7eb"), metal: 0.98, rough: 0.18 },
  lata_roja: { name: "lata_banda_roja", color: BLANCO, metal: 0.78, rough: 0.24, tex: "lata" },
  lata_azul: { name: "lata_banda_roja_azul", color: BLANCO, metal: 0.78, rough: 0.24, tex: "lataAzul" },
  lata_dorada: { name: "lata_banda_roja_dorada", color: BLANCO, metal: 0.78, rough: 0.24, tex: "lataDorada" },
  vidrio_verde: { name: "vidrio_verde", color: hex("#289c52", 0.56), metal: 0.0, rough: 0.03, blend: true, doble: true },
  vidrio_ambar: { name: "vidrio_ambar", color: hex("#c26a10", 0.6), metal: 0.0, rough: 0.03, blend: true, doble: true },
  vidrio_claro: { name: "vidrio_claro", color: hex("#d8f0f0", 0.4), metal: 0.0, rough: 0.03, blend: true, doble: true },
  chapa: { name: "chapa_corona", color: hex("#dbb22c"), metal: 0.94, rough: 0.22 },
  tapa_metal: { name: "chapa_corona_tapa", color: hex("#c9ced3"), metal: 0.95, rough: 0.3 },
  // Contenedores y mobiliario de planta (el nombre contiene "cont_": pbrEnhancer los trata como esmalte industrial)
  cont_azul: { name: "maq_cont_plastico", color: hex("#3d86e6"), metal: 0.15, rough: 0.4 },
  cont_gris: { name: "maq_cont_aluminio", color: hex("#d0d7df"), metal: 0.78, rough: 0.32 },
  cont_verde: { name: "maq_cont_vidrio", color: hex("#3aa866"), metal: 0.15, rough: 0.4 },
  cont_negro: { name: "maq_cont_rechazo", color: hex("#2b2f35"), metal: 0.15, rough: 0.45 },
  cont_amarillo: { name: "maq_cont_amarillo", color: hex("#f2b705"), metal: 0.15, rough: 0.42 },
  cartel_plastico: { name: "maq_cont_cartel_a", color: BLANCO, metal: 0.05, rough: 0.5, tex: "cartelPlastico" },
  cartel_aluminio: { name: "maq_cont_cartel_b", color: BLANCO, metal: 0.05, rough: 0.5, tex: "cartelAluminio" },
  cartel_vidrio: { name: "maq_cont_cartel_c", color: BLANCO, metal: 0.05, rough: 0.5, tex: "cartelVidrio" },
  // Entorno de la nave (sin calibración especial: nombres sin palabras clave)
  hormigon: { name: "entorno_hormigon", color: hex("#8a8f94"), metal: 0.0, rough: 0.92 },
  hormigon_claro: { name: "entorno_hormigon_claro", color: hex("#b5b9bd"), metal: 0.0, rough: 0.9 },
  muro: { name: "entorno_muro", color: hex("#c7ccd1"), metal: 0.0, rough: 0.85 },
  muro_oscuro: { name: "entorno_muro_oscuro", color: hex("#5d646b"), metal: 0.0, rough: 0.85 },
  chapa_techo: { name: "entorno_techo", color: hex("#9aa4ad"), metal: 0.5, rough: 0.55 },
  estructura: { name: "entorno_estructura", color: hex("#2c5aa0"), metal: 0.3, rough: 0.5 },
  estructura_gris: { name: "entorno_estructura_gris", color: hex("#6b737b"), metal: 0.5, rough: 0.5 },
  amarillo_seg: { name: "entorno_amarillo", color: hex("#f2b705"), metal: 0.1, rough: 0.5 },
  rojo_seg: { name: "entorno_rojo", color: hex("#d63a2c"), metal: 0.1, rough: 0.5 },
  verde_seg: { name: "entorno_verde_seg", color: hex("#1f9d55"), metal: 0.1, rough: 0.5 },
  luz_panel: { name: "entorno_luz", color: hex("#fff4d6"), metal: 0.0, rough: 0.3, emissive: [1.0, 0.93, 0.78] },
  luz_salida: { name: "entorno_luz_salida", color: hex("#35e07a"), metal: 0.0, rough: 0.3, emissive: [0.2, 0.9, 0.4] },
  cristal_ventana: { name: "entorno_ventana", color: hex("#9fc4dc", 0.35), metal: 0.0, rough: 0.05, blend: true, doble: true },
  cristal_simple: { name: "entorno_ventana_frontal", color: hex("#9fc4dc", 0.3), metal: 0.0, rough: 0.05, blend: true },
  madera: { name: "entorno_madera", color: hex("#b88a55"), metal: 0.0, rough: 0.8 },
  carton: { name: "entorno_carton", color: hex("#b98f5e"), metal: 0.0, rough: 0.9 },
  llanta: { name: "entorno_goma", color: hex("#1d2024"), metal: 0.0, rough: 0.9 },
  bolsa_blanca: { name: "entorno_bolsa", color: hex("#e9e6dc"), metal: 0.0, rough: 0.8 },
  paca_pet: { name: "entorno_paca_plastico", color: hex("#8cc4ee"), metal: 0.0, rough: 0.8 },
  paca_alu: { name: "entorno_paca_alu", color: hex("#b8bfc6"), metal: 0.6, rough: 0.5 },
  paca_vid: { name: "entorno_paca_vid", color: hex("#4f9b6a"), metal: 0.0, rough: 0.6 },
  // Residuos de pilas decorativas (opacos y sin palabras clave del pbrEnhancer)
  res_base: { name: "entorno_residuo_base", color: hex("#2c3036"), metal: 0.0, rough: 0.9 },
  res_pet_azul: { name: "entorno_residuo_azul", color: hex("#6fb4e8"), metal: 0.0, rough: 0.35 },
  res_pet_claro: { name: "entorno_residuo_claro", color: hex("#cfe3ee"), metal: 0.0, rough: 0.3 },
  res_pet_cola: { name: "entorno_residuo_cafe", color: hex("#6b4423"), metal: 0.0, rough: 0.35 },
  res_lata_roja: { name: "entorno_residuo_roja", color: hex("#cc2f26"), metal: 0.6, rough: 0.3 },
  res_lata_azul: { name: "entorno_residuo_azulmet", color: hex("#1f5fb0"), metal: 0.6, rough: 0.3 },
  res_lata_plata: { name: "entorno_residuo_plata", color: hex("#c9ced3"), metal: 0.85, rough: 0.25 },
  res_vid_verde: { name: "entorno_residuo_verde", color: hex("#2f9a58"), metal: 0.0, rough: 0.2 },
  res_vid_ambar: { name: "entorno_residuo_ambar", color: hex("#b8661a"), metal: 0.0, rough: 0.2 },
  res_vid_claro: { name: "entorno_residuo_cristal", color: hex("#bcd9d6"), metal: 0.0, rough: 0.2 },
  senal_salida: { name: "entorno_senal_salida", color: BLANCO, metal: 0.0, rough: 0.4, emissive: [0.35, 0.35, 0.35], tex: "senalSalida" },
  senal_alerta: { name: "entorno_senal_alerta", color: BLANCO, metal: 0.0, rough: 0.4, tex: "senalAlerta" },
  paca_carton: { name: "entorno_paca_carton", color: hex("#a98255"), metal: 0.0, rough: 0.9 },
};

// parte = { nombre, geo, mat, trasl?:[x,y,z], rotY?:rad, pliegue?:grados, uvEsc?:número|[u,v] }
export function escribirGLB(raizSalida, carpeta, archivo, partes) {
  const usados = [...new Set(partes.map((p) => p.mat))];
  const bufs = []; let offset = 0;
  const bufferViews = [], accessors = [], meshes = [], nodes = [], images = [], textures = [];
  const idxTex = new Map();
  const empujar = (bytes, target) => {
    const pad = (4 - (bytes.length % 4)) % 4;
    bufs.push(bytes, Buffer.alloc(pad));
    const bv = { buffer: 0, byteOffset: offset, byteLength: bytes.length };
    if (target) bv.target = target;
    bufferViews.push(bv);
    offset += bytes.length + pad;
    return bufferViews.length - 1;
  };
  const texIndice = (nombre) => {
    if (!idxTex.has(nombre)) {
      const png = textura(nombre);
      images.push({ bufferView: empujar(png), mimeType: "image/png", name: nombre });
      textures.push({ sampler: 0, source: images.length - 1, name: nombre });
      idxTex.set(nombre, textures.length - 1);
    }
    return idxTex.get(nombre);
  };

  const materials = usados.map((k) => {
    const m = MAT[k];
    if (!m) throw new Error(`Material desconocido: ${k}`);
    const pbr = { baseColorFactor: m.color, metallicFactor: m.metal, roughnessFactor: m.rough };
    if (m.tex) pbr.baseColorTexture = { index: texIndice(m.tex) };
    if (m.mr) pbr.metallicRoughnessTexture = { index: texIndice(m.mr) };
    const o = { name: m.name, pbrMetallicRoughness: pbr };
    if (m.blend) o.alphaMode = "BLEND";
    if (m.doble) o.doubleSided = true;
    if (m.emissive) o.emissiveFactor = m.emissive;
    return o;
  });

  const nombresUsados = new Set();
  for (const p of partes) {
    if (nombresUsados.has(p.nombre)) throw new Error(`Nombre de nodo repetido en ${archivo}: ${p.nombre}`);
    nombresUsados.add(p.nombre);
    const g = finalizar(copiar(p.geo), p.pliegue ?? 50);
    if (p.uvEsc) { const [su, sv] = Array.isArray(p.uvEsc) ? p.uvEsc : [p.uvEsc, p.uvEsc]; for (let i = 0; i < g.uv.length; i += 2) { g.uv[i] *= su; g.uv[i + 1] *= sv; } }
    if (!g.idx.length) throw new Error(`Parte vacía: ${archivo} → ${p.nombre}`);
    const pos = new Float32Array(g.pos), nor = new Float32Array(g.nor), uv = new Float32Array(g.uv);
    const grande = pos.length / 3 > 65535;
    const idx = grande ? new Uint32Array(g.idx) : new Uint16Array(g.idx);
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], pos[i + k]); mx[k] = Math.max(mx[k], pos[i + k]); }
    const vp = empujar(Buffer.from(pos.buffer), 34962), vn = empujar(Buffer.from(nor.buffer), 34962), vt = empujar(Buffer.from(uv.buffer), 34962);
    const vi = empujar(Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength), 34963);
    accessors.push({ bufferView: vp, componentType: 5126, count: pos.length / 3, type: "VEC3", min: mn, max: mx });
    const aP = accessors.length - 1;
    accessors.push({ bufferView: vn, componentType: 5126, count: nor.length / 3, type: "VEC3" });
    const aN = accessors.length - 1;
    accessors.push({ bufferView: vt, componentType: 5126, count: uv.length / 2, type: "VEC2" });
    const aT = accessors.length - 1;
    accessors.push({ bufferView: vi, componentType: grande ? 5125 : 5123, count: idx.length, type: "SCALAR" });
    const aI = accessors.length - 1;
    meshes.push({ name: p.nombre, primitives: [{ attributes: { POSITION: aP, NORMAL: aN, TEXCOORD_0: aT }, indices: aI, material: usados.indexOf(p.mat), mode: 4 }] });
    const nodo = { name: p.nombre, mesh: meshes.length - 1 };
    if (p.trasl) nodo.translation = p.trasl;
    if (p.rotY) nodo.rotation = [0, Math.sin(p.rotY / 2), 0, Math.cos(p.rotY / 2)];
    nodes.push(nodo);
  }

  const gltf = {
    asset: { version: "2.0", generator: "tools/generar-modelos.mjs (Simulación 3D Planta de Reciclaje)" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: archivo.replace(/\.glb$/, ""), children: nodes.map((_, i) => i + 1) }, ...nodes],
    meshes, materials, accessors, bufferViews,
    buffers: [{ byteLength: offset }],
  };
  if (images.length) {
    gltf.images = images; gltf.textures = textures;
    gltf.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
  }
  let json = Buffer.from(JSON.stringify(gltf), "utf8");
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const bin = Buffer.concat(bufs);
  const total = 12 + 8 + json.length + 8 + bin.length;
  const h = Buffer.alloc(12); h.write("glTF", 0, "ascii"); h.writeUInt32LE(2, 4); h.writeUInt32LE(total, 8);
  const cj = Buffer.alloc(8); cj.writeUInt32LE(json.length, 0); cj.write("JSON", 4, "ascii");
  const cb = Buffer.alloc(8); cb.writeUInt32LE(bin.length, 0); cb.write("BIN\0", 4, "latin1");
  const dir = join(raizSalida, carpeta);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, archivo), Buffer.concat([h, cj, json, cb, bin]));
  let tris = 0;
  for (const a of accessors) if (a.type === "SCALAR") tris += a.count / 3;
  return { archivo: `${carpeta}/${archivo}`, bytes: total, partes: partes.length, tris: Math.round(tris), texturas: textures.length };
}
