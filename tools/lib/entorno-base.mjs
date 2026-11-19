// tools/lib/entorno-base.mjs
// Ayudantes para construir el entorno de la nave como escenas "horneadas": todo se coloca en coordenadas de
// mundo y se fusiona por material, de modo que cada .glb de entorno tiene pocas mallas (pocas llamadas de dibujo).

import {
  nuevaGeo, cajaRedonda as CR, cilindro as CI, torno, curva, loftRect, aroRect,
  mover, rotarX, rotarY, rotarZ, ejeA, unir, copiar, escalar,
} from "./geometria.mjs";

const PI = Math.PI;

// Generador pseudoaleatorio determinista (el entorno es siempre idéntico entre ejecuciones)
export function crearRnd(semilla = 7) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Huellas en planta (x0, x1, z0, z1) para comprobar que nada se solapa ni invade el carril de WALL-E
export const HUELLAS = [];
export function huella(nombre, x0, x1, z0, z1) { HUELLAS.push({ nombre, x0, x1, z0, z1 }); }

// Acumulador por material
export class Acum {
  constructor() { this.m = new Map(); }
  add(mat, ...gs) {
    if (!this.m.has(mat)) this.m.set(mat, []);
    this.m.get(mat).push(...gs.flat(Infinity).filter(Boolean));
    return this;
  }
  // Fusiona el contenido de otro acumulador / mapa {mat: [geos]}
  mezclar(otro) { for (const [mat, gs] of otro.m ?? otro) this.add(mat, ...gs); return this; }
  partes(opciones = {}) {
    return [...this.m.entries()].filter(([, gs]) => gs.length).map(([mat, gs]) => ({ nombre: mat, geo: unir(gs), mat, ...(opciones[mat] ?? {}) }));
  }
}

// Caja plana (12 triángulos)
export const B = (x, y, z, sx, sy, sz) => CR(x, y, z, sx, sy, sz, 0, 0);

// Cuadrilátero con normal orientativa (las caras se orientan hacia nHint en finalizar())
export function quad(p0, p1, p2, p3, nHint, uvEsc = 1, uvs = null) {
  const g = nuevaGeo();
  for (const p of [p0, p1, p2, p3]) { g.pos.push(...p); g.nor.push(...nHint); }
  if (uvs) g.uv.push(...uvs);
  else {
    const w = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    const h = Math.hypot(p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]);
    g.uv.push(0, 0, w * uvEsc, 0, w * uvEsc, h * uvEsc, 0, h * uvEsc);
  }
  g.idx.push(0, 1, 2, 0, 2, 3);
  return g;
}
// Muro vertical perpendicular a Z (en z) y perpendicular a X (en x); nSig = hacia dónde mira (+1 / -1)
export const paredZ = (z, x0, x1, y0, y1, nSig) => quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, nSig], 0.25);
export const paredX = (x, z0, z1, y0, y1, nSig) => quad([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], [nSig, 0, 0], 0.25);
export const suelo = (x0, z0, x1, z1, y = 0.004) => quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 1, 0]);
export const techo = (x0, z0, x1, z1, y) => quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, -1, 0]);

// Barra rectangular entre dos puntos (diagonales de cerchas, rampas, tubos cuadrados inclinados)
export function barra(a, b, w = 0.1, h = 0.1) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L = Math.hypot(dx, dy, dz);
  const g = CR(0, 0, 0, L, h, w, 0, 0);
  rotarZ(g, Math.asin(dy / L));
  rotarY(g, Math.atan2(-dz, dx));
  return mover(g, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
}
// Tubo cilíndrico entre dos puntos
export function tubo(a, b, r = 0.03, seg = 10) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L = Math.hypot(dx, dy, dz);
  const g = CI(0, 0, 0, r, L, "x", seg, 0);
  rotarZ(g, Math.asin(dy / L));
  rotarY(g, Math.atan2(-dz, dx));
  return mover(g, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
}

// Gira una lista de geometrías sobre Y (alrededor del origen local) y las traslada
export function colocar(geos, x, y, z, giro = 0) {
  for (const g of [geos].flat(Infinity)) { if (giro) rotarY(g, giro); mover(g, x, y, z); }
  return geos;
}

