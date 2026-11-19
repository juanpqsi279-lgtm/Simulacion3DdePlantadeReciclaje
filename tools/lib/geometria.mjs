// tools/lib/geometria.mjs
// Primitivas geométricas para generar los modelos .glb (JavaScript puro, sin dependencias).
// Unidades: metros. Eje Y hacia arriba.
//
// Una "geo" es { pos:[x,y,z...], nor:[...], uv:[u,v...], idx:[...] }.
// Las primitivas dejan en `nor` una normal APROXIMADA que solo sirve para orientar las caras hacia afuera;
// las normales definitivas las calcula `finalizar()` con suavizado por ángulo de pliegue
// (superficies curvas suaves, aristas duras donde corresponde).

const PI = Math.PI;

export function nuevaGeo() { return { pos: [], nor: [], uv: [], idx: [] }; }

const norm3 = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };

// ───────────── Transformaciones ─────────────
export function mover(g, dx, dy, dz) {
  for (let i = 0; i < g.pos.length; i += 3) { g.pos[i] += dx; g.pos[i + 1] += dy; g.pos[i + 2] += dz; }
  return g;
}
export function escalar(g, sx, sy = sx, sz = sx) {
  for (let i = 0; i < g.pos.length; i += 3) { g.pos[i] *= sx; g.pos[i + 1] *= sy; g.pos[i + 2] *= sz; }
  return g;
}
function rotar(g, f) {
  for (const arr of [g.pos, g.nor]) for (let i = 0; i < arr.length; i += 3) {
    const [x, y, z] = f(arr[i], arr[i + 1], arr[i + 2]);
    arr[i] = x; arr[i + 1] = y; arr[i + 2] = z;
  }
  return g;
}
export const rotarX = (g, a) => rotar(g, (x, y, z) => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)]);
export const rotarY = (g, a) => rotar(g, (x, y, z) => [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)]);
export const rotarZ = (g, a) => rotar(g, (x, y, z) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z]);
// Gira una geometría construida alrededor de Y para que su eje sea "x" o "z".
export function ejeA(g, eje) {
  if (eje === "x") return rotarZ(g, -PI / 2);
  if (eje === "z") return rotarX(g, PI / 2);
  return g;
}
export function escalarUV(g, su, sv = su) {
  for (let i = 0; i < g.uv.length; i += 2) { g.uv[i] *= su; g.uv[i + 1] *= sv; }
  return g;
}
export function unir(...gs) {
  const o = nuevaGeo();
  for (const g of gs.flat()) {
    if (!g) continue;
    const base = o.pos.length / 3;
    for (let i = 0; i < g.pos.length; i++) o.pos.push(g.pos[i]);
    for (let i = 0; i < g.nor.length; i++) o.nor.push(g.nor[i]);
    for (let i = 0; i < g.uv.length; i++) o.uv.push(g.uv[i]);
    for (let i = 0; i < g.idx.length; i++) o.idx.push(g.idx[i] + base);
  }
  return o;
}
export function copiar(g) { return { pos: [...g.pos], nor: [...g.nor], uv: [...g.uv], idx: [...g.idx] }; }

