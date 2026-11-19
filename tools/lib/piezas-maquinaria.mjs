// tools/lib/piezas-maquinaria.mjs
// Maquinaria de la línea de clasificación. Convención: el flujo corre sobre el eje X (+X); la superficie
// superior de la banda queda en y = 0.815 m y su ancho útil es 0.56 m (eje Z).
//
// NOMBRES QUE USA EL CÓDIGO (src/engine3d/sceneController.js) — no cambiar:
//   banda:      motor, rodillo_inicio, rodillo_fin, rodillo_soporte_*
//   separador:  tambor_magnetico, aspas_tambor, luz_estado
//   escaner:    boquilla_*, luz_estado
//   desviador:  compuerta_pivote, luz_estado
// Los nodos animados conservan su pivote (rodillos y tambores giran sobre su centro; las boquillas
// crecen hacia abajo desde su base; la compuerta gira sobre su bisagra).

import {
  nuevaGeo, cajaRedonda as CR, cilindro as CI, hexagono, torno, curva, loftRect, aroRect,
  mover, escalar, ejeA, rotarX, rotarY, rotarZ, unir,
} from "./geometria.mjs";

const PI = Math.PI;
export const ALTURA_BANDA = 0.815;

// ───────────── Componentes reutilizables ─────────────
// Pata de tubo cuadrado con placa de anclaje, nivelador y 4 tornillos.
function pata(x, z, alto, lado = 0.06) {
  const tubo = CR(x, 0.012 + (alto - 0.012) / 2, z, lado, alto - 0.012, lado, 0.009, 2);
  const placa = CR(x, 0.006, z, 0.15, 0.012, 0.15, 0.004, 1);
  const tornillos = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => hexagono(x + a * 0.055, 0.015, z + b * 0.055, 0.0075, 0.007));
  const nivelador = hexagono(x, 0.02, z, 0.024, 0.016);
  return { tubo, base: unir(placa, nivelador, ...tornillos) };
}

// Baliza luminosa: domo emisivo (luz_estado) + base metálica.
function baliza(x, y, z) {
  const domo = torno([[0, 0], [0.040, 0], [0.041, 0.010], [0.037, 0.026], [0.026, 0.040], [0.012, 0.048], [0, 0.050]], 28);
  const base = unir(CI(x, y - 0.010, z, 0.050, 0.020, "y", 28, 0.003), CI(x, y + 0.002, z, 0.044, 0.006, "y", 28, 0.001));
  return { domo: mover(domo, x, y, z), base };
}

// Poste de pórtico con placa de anclaje.
function posteConPlaca(x, z, alto, lado = 0.1) {
  const tubo = CR(x, alto / 2 + 0.01, z, lado, alto - 0.02, lado, 0.012, 2);
  const placa = CR(x, 0.007, z, 0.2, 0.014, 0.2, 0.005, 1);
  const tornillos = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => hexagono(x + a * 0.075, 0.017, z + b * 0.075, 0.009, 0.008));
  return { tubo, base: unir(placa, ...tornillos) };
}

