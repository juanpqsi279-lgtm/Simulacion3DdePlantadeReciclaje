// src/engine3d/pbrEnhancer.js
// Configuración explícita de Materiales PBR (Physically Based Rendering) en Babylon.js v9+:
// - Botellas de vidrio: refracción óptica real (IOR 1.52) y transmisión/transparencia (subSurface + alpha).
// - Latas de aluminio: metalicidad pura al 100 % (metallic = 1.0) con anisotropía de laminado.
// - Botellas de plástico PET: rugosidad polimérica realista (roughness = 0.24 / 0.42 en tapa) y semitransparencia.

import "@babylonjs/core/Materials/PBR/pbrSubSurfaceConfiguration.js";
import "@babylonjs/core/Materials/PBR/pbrAnisotropicConfiguration.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";

/**
 * Configura las propiedades físicas PBR de un material cargado desde .glb en función de su clase industrial.
 * @param {import("@babylonjs/core/Materials/material.js").Material} mat
 * @param {import("@babylonjs/core/scene.js").Scene} scene
 */
export function optimizarMaterialPbr(mat, scene) {
  if (!(mat instanceof PBRMaterial)) return;

  const texEntorno = scene?.environmentTexture ?? null;
  const nombre = (mat.name || "").toLowerCase();

  mat.directIntensity = 1.25;
  mat.environmentIntensity = 1.35;

  // 1. VIDRIO: Refracción óptica (IOR 1.52) + Transmisión/Transparencia cristalina
  if (nombre.includes("vidrio")) {
    mat.albedoColor = Color3.FromHexString("#1e8f48");
    mat.metallic = 0.0;
    mat.roughness = 0.035;
    mat.alpha = 0.36;
    mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    mat.backFaceCulling = false;
    mat.separateCullingPass = true;
    mat.specularIntensity = 1.65;
    mat.environmentIntensity = 1.65;

    mat.subSurface.isRefractionEnabled = true;
    if (texEntorno) mat.subSurface.refractionTexture = texEntorno;
    mat.subSurface.indexOfRefraction = 1.52;
    mat.subSurface.refractionIntensity = 0.92;
    mat.subSurface.isTranslucencyEnabled = true;
    mat.subSurface.translucencyIntensity = 0.82;
    mat.subSurface.tintColor = Color3.FromHexString("#1b9c4d");
    mat.subSurface.minimumThickness = 0.01;
    mat.subSurface.maximumThickness = 0.065;
    return;
  }

  // 2. ALUMINIO: Metalicidad al 100 % (metallic = 1.0) y brillo especular anisotrópico
  if (nombre.includes("aluminio")) {
    mat.albedoColor = Color3.FromHexString("#e8eef5");
    mat.metallic = 1.0;
    mat.roughness = 0.16;
    mat.environmentIntensity = 1.85;
    mat.anisotropy.isEnabled = true;
    mat.anisotropy.intensity = 0.45;
    return;
  }

  if (nombre.includes("lata_banda") || nombre.includes("chapa")) {
    mat.metallic = 0.94;
    mat.roughness = 0.21;
    mat.environmentIntensity = 1.65;
    return;
  }

  // 3. PLÁSTICO PET y TAPA HDPE: Rugosidad polimérica realista (roughness 0.24 / 0.42)
  if (nombre.includes("pet")) {
    mat.albedoColor = Color3.FromHexString("#c8e8ff");
    mat.metallic = 0.0;
    mat.roughness = 0.24; // Rugosidad realista de PET soplado (menos espejado que el vidrio)
    mat.alpha = 0.70;
    mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    mat.backFaceCulling = false;
    mat.separateCullingPass = true;
    mat.specularIntensity = 1.15;

    mat.subSurface.isRefractionEnabled = true;
    if (texEntorno) mat.subSurface.refractionTexture = texEntorno;
    mat.subSurface.indexOfRefraction = 1.49;
    mat.subSurface.refractionIntensity = 0.48;
    mat.subSurface.tintColor = Color3.FromHexString("#d8f0ff");
    return;
  }

  if (nombre.includes("tapa_azul")) {
    mat.metallic = 0.0;
    mat.roughness = 0.42; // Polietileno de alta densidad (HDPE) satinado
    mat.specularIntensity = 0.85;
    return;
  }

  if (nombre.includes("etiqueta")) {
    mat.metallic = 0.0;
    mat.roughness = 0.58;
    return;
  }

  // 4. MAQUINARIA INDUSTRIAL: Acero estructural, esmaltes y banda de caucho
  if (nombre.includes("acero")) {
    mat.metallic = nombre.includes("oscuro") ? 0.86 : 0.96;
    mat.roughness = nombre.includes("oscuro") ? 0.36 : 0.22;
    mat.environmentIntensity = 1.55;
  } else if (nombre.includes("pintura") || nombre.includes("contenedor")) {
    mat.metallic = 0.26;
    mat.roughness = 0.32;
    mat.environmentIntensity = 1.35;
  } else if (nombre.includes("banda_goma")) {
    mat.metallic = 0.02;
    mat.roughness = 0.86;
  } else if (nombre.includes("lente")) {
    mat.metallic = 0.15;
    mat.roughness = 0.04;
    mat.environmentIntensity = 1.8;
  }
}

export function prepararBalizaSensor(mesh, nombreClon) {
  if (!mesh?.material) return null;
  const clon = mesh.material.clone(nombreClon);
  mesh.material = clon;
  if (clon instanceof PBRMaterial) {
    clon.roughness = 0.16;
    clon.metallic = 0.0;
    clon.emissiveIntensity = 1.0;
  }
  return clon;
}
