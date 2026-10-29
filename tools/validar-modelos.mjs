// tools/validar-modelos.mjs
// Valida que TODOS los modelos 3D del proyecto estén estrictamente en formato .gltf o .glb
// y que cada archivo esté bien formado. JavaScript puro (ES modules), sin dependencias.
//
// Uso:   node tools/validar-modelos.mjs [carpeta_raiz]      (por defecto: la raíz del repo)
// Salida: código 0 si todo está correcto, 1 si hay errores (útil para CI o un hook de git).

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, extname, relative, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(process.argv[2] ?? join(AQUI, ".."));

const PERMITIDOS = new Set([".gltf", ".glb"]);
// Formatos 3D que NO deben existir en el proyecto (.obj está explícitamente prohibido en la planeación).
const PROHIBIDOS = new Set([
  ".obj", ".mtl", ".fbx", ".stl", ".dae", ".3ds", ".blend", ".blend1", ".max", ".ma", ".mb",
  ".c4d", ".ply", ".x3d", ".wrl", ".usd", ".usdz", ".usda", ".usdc", ".abc", ".off", ".babylon",
]);
const IGNORAR = new Set(["node_modules", ".git", "dist", "build", ".vite", "coverage"]);

const errores = [];
const avisos = [];
const validos = [];

function recorrer(dir) {
  for (const nombre of readdirSync(dir)) {
    if (IGNORAR.has(nombre)) continue;
    const ruta = join(dir, nombre);
    const st = statSync(ruta);
    if (st.isDirectory()) { recorrer(ruta); continue; }
    const ext = extname(nombre).toLowerCase();
    const rel = relative(RAIZ, ruta);
    if (PROHIBIDOS.has(ext)) errores.push(`${rel}: formato PROHIBIDO (${ext}). Solo se permite .gltf o .glb`);
    else if (PERMITIDOS.has(ext)) validarArchivo(ruta, rel, ext);
  }
}

const TAM_COMPONENTE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const NUM_TIPO = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

