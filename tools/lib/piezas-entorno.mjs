// tools/lib/piezas-entorno.mjs
// Entorno de la planta: nave industrial y cuatro zonas horneadas en coordenadas de mundo.
// La línea funcional (banda, estaciones, contenedores y carril de WALL-E) NO se toca: ocupa x ∈ [-4.2, 5.2], z ∈ [-2.4, 0.8].
//
//   nave.glb       estructura, muros, techo, grúa puente, luminarias, ductos, señalética y marcas de piso
//   recepcion.glb  foso de recepción con pila de residuos, banda inclinada hacia la tolva y montacargas
//   salida.glb     empacadora, pacas de plástico / aluminio / cartón y vallas de seguridad
//   patio.glb      contenedores roll-off, botes de ruedas, big bags, estantería y entresuelo con cabina de control
//
// Plano (vista cenital, x → derecha, z → hacia el fondo en negativo):  nave 32 × 20 m, altura 8.5 m.

import { cajaRedonda as CR, cilindro as CI, torno, loftRect, aroRect, mover, rotarY, unir, escalar } from "./geometria.mjs";
import { Acum, B, quad, paredZ, paredX, suelo, techo, barra, tubo, colocar, crearRnd, huella, pila, tarima, paca, boteRuedas, rolloff, bigBag, montacargas, barandal } from "./entorno-base.mjs";

const PI = Math.PI;
export const NAVE = Object.freeze({ X0: -16, X1: 16, Z0: -10, Z1: 10, H: 8.5 });
const { X0, X1, Z0, Z1, H } = NAVE;

// Opciones por material al escribir el GLB (escala de UV de texturas repetidas)
export const OPC_ENTORNO = { banda_goma: { uvEsc: 5 }, pintura_peligro: { uvEsc: [4, 4] } };

// Franja de paredes: dado oscuro, paño, ventanal y cornisa
function muro(a, eje, pos, a0, a1, nSig, abierto = false) {
  const P = eje === "z" ? paredZ : paredX;
  a.add("muro_oscuro", P(pos, a0, a1, 0, 1.2, nSig));
  a.add("muro", P(pos, a0, a1, 1.2, 5.4, nSig), P(pos, a0, a1, 7.4, H, nSig));
  const o = 0.03 * nSig;
  a.add(abierto ? "cristal_simple" : "cristal_ventana", P(pos + o, a0, a1, 5.4, 7.4, nSig));
  if (abierto) return;   // el muro frontal no lleva parteluces: así no tapa la vista desde fuera
  // Parteluces del ventanal
  for (let t = a0 + 1; t < a1; t += 2) {
    a.add("estructura_gris", eje === "z" ? B(t, 6.4, pos + 0.06 * nSig, 0.07, 2.0, 0.1) : B(pos + 0.06 * nSig, 6.4, t, 0.1, 2.0, 0.07));
  }
  a.add("estructura_gris", eje === "z" ? B((a0 + a1) / 2, 5.4, pos + 0.06 * nSig, a1 - a0, 0.08, 0.1) : B(pos + 0.06 * nSig, 5.4, (a0 + a1) / 2, 0.1, 0.08, a1 - a0));
  a.add("estructura_gris", eje === "z" ? B((a0 + a1) / 2, 7.4, pos + 0.06 * nSig, a1 - a0, 0.08, 0.1) : B(pos + 0.06 * nSig, 7.4, (a0 + a1) / 2, 0.1, 0.08, a1 - a0));
}

