# Simulación 3D de Planta de Reciclaje – Lumbreras

Simulación 3D interactiva de una línea industrial que separa **plástico, aluminio y vidrio**.
Incluye ensamblaje paso a paso desde cero, telemetría en vivo y un dashboard con Chart.js.

- **Motor 3D:** Babylon.js ≥ 9 (modelos `.glb`)
- **Frontend:** Vanilla JavaScript (módulos ES), HTML5, CSS3 – sin frameworks, sin TypeScript
- **Gráficas:** Chart.js
- **Empaquetador:** Vite
- **Equipo:** Juan (líder / lógica), Afry (3D), Fabian (frontend / datos), Keith (QA / docs)

## Uso
```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # genera dist/
npm run qa        # tests + validación de modelos y SVG + auditoría de restricciones
```
Abre `?auto=1` en la URL para una demo que ensambla e inicia sola.

## Cómo funciona
1. **Ensamblaje:** el panel lateral monta la planta pieza por pieza (banda → tolva → separadores → contenedores).
2. **Simulación:** al completar el ensamblaje se habilita *Iniciar*. El material entra por la tolva y recorre la banda;
   cada estación detecta su material con una precisión configurable y lo expulsa a su contenedor
   (aluminio: corrientes de Foucault, plástico: escáner óptico + aire, vidrio: compuerta). Lo no detectado va a rechazo.
3. **Telemetría y dashboard:** KPIs, registro de eventos y 4 gráficas (dona, flujo en vivo, clasificadas vs. rechazadas, histórico mock).

## Estructura
```
index.html                  Interfaz (HTML5)
public/manifest.json        Configuración del proyecto y lista de modelos
public/assets/              Modelos .glb y SVG
src/main.js                 Arranque y bucle principal
src/escena3d.js             Babylon.js: escena, carga de .glb, animaciones
src/logica/simulacion.js    Lógica de la línea (JS puro, testeable)
src/logica/ensamblaje.js    Pasos de armado
src/dashboard.js            Gráficas Chart.js
src/ui.js, src/style.css    DOM y estilos
src/mocks/*.json            Datos simulados
tools/                      Generador/validadores de modelos y SVG, auditoría
test/                       Pruebas (node --test)
docs/                       Documentación, objetivos y rúbricas
```

Más detalle: [docs/objetivos-y-rubricas.md](docs/objetivos-y-rubricas.md), [docs/modelos-3d.md](docs/modelos-3d.md), [docs/graficos-svg.md](docs/graficos-svg.md).
