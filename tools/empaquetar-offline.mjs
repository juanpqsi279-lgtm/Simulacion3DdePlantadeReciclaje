// tools/empaquetar-offline.mjs
// Genera el ejecutable de escritorio "Planta-de-Reciclaje.exe" (SIN dejar archivos .html en la raíz):
//   · UN SOLO ejecutable nativo Windows (.exe) sin consola que abre la simulación como aplicación de escritorio
//     autónoma (sin terminal, sin servidor externo y 100 % sin internet).
//   · Incluye embebidos dentro del .exe: Babylon.js, Havok Physics, Chart.js, el código del proyecto, el CSS,
//     todos los modelos .glb, el entorno HDRI, el wasm de Havok, el manifest.json y el icono de aplicación.
//   · Sirve el paquete en memoria en loopback local (127.0.0.1) para que Web Workers, WebAssembly y WebGL2
//     funcionen a 60 FPS reales a máxima velocidad, y abre una ventana nativa en modo app (Edge/Chrome --app).
//
// Uso:  npm run empaquetar

import { build } from "vite";
import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  rmSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { deflateRawSync } from "node:zlib";
import { join, relative, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(RAIZ, "dist-offline");
const INDEX_TEMP = join(RAIZ, "index.html");
const SALIDA_HTML = join(RAIZ, "Planta-de-Reciclaje.html");
const SALIDA_EXE = join(RAIZ, "Planta-de-Reciclaje.exe");
const PUBLIC = join(RAIZ, "public");
const WASM_HAVOK = join(RAIZ, "node_modules", "@babylonjs", "havok", "lib", "esm", "HavokPhysics.wasm");

// Plantilla HTML maestra embebida en el empaquetador: evita depender de index.html en disco.
const PLANTILLA_HTML = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      name="description"
      content="Gemelo Digital 3D educativo en primera persona de una planta de reciclaje industrial (plástico PET, aluminio y vidrio) con Babylon.js v9+ y Chart.js."
    />
    <meta name="theme-color" content="#1f6fb5" />
    <link rel="icon" type="image/svg+xml" href="assets/ui/logo.svg" />
    <title>Planta de Reciclaje en Lumbreras · Gemelo Digital 3D</title>
  </head>
  <body>
    <svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">
      <symbol id="icono-plastico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <title>Plástico</title>
        <path d="M10 2h4v3l2 3v12a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8l2-3V2z"/><line x1="8" y1="12" x2="16" y2="12"/>
      </symbol>
      <symbol id="icono-aluminio" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <title>Aluminio</title>
        <path d="M7 5c0-1.1 2.2-2 5-2s5 .9 5 2v14c0 1.1-2.2 2-5 2s-5-.9-5-2V5z"/><path d="M7 5c0 1.1 2.2 2 5 2s5-.9 5-2"/>
      </symbol>
      <symbol id="icono-vidrio" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <title>Vidrio</title>
        <path d="M10 2h4v6l2.5 3.5V20a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v-8.5L10 8V2z"/><line x1="10" y1="5" x2="14" y2="5"/>
      </symbol>
      <symbol id="icono-play" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <title>Iniciar</title>
        <polygon points="6 4 20 12 6 20 6 4"/>
      </symbol>
      <symbol id="icono-pausa" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <title>Pausar</title>
        <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
      </symbol>
      <symbol id="icono-reiniciar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <title>Reiniciar</title>
        <path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 10 9 10"/>
      </symbol>
      <symbol id="icono-velocidad" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <title>Velocidad</title>
        <path d="M4 18a9 9 0 1 1 16 0"/><line x1="12" y1="14" x2="16" y2="9"/><circle cx="12" cy="14" r="1.5"/>
      </symbol>
      <symbol id="icono-banda" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <title>Banda transportadora</title>
        <rect x="2" y="13" width="20" height="6" rx="3"/><circle cx="6" cy="16" r="1"/><circle cx="18" cy="16" r="1"/><rect x="9" y="7" width="6" height="6"/>
      </symbol>
      <symbol id="icono-tolva" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <title>Tolva</title>
        <path d="M3 4h18l-6 9v6h-6v-6L3 4z"/>
      </symbol>
      <symbol id="icono-sensor" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <title>Sensor</title>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>
      </symbol>
      <symbol id="icono-alerta" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <title>Alerta</title>
        <path d="M12 3 2 21h20L12 3z"/><line x1="12" y1="10" x2="12" y2="15"/><line x1="12" y1="18" x2="12" y2="18.01"/>
      </symbol>
      <symbol id="icono-correcto" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <title>Correcto</title>
        <circle cx="12" cy="12" r="9"/><polyline points="8 12.5 11 15.5 16 9"/>
      </symbol>
    </svg>

    <header class="barra">
      <img class="barra__logo" src="assets/ui/logo.svg" alt="Logo de la planta de reciclaje" />
      <div class="barra__titulos">
        <h1>Planta de Reciclaje en Lumbreras · Gemelo Digital</h1>
        <p>Primera persona · Montaje libre de 9 piezas · Laboratorio STEAM: plástico PET · aluminio · vidrio</p>
      </div>
      <div class="barra__acciones">
        <div class="barra__estado" id="estado-global" role="status" aria-live="polite">Inicializando…</div>
        <button type="button" id="btn-colapsar-panel" aria-expanded="true" title="Colapsar panel lateral">
          Panel
        </button>
      </div>
    </header>

    <main class="layout" id="layout-principal">
      <section class="escena" id="contenedor-escena" aria-label="Entorno 3D en primera persona del Gemelo Digital">
        <canvas id="canvas3d" touch-action="none"></canvas>

        <div class="escena__hud-sup">
          <div class="escena__camaras" role="group" aria-label="Teletransporte rápido en primera persona">
            <button type="button" data-camara="general" class="cam-activa">Ir a Planta</button>
            <button type="button" data-camara="almacen">Ir a Esquina</button>
            <button type="button" data-camara="tolva">Ir a Tolva</button>
            <button type="button" data-camara="salida">Ir a Cestos</button>
            <button type="button" data-camara="recepcion">Ir a Montón</button>
            <button type="button" id="btn-wireframe" title="Inspección técnica de mallas">Wireframe</button>
          </div>
          <div class="escena__telemetria-hud">
            <span class="hud-pill" id="hud-fps">-- FPS · -- ms</span>
          </div>
        </div>

        <div class="guia-roblox" id="guia-roblox">
          <kbd>WASD</kbd> / Flechas caminar · <kbd>Shift</kbd> correr · <kbd>Espacio</kbd> saltar · Clic der./vacío mirar · Mantener clic izq. arrastrar · <kbd>E</kbd> recoger · <kbd>1-9</kbd> inventario
        </div>

        <div class="mirilla-3d" id="mirilla-3d" aria-hidden="true"></div>
        <div class="mirilla-etiqueta" id="etiqueta-mirilla" hidden></div>

        <div class="toasts" id="toasts" role="status" aria-live="polite"></div>
        <div class="escena__soltar" id="zona-soltar" hidden>Suelta aquí para colocar el módulo</div>

        <div class="escena__carga" id="carga">
          <div class="spinner"></div>
          <span id="carga-texto">Inicializando motor PBR Babylon.js v9…</span>
        </div>

        <div class="escena__leyenda">
          <span><i style="background:#1f6fb5"></i>Plástico PET</span>
          <span><i style="background:#8d99a6"></i>Aluminio</span>
          <span><i style="background:#2f8f4e"></i>Vidrio</span>
        </div>

        <div class="escena__sensores" aria-label="Estado de sensores en línea">
          <span class="chip-sensor" id="chip-sensor-aluminio">Foucault · Aluminio</span>
          <span class="chip-sensor" id="chip-sensor-plastico">NIR · Plástico</span>
          <span class="chip-sensor" id="chip-sensor-vidrio">Óptico · Vidrio</span>
        </div>

        <div class="hotbar" id="hotbar-inventario" role="toolbar" aria-label="Inventario rápido de piezas (teclas 1 a 9)"></div>
      </section>

      <aside class="panel" id="panel-lateral">
        <section class="tarjeta" aria-labelledby="t-ensamblaje">
          <div class="tarjeta__cabecera">
            <h2 id="t-ensamblaje">Montaje Libre e Inventario (9 piezas)</h2>
            <span class="badge-fsm" id="badge-fsm">FASE_0</span>
          </div>
          <div class="progreso"><div class="progreso__barra" id="progreso-ensamblaje"></div></div>
          <p class="subtexto-montaje" id="resumen-montaje">0/9 colocadas · 0 en inventario · 0.0 kW</p>
          <p class="ayuda-montaje">Las 9 piezas (cestos y WALL-E separados) inician en la <strong>esquina de almacén</strong>. Arrástralas con el ratón o recógelas al inventario con <kbd>E</kbd> para montarlas libremente.</p>
          <ol class="pasos" id="lista-pasos"></ol>
          <div class="botones">
            <button type="button" id="btn-recoger-todo">Recoger todo al inventario</button>
            <button type="button" id="btn-devolver-almacen">Todo a la esquina</button>
            <button type="button" id="btn-desmontar">Desmontar</button>
          </div>
        </section>

        <section class="tarjeta tarjeta-avisos" aria-labelledby="t-avisos" id="tarjeta-avisos" hidden>
          <div class="tarjeta__cabecera">
            <h2 id="t-avisos">Avisos de montaje y operación</h2>
            <span class="badge-avisos" id="badge-avisos">0</span>
          </div>
          <p class="subtexto-montaje">No bloquean el encendido: puedes encender la planta para observar en vivo cómo afecta cada fallo.</p>
          <ul class="avisos" id="lista-avisos"></ul>
        </section>

        <section class="tarjeta" aria-labelledby="t-control">
          <h2 id="t-control">Control Operativo de la Línea</h2>
          <div class="botones">
            <button type="button" id="btn-play" class="primario">
              <svg class="ico" aria-hidden="true"><use id="ico-play" href="#icono-play" /></svg>
              <span id="txt-play">Encender</span>
            </button>
            <button type="button" id="btn-reiniciar">
              <svg class="ico" aria-hidden="true"><use href="#icono-reiniciar" /></svg>
              Reiniciar
            </button>
          </div>
          <label class="control" for="rng-velocidad">
            <svg class="ico" aria-hidden="true"><use href="#icono-velocidad" /></svg>
            Velocidad de simulación <b id="lbl-velocidad">1×</b>
          </label>
          <input type="range" id="rng-velocidad" min="0.5" max="8" step="0.5" value="1" />

          <label class="control" for="rng-flujo">
            <svg class="ico" aria-hidden="true"><use href="#icono-banda" /></svg>
            Material por minuto <b id="lbl-flujo">60</b>
          </label>
          <input type="range" id="rng-flujo" min="10" max="240" step="5" value="60" />
        </section>

        <section class="tarjeta" aria-labelledby="t-config-maquinas">
          <div class="tarjeta__cabecera">
            <h2 id="t-config-maquinas">Configuración Técnica Detallada</h2>
          </div>
          <p class="subtexto-montaje">Ajusta la velocidad de banda, potencia de tolva y parámetros de cada máquina guiándote con los valores sugeridos.</p>
          <div class="botones">
            <button type="button" id="btn-valores-sugeridos">Restaurar Valores Sugeridos</button>
          </div>
          <div class="config-maquinas" id="panel-config-maquinas"></div>
        </section>

        <section class="tarjeta" aria-labelledby="t-steam">
          <div class="tarjeta__cabecera">
            <h2 id="t-steam">Laboratorio STEAM · Sensores y Flujo de Aire</h2>
          </div>
          <div class="steam-ramas" aria-label="Las 5 ramas STEAM aplicadas">
            <span class="steam-rama" title="Foucault, NIR 1660 nm y refracción óptica n=1.52"><b>C</b> Ciencia</span>
            <span class="steam-rama" title="Lógica interna del sensor: transductor + comparador + cola FIFO"><b>T</b> Tecnología</span>
            <span class="steam-rama" title="Montaje libre desde la esquina y calibración neumática"><b>I</b> Ingeniería</span>
            <span class="steam-rama" title="Diseño curvo PBR, iluminación HDRI, partículas y robot WALL-E"><b>A</b> Arte</span>
            <span class="steam-rama" title="Impulso lineal J = m·v y alcance Δz = 1.30·(Q/Q_ópt)"><b>M</b> Matemáticas</span>
          </div>
          <p class="subtexto-montaje">Arma la función interna de cada sensor y regula el flujo de aire (L/min) para lanzar cada envase justo a su cesto.</p>
          <div class="botones">
            <button type="button" id="btn-reto-steam" title="Devuelve las 9 piezas a la esquina y descalibra los sensores para practicar desde cero">Reto STEAM (Desarmar)</button>
            <button type="button" id="btn-calibrar-sensores" title="Restaura la lógica y flujos de aire óptimos">Calibración Óptima</button>
          </div>
          <div class="steam-sensores" id="panel-sensores-steam"></div>
        </section>

        <section class="tarjeta" aria-labelledby="t-kpi">
          <h2 id="t-kpi">KPIs Reconciliados en Tiempo Real</h2>
          <div class="kpis" id="kpis"></div>
        </section>

        <section class="tarjeta" aria-labelledby="t-graficas">
          <h2 id="t-graficas">Analítica del Gemelo Digital (Chart.js)</h2>
          <div class="graficas">
            <figure><figcaption>Distribución de material recuperado</figcaption><canvas id="g-dona"></canvas></figure>
            <figure><figcaption>Caudal y sensado por minuto (en vivo)</figcaption><canvas id="g-flujo"></canvas></figure>
            <figure><figcaption>Clasificadas vs. Merma por corriente</figcaption><canvas id="g-barras"></canvas></figure>
            <figure><figcaption>Comparativa multiturno (mock vs. actual)</figcaption><canvas id="g-historial"></canvas></figure>
          </div>
        </section>

        <section class="tarjeta" aria-labelledby="t-log">
          <h2 id="t-log">Historiador de Eventos (Pub/Sub)</h2>
          <ul class="log" id="log" aria-live="off"></ul>
        </section>
      </aside>
    </main>

    <script type="module" src="/src/main.js"></script>
  </body>
</html>`;


const OMITIR = [
  `assets${sep}models${sep}preview`,
  `assets${sep}ui${sep}icons`,
  `assets${sep}ui${sep}sprite.svg`,
];

function listar(dir) {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    return statSync(ruta).isDirectory() ? listar(ruta) : [ruta];
  });
}

// Genera un icono .ico de 32x32 píxeles con el diseño del Gemelo Digital (banda + 3 envases + aro verde)
function generarIconoIco() {
  const w = 32;
  const h = 32;
  const xor = Buffer.alloc(w * h * 4);
  const setPx = (x, y, r, g, b, a = 255) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    // En BMP dentro de ICO la fila 0 es la inferior
    const fila = h - 1 - y;
    const idx = (fila * w + x) * 4;
    xor[idx] = b;
    xor[idx + 1] = g;
    xor[idx + 2] = r;
    xor[idx + 3] = a;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - 15.5;
      const dy = y - 15.5;
      const dist = Math.hypot(dx, dy);
      if (dist > 15.2) continue;
      if (dist > 13.4) {
        setPx(x, y, 46, 204, 113, 255); // Borde verde #2ecc71
      } else {
        setPx(x, y, 15, 34, 48, 255); // Fondo #0f2230
      }
    }
  }
  // Botella PET azul
  for (let y = 9; y <= 19; y++) for (let x = 7; x <= 11; x++) setPx(x, y, 31, 111, 181);
  // Lata aluminio gris claro
  for (let y = 11; y <= 19; y++) for (let x = 14; x <= 18; x++) setPx(x, y, 200, 210, 220);
  // Botella vidrio verde
  for (let y = 8; y <= 19; y++) for (let x = 21; x <= 25; x++) setPx(x, y, 46, 204, 113);
  // Banda transportadora inferior
  for (let y = 20; y <= 24; y++) for (let x = 5; x <= 26; x++) setPx(x, y, 184, 194, 204);

  const andMask = Buffer.alloc((w / 8) * h, 0);
  const bmpHeader = Buffer.alloc(40);
  bmpHeader.writeUInt32LE(40, 0);
  bmpHeader.writeInt32LE(w, 4);
  bmpHeader.writeInt32LE(h * 2, 8);
  bmpHeader.writeUInt16LE(1, 12);
  bmpHeader.writeUInt16LE(32, 14);
  bmpHeader.writeUInt32LE(0, 16);
  bmpHeader.writeUInt32LE(xor.length + andMask.length, 20);

  const imgData = Buffer.concat([bmpHeader, xor, andMask]);
  const icoHeader = Buffer.alloc(22);
  icoHeader.writeUInt16LE(0, 0);
  icoHeader.writeUInt16LE(1, 2);
  icoHeader.writeUInt16LE(1, 4);
  icoHeader.writeUInt8(w, 6);
  icoHeader.writeUInt8(h, 7);
  icoHeader.writeUInt8(0, 8);
  icoHeader.writeUInt8(0, 9);
  icoHeader.writeUInt16LE(1, 10);
  icoHeader.writeUInt16LE(32, 12);
  icoHeader.writeUInt32LE(imgData.length, 14);
  icoHeader.writeUInt32LE(22, 18);

  return Buffer.concat([icoHeader, imgData]);
}

const CODIGO_CS = `using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("Planta de Reciclaje en Lumbreras - Gemelo Digital 3D")]
[assembly: AssemblyDescription("Simulacion 3D interactiva de una planta de reciclaje industrial (Babylon.js + Havok + Chart.js)")]
[assembly: AssemblyCompany("Gemelo Digital 3D")]
[assembly: AssemblyProduct("Planta de Reciclaje 3D")]
[assembly: AssemblyVersion("2.0.0.0")]
[assembly: AssemblyFileVersion("2.0.0.0")]

