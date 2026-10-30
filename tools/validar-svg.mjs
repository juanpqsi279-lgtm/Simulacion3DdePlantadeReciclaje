// tools/validar-svg.mjs
// Asegura que los gráficos vectoriales de la interfaz estén en formato SVG y que cada SVG sea correcto.
// JavaScript puro (ES modules), sin dependencias.
//
// Uso:   node tools/validar-svg.mjs [carpeta_raiz]      (por defecto: la raíz del repo)
// Salida: código 0 si todo cumple, 1 si hay errores.
//
// Reglas (según la planeación: "Vectores en formato SVG"; prohibido "propietarios o bitmap no escalables"):
//  ERROR  · formato vectorial propietario en cualquier lugar (.ai .eps .cdr .emf .wmf .sketch .fig ...)
//  ERROR  · imagen bitmap (.png .jpg .gif .bmp .webp ...) dentro de carpetas de interfaz (ui/, icons/, iconos/, logo*)
//  ERROR  · SVG mal formado, sin xmlns, sin viewBox, con <script>, con eventos on*, con <foreignObject>,
//           con referencias externas (http/https) o con bitmaps incrustados (data:image/png...)
//  AVISO  · bitmap fuera de carpetas de interfaz (puede ser una textura o foto legítima: revisar a mano)
//  AVISO  · HTML/CSS/JS que referencia un bitmap con nombre de ícono/logo

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, extname, relative, dirname, resolve, basename, sep } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(process.argv[2] ?? join(AQUI, ".."));

const VECTOR_PROPIETARIO = new Set([".ai", ".eps", ".cdr", ".emf", ".wmf", ".xar", ".sketch", ".fig", ".afdesign", ".vsd", ".vsdx", ".dwg", ".dxf", ".swf"]);
const BITMAP = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff", ".webp", ".ico", ".psd"]);
const IGNORAR = new Set(["node_modules", ".git", "dist", "build", ".vite", "coverage", "docs"]);
const CARPETAS_UI = /(^|[\\/])(ui|icons|iconos|iconografia|logos?)([\\/]|$)/i;
const CODIGO = new Set([".html", ".htm", ".css", ".js", ".mjs"]);

const errores = [], avisos = [], validos = [];

function recorrer(dir) {
  for (const nombre of readdirSync(dir)) {
    if (IGNORAR.has(nombre)) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) { recorrer(ruta); continue; }
    const ext = extname(nombre).toLowerCase();
    const rel = relative(RAIZ, ruta);
    const enUI = CARPETAS_UI.test(rel) || /^(logo|icon|icono)/i.test(basename(nombre));
    if (VECTOR_PROPIETARIO.has(ext)) errores.push(`${rel}: formato vectorial propietario (${ext}). Convertir a .svg`);
    else if (BITMAP.has(ext)) {
      if (enUI) errores.push(`${rel}: bitmap (${ext}) en recursos de interfaz. Los gráficos vectoriales deben ser .svg`);
      else avisos.push(`${rel}: imagen bitmap (${ext}) fuera de carpetas de interfaz; confirmar que no sea un gráfico vectorial`);
    } else if (ext === ".svg") validarSVG(ruta, rel);
    else if (CODIGO.has(ext)) revisarReferencias(ruta, rel);
  }
}