// ───────────────────────── Residuos de baja resolución (pilas decorativas) ─────────────────────────
const PLANTILLAS = (() => {
  const botella = (r, h) => torno([[0, 0], [r * 0.85, 0], [r, h * 0.05], [r, h * 0.62], [r * 0.6, h * 0.82], [r * 0.45, h * 0.88], [r * 0.45, h], [0, h]], 8);
  const lata = torno([[0, 0], [0.026, 0], [0.033, 0.008], [0.033, 0.104], [0.027, 0.115], [0, 0.119]], 8);
  const vidrio = (r, h) => torno([[0, 0], [r, 0], [r, h * 0.45], [r * 0.5, h * 0.72], [r * 0.46, h], [0, h]], 8);
  return {
    plastico: [
      { geo: botella(0.033, 0.196), mat: "res_pet_azul", c: 0.1 },
      { geo: botella(0.033, 0.200), mat: "res_pet_claro", c: 0.1 },
      { geo: botella(0.032, 0.195), mat: "res_pet_cola", c: 0.1 },
    ],
    aluminio: [
      { geo: lata, mat: "res_lata_roja", c: 0.06 },
      { geo: lata, mat: "res_lata_azul", c: 0.06 },
      { geo: lata, mat: "res_lata_plata", c: 0.06 },
    ],
    vidrio: [
      { geo: vidrio(0.030, 0.225), mat: "res_vid_verde", c: 0.11 },
      { geo: vidrio(0.030, 0.225), mat: "res_vid_ambar", c: 0.11 },
      { geo: vidrio(0.036, 0.100), mat: "res_vid_claro", c: 0.05 },
    ],
  };
})();

const BOLSA = torno(Array.from({ length: 6 }, (_, i) => { const a = -PI / 2 + (PI * i) / 5; return [Math.cos(a) * 0.99, Math.sin(a)]; }), 8);

// Pila de residuos mezclados sobre un montículo elíptico. Devuelve Acum con el contenido.
export function pila(rnd, { cx, cz, rx, rz, h, y0 = 0, n = 100, mezcla = [0.4, 0.35, 0.25], escala = 1, nBolsas = 0 }) {
  const ac = new Acum();
  for (let i = 0; i < n; i++) {
    const ang = rnd() * PI * 2, rr = Math.sqrt(rnd());
    const px = cx + Math.cos(ang) * rr * rx, pz = cz + Math.sin(ang) * rr * rz;
    const py = y0 + h * Math.pow(Math.max(0, 1 - rr * rr), 0.75) * (0.55 + 0.45 * rnd());
    const r = rnd();
    const tipo = r < mezcla[0] ? "plastico" : r < mezcla[0] + mezcla[1] ? "aluminio" : "vidrio";
    const lista = PLANTILLAS[tipo];
    const t = lista[Math.floor(rnd() * lista.length)];
    const g = copiar(typeof t.geo === "function" ? t.geo : t.geo);
    mover(g, 0, -t.c, 0);
    if (escala !== 1) escalar(g, escala, escala, escala);
    rotarX(g, (rnd() - 0.5) * PI * 1.6); rotarY(g, rnd() * PI * 2); rotarZ(g, (rnd() - 0.5) * PI * 1.6);
    mover(g, px, py, pz);
    ac.add(t.mat, g);
  }
  // Bolsas de basura que rellenan los huecos entre piezas (esferoides de baja resolución)
  const matsBolsa = ["llanta", "bolsa_blanca", "res_base"];
  for (let i = 0; i < nBolsas; i++) {
    const ang = rnd() * PI * 2, rr = Math.sqrt(rnd());
    const px = cx + Math.cos(ang) * rr * rx * 0.95, pz = cz + Math.sin(ang) * rr * rz * 0.95;
    const py = y0 + h * 0.8 * Math.pow(Math.max(0, 1 - rr * rr), 0.75) * (0.5 + 0.5 * rnd());
    const g = escalar(copiar(BOLSA), 0.2 + rnd() * 0.12, 0.13 + rnd() * 0.08, 0.2 + rnd() * 0.12);
    rotarY(g, rnd() * PI * 2);
    mover(g, px, py, pz);
    ac.add(matsBolsa[Math.floor(rnd() * matsBolsa.length)], g);
  }
  return ac;
}

