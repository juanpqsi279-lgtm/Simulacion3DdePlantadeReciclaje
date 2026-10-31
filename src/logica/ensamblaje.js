// Ensamblaje paso a paso desde cero (0). Lógica pura: la capa 3D se suscribe a los cambios.

export class Ensamblaje {
  /** @param {{pasos: Array<object>}} datos contenido de mocks/ensamblaje.json */
  constructor(datos, onCambio = () => {}) {
    this.pasos = datos.pasos;
    this.onCambio = onCambio;
    this.completados = 0;
  }

  get total() { return this.pasos.length; }
  get completo() { return this.completados >= this.total; }
  get siguiente() { return this.completo ? null : this.pasos[this.completados]; }
  get progreso() { return this.completados / this.total; }

  avanzar() {
    if (this.completo) return null;
    const paso = this.pasos[this.completados++];
    this.onCambio({ tipo: "paso", paso, indice: this.completados, completo: this.completo });
    return paso;
  }

  reiniciar() {
    this.completados = 0;
    this.onCambio({ tipo: "reinicio" });
  }

  estaInstalado(id) {
    return this.pasos.slice(0, this.completados).some((p) => p.id === id);
  }

  potenciaKw() {
    return this.pasos.slice(0, this.completados).reduce((s, p) => s + p.potenciaKw, 0);
  }

  minutosAcumulados() {
    return this.pasos.slice(0, this.completados).reduce((s, p) => s + p.tiempoEstimadoMin, 0);
  }
}
