import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";

import { MaterialObjectPool } from "../src/engine3d/objectPool.js";
import { ARCHIVOS_ENTORNO } from "../src/engine3d/entornoPlanta.js";

const leerJson = (ruta) => JSON.parse(readFileSync(new URL(ruta, import.meta.url), "utf8"));
const manifest = leerJson("../public/manifest.json");
const materiales = leerJson("../src/mocks/materiales.json").materiales;
const rutaModelo = (sub, archivo) => new URL(`../public/assets/models/${sub}/${archivo}`, import.meta.url);

// Lee min/max de POSITION de un .glb (sin dependencias)
function medirGlb(url) {
  const d = readFileSync(url);
  assert.equal(d.toString("ascii", 0, 4), "glTF", `${url.pathname}: cabecera GLB inválida`);
  const g = JSON.parse(d.toString("utf8", 20, 20 + d.readUInt32LE(12)));
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const m of g.meshes) for (const p of m.primitives) {
    const a = g.accessors[p.attributes.POSITION];
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], a.min[k]); mx[k] = Math.max(mx[k], a.max[k]); }
  }
  return { g, ancho: mx[0] - mn[0], alto: mx[1] - mn[1], fondo: mx[2] - mn[2], minY: mn[1] };
}

test("Manifest: cada modelo listado (materiales, maquinaria y entorno) existe y es .glb", () => {
  for (const sub of ["materiales", "maquinaria", "entorno"]) {
    assert.ok(Array.isArray(manifest.modelos[sub]) && manifest.modelos[sub].length > 0, `modelos.${sub} vacío`);
    for (const archivo of manifest.modelos[sub]) {
      assert.match(archivo, /\.glb$/i);
      assert.ok(existsSync(rutaModelo(sub, archivo)), `falta ${sub}/${archivo}`);
    }
  }
  for (const archivo of ARCHIVOS_ENTORNO) assert.ok(manifest.modelos.entorno.includes(archivo), `el manifest no lista ${archivo}`);
});

test("Variantes de piezas: existen, están en el manifest y caben en el cilindro de colisión de su material", () => {
  // Radio y altura máximos (m) que asume la física por material, con una holgura visual de 1.5 cm en altura
  const limites = { plastico: { r: 0.036, h: 0.214 }, aluminio: { r: 0.035, h: 0.122 }, vidrio: { r: 0.037, h: 0.234 } };
  for (const [tipo, cfg] of Object.entries(materiales)) {
    const archivos = [cfg.modelo, ...(cfg.variantes ?? [])];
    assert.ok((cfg.variantes ?? []).length >= 2, `${tipo}: se esperaban al menos 2 variantes`);
    for (const archivo of archivos) {
      assert.ok(manifest.modelos.materiales.includes(archivo), `${archivo} no está en manifest.modelos.materiales`);
      const m = medirGlb(rutaModelo("materiales", archivo));
      assert.ok(Math.max(m.ancho, m.fondo) / 2 <= limites[tipo].r + 0.001, `${archivo}: radio ${(Math.max(m.ancho, m.fondo) / 2).toFixed(3)} m excede el colisionador`);
      assert.ok(m.alto <= limites[tipo].h + 0.015, `${archivo}: altura ${m.alto.toFixed(3)} m excede el colisionador`);
      assert.ok(Math.abs(m.minY) < 0.002, `${archivo}: el origen debe estar en la base`);
    }
  }
});

test("Entorno de la nave: modelos válidos y sin invadir la línea funcional ni el carril de WALL-E", () => {
  for (const archivo of ARCHIVOS_ENTORNO) {
    const { g } = medirGlb(rutaModelo("entorno", archivo));
    assert.ok(g.meshes.length > 0, `${archivo} sin mallas`);
    assert.ok(g.nodes.length < 40, `${archivo}: demasiados nodos (${g.nodes.length}); el entorno debe estar fusionado por material`);
    // Ningún material del entorno debe activar por error la calibración de las piezas a reciclar
    for (const mat of g.materials) {
      const n = mat.name.toLowerCase();
      if (n.startsWith("maq_") || n.startsWith("luz_")) continue;
      assert.ok(n.startsWith("entorno_") || n.startsWith("maq_cont_"), `${archivo}: material "${mat.name}" sin prefijo entorno_`);
      for (const clave of ["vidrio", "aluminio", "pet", "lata_banda", "chapa", "tapa_azul"]) assert.ok(!n.includes(clave), `${archivo}: "${mat.name}" contiene la palabra clave "${clave}" del pbrEnhancer`);
    }
  }
});

test("MaterialObjectPool reparte las variantes de forma equilibrada entre las piezas del pool", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const usos = {};
  const falso = (nombre) => ({
    instantiateModelsToScene() {
      usos[nombre] = (usos[nombre] ?? 0) + 1;
      return { rootNodes: [new TransformNode(`raiz_${nombre}`, scene)], dispose() {} };
    },
  });
  const principal = falso("principal"), v1 = falso("v1"), v2 = falso("v2");
  const pool = new MaterialObjectPool(scene, { plastico: principal }, null, 12, { plastico: [principal, v1, v2] });
  assert.equal(pool.libres.plastico.length, 12);
  assert.deepEqual(Object.values(usos).sort(), [4, 4, 4], "las 12 piezas deben repartirse 4/4/4 entre las 3 variantes");
  // Sin variantes el pool conserva su comportamiento anterior (un solo modelo)
  const pool2 = new MaterialObjectPool(scene, { plastico: principal }, null, 3);
  assert.equal(pool2.libres.plastico.length, 3);
  scene.dispose();
  engine.dispose();
});
