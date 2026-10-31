// src/engine3d/renderingPipeline.js
// Pipeline visual PBR calibrado para sostener 60 FPS estables en WebGL2 / Babylon.js v9+:
// 1. Entorno PBR HDRI (HDRCubeTexture 128px prefiltrado) para reflejos realistas en aluminio y vidrio.
// 2. Sombras PCF ligeras de 1024px con caché estática de mapa de sombras (0 ms/frame en operación).
// 3. DefaultRenderingPipeline HDR con MSAA, Bloom selectivo en sensores y Tone Mapping ACES.

import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture.js";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture.js";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";

export function configurarPipelineFotorealista(scene, camara, opciones = {}) {
  const hdrUrl = opciones.hdrUrl ?? "assets/environment/planta_industrial.hdr";
  const muestrasMsaa = opciones.muestrasMsaa ?? 2;

  // 1. Entorno PBR HDRI (resolución 128 prefiltrada: carga instantánea y máxima tasa de cuadros)
  const texturaHdri = new HDRCubeTexture(
    hdrUrl,
    scene,
    128,
    false,
    true,
    false,
    true,
  );
  scene.environmentTexture = texturaHdri;
  scene.environmentIntensity = 1.28;

  // 2. Iluminación industrial de contraste para dar volumen 3D inmediato a todas las caras
  const luzAmbiente = new HemisphericLight("luzAmbienteNave", new Vector3(0.15, 1, 0.25), scene);
  luzAmbiente.intensity = 0.32;
  luzAmbiente.diffuse = Color3.FromHexString("#d6e8ff");
  luzAmbiente.groundColor = Color3.FromHexString("#141e27");

  const luzClave = new DirectionalLight("luzDireccionalIndustrial", new Vector3(-0.52, -1.0, -0.42).normalize(), scene);
  luzClave.position = new Vector3(5.8, 9.5, 5.2);
  luzClave.intensity = 2.05;
  luzClave.diffuse = Color3.FromHexString("#fff5e4");
  luzClave.shadowMinZ = 1.5;
  luzClave.shadowMaxZ = 22.0;

  // 3. Sombras suaves ligeras (PCF 1024px en vez de PCSS 2048px que colapsaba la GPU a 9 FPS)
  const generadorSombras = new ShadowGenerator(1024, luzClave);
  if (scene.getEngine().webGLVersion >= 2) {
    generadorSombras.usePercentageCloserFiltering = true;
    generadorSombras.filteringQuality = ShadowGenerator.QUALITY_LOW;
  } else {
    generadorSombras.usePoissonSampling = true;
  }
  generadorSombras.bias = 0.0008;
  generadorSombras.normalBias = 0.015;
  generadorSombras.frustumEdgeFalloff = 0.15;

  // 4. DefaultRenderingPipeline HDR: MSAA + FXAA + Bloom selectivo + ACES Tone Mapping
  const maxSamples = scene.getEngine().getCaps().maxMSAASamples || 1;
  const pipeline = new DefaultRenderingPipeline("pipelineGemeloDigital", true, scene, [camara]);
  pipeline.samples = Math.min(muestrasMsaa, maxSamples);
  pipeline.fxaaEnabled = true;

  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 1.85;
  pipeline.bloomWeight = 0.28;
  pipeline.bloomKernel = 48;
  pipeline.bloomScale = 0.5;

  pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.toneMappingEnabled = true;
  pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  pipeline.imageProcessing.exposure = 1.08;
  pipeline.imageProcessing.contrast = 1.16;

  function fijarModoSombrasDinamico(animandoMaquinaria) {
    const mapa = generadorSombras.getShadowMap();
    if (!mapa) return;
    mapa.refreshRate = animandoMaquinaria
      ? RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYTWOFRAMES
      : RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
  }

  return {
    texturaHdri,
    luzAmbiente,
    luzClave,
    generadorSombras,
    pipeline,
    fijarModoSombrasDinamico,
    dispose() {
      pipeline.dispose();
      generadorSombras.dispose();
      texturaHdri.dispose();
    },
  };
}