// ───────────── Caja con aristas redondeadas ─────────────
// Cada cara es una malla subdividida; los vértices se proyectan sobre una caja interior + radio r.
// k = subdivisiones del redondeo (más k = esquina más suave).
export function cajaRedonda(cx, cy, cz, sx, sy, sz, r = 0.006, k = 2) {
  const g = nuevaGeo();
  const h = [sx / 2, sy / 2, sz / 2];
  r = Math.min(r, Math.min(...h) * 0.98);
  const inn = h.map((v) => v - r);
  const muestras = (hv) => {
    if (r <= 1e-9) return [-hv, hv];
    const s = [];
    for (let i = k; i >= 0; i--) s.push(-(hv - r) - r * Math.tan((PI / 4) * (i / k)));
    for (let i = 0; i <= k; i++) s.push((hv - r) + r * Math.tan((PI / 4) * (i / k)));
    return s;
  };
  const S = h.map(muestras);
  for (let a = 0; a < 3; a++) {
    for (const sg of [-1, 1]) {
      const b = (a + 1) % 3, c = (a + 2) % 3;
      const base = g.pos.length / 3;
      for (let j = 0; j < S[c].length; j++) {
        for (let i = 0; i < S[b].length; i++) {
          const p = [0, 0, 0];
          p[a] = sg * h[a]; p[b] = S[b][i]; p[c] = S[c][j];
          const q = [0, 0, 0];
          q[a] = sg * inn[a];
          q[b] = Math.max(-inn[b], Math.min(inn[b], p[b]));
          q[c] = Math.max(-inn[c], Math.min(inn[c], p[c]));
          const n = norm3(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
          const v = [q[0] + n[0] * r, q[1] + n[1] * r, q[2] + n[2] * r];
          g.pos.push(v[0] + cx, v[1] + cy, v[2] + cz);
          g.nor.push(n[0], n[1], n[2]);
          // UV planar en metros (proyección sobre el plano de la cara)
          const ua = [v[0] + cx, v[1] + cy, v[2] + cz];
          g.uv.push(ua[b] * (sg < 0 ? -1 : 1), ua[c]);
        }
      }
      const W = S[b].length;
      for (let j = 0; j < S[c].length - 1; j++) for (let i = 0; i < W - 1; i++) {
        const A = base + j * W + i;
        g.idx.push(A, A + 1, A + W + 1, A, A + W + 1, A + W);
      }
    }
  }
  return g;
}

// ───────────── Sólido de revolución (torno) ─────────────
// perfil: [[radio, y, m?], ...] de abajo hacia arriba. m (0..1) = peso de modulación opcional.
// opciones: seg, vNorm (v 0..1 normalizado; si no, v en metros), mod(theta, m, r, y) → [r', y']
export function torno(perfil, seg = 40, op = {}) {
  const g = nuevaGeo();
  const n = perfil.length;
  const acum = [0];
  for (let i = 1; i < n; i++) acum.push(acum[i - 1] + Math.hypot(perfil[i][0] - perfil[i - 1][0], perfil[i][1] - perfil[i - 1][1]));
  const total = acum[n - 1] || 1;
  // normal aproximada del perfil (solo para orientar)
  const nrm = perfil.map((_, i) => {
    const a = perfil[Math.max(0, i - 1)], b = perfil[Math.min(n - 1, i + 1)];
    const dr = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dr, dy) || 1;
    return [dy / l, -dr / l];
  });
  for (let i = 0; i < n; i++) {
    for (let s = 0; s <= seg; s++) {
      const t = (s / seg) * PI * 2;
      const c = Math.cos(t), sn = Math.sin(t);
      let [r, y, m] = perfil[i];
      if (op.mod && m) { [r, y] = op.mod(t, m, r, y); }
      g.pos.push(r * c, y, r * sn);
      g.nor.push(nrm[i][0] * c, nrm[i][1], nrm[i][0] * sn);
      g.uv.push(s / seg, op.vNorm ? acum[i] / total : acum[i]);
    }
  }
  const W = seg + 1;
  for (let i = 0; i < n - 1; i++) for (let s = 0; s < seg; s++) {
    const A = i * W + s;
    g.idx.push(A, A + 1, A + W + 1, A, A + W + 1, A + W);
  }
  return g;
}

// Cilindro con chaflán. eje "x" | "y" | "z"
export function cilindro(cx, cy, cz, radio, largo, eje = "y", seg = 32, chaflan = 0.0015) {
  const c = Math.min(chaflan, radio * 0.4, largo * 0.4), L = largo / 2;
  const perfil = c > 0
    ? [[0, -L], [radio - c, -L], [radio, -L + c], [radio, L - c], [radio - c, L], [0, L]]
    : [[0, -L], [radio, -L], [radio, L], [0, L]];
  const g = torno(perfil, seg);
  ejeA(g, eje);
  return mover(g, cx, cy, cz);
}

// Tornillo / tuerca hexagonal (eje Y por defecto)
export function hexagono(cx, cy, cz, radio, alto, eje = "y") {
  const g = torno([[0, -alto / 2], [radio, -alto / 2], [radio, alto / 2], [0, alto / 2]], 6);
  ejeA(g, eje);
  return mover(g, cx, cy, cz);
}

// Esfera / semiesfera
export function esfera(cx, cy, cz, radio, seg = 24) {
  const pf = [];
  const n = 12;
  for (let i = 0; i <= n; i++) { const a = -PI / 2 + (PI * i) / n; pf.push([Math.cos(a) * radio, Math.sin(a) * radio]); }
  pf[0][0] = 0; pf[n][0] = 0;
  return mover(torno(pf, seg), cx, cy, cz);
}