// Portón enrollable con marco amarillo
function porton(a, eje, pos, centro, ancho, alto, nSig) {
  const o = 0.04 * nSig;
  const P = eje === "z" ? paredZ : paredX;
  a.add("estructura_gris", P(pos + o, centro - ancho / 2, centro + ancho / 2, 0, alto, nSig));
  for (let y = 0.25; y < alto; y += 0.25) {
    a.add("muro_oscuro", eje === "z" ? B(centro, y, pos + 0.06 * nSig, ancho, 0.025, 0.02) : B(pos + 0.06 * nSig, y, centro, 0.02, 0.025, ancho));
  }
  const m = 0.14;
  const marco = eje === "z"
    ? [B(centro - ancho / 2 - m / 2, alto / 2, pos + 0.07 * nSig, m, alto, 0.12), B(centro + ancho / 2 + m / 2, alto / 2, pos + 0.07 * nSig, m, alto, 0.12), B(centro, alto + m / 2, pos + 0.07 * nSig, ancho + 2 * m, m, 0.12)]
    : [B(pos + 0.07 * nSig, alto / 2, centro - ancho / 2 - m / 2, 0.12, alto, m), B(pos + 0.07 * nSig, alto / 2, centro + ancho / 2 + m / 2, 0.12, alto, m), B(pos + 0.07 * nSig, alto + m / 2, centro, 0.12, m, ancho + 2 * m)];
  a.add("amarillo_seg", marco);
}

// Señal con textura (u,v: esquina inferior izquierda → superior derecha)
function senal(a, mat, x, y, z, w, h, nSig, eje = "z") {
  const uvs = [0, 1, 1, 1, 1, 0, 0, 0];
  const p = eje === "z"
    ? [[x - w / 2, y - h / 2, z], [x + w / 2, y - h / 2, z], [x + w / 2, y + h / 2, z], [x - w / 2, y + h / 2, z]]
    : [[x, y - h / 2, z - w / 2], [x, y - h / 2, z + w / 2], [x, y + h / 2, z + w / 2], [x, y + h / 2, z - w / 2]];
  a.add(mat, quad(p[0], p[1], p[2], p[3], eje === "z" ? [0, 0, nSig] : [nSig, 0, 0], 1, uvs));
}

// Extintor de pared (cilindro rojo + soporte)
function extintor(a, x, y, z, nz) {
  a.add("rojo_seg", CI(x, y, z, 0.07, 0.4, "y", 12, 0.01), CI(x, y + 0.24, z, 0.03, 0.08, "y", 8, 0));
  a.add("estructura_gris", B(x, y, z - 0.07 * nz, 0.16, 0.5, 0.02));
}

