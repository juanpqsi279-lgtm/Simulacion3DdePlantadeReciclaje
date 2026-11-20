// src/core/assembly/reglasMontaje.js
// Reglas PURAS de validación del montaje libre y configuración técnica (STEAM).
// Nunca bloquean: solo describen por qué una combinación, posición o parámetro no operará como se espera.
// Sin DOM ni Babylon.js (se prueba desde Node).

/** Centro nominal (x, z) de cada uno de los 9 componentes individuales en la planta. */
export const POSICION_NOMINAL = Object.freeze({
  banda: { x: 0, z: 0 },
  tolva: { x: -3.2, z: 0 },
  separador: { x: -0.8, z: 0 },
  escaner: { x: 1.2, z: 0 },
  desviador: { x: 3.0, z: 0 },
  cont_aluminio: { x: -0.3, z: -1.3 },
  cont_plastico: { x: 1.7, z: -1.3 },
  cont_vidrio: { x: 3.5, z: -1.3 },
  robot_walle: { x: 4.35, z: -1.85 },
});

/** Distancia máxima (m) respecto a la posición nominal para que el módulo siga acoplado a la línea. */
export const TOLERANCIA_POSICION_M = 0.3;
/** Radio (m) del "imán" que acerca una pieza soltada a su posición nominal. */
export const RADIO_IMAN_M = 0.3;
export const PASO_REJILLA_M = 0.05;
export const LIMITE_X_M = 12.0;
export const LIMITE_Z_M = 7.5;

/**
 * Desplazamiento respecto a POSICION_NOMINAL donde cada componente individual espera estacionado
 * en la Zona de Almacén (esquina frontal) antes de ser arrastrado o recogido al inventario.
 */
export const OFFSET_ALMACEN = Object.freeze({
  tolva: { dx: -1.6, dz: 2.75 },        // mundo: (-4.8, 2.75)
  separador: { dx: -2.3, dz: 2.75 },    // mundo: (-3.1, 2.75)
  escaner: { dx: -2.9, dz: 2.75 },      // mundo: (-1.7, 2.75)
  desviador: { dx: -3.4, dz: 2.75 },    // mundo: (-0.4, 2.75)
  cont_aluminio: { dx: 1.2, dz: 4.05 }, // mundo: (0.9, 2.75)
  cont_plastico: { dx: 0.4, dz: 4.05 }, // mundo: (2.1, 2.75)
  cont_vidrio: { dx: -0.2, dz: 4.05 },  // mundo: (3.3, 2.75)
  robot_walle: { dx: 0.35, dz: 4.6 },   // mundo: (4.7, 2.75)
  banda: { dx: 0, dz: 4.05 },           // mundo: (0, 4.05)
});

export const Z_FRONTERA_ALMACEN = 1.85;

const ESTACIONES = ["separador", "escaner", "desviador"];
const CESTOS = ["cont_aluminio", "cont_plastico", "cont_vidrio"];
export const CESTO_POR_ESTACION = Object.freeze({
  separador: "cont_aluminio",
  escaner: "cont_plastico",
  desviador: "cont_vidrio",
});
export const ESTACION_POR_CESTO = Object.freeze({
  cont_aluminio: "separador",
  cont_plastico: "escaner",
  cont_vidrio: "desviador",
});

const NOMBRES = {
  banda: "la banda transportadora",
  tolva: "la tolva de alimentación",
  separador: "el separador de aluminio",
  escaner: "el escáner óptico de plástico",
  desviador: "el desviador de vidrio",
  cont_aluminio: "el cesto de aluminio",
  cont_plastico: "el cesto de plástico PET",
  cont_vidrio: "el cesto de vidrio",
  robot_walle: "el robot recolector WALL-E",
};
const MATERIAL_DE = {
  separador: "aluminio",
  escaner: "plástico PET",
  desviador: "vidrio",
  cont_aluminio: "aluminio",
  cont_plastico: "plástico PET",
  cont_vidrio: "vidrio",
};

/** Parámetros técnicos detallados por componente y valores sugeridos para operar correctamente. */
export const PARAMETROS_MAQUINA_SUGERIDOS = Object.freeze({
  banda: { velocidadBandaMps: 0.65, tensionRodillosPct: 85, potenciaMotorKw: 3.2 },
  tolva: { potenciaVibradorKw: 0.6, aperturaCompuertaPct: 75 },
  separador: { rpmTambor: 2600 },
  escaner: { longitudOndaNm: 1660 },
  desviador: { sensibilidadOpticaPct: 88 },
  robot_walle: { velocidadMps: 3.2 },
});