// ═════════════════════════ BANDA TRANSPORTADORA ═════════════════════════
// Lazo cerrado de banda (superficie superior, retorno inferior y vueltas en los rodillos).
function bucleBanda(xA, xB, yC, R, ancho, esp, uvEsc = 1) {
  const g = nuevaGeo();
  const nStr = Math.max(4, Math.ceil((xB - xA) / 0.25)), nArc = 14;
  const pts = [], nrm = [];
  for (let i = 0; i <= nStr; i++) { pts.push([xA + ((xB - xA) * i) / nStr, yC + R]); nrm.push([0, 1]); }
  for (let k = 1; k < nArc; k++) { const a = PI / 2 - (PI * k) / nArc; pts.push([xB + R * Math.cos(a), yC + R * Math.sin(a)]); nrm.push([Math.cos(a), Math.sin(a)]); }
  for (let i = 0; i <= nStr; i++) { pts.push([xB - ((xB - xA) * i) / nStr, yC - R]); nrm.push([0, -1]); }
  for (let k = 1; k < nArc; k++) { const a = -PI / 2 - (PI * k) / nArc; pts.push([xA + R * Math.cos(a), yC + R * Math.sin(a)]); nrm.push([Math.cos(a), Math.sin(a)]); }
  const n = pts.length;
  const s = [0];
  for (let i = 1; i <= n; i++) s.push(s[i - 1] + Math.hypot(pts[i % n][0] - pts[i - 1][0], pts[i % n][1] - pts[i - 1][1]));
  const w2 = ancho / 2;
  const vert = (p, nn, z, sgn, u, v, hint) => {
    g.pos.push(p[0] - nn[0] * (sgn ? esp : 0), p[1] - nn[1] * (sgn ? esp : 0), z);
    g.nor.push(...hint); g.uv.push(u * uvEsc, v * uvEsc);
    return g.pos.length / 3 - 1;
  };
  const franja = (zA, zB, interior, hintFn) => {
    const A = [], B = [];
    for (let i = 0; i <= n; i++) {
      const p = pts[i % n], nn = nrm[i % n];
      A.push(vert(p, nn, zA, interior, s[i], zA + w2, hintFn(nn)));
      B.push(vert(p, nn, zB, interior, s[i], zB + w2, hintFn(nn)));
    }
    for (let i = 0; i < n; i++) g.idx.push(A[i], A[i + 1], B[i + 1], A[i], B[i + 1], B[i]);
  };
  franja(-w2, w2, false, (nn) => [nn[0], nn[1], 0]);   // cara exterior
  franja(-w2, w2, true, (nn) => [-nn[0], -nn[1], 0]);  // cara interior
  // cantos laterales
  for (const z of [-w2, w2]) {
    const A = [], B = [];
    for (let i = 0; i <= n; i++) {
      const p = pts[i % n], nn = nrm[i % n];
      A.push(vert(p, nn, z, false, s[i], 0, [0, 0, Math.sign(z)]));
      B.push(vert(p, nn, z, true, s[i], 0.01, [0, 0, Math.sign(z)]));
    }
    for (let i = 0; i < n; i++) g.idx.push(A[i], A[i + 1], B[i + 1], A[i], B[i + 1], B[i]);
  }
  return g;
}

