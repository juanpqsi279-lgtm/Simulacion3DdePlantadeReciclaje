// tools/auditar.mjs
// Auditoría de restricciones del proyecto (QA – Keith): sin TypeScript, sin frameworks, sin .obj,
// sin librerías alternativas de gráficos/3D, Babylon.js >= 9 y Chart.js presentes, manifest.json válido.
// Uso: node tools/auditar.mjs      (código de salida 0 = cumple, 1 = hay incumplimientos)

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

// 1. Extensiones prohibidas
const PROHIBIDAS = [".ts", ".tsx", ".jsx", ".vue", ".svelte", ".obj", ".mtl"];
for (const f of archivos) {
  if (PROHIBIDAS.includes(extname(f).toLowerCase())) errores.push(`Archivo prohibido: ${rel(f)}`);
}
if (existsSync(join(RAIZ, "tsconfig.json"))) errores.push("Existe tsconfig.json (TypeScript prohibido)");

// 2. Dependencias de package.json
const pkg = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8"));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
const VETADAS = [/^react/, /^angular/, /^@angular/, /^vue/, /^svelte/, /^typescript$/, /^three$/, /^d3/, /^recharts/, /^preact/, /^solid-js/, /^@vitejs\/plugin-(react|vue|svelte)/];
for (const d of Object.keys(deps)) {
  if (VETADAS.some((re) => re.test(d))) errores.push(`Dependencia prohibida: ${d}`);
}
const babylon = deps["@babylonjs/core"];
if (!babylon) errores.push("Falta @babylonjs/core");
else {
  const mayor = parseInt(babylon.replace(/[^\d.]/g, "").split(".")[0], 10);
  if (mayor < 9) errores.push(`Babylon.js debe ser >= 9 (declarado ${babylon})`);
}
if (!deps["chart.js"]) errores.push("Falta chart.js");
if (!deps["vite"] && !deps["webpack"] && !deps["rollup"]) errores.push("Falta un empaquetador básico (Vite/Webpack/Rollup)");

// 3. Código fuente: sin imports de librerías vetadas ni Canvas 2D nativo
const fuentes = archivos.filter((f) => /\.(js|mjs|html)$/.test(f) && rel(f).startsWith("src/") || rel(f) === "index.html");
for (const f of fuentes) {
  const t = readFileSync(f, "utf8");
  if (/from\s+["'](three|react|react-dom|vue|svelte|d3|recharts|@angular\/[^"']+)["']/.test(t)) errores.push(`Import de librería prohibida en ${rel(f)}`);
  if (/getContext\(\s*["']2d["']\s*\)/.test(t)) errores.push(`Canvas 2D nativo en ${rel(f)}`);
  if (/\.obj["'`]/.test(t)) errores.push(`Referencia a archivo .obj en ${rel(f)}`);
}

// 4. manifest.json
try {
  const m = JSON.parse(readFileSync(join(RAIZ, "public", "manifest.json"), "utf8"));
  for (const k of ["name", "version", "modelos", "tecnologias"]) if (!(k in m)) errores.push(`manifest.json sin "${k}"`);
  const ruta = join(RAIZ, "public", m.modelos?.ruta ?? "");
  for (const [carpeta, lista] of [["materiales", m.modelos?.materiales ?? []], ["maquinaria", m.modelos?.maquinaria ?? []]]) {
    for (const a of lista) {
      if (!existsSync(join(ruta, carpeta, a))) errores.push(`manifest.json lista un modelo inexistente: ${carpeta}/${a}`);
      if (!/\.(glb|gltf)$/i.test(a)) errores.push(`Modelo con formato no permitido: ${a}`);
    }
  }
} catch (e) {
  errores.push(`manifest.json inválido o ausente: ${e.message}`);
}

// 5. Módulos ES
if (pkg.type !== "module") avisos.push('package.json no declara "type": "module"');
if (!existsSync(join(RAIZ, "docs", "objetivos-y-rubricas.md"))) errores.push("Falta docs/objetivos-y-rubricas.md");

console.log(`Archivos revisados: ${archivos.length}`);
for (const a of avisos) console.log(`  AVISO  ${a}`);
for (const e of errores) console.log(`  ERROR  ${e}`);
console.log(errores.length ? `\nAuditoría: ${errores.length} incumplimiento(s).` : "\nAuditoría: cumple todas las restricciones.");
process.exit(errores.length ? 1 : 0);