// ═════════════════════════ NAVE ═════════════════════════
// nave.glb:      muros, columnas, portones, señalética y marcas de piso
// nave_techo.glb: cerchas, correas, cubierta, grúa puente, luminarias y ductos. El motor 3D oculta este archivo cuando la
//                 cámara sube por encima del techo, para que las vistas cenital y de nave completa no queden tapadas.
export function entornoNave() {
  const a = new Acum();
  // Muros (solo caras interiores: desde fuera la nave es transparente al orbitar la cámara)
  muro(a, "z", Z0, X0, X1, +1);
  muro(a, "z", Z1, X0, X1, -1, true);
  muro(a, "x", X0, Z0, Z1, +1);
  muro(a, "x", X1, Z0, Z1, -1);
  // Pilastras (el muro frontal queda abierto a la vista: sin pilastras)
  for (let x = X0 + 2; x < X1; x += 4) a.add("estructura_gris", B(x, H / 2, Z0 + 0.2, 0.4, H, 0.3));
  for (let z = Z0 + 2; z < Z1; z += 4) a.add("estructura_gris", B(X0 + 0.2, H / 2, z, 0.3, H, 0.4), B(X1 - 0.2, H / 2, z, 0.3, H, 0.4));
  // Portones: muelles en el fondo, acceso del foso (izquierda) y salida de pacas (derecha)
  porton(a, "z", Z0, -11.5, 3.4, 4.0, +1);
  porton(a, "z", Z0, 14.0, 3.4, 4.0, +1);
  porton(a, "x", X0, 0, 3.8, 4.6, +1);
  porton(a, "x", X1, -1.5, 3.2, 3.6, -1);
  // Muelles de carga y topes
  a.add("llanta", B(-11.5 - 1.2, 0.35, Z0 + 0.22, 0.3, 0.5, 0.3), B(-11.5 + 1.2, 0.35, Z0 + 0.22, 0.3, 0.5, 0.3), B(14.0 - 1.2, 0.35, Z0 + 0.22, 0.3, 0.5, 0.3), B(14.0 + 1.2, 0.35, Z0 + 0.22, 0.3, 0.5, 0.3));
  // Columnas de los pórticos (en el lado frontal solo las esquinas, para no tapar la vista)
  for (const x of MARCOS) {
    a.add("estructura", B(x, H / 2 - 0.2, Z0 + 0.5, 0.3, H - 0.4, 0.3), B(x, 0.05, Z0 + 0.5, 0.6, 0.1, 0.6));
    if (x === -14 || x === 14) a.add("estructura", B(x, H / 2 - 0.2, Z1 - 0.5, 0.3, H - 0.4, 0.3), B(x, 0.05, Z1 - 0.5, 0.6, 0.1, 0.6));
  }
  // Señalética: salidas de emergencia, advertencias y extintores
  for (const [x, z, nz] of [[-11.5, Z0 + 0.06, 1], [14.0, Z0 + 0.06, 1], [X0 + 3, Z1 - 0.06, -1], [X1 - 3, Z1 - 0.06, -1]]) senal(a, "senal_salida", x, 4.5, z, 0.9, 0.45, nz);
  senal(a, "senal_salida", X0 + 0.06, 4.9, 3.0, 0.9, 0.45, +1, "x");
  for (const [x, z, nz] of [[-6.2, Z0 + 0.36, 1], [1.8, Z0 + 0.36, 1], [9.8, Z0 + 0.36, 1]]) { senal(a, "senal_alerta", x, 2.2, z, 0.5, 0.5, nz); extintor(a, x + 1.0, 1.1, z, nz); }
  a.add("luz_salida", CR(-11.5, 4.5, Z0 + 0.04, 1.0, 0.55, 0.04, 0.01, 1));
  // Marcas de piso: pasillo peatonal verde, eje de circulación de montacargas y contornos de zona
  const fr = 0.12;
  a.add("verde_seg", suelo(-14.5, 5.5, 14.5, 5.5 + 0.9, 0.003));
  a.add("amarillo_seg", suelo(-14.5, 5.38, 14.5, 5.38 + fr, 0.004), suelo(-14.5, 6.4, 14.5, 6.4 + fr, 0.004));
  for (let x = -14.5; x < 14.0; x += 2.0) a.add("amarillo_seg", suelo(x, 3.9, x + 1.2, 3.9 + fr, 0.004));
  const caja = (x0, z0, x1, z1) => a.add("amarillo_seg", suelo(x0, z0, x1, z0 + fr, 0.004), suelo(x0, z1 - fr, x1, z1, 0.004), suelo(x0, z0, x0 + fr, z1, 0.004), suelo(x1 - fr, z0, x1, z1, 0.004));
  caja(-15.4, -4.4, -7.2, 4.4);   // foso de recepción
  caja(5.8, -3.4, 15.4, 2.6);     // zona de empaque
  caja(-14.0, -9.8, 8.0, -4.8);   // patio de contenedores
  return a.partes(OPC_ENTORNO);
}

const MARCOS = [-14, -10, -6, -2, 2, 6, 10, 14];

