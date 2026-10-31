# Arquitectura del Gemelo Digital 3D – Planta de Reciclaje en Lumbreras

Este documento fundamenta la arquitectura de software, el pipeline gráfico WebGL2/Babylon.js v9+ y el modelo híbrido (continuo + eventos discretos) del proyecto a partir del corpus documental analizado (`tesis/`).

---

## 1. Fundamentación Documental y Trazabilidad Científica

| Fuente analizada | Concepto adoptado en el proyecto | Implementación en código |
|---|---|---|
| **de Prada et al. (2022)** – *Gemelos digitales en la industria de procesos* (*RIAI* 19, 285–296) | Arquitectura modular "enchufable" en 4 capas con **bus/historiador en tiempo real** como núcleo desacoplado, modelado **híbrido (física continua + eventos discretos)**, KPIs de **pureza** y espectroscopía infrarroja polimérica (Jiang et al., 2021). | `src/core/bus/eventBus.js`, `src/core/physics/conveyorPhysics.js`, `src/analytics/chartsController.js` |
| **BID – Latorre, Rego & de Leo (2024)** – *Reporte de Tecnología: Gemelos Digitales* | Taxonomía jerárquica en 4 escalas (**Componente $\rightarrow$ Activo $\rightarrow$ Sistema $\rightarrow$ Proceso**), desacoplamiento por middleware y métricas de eficiencia energética. | `src/core/state/plantStateMachine.js` (6 activos modulares que conforman el sistema y proceso), KPI `Wh/kg` |
| **Barcelona Activa / Utrans (2022)** – *Foco sectorial: Gemelos digitales* | Supervisión operativa en línea, reducción de **mermas/rechazo** y trazabilidad de calidad en manufactura continua. | `src/analytics/chartsController.js` (balance Clasificadas vs. Merma) |
| **Guanxin Lai (s.f.)** – *Analysis of the Current Status of Web3D Real time Rendering Implementation* | Paradigma *Pure Web / Browser Rendering* sobre WebGL2, ventajas de **Babylon.js** en materiales **PBR**, **sombras suaves para objetos transparentes** y presupuesto de rendimiento (`frame rate stability`). | `src/engine3d/renderingPipeline.js`, `src/engine3d/pbrEnhancer.js`, `src/engine3d/objectPool.js` |
| **Badia Valdés (2021)** – *Visualizador avanzado de modelos 3D para la web* (*Serie Científica UCI*) | Adopción del estándar **glTF/GLB** frente a OBJ, modo de inspección técnica **Wireframe** en tiempo real y umbral objetivo de **50–60 FPS** para fluidez interactiva. | `src/engine3d/sceneController.js` (`#btn-wireframe`, monitor FPS/ms), `tools/validar-modelos.mjs` |
| **Bautista España & Morales Escobar (2026)** – *Máquina clasificadora de plástico automatizada con IA* | División modular (*transporte, visión y clasificación mecánica*) y ventana **ROI con *Gating* (`SIN_OBJETO` vs. `OBJETO_EN_ROI`)** para impedir disparos en vacío del actuador. | `src/core/physics/conveyorPhysics.js` (`SENSOR_ROI_ESTADO`), `src/core/spawner/itemSpawner.js` |
| **Alanís Carranza et al. (2024)** – *Detección y clasificación de desperdicios mediante visión* | Clasificación multiclase (`metal`, `plástico`, `vidrio`), modelado de nivel de **confianza óptica** y latencia de sensado en tiempo real. | `src/core/physics/conveyorPhysics.js` (`confianza`, precisión por estación), `src/mocks/materiales.json` |
| **Jordán Gamito (2020)** – *Sistema automatizado de clasificación sobre cinta transportadora* (ETSI Univ. Sevilla) | Desacoplamiento temporal entre estación de sensado y estación de expulsión mediante **cola FIFO por estación** sin detener la cinta (*non-stop throughput*). | `src/core/physics/conveyorPhysics.js` (`colaFifo` entre `xSensor` y `xActuador`) |

---