// ───────────────────────── Mobiliario de planta ─────────────────────────
// Tarima de madera de 1.2 × 1.0 m
export function tarima(x, z, giro = 0) {
  const gs = [];
  for (const dz of [-0.42, 0, 0.42]) gs.push(B(0, 0.07, dz, 1.2, 0.09, 0.10));
  for (let i = 0; i < 6; i++) gs.push(B(-0.52 + i * 0.208, 0.135, 0, 0.14, 0.025, 1.0));
  for (const dx of [-0.54, 0, 0.54]) gs.push(B(dx, 0.015, 0, 0.12, 0.03, 1.0));
  const a = new Acum();
  a.add("madera", colocar(gs, x, 0, z, giro));
  return a;
}

// Paca prensada con zunchos. sx, sy, sz = medidas; mat = clave de material
export function paca(x, y, z, sx, sy, sz, mat, giro = 0) {
  const a = new Acum();
  a.add(mat, colocar([CR(0, 0, 0, sx, sy, sz, 0.03, 1)], x, y + sy / 2, z, giro));
  const zunchos = [];
  for (const f of [-0.33, 0, 0.33]) zunchos.push(B(f * sx, 0, 0, 0.012, sy + 0.006, sz + 0.006));
  a.add("llanta", colocar(zunchos, x, y + sy / 2, z, giro));
  return a;
}

// Contenedor de ruedas de 240 L (cuerpo hueco, tapa abatible, ruedas y asa)
export function boteRuedas(x, z, giro, matCuerpo) {
  const a = new Acum();
  const cuerpo = loftRect([{ y: 0.10, w: 0.46, d: 0.56, r: 0.04 }, { y: 1.00, w: 0.58, d: 0.74, r: 0.05 }], { espesor: 0.010, arc: 3 });
  const tapa = CR(0, 1.035, 0, 0.62, 0.05, 0.78, 0.02, 1);
  const asa = unir(CI(0, 1.04, -0.43, 0.014, 0.50, "x", 10, 0), B(-0.22, 0.97, -0.42, 0.03, 0.12, 0.03), B(0.22, 0.97, -0.42, 0.03, 0.12, 0.03));
  a.add(matCuerpo, colocar([cuerpo, tapa], x, 0, z, giro));
  const osc = [asa, CI(-0.27, 0.10, -0.30, 0.10, 0.045, "x", 14, 0.004), CI(0.27, 0.10, -0.30, 0.10, 0.045, "x", 14, 0.004), CI(0, 0.10, -0.30, 0.012, 0.56, "x", 8, 0),
    B(-0.2, 0.04, 0.30, 0.06, 0.08, 0.06), B(0.2, 0.04, 0.30, 0.06, 0.08, 0.06)];
  a.add("llanta", colocar(osc, x, 0, z, giro));
  return a;
}

// Contenedor abierto de gran volumen (roll-off) de 6.0 × 2.4 × 1.9 m con eje a lo largo de X
export function rolloff(cx, cz, matCuerpo, giro = 0) {
  const a = new Acum();
  const cuerpo = [B(0, 0.34, 0, 6.0, 0.08, 2.4), B(0, 1.15, -1.17, 6.0, 1.72, 0.06), B(0, 1.15, 1.17, 6.0, 1.72, 0.06),
    B(2.97, 1.15, 0, 0.06, 1.72, 2.4), B(-2.97, 1.15, 0, 0.06, 1.72, 2.4)];
  for (let i = 0; i < 9; i++) for (const sg of [-1, 1]) cuerpo.push(B(-2.7 + i * 0.675, 1.12, sg * 1.21, 0.08, 1.6, 0.07));
  for (const sg of [-1, 1]) cuerpo.push(B(0, 2.0, sg * 1.2, 6.06, 0.07, 0.12));
  const base = [];
  for (const sg of [-1, 1]) base.push(B(0, 0.20, sg * 0.82, 6.2, 0.14, 0.16));
  for (const sg of [-1, 1]) base.push(CI(-2.55, 0.12, sg * 1.05, 0.12, 0.10, "z", 12, 0.005));
  const gancho = [B(2.92, 1.75, 0, 0.10, 0.08, 1.0), B(2.98, 1.98, 0, 0.10, 0.16, 0.14)];
  a.add(matCuerpo, colocar(cuerpo, cx, 0, cz, giro));
  a.add("estructura_gris", colocar([...base, ...gancho], cx, 0, cz, giro));
  return a;
}