namespace PlantaReciclajeApp
{
    internal static class Program
    {
        private static byte[] CargarHtmlEmbebido()
        {
            Assembly asm = Assembly.GetExecutingAssembly();
            using (Stream s = asm.GetManifestResourceStream("app.html.deflate"))
            {
                if (s == null) throw new InvalidOperationException("No se encontro el recurso embebido app.html.deflate");
                using (DeflateStream ds = new DeflateStream(s, CompressionMode.Decompress))
                using (MemoryStream ms = new MemoryStream())
                {
                    ds.CopyTo(ms);
                    return ms.ToArray();
                }
            }
        }

        private static string BuscarNavegadorChromium()
        {
            string prog86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string prog64 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

            string[] candidatos = new string[]
            {
                Path.Combine(prog86, @"Microsoft\\Edge\\Application\\msedge.exe"),
                Path.Combine(prog64, @"Microsoft\\Edge\\Application\\msedge.exe"),
                Path.Combine(local, @"Microsoft\\Edge\\Application\\msedge.exe"),
                Path.Combine(prog64, @"Google\\Chrome\\Application\\chrome.exe"),
                Path.Combine(prog86, @"Google\\Chrome\\Application\\chrome.exe"),
                Path.Combine(local, @"Google\\Chrome\\Application\\chrome.exe"),
                Path.Combine(prog64, @"BraveSoftware\\Brave-Browser\\Application\\brave.exe"),
                Path.Combine(prog86, @"BraveSoftware\\Brave-Browser\\Application\\brave.exe"),
                Path.Combine(local, @"BraveSoftware\\Brave-Browser\\Application\\brave.exe")
            };

            foreach (string ruta in candidatos)
            {
                if (!string.IsNullOrEmpty(ruta) && File.Exists(ruta)) return ruta;
            }
            return null;
        }

