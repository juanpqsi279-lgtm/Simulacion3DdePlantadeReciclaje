// src/recursos/recursosLocales.js
// Acceso uniforme a los recursos binarios/JSON del proyecto (modelos .glb, HDRI, wasm de Havok, manifest).
// - En el paquete offline (un solo .html) los recursos viajan embebidos en base64 dentro de
//   window.__RECURSOS_EMBEBIDOS__, así que NO hay peticiones de red ni de archivos (funciona con doble clic).
// - En desarrollo (vite) no hay recursos embebidos y se cae al fetch normal.

const cacheBinarios = new Map();
const cacheUrls = new Map();

function registro() {
  return typeof window !== "undefined" ? window.__RECURSOS_EMBEBIDOS__ ?? null : null;
}

function normalizar(ruta) {
  return String(ruta).replace(/^\.?\//, "");
}

function base64ABinario(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function hayRecursoEmbebido(ruta) {
  return Boolean(registro()?.[normalizar(ruta)]);
}

/** Devuelve los bytes del recurso embebido, o null si no está embebido. */
export function binarioEmbebido(ruta) {
  const clave = normalizar(ruta);
  if (cacheBinarios.has(clave)) return cacheBinarios.get(clave);
  const b64 = registro()?.[clave];
  if (!b64) return null;
  const bytes = base64ABinario(b64);
  cacheBinarios.set(clave, bytes);
  return bytes;
}

/** URL utilizable por Babylon.js: blob: si el recurso está embebido, o la ruta original en desarrollo. */
export function urlRecurso(ruta, tipoMime = "application/octet-stream") {
  const clave = normalizar(ruta);
  if (cacheUrls.has(clave)) return cacheUrls.get(clave);
  const bytes = binarioEmbebido(clave);
  const url = bytes ? URL.createObjectURL(new Blob([bytes], { type: tipoMime })) : ruta;
  cacheUrls.set(clave, url);
  return url;
}

/** Fuente aceptada por LoadAssetContainerAsync: bytes embebidos (Uint8Array) o ruta. */
export function fuenteModelo(ruta) {
  return binarioEmbebido(ruta) ?? ruta;
}

export async function leerJsonRecurso(ruta) {
  const bytes = binarioEmbebido(ruta);
  if (bytes) return JSON.parse(new TextDecoder("utf-8").decode(bytes));
  const resp = await fetch(ruta);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

