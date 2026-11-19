// tools/lib/texturas.mjs
// Texturas procedurales (etiquetas, lata impresa, banda de goma, franjas de peligro, carteles, rugosidad del acero).
// Se codifican como PNG con `node:zlib` y se incrustan dentro del .glb (no se crean archivos de imagen sueltos).
// JavaScript puro, sin dependencias.

import { deflateSync } from "node:zlib";

// ───────────── Codificador PNG ─────────────
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (tipo, datos) => {
  const t = Buffer.from(tipo, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(datos.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, datos])));
  return Buffer.concat([len, t, datos, crc]);
};
export function codificarPNG(w, h, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RGB
  const filas = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    filas[y * (w * 3 + 1)] = 1; // filtro Sub (comprime mejor degradados)
    for (let x = 0; x < w * 3; x++) {
      const i = (y * w) * 3 + x;
      const izq = x >= 3 ? rgb[i - 3] : 0;
      filas[y * (w * 3 + 1) + 1 + x] = (rgb[i] - izq) & 255;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(filas, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ───────────── Utilidades de dibujo ─────────────
const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mezcla = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const suave = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
// Ruido de valor tileable (periodo px × py en celdas)
function ruido(x, y, px, py, s = 1) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const H = (i, j) => hash(((i % px) + px) % px, ((j % py) + py) % py, s);
  return (H(x0, y0) * (1 - u) + H(x0 + 1, y0) * u) * (1 - v) + (H(x0, y0 + 1) * (1 - u) + H(x0 + 1, y0 + 1) * u) * v;
}
function crear(w, h, f) {
  const rgb = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = f(x, y, x / w, y / h);
    const i = (y * w + x) * 3;
    rgb[i] = clamp(c[0], 0, 255); rgb[i + 1] = clamp(c[1], 0, 255); rgb[i + 2] = clamp(c[2], 0, 255);
  }
  return codificarPNG(w, h, rgb);
}
// Distancias con signo (para pictogramas con bordes suaves)
const sdRect = (x, y, cx, cy, hw, hh, r = 0) => {
  const dx = Math.abs(x - cx) - (hw - r), dy = Math.abs(y - cy) - (hh - r);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
};
const cobertura = (d, px) => clamp(0.5 - d / px);

// ───────────── Texturas ─────────────
const BLANCO = [244, 245, 240];

// Etiqueta de botella PET (u = alrededor, v = altura). 512×160
function etiquetaPET(c = ["#1f6fb5", "#0d3f73", "#6ec6ef"]) {
  const W = 512, H = 160;
  const [azul, azulOsc, cian] = c.map(hexRGB);
  return crear(W, H, (x, y, u, v) => {
    let c = BLANCO;
    // franja superior e inferior
    if (v < 0.2) c = mezcla(azul, azulOsc, v / 0.2);
    if (v > 0.84) c = mezcla(azul, azulOsc, (v - 0.84) / 0.16);
    // ola
    const ola = 0.62 + 0.07 * Math.sin(u * Math.PI * 4 + 0.6);
    if (v > ola && v <= 0.84) c = mezcla(c, cian, 0.85 * suave(ola, ola + 0.02, v));
    // gota (dos repeticiones)
    for (const cu of [0.25, 0.75]) {
      const dx = (u - cu) * 3.2, dy = v - 0.45;
      const rad = Math.hypot(dx, dy * 1.0);
      const gota = rad < 0.13 || (dy < 0 && Math.abs(dx) < (0.13 + dy) * 0.9 && dy > -0.26);
      if (gota) c = mezcla(azul, cian, clamp((dy + 0.2) * 2.5));
      const brillo = Math.hypot(dx + 0.04, dy + 0.03) < 0.035;
      if (gota && brillo) c = [255, 255, 255];
    }
    // «texto» simulado con barras
    const fila = Math.floor(v * 40);
    if (v > 0.22 && v < 0.34 && fila % 2 === 0 && ((Math.floor(u * 80) * 7 + fila) % 5) !== 0 && (u % 0.5) > 0.06 && (u % 0.5) < 0.44) c = mezcla(c, [60, 70, 80], 0.8);
    // código de barras (zona neutra)
    if (u > 0.47 && u < 0.53 && v > 0.4 && v < 0.55) c = (Math.floor(u * 700) % 2 ? [20, 20, 20] : [240, 240, 240]);
    const r = ruido(x / 3, y / 3, 200, 100, 3) * 6 - 3;
    return [c[0] + r, c[1] + r, c[2] + r];
  });
}

// Lata impresa (u = alrededor, v = altura). 512×192
function lata(c = ["#c4281c", "#7c120c"]) {
  const W = 512, H = 192;
  const [rojo, rojoOsc] = c.map(hexRGB), plata = [196, 202, 208];
  return crear(W, H, (x, y, u, v) => {
    let c = mezcla(rojo, rojoOsc, v * 0.6);
    // bandas plateadas arriba y abajo
    if (v < 0.07 || v > 0.93) c = plata;
    if ((v >= 0.07 && v < 0.085) || (v > 0.915 && v <= 0.93)) c = [250, 250, 250];
    // estela blanca diagonal
    const d = Math.abs(((u * 2 + v * 0.6) % 1) - 0.5);
    if (d < 0.06) c = mezcla(c, [250, 250, 250], 0.92 * suave(0.06, 0.04, d));
    if (d > 0.09 && d < 0.1) c = mezcla(c, [250, 210, 120], 0.8);
    // emblema circular (dos repeticiones)
    for (const cu of [0.25, 0.75]) {
      const rad = Math.hypot((u - cu) * 2.6, v - 0.5);
      if (rad < 0.2) c = [250, 250, 250];
      if (rad < 0.16) c = rojo;
      if (rad < 0.11) c = [250, 250, 250];
      if (rad < 0.075) c = mezcla(rojo, rojoOsc, 0.35);
      if (rad < 0.03) c = [250, 250, 250];
    }
    // «texto»
    if (v > 0.74 && v < 0.82 && ((Math.floor(u * 60) * 13) % 7) > 1) c = mezcla(c, [250, 250, 250], 0.85);
    const r = ruido(x / 2, y / 2, 256, 96, 5) * 5 - 2.5;
    return [c[0] + r, c[1] + r, c[2] + r];
  });
}

// Etiqueta de botella de vidrio (cerveza). 512×128
function etiquetaVidrio(c = ["#efe6c8", "#1d6b3a", "#c9a227"]) {
  const W = 512, H = 128;
  const [crema, verde, dorado] = c.map(hexRGB);
  return crear(W, H, (x, y, u, v) => {
    let c = crema;
    if (v < 0.12 || v > 0.88) c = verde;
    if ((v >= 0.12 && v < 0.14) || (v > 0.86 && v <= 0.88)) c = dorado;
    for (const cu of [0.25, 0.75]) {
      const dx = (u - cu) * 3.4, dy = v - 0.5;
      const e = Math.hypot(dx, dy * 1.15);
      if (e < 0.3) c = verde;
      if (e < 0.27 && e > 0.25) c = dorado;
      if (e < 0.2) c = crema;
      if (e < 0.1) c = verde;
      if (e < 0.04) c = dorado;
    }
    if (v > 0.2 && v < 0.27 && ((Math.floor(u * 70) * 11) % 6) > 1 && (u % 0.5) > 0.08 && (u % 0.5) < 0.42) c = mezcla(c, [60, 50, 30], 0.7);
    if (v > 0.73 && v < 0.8 && ((Math.floor(u * 90) * 5) % 4) > 0 && (u % 0.5) > 0.1 && (u % 0.5) < 0.4) c = mezcla(c, [60, 50, 30], 0.7);
    const r = ruido(x / 2, y / 2, 256, 64, 7) * 14 - 7;
    return [c[0] + r, c[1] + r, c[2] + r * 0.9];
  });
}

// Banda de goma con relieve de espina de pescado. 256×256 (1 tile ≈ 0.2 m con uvEscala 5)
function banda() {
  const N = 256;
  const base = [30, 33, 37];
  return crear(N, N, (x, y, u, v) => {
    const surco = Math.abs(((x + y) % 32) - 16) / 16; // 0..1
    const surco2 = Math.abs((((N - x) + y) % 32) - 16) / 16;
    const relieve = Math.min(surco, surco2);
    let g = 26 + relieve * 20;
    g += (ruido(x / 2, y / 2, N / 2, N / 2, 9) - 0.5) * 10;
    g += (ruido(x / 20, y / 20, N / 20, N / 20, 11) - 0.5) * 8;
    return [g * 0.95, g, g * 1.05];
  });
}

// Franjas de peligro amarillo/negro. 256×64, periodo diagonal de 64 px
function peligro() {
  const W = 256, H = 64;
  const amarillo = hexRGB("#f2b705"), negro = [22, 24, 27];
  return crear(W, H, (x, y) => {
    const d = ((x + y) % 64 + 64) % 64;
    const franja = d < 32 ? 0 : 1;
    let c = franja ? negro : amarillo;
    // borde suavizado
    const e = Math.min(Math.abs(d - 32), Math.min(d, 64 - d));
    if (e < 1.2) c = mezcla(amarillo, negro, 0.5);
    const desgaste = ruido(x / 6, y / 6, 64, 16, 13);
    if (desgaste > 0.78) c = mezcla(c, [150, 150, 150], (desgaste - 0.78) * 2.2);
    const r = (ruido(x, y, 256, 64, 15) - 0.5) * 8;
    return [c[0] + r, c[1] + r, c[2] + r];
  });
}

// Mapa metal/rugosidad (G = rugosidad, B = metalicidad). Variación sutil tipo acero cepillado. 128×128 tileable.
function rugosidad(horizontal = true, amp = 0.2) {
  const N = 128;
  return crear(N, N, (x, y) => {
    const sx = horizontal ? 12 : 1, sy = horizontal ? 1 : 12;
    let n = ruido(x / sx, y / sy, N / sx, N / sy, 21) * 0.7 + ruido(x / 4, y / 4, N / 4, N / 4, 23) * 0.3;
    n = Math.round(n * 7) / 7; // cuantizar para comprimir mejor
    return [255, 255 - amp * 255 * n, 255];
  });
}

// Pictogramas de los carteles de contenedor. 256×192
function cartel(tipo) {
  const W = 256, H = 192;
  const fondos = { plastico: "#1f6fb5", aluminio: "#6c7a89", vidrio: "#2f8f4e" };
  const fondo = hexRGB(fondos[tipo]);
  return crear(W, H, (x, y, u, v) => {
    const px = 1.5 / H;
    // placa blanca redondeada con borde de color
    const dPlaca = sdRect(u * (W / H), v, (W / H) / 2, 0.5, 0.62 * (W / H) / 1.0 * 0.78, 0.44, 0.08);
    let c = fondo;
    if (dPlaca < 0) c = [247, 248, 244];
    // pictograma centrado (coordenadas en unidades de altura)
    const X = (u - 0.5) * (W / H), Y = 0.5 - v; // Y hacia arriba
    let d = 1e9;
    if (tipo === "plastico") {
      d = Math.min(sdRect(X, Y, 0, -0.04, 0.115, 0.2, 0.05), sdRect(X, Y, 0, 0.21, 0.06, 0.06, 0.02), sdRect(X, Y, 0, 0.29, 0.07, 0.025, 0.01));
    } else if (tipo === "aluminio") {
      d = Math.min(sdRect(X, Y, 0, -0.01, 0.11, 0.25, 0.03), sdRect(X, Y, 0, 0.245, 0.095, 0.02, 0.01));
    } else {
      d = Math.min(sdRect(X, Y, 0, -0.1, 0.1, 0.17, 0.05), sdRect(X, Y, 0, 0.12, 0.062, 0.1, 0.03), sdRect(X, Y, 0, 0.27, 0.07, 0.02, 0.01));
    }
    c = mezcla(c, fondo, cobertura(d, px));
    // detalle: franja interior del pictograma
    if (d < -0.004) {
      const marca = tipo === "aluminio" ? Math.abs(Y + 0.01) < 0.03 : tipo === "plastico" ? Math.abs(Y + 0.04) < 0.035 : Math.abs(Y + 0.1) < 0.04;
      if (marca) c = [247, 248, 244];
    }
    // tira inferior de color con puntos
    if (v > 0.9) c = fondo;
    const r = (ruido(x, y, 256, 192, 31) - 0.5) * 5;
    return [c[0] + r, c[1] + r, c[2] + r];
  });
}


// Señal de salida de emergencia: fondo verde, puerta y flecha blancas. 256×128
function senalSalida() {
  const W = 256, H = 128;
  return crear(W, H, (x, y, u, v) => {
    const X = u * 2, Y = v; // X 0..2, Y 0..1
    let c = [20, 140, 70];
    const marco = sdRect(X, Y, 1, 0.5, 0.96, 0.46, 0.06);
    if (marco > -0.03 && marco < 0) c = [240, 250, 240];
    const puerta = sdRect(X, Y, 0.62, 0.5, 0.2, 0.3, 0.02);
    const flecha = Math.min(sdRect(X, Y, 1.36, 0.5, 0.26, 0.07, 0.01), sdRect(X - 1.62 + 0.0, Y - 0.5, 0, 0, 0.001, 0.001, 0));
    // punta de flecha (triángulo hacia la derecha)
    const px = X - 1.60, py = Y - 0.5;
    const punta = Math.max(Math.abs(py) * 1.0 - (0.3 - px) * 0.9, px - 0.3, -px - 0.0);
    if (puerta < 0 || flecha < 0 || (px > 0 && px < 0.3 && Math.abs(py) < (0.3 - px) * 0.95)) c = [245, 252, 245];
    if (sdRect(X, Y, 0.62, 0.5, 0.1, 0.22, 0.01) < 0 && puerta < 0) c = [20, 140, 70];
    return c;
  });
}

// Señal de advertencia: triángulo amarillo con signo de exclamación. 256×256
function senalAlerta() {
  const N = 256;
  return crear(N, N, (x, y, u, v) => {
    let c = [236, 238, 240];
    const px = u - 0.5, py = v - 0.55;
    const dentro = (k) => py > -0.42 + 0 && py < 0.36 && Math.abs(px) < ((py + 0.42) / 0.78) * 0.45 * k;
    const tri = (k) => py > -0.40 * k && py < 0.34 * k && Math.abs(px) < ((py + 0.40 * k) / (0.74 * k)) * 0.44 * k;
    if (tri(1.0)) c = [20, 22, 25];
    if (tri(0.84)) c = [242, 183, 5];
    if (Math.abs(px) < 0.035 && py > -0.12 && py < 0.12) c = [20, 22, 25];
    if (Math.hypot(px, py - 0.2) < 0.04) c = [20, 22, 25];
    return c;
  });
}

// Registro (se generan bajo demanda y se memorizan)
const REGISTRO = {
  etiquetaPET, lata, etiquetaVidrio, banda, peligro,
  senalSalida, senalAlerta,
  etiquetaCola: () => etiquetaPET(["#c8202b", "#6e0f16", "#ff9aa0"]),
  etiquetaAmbar: () => etiquetaVidrio(["#e8d6b0", "#5a3510", "#d8a838"]),
  lataAzul: () => lata(["#1457a8", "#0a2c58"]),
  lataDorada: () => lata(["#c99a14", "#6b4d05"]),
  rugosidadAcero: () => rugosidad(true, 0.2),
  rugosidadPintura: () => rugosidad(false, 0.12),
  cartelPlastico: () => cartel("plastico"),
  cartelAluminio: () => cartel("aluminio"),
  cartelVidrio: () => cartel("vidrio"),
};
const MEMO = new Map();
export function textura(nombre) {
  if (!REGISTRO[nombre]) throw new Error(`Textura desconocida: ${nombre}`);
  if (!MEMO.has(nombre)) MEMO.set(nombre, REGISTRO[nombre]());
  return MEMO.get(nombre);
}
