// src/core/assembly/reglasMontaje.js
// Reglas PURAS de validación del montaje libre. Nunca bloquean: solo describen por qué una
// combinación, secuencia o posición elegida por el usuario no funcionará como espera.
// Sin DOM ni Babylon.js (se prueba desde Node).

/** Centro nominal (x, z) de cada módulo: donde la lógica de la planta espera encontrarlo. */
export const POSICION_NOMINAL = Object.freeze({
  banda: { x: 0, z: 0 },
  tolva: { x: -3.2, z: 0 },
  separador: { x: -0.8, z: 0 },
  escaner: { x: 1.2, z: 0 },
  desviador: { x: 3.0, z: 0 },
  contenedores: { x: 1.7, z: -1.3 },
});

/** Distancia máxima (m) respecto a la posición nominal para que el módulo siga acoplado a la línea. */
export const TOLERANCIA_POSICION_M = 0.3;
/** Radio (m) del "imán" que acerca una pieza soltada a su posición nominal. */
export const RADIO_IMAN_M = 0.3;
export const PASO_REJILLA_M = 0.05;
export const LIMITE_X_M = 6.5;
export const LIMITE_Z_M = 4.0;

const ESTACIONES = ["separador", "escaner", "desviador"];

const NOMBRES = {
  banda: "la banda transportadora",
  tolva: "la tolva de alimentación",
  separador: "el separador de aluminio",
  escaner: "el escáner óptico de plástico",
  desviador: "el desviador de vidrio",
  contenedores: "los contenedores de salida",
};
const MATERIAL_DE = { separador: "aluminio", escaner: "plástico PET", desviador: "vidrio" };

/** Desplazamiento (m) de un módulo respecto a su posición nominal. */
export function desplazamiento(posiciones, id) {
  const p = posiciones?.[id];
  return p ? Math.hypot(p.dx ?? 0, p.dz ?? 0) : 0;
}

/** Un módulo está "en su sitio" si fue colocado dentro de la tolerancia de su posición nominal. */
export function estaAlineado(posiciones, id) {
  return desplazamiento(posiciones, id) <= TOLERANCIA_POSICION_M + 1e-9;
}

/** Acerca (x, z) relativos al nominal a la rejilla, o al nominal exacto si cae dentro del imán. */
export function ajustarOffset(dx, dz) {
  const lim = (v, m) => Math.max(-m, Math.min(m, v));
  let x = lim(dx, LIMITE_X_M);
  let z = lim(dz, LIMITE_Z_M);
  if (Math.hypot(x, z) <= RADIO_IMAN_M) return { dx: 0, dz: 0 };
  x = Math.round(x / PASO_REJILLA_M) * PASO_REJILLA_M;
  z = Math.round(z / PASO_REJILLA_M) * PASO_REJILLA_M;
  return { dx: +x.toFixed(3), dz: +z.toFixed(3) };
}

/**
 * Evalúa el montaje actual.
 * @param {{ instalados: Iterable<string>, orden?: string[], posiciones?: object, operando?: boolean }} estado
 * @returns {Array<{ id: string, severidad: "aviso"|"info", titulo: string, mensaje: string }>}
 */
