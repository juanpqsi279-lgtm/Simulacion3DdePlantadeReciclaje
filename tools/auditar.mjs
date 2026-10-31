// tools/auditar.mjs
// Auditoría estricta de arquitectura y restricciones del Gemelo Digital (QA - Keith):
// - Cero TypeScript (.ts, .tsx, tsconfig.json)
// - Cero frameworks frontend (React, Vue, Angular, Svelte)
// - Cero modelos .obj/.mtl y cero Canvas 2D nativo
// - Desacoplamiento total Pub/Sub: src/engine3d/* no puede manipular el DOM directamente
// - Verificación de módulos requeridos, HDRI, manifest.json dinámico y documentación técnica

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, extname, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const IGNORAR = new Set(["node_modules", ".git", "dist"]);
const errores = [];
const avisos = [];
const archivos = [];

(function recorrer(dir) {
  for (const nombre of readdirSync(dir)) {
    if (IGNORAR.has(nombre)) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) recorrer(ruta);
    else archivos.push(ruta);
  }
})(RAIZ);

const rel = (r) => relative(RAIZ, r).replaceAll("\\", "/");

// 1. Extensiones estrictamente prohibidas
const EXT_PROHIBIDAS = [".ts", ".tsx", ".jsx", ".vue", ".svelte", ".obj", ".mtl"];
for (const f of archivos) {
  if (EXT_PROHIBIDAS.includes(extname(f).toLowerCase())) {
    errores.push(`Archivo con formato prohibido: ${rel(f)}`);
  }
}
if (existsSync(join(RAIZ, "tsconfig.json"))) {
  errores.push("Existe tsconfig.json (TypeScript está estrictamente prohibido)");
}

// 2. Dependencias del empaquetador Node.js
const pkg = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8"));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
const LIBS_PROHIBIDAS = [
  /^react/, /^angular/, /^@angular/, /^vue/, /^svelte/,
  /^typescript$/, /^three$/, /^d3/, /^recharts/, /^preact/, /^solid-js/,
  /^@vitejs\/plugin-(react|vue|svelte)/,
];
for (const d of Object.keys(deps)) {
  if (LIBS_PROHIBIDAS.some((re) => re.test(d))) {
    errores.push(`Dependencia prohibida detectada en package.json: ${d}`);
  }
}

const verBabylon = deps["@babylonjs/core"];
if (!verBabylon) errores.push("Falta @babylonjs/core");
else if (parseInt(verBabylon.replace(/[^\d.]/g, "").split(".")[0], 10) < 9) {
  errores.push(`Babylon.js debe ser v9.0 o superior (actual: ${verBabylon})`);
}
if (!deps["chart.js"]) errores.push("Falta chart.js");
if (!deps["vite"] && !deps["webpack"] && !deps["rollup"]) {
  errores.push("Falta empaquetador básico (Vite/Webpack/Rollup)");
}
if (pkg.type !== "module") avisos.push('package.json debería declarar "type": "module"');

// 3. Escaneo estático de código fuente (cero imports prohibidos, cero Canvas 2D y desacoplamiento DOM en engine3d)
const fuentes = archivos.filter((f) => /\.(js|mjs|html)$/.test(f) && (rel(f).startsWith("src/") || rel(f) === "index.html"));
for (const f of fuentes) {
  const rutaRel = rel(f);
  const texto = readFileSync(f, "utf8");
  if (/from\s+["'](three|react|react-dom|vue|svelte|d3|recharts|@angular\/[^"']+)["']/.test(texto)) {
    errores.push(`Importación de librería prohibida en ${rutaRel}`);
  }
  if (/getContext\(\s*["']2d["']\s*\)/.test(texto)) {
    errores.push(`Uso directo de Canvas 2D nativo detectado en ${rutaRel}`);
  }
  if (/\.obj["'`]/.test(texto)) {
    errores.push(`Referencia a modelo .obj detectada en ${rutaRel}`);
  }
  if (rutaRel.startsWith("src/engine3d/") && /\bdocument\.(getElementById|querySelector|createElement)\b/.test(texto)) {
    errores.push(`Acoplamiento DOM prohibido dentro del motor 3D (${rutaRel}): usar EventBus`);
  }
}

// 4. Verificación de arquitectura modular y activos requeridos
const MODULOS_REQUERIDOS = [
  "src/core/bus/eventBus.js",
  "src/core/state/plantStateMachine.js",
  "src/core/spawner/itemSpawner.js",
  "src/core/physics/conveyorPhysics.js",
  "src/engine3d/renderingPipeline.js",
  "src/engine3d/pbrEnhancer.js",
  "src/engine3d/particleEffects.js",
  "src/engine3d/babylonPhysics.js",
  "src/engine3d/sceneController.js",
  "src/workers/telemetryProcessor.js",
  "src/workers/telemetryWorker.js",
  "src/analytics/chartsController.js",
  "src/ui/domController.js",
  "src/config/configLoader.js",
  "public/assets/environment/planta_industrial.hdr",
  "docs/objetivos-y-rubricas.md",
  "docs/arquitectura-gemelo-digital.md",
];
for (const m of MODULOS_REQUERIDOS) {
  if (!existsSync(join(RAIZ, m))) errores.push(`Falta módulo o recurso arquitectónico requerido: ${m}`);
}

// 5. Validación de manifest.json e integración dinámica
try {
  const m = JSON.parse(readFileSync(join(RAIZ, "public", "manifest.json"), "utf8"));
  for (const k of ["name", "version", "modelos", "tecnologias", "simulacionInicial"]) {
    if (!(k in m)) errores.push(`manifest.json carece de la clave "${k}"`);
  }
  const rutaBase = join(RAIZ, "public", m.modelos?.ruta ?? "");
  for (const [sub, lista] of [
    ["materiales", m.modelos?.materiales ?? []],
    ["maquinaria", m.modelos?.maquinaria ?? []],
  ]) {
    for (const arch of lista) {
      if (!existsSync(join(rutaBase, sub, arch))) {
        errores.push(`manifest.json referencia un modelo inexistente: ${sub}/${arch}`);
      }
      if (!/\.(glb|gltf)$/i.test(arch)) {
        errores.push(`Formato 3D inválido en manifest.json: ${arch}`);
      }
    }
  }
} catch (err) {
  errores.push(`manifest.json inválido: ${err.message}`);
}

console.log(`Archivos auditados: ${archivos.length}`);
for (const a of avisos) console.log(`  AVISO  ${a}`);
for (const e of errores) console.log(`  ERROR  ${e}`);
console.log(
  errores.length
    ? `\nAuditoría fallida: ${errores.length} incumplimiento(s).`
    : "\nAuditoría superada: 0 archivos prohibidos, arquitectura modular y desacoplada verificada.",
);
process.exit(errores.length ? 1 : 0);
