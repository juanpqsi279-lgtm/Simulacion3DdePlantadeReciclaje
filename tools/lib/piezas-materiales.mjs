// tools/lib/piezas-materiales.mjs
// Piezas a reciclar (plástico PET, aluminio y vidrio) y sus variantes.
// Origen en la base, centrado; eje Y hacia arriba; unidades en metros.
// Todas las variantes caben en el cilindro de colisión de su material (ver PROPIEDADES_FISICAS_MATERIAL en
// src/core/spawner/itemSpawner.js): plástico r ≤ 0.036 / h ≈ 0.214, aluminio r ≤ 0.035 / h ≈ 0.122,
// vidrio r ≤ 0.033 / h ≈ 0.234. Los nombres de nodo se conservan entre variantes.

import { torno, curva, cilindro, escalar, mover, unir } from "./geometria.mjs";

const PI = Math.PI;

// Pared con surcos horizontales (rizado de botella de plástico)
function paredConSurcos(r, yIni, yFin, surcos, prof = 0.0012, ancho = 0.0045) {
  const pts = [[r, yIni]];
  for (const y of surcos) pts.push([r, y - ancho], [r - prof, y], [r, y + ancho]);
  pts.push([r, yFin]);
  return pts;
}

// Fondo petaloide de 5 pies: los puntos con m > 0 se elevan según cos(5θ)
const modPetaloide = (t, m, r, y) => [r, y + m * 0.0050 * (0.5 + 0.5 * Math.cos(5 * t))];
const fondoPetaloide = () => [[0, 0.0095, 0], [0.006, 0.0093, 0.3], [0.013, 0.0075, 0.8], [0.0200, 0.0040, 1], [0.0262, 0.0010, 0.7], [0.0290, 0.0, 0.15]];

// ───────────────────────── Plástico PET ─────────────────────────
// Cuello con anillo de soporte, común a las botellas de 28 mm
const cuelloPET = [[0.0149, 0.1815], [0.0149, 0.1838], [0.0152, 0.1846], [0.0172, 0.1856], [0.0174, 0.1874], [0.0152, 0.1884], [0.0149, 0.1895], [0.0149, 0.1960], [0, 0.1960]];

function tapaEstriada(matTapa) {
  const tapa = torno([
    [0, 0.1940, 0], [0.0166, 0.1940, 1], [0.0171, 0.1955, 1], [0.0171, 0.2105, 1], [0.0167, 0.2126, 0.4], [0.0152, 0.2137, 0], [0.0095, 0.2140, 0], [0, 0.2139, 0],
  ], 108, { mod: (t, m, r, y) => [r * (1 + 0.022 * m * Math.cos(36 * t)), y] });
  const anillo = torno([[0.0149, 0.1890], [0.0161, 0.1892], [0.0163, 0.1932], [0.0149, 0.1936]], 32);
  return [
    { nombre: "botella_pet_tapa", geo: tapa, mat: matTapa, pliegue: 70 },
    { nombre: "botella_pet_anillo", geo: anillo, mat: matTapa },
  ];
}

// Botella de agua 500 ml (original)
export function botellaPlastico() {
  const talon = curva([[0.0290, 0.0, 0], [0.0312, 0.0030, 0], [0.0326, 0.0095, 0], [0.0330, 0.0170, 0]], 3).slice(1);
  const surcos = paredConSurcos(0.0330, 0.0170, 0.0540, [0.0265, 0.0370, 0.0475], 0.0013, 0.0042).slice(1);
  const cintura = curva([[0.0330, 0.0540], [0.0330, 0.1180], [0.0323, 0.1280], [0.0318, 0.1360], [0.0326, 0.1450], [0.0330, 0.1510]], 3).slice(1);
  const hombro = curva([[0.0330, 0.1510], [0.0318, 0.1600], [0.0282, 0.1675], [0.0225, 0.1730], [0.0178, 0.1768], [0.0152, 0.1795]], 4).slice(1);
  const cuerpo = torno([...fondoPetaloide(), ...talon, ...surcos, ...cintura, ...hombro, ...cuelloPET], 40, { mod: modPetaloide });
  const etiqueta = torno([[0.0337, 0.0575], [0.0337, 0.1185]], 40, { vNorm: true });
  return [
    { nombre: "botella_pet_cuerpo", geo: cuerpo, mat: "pet" },
    { nombre: "botella_pet_etiqueta", geo: etiqueta, mat: "etiqueta_pet" },
    ...tapaEstriada("tapa_azul"),
  ];
}

