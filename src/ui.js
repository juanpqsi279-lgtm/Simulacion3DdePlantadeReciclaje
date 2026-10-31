// Utilidades de interfaz (DOM) sin frameworks.

const SPRITE = "assets/ui/sprite.svg";

export const $ = (id) => document.getElementById(id);

export function icono(nombre) {
  return `<svg class="ico" aria-hidden="true"><use href="${SPRITE}#icono-${nombre}" /></svg>`;
}

export function formatoTiempo(seg) {
  const s = Math.floor(seg);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function pintarPasos(lista, ensamblaje) {
  lista.innerHTML = ensamblaje.pasos
    .map((p, i) => {
      const hecho = i < ensamblaje.completados;
      const sig = i === ensamblaje.completados;
      const clase = hecho ? "hecho" : sig ? "siguiente" : "";
      const ico = hecho ? "correcto" : p.icono.replace(".svg", "");
      return `<li class="${clase}">${icono(ico)}<div>${i + 1}. ${p.titulo}<small>${p.detalle} · ${p.tiempoEstimadoMin} min · ${p.potenciaKw} kW</small></div></li>`;
    })
    .join("");
}

export function pintarKpis(contenedor, sim, ensamblaje) {
  const r = sim.resumen();
  const kwh = (ensamblaje.potenciaKw() * sim.tiempo) / 3600;
  const datos = [
    ["Tiempo", formatoTiempo(sim.tiempo)],
    ["Ingresadas", r.ingresadas],
    ["Clasificadas", r.clasificadas],
    ["Rechazadas", r.rechazadas],
    ["Eficiencia", `${(r.eficiencia * 100).toFixed(1)} %`],
    ["Masa (kg)", r.masaKg.toFixed(1)],
    ["Piezas/h", Math.round(r.porHora)],
    ["Potencia", `${ensamblaje.potenciaKw().toFixed(1)} kW`],
    ["Energía", `${kwh.toFixed(3)} kWh`],
  ];
  contenedor.innerHTML = datos.map(([n, v]) => `<div class="kpi"><b>${v}</b><span>${n}</span></div>`).join("");
}

export class Registro {
  constructor(ul, max = 80) {
    this.ul = ul;
    this.max = max;
  }
  agregar(texto, clase = "info", t = null) {
    const li = document.createElement("li");
    li.className = clase;
    const marca = document.createElement("span");
    marca.className = "t";
    marca.textContent = t === null ? "--:--" : formatoTiempo(t);
    li.append(marca, document.createTextNode(texto));
    this.ul.prepend(li);
    while (this.ul.children.length > this.max) this.ul.lastChild.remove();
  }
  limpiar() { this.ul.replaceChildren(); }
}