## 2. Arquitectura Multicapa del Software (Vanilla JS ES6)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ CAPA 4 · SERVICIOS, ANALÍTICA E INTERFAZ (Cero acoplamiento con Babylon.js)  │
│  • src/analytics/chartsController.js  (Chart.js: Dona, Caudal, Merma, Turno) │
│  • src/ui/domController.js            (HTML5/CSS3 colapsable, KPIs, Log)     │
└───────────────────────────────▲──────────────────────┬───────────────────────┘
                                │ Telemetría / Sensado │ Comandos de Usuario
┌───────────────────────────────┴──────────────────────▼───────────────────────┐
│ CAPA 2 · BUS CENTRAL PUB/SUB E INTEGRACIÓN DE CONFIGURACIÓN                  │
│  • src/core/bus/eventBus.js           (Middleware síncrono on/once/off/emit) │
│  • src/config/configLoader.js         (Fusión dinámica manifest.json + mocks)│
└──────────────▲────────────────────────────────▲──────────────────────────────┘
               │ Eventos discretos / Estado     │ Estado FASE_0..6 / Física
┌──────────────┴─────────────────┐ ┌────────────┴──────────────────────────────┐
│ CAPA 1 · DOMINIO Y FÍSICA CORE │ │ CAPA 3 · MOTOR WEBGL2 / BABYLON.JS v9+    │
│ • plantStateMachine.js (FSM)   │ │ • renderingPipeline.js (HDRI+MSAA+Bloom)  │
│ • itemSpawner.js (Multicarril) │ │ • pbrEnhancer.js (IOR Vidrio/PET/Aluminio)│
│ • conveyorPhysics.js (Spatial  │ │ • objectPool.js (0 GC en caliente)        │
│   Hash + ROI Gating + FIFO)    │ │ • babylonPhysics.js (Havok V2 contenedores│
└────────────────────────────────┘ │ • sceneController.js (Scaling+Alpha, 3D)  │
                                   └───────────────────────────────────────────┘
```

### Decisiones Clave de Ingeniería y Rendimiento
1. **Desacoplamiento Total Motor 3D $\leftrightarrow$ UI (`EventBus`):** Ningún archivo dentro de `src/engine3d/` consulta ni modifica nodos del DOM (`document.*`), regla verificada automáticamente por `tools/auditar.mjs`. Cuando una lata de aluminio cruza el separador de corrientes de Foucault, el núcleo emite `sensor:aluminio` y `sensor:deteccion`; `chartsController.js` y `domController.js` reaccionan de forma autónoma.
2. **Escalabilidad Física sin *Glitches* (hasta 240 piezas/min):**
   - `ItemSpawner` distribuye la alimentación en 4 carriles transversales y comprueba despeje geométrico en la boca de la tolva.
   - `ConveyorSimulation` integra a **120 Hz internos** con **Spatial Hashing $O(N)$** e impulsos elásticos cilindro-cilindro más contención contra rieles guía.
   - `babylonPhysics.js` activa **Babylon.js Physics V2 (`@babylonjs/havok`)** para apilar cuerpos rígidos reales dentro de los contenedores colectores mediante un *ring buffer* acotado.
   - `MaterialObjectPool` recicla instancias `.glb` pre-alojadas evitando picos del recolector de basura (GC).
3. **Calidad Visual de Gemelo Digital Profesional:**
   - **Entorno HDRI local (`planta_industrial.hdr`):** Mapa Radiance RGBE equirectangular cargado con `HDRCubeTexture` para iluminación basada en imagen (IBL).
   - **Materiales PBR calibrados:** Aluminio (`metallic = 0.96, roughness = 0.19`), vidrio verde (`IOR = 1.52`, `clearCoat`, `subSurface.isTranslucencyEnabled`), PET transparente (`IOR = 1.49`, `clearCoat`).
   - **Post-procesado y Sombras:** `DefaultRenderingPipeline` con **MSAA 4x + FXAA**, **Bloom HDR sutil** para balizas y cortinas ópticas, Tone Mapping **ACES**, y `ShadowGenerator` con **Contact Hardening Shadows** + sombras suaves para objetos translúcidos.
4. **Máquina de Estados de 6 Pasos (`PlantStateMachine`):** Controla formalmente `FASE_0`..`FASE_6`, `PAUSADO` y `OPERANDO`, disparando animaciones progresivas interpoladas de **`scaling` + `visibility` (`alpha`)** sobre los sub-árboles 3D.
