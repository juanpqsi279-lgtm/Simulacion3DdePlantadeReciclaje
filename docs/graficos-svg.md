# Gráficos vectoriales de la interfaz (SVG)

Responsable: Afry (Angel Fernando Rivera Yado) — recursos SVG.
Regla de la planeación: los gráficos vectoriales van **solo en formato SVG**; están prohibidos los formatos propietarios y los bitmap no escalables.

## Recursos incluidos — `public/assets/ui/`
| Recurso | Uso |
|---|---|
| `icons/plastico.svg`, `aluminio.svg`, `vidrio.svg` | Los tres materiales a separar (telemetría, leyendas, contadores) |
| `icons/play.svg`, `pausa.svg`, `reiniciar.svg`, `velocidad.svg` | Controles de la simulación |
| `icons/banda.svg`, `tolva.svg`, `sensor.svg` | Maquinaria y sensores |
| `icons/alerta.svg`, `correcto.svg` | Estados del sistema |
| `sprite.svg` | Los mismos 12 íconos como `<symbol>` (un solo archivo) |
| `logo.svg` | Logotipo de la planta (colores fijos) |

Todos están en cuadrícula 24×24 con `viewBox`, así que escalan sin perder calidad. Los íconos usan `currentColor`: toman el color del texto del contenedor.

## Cómo usarlos en HTML/CSS
**Recomendado (sprite, hereda el color con CSS):**
```html
<svg class="icono" aria-hidden="true"><use href="/assets/ui/sprite.svg#icono-play"/></svg>
```
```css
.icono { width: 24px; height: 24px; color: #1f6fb5; }
```
Ids disponibles: `icono-plastico`, `icono-aluminio`, `icono-vidrio`, `icono-play`, `icono-pausa`, `icono-reiniciar`, `icono-velocidad`, `icono-banda`, `icono-tolva`, `icono-sensor`, `icono-alerta`, `icono-correcto`.

**Con `<img>`** (no hereda color; los íconos se verán negros):
```html
<img src="/assets/ui/icons/play.svg" alt="Iniciar" width="24" height="24">
```
El sprite debe servirse por http (Vite dev server o servidor local), no abriendo el HTML con doble clic.

## Regenerar y validar
```bash
node tools/generar-iconos.mjs     # vuelve a crear los SVG desde una única fuente (tools/generar-iconos.mjs)
node tools/validar-svg.mjs        # comprueba que todo gráfico vectorial sea SVG y esté bien formado
```
El validador marca como **error**:
- formatos vectoriales propietarios (`.ai`, `.eps`, `.cdr`, `.emf`, `.wmf`, `.sketch`, `.fig`, ...);
- bitmaps (`.png`, `.jpg`, `.gif`, ...) dentro de carpetas de interfaz (`ui/`, `icons/`, `logo*`);
- SVG mal formados, sin `xmlns` o sin `viewBox`, con `<script>`, `<foreignObject>`, eventos `on...`, enlaces externos o bitmaps incrustados.

Y como **aviso**: bitmaps fuera de esas carpetas y HTML/CSS que use un `.png`/`.jpg` como ícono o logo.
Termina con código 0 si todo cumple y 1 si no, igual que `tools/validar-modelos.mjs`.

## Reglas para el equipo
- Todo ícono, logo o ilustración vectorial nuevo se entrega como `.svg` y se agrega a `public/assets/ui/`.
- Si un diseño llega en `.ai`, `.eps` o similar, se exporta a SVG (Inkscape: *Guardar como → SVG simple*; Illustrator: *Exportar → SVG*) y se corre `validar-svg.mjs`.
- Fotos o texturas (bitmap) no son gráficos vectoriales; si se necesitan, van fuera de `ui/` y el validador solo avisará.
