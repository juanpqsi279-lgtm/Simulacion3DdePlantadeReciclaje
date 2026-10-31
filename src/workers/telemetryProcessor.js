// src/workers/telemetryProcessor.js
// Motor estadístico puro en Vanilla JS ejecutado dentro del Web Worker (fuera del Main Thread).
// Agrega contadores, balances de masa/energía, promedios móviles y prepara las series listas
// para que Chart.js y el DOM solo pinten sin realizar cálculos en el hilo de renderizado 3D.

const MAX_MUESTRAS_SERIE = 36;

export class TelemetryProcessor {
  /**
   * @param {string[]} [tiposMaterial] orden canónico de materiales para Chart.js
   */
  constructor(tiposMaterial = ["plastico", "aluminio", "vidrio"]) {
    this.tipos = tiposMaterial;
    this.reiniciar();
  }

  reiniciar() {
    const ceros = () => Object.fromEntries(this.tipos.map((t) => [t, 0]));
    this.tiempo = 0;
    this.ultimoTiempoPulso = 0;
    this.potenciaKw = 0;
    this.energiaKwh = 0;
    this.enTransito = 0;
    this.colisionesResueltas = 0;

    this.ingresadas = 0;
    this.deteccionesPositivas = 0;
    this.clasificadasPorTipo = ceros();
    this.rechazadasPorTipo = ceros();
    this.masaRecuperadaPorTipo = ceros();
    this.masaMermaPorTipo = ceros();

    // Ventana deslizante para la serie temporal de Chart.js
    this.ultimoTiempoSerie = 0;
    this.ultimasProcesadasSerie = 0;
    this.ultimasDeteccionesSerie = 0;
    this.flujoLabels = [];
    this.flujoSalida = [];
    this.flujoSensado = [];
  }

  /**
   * Procesa un lote de eventos crudos enviados desde el hilo principal.
   * @param {Array<{tipo: string, payload?: any}>} lote
   */
  procesarLote(lote) {
    for (let i = 0; i < lote.length; i++) {
      const msg = lote[i];
      const p = msg.payload;
      switch (msg.tipo) {
        case "REINICIAR":
          this.reiniciar();
          break;
        case "INGRESO":
          this.ingresadas++;
          break;
        case "DETECCION":
          if (p?.detectado) this.deteccionesPositivas++;
          break;
        case "CLASIFICADO":
          if (p && p.material in this.clasificadasPorTipo) {
            this.clasificadasPorTipo[p.material]++;
            this.masaRecuperadaPorTipo[p.material] += p.masaKg || 0;
          }
          break;
        case "RECHAZADO":
          if (p && p.material in this.rechazadasPorTipo) {
            this.rechazadasPorTipo[p.material]++;
            this.masaMermaPorTipo[p.material] += p.masaKg || 0;
          }
          break;
        case "PULSO_TIEMPO":
          if (p) {
            const dt = Math.max(0, p.tiempo - this.ultimoTiempoPulso);
            this.ultimoTiempoPulso = p.tiempo;
            this.tiempo = p.tiempo;
            this.potenciaKw = p.potenciaKw ?? this.potenciaKw;
            this.enTransito = p.enTransito ?? this.enTransito;
            this.colisionesResueltas = p.colisionesResueltas ?? this.colisionesResueltas;
            this.energiaKwh += (this.potenciaKw * dt) / 3600;
            this._actualizarVentanaTemporal();
          }
          break;
      }
    }
  }

  _actualizarVentanaTemporal() {
    if (this.tiempo - this.ultimoTiempoSerie < 2.0) return;
    const dt = this.tiempo - this.ultimoTiempoSerie;
    const procActual = this._sumar(this.clasificadasPorTipo) + this._sumar(this.rechazadasPorTipo);

    const tasaSalida = Math.round(((procActual - this.ultimasProcesadasSerie) / dt) * 60);
    const tasaSensado = Math.round(((this.deteccionesPositivas - this.ultimasDeteccionesSerie) / dt) * 60);

    this.flujoLabels.push(`${Math.round(this.tiempo)}s`);
    this.flujoSalida.push(Math.max(0, tasaSalida));
    this.flujoSensado.push(Math.max(0, tasaSensado));

    if (this.flujoLabels.length > MAX_MUESTRAS_SERIE) {
      this.flujoLabels.shift();
      this.flujoSalida.shift();
      this.flujoSensado.shift();
    }

    this.ultimasProcesadasSerie = procActual;
    this.ultimasDeteccionesSerie = this.deteccionesPositivas;
    this.ultimoTiempoSerie = this.tiempo;
  }

  _sumar(mapa) {
    let s = 0;
    for (const k of this.tipos) s += mapa[k] || 0;
    return s;
  }

  /** Construye el snapshot estadístico inmutable y los arreglos precalculados para Chart.js. */
  generarSnapshot() {
    const clasificadas = this._sumar(this.clasificadasPorTipo);
    const rechazadas = this._sumar(this.rechazadasPorTipo);
    const procesadas = clasificadas + rechazadas;
    const masaRecuperadaKg = this._sumar(this.masaRecuperadaPorTipo);
    const masaMermaKg = this._sumar(this.masaMermaPorTipo);

    const dona = this.tipos.map((t) => this.clasificadasPorTipo[t]);
    const barrasClasificadas = dona.slice();
    const barrasMerma = this.tipos.map((t) => this.rechazadasPorTipo[t]);

    return {
      tiempo: this.tiempo,
      ingresadas: this.ingresadas,
      enTransito: this.enTransito,
      procesadas,
      clasificadas,
      rechazadas,
      purezaPct: procesadas > 0 ? (clasificadas / procesadas) * 100 : 0,
      masaRecuperadaKg,
      masaMermaKg,
      porMinuto: this.tiempo > 0 ? (procesadas / this.tiempo) * 60 : 0,
      porHora: this.tiempo > 0 ? (procesadas / this.tiempo) * 3600 : 0,
      potenciaKw: this.potenciaKw,
      energiaKwh: this.energiaKwh,
      whPorKg: masaRecuperadaKg > 0 ? (this.energiaKwh * 1000) / masaRecuperadaKg : 0,
      colisionesResueltas: this.colisionesResueltas,
      clasificadasPorTipo: { ...this.clasificadasPorTipo },
      rechazadasPorTipo: { ...this.rechazadasPorTipo },
      seriesChart: {
        dona,
        barrasClasificadas,
        barrasMerma,
        flujoLabels: this.flujoLabels.slice(),
        flujoSalida: this.flujoSalida.slice(),
        flujoSensado: this.flujoSensado.slice(),
      },
    };
  }
}