export function entornoTecho() {
  const a = new Acum();
  for (const x of MARCOS) {
    const zi = Z0 + 0.5, zf = Z1 - 0.5, yT = H - 0.25, yB = H - 1.2;
    a.add("estructura", B(x, yT, 0, 0.16, 0.14, zf - zi), B(x, yB, 0, 0.14, 0.12, zf - zi));
    const nP = 8, dz = (zf - zi) / nP;
    for (let i = 0; i <= nP; i++) a.add("estructura", B(x, (yT + yB) / 2, zi + i * dz, 0.1, yT - yB, 0.08));
    for (let i = 0; i < nP; i++) {
      const arriba = i % 2 === 0;
      a.add("estructura", barra([x, arriba ? yB : yT, zi + i * dz], [x, arriba ? yT : yB, zi + (i + 1) * dz], 0.07, 0.08));
    }
  }
  for (let i = 0; i < 9; i++) a.add("estructura_gris", B(0, H - 0.1, Z0 + 1 + i * 2.25, X1 - X0, 0.1, 0.12));
  a.add("chapa_techo", techo(X0, Z0, X1, Z1, H));
  // Grúa puente: caminos de rodadura, puente, carro y gancho
  a.add("amarillo_seg", B(0, 6.5, Z0 + 1.0, X1 - X0 - 0.6, 0.5, 0.3), B(0, 6.5, Z1 - 1.0, X1 - X0 - 0.6, 0.5, 0.3));
  a.add("estructura_gris", B(0, 6.78, Z0 + 1.0, X1 - X0 - 0.6, 0.06, 0.12), B(0, 6.78, Z1 - 1.0, X1 - X0 - 0.6, 0.06, 0.12));
  const xg = 10.5;
  a.add("amarillo_seg", B(xg, 7.1, 0, 0.55, 0.55, Z1 - Z0 - 2.0), B(xg, 6.85, Z0 + 1.0, 1.2, 0.35, 0.7), B(xg, 6.85, Z1 - 1.0, 1.2, 0.35, 0.7));
  a.add("rojo_seg", CR(xg, 6.55, 1.6, 0.9, 0.7, 0.9, 0.06, 1));
  a.add("estructura_gris", tubo([xg, 6.2, 1.6], [xg, 4.1, 1.6], 0.02), CI(xg, 3.95, 1.6, 0.11, 0.3, "y", 12, 0.02), B(xg, 3.7, 1.6, 0.05, 0.25, 0.05));
  // Luminarias de gran altura (campana + disco emisivo) y paneles luminosos
  for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
    const lx = -13 + i * 5.2, lz = -6.2 + j * 6.2;
    a.add("estructura_gris", CI(lx, 6.9, lz, 0.28, 0.14, "y", 14, 0.02), tubo([lx, 7.0, lz], [lx, H - 0.3, lz], 0.012));
    a.add("luz_panel", CI(lx, 6.8, lz, 0.24, 0.02, "y", 14, 0));
  }
  for (const [x, z] of [[-12, -6], [-4, -6], [4, -6], [12, -6], [-12, 6], [-4, 6], [4, 6], [12, 6]]) a.add("luz_panel", quad([x - 2, H - 0.05, z - 0.45], [x + 2, H - 0.05, z - 0.45], [x + 2, H - 0.05, z + 0.45], [x - 2, H - 0.05, z + 0.45], [0, -1, 0]));
  // Ductos de ventilación con soportes
  a.add("chapa_techo", CI(0, 7.6, -7.2, 0.42, X1 - X0 - 1.0, "x", 20, 0.01), CI(-9, 7.6, -3.5, 0.28, 7.4, "z", 16, 0.01), CI(9, 7.6, -3.5, 0.28, 7.4, "z", 16, 0.01));
  for (let x = -14; x <= 14; x += 4) a.add("estructura_gris", tubo([x, 7.2, -7.2], [x, H - 0.2, -7.2], 0.015));
  return a.partes(OPC_ENTORNO);
}

