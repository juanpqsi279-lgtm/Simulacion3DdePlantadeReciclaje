// src/engine3d/entornoPlanta.js
// Entorno de la nave industrial: estructura, muros, techo, grúa, zona de recepción (foso + banda inclinada),
// zona de salida (empacadora y pacas) y patio de acopio (botes, contenedores roll-off, entresuelo de control).
//
// Cada archivo de public/assets/models/entorno/ es una escena "horneada" en coordenadas de mundo y fusionada por
// material (pocas mallas → pocas llamadas de dibujo). Es decoración estática: no participa en la física, en el
// ensamblaje ni en el picking, y se puede apagar con alternar(false) si el equipo necesita más rendimiento.
// Los muros y el techo son de una sola cara: desde fuera de la nave son transparentes, así la cámara orbital
// puede alejarse y ver el interior completo. La estructura del techo (archivos cuyo nombre contiene "techo": cerchas,
// grúa, luminarias y ductos) se oculta sola cuando la cámara sube por encima de la cubierta, para que las vistas
// cenital y de nave completa no queden tapadas.

/** Archivos por defecto (se pueden sobrescribir con modelos.entorno en manifest.json). */
export const ARCHIVOS_ENTORNO = Object.freeze(["nave.glb", "nave_techo.glb", "recepcion.glb", "salida.glb", "patio.glb"]);

/**
 * @param {{ cargar: (archivo: string) => Promise<import("@babylonjs/core/assetContainer.js").AssetContainer>,
 *           optimizar?: (material: any) => void,
 *           archivos?: readonly string[],
 *           onProgreso?: (archivo: string) => void,
 *           scene?: import("@babylonjs/core/scene.js").Scene,
 *           camara?: import("@babylonjs/core/Cameras/camera.js").Camera,
 *           alturaTecho?: number }} opciones
 */
export async function cargarEntornoPlanta({ cargar, optimizar, archivos = ARCHIVOS_ENTORNO, onProgreso, scene = null, camara = null, alturaTecho = 8.5 }) {
  const fijas = [];
  const techo = [];
  for (const archivo of archivos) {
    const contenedor = await cargar(archivo);
    if (optimizar) contenedor.materials.forEach(optimizar);
    contenedor.addAllToScene();
    for (const malla of contenedor.meshes) {
      if (!malla.getTotalVertices || malla.getTotalVertices() === 0) continue;
      malla.isPickable = false;
      malla.receiveShadows = false;
      malla.freezeWorldMatrix();
      (archivo.includes("techo") ? techo : fijas).push(malla);
    }
    onProgreso?.(archivo);
  }

  let entornoVisible = true;
  let techoVisible = true;
  const actualizarTecho = () => {
    const ver = entornoVisible && (!camara || camara.globalPosition.y < alturaTecho - 0.3);
    if (ver === techoVisible) return;
    techoVisible = ver;
    for (const m of techo) m.setEnabled(ver);
  };
  if (scene && camara && techo.length) scene.onBeforeRenderObservable.add(actualizarTecho);

  return {
    mallas: [...fijas, ...techo],
    /** Muestra u oculta todo el entorno (por ejemplo, para medir rendimiento sin decoración). */
    alternar(visible) {
      entornoVisible = visible;
      for (const m of fijas) m.setEnabled(visible);
      actualizarTecho();
    },
  };
}