export function bandaTransportadora(largo = 4.0) {
  const p = [];
  const R = 0.0805, esp = 0.008, yC = ALTURA_BANDA - R; // 0.7345
  const xA = -largo / 2 + 0.06, xB = largo / 2 - 0.06;
  const zRiel = 0.335;

  // Rieles laterales en perfil C (alma + alas) — dos nodos
  for (const sg of [-1, 1]) {
    const alma = CR(0, 0.72, sg * zRiel, largo, 0.20, 0.008, 0.003, 2);
    const alaSup = CR(0, 0.816, sg * (zRiel - 0.0245), largo, 0.008, 0.049, 0.003, 2);
    const alaInf = CR(0, 0.624, sg * (zRiel - 0.0245), largo, 0.008, 0.049, 0.003, 2);
    const remates = [-1, 1].map((e) => CR(e * (largo / 2 - 0.004), 0.72, sg * zRiel, 0.008, 0.21, 0.06, 0.003, 1));
    p.push({ nombre: sg < 0 ? "riel_izq" : "riel_der", geo: unir(alma, alaSup, alaInf, ...remates), mat: "acero", uvEsc: 3 });
  }

  // Banda de goma en lazo cerrado
  p.push({ nombre: "banda", geo: bucleBanda(xA, xB, yC, R, 0.56, esp, 5), mat: "banda_goma", pliegue: 60 });

  // Rodillos motriz y de cola: tambor ligeramente bombeado + ejes + bridas
  const perfilTambor = [[0, -0.365], [0.014, -0.365], [0.016, -0.36], [0.016, -0.31], [0.034, -0.31], [0.034, -0.296], [0.0695, -0.296], [0.0715, -0.292],
    [0.0722, -0.20], [0.0725, 0], [0.0722, 0.20], [0.0715, 0.292], [0.0695, 0.296], [0.034, 0.296], [0.034, 0.31], [0.016, 0.31], [0.016, 0.36], [0.014, 0.365], [0, 0.365]];
  for (const [nombre, x] of [["rodillo_inicio", xA], ["rodillo_fin", xB]]) {
    p.push({ nombre, geo: mover(ejeA(torno(perfilTambor, 40), "z"), x, yC, 0), mat: "acero", pliegue: 40 });
  }
  // Rodillos de apoyo: portantes (arriba) y de retorno (abajo). Todos "rodillo_soporte_N" para que giren.
  const rodApoyo = (x, y, r) => mover(ejeA(torno([[0, -0.335], [0.008, -0.335], [0.008, -0.29], [r, -0.286], [r, 0.286], [0.008, 0.29], [0.008, 0.335], [0, 0.335]], 20), "z"), x, y, 0);
  const nPort = Math.max(4, Math.round(largo / 0.65));
  let n = 1;
  for (let i = 0; i < nPort; i++) {
    const x = xA + 0.35 + (i * (xB - xA - 0.7)) / (nPort - 1);
    p.push({ nombre: `rodillo_soporte_${n++}`, geo: rodApoyo(x, ALTURA_BANDA - esp - 0.025, 0.025), mat: "acero_oscuro", pliegue: 40 });
  }
  const nRet = largo > 5 ? 3 : 2;
  for (let i = 0; i < nRet; i++) {
    const x = xA + 0.8 + (i * (xB - xA - 1.6)) / Math.max(1, nRet - 1);
    p.push({ nombre: `rodillo_soporte_${n++}`, geo: rodApoyo(x, yC - R - 0.02, 0.02), mat: "acero_oscuro", pliegue: 40 });
  }

  // Chumaceras (rodamientos) en los cuatro extremos de eje
  const chumaceras = [];
  for (const x of [xA, xB]) for (const sg of [-1, 1]) {
    chumaceras.push(CR(x, yC, sg * 0.364, 0.10, 0.10, 0.05, 0.014, 2));
    chumaceras.push(CR(x, yC - 0.052, sg * 0.364, 0.13, 0.014, 0.06, 0.004, 1));
    chumaceras.push(CI(x, yC, sg * 0.392, 0.026, 0.012, "z", 20, 0.002));
    for (const dx of [-0.05, 0.05]) chumaceras.push(hexagono(x + dx, yC - 0.043, sg * 0.364 + 0, 0.008, 0.01));
  }
  p.push({ nombre: "chumaceras", geo: unir(...chumaceras), mat: "acero_oscuro" });

  // Patas, bases y travesaños
  const nPares = largo > 5 ? Math.ceil(largo / 2.5) + 1 : 2;
  const xs = Array.from({ length: nPares }, (_, i) => -largo / 2 + 0.25 + (i * (largo - 0.5)) / (nPares - 1));
  const bases = [], trav = [];
  let k = 1;
  for (const x of xs) for (const sg of [-1, 1]) {
    const d = pata(x, sg * zRiel, 0.62);
    p.push({ nombre: `pata_${k++}`, geo: d.tubo, mat: "acero_oscuro", uvEsc: 4 });
    bases.push(d.base);
  }
  for (const x of xs) trav.push(CI(x, 0.32, 0, 0.012, 0.61, "z", 14, 0.001));
  for (const sg of [-1, 1]) trav.push(CI((xs[0] + xs.at(-1)) / 2, 0.20, sg * zRiel, 0.012, xs.at(-1) - xs[0] - 0.06, "x", 14, 0.001));
  p.push({ nombre: "patas_base", geo: unir(...bases), mat: "acero" });
  p.push({ nombre: "travesanos", geo: unir(...trav), mat: "acero_oscuro" });

  // Motorreductor lateral (un solo nodo "motor": el código lo oculta en la banda de entrada)
  const mz = 0.60;
  const motor = unir(
    CR(xB, yC, 0.445, 0.13, 0.15, 0.11, 0.022, 2),                       // reductor
    CI(xB, yC, 0.60, 0.07, 0.20, "z", 36, 0.004),                       // carcasa del motor
    ...[0.53, 0.55, 0.57, 0.59, 0.61, 0.63, 0.65, 0.67].map((z) => CI(xB, yC, z, 0.0758, 0.008, "z", 36, 0.002)), // aletas
    mover(ejeA(torno([[0, 0], [0.066, 0], [0.069, 0.012], [0.063, 0.040], [0.042, 0.052], [0, 0.054]], 32), "z"), xB, yC, 0.70), // cubierta de ventilador
    CR(xB, yC + 0.098, 0.58, 0.09, 0.05, 0.09, 0.012, 2),               // caja de bornes
    CR(xB, 0.35, mz, 0.08, 0.64, 0.12, 0.012, 2),                // bancada
    CR(xB, 0.006, mz, 0.16, 0.012, 0.20, 0.004, 1),
  );
  p.push({ nombre: "motor", geo: motor, mat: "acero_oscuro", uvEsc: 3 });
  return p;
}

