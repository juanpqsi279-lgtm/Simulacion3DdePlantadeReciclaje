# Objetivos y Rúbricas de Evaluación

Proyecto: **Planta de Reciclaje en Lumbreras – Gemelo Digital 3D (v2.0)**.

## 1. Objetivo General
Construir y optimizar un **Gemelo Digital 3D interactivo** de una línea industrial clasificadora de residuos reciclables (**plástico PET, aluminio y vidrio**), integrando ensamblaje progresivo gobernado por Máquina de Estados, telemetría desacoplada por Bus de Eventos (Pub/Sub), renderizado PBR fotorrealista en **Babylon.js v9+** y analítica en tiempo real con **Chart.js**, cumpliendo estrictamente el uso exclusivo de **Vanilla JavaScript (ES6), HTML5 y CSS3**.

## 2. Objetivos Específicos
1. Desacoplar el motor 3D de la capa de presentación mediante un **Event Bus (Pub/Sub)** ligero en JavaScript nativo.
2. Renderizar los activos `.glb` con calidad industrial mediante **entorno HDRI (`HDRCubeTexture`)**, materiales **PBR** calibrados, **sombras suaves de contacto (`Contact Hardening Shadows`)** y **`DefaultRenderingPipeline` (MSAA 4x + Bloom + ACES)**.
3. Gestionar los 6 pasos de montaje y la operación mediante una **Máquina de Estados Finita (`FASE_0`..`FASE_6`, `PAUSADO`, `OPERANDO`)** con apariciones progresivas (`scaling` + `alpha`).
4. Garantizar estabilidad física sin superposiciones a alta cadencia (**hasta 240 piezas/min**) combinando **Spatial Hashing $O(N)$**, **Object Pooling** y **Babylon.js Physics V2 (`@babylonjs/havok`)**.
5. Alimentar dinámicamente tiempos, potencias (kW) y parámetros iniciales desde `public/manifest.json` y los *mocks* JSON, auditando automáticamente la ausencia total de TypeScript, frameworks y modelos `.obj`.

## 3. Matriz de Rúbrica y Verificación Automática

| Criterio | Requisito Estricto | Evidencia en el Repositorio | Verificación |
|---|---|---|---|
| **Motor 3D y Pipeline** | Babylon.js $\ge$ 9.0, HDRI PBR, MSAA, Bloom, Contact Shadows | `src/engine3d/renderingPipeline.js`, `src/engine3d/pbrEnhancer.js` | `npm run auditar` |
| **Arquitectura Frontend** | Vanilla JS (ES6 `import`/`export`), HTML5, CSS3; cero React/Vue/Angular | `src/core/`, `src/engine3d/`, `src/ui/`, `src/analytics/` | `npm run auditar` |
| **Desacoplamiento Pub/Sub** | `src/engine3d/` sin acceso directo al DOM; comunicación vía `EventBus` | `src/core/bus/eventBus.js`, `src/engine3d/sceneController.js` | `npm run test`, `npm run auditar` |
| **Máquina de Estados** | Estados `FASE_0`..`FASE_6`, `PAUSADO`, `OPERANDO` + animación scaling/alpha | `src/core/state/plantStateMachine.js`, `src/engine3d/sceneController.js` | `npm run test` |
| **Físicas y Escalabilidad** | Havok V2 + colisiones sin *glitches* hasta 240 pzs/min + Object Pool | `src/core/physics/conveyorPhysics.js`, `src/engine3d/babylonPhysics.js`, `src/engine3d/objectPool.js` | `npm run test` |
| **Lenguaje** | 100 % JavaScript nativo; cero TypeScript (`.ts`, `tsconfig.json`) | Todo el árbol `src/`, `tools/`, `test/` | `npm run auditar` |
| **Formatos 3D y Vectores** | Exclusivamente `.glb`/`.gltf` y `.svg`; cero `.obj` o bitmaps UI | `public/assets/models/`, `public/assets/ui/` | `npm run validar:modelos`, `npm run validar:svg` |
| **Analítica y UI Responsiva** | 4 gráficas Chart.js + panel lateral colapsable + microinteracciones CSS3 | `src/analytics/chartsController.js`, `src/ui/domController.js`, `src/styles/main.css` | Inspección visual / `index.html` |
| **Datos y Configuración** | Carga dinámica de `public/manifest.json` + `src/mocks/*.json` | `src/config/configLoader.js`, `public/manifest.json` | `npm run test` |

## 4. Comandos de Auditoría y Ejecución
```bash
npm install
npm run qa        # Ejecuta pruebas unitarias/estrés + validador GLB + validador SVG + auditoría estricta
npm run dev       # Servidor de desarrollo Vite
npm run build     # Empaquetado optimizado de producción en dist/
```
