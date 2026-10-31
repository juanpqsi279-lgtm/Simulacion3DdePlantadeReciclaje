import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Simulacion, crearRng } from "../src/logica/simulacion.js";
import { Ensamblaje } from "../src/logica/ensamblaje.js";

const leer = (r) => JSON.parse(readFileSync(new URL(r, import.meta.url), "utf8"));
const cfg = leer("../src/mocks/materiales.json");
const pasos = leer("../src/mocks/ensamblaje.json");

function correr(segundos, cfgLocal = cfg, semilla = 7) {
  const sim = new Simulacion(cfgLocal, { rng: crearRng(semilla) });
  for (let t = 0; t < segundos; t += 0.05) sim.actualizar(0.05);
  return sim;
}

test("la simulación clasifica material de los tres tipos", () => {
  const sim = correr(300);
  const r = sim.resumen();
  assert.ok(r.procesadas > 100);
  for (const t of ["plastico", "aluminio", "vidrio"]) assert.ok(sim.metricas.clasificadas[t] > 0, t);
});

test("con precisión 100 % no hay rechazos", () => {
  const perfecto = structuredClone(cfg);
  for (const m of Object.values(perfecto.materiales)) m.precisionSeparador = 1;
  const sim = correr(200, perfecto);
  assert.equal(sim.resumen().rechazadas, 0);
  assert.ok(sim.resumen().clasificadas > 50);
});

test("con precisión 0 % todo se rechaza", () => {
  const malo = structuredClone(cfg);
  for (const m of Object.values(malo.materiales)) m.precisionSeparador = 0;
  const sim = correr(200, malo);
  assert.equal(sim.resumen().clasificadas, 0);
  assert.ok(sim.resumen().rechazadas > 50);
});

test("reiniciar deja los contadores en cero", () => {
  const sim = correr(60);
  sim.reiniciar();
  assert.equal(sim.resumen().ingresadas, 0);
  assert.equal(sim.items.length, 0);
});

test("ensamblaje avanza paso a paso desde cero", () => {
  const e = new Ensamblaje(pasos);
  assert.equal(e.completados, 0);
  assert.equal(e.estaInstalado("banda"), false);
  e.avanzar();
  assert.equal(e.estaInstalado("banda"), true);
  while (!e.completo) e.avanzar();
  assert.equal(e.avanzar(), null);
  assert.equal(e.progreso, 1);
});