// ═════════════════════════ TOLVA DE ALIMENTACIÓN ═════════════════════════
export function tolvaAlimentacion() {
  const p = [];
  const ancho = (y) => 0.4 + ((y - 1.1) / 0.9) * 1.0;
  const rad = (y) => 0.05 + ((y - 1.1) / 0.9) * 0.07;
  const cuerpo = unir(
    loftRect([{ y: 1.10, w: 0.40, d: 0.40, r: 0.05 }, { y: 2.0, w: 1.4, d: 1.4, r: 0.12 }, { y: 2.06, w: 1.4, d: 1.4, r: 0.12 }], { espesor: 0.012, arc: 5, uvEsc: 1 }),
    aroRect(1.43, 1.43, 0.135, 2.06, 0.016),                                             // borde enrollado
    ...[1.42, 1.76].map((y) => aroRect(ancho(y) + 0.024, ancho(y) + 0.024, rad(y) + 0.012, y, 0.011)), // aros de refuerzo
  );
  p.push({ nombre: "tolva_cuerpo", geo: cuerpo, mat: "blanco", uvEsc: 3 });
  const boca = unir(
    loftRect([{ y: 1.10, w: 0.40, d: 0.40, r: 0.05 }, { y: 0.856, w: 0.40, d: 0.40, r: 0.05 }], { espesor: 0.010, arc: 4 }),
    loftRect([{ y: 0.84, w: 0.48, d: 0.48, r: 0.06 }, { y: 0.858, w: 0.48, d: 0.48, r: 0.06 }], { espesor: 0.045, arc: 4 }),
  );
  p.push({ nombre: "tolva_boca", geo: boca, mat: "blanco", uvEsc: 3 });
  // Compuerta de guillotina con manija y pernos de brida
  const pernos = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2 + PI / 8; pernos.push(hexagono(0.225 * Math.cos(a) * 1.0, 0.836, 0.225 * Math.sin(a) * 1.0, 0.009, 0.01)); }
  p.push({
    nombre: "compuerta_salida",
    geo: unir(CR(0, 0.872, 0.06, 0.44, 0.014, 0.58, 0.004, 1), CI(0, 0.872, 0.36, 0.011, 0.20, "x", 14, 0.001),
      CR(-0.09, 0.872, 0.33, 0.014, 0.02, 0.07, 0.004, 1), CR(0.09, 0.872, 0.33, 0.014, 0.02, 0.07, 0.004, 1),
      CR(0, 0.846, -0.255, 0.50, 0.03, 0.025, 0.006, 1), CR(0, 0.846, 0.255, 0.50, 0.03, 0.025, 0.006, 1), ...pernos),
    mat: "acero", uvEsc: 4,
  });
  // Estructura
  const bases = [], trav = [];
  let n = 1;
  for (const x of [-0.45, 0.45]) for (const z of [-0.45, 0.45]) {
    const d = pata(x, z, 1.46);
    p.push({ nombre: `pata_${n++}`, geo: d.tubo, mat: "acero_oscuro", uvEsc: 4 });
    bases.push(d.base);
  }
  trav.push(aroRect(0.90, 0.90, 0.05, 0.45, 0.016), aroRect(0.90, 0.90, 0.05, 1.42, 0.02));
  for (const sg of [-1, 1]) {
    trav.push(CI(sg * 0.414, 1.42, 0, 0.012, 0.07, "x", 12, 0.001));
    trav.push(CI(0, 1.42, sg * 0.414, 0.012, 0.07, "z", 12, 0.001));
  }
  p.push({ nombre: "patas_base", geo: unir(...bases), mat: "acero" });
  p.push({ nombre: "travesanos", geo: unir(...trav), mat: "acero_oscuro" });
  // Caja de control con conducto
  p.push({
    nombre: "caja_control",
    geo: unir(CR(0.53, 1.0, 0.45, 0.10, 0.24, 0.17, 0.014, 2), CR(0.585, 1.0, 0.45, 0.012, 0.20, 0.13, 0.004, 1)),
    mat: "acento_azul",
  });
  return p;
}