// Bolsa grande (big bag) de 0.95 × 1.05 × 0.95 m con asas
export function bigBag(x, z, giro = 0, rnd = Math.random) {
  const a = new Acum();
  const cuerpo = CR(0, 0.55, 0, 0.95, 1.05, 0.95, 0.07, 2);
  const correas = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    correas.push(B(sx * 0.475, 0.58, sz * 0.2, 0.012, 1.08, 0.07), B(sx * 0.2, 0.58, sz * 0.475, 0.07, 1.08, 0.012));
    correas.push(B(sx * 0.46, 1.17, sz * 0.46, 0.06, 0.28, 0.06));
  }
  a.add("bolsa_blanca", colocar([cuerpo], x, 0, z, giro));
  a.add("amarillo_seg", colocar(correas, x, 0, z, giro));
  return a;
}

// Montacargas (horquilla hacia +X antes de girar)
export function montacargas(x, z, giro = 0) {
  const a = new Acum();
  const amarillo = [CR(-0.35, 0.55, 0, 1.45, 0.55, 1.0, 0.07, 2), CR(-1.15, 0.64, 0, 0.5, 0.66, 1.0, 0.09, 2), CR(0.25, 0.85, 0, 0.5, 0.18, 0.84, 0.05, 2),
    CR(-0.55, 2.06, 0, 1.25, 0.05, 1.06, 0.02, 1)];
  const gris = [];
  for (const [px, pz] of [[-0.95, -0.5], [-0.95, 0.5], [0.15, -0.5], [0.15, 0.5]]) gris.push(CI(px, 1.45, pz, 0.025, 1.2, "y", 8, 0));
  gris.push(CR(0.80, 1.05, -0.30, 0.09, 2.1, 0.10, 0.01, 1), CR(0.80, 1.05, 0.30, 0.09, 2.1, 0.10, 0.01, 1), B(0.80, 1.75, 0, 0.09, 0.08, 0.7), B(0.80, 0.9, 0, 0.09, 0.08, 0.7),
    CR(0.88, 0.65, 0, 0.07, 0.62, 0.84, 0.01, 1), B(1.6, 0.20, -0.30, 1.45, 0.06, 0.13), B(1.6, 0.20, 0.30, 1.45, 0.06, 0.13), B(0.9, 0.35, -0.30, 0.06, 0.34, 0.13), B(0.9, 0.35, 0.30, 0.06, 0.34, 0.13));
  const negro = [CI(0.45, 0.30, -0.52, 0.30, 0.22, "z", 18, 0.01), CI(0.45, 0.30, 0.52, 0.30, 0.22, "z", 18, 0.01),
    CI(-1.0, 0.24, -0.48, 0.24, 0.18, "z", 16, 0.01), CI(-1.0, 0.24, 0.48, 0.24, 0.18, "z", 16, 0.01),
    CR(-0.50, 1.0, 0, 0.42, 0.10, 0.40, 0.03, 1), CR(-0.70, 1.28, 0, 0.10, 0.50, 0.40, 0.03, 1), CI(0.0, 1.18, 0, 0.14, 0.03, "y", 16, 0.004), CI(0.08, 1.05, 0, 0.02, 0.28, "y", 8, 0)];
  a.add("amarillo_seg", colocar(amarillo, x, 0, z, giro));
  a.add("estructura_gris", colocar(gris, x, 0, z, giro));
  a.add("llanta", colocar(negro, x, 0, z, giro));
  a.add("luz_ambar", colocar([CI(-0.55, 2.14, 0, 0.06, 0.10, "y", 12, 0.005)], x, 0, z, giro));
  return a;
}

// Barandal de seguridad (tubo superior + intermedio + postes) entre dos puntos en planta
export function barandal(x0, z0, x1, z1, y = 0, alto = 1.05, mat = "amarillo_seg", paso = 1.5) {
  const a = new Acum();
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / paso));
  const gs = [tubo([x0, y + alto, z0], [x1, y + alto, z1], 0.025), tubo([x0, y + alto * 0.55, z0], [x1, y + alto * 0.55, z1], 0.02)];
  for (let i = 0; i <= n; i++) gs.push(CI(x0 + ((x1 - x0) * i) / n, y + alto / 2, z0 + ((z1 - z0) * i) / n, 0.028, alto, "y", 8, 0));
  a.add(mat, gs);
  return a;
}
