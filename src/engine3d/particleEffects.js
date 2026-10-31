// src/engine3d/particleEffects.js
// Sistemas de partículas en Babylon.js puro (cero modelos extra y cero imágenes bitmap externas):
// 1. Ráfaga direccional de aire comprimido cuando el escáner óptico detecta/expulsa plástico PET.
// 2. Destello / campo electromagnético de corrientes de Foucault cuando actúa el separador de aluminio.

import "@babylonjs/core/Particles/particleSystemComponent.js";
import "@babylonjs/core/Engines/Extensions/engine.rawTexture.js";
import "@babylonjs/core/Materials/Textures/texture.js";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color4 } from "@babylonjs/core/Maths/math.color.js";

function crearTexturaRadialRgba(scene, modoChispa = false) {
  const tam = 64;
  const datos = new Uint8Array(tam * tam * 4);
  const mitad = (tam - 1) / 2;

  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      const dx = (x - mitad) / mitad;
      const dy = (y - mitad) / mitad;
      const r = Math.hypot(dx, dy);
      const idx = (y * tam + x) * 4;

      if (r >= 1.0) {
        datos[idx + 3] = 0;
        continue;
      }

      if (modoChispa) {
        // Anillo + núcleo brillante para pulsos electromagnéticos de Foucault
        const nucleo = Math.pow(1 - r, 3.2);
        const anillo = Math.exp(-Math.pow((r - 0.58) / 0.12, 2)) * 0.65;
        const a = Math.min(1, nucleo + anillo);
        datos[idx] = 210;
        datos[idx + 1] = 242;
        datos[idx + 2] = 255;
        datos[idx + 3] = Math.round(a * 255);
      } else {
        // Neblina suave gausiana para chorro de aire comprimido
        const a = Math.pow(1 - r * r, 2.2);
        datos[idx] = 240;
        datos[idx + 1] = 250;
        datos[idx + 2] = 255;
        datos[idx + 3] = Math.round(a * 220);
      }
    }
  }
  return RawTexture.CreateRGBATexture(datos, tam, tam, scene, false, false);
}

/**
 * Inicializa los sistemas de partículas de retroalimentación industrial.
 * @param {import("@babylonjs/core/scene.js").Scene} scene
 */
export function crearEfectosParticulasMaquinaria(scene) {
  const texAire = crearTexturaRadialRgba(scene, false);
  const texCampo = crearTexturaRadialRgba(scene, true);

  // 1. ESCÁNER ÓPTICO (PLÁSTICO PET): Ráfaga neumática de aire comprimido desde la barra de boquillas
  const psAire = new ParticleSystem("psRafagaAireComprimido", 200, scene);
  psAire.particleTexture = texAire;
  psAire.emitter = new Vector3(1.55, 0.93, 0.08);
  psAire.minEmitBox = new Vector3(-0.06, -0.01, -0.18);
  psAire.maxEmitBox = new Vector3(0.06, 0.01, 0.18);

  psAire.color1 = new Color4(0.88, 0.96, 1.0, 0.85);
  psAire.color2 = new Color4(0.62, 0.88, 1.0, 0.55);
  psAire.colorDead = new Color4(0.85, 0.95, 1.0, 0.0);

  psAire.minSize = 0.035;
  psAire.maxSize = 0.115;
  psAire.minLifeTime = 0.12;
  psAire.maxLifeTime = 0.26;
  psAire.emitRate = 0; // Solo emite bajo demanda en ráfagas discretas

  // Vector de soplado a alta velocidad hacia el contenedor azul (eje -Z)
  psAire.direction1 = new Vector3(-0.28, -0.75, -3.8);
  psAire.direction2 = new Vector3(0.32, -0.25, -2.9);
  psAire.minEmitPower = 2.4;
  psAire.maxEmitPower = 4.2;
  psAire.updateSpeed = 1 / 60;
  psAire.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  psAire.start();

  // 2. SEPARADOR DE ALUMINIO: Destello y campo magnético sutil por corrientes de Foucault
  const psCampoMagnetico = new ParticleSystem("psCampoMagneticoAluminio", 240, scene);
  psCampoMagnetico.particleTexture = texCampo;
  psCampoMagnetico.emitter = new Vector3(-0.75, 1.06, 0.0);
  psCampoMagnetico.minEmitBox = new Vector3(-0.24, -0.15, -0.25);
  psCampoMagnetico.maxEmitBox = new Vector3(0.26, 0.15, 0.25);

  // Tonos cian-violeta de alta energía que activan sutilmente el Bloom del pipeline
  psCampoMagnetico.color1 = new Color4(0.28, 0.86, 1.0, 0.95);
  psCampoMagnetico.color2 = new Color4(0.56, 0.44, 1.0, 0.85);
  psCampoMagnetico.colorDead = new Color4(0.12, 0.45, 1.0, 0.0);

  psCampoMagnetico.minSize = 0.025;
  psCampoMagnetico.maxSize = 0.085;
  psCampoMagnetico.minLifeTime = 0.16;
  psCampoMagnetico.maxLifeTime = 0.36;
  psCampoMagnetico.emitRate = 0;

  // Repulsión electromagnética tangencial hacia el contenedor gris (-Z)
  psCampoMagnetico.direction1 = new Vector3(-0.6, -0.45, -2.4);
  psCampoMagnetico.direction2 = new Vector3(1.1, 0.65, -0.7);
  psCampoMagnetico.minEmitPower = 1.2;
  psCampoMagnetico.maxEmitPower = 2.6;
  psCampoMagnetico.updateSpeed = 1 / 60;
  psCampoMagnetico.blendMode = ParticleSystem.BLENDMODE_ADD;
  psCampoMagnetico.start();

  return {
    /** Emite una ráfaga visible de aire comprimido en las boquillas del clasificador óptico. */
    dispararAirePlastico(cantidad = 55) {
      psAire.manualEmitCount = Math.min(120, psAire.manualEmitCount + cantidad);
    },
    /** Emite un pulso/destello electromagnético en el tambor inductor de aluminio. */
    dispararCampoAluminio(cantidad = 65) {
      psCampoMagnetico.manualEmitCount = Math.min(140, psCampoMagnetico.manualEmitCount + cantidad);
    },
    /** Ajusta el halo basal sutil del tambor inductor cuando la línea está operando. */
    fijarEstadoOperativo(operando, separadorVisible) {
      psCampoMagnetico.emitRate = operando && separadorVisible ? 12 : 0;
    },
    dispose() {
      psAire.dispose();
      psCampoMagnetico.dispose();
      texAire.dispose();
      texCampo.dispose();
    },
  };
}