// ═════════════════════════ SEPARADOR DE ALUMINIO (corrientes de Foucault) ═════════════════════════
function cuerpoPortico(alto, zPoste = 0.55) {
  const partes = [], bases = [];
  for (const sg of [-1, 1]) {
    const d = posteConPlaca(0, sg * zPoste, alto);
    partes.push({ nombre: sg < 0 ? "poste_izq" : "poste_der", geo: d.tubo, mat: "acero_oscuro", uvEsc: 3 });
    bases.push(d.base);
  }
  partes.push({ nombre: "postes_base", geo: unir(...bases), mat: "acero" });
  return partes;
}

// Franjas de peligro a ambos lados de una carcasa
function franjasPeligro(y, largoX, zCara, alto = 0.05) {
  return unir(...[-1, 1].map((sg) => CR(0, y, sg * (zCara + 0.001), largoX, alto, 0.004, 0.0015, 1)));
}

// Franja de color (acento) a lo largo de ambas caras de una carcasa
function franjasAcento(y, largoX, zCara, alto = 0.03) {
  return unir(...[-1, 1].map((sg) => CR(0, y, sg * (zCara + 0.002), largoX, alto, 0.005, 0.002, 1)));
}

export function separadorAluminio() {
  const p = cuerpoPortico(1.70);
  // Carcasa biselada con paneles, rejillas de ventilación y asas
  const rejilla = [];
  for (let i = 0; i < 7; i++) rejilla.push(CR(-0.30 + i * 0.1, 1.728, 0.0, 0.05, 0.005, 0.40, 0.002, 1));
  const asas = [];
  for (const sg of [-1, 1]) {
    asas.push(CI(-0.2, 1.55, sg * 0.552, 0.012, 0.012, "z", 10, 0.001), CI(0.2, 1.55, sg * 0.552, 0.012, 0.012, "z", 10, 0.001), CI(0, 1.55, sg * 0.562, 0.01, 0.46, "x", 12, 0.001));
  }
  p.push({
    nombre: "carcasa",
    geo: unir(CR(0, 1.55, 0, 0.90, 0.35, 1.08, 0.035, 3),
      ...[-1, 1].map((sg) => CR(0, 1.57, sg * 0.541, 0.70, 0.22, 0.006, 0.003, 1)), // paneles de acceso
      ...rejilla, ...asas,
      CI(-0.32, 1.745, -0.30, 0.025, 0.02, "y", 14, 0.002), CI(0.32, 1.745, 0.30, 0.025, 0.02, "y", 14, 0.002)), // ojales de izaje
    mat: "blanco", uvEsc: 3,
  });
  p.push({ nombre: "franja_acento", geo: franjasAcento(1.52, 0.88, 0.54), mat: "acento_azul" });
  p.push({ nombre: "franja_peligro", geo: franjasPeligro(1.405, 0.84, 0.54), mat: "pintura_peligro", uvEsc: [4, 4] });
  // Tambor magnético (giro sobre su centro) con eje, bridas y cubiertas
  const perfil = [[0, -0.47], [0.022, -0.47], [0.030, -0.455], [0.030, -0.34], [0.07, -0.34], [0.07, -0.31], [0.19, -0.31], [0.235, -0.30], [0.236, -0.285], [0.222, -0.28],
    [0.22, -0.26], [0.22, 0.26], [0.222, 0.28], [0.236, 0.285], [0.235, 0.30], [0.19, 0.31], [0.07, 0.31], [0.07, 0.34], [0.03, 0.34], [0.03, 0.455], [0.022, 0.47], [0, 0.47]];
  p.push({ nombre: "tambor_magnetico", geo: mover(ejeA(torno(perfil, 48), "z"), 0, 1.2, 0), mat: "acero_oscuro", pliegue: 35 });
  // Segmentos magnéticos (aspas) alrededor del tambor
  const aspas = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * PI * 2;
    aspas.push(mover(rotarZ(CR(0.232, 0, 0, 0.022, 0.044, 0.30, 0.005, 1), a), 0, 1.2, 0));
  }
  p.push({ nombre: "aspas_tambor", geo: unir(...aspas), mat: "acento_coral", pliegue: 60 });
  // Divisor de salida con soportes
  p.push({
    nombre: "divisor",
    geo: unir(CR(0.45, 0.92, 0, 0.50, 0.018, 0.56, 0.006, 1), mover(rotarZ(CR(0, 0, 0, 0.12, 0.012, 0.56, 0.004, 1), 0.45), 0.18, 0.95, 0),
      CR(0.62, 0.93, -0.30, 0.04, 0.09, 0.012, 0.003, 1), CR(0.62, 0.93, 0.30, 0.04, 0.09, 0.012, 0.003, 1)),
    mat: "acero", uvEsc: 4,
  });
  const b = baliza(0, 1.775, 0);
  p.push({ nombre: "luz_estado", geo: b.domo, mat: "luz_verde" });
  p.push({ nombre: "luz_estado_base", geo: b.base, mat: "acero_oscuro" });
  return p;
}