// Botella de refresco 600 ml con cintura marcada (contorno), líquido oscuro, etiqueta roja y tapa roja
export function botellaPlasticoCola() {
  const r = (y) => 0.0334 - 0.0050 * Math.exp(-(((y - 0.092) / 0.020) ** 2)) - 0.0010 * Math.exp(-(((y - 0.040) / 0.012) ** 2));
  const talon = curva([[0.0290, 0.0, 0], [0.0312, 0.0030, 0], [0.0326, 0.0095, 0], [r(0.017), 0.0170, 0]], 3).slice(1);
  const lado = [];
  for (let y = 0.026; y <= 0.150; y += 0.008) lado.push([r(y), y]);
  const hombro = curva([[r(0.150), 0.150], [0.0328, 0.158], [0.0292, 0.167], [0.0230, 0.1735], [0.0180, 0.1772], [0.0152, 0.1798]], 4).slice(1);
  const cuerpo = torno([...fondoPetaloide(), ...talon, ...lado, ...hombro, ...cuelloPET], 40, { mod: modPetaloide });
  const manga = [];
  for (let y = 0.050; y <= 0.128; y += 0.0065) manga.push([r(y) + 0.0005, y]);
  return [
    { nombre: "botella_pet_cuerpo", geo: cuerpo, mat: "pet_cola" },
    { nombre: "botella_pet_etiqueta", geo: torno(manga, 40, { vNorm: true }), mat: "etiqueta_cola" },
    ...tapaEstriada("tapa_roja"),
  ];
}

// Botella deportiva 500 ml con tapa de apertura rápida (pull-cap)
export function botellaPlasticoDeportiva() {
  const talon = curva([[0.0268, 0.0], [0.0285, 0.0030], [0.0298, 0.0095], [0.0305, 0.0170]], 3).slice(1);
  const surcos = paredConSurcos(0.0305, 0.0170, 0.1150, [0.030, 0.045, 0.060, 0.075, 0.090], 0.0011, 0.0040).slice(1);
  const hombro = curva([[0.0305, 0.1150], [0.0298, 0.1250], [0.0262, 0.1380], [0.0225, 0.1480], [0.0205, 0.1545]], 4).slice(1);
  const cuello = [[0.0200, 0.1570], [0.0200, 0.1655], [0.0215, 0.1668], [0.0215, 0.1688], [0.0200, 0.1698], [0.0200, 0.1715], [0, 0.1715]];
  const fondo = [[0, 0.0090, 0], [0.006, 0.0088, 0.3], [0.012, 0.0072, 0.8], [0.018, 0.0042, 1], [0.0240, 0.0012, 0.7], [0.0268, 0.0, 0.15]];
  const cuerpo = torno([...fondo, ...talon, ...surcos, ...hombro, ...cuello], 40, { mod: modPetaloide });
  const tapa = torno([[0, 0.1715, 0], [0.0222, 0.1715], [0.0224, 0.1790], [0.0170, 0.1815], [0.0165, 0.1950], [0.0108, 0.1976], [0.0095, 0.2040], [0.0075, 0.2052], [0, 0.2052]], 36);
  const boquilla = torno([[0.0100, 0.2040], [0.0100, 0.2060], [0.0072, 0.2062], [0.0072, 0.2040]], 20);
  const banda = torno([[0.0308, 0.0500], [0.0308, 0.1000]], 40, { vNorm: true });
  return [
    { nombre: "botella_pet_cuerpo", geo: cuerpo, mat: "pet_azul" },
    { nombre: "botella_pet_etiqueta", geo: banda, mat: "etiqueta_pet" },
    { nombre: "botella_pet_tapa", geo: tapa, mat: "tapa_negra" },
    { nombre: "botella_pet_anillo", geo: boquilla, mat: "tapa_negra" },
  ];
}