        [STAThread]
        private static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            byte[] htmlBytes;
            try
            {
                htmlBytes = CargarHtmlEmbebido();
            }
            catch (Exception ex)
            {
                MessageBox.Show("Error al iniciar el paquete embebido:\\n" + ex.Message, "Planta de Reciclaje 3D", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            // Servidor local en memoria sobre loopback (127.0.0.1) en un puerto libre sin permisos de administrador.
            // Permite ejecutar Web Workers y WebAssembly a máxima velocidad sin depender de archivos externos.
            TcpListener servidor = new TcpListener(IPAddress.Loopback, 0);
            servidor.Start();
            int puerto = ((IPEndPoint)servidor.LocalEndpoint).Port;
            string url = "http://127.0.0.1:" + puerto + "/";

            bool activo = true;
            Thread hiloServidor = new Thread(() =>
            {
                while (activo)
                {
                    try
                    {
                        TcpClient cliente = servidor.AcceptTcpClient();
                        ThreadPool.QueueUserWorkItem(_ => AtenderCliente(cliente, htmlBytes));
                    }
                    catch
                    {
                        if (!activo) break;
                    }
                }
            });
            hiloServidor.IsBackground = true;
            hiloServidor.Start();

            // Guardamos también el HTML autocontenido en un archivo temporal local (con todas las dependencias embebidas,
            // funciona igualmente sobre file:// y sobre http://127.0.0.1). Además mantenemos vivo el servidor local
            // hasta que se cierre la ventana o pasen 24 horas, porque cuando Edge ya tiene procesos en segundo plano
            // (Startup Boost), Process.Start delega la ventana al proceso existente y sale de inmediato.
            string dirTemp = Path.Combine(Path.GetTempPath(), "PlantaReciclaje3D_Runtime");
            Directory.CreateDirectory(dirTemp);
            string htmlTemp = Path.Combine(dirTemp, "Planta-de-Reciclaje-App.html");
            try
            {
                File.WriteAllBytes(htmlTemp, htmlBytes);
            }
            catch { }

            string urlArchivo = new Uri(htmlTemp).AbsoluteUri;
            string perfilTemp = Path.Combine(Path.GetTempPath(), "PlantaReciclaje3D_App_Profile");
            try
            {
                // Modo de verificación automática (--smoke-test): comprueba que el servidor local y el HTML extraído son válidos
                if (args != null && args.Length > 0 && args[0] == "--smoke-test")
                {
                    using (WebClient wc = new WebClient())
                    {
                        wc.Encoding = Encoding.UTF8;
                        string resp = wc.DownloadString(url);
                        if (resp != null && resp.Contains("__RECURSOS_EMBEBIDOS__") && File.Exists(htmlTemp))
                        {
                            Environment.ExitCode = 0;
                            return;
                        }
                    }
                    Environment.ExitCode = 2;
                    return;
                }

                // Modo ventana dedicada (--url-file=<ruta>): arranca el servidor del .exe y escribe la URL para E2E
                if (args != null && args.Length > 0 && args[0].StartsWith("--url-file="))
                {
                    string rutaArchivo = args[0].Substring("--url-file=".Length);
                    File.WriteAllText(rutaArchivo, url, Encoding.UTF8);
                    Thread.Sleep(30000);
                    return;
                }

                string navegador = BuscarNavegadorChromium();
                if (navegador != null)
                {
                    Directory.CreateDirectory(perfilTemp);
                    // Abrimos la ventana dedicada sobre el HTML autónomo extraído (file://), que NUNCA falla por
                    // ERR_CONNECTION_REFUSED aunque Edge delegue la ventana a una instancia previa en segundo plano.
                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = navegador,
                        Arguments = "--app=\\"" + urlArchivo + "\\"" +
                                    " --user-data-dir=\\"" + perfilTemp + "\\"" +
                                    " --window-size=1480,920" +
                                    " --no-first-run --no-default-browser-check --disable-sync --disable-extensions",
                        UseShellExecute = false
                    };
                    Process p = Process.Start(psi);
                    if (p != null)
                    {
                        p.WaitForExit();
                    }
                }
                else
                {
                    // Respaldo universal si no se encuentra Edge/Chrome en rutas estándar
                    Process.Start(new ProcessStartInfo(htmlTemp) { UseShellExecute = true });
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("No se pudo abrir la ventana de la aplicacion:\\n" + ex.Message, "Planta de Reciclaje 3D", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                activo = false;
                try { servidor.Stop(); } catch { }
            }
        }

        private static void AtenderCliente(TcpClient cliente, byte[] htmlBytes)
        {
            using (cliente)
            {
                try
                {
                    cliente.ReceiveTimeout = 5000;
                    cliente.SendTimeout = 10000;
                    NetworkStream ns = cliente.GetStream();
                    byte[] buffer = new byte[4096];
                    int leidos = ns.Read(buffer, 0, buffer.Length);
                    if (leidos <= 0) return;

                    string cabecera =
                        "HTTP/1.1 200 OK\\r\\n" +
                        "Content-Type: text/html; charset=utf-8\\r\\n" +
                        "Content-Length: " + htmlBytes.Length + "\\r\\n" +
                        "Cache-Control: no-store\\r\\n" +
                        "Connection: close\\r\\n\\r\\n";
                    byte[] cabBytes = Encoding.ASCII.GetBytes(cabecera);
                    ns.Write(cabBytes, 0, cabBytes.Length);
                    ns.Write(htmlBytes, 0, htmlBytes.Length);
                    ns.Flush();
                }
                catch { }
            }
        }
    }
}
`;

function buscarCscExe() {
  const windir = process.env.WINDIR || "C:\\Windows";
  const candidatos = [
    join(windir, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"),
    join(windir, "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe"),
  ];
  return candidatos.find((c) => existsSync(c)) ?? null;
}

console.log("1/4 Compilando aplicación con Vite desde plantilla embebida (sin dejar index.html)…");
writeFileSync(INDEX_TEMP, PLANTILLA_HTML, "utf8");
try {
  await build({
    root: RAIZ,
    logLevel: "warn",
    base: "./",
    publicDir: false,
    build: {
      outDir: DIST,
      emptyOutDir: true,
      assetsInlineLimit: 0,
      cssCodeSplit: false,
      modulePreload: false,
      chunkSizeWarningLimit: 8000,
      rolldownOptions: { output: { codeSplitting: false } },
    },
  });
} finally {
  rmSync(INDEX_TEMP, { force: true });
}

console.log("2/4 Embebiendo recursos 3D (modelos .glb, HDRI, Havok wasm, manifest, logo)…");
const registro = {};
for (const archivo of listar(PUBLIC)) {
  const rel = relative(PUBLIC, archivo);
  if (OMITIR.some((o) => rel.startsWith(o))) continue;
  registro[rel.split(sep).join("/")] = readFileSync(archivo).toString("base64");
}
if (!existsSync(WASM_HAVOK)) throw new Error(`No se encontró ${WASM_HAVOK}. Ejecuta "npm install".`);
registro["havok/HavokPhysics.wasm"] = readFileSync(WASM_HAVOK).toString("base64");

const logoSvg = readFileSync(join(PUBLIC, "assets", "ui", "logo.svg"));
const logoUri = `data:image/svg+xml;base64,${logoSvg.toString("base64")}`;

let html = readFileSync(join(DIST, "index.html"), "utf8");

const css = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)];
for (const m of css) {
  const contenido = readFileSync(join(DIST, m[1]), "utf8");
  html = html.replace(m[0], () => `<style>\n${contenido}\n</style>`);
}
const scripts = [...html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g)];
if (scripts.length !== 1) throw new Error(`Se esperaba 1 script de módulo y hay ${scripts.length}.`);
let js = readFileSync(join(DIST, scripts[0][1]), "utf8");
js = js.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
html = html.replace(scripts[0][0], () => "");

html = html
  .replace(/<link rel="manifest"[^>]*>\s*/g, "")
  .replace(/(<link rel="icon"[^>]*href=")[^"]+(")/, (_, a, b) => `${a}${logoUri}${b}`)
  .replace(/(<img class="barra__logo" src=")[^"]+(")/, (_, a, b) => `${a}${logoUri}${b}`);

const datos = `<script>window.__RECURSOS_EMBEBIDOS__=${JSON.stringify(registro)};</script>`;
html = html.replace("</body>", () => `${datos}\n<script type="module">\n${js}\n</script>\n</body>`);

console.log("3/4 Preparando paquete comprimido para embeber en .exe (limpiando .html externos)…");
const htmlBuffer = Buffer.from(html, "utf8");
rmSync(SALIDA_HTML, { force: true });

console.log("4/4 Compilando ejecutable nativo Planta-de-Reciclaje.exe…");
const csc = buscarCscExe();
if (!csc) {
  rmSync(DIST, { recursive: true, force: true });
  throw new Error("No se encontró el compilador nativo de Windows (csc.exe).");
}

mkdirSync(DIST, { recursive: true });
const rutaDeflate = join(DIST, "app.html.deflate");
const rutaIcono = join(DIST, "app.ico");
const rutaCs = join(DIST, "Launcher.cs");

writeFileSync(rutaDeflate, deflateRawSync(htmlBuffer, { level: 9 }));
writeFileSync(rutaIcono, generarIconoIco());
writeFileSync(rutaCs, CODIGO_CS, "utf8");

execFileSync(
  csc,
  [
    "/nologo",
    "/target:winexe",
    "/optimize+",
    `/out:${SALIDA_EXE}`,
    `/win32icon:${rutaIcono}`,
    `/resource:${rutaDeflate},app.html.deflate`,
    "/reference:System.dll",
    "/reference:System.Windows.Forms.dll",
    rutaCs,
  ],
  { stdio: "inherit" },
);

rmSync(DIST, { recursive: true, force: true });
const mbExe = (statSync(SALIDA_EXE).size / 1024 / 1024).toFixed(2);
console.log(
  `\n✔ Ejecutable listo → ${SALIDA_EXE} (${mbExe} MB)\n` +
    `✔ Proyecto limpio  → sin archivos .html en la raíz; todo corre dentro del .exe.\n` +
    `Haz doble clic en Planta-de-Reciclaje.exe para iniciar la aplicación directamente.`,
);
