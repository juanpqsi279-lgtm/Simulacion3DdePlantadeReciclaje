// src/engine3d/objectPool.js
// Pool de objetos 3D pre-instanciados sobre los AssetContainer (.glb) de Babylon.js.
// Evita alloc/dispose durante el bucle de renderizado para sostener 50-60 FPS incluso a 240 pzs/min.

export class MaterialObjectPool {
  /**
   * @param {Record<string, import("@babylonjs/core/assetContainer.js").AssetContainer>} contenedoresMat
   * @param {import("@babylonjs/core/Lights/Shadows/shadowGenerator.js").ShadowGenerator} generadorSombras
   * @param {number} [precalentamientoPorTipo]
   */
  constructor(contenedoresMat, generadorSombras, precalentamientoPorTipo = 18) {
    this.contenedores = contenedoresMat;
    this.sombras = generadorSombras;
    /** @type {Record<string, Array<{raiz: any, entradas: any}>>} */
    this.libres = {};
    /** @type {Map<number, {tipo: string, raiz: any, entradas: any}>} */
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
    const entradas = this.contenedores[tipo].instantiateModelsToScene(
      (nombre) => `pool_${tipo}_${id}_${nombre}`,
      false,
    );
    const raiz = entradas.rootNodes[0];
    raiz.rotationQuaternion = null;
    raiz.setEnabled(false);
    for (const mesh of raiz.getChildMeshes()) {
      this.sombras?.addShadowCaster(mesh);
      mesh.receiveShadows = true;
    }
    return { tipo, raiz, entradas };
  }

  adquirir(itemId, tipo) {
    let slot = this.enUso.get(itemId);
    if (slot) return slot;
    slot = this.libres[tipo]?.pop() ?? this._instanciarNuevo(tipo);
    slot.raiz.scaling.setAll(1);
    slot.raiz.setEnabled(true);
    this.enUso.set(itemId, slot);
    return slot;
  }

  liberar(itemId) {
    const slot = this.enUso.get(itemId);
    if (!slot) return;
    slot.raiz.setEnabled(false);
    this.enUso.delete(itemId);
    this.libres[slot.tipo].push(slot);
  }

  sincronizarConItems(itemsSimulados) {
    const idsVivos = new Set();
    for (const it of itemsSimulados) {
      idsVivos.add(it.id);
      const slot = this.adquirir(it.id, it.tipo);
      slot.raiz.position.set(it.x, it.y, it.z);
      slot.raiz.rotation.set(0, it.giro, 0);
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
      for (const s of lista) s.entradas.dispose();
    }
    this.libres = {};
  }
}
