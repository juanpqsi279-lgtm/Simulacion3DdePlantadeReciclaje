# Planta de Reciclaje en Lumbreras · Gemelo Digital 3D (Babylon.js + Minecraft FPS + STEAM)

Simulación 3D educativa en tiempo real con arquitectura de **Gemelo Digital Industrial** para una línea automatizada de separación de **plástico PET, aluminio y vidrio**, ejecutándose directamente en **`localhost` con Vite y Babylon.js v9+ (Havok Physics V2, PBR + HDRI) y Chart.js**.

## Cómo ejecutar en `localhost`
```bash
npm install
npm run dev
```
Abre `http://localhost:5173` en tu navegador. *(También puedes empaquetar una copia offline en `.exe` con `npm run empaquetar`).*

## Controles en Primera Persona tipo Minecraft y Mecánica de Montaje
- **Cámara libre estilo Minecraft (Pointer Lock):** haz clic en el visor 3D (o pulsa **Modo Minecraft**) para mirar libremente con el ratón; presiona `Esc` para liberar el cursor.
- **Movilidad fluida:**
  - `WASD` / Flechas: caminar con aceleración y frenado suave.
  - `Shift` (o doble toque rápido en `W`): sprint.
  - `C` / `Ctrl`: agacharse (*sneak*).
  - `Espacio`: saltar; **doble toque en `Espacio`**: alternar modo vuelo creativo (`Espacio` sube, `C` baja).
  - `Tab`: colapsar/expandir el panel lateral.
- **Arrastre suave, Inventario, Atornillado 3D y Configuración al colocar:**
  - **Agarre y arrastre suave:** apunta a cualquier componente y pulsa `G` (o mantén clic izquierdo) para moverlo con suavizado exponencial sin tirones; usa la rueda del ratón para acercarlo o alejarlo.
  - **Inventario Minecraft (`1–9` / Rueda + `[E]`):** apunta a una pieza y presiona `E` para guardarla en el inventario; elige la ranura y haz clic izquierdo en el suelo para montarla.
  - **Configuración automática al colocar (`[R]`):** cada vez que colocas una pieza se abre su modal de configuración con parámetros técnicos (potencia, velocidad, RPM, longitud de onda NIR, torque de anclaje, sensores STEAM) y **valores sugeridos**.
  - **Atornillado 3D (`[F]` mantenido):** apunta a la pieza colocada y mantén `F` (o usa el botón **Atornillar pieza** en su modal) para bajar los 4 pernos hexagonales 3D. Si enciendes una máquina sin atornillar, vibrará físicamente y perderá eficiencia.

## Estructura del Proyecto
```
index.html                              Maquetación principal para localhost + HUD Minecraft + Modal por pieza
vite.config.js                          Servidor Vite en http://localhost:5173 + soporte WASM Havok
public/manifest.json                    Configuración dinámica maestra (kW, tiempos, métricas base, modelos)
src/core/assembly/reglasMontaje.js      Validación no bloqueante (posiciones, atornillado, parámetros y STEAM)
src/core/state/plantStateMachine.js     FSM (FASE_0..FASE_9, inventario, atornillados, parámetros y estado operativo)
src/core/physics/conveyorPhysics.js     Física de banda O(N), efectos de falta de atornillado, FIFO y expulsión
src/engine3d/renderingPipeline.js       Iluminación 3 puntos + HDRI + MSAA + Bloom + ACES + viñeta
src/engine3d/sceneController.js         Primera persona Minecraft, arrastre suave, pernos 3D, Havok y WALL-E
src/ui/domController.js                 Controlador DOM, modal de pieza, hotbar Minecraft y telemetría
src/main.js                             Orquestador Pub/Sub y adaptador Pointer Lock
test/gemelo-digital.test.mjs            Suite de pruebas unitarias e integración
```
