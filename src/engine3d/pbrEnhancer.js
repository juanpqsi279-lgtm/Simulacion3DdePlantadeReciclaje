// src/engine3d/pbrEnhancer.js
// Refinamiento de materiales PBR sobre los activos .glb para aprovechar el entorno HDRI (IBL):
// aluminio anodizado/cepillado, vidrio con translucidez e índice de refracción real, PET con clearcoat
// y balizas emisivas HDR compatibles con el Bloom del DefaultRenderingPipeline.

import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";

export function optimizarMaterialPbr(mat) {
  if (!(mat instanceof PBRMaterial)) return;

  mat.environmentIntensity = 1.25;
  const nombre = (mat.name || "").toLowerCase();

  if (nombre.includes("aluminio")) {
    mat.metallic = 0.96;
    mat.roughness = 0.19;
    mat.environmentIntensity = 1.45;
    mat.clearCoat.isEnabled = true;
    mat.clearCoat.intensity = 0.25;
    mat.clearCoat.roughness = 0.22;
  } else if (nombre.includes("acero")) {
    mat.metallic = nombre.includes("oscuro") ? 0.80 : 0.90;
    mat.roughness = nombre.includes("oscuro") ? 0.38 : 0.27;
    mat.environmentIntensity = 1.3;
  } else if (nombre.includes("vidrio")) {
    mat.metallic = 0.0;
    mat.roughness = 0.03;
    mat.alpha = 0.56;
    mat.indexOfRefraction = 1.52;
    mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    mat.backFaceCulling = false;
    mat.separateCullingPass = true;
    mat.clearCoat.isEnabled = true;
    mat.clearCoat.intensity = 1.0;
    mat.clearCoat.roughness = 0.02;
    mat.subSurface.isTranslucencyEnabled = true;
    mat.subSurface.translucencyIntensity = 0.75;
    mat.subSurface.tintColor = Color3.FromHexString("#289c52");
  } else if (nombre.includes("pet")) {
    mat.metallic = 0.0;
    mat.roughness = 0.06;
    mat.alpha = 0.60;
    mat.indexOfRefraction = 1.49;
    mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    mat.backFaceCulling = false;
    mat.separateCullingPass = true;
    mat.clearCoat.isEnabled = true;
    mat.clearCoat.intensity = 0.9;
    mat.clearCoat.roughness = 0.05;
    mat.subSurface.isTranslucencyEnabled = true;
    mat.subSurface.translucencyIntensity = 0.55;
    mat.subSurface.tintColor = Color3.FromHexString("#cbeaff");
  } else if (nombre.includes("pintura") || nombre.includes("contenedor")) {
    mat.metallic = 0.20;
    mat.roughness = 0.35;
    mat.clearCoat.isEnabled = true;
    mat.clearCoat.intensity = 0.35;
    mat.clearCoat.roughness = 0.28;
  } else if (nombre.includes("banda_goma")) {
    mat.metallic = 0.04;
    mat.roughness = 0.86;
  }
}

/**
 * Clona el material de una baliza luminosa de sensor para controlar su emisión HDR de forma independiente
 * y activar sutilmente el filtro de Bloom del DefaultRenderingPipeline cuando detecta material.
 */
export function prepararBalizaSensor(mesh, nombreClon) {
  if (!mesh?.material) return null;
  const clon = mesh.material.clone(nombreClon);
  mesh.material = clon;
  if (clon instanceof PBRMaterial) {
    clon.roughness = 0.15;
    clon.metallic = 0.0;
    clon.emissiveIntensity = 1.0;
  }
  return clon;
}