function validarSVG(ruta, rel) {
  const fallos = [];
  let txt = readFileSync(ruta, "utf8");
  if (txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);
  if (!txt.trim()) { errores.push(`${rel}: archivo vacío`); return; }

  // Quitar partes que no son etiquetas, avisando de lo que pueda ser riesgoso
  if (/<!DOCTYPE/i.test(txt)) avisos.push(`${rel}: contiene DOCTYPE (innecesario en SVG; puede ser riesgoso). Quitarlo`);
  let limpio = txt.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "").replace(/<\?[\s\S]*?\?>/g, "").replace(/<!DOCTYPE[^>]*>/gi, "");

  // Análisis de etiquetas con pila (bien formado)
  const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:"[^"]*"|'[^']*'|[^<>"'])*?)(\/?)>/g;
  const pila = []; let raiz = null, m, ultimo = 0, hojas = 0;
  const DIBUJABLES = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "use", "image"]);
  while ((m = re.exec(limpio))) {
    const entre = limpio.slice(ultimo, m.index);
    if (/</.test(entre)) { fallos.push("hay un '<' sin cerrar o una etiqueta mal escrita"); break; }
    ultimo = re.lastIndex;
    const [, cierra, nombre, attrs, auto] = m;
    const n = nombre.toLowerCase();
    if (cierra) {
      const abierta = pila.pop();
      if (abierta !== n) { fallos.push(`etiqueta </${nombre}> no coincide con <${abierta ?? "ninguna"}>`); break; }
      continue;
    }
    if (!raiz) {
      raiz = { n, attrs };
      if (n !== "svg") fallos.push(`el elemento raíz es <${nombre}>, debería ser <svg>`);
    }
    if (DIBUJABLES.has(n)) hojas++;
    if (n === "script") fallos.push("contiene <script> (no permitido en gráficos de interfaz)");
    if (n === "foreignobject") fallos.push("contiene <foreignObject> (incrusta HTML; no es vector puro)");
    if (n === "image") fallos.push("contiene <image> (los bitmaps no son gráficos vectoriales)");
    if (/\son\w+\s*=/i.test(attrs)) fallos.push(`<${nombre}> tiene un atributo de evento (on...)`);
    for (const h of attrs.matchAll(/(?:xlink:)?href\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
      const v = (h[2] ?? h[3] ?? "").trim();
      if (/^(https?:)?\/\//i.test(v)) fallos.push(`referencia externa no permitida: ${v}`);
      if (/^data:image\/(png|jpe?g|gif|webp|bmp)/i.test(v)) fallos.push("bitmap incrustado (data:image/...)");
    }
    if (/url\(\s*["']?(https?:)?\/\//i.test(attrs)) fallos.push("url() externo en un atributo");
    if (!auto) pila.push(n);
  }
  if (!fallos.length) {
    if (!raiz) fallos.push("no se encontró ninguna etiqueta (no es un SVG)");
    else {
      if (pila.length) fallos.push(`etiqueta <${pila.at(-1)}> sin cerrar`);
      if (!/\sxmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/.test(" " + raiz.attrs) && raiz.n === "svg") fallos.push('falta xmlns="http://www.w3.org/2000/svg" en <svg>');
      const tieneVB = (a) => /\sviewBox\s*=\s*["'][^"']+["']/.test(" " + a);
      const simbolos = [...limpio.matchAll(/<symbol\b([^>]*)>/gi)];
      if (simbolos.length) {
        // Sprite: la raíz no necesita viewBox, pero cada <symbol> sí (es lo que se escala al usarlo con <use>)
        simbolos.forEach((sm, i) => { if (!tieneVB(sm[1])) fallos.push(`<symbol> #${i + 1} sin viewBox`); });
      } else {
        if (!tieneVB(raiz.attrs)) fallos.push("falta viewBox (sin él el SVG no escala correctamente)");
        if (hojas === 0) fallos.push("no contiene formas dibujables");
      }
    }
  }

  if (fallos.length) for (const f of fallos) errores.push(`${rel}: ${f}`);
  else validos.push({ rel, kb: (Buffer.byteLength(txt) / 1024).toFixed(1), formas: hojas });
}

function revisarReferencias(ruta, rel) {
  const txt = readFileSync(ruta, "utf8");
  for (const m of txt.matchAll(/(?:src=|href=|url\()\s*["']?([^"')\s>]+\.(?:ai|eps|cdr|emf|wmf|sketch|fig))["')\s>]?/gi))
    errores.push(`${rel}: referencia a formato vectorial propietario: ${m[1]}`);
  for (const m of txt.matchAll(/(?:src=|url\()\s*["']?([^"')\s>]*(?:icon|icono|logo|ui)[^"')\s>]*\.(?:png|jpe?g|gif|bmp|webp|ico))["')\s>]?/gi))
    avisos.push(`${rel}: usa el bitmap "${m[1]}" como gráfico de interfaz; reemplazar por .svg`);
}

if (!existsSync(RAIZ)) { console.error(`No existe la carpeta: ${RAIZ}`); process.exit(2); }
recorrer(RAIZ);

console.log(`Validación de gráficos vectoriales (SVG) en: ${RAIZ}\n`);
if (validos.length) {
  console.log("SVG válidos:");
  for (const v of validos) console.log(`  ✔ ${v.rel.padEnd(44)} ${v.kb.padStart(5)} KB  ${String(v.formas).padStart(2)} formas`);
}
if (avisos.length) { console.log("\nAvisos:"); for (const a of avisos) console.log(`  ⚠ ${a}`); }
if (errores.length) { console.log("\nERRORES:"); for (const e of errores) console.log(`  ✘ ${e}`); }
console.log(`\nResumen: ${validos.length} SVG válidos, ${errores.length} errores, ${avisos.length} avisos.`);
console.log(errores.length ? "RESULTADO: NO CUMPLE (corregir los errores de arriba)" : "RESULTADO: CUMPLE — los gráficos vectoriales están en SVG y bien formados");
process.exit(errores.length ? 1 : 0);
