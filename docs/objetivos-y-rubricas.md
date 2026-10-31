# Objetivos y rúbricas de evaluación

Proyecto: **Planta de reciclaje en Lumbreras – Simulación 3D**.

## Objetivo principal
Construir una simulación 3D interactiva de una línea industrial que separa materiales reciclables
(**plástico, aluminio y vidrio**), mostrando el armado desde cero con telemetría y datos visuales,
usando solo tecnologías web nativas (sin frameworks de alto nivel).

## Objetivos específicos
1. Renderizar la planta y su maquinaria en 3D con **Babylon.js ≥ 9** (modelos `.glb`).
2. Simular la línea con lógica en **JavaScript puro**: entrada de material, banda, detección y expulsión por estación.
3. Guiar el **ensamblaje paso a paso desde cero (0)** con su telemetría (tiempo estimado, potencia).
4. Mostrar métricas en un **dashboard con Chart.js**.
5. Gestionar datos simulados (`src/mocks/*.json`) y la configuración del proyecto (`public/manifest.json`).

## Rúbrica de evaluación y evidencia

| Criterio | Cumplimiento esperado | Evidencia |
|---|---|---|
| Motor gráfico | Babylon.js ≥ 9; sin Three.js ni Canvas 2D | `package.json`, `src/escena3d.js`, `npm run auditar` |
| Arquitectura | Vanilla JS con módulos ES, HTML5, CSS3; sin React/Angular/Vue/Svelte | `src/`, `index.html`, `npm run auditar` |
| Lenguaje | JavaScript nativo, sin TypeScript | `npm run auditar` |
| Formatos 3D | Solo `.glb`/`.gltf`; sin `.obj` | `npm run validar:modelos` |
| Vectores | Gráficos de interfaz en SVG | `public/assets/ui/`, `npm run validar:svg` |
| Visualización | Gráficas con Chart.js (sin D3/Recharts) | `src/dashboard.js` |
| Entorno | Node.js + Vite básico, sin plugins de frameworks | `vite.config.js` |
| Simulación | Separación de los 3 materiales en tiempo real | `src/logica/simulacion.js`, `npm test` |
| Telemetría / ensamblaje | Pasos desde cero + KPIs + registro | `src/logica/ensamblaje.js`, panel lateral |
| Datos mock y manifest | Mocks JSON y `manifest.json` válidos | `src/mocks/`, `public/manifest.json` |
| Calidad | Pruebas automáticas y auditoría sin errores | `npm run qa` |

## Verificación rápida
```bash
npm install
npm run qa        # pruebas + validación de modelos + validación SVG + auditoría de restricciones
npm run dev       # desarrollo (http://localhost:5173)
npm run build     # versión para despliegue en dist/
```