function validarArchivo(ruta, rel, ext) {
  const fallos = [];
  let datos;
  try { datos = readFileSync(ruta); } catch (e) { errores.push(`${rel}: no se pudo leer (${e.message})`); return; }

  let gltf, bin = null;
  if (ext === ".glb") {
    if (datos.length < 20) { errores.push(`${rel}: archivo demasiado pequeño para ser un GLB`); return; }
    if (datos.toString("ascii", 0, 4) !== "glTF") fallos.push("cabecera inválida (no empieza con 'glTF'): no es un GLB real aunque tenga la extensión");
    else {
      if (datos.readUInt32LE(4) !== 2) fallos.push(`versión de contenedor ${datos.readUInt32LE(4)} (se esperaba 2)`);
      if (datos.readUInt32LE(8) !== datos.length) fallos.push(`longitud declarada (${datos.readUInt32LE(8)}) distinta del tamaño real (${datos.length})`);
      let off = 12;
      while (off + 8 <= datos.length) {
        const len = datos.readUInt32LE(off), tipo = datos.toString("latin1", off + 4, off + 8);
        const cuerpo = datos.subarray(off + 8, off + 8 + len);
        if (cuerpo.length !== len) { fallos.push("chunk truncado"); break; }
        if (tipo === "JSON") { try { gltf = JSON.parse(cuerpo.toString("utf8")); } catch { fallos.push("el chunk JSON no es JSON válido"); } }
        else if (tipo === "BIN\0") bin = cuerpo;
        off += 8 + len + ((4 - (len % 4)) % 4 === 0 ? 0 : 0); // los chunks ya vienen alineados a 4 bytes
      }
      if (!gltf && fallos.length === 0) fallos.push("no contiene chunk JSON");
    }
  } else {
    try { gltf = JSON.parse(datos.toString("utf8")); } catch { fallos.push("no es JSON válido (un .gltf debe ser JSON)"); }
  }

  if (gltf) {
    if (!gltf.asset || !String(gltf.asset.version).startsWith("2")) fallos.push("asset.version debe ser 2.x");
    const buffers = gltf.buffers ?? [];
    const dirArchivo = dirname(ruta);
    buffers.forEach((b, i) => {
      if (b.uri === undefined) { if (ext === ".gltf") fallos.push(`buffer ${i} sin uri en un .gltf`); else if (!bin) fallos.push("falta chunk BIN"); else if (b.byteLength > bin.length) fallos.push(`buffer ${i} declara más bytes (${b.byteLength}) que el chunk BIN (${bin.length})`); }
      else if (!b.uri.startsWith("data:") && !existsSync(join(dirArchivo, decodeURIComponent(b.uri)))) fallos.push(`buffer externo no encontrado: ${b.uri}`);
    });
    for (const [i, img] of (gltf.images ?? []).entries()) {
      if (img.uri && !img.uri.startsWith("data:") && !existsSync(join(dirArchivo, decodeURIComponent(img.uri)))) fallos.push(`textura externa no encontrada: ${img.uri}`);
      if (img.uri && /\.(obj|mtl)$/i.test(img.uri)) fallos.push(`imagen ${i} apunta a un formato prohibido`);
    }
    const bvs = gltf.bufferViews ?? [];
    bvs.forEach((v, i) => {
      const b = buffers[v.buffer];
      if (!b) fallos.push(`bufferView ${i} usa un buffer inexistente`);
      else if ((v.byteOffset ?? 0) + v.byteLength > b.byteLength) fallos.push(`bufferView ${i} se sale del buffer`);
    });
    const accs = gltf.accessors ?? [];
    accs.forEach((a, i) => {
      if (a.bufferView === undefined) return;
      const v = bvs[a.bufferView];
      if (!v) { fallos.push(`accessor ${i} usa un bufferView inexistente`); return; }
      const bytes = (v.byteStride ?? TAM_COMPONENTE[a.componentType] * NUM_TIPO[a.type]) * (a.count - 1) + TAM_COMPONENTE[a.componentType] * NUM_TIPO[a.type];
      if ((a.byteOffset ?? 0) + bytes > v.byteLength) fallos.push(`accessor ${i} se sale de su bufferView`);
    });
    const meshes = gltf.meshes ?? [];
    let triangulos = 0;
    meshes.forEach((m, mi) => (m.primitives ?? []).forEach((p) => {
      if (p.attributes?.POSITION === undefined) fallos.push(`malla ${mi}: primitiva sin POSITION`);
      if (p.material !== undefined && !(gltf.materials ?? [])[p.material]) fallos.push(`malla ${mi}: material inexistente`);
      if (p.indices !== undefined && accs[p.indices]) triangulos += accs[p.indices].count / 3;
      else if (p.attributes?.POSITION !== undefined && accs[p.attributes.POSITION]) triangulos += accs[p.attributes.POSITION].count / 3;
    }));
    (gltf.nodes ?? []).forEach((n, i) => {
      if (n.mesh !== undefined && !meshes[n.mesh]) fallos.push(`nodo ${i} usa una malla inexistente`);
      for (const c of n.children ?? []) if (!(gltf.nodes ?? [])[c]) fallos.push(`nodo ${i} tiene un hijo inexistente`);
    });
    if (!meshes.length) fallos.push("no contiene mallas (el modelo estaría vacío)");
    if (gltf.extensionsRequired?.length) avisos.push(`${rel}: requiere extensiones [${gltf.extensionsRequired.join(", ")}]; confirmar que Babylon.js las soporte`);

    if (fallos.length === 0) {
      validos.push({ rel, ext, kb: (datos.length / 1024).toFixed(1), mallas: meshes.length, tris: Math.round(triangulos), nodos: (gltf.nodes ?? []).length });
      return;
    }
  }
  for (const f of fallos) errores.push(`${rel}: ${f}`);
}

if (!existsSync(RAIZ)) { console.error(`No existe la carpeta: ${RAIZ}`); process.exit(2); }
recorrer(RAIZ);

console.log(`Validación de modelos 3D en: ${RAIZ}\n`);
if (validos.length) {
  console.log("Archivos válidos:");
  for (const v of validos) console.log(`  ✔ ${v.rel.padEnd(52)} ${v.ext}  ${v.kb.padStart(7)} KB  ${String(v.mallas).padStart(3)} mallas  ${String(v.tris).padStart(5)} tris`);
}
if (avisos.length) { console.log("\nAvisos:"); for (const a of avisos) console.log(`  ⚠ ${a}`); }
if (errores.length) { console.log("\nERRORES:"); for (const e of errores) console.log(`  ✘ ${e}`); }
console.log(`\nResumen: ${validos.length} válidos, ${errores.length} errores, ${avisos.length} avisos.`);
console.log(errores.length ? "RESULTADO: NO CUMPLE (corregir los errores de arriba)" : "RESULTADO: CUMPLE — todos los modelos están en .gltf/.glb y bien formados");
process.exit(errores.length ? 1 : 0);
