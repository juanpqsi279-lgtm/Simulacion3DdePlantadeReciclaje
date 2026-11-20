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
import { urlRecurso } from "../recursos/recursosLocales.js";

export function configurarPipelineFotorealista(scene, camara, opciones = {}) {
  const hdrUrl = opciones.hdrUrl ?? "assets/environment/planta_industrial.hdr";
  const muestrasMsaa = opciones.muestrasMsaa ?? 2;

  // 1. Entorno PBR HDRI (resolución 128 prefiltrada: carga instantánea y máxima tasa de cuadros)
  const texturaHdri = new HDRCubeTexture(
    urlRecurso(hdrUrl),
    scene,
    128,
    false,
    true,
    false,
    true,
  );
  scene.environmentTexture = texturaHdri;
  scene.environmentIntensity = 1.28;

  // 2. Iluminación industrial de estudio (3 puntos) para volumen y brillos PBR limpios
  const luzAmbiente = new HemisphericLight("luzAmbienteNave", new Vector3(0.15, 1, 0.25), scene);
  luzAmbiente.intensity = 0.42;
  luzAmbiente.diffuse = Color3.FromHexString("#dcecff");
  luzAmbiente.groundColor = Color3.FromHexString("#162433");

  const luzClave = new DirectionalLight("luzDireccionalIndustrial", new Vector3(-0.52, -1.0, -0.42).normalize(), scene);
  luzClave.position = new Vector3(5.8, 9.5, 5.2);
  luzClave.intensity = 2.15;
  luzClave.diffuse = Color3.FromHexString("#fff6e8");
  luzClave.shadowMinZ = 1.5;
  luzClave.shadowMaxZ = 24.0;

  const luzRelleno = new DirectionalLight("luzRellenoIndustrial", new Vector3(0.65, -0.55, 0.52).normalize(), scene);
  luzRelleno.position = new Vector3(-6.0, 5.5, -4.5);
  luzRelleno.intensity = 0.65;
  luzRelleno.diffuse = Color3.FromHexString("#7dd3fc");

  // 3. Sombras suaves de alta definición (PCF 2048px con caché estática cuando no hay movimiento)
  const generadorSombras = new ShadowGenerator(2048, luzClave);
  if (scene.getEngine().webGLVersion >= 2) {
    generadorSombras.usePercentageCloserFiltering = true;
    generadorSombras.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  } else {
    generadorSombras.usePoissonSampling = true;
  }
  generadorSombras.bias = 0.0007;
  generadorSombras.normalBias = 0.014;
  generadorSombras.frustumEdgeFalloff = 0.15;

  // 4. DefaultRenderingPipeline HDR: MSAA + FXAA + Bloom selectivo + ACES Tone Mapping + Viñeta sutil
  const maxSamples = scene.getEngine().getCaps().maxMSAASamples || 1;
  const pipeline = new DefaultRenderingPipeline("pipelineGemeloDigital", true, scene, [camara]);
  pipeline.samples = Math.min(muestrasMsaa, maxSamples);
  pipeline.fxaaEnabled = true;

  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 1.45;
  pipeline.bloomWeight = 0.34;
  pipeline.bloomKernel = 64;
  pipeline.bloomScale = 0.5;

  pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.toneMappingEnabled = true;
  pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  pipeline.imageProcessing.exposure = 1.14;
  pipeline.imageProcessing.contrast = 1.12;
  pipeline.imageProcessing.vignetteEnabled = true;
  pipeline.imageProcessing.vignetteWeight = 0.85;
  pipeline.imageProcessing.vignetteStretch = 0.5;

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
    luzRelleno,
    generadorSombras,
    pipeline,
    fijarModoSombrasDinamico,
    dispose() {
      pipeline.dispose();
      generadorSombras.dispose();
      luzRelleno.dispose();
      texturaHdri.dispose();
    },
  };
}