// ═════════════════════════ RECEPCIÓN ═════════════════════════
export function entornoRecepcion() {
  const a = new Acum();
  const rnd = crearRnd(11);
  // Foso: muros de contención de hormigón con contrafuertes y piso
  a.add("hormigon", B(-14.7, 1.4, 0, 0.4, 2.8, 7.6), B(-11.2, 1.2, -3.7, 7.2, 2.4, 0.4), B(-11.2, 1.2, 3.7, 7.2, 2.4, 0.4));
  for (let x = -13.6; x <= -8.4; x += 1.8) a.add("hormigon_claro", B(x, 1.2, -3.95, 0.4, 2.4, 0.3), B(x, 1.2, 3.95, 0.4, 2.4, 0.3));
  a.add("hormigon_claro", B(-7.7, 0.3, -2.6, 0.4, 0.6, 2.1), B(-7.7, 0.3, 2.6, 0.4, 0.6, 2.1));
  a.add("hormigon", suelo(-14.5, -3.5, -7.5, 3.5, 0.006));
  // Barandas amarillas sobre los muros del foso
  a.mezclar(barandal(-14.7, -3.7, -7.0, -3.7, 2.4, 0.9));
  a.mezclar(barandal(-14.7, 3.7, -7.0, 3.7, 2.4, 0.9));
  // Montículo de residuos mezclados + elementos individuales
  const mont = torno(Array.from({ length: 13 }, (_, i) => { const r = 1 - i / 12; return [r, 0.9 * Math.pow(Math.max(0, 1 - r * r), 0.75)]; }), 24);
  mont.pos = mont.pos.map((v, i) => (i % 3 === 0 ? v * 3.1 : i % 3 === 2 ? v * 3.2 : v));
  mover(mont, -11.3, 0.02, 0);
  a.add("res_base", mont);
  a.mezclar(pila(rnd, { cx: -11.3, cz: 0, rx: 3.0, rz: 3.1, h: 2.0, y0: 0.05, n: 640, escala: 1.35, nBolsas: 170 }));
  // Banda inclinada de alimentación: del foso hasta la boca de la tolva
  const A = [-12.8, 0.55], Bp = [-3.7, 2.58];
  const pend = (Bp[1] - A[1]) / (Bp[0] - A[0]);
  const yEn = (x) => A[1] + pend * (x - A[0]);
  a.add("banda_goma", barra([A[0], A[1], 0], [Bp[0], Bp[1], 0], 0.95, 0.08));
  for (const sg of [-1, 1]) a.add("acero", barra([A[0], A[1] + 0.14, sg * 0.5], [Bp[0], Bp[1] + 0.14, sg * 0.5], 0.04, 0.28));
  const tacos = [];
  for (let x = A[0] + 0.5; x < Bp[0] - 0.2; x += 0.6) tacos.push(B(x, yEn(x) + 0.07, 0, 0.05, 0.1, 0.85));
  a.add("goma", tacos);
  a.add("acero", CI(A[0], A[1] - 0.02, 0, 0.16, 1.0, "z", 18, 0.01), CI(Bp[0], Bp[1] - 0.02, 0, 0.16, 1.0, "z", 18, 0.01));
  const patas = [];
  for (let x = -12.0; x < Bp[0] - 0.3; x += 1.7) {
    const y = yEn(x) - 0.18;
    for (const sg of [-1, 1]) patas.push(B(x, y / 2, sg * 0.56, 0.09, y, 0.09), B(x, 0.05, sg * 0.56, 0.3, 0.1, 0.3));
    patas.push(B(x, y - 0.05, 0, 0.07, 0.08, 1.2));
  }
  a.add("acero_oscuro", patas);
  a.add("acento_ambar", CR(Bp[0] + 0.4, Bp[1] + 0.05, 0.75, 0.5, 0.4, 0.4, 0.05, 1));   // motorreductor del cabezal
  a.add("acero_oscuro", CR(Bp[0] - 0.05, Bp[1] + 0.45, 0, 0.6, 0.05, 1.1, 0.01, 1));
  // Montacargas con tarima de pacas junto al foso
  a.mezclar(montacargas(-9.6, 6.9, -0.6));
  a.mezclar(tarima(-6.6, 7.4, 0.3));
  a.mezclar(paca(-6.6, 0.17, 7.4, 1.0, 0.65, 0.8, "paca_pet", 0.3));
  a.mezclar(paca(-6.6, 0.82, 7.4, 1.0, 0.65, 0.8, "paca_pet", 0.3));
  huella("foso", -15.0, -7.4, -4.0, 4.0);
  huella("montacargas", -11.0, -8.0, 5.7, 8.1);
  huella("tarima-fosa", -7.3, -5.9, 6.7, 8.1);
  return a.partes(OPC_ENTORNO);
}

