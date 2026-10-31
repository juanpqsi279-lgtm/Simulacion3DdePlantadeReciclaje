// src/engine3d/renderingPipeline.js
// Configuración visual de Gemelo Digital Profesional en Babylon.js v9+:
// 1. Entorno PBR HDRI (HDRCubeTexture sobre archivo Radiance .hdr) para reflexiones e irradiancia (IBL).
// 2. Iluminación direccional industrial + ShadowGenerator con Contact Hardening Shadows y sombras translúcidas.
// 3. DefaultRenderingPipeline en HDR con MSAA (4x), FXAA, Bloom sutil para sensores y Tone Mapping ACES.

import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";
import "@babylonjs/core/Rendering/depthRendererSceneComponent.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture.js";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";

/**
 * Configura el entorno HDRI, las sombras suaves de contacto y el DefaultRenderingPipeline.
 * @param {import("@babylonjs/core/scene.js").Scene} scene
 * @param {import("@babylonjs/core/Cameras/camera.js").Camera} camara
 * @param {{ hdrUrl?: string, muestrasMsaa?: number }} [opciones]
 */
export function configurarPipelineFotorealista(scene, camara, opciones = {}) {
  const hdrUrl = opciones.hdrUrl ?? "assets/environment/planta_industrial.hdr";
  const muestrasMsaa = opciones.muestrasMsaa ?? 4;

  // 1. Entorno PBR (HDRI RGBE -> Cubemap prefiltrado + armónicos esféricos de irradiancia)
  const texturaHdri = new HDRCubeTexture(
    hdrUrl,
    scene,
    256,
    false, // mipmaps activos para distintos niveles de roughness PBR
    true,  // genera armónicos esféricos para iluminación difusa IBL
    false, // espacio lineal requerido por PBRMaterial
    true,  // prefiltrado especular en carga
  );
  scene.environmentTexture = texturaHdri;
  scene.environmentIntensity = 1.15;

  // 2. Iluminación industrial de relleno y clave direccional
  const luzAmbiente = new HemisphericLight("luzAmbienteNave", new Vector3(0, 1, 0.15), scene);
  luzAmbiente.intensity = 0.38;
  luzAmbiente.diffuse = Color3.FromHexString("#dcebff");
  luzAmbiente.groundColor = Color3.FromHexString("#1e2933");

  const luzClave = new DirectionalLight("luzDireccionalIndustrial", new Vector3(-0.45, -1.0, -0.38).normalize(), scene);
  luzClave.position = new Vector3(5.5, 9.5, 5.2);
  luzClave.intensity = 1.85;
  luzClave.diffuse = Color3.FromHexString("#fff7ea");
  luzClave.shadowMinZ = 1.0;
  luzClave.shadowMaxZ = 24.0;

  // 3. Sombras suaves con Contact Hardening (WebGL2) + soporte para materiales translúcidos (PET y vidrio)
  const generadorSombras = new ShadowGenerator(2048, luzClave);
  if (scene.getEngine().webGLVersion >= 2) {
    generadorSombras.useContactHardeningShadow = true;
    generadorSombras.contactHardeningLightSizeUVRatio = 0.048;
    generadorSombras.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  } else {
    generadorSombras.useBlurExponentialShadowMap = true;
    generadorSombras.blurKernel = 16;
  }
  generadorSombras.bias = 0.00045;
  generadorSombras.normalBias = 0.014;
  generadorSombras.frustumEdgeFalloff = 0.15;
  generadorSombras.transparencyShadow = true;
  generadorSombras.enableSoftTransparentShadow = true;

  // 4. DefaultRenderingPipeline: HDR + MSAA + FXAA + Bloom sutil en sensores + Tone Mapping ACES
  const maxSamples = scene.getEngine().getCaps().maxMSAASamples || 1;
  const pipeline = new DefaultRenderingPipeline("pipelineGemeloDigital", true, scene, [camara]);
  pipeline.samples = Math.min(muestrasMsaa, maxSamples);
  pipeline.fxaaEnabled = true;

  // Efecto sutil de Bloom calibrado en umbral HDR (>1.35) para que solo brillen las balizas de sensores y haces ópticos
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 1.35;
  pipeline.bloomWeight = 0.32;
  pipeline.bloomKernel = 64;
  pipeline.bloomScale = 0.5;

  // Procesamiento de imagen cinematográfico/industrial (ACES Filmic)
  pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.toneMappingEnabled = true;
  pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  pipeline.imageProcessing.exposure = 1.06;
  pipeline.imageProcessing.contrast = 1.12;

  return {
    texturaHdri,
    luzAmbiente,
    luzClave,
    generadorSombras,
    pipeline,
    dispose() {
      pipeline.dispose();
      generadorSombras.dispose();
      texturaHdri.dispose();
    },
  };
}
