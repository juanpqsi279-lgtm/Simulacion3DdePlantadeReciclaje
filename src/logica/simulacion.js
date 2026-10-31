// Lógica de la línea industrial en JavaScript puro. No depende de Babylon.js ni del DOM,
// así que se puede probar con `node --test` y la capa 3D solo "lee" el estado.

export const ESTACIONES = [
  { id: "separador", material: "aluminio", x: -0.35, contenedor: { x: -0.3, z: -1.3 } },
  { id: "escaner", material: "plastico", x: 1.55, contenedor: { x: 1.7, z: -1.3 } },
  { id: "desviador", material: "vidrio", x: 3.0, contenedor: { x: 3.5, z: -1.3 } },
];

const X_FIN_BANDA = 4.0;
const DURACION_EXPULSION = 0.8; // s
const ALTURA_CONTENEDOR = 0.5;

export function crearRng(semilla = 1) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Simulacion {
  /**
   * @param {object} cfg  contenido de mocks/materiales.json
   * @param {{rng?: () => number, onEvento?: (e: object) => void}} [opciones]
   */
  constructor(cfg, opciones = {}) {
    this.cfg = cfg;
    this.rng = opciones.rng ?? Math.random;
    this.onEvento = opciones.onEvento ?? (() => {});
    this.reiniciar();
  }

  reiniciar() {
    this.tiempo = 0;
    this.temporizadorEntrada = 0;
    this.siguienteId = 1;
    this.items = [];
    this.velocidadBanda = this.cfg.linea.velocidadBandaMps;
    this.intervaloEntrada = this.cfg.linea.intervaloEntradaSeg;
    this.estaciones = Object.fromEntries(ESTACIONES.map((e) => [e.id, { activaHasta: -1, expulsiones: 0 }]));
    const tipos = Object.keys(this.cfg.materiales);
    const cero = () => Object.fromEntries(tipos.map((t) => [t, 0]));
    this.metricas = {
      ingresadas: 0,
      clasificadas: cero(),
      rechazadas: cero(),
      masaKg: cero(),
    };
  }

  elegirMaterial() {
    const r = this.rng();
    let acumulado = 0;
    const entradas = Object.entries(this.cfg.materiales);
    const total = entradas.reduce((s, [, m]) => s + m.probabilidad, 0);
    for (const [tipo, m] of entradas) {
      acumulado += m.probabilidad / total;
      if (r < acumulado) return tipo;
    }
    return entradas[entradas.length - 1][0];
  }

  crearItem(tipo = this.elegirMaterial()) {
    const item = {
      id: this.siguienteId++,
      tipo,
      estado: "banda", // banda | expulsado | rechazo | fin
      x: this.cfg.linea.xEntrada,
      y: this.cfg.linea.alturaBandaM,
      z: (this.rng() - 0.5) * 0.3,
      giro: this.rng() * Math.PI * 2,
      evaluadas: new Set(),
      desde: null,
      destino: null,
      progreso: 0,
      destinoId: null,
    };
    this.items.push(item);
    this.metricas.ingresadas++;
    this.onEvento({ tipo: "entrada", item, t: this.tiempo });
    return item;
  }

  /** Avanza la simulación `dt` segundos (ya multiplicado por la velocidad de simulación). */
  actualizar(dt) {
    this.tiempo += dt;
    this.temporizadorEntrada -= dt;
    if (this.temporizadorEntrada <= 0) {
      this.crearItem();
      this.temporizadorEntrada += this.intervaloEntrada;
    }

    for (const it of this.items) {
      if (it.estado === "banda") this.avanzarEnBanda(it, dt);
      else this.avanzarCaida(it, dt);
    }
    this.items = this.items.filter((it) => it.estado !== "fin");
  }

  avanzarEnBanda(it, dt) {
    it.x += this.velocidadBanda * dt;
    for (const est of ESTACIONES) {
      if (it.evaluadas.has(est.id) || it.x < est.x) continue;
      it.evaluadas.add(est.id);
      if (it.tipo !== est.material) continue;
      const precision = this.cfg.materiales[it.tipo].precisionSeparador;
      if (this.rng() < precision) {
        it.estado = "expulsado";
        it.progreso = 0;
        it.desde = { x: it.x, y: it.y, z: it.z };
        it.destino = { x: est.contenedor.x, y: ALTURA_CONTENEDOR, z: est.contenedor.z };
        it.destinoId = est.id;
        this.estaciones[est.id].activaHasta = this.tiempo + 0.9;
        this.estaciones[est.id].expulsiones++;
        this.onEvento({ tipo: "expulsion", item: it, estacion: est.id, t: this.tiempo });
        return;
      }
      this.onEvento({ tipo: "falloDeteccion", item: it, estacion: est.id, t: this.tiempo });
    }
    if (it.x >= X_FIN_BANDA) {
      it.estado = "rechazo";
      it.progreso = 0;
      it.desde = { x: it.x, y: it.y, z: it.z };
      it.destino = { x: it.x + 0.35, y: 0.05, z: it.z };
    }
  }

  avanzarCaida(it, dt) {
    it.progreso += dt / DURACION_EXPULSION;
    const p = Math.min(it.progreso, 1);
    it.x = it.desde.x + (it.destino.x - it.desde.x) * p;
    it.z = it.desde.z + (it.destino.z - it.desde.z) * p;
    const arco = it.estado === "expulsado" ? 0.25 * Math.sin(Math.PI * p) : 0;
    it.y = it.desde.y + (it.destino.y - it.desde.y) * p * p + arco;
    it.giro += dt * 6;
    if (it.progreso < 1) return;
    it.estado = "fin";
    const m = this.cfg.materiales[it.tipo];
    if (it.destinoId) {
      this.metricas.clasificadas[it.tipo]++;
      this.metricas.masaKg[it.tipo] += m.masaKg;
      this.onEvento({ tipo: "clasificada", item: it, t: this.tiempo });
    } else {
      this.metricas.rechazadas[it.tipo]++;
      this.onEvento({ tipo: "rechazada", item: it, t: this.tiempo });
    }
  }

  /** Totales calculados a partir de las métricas. */
  resumen() {
    const suma = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    const clasificadas = suma(this.metricas.clasificadas);
    const rechazadas = suma(this.metricas.rechazadas);
    const procesadas = clasificadas + rechazadas;
    return {
      ingresadas: this.metricas.ingresadas,
      procesadas,
      clasificadas,
      rechazadas,
      eficiencia: procesadas ? clasificadas / procesadas : 0,
      masaKg: suma(this.metricas.masaKg),
      porHora: this.tiempo > 0 ? (procesadas / this.tiempo) * 3600 : 0,
    };
  }
}