// ═════════════════════════ SALIDA ═════════════════════════
export function entornoSalida() {
  const a = new Acum();
  const bx = 9.0, bz = -1.2;
  // Empacadora horizontal: cámara de compactación, tolva, cilindro hidráulico, grupo motriz y armario de control
  const camara = [CR(bx, 0.9, bz, 4.4, 1.2, 1.4, 0.06, 2)];
  const tolva = loftRect([{ y: 1.5, w: 1.3, d: 1.2, r: 0.06 }, { y: 2.4, w: 2.2, d: 1.6, r: 0.1 }], { espesor: 0.014, arc: 4, cx: bx - 0.7, cz: bz });
  a.add("blanco", camara, tolva, aroRect(2.28, 1.68, 0.14, 2.4, 0.02, { cx: bx - 0.7, cz: bz }));
  a.add("acento_azul", CR(bx, 1.52, bz, 4.5, 0.09, 1.45, 0.03, 1), CR(bx + 2.3, 0.9, bz, 0.12, 1.2, 1.46, 0.03, 1));
  a.add("acero", CI(bx + 3.2, 0.9, bz, 0.07, 1.6, "x", 16, 0.005), CI(bx + 2.52, 0.9, bz, 0.18, 0.7, "x", 20, 0.01));
  a.add("acero_oscuro", CR(bx + 0.6, 0.2, bz, 4.6, 0.3, 1.6, 0.04, 1), CR(bx - 0.4, 0.62, bz + 1.15, 1.2, 0.9, 0.7, 0.05, 1), CI(bx - 0.4, 1.17, bz + 1.15, 0.12, 0.2, "y", 12, 0.01));
  a.add("acento_ambar", CR(bx - 2.5, 0.95, bz + 0.9, 0.5, 1.9, 0.7, 0.05, 1));
  a.add("lente", CR(bx - 2.5 + 0.255, 1.3, bz + 0.9, 0.02, 0.3, 0.4, 0.01, 1));
  a.add("luz_verde", CR(bx - 2.5 + 0.255, 1.05, bz + 0.9, 0.02, 0.06, 0.34, 0.01, 1));
  a.add("pintura_peligro", CR(bx, 0.34, bz + 0.705, 4.4, 0.14, 0.012, 0.004, 1), CR(bx, 0.34, bz - 0.705, 4.4, 0.14, 0.012, 0.004, 1));
  a.add("acero", CR(bx + 3.9, 0.55, bz, 1.3, 0.08, 1.1, 0.02, 1), CR(bx + 3.4, 0.30, bz, 0.08, 0.5, 1.0, 0.02, 1));
  // Vallado de seguridad de la zona de empaque
  a.mezclar(barandal(6.0, 2.2, 12.2, 2.2, 0, 1.05, "amarillo_seg", 1.5));
  a.mezclar(barandal(6.0, 2.2, 6.0, -3.0, 0, 1.05, "amarillo_seg", 1.5));
  a.mezclar(barandal(6.0, -3.0, 12.2, -3.0, 0, 1.05, "amarillo_seg", 1.5));
  // Pacas prensadas en tarimas (plástico, aluminio, cartón)
  const pilas = [[14.0, -3.3, "paca_pet"], [14.0, -1.7, "paca_alu"], [14.0, -0.1, "paca_carton"]];
  pilas.forEach(([x, z, m], i) => {
    a.mezclar(tarima(x, z, PI / 2));
    for (let k = 0; k < 4 - (i === 1 ? 1 : 0); k++) a.mezclar(paca(x, 0.17 + k * 0.66, z, 0.8, 0.64, 1.0, m, PI / 2 + (k % 2) * 0.04));
  });
  // Bolsas grandes de vidrio triturado
  for (const [x, z] of [[12.9, 1.0], [14.1, 1.0]]) a.mezclar(bigBag(x, z, 0.1 * x));
  huella("empacadora", 6.0, 12.4, -3.1, 0.9);
  huella("pacas", 13.4, 14.6, -3.9, 0.5);
  huella("bigbags", 12.4, 14.6, 0.5, 1.5);
  return a.partes(OPC_ENTORNO);
}