// ───────────────────────── Aluminio ─────────────────────────
function perfilesLata(matManga) {
  const fondo = curva([[0, 0.0100], [0.0080, 0.0094], [0.0150, 0.0078], [0.0205, 0.0050], [0.0235, 0.0018], [0.0250, 0.0]], 3);
  const talon = curva([[0.0264, 0.0], [0.0286, 0.0025], [0.0312, 0.0075], [0.0326, 0.0125], [0.0331, 0.0175]], 3);
  const pared = [[0.0331, 0.0500], [0.0330, 0.0880]];
  const cuello = curva([[0.0330, 0.0880], [0.0328, 0.0950], [0.0318, 0.1010], [0.0300, 0.1060], [0.0284, 0.1095], [0.0275, 0.1120]], 4).slice(1);
  const borde = curva([[0.0275, 0.1120], [0.0278, 0.1135], [0.0281, 0.1160], [0.0278, 0.1180], [0.0270, 0.1190], [0.0260, 0.1185]], 3).slice(1);
  const tapa = [[0.0254, 0.1165], [0.0252, 0.1140], [0.0245, 0.1124], [0.0230, 0.1117], [0.0, 0.1122]];
  const cuerpo = torno([...fondo, ...talon, ...pared, ...cuello, ...borde, ...tapa], 40);
  const manga = torno([[0.03345, 0.0150], [0.03352, 0.0500], [0.03343, 0.0890]], 48, { vNorm: true });
  const plato = escalar(cilindro(0, 0, 0, 1, 1, "y", 32, 0.06), 0.0150, 0.0012, 0.0100);
  mover(plato, 0.0040, 0.1130, 0);
  const remache = cilindro(-0.0070, 0.1138, 0, 0.0035, 0.0022, "y", 16, 0.0004);
  const dedal = cilindro(0.0125, 0.1136, 0, 0.0040, 0.0008, "y", 16, 0.0002);
  const cordon = torno(Array.from({ length: 13 }, (_, i) => { const a = (i / 12) * PI * 2; return [0.0271 + Math.cos(a) * 0.0011, 0.1172 + Math.sin(a) * 0.0011]; }), 40);
  return [
    { nombre: "lata_cuerpo", geo: cuerpo, mat: "aluminio" },
    { nombre: "lata_banda", geo: manga, mat: matManga },
    { nombre: "lata_borde", geo: cordon, mat: "aluminio" },
    { nombre: "lata_anilla", geo: unir(plato, remache, dedal), mat: "aluminio" },
  ];
}

// Lata de refresco 355 ml, impresión roja (original)
export const lataAluminio = () => perfilesLata("lata_roja");
// Lata de cerveza 355 ml, impresión dorada
export const lataDorada = () => perfilesLata("lata_dorada");
// Lata esbelta 250 ml (bebida energética), impresión azul
export function lataSlim() {
  return perfilesLata("lata_azul").map((p) => ({ ...p, geo: escalar(p.geo, 0.80, 1.134, 0.80) }));
}

