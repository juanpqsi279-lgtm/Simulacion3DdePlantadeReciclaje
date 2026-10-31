// src/engine3d/babylonPhysics.js
// Integración del motor de físicas Babylon.js Physics V2 (@babylonjs/havok) para simular:
// - Colisionadores estáticos de piso, banda, rieles y paredes de los 3 contenedores colectores.
// - Cuerpos rígidos dinámicos (cilindros reciclados en anillo) cayendo y apilándose físicamente
//   dentro de los contenedores de aluminio, plástico y vidrio sin fugas de memoria.

import "@babylonjs/core/Physics/joinedPhysicsEngineComponent.js";
import "@babylonjs/core/Physics/v2/physicsEngineComponent.js";
import HavokPhysics from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { PROPIEDADES_FISICAS_MATERIAL } from "../core/spawner/itemSpawner.js";

const POSICIONES_CONTENEDOR = Object.freeze({
  separador: { x: -0.3, z: -1.3 },
  escaner: { x: 1.7, z: -1.3 },
  desviador: { x: 3.5, z: -1.3 },
});

export async function inicializarFisicasBabylon(scene, contenedoresMat, generadorSombras, maxAcumulados = 27) {
  let activo = false;
  const estaticos = [];
  const anilloRecolectados = [];
  let cursorAnillo = 0;

  try {
    const havokInstancia = await HavokPhysics({ locateFile: () => havokWasmUrl });
    const plugin = new HavokPlugin(true, havokInstancia);
    const ok = scene.enablePhysics(new Vector3(0, -9.81, 0), plugin);
    activo = Boolean(ok && scene.getPhysicsEngine());
  } catch {
    activo = false;
  }

  function crearCajaColision(nombre, sx, sy, sz, x, y, z) {
    const caja = MeshBuilder.CreateBox(nombre, { width: sx, height: sy, depth: sz }, scene);
    caja.position.set(x, y, z);
    caja.isVisible = false;
    caja.isPickable = false;
    if (activo) {
      estaticos.push(new PhysicsAggregate(caja, PhysicsShapeType.BOX, { mass: 0, friction: 0.6, restitution: 0.2 }, scene));
    }
    return caja;
  }

  // Superficie de la banda y rieles laterales en Babylon Physics V2
  crearCajaColision("col_piso", 24, 0.2, 16, 0, -0.1, 0);
  crearCajaColision("col_banda", 8.0, 0.04, 0.56, 0, 0.795, 0);
  crearCajaColision("col_riel_norte", 8.0, 0.14, 0.05, 0, 0.86, -0.31);
  crearCajaColision("col_riel_sur", 8.0, 0.14, 0.05, 0, 0.86, 0.31);

  // Paredes físicas de los 3 contenedores (0.9 x 0.7 x 0.7 m, espesor 0.04 m)
  for (const [estId, pos] of Object.entries(POSICIONES_CONTENEDOR)) {
    const [ancho, fondo, alto, esp] = [0.9, 0.7, 0.7, 0.05];
    crearCajaColision(`col_${estId}_base`, ancho, esp, fondo, pos.x, esp / 2, pos.z);
    crearCajaColision(`col_${estId}_frente`, ancho, alto, esp, pos.x, alto / 2, pos.z + fondo / 2 - esp / 2);
    crearCajaColision(`col_${estId}_atras`, ancho, alto, esp, pos.x, alto / 2, pos.z - fondo / 2 + esp / 2);
    crearCajaColision(`col_${estId}_izq`, esp, alto, fondo, pos.x - ancho / 2 + esp / 2, alto / 2, pos.z);
    crearCajaColision(`col_${estId}_der`, esp, alto, fondo, pos.x + ancho / 2 - esp / 2, alto / 2, pos.z);
  }

  function depositarPiezaEnContenedor({ material, estacion, xFinal, zFinal }) {
    const centro = POSICIONES_CONTENEDOR[estacion];
    if (!centro || !contenedoresMat[material]) return;

    // Recicla la ranura más antigua si se alcanza el tope del anillo
    if (anilloRecolectados.length >= maxAcumulados) {
      const viejo = anilloRecolectados[cursorAnillo];
      viejo.agregado?.dispose();
      viejo.proxy?.dispose();
      viejo.entradas.dispose();
    }

    const fis = PROPIEDADES_FISICAS_MATERIAL[material];
    const entradas = contenedoresMat[material].instantiateModelsToScene(
      (n) => `bin_${cursorAnillo}_${n}`,
      false,
    );
    const visual = entradas.rootNodes[0];
    for (const m of visual.getChildMeshes()) {
      generadorSombras?.addShadowCaster(m);
      m.receiveShadows = true;
    }

    const px = xFinal ?? centro.x;
    const pz = zFinal ?? centro.z;

    let proxy = null;
    let agregado = null;

    if (activo) {
      proxy = MeshBuilder.CreateCylinder(
        `fis_bin_${cursorAnillo}`,
        { diameter: fis.radioM * 2, height: fis.altoM, tessellation: 8 },
        scene,
      );
      proxy.isVisible = false;
      proxy.position.set(px, 0.62, pz);
      proxy.rotationQuaternion = Quaternion.FromEulerAngles(
        (Math.random() - 0.5) * 0.5,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 0.5,
      );
      // El modelo .glb tiene pivote en la base (y=0); se desplaza -alto/2 respecto al centro de masa del cilindro
      visual.parent = proxy;
      visual.position.set(0, -fis.altoM * 0.5, 0);
      visual.rotationQuaternion = null;

      agregado = new PhysicsAggregate(
        proxy,
        PhysicsShapeType.CYLINDER,
        { mass: Math.max(0.02, fis.radioM * 2), friction: fis.friccion, restitution: fis.restitucion },
        scene,
      );
    } else {
      // Respaldo cinemático si WebAssembly no está disponible en el entorno
      visual.position.set(px, 0.05 + (cursorAnillo % 3) * 0.08, pz);
    }

    const registro = { entradas, proxy, agregado };
    if (anilloRecolectados.length < maxAcumulados) {
      anilloRecolectados.push(registro);
    } else {
      anilloRecolectados[cursorAnillo] = registro;
    }
    cursorAnillo = (cursorAnillo + 1) % maxAcumulados;
  }

  function limpiarContenedores() {
    for (const r of anilloRecolectados) {
      r.agregado?.dispose();
      r.proxy?.dispose();
      r.entradas.dispose();
    }
    anilloRecolectados.length = 0;
    cursorAnillo = 0;
  }

  function dispose() {
    limpiarContenedores();
    for (const e of estaticos) e.dispose();
  }

  return {
    activo,
    depositarPiezaEnContenedor,
    limpiarContenedores,
    dispose,
  };
}