// ───────────── Curvas ─────────────
// Catmull-Rom 2D: devuelve una polilínea suave que pasa por los puntos de control.
export function curva(puntos, sub = 6) {
  const out = [];
  const P = (i) => puntos[Math.max(0, Math.min(puntos.length - 1, i))];
  for (let i = 0; i < puntos.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let s = 0; s < sub; s++) {
      const t = s / sub, t2 = t * t, t3 = t2 * t;
      const q = [0, 1].map((k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
      out.push(q);
    }
  }
  out.push([...puntos[puntos.length - 1]]);
  return out;
}

// ───────────── Rectángulo redondeado (trayectorias y lofts) ─────────────
// Devuelve puntos [x,z] del contorno de un rectángulo w×d con esquinas de radio r (sentido antihorario).
export function contornoRect(w, d, r, arc = 5) {
  r = Math.max(0.0005, Math.min(r, w / 2 - 1e-4, d / 2 - 1e-4));
  const pts = [];
  const esq = [[w / 2 - r, d / 2 - r, 0], [-(w / 2 - r), d / 2 - r, PI / 2], [-(w / 2 - r), -(d / 2 - r), PI], [w / 2 - r, -(d / 2 - r), 1.5 * PI]];
  for (const [cx, cz, a0] of esq) for (let i = 0; i <= arc; i++) {
    const a = a0 + (PI / 2) * (i / arc);
    pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
  }
  return pts;
}

// Une dos anillos (listas de índices de vértices ya añadidos) con una banda de triángulos.
function bandaEntre(g, ringA, ringB) {
  const n = ringA.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    g.idx.push(ringA[i], ringA[j], ringB[j], ringA[i], ringB[j], ringB[i]);
  }
}

// Loft entre secciones rectangulares redondeadas [{y,w,d,r}], opcionalmente con pared hueca.
// espesor > 0 → pared de ese grosor (cara exterior + interior + bordes); si no, solo la cara exterior.
export function loftRect(secciones, { espesor = 0, arc = 5, cx = 0, cz = 0, uvEsc = 1 } = {}) {
  const g = nuevaGeo();
  const anillo = (sec, interior) => {
    const e = interior ? espesor : 0;
    const pts = contornoRect(sec.w - 2 * e, sec.d - 2 * e, Math.max(0.001, sec.r - e), arc);
    const base = g.pos.length / 3;
    let acum = 0;
    pts.forEach((p, i) => {
      if (i) acum += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      g.pos.push(p[0] + cx, sec.y, p[1] + cz);
      const nn = norm3(p[0], 0, p[1]);
      const s = interior ? -1 : 1;
      g.nor.push(nn[0] * s, 0, nn[2] * s);
      g.uv.push(acum * uvEsc, sec.y * uvEsc);
    });
    return pts.map((_, i) => base + i);
  };
  const ext = secciones.map((s) => anillo(s, false));
  for (let i = 0; i < ext.length - 1; i++) bandaEntre(g, ext[i], ext[i + 1]);
  if (espesor > 0) {
    const inte = secciones.map((s) => anillo(s, true));
    for (let i = 0; i < inte.length - 1; i++) bandaEntre(g, inte[i], inte[i + 1]);
    // bordes: arriba y abajo unen exterior con interior (anillos duplicados para normal plana)
    const tapa = (iSec, arriba) => {
      const a = anillo(secciones[iSec], false), b = anillo(secciones[iSec], true);
      for (const id of [...a, ...b]) { g.nor[id * 3] = 0; g.nor[id * 3 + 1] = arriba ? 1 : -1; g.nor[id * 3 + 2] = 0; }
      bandaEntre(g, a, b);
    };
    tapa(0, false);
    tapa(secciones.length - 1, true);
  }
  return g;
}

// Barrido de un círculo (tubo) a lo largo de una trayectoria 3D [[x,y,z]...].
export function barrido(path, radio, { cerrado = true, seg = 10, uvEsc = 1 } = {}) {
  const g = nuevaGeo();
  const n = path.length;
  const rings = [];
  let acum = 0;
  for (let i = 0; i < n; i++) {
    const a = path[cerrado ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const b = path[cerrado ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const t = norm3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    let up = [0, 1, 0];
    if (Math.abs(t[1]) > 0.95) up = [1, 0, 0];
    const bi = norm3(t[1] * up[2] - t[2] * up[1], t[2] * up[0] - t[0] * up[2], t[0] * up[1] - t[1] * up[0]);
    const nn = norm3(bi[1] * t[2] - bi[2] * t[1], bi[2] * t[0] - bi[0] * t[2], bi[0] * t[1] - bi[1] * t[0]);
    if (i) acum += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]);
    const base = g.pos.length / 3;
    for (let s = 0; s <= seg; s++) {
      const f = (s / seg) * PI * 2;
      const c = Math.cos(f), sn = Math.sin(f);
      const dx = nn[0] * c + bi[0] * sn, dy = nn[1] * c + bi[1] * sn, dz = nn[2] * c + bi[2] * sn;
      g.pos.push(path[i][0] + dx * radio, path[i][1] + dy * radio, path[i][2] + dz * radio);
      g.nor.push(dx, dy, dz);
      g.uv.push(acum * uvEsc, (s / seg) * uvEsc);
    }
    rings.push(base);
  }
  const W = seg + 1;
  const m = cerrado ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const A = rings[i], B = rings[(i + 1) % n];
    for (let s = 0; s < seg; s++) g.idx.push(A + s, A + s + 1, B + s + 1, A + s, B + s + 1, B + s);
  }
  return g;
}

