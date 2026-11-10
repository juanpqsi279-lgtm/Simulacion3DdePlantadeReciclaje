// tools/empaquetar-offline.mjs
// Genera el ejecutable de escritorio "Planta-de-Reciclaje.exe" (y "Planta-de-Reciclaje.html"):
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
const SALIDA_HTML = join(RAIZ, "Planta-de-Reciclaje.html");
const SALIDA_EXE = join(RAIZ, "Planta-de-Reciclaje.exe");
const PUBLIC = join(RAIZ, "public");
const WASM_HAVOK = join(RAIZ, "node_modules", "@babylonjs", "havok", "lib", "esm", "HavokPhysics.wasm");

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

            string perfilTemp = Path.Combine(Path.GetTempPath(), "PlantaReciclaje3D_App_" + puerto);
            Process procesoVentana = null;
            try
            {
                // Modo de verificación automática (--smoke-test): comprueba que el servidor local del .exe responde 200 OK
                if (args != null && args.Length > 0 && args[0] == "--smoke-test")
                {
                    using (WebClient wc = new WebClient())
                    {
                        wc.Encoding = Encoding.UTF8;
                        string resp = wc.DownloadString(url);
                        if (resp != null && resp.Contains("__RECURSOS_EMBEBIDOS__"))
                        {
                            Environment.ExitCode = 0;
                            return;
                        }
                    }
                    Environment.ExitCode = 2;
                    return;
                }

                // Modo ventana dedicada (--port-file=<ruta>): arranca el servidor del .exe y escribe la URL para E2E
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
                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = navegador,
                        Arguments = "--app=" + url +
                                    " --user-data-dir=\\"" + perfilTemp + "\\"" +
                                    " --window-size=1480,920" +
                                    " --no-first-run --no-default-browser-check --disable-sync --disable-extensions",
                        UseShellExecute = false
                    };
                    procesoVentana = Process.Start(psi);
                    if (procesoVentana != null)
                    {
                        // Con --user-data-dir dedicado el proceso dura exactamente mientras la ventana de la app sigue abierta
                        procesoVentana.WaitForExit();
                    }
                }
                else
                {
                    // Respaldo universal si no se encuentra Edge/Chrome en rutas estándar
                    Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
                    Thread.Sleep(60000);
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
                try
                {
                    if (Directory.Exists(perfilTemp)) Directory.Delete(perfilTemp, true);
                }
                catch { }
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

console.log("1/4 Compilando aplicación con Vite (todo en un solo bundle)…");
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

console.log("3/4 Escribiendo Planta-de-Reciclaje.html…");
const htmlBuffer = Buffer.from(html, "utf8");
writeFileSync(SALIDA_HTML, htmlBuffer);

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
const mbHtml = (statSync(SALIDA_HTML).size / 1024 / 1024).toFixed(2);
console.log(
  `\n✔ Ejecutable listo → ${SALIDA_EXE} (${mbExe} MB)\n` +
    `✔ HTML autónomo   → ${SALIDA_HTML} (${mbHtml} MB)\n` +
    `Haz doble clic en Planta-de-Reciclaje.exe para iniciar la aplicación directamente.`,
);
