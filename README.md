# Planta de Reciclaje en Lumbreras · Gemelo Digital 3D

Simulación 3D interactiva con arquitectura de **Gemelo Digital Industrial** para una línea automatizada de separación de **plástico PET, aluminio y vidrio**, construida estrictamente con **Vanilla JavaScript (Módulos ES6), HTML5, CSS3, Babylon.js v9+ (con Havok Physics V2) y Chart.js**.

## Características Principales
- **Arquitectura Multicapa con Bus Pub/Sub (`src/core/bus/eventBus.js`):** Desacoplamiento total entre el motor 3D WebGL2 y el DOM / Chart.js.
- **Máquina de Estados Finita (`src/core/state/plantStateMachine.js`):** Gestiona los 6 pasos de ensamblaje (`FASE_0`..`FASE_6`) y la operación (`PAUSADO`, `OPERANDO`), animando progresivamente las mallas en Babylon.js mediante interpolación `scaling` + `alpha`.
- **Calidad Visual PBR + HDRI (`src/engine3d/renderingPipeline.js`):** Entorno Radiance `.hdr` (`HDRCubeTexture`), `DefaultRenderingPipeline` con **MSAA 4x**, **FXAA**, **Bloom HDR sutil** en sensores, Tone Mapping **ACES** y sombras suaves **`Contact Hardening Shadows`**.
- **Físicas de Alto Rendimiento (hasta 240 pzs/min):** Solver continuo con *Spatial Hashing* $O(N)$ sobre la banda, *ROI Gating*, colas *FIFO* por estación, *Object Pooling* sin pausas de GC y **Havok Physics V2** apilando piezas clasificadas en los contenedores.
- **Dashboard Chart.js e Interfaz Colapsable:** 4 gráficas reactivas en vivo, KPIs industriales reconciliados (Pureza %, Caudal/h, Masa kg, kW, Wh/kg, FPS/ms), modo *Wireframe* y panel lateral colapsable responsivo.

## Ejecución Rápida
```bash
npm install
npm run qa        # Pruebas unitarias y de estrés (240 pzs/min) + validadores GLB/SVG + auditoría
npm run dev       # Inicia servidor Vite (agrega ?auto=1 a la URL para ensamblaje y arranque automático)
npm run build     # Genera compilación optimizada en dist/
```

## Estructura Modular del Proyecto
```
index.html                              Maquetación semántica HTML5 + HUD + Drawer colapsable
public/manifest.json                    Configuración dinámica maestra (kW, tiempos, métricas base, modelos)
public/assets/environment/*.hdr         Mapa HDRI industrial (Radiance RGBE) para iluminación PBR
public/assets/models/                   Modelos .glb optimizados (maquinaria y materiales)
public/assets/ui/                       Iconografía vectorial .svg y sprite
src/main.js                             Orquestador principal del Gemelo Digital
src/config/configLoader.js              Fusión dinámica de manifest.json + mocks JSON
src/core/bus/eventBus.js                Sistema Pub/Sub ligero en Vanilla JS
src/core/state/plantStateMachine.js     Máquina de Estados (FASE_0..FASE_6, PAUSADO, OPERANDO)
src/core/spawner/itemSpawner.js         Generador multicarril con verificación de despeje
src/core/physics/conveyorPhysics.js     Física de banda O(N), ROI Gating y colas FIFO
src/engine3d/renderingPipeline.js       DefaultRenderingPipeline, MSAA, Bloom, HDRI y Contact Shadows
src/engine3d/pbrEnhancer.js             Calibración PBR (aluminio, vidrio refractivo, PET clearcoat)
src/engine3d/objectPool.js              Object Pooling de instancias .glb en tiempo real
src/engine3d/babylonPhysics.js          Integración @babylonjs/havok en contenedores y rieles
src/engine3d/sceneController.js         Grafo 3D Babylon.js v9+, animaciones scaling+alpha y cámaras
src/analytics/chartsController.js       Visualización reactiva en Chart.js vía EventBus
src/ui/domController.js                 Controlador DOM, KPIs y microinteracciones
src/styles/main.css                     Estilos CSS3 responsivos y transiciones suaves
src/mocks/*.json                        Datos simulados obligatorios
tools/                                  Generadores HDRI/GLB, validadores y auditoría estricta
test/gemelo-digital.test.mjs            Suite de pruebas unitarias e integración
docs/                                   Arquitectura teórica (tesis), objetivos, rúbricas y activos
```

Documentación detallada:
- [Arquitectura del Gemelo Digital y Fundamentación Teórica](docs/arquitectura-gemelo-digital.md)
- [Objetivos y Rúbricas de Evaluación](docs/objetivos-y-rubricas.md)
- [Especificación de Modelos 3D (.glb)](docs/modelos-3d.md)
- [Especificación de Gráficos Vectoriales (.svg)](docs/graficos-svg.md)
