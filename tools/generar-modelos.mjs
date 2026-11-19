// tools/generar-modelos.mjs
// Genera los modelos 3D (.glb) de la planta de reciclaje en Lumbreras: maquinaria, piezas a reciclar (con variantes)
// y el entorno de la nave (estructura, recepción, salida y patio de acopio).
// JavaScript puro (ES modules), sin dependencias. Unidades: metros. Eje Y hacia arriba.
// Uso:  node tools/generar-modelos.mjs [carpeta_salida]      (por defecto: public/assets/models)
//
// El robot WALL-E lo genera aparte tools/generar-walle.mjs (no se toca aquí).
// Estructura: tools/lib/ → geometria · texturas · glb · piezas-materiales · piezas-maquinaria · entorno-base · piezas-entorno
//
// Los nombres de nodos y de materiales de maquinaria y piezas se conservan: el motor 3D los usa para animar
// (sceneController.js) y para calibrar el PBR (pbrEnhancer.js).

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { escribirGLB } from "./lib/glb.mjs";
import {
  botellaPlastico, botellaPlasticoCola, botellaPlasticoDeportiva, lataAluminio, lataDorada, lataSlim,
  botellaVidrio, botellaVidrioAmbar, frascoVidrio,
} from "./lib/piezas-materiales.mjs";
import {
  ALTURA_BANDA, bandaTransportadora, tolvaAlimentacion, separadorAluminio, escanerOptico, desviadorVidrio, contenedor,
} from "./lib/piezas-maquinaria.mjs";
import { entornoNave, entornoTecho, entornoRecepcion, entornoSalida, entornoPatio } from "./lib/piezas-entorno.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const SALIDA = process.argv[2] ?? join(AQUI, "..", "public", "assets", "models");

// Desplaza una lista de partes (si la parte tiene su propio nodo trasladado, solo se mueve el nodo).
function desplazar(partes, dx, dy, dz, prefijo) {
  return partes.map((p) => {
    const nombre = `${prefijo}_${p.nombre}`;
    if (p.trasl) return { ...p, nombre, trasl: [p.trasl[0] + dx, p.trasl[1] + dy, p.trasl[2] + dz] };
    const geo = { ...p.geo, pos: p.geo.pos.map((v, i) => (i % 3 === 0 ? v + dx : i % 3 === 1 ? v + dy : v + dz)) };
    return { ...p, nombre, geo };
  });
}

// Escena de prueba con la línea ensamblada (misma disposición que usa sceneController.js)
function plantaVistaPrevia() {
  return [
    ...desplazar(bandaTransportadora(4.0), -2, 0, 0, "banda_a"),
    ...desplazar(bandaTransportadora(4.0), 2, 0, 0, "banda_b"),
    ...desplazar(tolvaAlimentacion(), -3.2, 0, 0, "tolva"),
    ...desplazar(separadorAluminio(), -0.8, 0, 0, "sep_aluminio"),
    ...desplazar(escanerOptico(), 1.2, 0, 0, "sep_plastico"),
    ...desplazar(desviadorVidrio(), 3.0, 0, 0, "sep_vidrio"),
    ...desplazar(contenedor("cont_gris", "cartel_aluminio"), -0.3, 0, -1.3, "cont_aluminio"),
    ...desplazar(contenedor("cont_azul", "cartel_plastico"), 1.7, 0, -1.3, "cont_plastico"),
    ...desplazar(contenedor("cont_verde", "cartel_vidrio"), 3.5, 0, -1.3, "cont_vidrio"),
    ...desplazar(botellaPlastico(), -2.0, ALTURA_BANDA, 0.1, "muestra_pet"),
    ...desplazar(lataAluminio(), -1.6, ALTURA_BANDA, -0.1, "muestra_lata"),
    ...desplazar(botellaVidrio(), -1.2, ALTURA_BANDA, 0.05, "muestra_vidrio"),
  ];
}

const t0 = Date.now();
const trabajos = [
  // Piezas a reciclar: originales y variantes (se eligen al azar por pieza en el pool, ver materiales.json)
  ["materiales", "botella_plastico.glb", botellaPlastico],
  ["materiales", "botella_plastico_cola.glb", botellaPlasticoCola],
  ["materiales", "botella_plastico_deportiva.glb", botellaPlasticoDeportiva],
  ["materiales", "lata_aluminio.glb", lataAluminio],
  ["materiales", "lata_aluminio_dorada.glb", lataDorada],
  ["materiales", "lata_aluminio_slim.glb", lataSlim],
  ["materiales", "botella_vidrio.glb", botellaVidrio],
  ["materiales", "botella_vidrio_ambar.glb", botellaVidrioAmbar],
  ["materiales", "frasco_vidrio.glb", frascoVidrio],
  // Maquinaria
  ["maquinaria", "banda_transportadora.glb", () => bandaTransportadora(4.0)],
  ["maquinaria", "tolva_alimentacion.glb", tolvaAlimentacion],
  ["maquinaria", "separador_aluminio.glb", separadorAluminio],
  ["maquinaria", "escaner_optico_plastico.glb", escanerOptico],
  ["maquinaria", "desviador_vidrio.glb", desviadorVidrio],
  ["maquinaria", "contenedor_plastico.glb", () => contenedor("cont_azul", "cartel_plastico")],
  ["maquinaria", "contenedor_aluminio.glb", () => contenedor("cont_gris", "cartel_aluminio")],
  ["maquinaria", "contenedor_vidrio.glb", () => contenedor("cont_verde", "cartel_vidrio")],
  // Entorno de la nave (escenas horneadas en coordenadas de mundo)
  ["entorno", "nave.glb", entornoNave],
  ["entorno", "nave_techo.glb", entornoTecho],
  ["entorno", "recepcion.glb", entornoRecepcion],
  ["entorno", "salida.glb", entornoSalida],
  ["entorno", "patio.glb", entornoPatio],
  ["preview", "planta_vista_previa.glb", plantaVistaPrevia],
];
for (const [carpeta, archivo, fn] of trabajos) {
  const r = escribirGLB(SALIDA, carpeta, archivo, fn());
  console.log(`${r.archivo.padEnd(48)} ${String(r.partes).padStart(3)} nodos ${String(r.tris).padStart(7)} tris ${String(r.texturas).padStart(2)} tex ${(r.bytes / 1024).toFixed(0).padStart(6)} KB`);
}
console.log(`\nListo en ${((Date.now() - t0) / 1000).toFixed(1)} s → ${SALIDA}`);
