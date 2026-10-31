// tools/generar-hdri.mjs
// Genera un mapa de entorno HDRI industrial de alto contraste (.hdr Radiance RGBE RLE)
// diseñado para que el aluminio (metallic = 1.0), el vidrio refractivo y el plástico PBR
// muestren reflejos especulares definidos, volumen tridimensional y cero apariencia plana.

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const CARPETA = join(AQUI, "..", "public", "assets", "environment");
const ARCHIVO = join(CARPETA, "planta_industrial.hdr");

const W = 256;
const H = 128;

function floatToRgbe(r, g, b) {
  const max = Math.max(r, g, b);
  if (max < 1e-32) return [0, 0, 0, 0];
  const exp = Math.ceil(Math.log2(max));
  const scale = Math.pow(2, -exp) * 256;
  return [
    Math.min(255, Math.max(0, Math.floor(r * scale))),
    Math.min(255, Math.max(0, Math.floor(g * scale))),
    Math.min(255, Math.max(0, Math.floor(b * scale))),
    exp + 128,
  ];
}

function muestrearNaveIndustrial(u, v) {
  const theta = u * Math.PI * 2;
  const phi = v * Math.PI;
  const dy = Math.cos(phi);
  const dx = Math.sin(phi) * Math.cos(theta);
  const dz = Math.sin(phi) * Math.sin(theta);

  let r, g, b;
  if (dy >= 0) {
    // Estructura oscura de cerchas metálicas en el techo (alto contraste para reflejos en aluminio 100% metálico)
    const cercha = Math.abs(Math.sin(theta * 6)) < 0.18 ? 0.35 : 1.0;
    const grad = Math.pow(dy, 0.85);
    r = (0.07 + 0.22 * grad) * cercha;
    g = (0.11 + 0.30 * grad) * cercha;
    b = (0.17 + 0.42 * grad) * cercha;

    // 3 franjas de tragaluces LED industriales de alta radiancia (crean brillos nítidos en vidrio y PET)
    const franja = Math.sin(dx * 5.5);
    if (dy > 0.42 && franja > 0.62) {
      const intensidad = Math.pow((franja - 0.62) / 0.38, 1.5) * Math.pow((dy - 0.42) / 0.58, 0.8) * 9.5;
      r += intensidad * 0.92;
      g += intensidad * 0.98;
      b += intensidad * 1.08;
    }

    // Ventanales laterales fríos y luminarias cálidas opuestas para volumen bicolor (rim light PBR)
    if (dy > 0.08 && dy < 0.48 && dz > 0.65) {
      const ventanal = Math.pow((dz - 0.65) / 0.35, 1.4) * 4.8;
      r += ventanal * 0.78;
      g += ventanal * 0.92;
      b += ventanal * 1.15;
    }
    for (const ang of [0.8, 2.4, 4.0, 5.5]) {
      const dAng = Math.atan2(Math.sin(theta - ang), Math.cos(theta - ang));
      const dPhi = phi - 0.82;
      const dist2 = dAng * dAng + dPhi * dPhi;
      if (dist2 < 0.035) {
        const foco = Math.exp(-dist2 / 0.007) * 11.0;
        r += foco * 1.12;
        g += foco * 0.88;
        b += foco * 0.62;
      }
    }
  } else {
    // Piso epóxico oscuro con rebote sutil de horizonte para preservar sombras de contacto en la base
    const horiz = Math.pow(1 + dy, 3.0);
    r = 0.04 + 0.16 * horiz;
    g = 0.06 + 0.20 * horiz;
    b = 0.09 + 0.25 * horiz;
  }
  return [r, g, b];
}

const header = Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${H} +X ${W}\n`, "ascii");
const partes = [header];

for (let y = 0; y < H; y++) {
  partes.push(Buffer.from([2, 2, (W >> 8) & 0xff, W & 0xff]));
  const canales = [new Uint8Array(W), new Uint8Array(W), new Uint8Array(W), new Uint8Array(W)];
  for (let x = 0; x < W; x++) {
    const [r, g, b] = muestrearNaveIndustrial((x + 0.5) / W, (y + 0.5) / H);
    const rgbe = floatToRgbe(r, g, b);
    canales[0][x] = rgbe[0];
    canales[1][x] = rgbe[1];
    canales[2][x] = rgbe[2];
    canales[3][x] = rgbe[3];
  }
  for (let c = 0; c < 4; c++) {
    for (let offset = 0; offset < W; offset += 128) {
      const len = Math.min(128, W - offset);
      partes.push(Buffer.from([len]));
      partes.push(Buffer.from(canales[c].subarray(offset, offset + len)));
    }
  }
}

mkdirSync(CARPETA, { recursive: true });
const total = Buffer.concat(partes);
writeFileSync(ARCHIVO, total);
console.log(`HDRI de alto contraste generado -> ${ARCHIVO} (${(total.length / 1024).toFixed(1)} KB)`);
