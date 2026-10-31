// src/config/configLoader.js
// Carga e integra dinámicamente public/manifest.json con los datos mock obligatorios,
// alimentando tiempos de ensamblaje, consumo en kW, rutas PBR y métricas base del Gemelo Digital.

import materialesMock from "../mocks/materiales.json" with { type: "json" };
import ensamblajeMock from "../mocks/ensamblaje.json" with { type: "json" };
import historialMock from "../mocks/historial.json" with { type: "json" };

export function fusionarConfiguracion(manifest = null) {
  const materialesCfg = structuredClone(materialesMock);
  const ensamblajeCfg = structuredClone(ensamblajeMock);
  const historialCfg = structuredClone(historialMock);

  const simIni = manifest?.simulacionInicial ?? {};
  if (typeof simIni.velocidadBandaMps === "number") {
    materialesCfg.linea.velocidadBandaMps = simIni.velocidadBandaMps;
  }
  const pzsMin = simIni.piezasPorMinuto ?? Math.round(60 / materialesCfg.linea.intervaloEntradaSeg);
  materialesCfg.linea.piezasPorMinuto = pzsMin;
  materialesCfg.linea.maxPiezasPorMinuto = simIni.maxPiezasPorMinuto ?? 240;
  materialesCfg.linea.intervaloEntradaSeg = 60 / pzsMin;

  const overrides = simIni.ensamblajeOverrides ?? {};
  for (const paso of ensamblajeCfg.pasos) {
    const ov = overrides[paso.id];
    if (!ov) continue;
    if (typeof ov.tiempoEstimadoMin === "number") paso.tiempoEstimadoMin = ov.tiempoEstimadoMin;
    if (typeof ov.potenciaKw === "number") paso.potenciaKw = ov.potenciaKw;
  }

  return {
    manifest,
    entornoHdr: manifest?.tecnologias?.entornoPbr ?? "assets/environment/planta_industrial.hdr",
    metricasBase: {
      metaPurezaPct: simIni.metricasBase?.metaPurezaPct ?? 94.0,
      metaThroughputPzsHora: simIni.metricasBase?.metaThroughputPzsHora ?? 3200,
      costoKwhUsd: simIni.metricasBase?.costoKwhUsd ?? 0.14,
    },
    multiplicadorInicial: simIni.multiplicadorVelocidad ?? 1,
    materialesCfg,
    ensamblajeCfg,
    historialCfg,
  };
}

export async function cargarConfiguracionDinamica(urlManifest = "manifest.json") {
  let manifest = null;
  try {
    const resp = await fetch(urlManifest);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    manifest = await resp.json();
  } catch (err) {
    manifest = { advertencia: err.message };
  }
  return fusionarConfiguracion(manifest);
}