// Tubo redondeado que sigue un rectángulo en el plano XZ a la altura y.
export function aroRect(w, d, r, y, radioTubo, { cx = 0, cz = 0, seg = 10, arc = 5 } = {}) {
  const pts = contornoRect(w, d, r, arc).map((p) => [p[0] + cx, y, p[1] + cz]);
  return barrido(pts, radioTubo, { cerrado: true, seg });
}

// ───────────── Orientación y normales ─────────────
function arreglarSentido(g) {
  for (let i = 0; i < g.idx.length; i += 3) {
    const [a, b, c] = [g.idx[i], g.idx[i + 1], g.idx[i + 2]];
    const P = (k) => [g.pos[k * 3], g.pos[k * 3 + 1], g.pos[k * 3 + 2]];
    const pa = P(a), pb = P(b), pc = P(c);
    const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const hx = g.nor[a * 3] + g.nor[b * 3] + g.nor[c * 3];
    const hy = g.nor[a * 3 + 1] + g.nor[b * 3 + 1] + g.nor[c * 3 + 1];
    const hz = g.nor[a * 3 + 2] + g.nor[b * 3 + 2] + g.nor[c * 3 + 2];
    if (n[0] * hx + n[1] * hy + n[2] * hz < 0) { g.idx[i + 1] = c; g.idx[i + 2] = b; }
  }
}

// Orienta las caras, elimina triángulos degenerados y recalcula normales suaves con ángulo de pliegue.
export function finalizar(g, plieguesGrados = 50) {
  arreglarSentido(g);
  const cosC = Math.cos((plieguesGrados * PI) / 180);
  const nT = g.idx.length / 3;
  const fn = new Float64Array(nT * 3), fa = new Float64Array(nT);
  const mapa = new Map();
  const clave = (i) => `${Math.round(g.pos[i * 3] * 2e5)}_${Math.round(g.pos[i * 3 + 1] * 2e5)}_${Math.round(g.pos[i * 3 + 2] * 2e5)}`;
  for (let t = 0; t < nT; t++) {
    const [a, b, c] = [g.idx[t * 3], g.idx[t * 3 + 1], g.idx[t * 3 + 2]];
    const ux = g.pos[b * 3] - g.pos[a * 3], uy = g.pos[b * 3 + 1] - g.pos[a * 3 + 1], uz = g.pos[b * 3 + 2] - g.pos[a * 3 + 2];
    const vx = g.pos[c * 3] - g.pos[a * 3], vy = g.pos[c * 3 + 1] - g.pos[a * 3 + 1], vz = g.pos[c * 3 + 2] - g.pos[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const area = Math.hypot(nx, ny, nz);
    fa[t] = area;
    if (area > 1e-14) { fn[t * 3] = nx / area; fn[t * 3 + 1] = ny / area; fn[t * 3 + 2] = nz / area; }
    if (area <= 1e-14) continue;
    for (const v of [a, b, c]) {
      const k = clave(v);
      let l = mapa.get(k);
      if (!l) mapa.set(k, (l = []));
      l.push(t);
    }
  }
  const o = nuevaGeo();
  const cache = new Map();
  for (let t = 0; t < nT; t++) {
    if (fa[t] <= 1e-14) continue;
    for (let c = 0; c < 3; c++) {
      const vi = g.idx[t * 3 + c];
      let sx = 0, sy = 0, sz = 0;
      for (const tt of mapa.get(clave(vi))) {
        const d = fn[tt * 3] * fn[t * 3] + fn[tt * 3 + 1] * fn[t * 3 + 1] + fn[tt * 3 + 2] * fn[t * 3 + 2];
        if (d >= cosC) { sx += fn[tt * 3] * fa[tt]; sy += fn[tt * 3 + 1] * fa[tt]; sz += fn[tt * 3 + 2] * fa[tt]; }
      }
      const nn = norm3(sx, sy, sz);
      const kk = `${vi}|${Math.round(nn[0] * 500)}|${Math.round(nn[1] * 500)}|${Math.round(nn[2] * 500)}`;
      let id = cache.get(kk);
      if (id === undefined) {
        id = o.pos.length / 3;
        o.pos.push(g.pos[vi * 3], g.pos[vi * 3 + 1], g.pos[vi * 3 + 2]);
        o.nor.push(nn[0], nn[1], nn[2]);
        o.uv.push(g.uv[vi * 2] ?? 0, g.uv[vi * 2 + 1] ?? 0);
        cache.set(kk, id);
      }
      o.idx.push(id);
    }
  }
  return o;
}
