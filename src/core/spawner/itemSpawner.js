// src/core/spawner/itemSpawner.js
// Generador modular de residuos reciclables con PRNG determinista (Mulberry32),
// escalonamiento multicarril en Z y validación de zona de despeje en tolva (anti-superposición).

export const PROPIEDADES_FISICAS_MATERIAL = Object.freeze({
  plastico: { radioM: 0.036, altoM: 0.214, restitucion: 0.35, friccion: 0.52 },
  aluminio: { radioM: 0.035, altoM: 0.122, restitucion: 0.28, friccion: 0.44 },
  vidrio: { radioM: 0.033, altoM: 0.234, restitucion: 0.18, friccion: 0.60 },
});

export function crearRng(semilla = 2026) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ItemSpawner {
  /**
   * @param {object} cfg configuración de materiales y línea
   * @param {() => number} [rng]
   */
  constructor(cfg, rng = Math.random) {
    this.cfg = cfg;
    this.rng = rng;
    this.carrilesZ = [-0.17, -0.06, 0.06, 0.17];
    this.reiniciar();
  }

  reiniciar() {
    this.siguienteId = 1;
    this.indiceCarril = 0;
    this.acumuladorSeg = 0;
    this.colaPendiente = 0;
  }

  elegirTipoMaterial() {
    const r = this.rng();
    let acum = 0;
    const entradas = Object.entries(this.cfg.materiales);
    const suma = entradas.reduce((s, [, m]) => s + m.probabilidad, 0);
    for (const [tipo, m] of entradas) {
      acum += m.probabilidad / suma;
      if (r < acum) return tipo;
    }
    return entradas[entradas.length - 1][0];
  }

  /**
   * Busca un carril libre en la zona de caída de la tolva para garantizar cero superposición inicial,
   * incluso cuando el usuario eleva drásticamente "Material por minuto" (hasta 240+ pzs/min).
   */
  buscarPosicionEntradaLibre(itemsActivos) {
    const xBase = this.cfg.linea.xEntrada;
    const margenMinimo = 0.088; // > 2 * radioM máximo (0.072 m) + holgura de seguridad

    for (let intento = 0; intento < this.carrilesZ.length; intento++) {
      const idx = (this.indiceCarril + intento) % this.carrilesZ.length;
      const jitterZ = (this.rng() - 0.5) * 0.028;
      const zCand = this.carrilesZ[idx] + jitterZ;
      const xCand = xBase + (this.rng() - 0.5) * 0.03;

      let libre = true;
      for (const otro of itemsActivos) {
        if (otro.estado !== "banda") continue;
        if (Math.abs(otro.x - xCand) > margenMinimo * 1.4) continue;
        const dx = otro.x - xCand;
        const dz = otro.z - zCand;
        if (dx * dx + dz * dz < margenMinimo * margenMinimo) {
          libre = false;
          break;
        }
      }

      if (libre) {
        this.indiceCarril = (idx + 1) % this.carrilesZ.length;
        return { x: xCand, z: zCand };
      }
    }
    return null;
  }

  /**
   * Procesa el intervalo de tiempo y genera nuevos objetos cuando hay despeje físico en la banda.
   * @param {number} dt
   * @param {number} intervaloSeg
   * @param {Array<object>} itemsActivos
   * @returns {Array<object>} nuevos ítems generados en este paso
   */
  actualizar(dt, intervaloSeg, itemsActivos) {
    this.acumuladorSeg += dt;
    while (this.acumuladorSeg >= intervaloSeg) {
      this.acumuladorSeg -= intervaloSeg;
      // Limita acumulación en tolva para evitar explosión de cola si la banda se detuviera
      if (this.colaPendiente < 12) this.colaPendiente++;
    }

    const creados = [];
    while (this.colaPendiente > 0) {
      const pos = this.buscarPosicionEntradaLibre(itemsActivos);
      if (!pos) break; // Espera al siguiente sub-paso cuando la banda despeje la boca de la tolva
      this.colaPendiente--;
      const tipo = this.elegirTipoMaterial();
      const fis = PROPIEDADES_FISICAS_MATERIAL[tipo];
      const nuevo = {
        id: this.siguienteId++,
        tipo,
        radioM: fis.radioM,
        altoM: fis.altoM,
        masaKg: this.cfg.materiales[tipo].masaKg,
        restitucion: fis.restitucion,
        estado: "banda", // banda | expulsado | rechazo | fin
        x: pos.x,
        y: this.cfg.linea.alturaBandaM,
        z: pos.z,
        vx: this.cfg.linea.velocidadBandaMps * 0.85,
        vz: 0,
        giro: this.rng() * Math.PI * 2,
        velGiro: (this.rng() - 0.5) * 1.2,
        sensadas: new Set(),
        actuadas: new Set(),
        desde: null,
        destino: null,
        progreso: 0,
        destinoId: null,
      };
      itemsActivos.push(nuevo);
      creados.push(nuevo);
    }
    return creados;
  }
}