// ═════════════════════════ ESCÁNER ÓPTICO (plástico) ═════════════════════════
export function escanerOptico() {
  const p = cuerpoPortico(1.50);
  p.push({
    nombre: "carcasa_sensores",
    geo: unir(CR(0, 1.42, 0, 0.50, 0.30, 1.08, 0.035, 3),
      ...[-1, 1].map((sg) => CR(0, 1.43, sg * 0.541, 0.36, 0.18, 0.006, 0.003, 1)),
      ...[0, 1, 2, 3, 4].map((i) => CR(-0.16 + i * 0.08, 1.572, 0, 0.04, 0.005, 0.5, 0.002, 1)),
      CR(0, 1.30, 0, 0.30, 0.012, 0.64, 0.004, 1)),
    mat: "blanco", uvEsc: 3,
  });
  p.push({ nombre: "franja_acento", geo: franjasAcento(1.44, 0.48, 0.54), mat: "acento_ambar" });
  p.push({ nombre: "franja_peligro", geo: franjasPeligro(1.30, 0.44, 0.54, 0.045), mat: "pintura_peligro", uvEsc: [4, 4] });
  // Lentes: aro metálico + cristal abombado
  for (const [i, z] of [[1, -0.15], [2, 0.15]]) {
    p.push({ nombre: `lente_aro_${i}`, geo: unir(CI(0, 1.2475, z, 0.055, 0.028, "y", 28, 0.003), hexagono(0.0, 1.232, z + 0.0, 0.058, 0.004)), mat: "acero_oscuro" });
    p.push({ nombre: `lente_${i}`, geo: mover(torno([[0, 0], [0.043, 0], [0.043, 0.002], [0.035, 0.010], [0.02, 0.0155], [0, 0.017]].map(([r, y]) => [r, -y]), 28), 0, 1.2335, z), mat: "lente" });
  }
  // Colector de aire (manifold) con válvulas y tubería hasta el poste
  const brazos = [
    CR(0.175, 0.985, -0.30, 0.38, 0.035, 0.035, 0.008, 1), CR(0.175, 0.985, 0.30, 0.38, 0.035, 0.035, 0.008, 1),
    CI(0, 0.985, 0, 0.018, 1.10, "z", 14, 0.001),
  ];
  p.push({ nombre: "soporte_boquillas", geo: unir(...brazos), mat: "acero_oscuro" });
  const valvulas = [];
  for (let i = 0; i < 4; i++) valvulas.push(CR(0.35, 0.985, -0.21 + i * 0.14, 0.05, 0.05, 0.05, 0.008, 1));
  p.push({
    nombre: "barra_boquillas",
    geo: unir(CI(0.35, 0.95, 0, 0.022, 0.58, "z", 20, 0.002), CI(0.35, 0.95, -0.29, 0.027, 0.012, "z", 20, 0.002), CI(0.35, 0.95, 0.29, 0.027, 0.012, "z", 20, 0.002), ...valvulas),
    mat: "acero", uvEsc: 4,
  });
  // Boquillas: cada nodo ancla en su base (la animación las alarga hacia abajo)
  for (let i = 0; i < 7; i++) {
    const z = -0.24 + i * 0.08;
    const geo = torno([[0, 0], [0.012, 0], [0.012, -0.006], [0.0085, -0.011], [0.0085, -0.024], [0.0055, -0.040], [0, -0.040]], 14);
    p.push({ nombre: `boquilla_${i + 1}`, geo, mat: "acero_oscuro", trasl: [0.35, 0.928, z] });
  }
  const b = baliza(0, 1.62, 0);
  p.push({ nombre: "luz_estado", geo: b.domo, mat: "luz_verde" });
  p.push({ nombre: "luz_estado_base", geo: b.base, mat: "acero_oscuro" });
  return p;
}