/** Especificación física, lógica y matemática de las 3 estaciones de detección (enfoque STEAM). */
export const ESPEC_SENSORES = Object.freeze({
  separador: {
    id: "separador",
    titulo: "Estación 1 · Separador de Aluminio",
    material: "aluminio",
    masaG: 15,
    transductorEsperado: "foucault",
    condicionEsperada: "conductividad_alta",
    sincronizacionEsperada: "fifo_roi",
    flujoOptimoLpm: 90,
    flujoMinLpm: 70,
    flujoMaxLpm: 110,
  },
  escaner: {
    id: "escaner",
    titulo: "Estación 2 · Escáner Óptico PET",
    material: "plastico",
    masaG: 25,
    transductorEsperado: "nir",
    condicionEsperada: "absorcion_nir",
    sincronizacionEsperada: "fifo_roi",
    flujoOptimoLpm: 150,
    flujoMinLpm: 120,
    flujoMaxLpm: 180,
  },
  desviador: {
    id: "desviador",
    titulo: "Estación 3 · Desviador de Vidrio",
    material: "vidrio",
    masaG: 200,
    transductorEsperado: "optico",
    condicionEsperada: "refraccion_alta",
    sincronizacionEsperada: "fifo_roi",
    flujoOptimoLpm: 320,
    flujoMinLpm: 260,
    flujoMaxLpm: 380,
  },
});

export const CONFIG_SENSORES_DEFAULT = Object.freeze({
  separador: { transductor: "foucault", condicion: "conductividad_alta", sincronizacion: "fifo_roi", flujoAireLpm: 90 },
  escaner: { transductor: "nir", condicion: "absorcion_nir", sincronizacion: "fifo_roi", flujoAireLpm: 150 },
  desviador: { transductor: "optico", condicion: "refraccion_alta", sincronizacion: "fifo_roi", flujoAireLpm: 320 },
});

const ETIQ_TRANSDUCTOR = {
  foucault: "Corrientes de Foucault",
  nir: "Espectroscopia NIR (1660 nm)",
  optico: "Haz óptico de refracción",
};
const ETIQ_CONDICION = {
  conductividad_alta: "Alta conductividad eléctrica",
  absorcion_nir: "Absorción infrarroja PET",
  refraccion_alta: "Índice de refracción n = 1.52",
};
const ETIQ_SINCRONIA = {
  fifo_roi: "Cola FIFO + retardo d/v",
  inmediato_sin_memoria: "Disparo inmediato (sin memoria)",
};

/** Desplazamiento (m) de un módulo respecto a su posición nominal. */
export function desplazamiento(posiciones, id) {
  const p = posiciones?.[id];
  return p ? Math.hypot(p.dx ?? 0, p.dz ?? 0) : 0;
}