// ═════════════════════════ PATIO DE ACOPIO ═════════════════════════
export function entornoPatio() {
  const a = new Acum();
  const rnd = crearRnd(23);
  // Contenedores roll-off (verde = vidrio, azul = plástico, gris = aluminio) con carga
  const ro = [[-10.2, "cont_verde"], [-3.8, "cont_azul"], [2.6, "cont_gris"]];
  ro.forEach(([x, m], i) => {
    a.mezclar(rolloff(x, -8.5, m));
    a.mezclar(pila(rnd, { cx: x, cz: -8.5, rx: 2.5, rz: 0.9, h: 0.5, y0: 1.75, n: 80, escala: 1.35, nBolsas: 22, mezcla: i === 0 ? [0.05, 0.05, 0.9] : i === 1 ? [0.9, 0.05, 0.05] : [0.05, 0.9, 0.05] }));
    huella(`rolloff-${i + 1}`, x - 3.05, x + 3.05, -9.75, -7.25);
  });
  // Botes de ruedas por color (tapa cerrada) en tres grupos
  const colores = ["cont_azul", "cont_gris", "cont_verde", "cont_negro"];
  const grupo = (x0, z, n, giro = 0, paso = 0.7) => { for (let i = 0; i < n; i++) a.mezclar(boteRuedas(x0 + i * paso, z, giro + (rnd() - 0.5) * 0.12, colores[i % 4])); };
  grupo(-12.8, -5.6, 8);
  huella("botes-A", -13.2, -7.6, -6.1, -5.0);
  grupo(7.0, -5.6, 6);
  huella("botes-B", 6.6, 10.9, -6.1, -5.0);
  grupo(-14.9, 8.6, 4, PI);
  huella("botes-C", -15.4, -12.5, 8.1, 9.2);
  // Tarimas con cajas de cartón y bolsas grandes bajo el entresuelo
  for (const [x, z] of [[11.0, -8.9], [12.2, -8.9], [13.4, -8.9], [14.6, -8.9]]) { a.mezclar(bigBag(x, z, 0.2 * x)); a.mezclar(pila(rnd, { cx: x, cz: z, rx: 0.3, rz: 0.3, h: 0.12, y0: 1.06, n: 8 })); }
  for (const [x, z] of [[11.0, -7.5], [12.4, -7.5]]) { a.mezclar(tarima(x, z, 0.2)); for (let k = 0; k < 3; k++) a.add("carton", colocar([CR(0, 0.2 + k * 0.42, 0, 0.9, 0.4, 0.8, 0.02, 1)], x, 0.1, z, 0.2 + k * 0.05)); }
  huella("bajo-entresuelo", 10.3, 15.3, -9.7, -6.8);
  // Estantería metálica sobre el muro derecho con tarimas y cajas
  const zs = [4.0, 6.4, 8.8];
  for (const z of zs) {
    for (const dz of [-1.1, 1.1]) a.add("estructura", B(15.0, 2.3, z + dz, 0.1, 4.6, 0.1));
    for (const y of [0.35, 1.9, 3.45]) a.add("amarillo_seg", B(15.0, y, z, 0.1, 0.12, 2.3), B(15.0 + 0.28, y, z, 0.05, 0.04, 2.3), B(15.0 - 0.28, y, z, 0.05, 0.04, 2.3));
    for (const y of [0.41, 1.96, 3.51]) a.add("madera", B(15.0, y, z, 0.9, 0.025, 2.2));
  }
  for (const [z, y, tipo] of [[4.0, 0.42, "carton"], [4.0, 1.97, "bolsa_blanca"], [6.4, 0.42, "carton"], [6.4, 3.52, "carton"], [8.8, 1.97, "carton"], [8.8, 3.52, "bolsa_blanca"], [8.8, 0.42, "carton"]]) {
    for (const dz of [-0.55, 0.55]) a.add(tipo, CR(15.0, y + 0.3, z + dz, 0.7, 0.55, 0.8, 0.03, 1));
  }
  huella("estanteria", 14.5, 15.5, 2.8, 10.0);
  // Entresuelo con cabina de control: plataforma, columnas, escalera y barandales
  const px0 = 10.2, px1 = 15.4, pz0 = -9.7, pz1 = -6.6, py = 3.05;
  a.add("estructura_gris", B((px0 + px1) / 2, py, (pz0 + pz1) / 2, px1 - px0, 0.16, pz1 - pz0), B((px0 + px1) / 2, py - 0.2, pz1 - 0.1, px1 - px0, 0.25, 0.12));
  for (const [x, z] of [[px0 + 0.1, pz1 - 0.1], [px1 - 0.1, pz1 - 0.1], [(px0 + px1) / 2, pz1 - 0.1]]) a.add("estructura", B(x, py / 2, z, 0.2, py, 0.2), B(x, 0.05, z, 0.5, 0.1, 0.5));
  a.mezclar(barandal(px0, pz1, px1, pz1, py + 0.08, 1.05));
  a.mezclar(barandal(px0, pz1, px0, -8.3 + 0.55, py + 0.08, 1.05));
  // Escalera (16 peldaños + zancas) subiendo hacia +X desde z = -8.3
  const nP = 16, h = py / nP, run = 0.275, xs0 = px0 - nP * run;
  for (let i = 0; i < nP; i++) a.add("acero", B(xs0 + (i + 0.5) * run, (i + 1) * h - 0.02, -8.3, run, 0.04, 0.95));
  for (const sg of [-1, 1]) {
    a.add("estructura", barra([xs0, 0.1, -8.3 + sg * 0.5], [px0, py - 0.1, -8.3 + sg * 0.5], 0.05, 0.28));
    a.add("amarillo_seg", barra([xs0, 1.05, -8.3 + sg * 0.5], [px0, py + 1.0, -8.3 + sg * 0.5], 0.045, 0.05));
  }
  huella("escalera", xs0, px0, -8.9, -7.7);
  // Cabina de control: muros con ventanal panorámico hacia la línea (+Z), puerta, techo y equipo de clima
  const cx0 = 10.7, cx1 = 15.0, cz0 = -9.6, cz1 = -7.0, cy = py + 0.08;
  a.add("blanco", B((cx0 + cx1) / 2, cy + 0.45, cz1, cx1 - cx0, 0.9, 0.1), B((cx0 + cx1) / 2, cy + 2.45, cz1, cx1 - cx0, 0.3, 0.1),
    B(cx0, cy + 1.3, cz1, 0.1, 2.6, 0.1), B(cx1, cy + 1.3, cz1, 0.1, 2.6, 0.1), B(cx0, cy + 1.3, (cz0 + cz1) / 2, 0.1, 2.6, cz1 - cz0), B(cx1, cy + 1.3, (cz0 + cz1) / 2, 0.1, 2.6, cz1 - cz0),
    B((cx0 + cx1) / 2, cy + 1.3, cz0, cx1 - cx0, 2.6, 0.1), B((cx0 + cx1) / 2, cy + 2.65, (cz0 + cz1) / 2, cx1 - cx0 + 0.2, 0.12, cz1 - cz0 + 0.2));
  a.add("cristal_ventana", quad([cx0, cy + 0.9, cz1 + 0.02], [cx1, cy + 0.9, cz1 + 0.02], [cx1, cy + 2.3, cz1 + 0.02], [cx0, cy + 2.3, cz1 + 0.02], [0, 0, 1]));
  for (let x = cx0 + 1.07; x < cx1; x += 1.07) a.add("acero_oscuro", B(x, cy + 1.6, cz1 + 0.05, 0.06, 1.4, 0.06));
  a.add("acero_oscuro", B((cx0 + cx1) / 2, cy + 0.9, cz1 + 0.05, cx1 - cx0, 0.06, 0.08), B((cx0 + cx1) / 2, cy + 2.3, cz1 + 0.05, cx1 - cx0, 0.06, 0.08));
  a.add("acento_azul", B((cx0 + cx1) / 2, cy + 0.9, cz1 + 0.06, 1.6, 0.04, 0.04));
  a.add("acero", CR(13.4, cy + 2.95, -8.3, 1.1, 0.4, 0.8, 0.05, 1), CI(13.0, cy + 3.17, -8.3, 0.18, 0.04, "y", 16, 0.005));
  a.add("luz_verde", CR(cx0 + 0.35, cy + 2.3, cz1 + 0.07, 0.3, 0.06, 0.03, 0.01, 1));
  return a.partes(OPC_ENTORNO);
}
