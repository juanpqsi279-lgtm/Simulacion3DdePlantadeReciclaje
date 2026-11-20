# Planta de Reciclaje en Lumbreras · Gemelo Digital 3D (STEAM + Primera Persona)

Simulación 3D educativa con arquitectura de **Gemelo Digital Industrial** para una línea automatizada de separación de **plástico PET, aluminio y vidrio**, construida estrictamente con **Vanilla JavaScript (Módulos ES6), CSS3, Babylon.js v9+ (con Havok Physics V2) y Chart.js**, compilada puramente en un ejecutable único **Windows `.exe`**.

## Cómo abrirlo (únicamente `.exe`, sin terminal, sin HTML externo y sin internet)
Haz **doble clic en [`Planta-de-Reciclaje.exe`](Planta-de-Reciclaje.exe)**. Es un ejecutable nativo de Windows 100 % autónomo: lleva embebidos en su interior el código HTML/JS/CSS empaquetado, Babylon.js, Havok Physics (`.wasm`), Chart.js, los modelos `.glb`, el mapa `.hdr` y `manifest.json`, sin depender de archivos `.html` en la carpeta del proyecto.

## Características Educativas Principales
- **Vista y Movimiento en Primera Persona estilo Roblox (`FreeCamera`):**
  - Camina por toda la planta con `WASD` o flechas, corre con `Shift` y salta con `Espacio`.
  - Arrastra con clic derecho (o en el vacío) para girar la vista en primera persona.
  - **Arrastre 3D libre:** mantén clic izquierdo sobre cualquier componente para moverlo libremente por la planta.
- **Esquina de Almacén + Sistema de Inventario (`1–9` y `[E]`):**
  - Las **9 piezas independientes** (`banda`, `tolva`, `separador`, `escaner`, `desviador`, `cont_aluminio`, `cont_plastico`, `cont_vidrio` y `robot_walle` — sin grupos) inician en la esquina de almacén.
  - Apunta con la mirilla y presiona `E` para guardar piezas en tu inventario personal (`hotbar` inferior teclas `1`–`9`), selecciónalas y haz clic izquierdo en el suelo para montarlas en cualquier posición.
- **Configuración Técnica Detallada con Valores Sugeridos:**
  - Configura velocidad de banda (`m/s`), tensión de rodillos (`%`), potencia del motor (`kW`), potencia del vibrador (`kW`), apertura de compuerta (`%`), RPM de Foucault, longitud de onda NIR (`nm`), sensibilidad óptica (`%`) y velocidad de WALL-E (`m/s`).
- **Encendido Libre y Simulación Física Real de Fallos:**
  - Puedes encender la planta sin importar dónde ni cuántas piezas colocaste; si la tolva no tiene banda debajo o falta un cesto en el punto de expulsión, los envases caen al suelo para que aprendas observando el proceso.
- **Laboratorio de las 5 Ramas STEAM (`C · T · I · A · M`):**
  - **Ciencia:** Foucault, espectroscopía NIR `1660 nm` y refracción óptica `n=1.52`.
  - **Tecnología:** Armado de la función interna de cada sensor (Transductor + Comparador + Cola FIFO `d/v`).
  - **Ingeniería:** Montaje mecánico libre, calibración de máquinas y tolerancias de planta.
  - **Arte:** Modelado curvo PBR, iluminación HDRI, partículas de disparo neumático y robot WALL-E con rampa animada.
  - **Matemáticas:** Impulso $J = m \cdot v$ y alcance del chorro de aire $\Delta z = 1.30 \cdot (Q / Q_{\text{óptimo}})$ en `L/min`.

## Desarrollo (requiere Node.js)
```bash
npm install
npm run qa           # Pruebas unitarias y validadores GLB/SVG + auditoría
npm run empaquetar   # Compila el paquete completo dentro de Planta-de-Reciclaje.exe
```

## Estructura Modular del Proyecto
```
Planta-de-Reciclaje.exe                 Ejecutable nativo Windows único y autónomo (con todo embebido)
tools/empaquetar-offline.mjs            Genera Planta-de-Reciclaje.exe desde plantilla embebida (sin dejar .html)
public/manifest.json                    Configuración dinámica maestra (kW, tiempos, métricas base, modelos)
public/assets/environment/*.hdr         Mapa HDRI industrial (Radiance RGBE) para iluminación PBR
public/assets/models/                   Modelos .glb optimizados (maquinaria, WALL-E y materiales)
public/assets/ui/                       Iconografía vectorial .svg
src/core/assembly/reglasMontaje.js      Reglas de validación, parámetros sugeridos y laboratorio STEAM
src/core/state/plantStateMachine.js     Máquina de Estados (FASE_0..FASE_9, inventario, parámetros, OPERANDO)
src/core/physics/conveyorPhysics.js     Física de banda O(N), montaje real libre, FIFO y expulsión neumática
src/engine3d/sceneController.js         Primera persona estilo Roblox, inventario 3D, Havok, partículas y WALL-E
src/ui/domController.js                 Controlador DOM, Hotbar 1-9, parámetros técnicos y KPIs
src/analytics/chartsController.js       Visualización reactiva en Chart.js vía EventBus
src/main.js                             Orquestador principal del Gemelo Digital
test/gemelo-digital.test.mjs            Suite de pruebas unitarias y de integración
```
