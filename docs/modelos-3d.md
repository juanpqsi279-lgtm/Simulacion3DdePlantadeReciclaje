# Modelos 3D iniciales — Planta de reciclaje en Lumbreras

Responsable: Afry (Angel Fernando Rivera Yado) — Especialista 3D y Entornos.
Actividad: recopilar/diseñar los modelos tridimensionales iniciales de la maquinaria y de los tres materiales a separar.

## Cumplimiento de restricciones del proyecto
- Formato: **solo `.glb`** (no se usa `.obj`).
- Sin TypeScript ni frameworks: el generador es JavaScript puro (ES modules) y no tiene dependencias.
- Unidades: metros. Eje Y hacia arriba. Origen de cada modelo en la base, centrado.

## Inventario

### Materiales a separar — `public/assets/models/materiales/`
| Archivo | Material | Tamaño aprox. (m) | Partes (nodos) |
|---|---|---|---|
| `botella_plastico.glb` | Plástico (PET 500 ml) | 0.07 × 0.21 × 0.07 | `botella_pet_cuerpo`, `botella_pet_etiqueta`, `botella_pet_tapa` |
| `lata_aluminio.glb` | Aluminio (lata 355 ml) | 0.07 × 0.12 × 0.07 | `lata_cuerpo`, `lata_banda`, `lata_borde` |
| `botella_vidrio.glb` | Vidrio (botella 355 ml) | 0.06 × 0.23 × 0.06 | `botella_vidrio_cuerpo`, `botella_vidrio_chapa` |

### Maquinaria — `public/assets/models/maquinaria/`
| Archivo | Función | Nodos animables / útiles |
|---|---|---|
| `banda_transportadora.glb` | Banda de 4 m; superficie en y = 0.815 m | `banda`, `rodillo_inicio`, `rodillo_fin`, `rodillo_soporte_1..6`, `motor` |
| `tolva_alimentacion.glb` | Entrada de material mezclado | `tolva_cuerpo`, `compuerta_salida` |
| `separador_aluminio.glb` | Separador por corrientes de Foucault (aluminio) | `tambor_magnetico`, `aspas_tambor`, `divisor`, `luz_estado` |
| `escaner_optico_plastico.glb` | Clasificador óptico + boquillas de aire (plástico) | `lente_1`, `lente_2`, `barra_boquillas`, `boquilla_1..7`, `luz_estado` |
| `desviador_vidrio.glb` | Desviador de compuerta (vidrio) | `compuerta_pivote` (el nodo está en la bisagra: se anima rotando en Y), `actuador`, `luz_estado` |
| `contenedor_plastico.glb` / `contenedor_aluminio.glb` / `contenedor_vidrio.glb` | Contenedores de salida (azul / gris / verde) | `base`, `pared_*` |

### Vista previa — `public/assets/models/preview/planta_vista_previa.glb`
Escena de prueba con toda la línea ensamblada (banda de 8 m, tolva, los 3 separadores, los 3 contenedores y una muestra de cada material). Sirve para comprobar que el canvas carga bien; **no** es el modelo final del ensamblaje paso a paso.

## Regenerar los modelos
```bash
node tools/generar-modelos.mjs
```
Edita medidas y colores directamente en `tools/generar-modelos.mjs` y vuelve a ejecutarlo.

## Cargar un modelo en Babylon.js (referencia)
```js
import "@babylonjs/loaders/glTF";
import { SceneLoader } from "@babylonjs/core";

const res = await SceneLoader.ImportMeshAsync("", "/assets/models/maquinaria/", "banda_transportadora.glb", scene);
const rodillo = scene.getNodeByName("rodillo_inicio"); // para animarlo
```
(Verificar la sintaxis exacta contra la documentación de la versión de Babylon.js que use el proyecto, v9+.)

## Fragmento sugerido para `manifest.json` (lo integra QA)
```json
{
  "modelos": {
    "materiales": ["botella_plastico.glb", "lata_aluminio.glb", "botella_vidrio.glb"],
    "maquinaria": ["banda_transportadora.glb", "tolva_alimentacion.glb", "separador_aluminio.glb",
                   "escaner_optico_plastico.glb", "desviador_vidrio.glb",
                   "contenedor_plastico.glb", "contenedor_aluminio.glb", "contenedor_vidrio.glb"]
  }
}
```

## Pendiente de mejora (opcional, no bloquea la actividad)
Estos modelos son geométricos (formas simples con materiales PBR). Si el equipo quiere más detalle visual, se pueden reemplazar archivo por archivo con modelos de Blender o de bibliotecas con licencia libre (Sketchfab CC0/CC-BY, Poly Pizza, Kenney), conservando los **mismos nombres de archivo y de nodos** para no romper el código de Juan y Fabian.

## Validar formatos (solo .gltf / .glb)
```bash
node tools/validar-modelos.mjs
```
Recorre todo el repo (ignora `node_modules`, `.git`, `dist`) y:
- marca como error cualquier formato 3D prohibido (`.obj`, `.mtl`, `.fbx`, `.stl`, `.dae`, `.blend`, etc.);
- comprueba que cada `.glb` / `.gltf` esté bien formado (cabecera, longitudes, buffers, accesores, mallas, texturas externas);
- termina con código 0 si todo cumple y 1 si hay errores, así se puede usar en un hook de git o en CI.

Para correrlo con `npm run`, agregar en `package.json`:
```json
"scripts": { "validar:modelos": "node tools/validar-modelos.mjs" }
```
Estado actual: 12 modelos `.glb` válidos, 0 errores, 0 formatos prohibidos.
