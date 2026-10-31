// tools/generar-hdri.mjs
// Genera un mapa de entorno HDRI industrial equirectangular (.hdr en formato Radiance RGBE RLE)
// para iluminación basada en imagen (IBL) fotorrealista sobre aluminio, vidrio y plástico PET.
// JavaScript puro (ES6), cero dependencias externas.

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
  // u in [0, 1) azimut, v in [0, 1) cenit (0 = techo +Y, 1 = piso -Y)
  const theta = u * Math.PI * 2;
  const phi = v * Math.PI;
  const dy = Math.cos(phi); // +1 arriba, -1 abajo

  let r, g, b;
  if (dy >= 0) {
    // Bóveda industrial azul acero con tragaluces cenitales fríos y lámparas de haluro cálidas
    const t = Math.pow(dy, 0.75);
    r = 0.16 + 0.42 * t;
    g = 0.22 + 0.52 * t;
    b = 0.30 + 0.68 * t;

    // Tragaluces longitudinales (franjas de alta radiancia HDR para reflejos especulares en aluminio y vidrio)
    const bandaZ = Math.abs(Math.sin(theta));
    if (dy > 0.58 && bandaZ > 0.55) {
      const k = Math.pow((dy - 0.58) / 0.42, 1.4) * Math.pow((bandaZ - 0.55) / 0.45, 1.2);
      r += 5.2 * k;
      g += 5.8 * k;
      b += 6.6 * k;
    }

    // 4 luminarias industriales puntuales de bahía alta (contraste cálido-frío PBR)
    for (const ang of [0.6, 2.3, 3.9, 5.4]) {
      const dAng = Math.atan2(Math.sin(theta - ang), Math.cos(theta - ang));
      const dPhi = phi - 0.62;
      const dist2 = dAng * dAng + dPhi * dPhi;
      if (dist2 < 0.045) {
        const foco = Math.exp(-dist2 / 0.009) * 8.5;
        r += foco * 1.05;
        g += foco * 0.92;
        b += foco * 0.72;
      }
    }
  } else {
    // Rebote difuso del piso epóxico industrial y muros laterales
    const p = Math.pow(-dy, 0.6);
    r = 0.22 * (1 - 0.45 * p);
    g = 0.27 * (1 - 0.45 * p);
    b = 0.33 * (1 - 0.45 * p);
  }
  return [r, g, b];
}

const header = Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${H} +X ${W}\n`, "ascii");
const partes = [header];

for (let y = 0; y < H; y++) {
  const scanHeader = Buffer.from([2, 2, (W >> 8) & 0xff, W & 0xff]);
  partes.push(scanHeader);
  const canales = [new Uint8Array(W), new Uint8Array(W), new Uint8Array(W), new Uint8Array(W)];
  for (let x = 0; x < W; x++) {
    const [r, g, b] = muestrearNaveIndustrial((x + 0.5) / W, (y + 0.5) / H);
    const rgbe = floatToRgbe(r, g, b);
    canales[0][x] = rgbe[0];
    canales[1][x] = rgbe[1];
    canales[2][x] = rgbe[2];
    canales[3][x] = rgbe[3];
  }
  // Codificación RLE estándar de Radiance en bloques literales de 128 bytes (W = 256 = 2 * 128)
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
console.log(`HDRI generado -> ${ARCHIVO} (${(total.length / 1024).toFixed(1)} KB, ${W}x${H} RGBE)`);