// ───────────────────────── Vidrio ─────────────────────────
// Botella de cuello largo 355 ml. Variantes: verde (original) y ámbar.
export function botellaVidrio(matVidrio = "vidrio_verde", matEtiqueta = "etiqueta_vidrio") {
  const fondo = curva([[0, 0.0070], [0.0060, 0.0066], [0.0120, 0.0052], [0.0185, 0.0025], [0.0235, 0.0005], [0.0252, 0.0]], 3);
  const talon = curva([[0.0268, 0.0], [0.0290, 0.0020], [0.0300, 0.0060], [0.0303, 0.0110]], 3);
  const hombro = curva([[0.0303, 0.0110], [0.0303, 0.1000], [0.0300, 0.1100], [0.0286, 0.1250], [0.0245, 0.1410], [0.0195, 0.1560], [0.0160, 0.1700], [0.0145, 0.1850], [0.0140, 0.2000], [0.0142, 0.2080]], 3).slice(1);
  const boca = curva([[0.0142, 0.2080], [0.0152, 0.2105], [0.0160, 0.2135], [0.0152, 0.2165], [0.0146, 0.2185], [0.0148, 0.2210], [0.0158, 0.2230], [0.0160, 0.2255], [0.0150, 0.2275], [0.0120, 0.2285]], 3).slice(1);
  const cuerpo = torno([...fondo, ...talon, ...hombro, ...boca, [0, 0.2285]], 40);
  const etiqueta = torno([[0.03075, 0.0400], [0.03075, 0.0930]], 40, { vNorm: true });
  const chapa = torno([
    [0, 0.2205, 0], [0.0160, 0.2205, 0], [0.0176, 0.2209, 1], [0.0178, 0.2230, 1], [0.0176, 0.2288, 1], [0.0170, 0.2310, 0.4], [0.0150, 0.2321, 0], [0.0080, 0.2325, 0], [0, 0.2325, 0],
  ], 84, { mod: (t, m, r, y) => [r * (1 + 0.04 * m * (1 - 2 * Math.abs(Math.cos(10.5 * t)))), y] });
  return [
    { nombre: "botella_vidrio_cuerpo", geo: cuerpo, mat: matVidrio },
    { nombre: "botella_vidrio_etiqueta", geo: etiqueta, mat: matEtiqueta },
    { nombre: "botella_vidrio_chapa", geo: chapa, mat: "chapa", pliegue: 75 },
  ];
}
export const botellaVidrioAmbar = () => botellaVidrio("vidrio_ambar", "etiqueta_ambar");

// Frasco de conservas 380 ml con tapa metálica estriada
export function frascoVidrio() {
  const fondo = curva([[0, 0.0045], [0.014, 0.0040], [0.026, 0.0020], [0.032, 0.0005], [0.0345, 0.0], [0.0355, 0.0015], [0.0360, 0.0060]], 3);
  const hombro = curva([[0.0360, 0.0060], [0.0361, 0.0700], [0.0358, 0.0760], [0.0340, 0.0820], [0.0300, 0.0865], [0.0262, 0.0890]], 3).slice(1);
  const cuello = [[0.0258, 0.0900], [0.0262, 0.0925], [0.0270, 0.0935], [0.0270, 0.0950], [0.0258, 0.0960], [0, 0.0960]];
  const cuerpo = torno([...fondo, ...hombro, ...cuello], 44);
  const etiqueta = torno([[0.03625, 0.0200], [0.03625, 0.0620]], 44, { vNorm: true });
  const tapa = torno([
    [0, 0.0928, 0], [0.0288, 0.0928, 1], [0.0292, 0.0935, 1], [0.0292, 0.1005, 1], [0.0285, 0.1015, 0.3], [0.0262, 0.1020, 0], [0, 0.1020, 0],
  ], 120, { mod: (t, m, r, y) => [r * (1 + 0.03 * m * Math.cos(40 * t)), y] });
  return [
    { nombre: "botella_vidrio_cuerpo", geo: cuerpo, mat: "vidrio_claro" },
    { nombre: "botella_vidrio_etiqueta", geo: etiqueta, mat: "etiqueta_vidrio" },
    { nombre: "botella_vidrio_chapa", geo: tapa, mat: "tapa_metal", pliegue: 75 },
  ];
}