export function evaluarMontaje({ instalados, orden = [], posiciones = {}, operando = false }) {
  const set = new Set(instalados);
  const tiene = (id) => set.has(id);
  const avisos = [];
  const add = (id, titulo, mensaje, severidad = "aviso") => avisos.push({ id, severidad, titulo, mensaje });

  if (set.size === 0) return avisos;

  const estacionesPresentes = ESTACIONES.filter(tiene);
  const bandaOk = tiene("banda");

  // 1) Dependencias de la secuencia de montaje
  if (!bandaOk) {
    if (estacionesPresentes.length > 0) {
      add(
        "sin-banda-estaciones",
        "Equipos sin banda transportadora",
        `Montaste ${estacionesPresentes.map((e) => NOMBRES[e]).join(", ")} sin la banda. Estos equipos clasifican el material que ` +
          "viaja sobre la banda; sin ella no llega nada que sensar ni expulsar.",
      );
    }
    if (tiene("tolva")) {
      add(
        "sin-banda-tolva",
        "Tolva sin banda transportadora",
        "La tolva deja caer el material mezclado sobre la banda. Sin banda, el material no tiene por dónde avanzar.",
      );
    }
  }
  if (bandaOk && !tiene("tolva")) {
    add(
      "sin-tolva",
      "Falta la tolva de alimentación",
      "Sin tolva no entra material a la banda: la línea funcionará en vacío (no se generarán piezas nuevas).",
      "info",
    );
  }
  if (bandaOk && tiene("tolva") && estacionesPresentes.length === 0) {
    add(
      "sin-estaciones",
      "No hay equipos de separación",
      "La banda lleva el material hasta el final sin separarlo: todo caerá como merma.",
      "info",
    );
  }
  for (const est of ESTACIONES) {
    if (bandaOk && !tiene(est) && (tiene("tolva") || estacionesPresentes.length > 0)) {
      add(
        `sin-${est}`,
        `Falta ${NOMBRES[est]}`,
        `Sin ${NOMBRES[est]} el ${MATERIAL_DE[est]} no se separa y terminará en la merma del final de la banda.`,
        "info",
      );
    }
  }
  if (tiene("contenedores") && estacionesPresentes.length === 0) {
    add(
      "contenedores-sin-estaciones",
      "Contenedores sin equipos de separación",
      "Los contenedores reciben las piezas expulsadas por los separadores. Sin separadores no recibirán ningún material.",
    );
  }
  if (!tiene("contenedores") && estacionesPresentes.length > 0) {
    add(
      "sin-contenedores",
      "Faltan los contenedores de salida",
      "Los separadores expulsarán piezas pero no hay dónde recibirlas: caerán al piso sin ser recolectadas.",
      "info",
    );
  }

  // 2) Posiciones: la lógica de la planta espera cada módulo en su punto de trabajo
  for (const id of orden) {
    if (!tiene(id) || estaAlineado(posiciones, id)) continue;
    const d = desplazamiento(posiciones, id).toFixed(2);
    if (id === "banda") {
      add(
        "banda-desalineada",
        "Banda fuera de su eje",
        `La banda está a ${d} m de su posición de trabajo: ya no queda bajo la tolva ni los sensores, por lo que el flujo no será procesado por el resto de la línea.`,
      );
    } else if (id === "tolva") {
      add(
        "tolva-desalineada",
        "Tolva desplazada",
        `La tolva está a ${d} m de su punto de carga: el material no caerá sobre el inicio de la banda y no entrará a la línea.`,
      );
    } else if (id === "contenedores") {
      add(
        "contenedores-desalineados",
        "Contenedores fuera de las compuertas",
        `Los contenedores están a ${d} m de su posición: las piezas expulsadas seguirán su trayectoria original y no caerán dentro de ellos.`,
      );
    } else {
      add(
        `${id}-desalineado`,
        `${NOMBRES[id][0].toUpperCase()}${NOMBRES[id].slice(1)} fuera de su punto de trabajo`,
        `Está a ${d} m de la posición donde su sensor y su actuador alcanzan la banda; en esa posición no detectará ${MATERIAL_DE[id]} y lo dejará pasar.`,
      );
    }
  }

  // 3) Solapamientos entre equipos (comparten el mismo tramo de la banda)
  const sobreBanda = ["tolva", ...ESTACIONES].filter(tiene);
  const centro = (id) => ({
    x: POSICION_NOMINAL[id].x + (posiciones[id]?.dx ?? 0),
    z: POSICION_NOMINAL[id].z + (posiciones[id]?.dz ?? 0),
  });
  for (let i = 0; i < sobreBanda.length; i++) {
    for (let j = i + 1; j < sobreBanda.length; j++) {
      const a = centro(sobreBanda[i]);
      const b = centro(sobreBanda[j]);
      if (Math.abs(a.x - b.x) < 0.6 && Math.abs(a.z - b.z) < 0.9) {
        add(
          `solape-${sobreBanda[i]}-${sobreBanda[j]}`,
          "Equipos superpuestos",
          `${NOMBRES[sobreBanda[i]][0].toUpperCase()}${NOMBRES[sobreBanda[i]].slice(1)} y ${NOMBRES[sobreBanda[j]]} ocupan el mismo tramo: ` +
            "se estorbarían físicamente y sus sensores se confundirían.",
        );
      }
    }
  }

  // 4) Orden del flujo: tolva → aluminio → plástico → vidrio
  const cadena = ["tolva", ...ESTACIONES].filter(tiene);
  for (let i = 0; i < cadena.length - 1; i++) {
    if (centro(cadena[i]).x > centro(cadena[i + 1]).x + 0.05) {
      add(
        `orden-${cadena[i]}-${cadena[i + 1]}`,
        "Orden del flujo invertido",
        `${NOMBRES[cadena[i]][0].toUpperCase()}${NOMBRES[cadena[i]].slice(1)} quedó después de ${NOMBRES[cadena[i + 1]]} a lo largo de la banda; ` +
          "el material pasaría por los equipos en un orden distinto al previsto.",
      );
    }
  }

  // 5) Operación con montaje incompleto
  if (operando) {
    const faltan = Object.keys(NOMBRES).filter((id) => !tiene(id));
    if (faltan.length > 0) {
      add(
        "operando-incompleto",
        "Operando con la planta incompleta",
        `La planta está en marcha sin ${faltan.map((f) => NOMBRES[f]).join(", ")}. Funcionará solo parcialmente.`,
        "aviso",
      );
    }
  }

  return avisos;
}

/**
 * Módulos que la simulación debe considerar operativos según el montaje elegido.
 * @returns {{ entrada: boolean, banda: boolean, estaciones: Set<string> }}
 */
export function capacidadOperativa({ instalados, posiciones = {} }) {
  const set = new Set(instalados);
  const banda = set.has("banda") && estaAlineado(posiciones, "banda");
  const entrada = banda && set.has("tolva") && estaAlineado(posiciones, "tolva");
  const estaciones = new Set(
    banda ? ESTACIONES.filter((e) => set.has(e) && estaAlineado(posiciones, e)) : [],
  );
  return { entrada, banda, estaciones };
}