// ═════════════════════════ DESVIADOR DE VIDRIO ═════════════════════════
export function desviadorVidrio() {
  const p = cuerpoPortico(1.30);
  p.push({
    nombre: "carcasa_actuador",
    geo: unir(CR(0, 1.22, 0, 0.50, 0.25, 1.08, 0.03, 3),
      ...[-1, 1].map((sg) => CR(0, 1.23, sg * 0.541, 0.34, 0.15, 0.006, 0.003, 1)),
      ...[0, 1, 2, 3].map((i) => CR(-0.12 + i * 0.08, 1.347, 0, 0.04, 0.005, 0.46, 0.002, 1))),
    mat: "blanco", uvEsc: 3,
  });
  p.push({ nombre: "franja_acento", geo: franjasAcento(1.24, 0.48, 0.54), mat: "acento_coral" });
  p.push({ nombre: "franja_peligro", geo: franjasPeligro(1.12, 0.44, 0.54, 0.04), mat: "pintura_peligro", uvEsc: [4, 4] });
  // Cilindro neumático: camisa, tapas, vástago y horquilla
  p.push({
    nombre: "actuador",
    geo: unir(CI(0, 1.04, -0.40, 0.034, 0.10, "y", 24, 0.003), CI(0, 1.095, -0.40, 0.040, 0.012, "y", 24, 0.002), CI(0, 0.99, -0.40, 0.040, 0.012, "y", 24, 0.002),
      CI(0, 0.92, -0.40, 0.009, 0.16, "y", 14, 0.001), CR(0, 0.835, -0.40, 0.036, 0.03, 0.036, 0.006, 1), hexagono(0.0, 1.0, -0.352, 0.01, 0.012, "z")),
    mat: "acero", uvEsc: 4,
  });
  // Compuerta: el nodo está en la bisagra (el código la gira sobre Y); la geometría se extiende hacia +Z
  const refuerzos = [0.1, 0.25, 0.4, 0.5].map((z) => CR(0.014, 0, z, 0.012, 0.16, 0.014, 0.003, 1));
  p.push({
    nombre: "compuerta_pivote",
    geo: unir(CR(0, 0, 0.28, 0.02, 0.20, 0.56, 0.006, 2), CI(0, 0, 0, 0.018, 0.24, "y", 20, 0.002), ...refuerzos,
      CR(0, 0, 0.565, 0.026, 0.20, 0.014, 0.005, 1), CI(0, 0.11, 0, 0.026, 0.012, "y", 20, 0.002), CI(0, -0.11, 0, 0.026, 0.012, "y", 20, 0.002)),
    mat: "acero", trasl: [0, 0.9, -0.28], uvEsc: 4,
  });
  const b = baliza(0, 1.395, 0);
  p.push({ nombre: "luz_estado", geo: b.domo, mat: "luz_verde" });
  p.push({ nombre: "luz_estado_base", geo: b.base, mat: "acero_oscuro" });
  return p;
}

