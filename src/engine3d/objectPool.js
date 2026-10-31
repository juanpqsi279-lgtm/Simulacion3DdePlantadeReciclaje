// src/engine3d/objectPool.js
// Pool de objetos 3D con Impostores Cinemáticos (PhysicsMotionType.ANIMATED) sobre proxy invisible.
// Desacopla la malla .glb (isPickable = false, doNotSyncBoundingInfo = true, sin sombras dinámicas caras)
// para sostener 60 FPS constantes en Babylon.js v9+.

import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";

export class MaterialObjectPool {
  /**
   * @param {import("@babylonjs/core/scene.js").Scene} scene
   * @param {Record<string, import("@babylonjs/core/assetContainer.js").AssetContainer>} contenedoresMat
   * @param {{ crearImpostorCinematicoBanda?: (nodo: TransformNode, tipo: string) => any }} [fisicasBabylon]
   * @param {number} [precalentamientoPorTipo]
   */
  constructor(scene, contenedoresMat, fisicasBabylon = null, precalentamientoPorTipo = 20) {
    this.scene = scene;
    this.contenedores = contenedoresMat;
    this.fisicas = fisicasBabylon;
    this.libres = {};
    this.enUso = new Map();
    this._contadorInstancia = 0;

    for (const tipo of Object.keys(contenedoresMat)) {
      this.libres[tipo] = [];
      for (let i = 0; i < precalentamientoPorTipo; i++) {
        this.libres[tipo].push(this._instanciarNuevo(tipo));
      }
    }
  }

  _instanciarNuevo(tipo) {
    const id = ++this._contadorInstancia;
    // Proxy invisible que recibe el PhysicsBody Cinemático (caja o esfera, ignorando la malla .glb)
    const proxy = new TransformNode(`kin_proxy_${tipo}_${id}`, this.scene);
    proxy.rotationQuaternion = Quaternion.Identity();
    proxy.setEnabled(false);

    const entradas = this.contenedores[tipo].instantiateModelsToScene(
      (nombre) => `pool_${tipo}_${id}_${nombre}`,
      false,
    );
    const visual = entradas.rootNodes[0];
    visual.parent = proxy;
    visual.position.set(0, 0, 0);
    visual.rotationQuaternion = null;

    // Desactivar picking por triángulos y evitar recálculo de frustum culling en las pocas piezas activas en banda
    for (const mesh of visual.getChildMeshes()) {
      mesh.isPickable = false;
      mesh.alwaysSelectAsActiveMesh = true;
    }

    const cuerpoCinematico = this.fisicas?.crearImpostorCinematicoBanda?.(proxy, tipo) ?? null;
    return { tipo, proxy, visual, entradas, cuerpoCinematico };
  }

  adquirir(itemId, tipo) {
    let slot = this.enUso.get(itemId);
    if (slot) return slot;
    slot = this.libres[tipo]?.pop() ?? this._instanciarNuevo(tipo);
    slot.proxy.scaling.setAll(1);
    slot.proxy.setEnabled(true);
    if (slot.cuerpoCinematico) {
      slot.cuerpoCinematico.disablePreStep = false;
    }
    this.enUso.set(itemId, slot);
    return slot;
  }

  liberar(itemId) {
    const slot = this.enUso.get(itemId);
    if (!slot) return;
    if (slot.cuerpoCinematico) {
      slot.cuerpoCinematico.disablePreStep = true;
    }
    slot.proxy.setEnabled(false);
    this.enUso.delete(itemId);
    this.libres[slot.tipo].push(slot);
  }

  sincronizarConItems(itemsSimulados) {
    const idsVivos = new Set();
    for (let i = 0; i < itemsSimulados.length; i++) {
      const it = itemsSimulados[i];
      idsVivos.add(it.id);
      const slot = this.adquirir(it.id, it.tipo);
      slot.proxy.position.set(it.x, it.y, it.z);
      Quaternion.FromEulerAnglesToRef(0, it.giro, 0, slot.proxy.rotationQuaternion);
    }
    for (const id of [...this.enUso.keys()]) {
      if (!idsVivos.has(id)) this.liberar(id);
    }
  }

  liberarTodos() {
    for (const id of [...this.enUso.keys()]) this.liberar(id);
  }

  dispose() {
    this.liberarTodos();
    for (const lista of Object.values(this.libres)) {
      for (const s of lista) {
        s.cuerpoCinematico?.dispose();
        s.entradas.dispose();
        s.proxy.dispose();
      }
    }
    this.libres = {};
  }
}
