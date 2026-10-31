// src/engine3d/babylonPhysics.js
// Físicas optimizadas para 60 FPS en Havok V2 (@babylonjs/havok):
// 1. En la banda transportadora: Cuerpos CINEMÁTICOS (PhysicsMotionType.ANIMATED) en lugar de dinámicos.
// 2. Simplificación de Physics Impostors: Colisionadores primitivos invisibles de Caja (PhysicsShapeBox)
//    y Esfera (PhysicsShapeSphere) compartidos en memoria, ignorando por completo la malla .glb real.
// 3. Congelado automático a STATIC en contenedores tras 1.1 s de asentamiento (costo CPU = 0 ms).

import "@babylonjs/core/Physics/joinedPhysicsEngineComponent.js";
import "@babylonjs/core/Physics/v2/physicsEngineComponent.js";
import HavokPhysics from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin.js";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import { PhysicsShapeBox, PhysicsShapeSphere } from "@babylonjs/core/Physics/v2/physicsShape.js";
import { PhysicsMotionType, PhysicsPrestepType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { PROPIEDADES_FISICAS_MATERIAL } from "../core/spawner/itemSpawner.js";

const POSICIONES_CONTENEDOR = Object.freeze({
  separador: { x: -0.3, z: -1.3 },
  escaner: { x: 1.7, z: -1.3 },
  desviador: { x: 3.5, z: -1.3 },
});

const MASCARA_ESTATICA_CONTENEDOR = 1;
const MASCARA_BASURA_CONTENEDOR = 2;

export async function inicializarFisicasBabylon(scene, contenedoresMat, maxAcumulados = 21) {
  let activo = false;
  const cuerposEstaticos = [];
  const formasCompartidas = {};
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

  if (activo) {
    // Impostores primitivos invisibles compartidos (ignoran por completo los triángulos del .glb):
    // - Botellas (plástico / vidrio) -> Bounding Box (PhysicsShapeBox)
    // - Latas de aluminio -> Esfera (PhysicsShapeSphere)
    formasCompartidas.plastico = new PhysicsShapeBox(
      new Vector3(0, PROPIEDADES_FISICAS_MATERIAL.plastico.altoM * 0.5, 0),
      Quaternion.Identity(),
      new Vector3(0.07, PROPIEDADES_FISICAS_MATERIAL.plastico.altoM, 0.07),
      scene,
    );
    formasCompartidas.vidrio = new PhysicsShapeBox(
      new Vector3(0, PROPIEDADES_FISICAS_MATERIAL.vidrio.altoM * 0.5, 0),
      Quaternion.Identity(),
      new Vector3(0.064, PROPIEDADES_FISICAS_MATERIAL.vidrio.altoM, 0.064),
      scene,
    );
    formasCompartidas.aluminio = new PhysicsShapeSphere(
      new Vector3(0, 0.06, 0),
      0.055,
      scene,
    );

    // Formas de colisión filtradas para la banda cinemática (cero colisiones estrechas en Havok)
    formasCompartidas.cinematica = {
      plastico: new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.07, 0.21, 0.07), scene),
      vidrio: new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.064, 0.23, 0.064), scene),
      aluminio: new PhysicsShapeSphere(Vector3.Zero(), 0.055, scene),
    };
    for (const s of Object.values(formasCompartidas.cinematica)) {
      s.filterMembershipMask = 0;
      s.filterCollideMask = 0;
    }

    for (const [tipo, s] of Object.entries(formasCompartidas)) {
      if (tipo === "cinematica") continue;
      s.filterMembershipMask = MASCARA_BASURA_CONTENEDOR;
      s.filterCollideMask = MASCARA_ESTATICA_CONTENEDOR | MASCARA_BASURA_CONTENEDOR;
      s.material = {
        friction: PROPIEDADES_FISICAS_MATERIAL[tipo].friccion,
        restitution: PROPIEDADES_FISICAS_MATERIAL[tipo].restitucion,
      };
    }
  }

  function crearColisionadorCajaInvisible(nombre, sx, sy, sz, x, y, z) {
    const nodo = new TransformNode(nombre, scene);
    nodo.position.set(x, y, z);
    nodo.rotationQuaternion = Quaternion.Identity();
    if (activo) {
      const forma = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(sx, sy, sz), scene);
      forma.filterMembershipMask = MASCARA_ESTATICA_CONTENEDOR;
      forma.filterCollideMask = MASCARA_BASURA_CONTENEDOR;
      forma.material = { friction: 0.65, restitution: 0.15 };
      const cuerpo = new PhysicsBody(nodo, PhysicsMotionType.STATIC, true, scene);
      cuerpo.shape = forma;
      cuerposEstaticos.push({ nodo, cuerpo, forma });
    }
  }

  // Banda y paredes de los 3 contenedores usando exclusivamente cajas invisibles estáticas
  crearColisionadorCajaInvisible("col_banda_kin", 8.0, 0.04, 0.56, 0, 0.795, 0);
  for (const [estId, pos] of Object.entries(POSICIONES_CONTENEDOR)) {
    const [ancho, fondo, alto, esp] = [0.9, 0.7, 0.7, 0.05];
    crearColisionadorCajaInvisible(`col_${estId}_base`, ancho, esp, fondo, pos.x, esp / 2, pos.z);
    crearColisionadorCajaInvisible(`col_${estId}_frente`, ancho, alto, esp, pos.x, alto / 2, pos.z + fondo / 2 - esp / 2);
    crearColisionadorCajaInvisible(`col_${estId}_atras`, ancho, alto, esp, pos.x, alto / 2, pos.z - fondo / 2 + esp / 2);
    crearColisionadorCajaInvisible(`col_${estId}_izq`, esp, alto, fondo, pos.x - ancho / 2 + esp / 2, alto / 2, pos.z);
    crearColisionadorCajaInvisible(`col_${estId}_der`, esp, alto, fondo, pos.x + ancho / 2 - esp / 2, alto / 2, pos.z);
  }

  /**
   * Adjunta un impostor CINEMÁTICO (PhysicsMotionType.ANIMATED) con caja/esfera invisible a un nodo
   * del pool de la banda transportadora, ignorando totalmente la geometría .glb hija.
   */
  function crearImpostorCinematicoBanda(nodoProxy, tipo) {
    if (!activo || !formasCompartidas.cinematica?.[tipo]) return null;
    nodoProxy.rotationQuaternion = Quaternion.Identity();
    const cuerpo = new PhysicsBody(nodoProxy, PhysicsMotionType.ANIMATED, false, scene);
    cuerpo.shape = formasCompartidas.cinematica[tipo];
    // DISABLED evita que Havok re-sincronice matrices en cada frame para objetos puramente cinemáticos
    cuerpo.disablePreStep = true;
    cuerpo.setMassProperties({ mass: 0 });
    return cuerpo;
  }

  function depositarPiezaEnContenedor({ material, estacion, xFinal, zFinal }) {
    const centro = POSICIONES_CONTENEDOR[estacion];
    if (!centro || !contenedoresMat[material]) return;

    if (anilloRecolectados.length >= maxAcumulados) {
      const viejo = anilloRecolectados[cursorAnillo];
      if (viejo.timerDormir) clearTimeout(viejo.timerDormir);
      viejo.cuerpo?.dispose();
      viejo.proxy?.dispose();
      viejo.entradas.dispose();
    }

    // Nodo invisible colisionador (ignora la malla real del .glb)
    const proxy = new TransformNode(`imp_bin_${cursorAnillo}`, scene);
    const px = xFinal ?? centro.x;
    const pz = zFinal ?? centro.z;
    proxy.position.set(px, 0.58, pz);
    proxy.rotationQuaternion = Quaternion.FromEulerAngles(
      (Math.random() - 0.5) * 0.35,
      Math.random() * Math.PI * 2,
      (Math.random() - 0.5) * 0.35,
    );

    const entradas = contenedoresMat[material].instantiateModelsToScene(
      (n) => `bin_${cursorAnillo}_${n}`,
      false,
    );
    const visual = entradas.rootNodes[0];
    visual.parent = proxy;
    visual.position.set(0, 0, 0);
    visual.rotationQuaternion = null;
    for (const m of visual.getChildMeshes()) {
      m.isPickable = false;
      m.doNotSyncBoundingInfo = true;
    }

    let cuerpo = null;
    let timerDormir = null;
    if (activo && formasCompartidas[material]) {
      cuerpo = new PhysicsBody(proxy, PhysicsMotionType.DYNAMIC, false, scene);
      cuerpo.shape = formasCompartidas[material];
      cuerpo.disablePreStep = true;
      cuerpo.setMassProperties({ mass: 0.08 });
      // Tras 1.1 s de asentamiento en el contenedor se congela como STATIC (0 carga en Havok)
      timerDormir = setTimeout(() => {
        if (cuerpo && !cuerpo._isDisposed) {
          cuerpo.setLinearVelocity(Vector3.Zero());
          cuerpo.setAngularVelocity(Vector3.Zero());
          cuerpo.setMotionType(PhysicsMotionType.STATIC);
        }
      }, 1100);
    } else {
      proxy.position.y = 0.05 + (cursorAnillo % 3) * 0.07;
    }

    const reg = { entradas, proxy, cuerpo, timerDormir };
    if (anilloRecolectados.length < maxAcumulados) {
      anilloRecolectados.push(reg);
    } else {
      anilloRecolectados[cursorAnillo] = reg;
    }
    cursorAnillo = (cursorAnillo + 1) % maxAcumulados;
  }

  function limpiarContenedores() {
    for (const r of anilloRecolectados) {
      if (r.timerDormir) clearTimeout(r.timerDormir);
      r.cuerpo?.dispose();
      r.proxy?.dispose();
      r.entradas.dispose();
    }
    anilloRecolectados.length = 0;
    cursorAnillo = 0;
  }

  function dispose() {
    limpiarContenedores();
    for (const e of cuerposEstaticos) {
      e.cuerpo.dispose();
      e.forma.dispose();
      e.nodo.dispose();
    }
    for (const [k, v] of Object.entries(formasCompartidas)) {
      if (k === "cinematica") {
        Object.values(v).forEach((s) => s.dispose());
      } else {
        v.dispose();
      }
    }
  }

  return {
    activo,
    PhysicsPrestepType,
    crearImpostorCinematicoBanda,
    depositarPiezaEnContenedor,
    limpiarContenedores,
    dispose,
  };
}