// ═════════════════════════ CONTENEDORES DE SALIDA ═════════════════════════
// El código crea colisionadores de 0.9 × 0.7 × 0.7 m (paredes de 0.05 m): se respetan esas medidas.
export function contenedor(matClave, cartelClave) {
  const [ancho, fondo, alto] = [0.9, 0.7, 0.7];
  const costillas = [];
  for (const x of [-0.3, -0.15, 0, 0.15, 0.3]) for (const sg of [-1, 1]) costillas.push(CR(x, 0.38, sg * (fondo / 2 + 0.003), 0.055, 0.56, 0.012, 0.005, 1));
  for (const z of [-0.2, 0, 0.2]) for (const sg of [-1, 1]) costillas.push(CR(sg * (ancho / 2 + 0.003), 0.38, z, 0.012, 0.56, 0.055, 0.005, 1));
  const cuerpo = unir(
    loftRect([{ y: 0.03, w: ancho, d: fondo, r: 0.05 }, { y: alto, w: ancho, d: fondo, r: 0.05 }], { espesor: 0.04, arc: 5 }),
    ...costillas,
  );
  const p = [
    { nombre: "base", geo: CR(0, 0.02, 0, ancho - 0.01, 0.04, fondo - 0.01, 0.012, 2), mat: matClave, uvEsc: 3 },
    { nombre: "cuerpo", geo: cuerpo, mat: matClave, uvEsc: 3 },
    { nombre: "borde_superior", geo: aroRect(ancho + 0.012, fondo + 0.012, 0.055, alto + 0.002, 0.016), mat: "acero_oscuro" },
  ];
  // Asas laterales
  const asas = [];
  for (const sg of [-1, 1]) {
    asas.push(CI(sg * (ancho / 2 + 0.024), 0.56, -0.12, 0.011, 0.05, "x", 12, 0.001), CI(sg * (ancho / 2 + 0.024), 0.56, 0.12, 0.011, 0.05, "x", 12, 0.001), CI(sg * (ancho / 2 + 0.048), 0.56, 0, 0.012, 0.26, "z", 12, 0.001));
  }
  p.push({ nombre: "asas", geo: unir(...asas), mat: "acero_oscuro" });
  // Cartel con pictograma (marco + cara impresa)
  p.push({ nombre: "cartel_marco", geo: CR(0, 0.40, fondo / 2 + 0.014, 0.38, 0.27, 0.012, 0.01, 2), mat: "acero_oscuro" });
  const q = nuevaGeo();
  const [w, h, z] = [0.35, 0.24, fondo / 2 + 0.0205];
  q.pos.push(-w / 2, 0.40 - h / 2, z, w / 2, 0.40 - h / 2, z, w / 2, 0.40 + h / 2, z, -w / 2, 0.40 + h / 2, z);
  for (let i = 0; i < 4; i++) q.nor.push(0, 0, 1);
  q.uv.push(0, 1, 1, 1, 1, 0, 0, 0);
  q.idx.push(0, 1, 2, 0, 2, 3);
  p.push({ nombre: "cartel", geo: q, mat: cartelClave });
  return p;
}
