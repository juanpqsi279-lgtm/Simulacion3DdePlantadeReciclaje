// tools/generar-iconos.mjs
// Genera los gráficos vectoriales de la interfaz en formato SVG (JavaScript puro, sin dependencias).
//   - public/assets/ui/icons/<nombre>.svg : un archivo por ícono (cuadrícula 24x24, trazo con currentColor)
//   - public/assets/ui/sprite.svg         : todos los íconos como <symbol> para usar con <use>
//   - public/assets/ui/logo.svg           : logotipo de la planta (colores fijos)
// Uso: node tools/generar-iconos.mjs [carpeta_ui]

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const UI = process.argv[2] ?? join(AQUI, "..", "public", "assets", "ui");

// Fuente única de los íconos: id → { titulo, cuerpo }. Estilo de contorno, 24x24.
const ICONOS = {
  plastico: { titulo: "Plástico", cuerpo: `<path d="M10 2h4v3l2 3v12a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8l2-3V2z"/><line x1="8" y1="12" x2="16" y2="12"/>` },
  aluminio: { titulo: "Aluminio", cuerpo: `<path d="M7 5c0-1.1 2.2-2 5-2s5 .9 5 2v14c0 1.1-2.2 2-5 2s-5-.9-5-2V5z"/><path d="M7 5c0 1.1 2.2 2 5 2s5-.9 5-2"/>` },
  vidrio: { titulo: "Vidrio", cuerpo: `<path d="M10 2h4v6l2.5 3.5V20a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v-8.5L10 8V2z"/><line x1="10" y1="5" x2="14" y2="5"/>` },
  play: { titulo: "Iniciar", cuerpo: `<polygon points="6 4 20 12 6 20 6 4"/>` },
  pausa: { titulo: "Pausar", cuerpo: `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>` },
  reiniciar: { titulo: "Reiniciar", cuerpo: `<path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 10 9 10"/>` },
  velocidad: { titulo: "Velocidad", cuerpo: `<path d="M4 18a9 9 0 1 1 16 0"/><line x1="12" y1="14" x2="16" y2="9"/><circle cx="12" cy="14" r="1.5"/>` },
  banda: { titulo: "Banda transportadora", cuerpo: `<rect x="2" y="13" width="20" height="6" rx="3"/><circle cx="6" cy="16" r="1"/><circle cx="18" cy="16" r="1"/><rect x="9" y="7" width="6" height="6"/>` },
  tolva: { titulo: "Tolva", cuerpo: `<path d="M3 4h18l-6 9v6h-6v-6L3 4z"/>` },
  sensor: { titulo: "Sensor", cuerpo: `<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>` },
  alerta: { titulo: "Alerta", cuerpo: `<path d="M12 3 2 21h20L12 3z"/><line x1="12" y1="10" x2="12" y2="15"/><line x1="12" y1="18" x2="12" y2="18.01"/>` },
  correcto: { titulo: "Correcto", cuerpo: `<circle cx="12" cy="12" r="9"/><polyline points="8 12.5 11 15.5 16 9"/>` },
};

const ATR_TRAZO = `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
const NS = `xmlns="http://www.w3.org/2000/svg"`;

mkdirSync(join(UI, "icons"), { recursive: true });

// 1) Un SVG por ícono
for (const [id, { titulo, cuerpo }] of Object.entries(ICONOS)) {
  const svg = `<svg ${NS} viewBox="0 0 24 24" width="24" height="24" ${ATR_TRAZO} role="img" aria-label="${titulo}">\n  <title>${titulo}</title>\n  ${cuerpo}\n</svg>\n`;
  writeFileSync(join(UI, "icons", `${id}.svg`), svg, "utf8");
}

// 2) Sprite con <symbol> (uso: <svg class="icono"><use href="/assets/ui/sprite.svg#icono-play"/></svg>)
const simbolos = Object.entries(ICONOS)
  .map(([id, { titulo, cuerpo }]) => `  <symbol id="icono-${id}" viewBox="0 0 24 24" ${ATR_TRAZO}>\n    <title>${titulo}</title>\n    ${cuerpo}\n  </symbol>`)
  .join("\n");
writeFileSync(join(UI, "sprite.svg"), `<svg ${NS} style="display:none">\n${simbolos}\n</svg>\n`, "utf8");

// 3) Logotipo (colores fijos: azul = plástico, gris = aluminio, verde = vidrio)
const logo = `<svg ${NS} viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="Planta de reciclaje en Lumbreras">
  <title>Planta de reciclaje en Lumbreras</title>
  <rect x="4" y="4" width="112" height="112" rx="22" fill="#143d2e"/>
  <rect x="16" y="74" width="88" height="16" rx="8" fill="#1c1f22" stroke="#9aa3ab" stroke-width="3"/>
  <circle cx="30" cy="82" r="3" fill="#9aa3ab"/>
  <circle cx="90" cy="82" r="3" fill="#9aa3ab"/>
  <path d="M30 30h14v10l5 8v20H25V48l5-8V30z" fill="#1f6fb5"/>
  <path d="M52 40c0-3 5-5 11-5s11 2 11 5v28c0 3-5 5-11 5s-11-2-11-5V40z" fill="#d7dadd"/>
  <path d="M82 28h10v14l6 9v17H76V51l6-9V28z" fill="#2f8f4e"/>
</svg>
`;
writeFileSync(join(UI, "logo.svg"), logo, "utf8");

console.log(`${Object.keys(ICONOS).length} íconos + sprite.svg + logo.svg → ${UI}`);