/** Posición mundial (x, z) de un módulo dado su mapa de offsets. */
export function posicionMundo(posiciones, id) {
  const nom = POSICION_NOMINAL[id] ?? { x: 0, z: 0 };
  const p = posiciones?.[id];
  return { x: nom.x + (p?.dx ?? 0), z: nom.z + (p?.dz ?? 0) };
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
 * Evalúa la lógica interna armada para una estación y el alcance balístico de su flujo de aire.
 */
export function evaluarSensorEstacion(estId, cfgSensor) {
  const spec = ESPEC_SENSORES[estId];
  const cfg = cfgSensor ?? CONFIG_SENSORES_DEFAULT[estId];
  if (!spec || !cfg) return null;

  const transductorOk = cfg.transductor === spec.transductorEsperado;
  const condicionOk = cfg.condicion === spec.condicionEsperada;
  const sincronizacionOk = cfg.sincronizacion === spec.sincronizacionEsperada;
  const funcionInternaOk = transductorOk && condicionOk && sincronizacionOk;

  const flujo = Number(cfg.flujoAireLpm) || spec.flujoOptimoLpm;
  const ratioFlujo = flujo / spec.flujoOptimoLpm;
  const alcanceM = +(1.3 * ratioFlujo).toFixed(2);
  const estadoFlujo = alcanceM < 0.99 ? "corto" : alcanceM > 1.61 ? "excesivo" : "optimo";

  return {
    spec,
    transductorOk,
    condicionOk,
    sincronizacionOk,
    funcionInternaOk,
    ratioFlujo,
    alcanceM,
    estadoFlujo,
  };
}

/**
 * Evalúa el montaje actual y los parámetros detallados elegidos por el usuario (sin bloquear jamás).
 * @param {{ instalados: Iterable<string>, orden?: string[], posiciones?: object, operando?: boolean, sensores?: object, parametrosMaquina?: object }} estado
 * @returns {Array<{ id: string, severidad: "aviso"|"info", titulo: string, mensaje: string }>}
 */
export function evaluarMontaje({
  instalados,
  orden = [],
  posiciones = {},
  operando = false,
  sensores = null,
  parametrosMaquina = null,
}) {
  const set = new Set(instalados);
  const tiene = (id) => set.has(id);
  const avisos = [];
  const add = (id, titulo, mensaje, severidad = "aviso") => avisos.push({ id, severidad, titulo, mensaje });

  if (set.size === 0) return avisos;

  const estacionesPresentes = ESTACIONES.filter(tiene);
  const cestosPresentes = CESTOS.filter(tiene);
  const bandaOk = tiene("banda");

  // 1) Dependencias funcionales del montaje
  if (!bandaOk) {
    if (estacionesPresentes.length > 0) {
      add(
        "sin-banda-estaciones",
        "Equipos sin banda transportadora",
        `Montaste ${estacionesPresentes.map((e) => NOMBRES[e]).join(", ")} sin la banda. Al encenderla no llegará material bajo los sensores.`,
      );
    }
    if (tiene("tolva")) {
      add(
        "sin-banda-tolva",
        "Tolva sin banda transportadora",
        "La tolva soltará los envases directamente al suelo porque no hay banda transportadora debajo para recibirlos.",
      );
    }
  }
  if (bandaOk && !tiene("tolva")) {
    add(
      "sin-tolva",
      "Falta la tolva de alimentación",
      "Sin tolva no entra material a la banda: la línea funcionará en vacío.",
      "info",
    );
  }
  if (bandaOk && tiene("tolva") && estacionesPresentes.length === 0) {
    add(
      "sin-estaciones",
      "No hay equipos de separación",
      "La banda lleva el material hasta el final sin separarlo: todo caerá como merma al suelo.",
      "info",
    );
  }
  for (const est of ESTACIONES) {
    if (bandaOk && !tiene(est) && (tiene("tolva") || estacionesPresentes.length > 0)) {
      add(
        `sin-${est}`,
        `Falta ${NOMBRES[est]}`,
        `Sin ${NOMBRES[est]} el ${MATERIAL_DE[est]} no se separa y terminará como merma al final de la banda.`,
        "info",
      );
    }
    const cestoId = CESTO_POR_ESTACION[est];
    if (tiene(est) && !tiene(cestoId)) {
      add(
        `sin-${cestoId}`,
        `Falta ${NOMBRES[cestoId]}`,
        `${NOMBRES[est][0].toUpperCase()}${NOMBRES[est].slice(1)} expulsará el ${MATERIAL_DE[est]}, pero sin su cesto caerá directo al piso.`,
        "info",
      );
    }
  }
  for (const cestoId of cestosPresentes) {
    const estId = ESTACION_POR_CESTO[cestoId];
    if (!tiene(estId)) {
      add(
        `${cestoId}-sin-estacion`,
        `${NOMBRES[cestoId][0].toUpperCase()}${NOMBRES[cestoId].slice(1)} sin separador`,
        `Colocaste ${NOMBRES[cestoId]} sin ${NOMBRES[estId]}: no recibirá envases expulsados hasta que montes su estación.`,
        "info",
      );
    }
  }

  // 2) Posiciones reales de cada pieza colocada
  const posBanda = posicionMundo(posiciones, "banda");
  for (const id of orden) {
    if (!tiene(id) || estaAlineado(posiciones, id)) continue;
    const d = desplazamiento(posiciones, id).toFixed(2);
    if (id === "banda") {
      add(
        "banda-desalineada",
        "Banda fuera de su eje",
        `La banda está a ${d} m de su eje nominal: puede quedar desacoplada respecto a la tolva y a los sensores.`,
      );
    } else if (id === "tolva") {
      const posT = posicionMundo(posiciones, "tolva");
      const sobreBanda = bandaOk && Math.abs(posT.z - posBanda.z) <= 0.42 && Math.abs(posT.x - posBanda.x) <= 3.85;
      add(
        "tolva-desalineada",
        sobreBanda ? "Tolva desplazada sobre la banda" : "Tolva fuera de la banda",
        sobreBanda
          ? `La tolva está a ${d} m de su punto ideal de entrada; las piezas nacerán más adelante sobre la banda.`
          : `La tolva está a ${d} m de su punto de carga (fuera de la banda): los envases caerán directo al suelo.`,
      );
    } else if (CESTOS.includes(id)) {
      add(
        `${id}-desalineado`,
        `${NOMBRES[id][0].toUpperCase()}${NOMBRES[id].slice(1)} fuera de la zona de caída`,
        `Está a ${d} m del punto donde cae el ${MATERIAL_DE[id]} expulsado (z = -1.30 m): los envases caerán al piso.`,
      );
    } else if (id !== "robot_walle") {
      add(
        `${id}-desalineado`,
        `${NOMBRES[id][0].toUpperCase()}${NOMBRES[id].slice(1)} fuera de su punto de trabajo`,
        `Está a ${d} m de la posición de trabajo; si queda fuera del eje de la banda no detectará ${MATERIAL_DE[id]}.`,
      );
    }
  }

  // 3) Solapamientos entre equipos sobre la línea
  const sobreBanda = ["tolva", ...ESTACIONES].filter(tiene);
  for (let i = 0; i < sobreBanda.length; i++) {
    for (let j = i + 1; j < sobreBanda.length; j++) {
      const a = posicionMundo(posiciones, sobreBanda[i]);
      const b = posicionMundo(posiciones, sobreBanda[j]);
      if (Math.abs(a.x - b.x) < 0.6 && Math.abs(a.z - b.z) < 0.9) {
        add(
          `solape-${sobreBanda[i]}-${sobreBanda[j]}`,
          "Equipos superpuestos",
          `${NOMBRES[sobreBanda[i]][0].toUpperCase()}${NOMBRES[sobreBanda[i]].slice(1)} y ${NOMBRES[sobreBanda[j]]} ocupan el mismo tramo.`,
        );
      }
    }
  }

  // 4) Orden del flujo: tolva → aluminio → plástico → vidrio
  const cadena = ["tolva", ...ESTACIONES].filter(tiene);
  for (let i = 0; i < cadena.length - 1; i++) {
    if (posicionMundo(posiciones, cadena[i]).x > posicionMundo(posiciones, cadena[i + 1]).x + 0.05) {
      add(
        `orden-${cadena[i]}-${cadena[i + 1]}`,
        "Orden del flujo invertido",
        `${NOMBRES[cadena[i]][0].toUpperCase()}${NOMBRES[cadena[i]].slice(1)} quedó después de ${NOMBRES[cadena[i + 1]]} a lo largo de la banda.`,
      );
    }
  }

  // 5) Función interna de sensores y flujo de aire (Laboratorio STEAM)
  if (sensores) {
    for (const estId of ESTACIONES) {
      if (!tiene(estId)) continue;
      const cfg = sensores[estId];
      const ev = evaluarSensorEstacion(estId, cfg);
      if (!ev) continue;
      if (!ev.funcionInternaOk) {
        const partesMal = [];
        if (!ev.transductorOk) {
          partesMal.push(`transductor (${ETIQ_TRANSDUCTOR[cfg?.transductor] ?? cfg?.transductor} ≠ ${ETIQ_TRANSDUCTOR[ev.spec.transductorEsperado]})`);
        }
        if (!ev.condicionOk) {
          partesMal.push(`comparador (${ETIQ_CONDICION[cfg?.condicion] ?? cfg?.condicion} ≠ ${ETIQ_CONDICION[ev.spec.condicionEsperada]})`);
        }
        if (!ev.sincronizacionOk) {
          partesMal.push(`sincronización (${ETIQ_SINCRONIA[cfg?.sincronizacion] ?? cfg?.sincronizacion} ≠ ${ETIQ_SINCRONIA[ev.spec.sincronizacionEsperada]})`);
        }
        add(
          `sensor-logica-${estId}`,
          `Lógica interna incorrecta en ${NOMBRES[estId]}`,
          `Los bloques del sensor no corresponden al ${MATERIAL_DE[estId]}: revisa ${partesMal.join(", ")}.`,
        );
      }
      if (ev.estadoFlujo !== "optimo") {
        const flujo = Number(cfg?.flujoAireLpm) || ev.spec.flujoOptimoLpm;
        const cual = ev.estadoFlujo === "corto" ? "se queda corto y caerá antes del cesto" : "es excesivo y pasará de largo tras el cesto";
        add(
          `sensor-flujo-${estId}`,
          `Flujo de aire descalibrado en ${NOMBRES[estId]}`,
          `Con ${flujo} L/min para ${MATERIAL_DE[estId]} (${ev.spec.masaG} g), el alcance es ${ev.alcanceM.toFixed(2)} m (cesto a 1.30 m): ${cual}.`,
        );
      }
    }
  }

  // 6) Parámetros técnicos detallados de cada máquina (con valores sugeridos)
  if (parametrosMaquina) {
    const pm = parametrosMaquina;
    if (tiene("banda") && pm.banda) {
      if (pm.banda.velocidadBandaMps > 1.15) {
        add(
          "param-banda-rapida",
          "Velocidad de banda demasiado alta",
          `A ${pm.banda.velocidadBandaMps.toFixed(2)} m/s (sugerido: 0.65 m/s) los envases cruzan demasiado rápido el ROI y la eficiencia de captura cae.`,
        );
      } else if (pm.banda.velocidadBandaMps < 0.35) {
        add(
          "param-banda-lenta",
          "Velocidad de banda muy baja",
          `A ${pm.banda.velocidadBandaMps.toFixed(2)} m/s (sugerido: 0.65 m/s) la banda puede saturarse en la entrada de la tolva.`,
          "info",
        );
      }
      if (pm.banda.tensionRodillosPct < 65) {
        add(
          "param-banda-tension",
          "Tensión de rodillos insuficiente",
          `Con ${pm.banda.tensionRodillosPct} % de tensión (sugerido: 85 %) la banda patina sobre el rodillo motriz y pierde velocidad real.`,
        );
      }
      if (pm.banda.potenciaMotorKw < 2.0) {
        add(
          "param-banda-motor",
          "Potencia de motor insuficiente",
          `Con ${pm.banda.potenciaMotorKw.toFixed(1)} kW (sugerido: 3.2 kW) el motor de la banda pierde par bajo carga.`,
        );
      }
    }
    if (tiene("tolva") && pm.tolva && pm.tolva.potenciaVibradorKw < 0.3) {
      add(
        "param-tolva-potencia",
        "Potencia del vibrador de tolva muy baja",
        `Con ${pm.tolva.potenciaVibradorKw.toFixed(2)} kW (sugerido: 0.60 kW) la tolva apenas logra dosificar envases a la banda.`,
      );
    }
    if (tiene("separador") && pm.separador && pm.separador.rpmTambor < 1700) {
      add(
        "param-separador-rpm",
        "RPM insuficientes en tambor de Foucault",
        `A ${pm.separador.rpmTambor} RPM (sugerido: 2600 RPM) el campo magnético inducido es débil y muchas latas pasarán sin expulsarse.`,
      );
    }
    if (tiene("escaner") && pm.escaner && (pm.escaner.longitudOndaNm < 1580 || pm.escaner.longitudOndaNm > 1740)) {
      add(
        "param-escaner-nm",
        "Longitud de onda NIR fuera de banda del PET",
        `En ${pm.escaner.longitudOndaNm} nm (sugerido: 1660 nm) el espectrómetro no detecta la banda de absorción del plástico PET.`,
      );
    }
    if (tiene("desviador") && pm.desviador && pm.desviador.sensibilidadOpticaPct < 65) {
      add(
        "param-desviador-sens",
        "Sensibilidad óptica de vidrio demasiado baja",
        `Al ${pm.desviador.sensibilidadOpticaPct} % (sugerido: 88 %) los envases de vidrio no activan el desviador de salida.`,
      );
    }
  }

  // 7) Operación con montaje incompleto
  if (operando) {
    const faltan = Object.keys(NOMBRES).filter((id) => !tiene(id));
    if (faltan.length > 0) {
      add(
        "operando-incompleto",
        "Operando con montaje parcial",
        `Encendida sin ${faltan.map((f) => NOMBRES[f]).join(", ")}. La planta opera tal como la armaste para que observes su comportamiento.`,
        "info",
      );
    }
  }

  return avisos;
}

/**
 * Módulos operativos según el montaje actual (compatibilidad con tests y vista 3D).
 * @returns {{ entrada: boolean, banda: boolean, estaciones: Set<string>, cestos: Set<string>, walle: boolean }}
 */
export function capacidadOperativa({ instalados, posiciones = {} }) {
  const set = new Set(instalados);
  const banda = set.has("banda") && estaAlineado(posiciones, "banda");
  const entrada = banda && set.has("tolva") && estaAlineado(posiciones, "tolva");
  const estaciones = new Set(
    banda ? ESTACIONES.filter((e) => set.has(e) && estaAlineado(posiciones, e)) : [],
  );
  const cestos = new Set(CESTOS.filter((c) => set.has(c)));
  const walle = set.has("robot_walle");
  return { entrada, banda, estaciones, cestos, walle };
}
