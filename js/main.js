/* =========================================================
   De líder a Leyenda · motor de escenas a pantalla completa
   Cada gesto (rueda, swipe, teclado) avanza un paso: primero los
   pasos internos de la escena (data-beats), luego la escena siguiente.
   JavaScript vanilla, sin dependencias.
   ========================================================= */
(() => {
  'use strict';

  /* ---------------------------------------------------------
     CONFIGURACIÓN
     - ctaUrl: a dónde lleva el botón final.
     - sequences: secuencias video → frames. Exporta los frames a
       assets/frames/<carpeta>/0001.webp, 0002.webp… y escribe en
       count cuántos hay. Con count: 0 la escena funciona sin video.
     - Los pasos de cada escena viven en el HTML: data-beats="0,.5,1"
       (valores de progreso 0..1 donde la escena se detiene).
     - data-curtain="Palabra" en una escena la abre con la cortina
       de capítulo al avanzar.
     --------------------------------------------------------- */
  const CONFIG = {
    ctaUrl: '#',
    starkDate: '2027-03-01T00:00:00-05:00',
    sectionMs: 1250,      // duración del cambio de escena (más lento = más suave)
    wheelGap: 240,         // ms de quietud de la rueda para contar un gesto nuevo
    /* Insignias del cierre (detrás del 1.000). Cada entrada prueba las rutas en orden
       (sin extensión prueba .png, .webp, .jpg, .svg). Si ninguna existe, se usa el
       dibujo vectorial de respaldo. Agrega o quita entradas libremente. */
    ring: [
      'assets/img/insignias/Insignias/Animadas/Leyenda.webm',
      'assets/img/insignias/Insignias/Animadas/SabioMax.webm',
      'assets/img/insignias/Insignias/Animadas/ExpertoPlus.webm',
      'assets/img/insignias/Insignias/Animadas/ExploradorLite.webm',
      'assets/img/insignias/Insignias/Animadas/BienvenidoMax.webm',
      'assets/img/insignias/Insignias/Animadas/Insignia 2-1 sin fondo.webm',
      'assets/img/insignias/Insignias/Animadas/Medallon-lideres.webm'
    ],
    ringRadius: { x: .3, y: .3 },   // separación del anillo: % del ancho y del alto de la pantalla
    ringExtra: 6,          // prueba también cierre/09 … cierre/14 (se omiten si no existen)
    sequences: {
      /* Video scroll en PNG: copia los frames en assets/frames/scroll/ como 0001.png, 0002.png…
         count: 'auto' detecta cuántos hay. Si tus archivos se llaman distinto (ej. "Comp 1_00000.png"),
         ajusta prefix, start y pad. fit: 'contain' (objeto con transparencia) o 'cover' (fondo). */
      scroll:       { path: 'assets/frames/scroll/', prefix: '', start: 1, pad: 4, ext: 'png', count: 'auto', fit: 'contain' },
      apertura:     { path: 'assets/frames/apertura/',     count: 0, ext: 'webp', pad: 4 },
      nuevaDropi:   { path: 'assets/frames/nueva-dropi/',  count: 0, ext: 'webp', pad: 4 },
      webe:         { path: 'assets/frames/webe/',         count: 0, ext: 'webp', pad: 4 },
      placa:        { path: 'assets/frames/placa/',        count: 0, ext: 'webp', pad: 4 },
      experiencias: { path: 'assets/frames/experiencias/', count: 0, ext: 'webp', pad: 4 },
      cierre:       { path: 'assets/frames/cierre/',       count: 0, ext: 'webp', pad: 4 }
    }
  };

  /* ---------- utilidades ---------- */
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, t) => a + (b - a) * t;
  const eo = t => 1 - Math.pow(1 - t, 3);
  const eio = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const fmt = n => Math.round(n).toLocaleString('es-CO');
  const pad2 = n => String(n).padStart(2, '0');
  const piece = (f, steps) => {
    const n = steps.length - 1, x = clamp(f) * n, i = Math.min(n - 1, Math.floor(x));
    return lerp(steps[i], steps[i + 1], x - i);
  };
  const usd = v => (v >= 1e6 ? `USD ${(v / 1e6).toFixed(1).replace('.', ',').replace(',0', '')}M` : `USD ${fmt(v / 1000)}K`).replace('USD 0K', 'USD 0');
  const op = (el, o, tr) => { if (!el) return; el.style.opacity = o; if (tr !== undefined) el.style.transform = tr; };
  const EASE = 'cubic-bezier(.65,0,.25,1)';
  const SOFT = 'cubic-bezier(.33,0,.15,1)';
  const eIn = t => t * t * t;
  const smooth = t => t * t * (3 - 2 * t);

  const root = document.documentElement;
  root.classList.add('js');
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (RM) root.classList.add('rm');
  const isMobile = () => innerWidth < 761;
  const lowEnd = () => isMobile() && ((navigator.hardwareConcurrency || 8) <= 4 || (navigator.connection && navigator.connection.saveData));

  /* Puntero: inclinaciones (mx, my) y posición en px para la tipografía viva */
  let time = 0, mx = 0, my = 0, tmx = 0, tmy = 0, px = -9999, py = -9999, hasMouse = false;
  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    tmx = (e.clientX / innerWidth) * 2 - 1;
    tmy = (e.clientY / innerHeight) * 2 - 1;
    px = e.clientX; py = e.clientY; hasMouse = true;
  }, { passive: true });
  document.addEventListener('mouseleave', () => { hasMouse = false; });

  /* ---------------------------------------------------------
     Texto letra a letra: cada carácter queda en su propio span
     (para la tipografía que reacciona al cursor y las entradas).
     El texto completo se conserva para lectores de pantalla.
     --------------------------------------------------------- */
  function splitChars(el) {
    if (el.dataset.split) return;
    el.dataset.split = '1';
    const label = el.textContent.replace(/\s+/g, ' ').trim();
    const box = document.createElement('span');
    box.className = 'chars'; box.setAttribute('aria-hidden', 'true');
    while (el.firstChild) box.appendChild(el.firstChild);
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    let ci = 0;
    nodes.forEach(n => {
      const frag = document.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach(part => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
        const w = document.createElement('span'); w.className = 'wd';
        for (const chr of part) {
          const c = document.createElement('span');
          c.className = 'ch'; c.textContent = chr; c.style.setProperty('--ci', ci++);
          w.appendChild(c);
        }
        frag.appendChild(w);
      });
      n.replaceWith(frag);
    });
    const sr = document.createElement('span'); sr.className = 'sr'; sr.textContent = label;
    el.append(sr, box);
  }

  /* Envuelve el texto de .reveal > span en <i> para la máscara */
  $$('.reveal > span').forEach(s => { s.innerHTML = `<i>${s.innerHTML}</i>`; });
  const revealLines = (el, t, stagger = .25) => {
    const lines = $$('.reveal > span > i', el);
    lines.forEach((l, i) => {
      const k = eo(clamp(t * (1 + stagger * (lines.length - 1)) - i * stagger));
      l.style.transform = `translateY(${(1 - k) * 105}%)`;
      l.parentElement.classList.toggle('is-open', k > .999);
    });
  };

  /* Tipografía que reacciona al cursor */
  const KINETIC = '.reveal > span > i, .panel--intro .h-xl > span, .open-head h1, .panel-title, .h-lg, .rules p, .close-title, .close-cta p, .adventures li';
  $$(KINETIC).forEach(el => { el.setAttribute('data-kin', ''); splitChars(el); });

  /* Extrusión 3D de las cifras: capas apiladas en Z */
  $$('.num3d').forEach(n => {
    const face = $('.num3d-face', n);
    for (let i = 26; i >= 1; i--) {
      const s = document.createElement('span');
      s.className = i <= 2 ? 'layer layer--rim' : 'layer'; s.style.setProperty('--i', i);
      s.textContent = face.textContent; s.setAttribute('aria-hidden', 'true');
      n.insertBefore(s, face);
    }
  });

  /* ---------------------------------------------------------
     Secuencias video → frames (canvas al ritmo del scroll)
     --------------------------------------------------------- */
  class Sequence {
    constructor(canvas, cfg) {
      this.c = canvas; this.ctx = canvas.getContext('2d');
      const m = isMobile() && cfg.mobile && cfg.mobile.count > 0 ? { ...cfg, ...cfg.mobile } : cfg;
      this.src = m; this.n = m.count === 'auto' ? 0 : m.count; this.frames = []; this.last = -1;
      if (cfg.video && lowEnd()) { this.useVideo(cfg.video); return; }
      if (m.count === 'auto') this.detect().then(n => { this.n = n; if (n) this.load(); });
      else this.load();
    }
    url(i) { const s = this.src; return s.path + (s.prefix || '') + String(i + (s.start ?? 1)).padStart(s.pad ?? 4, '0') + '.' + (s.ext || 'webp'); }
    async detect() {
      const has = i => new Promise(r => { const im = new Image(); im.onload = () => r(true); im.onerror = () => r(false); im.src = this.url(i); });
      if (!(await has(0))) return 0;
      let lo = 0, hi = 1;
      while (hi < 4096 && await has(hi)) { lo = hi; hi *= 2; }
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (await has(m)) lo = m; else hi = m; }
      return lo + 1;
    }
    load() {
      // carga progresiva: primero frames espaciados, luego rellena
      const order = [], seen = new Set();
      for (let step = 16; step >= 1; step = step >> 1)
        for (let i = 0; i < this.n; i += step) if (!seen.has(i)) { seen.add(i); order.push(i); }
      let k = 0;
      const next = () => {
        if (k >= order.length) return;
        const i = order[k++], img = new Image();
        img.decoding = 'async';
        img.onload = () => { this.frames[i] = img; if (!this.c.classList.contains('is-ready')) { this.c.classList.add('is-ready'); this.last = -1; } next(); };
        img.onerror = next;
        img.src = this.url(i);
      };
      for (let j = 0; j < 4; j++) next();
    }
    useVideo(src) {
      const v = document.createElement('video');
      Object.assign(v, { src, muted: true, loop: true, autoplay: true, playsInline: true });
      v.className = 'seq-video'; v.setAttribute('aria-hidden', 'true');
      this.c.replaceWith(v); this.n = 0;
    }
    draw(p) {
      if (!this.n) return;
      let idx = Math.round(clamp(p) * (this.n - 1)), img = this.frames[idx];
      for (let d = 1; !img && d < this.n; d++) img = this.frames[idx - d] || this.frames[idx + d];
      if (!img) return;
      const dpr = Math.min(1.5, devicePixelRatio || 1), w = this.c.clientWidth, h = this.c.clientHeight;
      if (this.c.width !== Math.round(w * dpr) || this.c.height !== Math.round(h * dpr)) { this.c.width = w * dpr; this.c.height = h * dpr; this.last = -1; }
      if (img === this.last) return;
      this.last = img;
      const s = (this.src.fit === 'contain' ? Math.min : Math.max)(this.c.width / img.naturalWidth, this.c.height / img.naturalHeight);
      const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
      this.ctx.clearRect(0, 0, this.c.width, this.c.height);
      this.ctx.drawImage(img, (this.c.width - dw) / 2, (this.c.height - dh) / 2, dw, dh);
    }
  }
  const sequences = new Map();
  $$('canvas.seq').forEach(c => {
    const cfg = CONFIG.sequences[c.dataset.seq];
    if (cfg && (cfg.count > 0 || cfg.count === 'auto')) sequences.set(c, new Sequence(c, cfg));
  });
  const drawSeq = (c, p) => { const s = sequences.get(c); if (s) s.draw(p); };

  /* ---------------------------------------------------------
     Imágenes intercambiables (data-srcs="ruta1|ruta2")
     Rutas sin extensión prueban .png, .webp, .jpg y .svg.
     Si ninguna carga, queda el respaldo (SVG o texto).
     --------------------------------------------------------- */
  const EXTS = ['png', 'webp', 'jpg', 'svg'];
  const candidates = spec => spec.split('|').map(x => x.trim()).filter(Boolean)
    .flatMap(u => (/^(https?:|data:)/.test(u) || /\.[a-z0-9]{2,4}$/i.test(u)) ? [u] : EXTS.map(e => `${u}.${e}`));
  
  const VIDEO = /\.(webm|mp4|mov)(\?|$)/i;
  const probe = u => new Promise(ok => {
    if (VIDEO.test(u)) {
      const v = document.createElement('video');
      v.muted = true; v.preload = 'metadata';
      v.onloadedmetadata = () => ok(true); v.onerror = () => ok(false);
      v.src = u;
    } else {
      const im = new Image(); im.decoding = 'async';
      im.onload = () => ok(true); im.onerror = () => ok(false); im.src = u;
    }
  });
  const loadFirst = async list => { for (const u of list) if (await probe(u)) return u; return null; };
  const makeMedia = u => {
    if (VIDEO.test(u)) {
      const v = document.createElement('video');
      Object.assign(v, { src: u, muted: true, loop: true, autoplay: true, playsInline: true });
      v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
      v.play().catch(() => {});
      return v;
    }
    const im = document.createElement('img'); im.alt = ''; im.decoding = 'async'; im.src = u;
    return im;
  };
  function fillSlot(el) {
    const spec = el.dataset.srcs; if (!spec) return Promise.resolve(null);
    return loadFirst(candidates(spec)).then(u => {
      if (!u) { el.classList.add('no-img'); return null; }
      if (el.tagName === 'IMG') { el.src = u; (el.closest('.slot') || el).classList.add('has-img'); }
      else if (el.classList.contains('photo')) { el.style.setProperty('--img', `url("${new URL(u, location.href).href}")`); el.classList.add('is-loaded'); }
      else {
        el.querySelectorAll(':scope > img, :scope > video').forEach(n => n.remove());
        el.prepend(makeMedia(u));
        el.classList.add('has-img');
      }
      return u;
    });
  }

  /* Fotos de fondo: capa de lente (bordes desenfocados + dispersión cromática) */
  $$('.photo').forEach(ph => ph.insertAdjacentHTML('beforeend', '<span class="photo-lens"><span class="lens-gb"></span><span class="lens-r"></span></span>'));

  /* Videos de fondo (data-vsrcs="ruta1|ruta2"): usa la primera ruta que exista */
  $$('video[data-vsrcs]').forEach(v => {
    const box = v.closest('.bg-video');
    loadFirst(v.dataset.vsrcs.split('|').map(x => x.trim()).filter(Boolean)).then(u => {
      if (!u) { if (box) box.classList.add('no-video'); return; }
      v.src = u; v.muted = true;
      v.addEventListener('loadeddata', () => { if (box) box.classList.add('is-ready'); }, { once: true });
      if (v.closest('.scene.is-vis') && !RM) v.play().catch(() => {});
    });
  });

  /* Anillo de insignias del cierre: se arma desde CONFIG.ring */
  const ringEl = $('[data-ring]'), ringTpl = $('#ring-fallbacks');
  if (ringEl && ringTpl) {
    const fallbacks = [...ringTpl.content.children];
    const specs = [...CONFIG.ring];
    for (let k = CONFIG.ring.length + 1; k <= CONFIG.ring.length + CONFIG.ringExtra; k++) specs.push(`assets/img/cierre/${pad2(k)}`);
    specs.forEach((spec, i) => {
      const ri = document.createElement('span');
      ri.className = 'ri slot'; ri.dataset.srcs = spec;
      if (i < CONFIG.ring.length) {
        const fb = fallbacks[i % fallbacks.length].cloneNode(true);
        if (fb.classList.contains('placa-ico')) ri.classList.add('ri--placa');
        ri.appendChild(fb);
      } else ri.classList.add('ri--extra');
      ringEl.appendChild(ri);
    });
  }
  const slotsReady = Promise.all($$('[data-srcs]').map(fillSlot)).then(() => {
    $$('.ri--extra.no-img').forEach(n => n.remove());
    dispatchEvent(new Event('slots'));
  });

  /* ---------------------------------------------------------
     Nubes volumétricas del despegue (Proyecto Stark)
     Liviano: cada bocanada es un sprite pre-horneado una sola vez
     con ruido fractal + iluminación (normal de esfera perturbada).
     Se hornean dos juegos: luz fría desde arriba y luz cálida de la
     llama desde abajo; al dibujar se mezclan según la edad.
     --------------------------------------------------------- */
  function Clouds(cv) {
    const ctx = cv.getContext('2d');
    const S = 128, NV = 5, MAX = 240;
    let W = 0, H = 0, dpr = 1, list = [], acc = 0, accT = 0, cool = null, warm = null;

    const hash = (x, y, s) => {
      let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1442695041);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    };
    const vnoise = (x, y, s) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    const fbm = (x, y, s) => { let t = 0, a = .5, f = 1; for (let i = 0; i < 5; i++) { t += a * vnoise(x * f, y * f, s + i * 31); f *= 2.03; a *= .5; } return t; };
    const norm = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
    const LC = norm(-.38, -.78, .55), LW = norm(.08, .92, .42);

    function bake(seed) {
      const dens = new Float32Array(S * S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const nx = (x + .5) / S * 2 - 1, ny = (y + .5) / S * 2 - 1, r = Math.hypot(nx, ny);
        if (r >= 1) continue;
        const n = fbm(nx * 2.3 + seed * 7.1, ny * 2.3 + seed * 3.7, seed * 13 + 1);
        const edge = .5 + .5 * n;                       // contorno algodonoso
        const a = clamp((1 - r / edge) * 2.6);
        const h = Math.sqrt(Math.max(0, 1 - r * r));
        dens[y * S + x] = a * (.5 + .5 * h) * (.55 + .7 * (n - .3));
      }
      const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
      const cC = mk(), cW = mk(), gC = cC.getContext('2d'), gW = cW.getContext('2d');
      const iC = gC.createImageData(S, S), iW = gW.createImageData(S, S);
      const at = (x, y) => dens[clamp(y, 0, S - 1) * S + clamp(x, 0, S - 1)];
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const d = dens[y * S + x]; if (d <= 0) continue;
        const nx = (x + .5) / S * 2 - 1, ny = (y + .5) / S * 2 - 1, h = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const gx = (at(x - 1, y) - at(x + 1, y)) * 9, gy = (at(x, y - 1) - at(x, y + 1)) * 9;
        const N = norm(nx * .8 + gx, ny * .8 + gy, h * .9 + .35);
        const dc = Math.max(0, N[0] * LC[0] + N[1] * LC[1] + N[2] * LC[2]);
        const dw = Math.max(0, N[0] * LW[0] + N[1] * LW[1] + N[2] * LW[2]);
        const ao = .55 + .45 * clamp(d * 1.4);           // núcleo denso = más volumen
        const k = (y * S + x) * 4, al = Math.round(clamp(d * 1.35) * 255);
        const lc = (.16 + .84 * dc) * ao;
        iC.data[k] = lerp(46, 238, lc); iC.data[k + 1] = lerp(44, 232, lc); iC.data[k + 2] = lerp(48, 224, lc); iC.data[k + 3] = al;
        const lw = (.12 + .88 * dw) * ao, fill = dc * .28;
        iW.data[k] = Math.min(255, lerp(62, 255, lw) + fill * 60); iW.data[k + 1] = Math.min(255, lerp(34, 170, lw) + fill * 70); iW.data[k + 2] = Math.min(255, lerp(22, 78, lw) + fill * 80); iW.data[k + 3] = al;
      }
      gC.putImageData(iC, 0, 0); gW.putImageData(iW, 0, 0);
      return [cC, cW];
    }
    function sprites() {
      if (cool) return;
      cool = []; warm = [];
      for (let i = 0; i < NV; i++) { const [c, w] = bake(i + 1); cool.push(c); warm.push(w); }
    }
    function build() {
      dpr = Math.min(1.25, devicePixelRatio || 1);
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    }
    function puff(o) {
      if (list.length >= MAX) list.shift();
      list.push({ ...o, life: 0, rot: Math.random() * 6.28, vr: (Math.random() - .5) * .5, v: (Math.random() * NV) | 0 });
    }
    function step(dt, nz, ground, idle, burst, trail) {
      if (RM) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); return; }
      sprites();
      // vapor tranquilo en la plataforma + nube de ignición que se expande a ras del suelo
      acc += (idle * 7 + burst * 95) * dt;
      while (acc > 1) {
        acc--;
        const side = Math.random() < .5 ? -1 : 1, b = burst > .03;
        puff({
          x: nz.x + side * (6 + Math.random() * (b ? 34 : 22)), y: ground - 4 - Math.random() * 8,
          vx: side * (b ? 70 + Math.random() * 300 : 8 + Math.random() * 26),
          vy: -(b ? 10 + Math.random() * 60 : 3 + Math.random() * 10),
          r: b ? 16 + Math.random() * 18 : 9 + Math.random() * 8,
          g: b ? 38 + Math.random() * 54 : 9 + Math.random() * 12,
          max: b ? 4 + Math.random() * 3 : 3.5 + Math.random() * 2.5,
          a: b ? .92 : .5, warm: b ? 1 : 0, ground
        });
      }
      // estela de la llama mientras sube
      accT += trail * 46 * dt;
      while (accT > 1) {
        accT--;
        puff({
          x: nz.x + (Math.random() - .5) * 12, y: nz.y + 12 + Math.random() * 14,
          vx: (Math.random() - .5) * 40, vy: 30 + Math.random() * 60,
          r: 10 + Math.random() * 9, g: 26 + Math.random() * 30, max: 2.6 + Math.random() * 1.8,
          a: .85, warm: 1, ground
        });
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      list = list.filter(p => (p.life += dt) < p.max);
      for (const p of list) {
        const k = p.life / p.max;
        p.vx *= Math.pow(.32, dt); p.vy *= Math.pow(.55, dt);
        p.vy -= 16 * dt * k;                                     // flotación: sube al enfriarse
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.r += p.g * dt * (1 - k * .65);
        p.rot += p.vr * dt;
        const floor = p.ground - p.r * .3;
        if (p.y > floor) { p.y = floor; p.vy = Math.min(p.vy, 0); }
        const al = p.a * Math.min(1, k / .1) * (1 - smooth(clamp((k - .5) / .5)));
        if (al < .01) continue;
        const w = clamp(p.warm * Math.exp(-p.life * 1.25));
        const c = Math.cos(p.rot) * dpr, s = Math.sin(p.rot) * dpr;
        ctx.setTransform(c, s, -s, c, p.x * dpr, p.y * dpr);
        if (w < .97) { ctx.globalAlpha = al * (1 - w); ctx.drawImage(cool[p.v], -p.r, -p.r, p.r * 2, p.r * 2); }
        if (w > .03) { ctx.globalAlpha = al * w; ctx.drawImage(warm[p.v], -p.r, -p.r, p.r * 2, p.r * 2); }
      }
      ctx.globalAlpha = 1;
    }
    return { build, step };
  }

  /* ---------------------------------------------------------
     Humo fluido del despegue (estilo "smokey cursor")
     Simulación de fluidos en WebGL2: advección, vorticidad y presión.
     Nubes naranjas y amarillas que salen de la tobera, se expanden a
     ras del suelo en la ignición y siguen al cursor sobre el panel.
     Si el navegador no tiene WebGL2 se usa el humo en canvas 2D.
     --------------------------------------------------------- */
  function Fluid(cv) {
    if (RM) return null;
    let gl;
    try { gl = cv.getContext('webgl2', { alpha: true, depth: false, stencil: false, antialias: false, premultipliedAlpha: true }); } catch (_) { gl = null; }
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) return null;
    const Q = lowEnd() ? { sim: 96, dye: 320 } : { sim: 128, dye: 560 };
    const C = { dDiss: .9, vDiss: .28, pressure: .8, iters: 16, curl: 26 };
    const VS = `#version 300 es
      precision highp float; in vec2 aPos; uniform vec2 texel;
      out vec2 vUv; out vec2 vL; out vec2 vR; out vec2 vT; out vec2 vB;
      void main(){ vUv=aPos*.5+.5; vL=vUv-vec2(texel.x,0.); vR=vUv+vec2(texel.x,0.); vT=vUv+vec2(0.,texel.y); vB=vUv-vec2(0.,texel.y); gl_Position=vec4(aPos,0.,1.); }`;
    const HEAD = `#version 300 es
      precision highp float; precision highp sampler2D;
      in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB; out vec4 o;\n`;
    const FS = {
      clear: `uniform sampler2D uT; uniform float val; void main(){ o = val * texture(uT, vUv); }`,
      splat: `uniform sampler2D uT; uniform float ratio; uniform vec3 color; uniform vec2 pt; uniform float rad;
        void main(){ vec2 p = vUv - pt; p.x *= ratio; vec3 s = exp(-dot(p, p) / rad) * color; o = vec4(texture(uT, vUv).xyz + s, 1.); }`,
      adv: `uniform sampler2D uV; uniform sampler2D uS; uniform vec2 vtexel; uniform float dt; uniform float diss;
        void main(){ vec2 c = vUv - dt * texture(uV, vUv).xy * vtexel; vec4 r = texture(uS, c) / (1. + diss * dt); o = vec4(r.xyz, 1.); }`,
      div: `uniform sampler2D uV;
        void main(){ float L = texture(uV, vL).x, R = texture(uV, vR).x, T = texture(uV, vT).y, B = texture(uV, vB).y; vec2 c = texture(uV, vUv).xy;
          if (vL.x < 0.) L = -c.x; if (vR.x > 1.) R = -c.x; if (vT.y > 1.) T = -c.y; if (vB.y < 0.) B = -c.y;
          o = vec4(.5 * (R - L + T - B), 0., 0., 1.); }`,
      curl: `uniform sampler2D uV;
        void main(){ float L = texture(uV, vL).y, R = texture(uV, vR).y, T = texture(uV, vT).x, B = texture(uV, vB).x; o = vec4(.5 * (R - L - T + B), 0., 0., 1.); }`,
      vort: `uniform sampler2D uV; uniform sampler2D uC; uniform float curl; uniform float dt;
        void main(){ float L = texture(uC, vL).x, R = texture(uC, vR).x, T = texture(uC, vT).x, B = texture(uC, vB).x, c = texture(uC, vUv).x;
          vec2 f = .5 * vec2(abs(T) - abs(B), abs(R) - abs(L)); f /= length(f) + .0001; f *= curl * c; f.y *= -1.;
          vec2 v = texture(uV, vUv).xy + f * dt; o = vec4(clamp(v, -1000., 1000.), 0., 1.); }`,
      pres: `uniform sampler2D uP; uniform sampler2D uD;
        void main(){ float L = texture(uP, vL).x, R = texture(uP, vR).x, T = texture(uP, vT).x, B = texture(uP, vB).x;
          o = vec4((L + R + B + T - texture(uD, vUv).x) * .25, 0., 0., 1.); }`,
      grad: `uniform sampler2D uP; uniform sampler2D uV;
        void main(){ float L = texture(uP, vL).x, R = texture(uP, vR).x, T = texture(uP, vT).x, B = texture(uP, vB).x;
          o = vec4(texture(uV, vUv).xy - vec2(R - L, T - B), 0., 1.); }`,
      show: `uniform sampler2D uT;
        void main(){ vec3 c = texture(uT, vUv).rgb; c = 1. - exp(-c * 1.25); float a = clamp(max(c.r, max(c.g, c.b)) * .9, 0., .92); o = vec4(min(c, vec3(a)), a); }`
    };
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const vsh = sh(gl.VERTEX_SHADER, VS); if (!vsh) return null;
    const P = {};
    for (const k in FS) {
      const f = sh(gl.FRAGMENT_SHADER, HEAD + FS[k]); if (!f) return null;
      const pr = gl.createProgram(); gl.attachShader(pr, vsh); gl.attachShader(pr, f); gl.bindAttribLocation(pr, 0, 'aPos'); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
      const u = {}, n = gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(pr, i).name; u[nm] = gl.getUniformLocation(pr, nm); }
      P[k] = { pr, u };
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.enableVertexAttribArray(0);

    const fbo = (w, h) => {
      const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      return { t, f, w, h, tx: 1 / w, ty: 1 / h };
    };
    const dbl = (w, h) => { const d = { a: fbo(w, h), b: fbo(w, h), w, h, tx: 1 / w, ty: 1 / h }; d.swap = () => { const x = d.a; d.a = d.b; d.b = x; }; return d; };
    const free = d => { if (!d) return; [d.a, d.b].forEach(x => { gl.deleteTexture(x.t); gl.deleteFramebuffer(x.f); }); };
    const freeS = x => { if (x) { gl.deleteTexture(x.t); gl.deleteFramebuffer(x.f); } };
    const res = r => { const a = Math.max(W, 1) / Math.max(H, 1); return a >= 1 ? [Math.round(r * a), r] : [r, Math.round(r / a)]; };

    let W = 0, H = 0, vel, dye, pres, divF, curlF, acc = 0, accT = 0, queue = [], ok = true, idleT = 0;
    function build() {
      const dpr = Math.min(1, devicePixelRatio || 1);
      const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      if (vel && Math.abs(w / h - W / H) < .02) { W = w; H = h; return; }
      W = w; H = h;
      free(vel); free(dye); free(pres); freeS(divF); freeS(curlF);
      const [sw, shh] = res(Q.sim), [dw, dh] = res(Q.dye);
      vel = dbl(sw, shh); dye = dbl(dw, dh); pres = dbl(sw, shh); divF = fbo(sw, shh); curlF = fbo(sw, shh);
    }
    const use = (k, texel) => { const p = P[k]; gl.useProgram(p.pr); if (texel && p.u.texel) gl.uniform2f(p.u.texel, texel[0], texel[1]); return p.u; };
    let unit = 0;
    const tex = (loc, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(loc, unit); unit++; };
    const blit = target => {
      if (target) { gl.bindFramebuffer(gl.FRAMEBUFFER, target.f); gl.viewport(0, 0, target.w, target.h); }
      else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); }
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0); unit = 0;
    };
    // Paleta: naranjas y amarillos (h 16°–50°)
    const warm = (k, hot = 0) => {
      const h = (16 + Math.random() * 34) / 60, i = Math.floor(h), f = h - i, s = 1 - hot * .55, v = 1;
      const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
      const c = i === 0 ? [v, t, p] : [q, v, p];
      return c.map(x => x * k);
    };
    // x, y, vx, vy en px CSS del canvas (y hacia abajo)
    function splat(x, y, vx, vy, col, r) {
      if (!vel) return;
      const ratio = W / H, rr = (r / 100) * (ratio > 1 ? ratio : 1), px = x / W, py = 1 - y / H;
      let u = use('splat', [vel.tx, vel.ty]); tex(u.uT, vel.a.t);
      gl.uniform1f(u.ratio, ratio); gl.uniform2f(u.pt, px, py); gl.uniform1f(u.rad, rr);
      gl.uniform3f(u.color, vx * vel.w / W, -vy * vel.h / H, 0); blit(vel.b); vel.swap();
      u = use('splat', [dye.tx, dye.ty]); tex(u.uT, dye.a.t);
      gl.uniform1f(u.ratio, ratio); gl.uniform2f(u.pt, px, py); gl.uniform1f(u.rad, rr);
      gl.uniform3f(u.color, col[0], col[1], col[2]); blit(dye.b); dye.swap();
    }
    function sim(dt) {
      gl.disable(gl.BLEND);
      const vt = [vel.tx, vel.ty];
      let u = use('curl', vt); tex(u.uV, vel.a.t); blit(curlF);
      u = use('vort', vt); tex(u.uV, vel.a.t); tex(u.uC, curlF.t); gl.uniform1f(u.curl, C.curl); gl.uniform1f(u.dt, dt); blit(vel.b); vel.swap();
      u = use('div', vt); tex(u.uV, vel.a.t); blit(divF);
      u = use('clear', vt); tex(u.uT, pres.a.t); gl.uniform1f(u.val, C.pressure); blit(pres.b); pres.swap();
      for (let i = 0; i < C.iters; i++) { u = use('pres', vt); tex(u.uD, divF.t); tex(u.uP, pres.a.t); blit(pres.b); pres.swap(); }
      u = use('grad', vt); tex(u.uP, pres.a.t); tex(u.uV, vel.a.t); blit(vel.b); vel.swap();
      u = use('adv', vt); gl.uniform2f(u.vtexel, vel.tx, vel.ty); tex(u.uV, vel.a.t); tex(u.uS, vel.a.t); gl.uniform1f(u.dt, dt); gl.uniform1f(u.diss, C.vDiss); blit(vel.b); vel.swap();
      u = use('adv', [dye.tx, dye.ty]); gl.uniform2f(u.vtexel, vel.tx, vel.ty); tex(u.uV, vel.a.t); tex(u.uS, dye.a.t); gl.uniform1f(u.dt, dt); gl.uniform1f(u.diss, C.dDiss); blit(dye.b); dye.swap();
      u = use('show', [dye.tx, dye.ty]); tex(u.uT, dye.a.t); blit(null);
    }
    function pointer(x, y, dx, dy) { if (queue.length < 24) queue.push([x, y, dx, dy]); }
    function step(dt, nz, ground, idle, burst, trail) {
      if (!ok) return;
      if (!vel) build(); if (!vel) return;
      dt = Math.min(dt, 1 / 30);
      let n = 0;
      // vapor tranquilo a ras de la plataforma + ignición que barre el suelo
      acc += (idle * 5 + burst * 70) * dt;
      while (acc > 1 && n < 10) {
        acc--; n++;
        const side = Math.random() < .5 ? -1 : 1, b = burst > .03;
        splat(nz.x + side * (8 + Math.random() * 26), ground - 6 - Math.random() * 10,
          side * (b ? 380 + Math.random() * 700 : 30 + Math.random() * 70), -(b ? 60 + Math.random() * 160 : 18 + Math.random() * 40),
          warm(b ? .3 + Math.random() * .22 : .07 + Math.random() * .06, b ? .35 : 0), b ? .45 : .26);
      }
      // estela de la llama mientras sube
      accT += trail * 36 * dt;
      while (accT > 1 && n < 16) {
        accT--; n++;
        splat(nz.x + (Math.random() - .5) * 10, nz.y + 6, (Math.random() - .5) * 140, 520 + Math.random() * 420, warm(.32 + Math.random() * .2, .55), .24);
      }
      // cursor
      while (queue.length) {
        const [x, y, dx, dy] = queue.shift(), sp = Math.hypot(dx, dy);
        splat(x, y, dx * 8, dy * 8, warm(clamp(.04 + sp * .005, .04, .2)), .22);
      }
      idleT += dt;
      sim(dt);
    }
    return { build, step, pointer };
  }

  /* ---------------------------------------------------------
     Partículas de la apertura: el "1.000" se fractura
     --------------------------------------------------------- */
  function Particles(cv, face, stage) {
    const ctx = cv.getContext('2d');
    let W = 0, H = 0, pts = [];
    function build() {
      const dpr = Math.min(2, devicePixelRatio || 1);
      W = stage.clientWidth; H = stage.clientHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (RM) return;
      // El texto se dibuja exactamente donde el navegador pinta la cara del 1.000
      // (misma caja, misma línea base): la desintegración nace sin desfase.
      const tb = textBox(face), at = offsetIn(face, stage);
      const off = document.createElement('canvas'); off.width = W; off.height = H;
      const o = off.getContext('2d', { willReadFrequently: true });
      o.font = tb.font;
      if ('letterSpacing' in o) o.letterSpacing = tb.ls;
      o.textAlign = 'left'; o.textBaseline = 'alphabetic'; o.fillStyle = '#fff';
      o.fillText(tb.text, at.x + tb.x, at.y + tb.y);
      const data = o.getImageData(0, 0, W, H).data;
      const step = W < 700 ? 3 : 4;
      let found = [], minx = W, maxx = 0;
      for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
        if (data[(y * W + x) * 4 + 3] > 128) { found.push([x, y]); if (x < minx) minx = x; if (x > maxx) maxx = x; }
      }
      const cap = W < 700 ? 3500 : 7000;
      if (found.length > cap) found = found.filter(() => Math.random() < cap / found.length);
      pts = found.map(([x, y]) => ({
        x, y,
        a: Math.random() * Math.PI * 2,
        sp: .25 + Math.random() * .9,
        dl: ((x - minx) / Math.max(1, maxx - minx)) * .55 + Math.random() * .12,
        s: Math.random() < .14 ? 2.2 : 1.3,
        ph: Math.random() * 6.28,
        ff: Math.random() < .014, fq: .3 + Math.random() * .5, fx: 0, fy: 0
      }));
    }
    /* Luciérnaga: halo cálido pre-dibujado */
    const glowS = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,244,214,1)'); gr.addColorStop(.18, 'rgba(255,196,110,.85)');
      gr.addColorStop(.45, 'rgba(255,132,5,.28)'); gr.addColorStop(1, 'rgba(255,132,5,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c;
    })();
    function draw(d, sat, amb) {
      ctx.clearRect(0, 0, W, H);
      if (RM || d <= .001 || !pts.length) return;
      const r = Math.round(lerp(140, 255, sat)), g = Math.round(lerp(140, 140, sat)), b = Math.round(lerp(140, 20, sat));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      const R = Math.max(W, H) * .5, inA = d < .05 ? d / .05 : 1;
      for (const p of pts) {
        const t = eio(clamp((d - p.dl * .55) / .45));
        const dist = t * R * p.sp * .85;
        const x = p.x + Math.cos(p.a) * dist + Math.sin(time * .5 + p.ph) * 12 * t;
        const y = p.y + Math.sin(p.a) * dist * .7 - t * 50 + Math.cos(time * .4 + p.ph) * 12 * t;
        ctx.globalAlpha = inA * lerp(1, .26, t) * (1 - amb * .6);
        ctx.fillRect(x, y, p.s, p.s);
        if (p.ff) { p.fx = x; p.fy = y; }
      }
      // Algunas partículas que flotan brillan de vez en cuando, como luciérnagas
      const fly = seg(d, .55, 1);
      if (fly > 0) {
        ctx.globalCompositeOperation = 'lighter';
        for (const p of pts) {
          if (!p.ff) continue;
          const b = Math.pow(Math.max(0, Math.sin(time * p.fq + p.ph * 3)), 10);
          if (b < .02) continue;
          const r = 7 + 9 * b;
          ctx.globalAlpha = b * .55 * fly * (1 - amb * .35);
          ctx.drawImage(glowS, p.fx - r, p.fy - r, r * 2, r * 2);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
    }
    return { build, draw };
  }

  /* Chispas de la forja */
  function Sparks(cv, stage) {
    const ctx = cv.getContext('2d'); let W = 0, H = 0, list = [], acc = 0;
    function build() {
      const dpr = Math.min(2, devicePixelRatio || 1);
      W = stage.clientWidth; H = stage.clientHeight;
      cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function step(dt, rate, x0, x1, y) {
      if (RM) return;
      acc += rate * dt;
      while (acc > 1) {
        acc--;
        list.push({ x: lerp(x0, x1, Math.random()), y, vx: (Math.random() - .5) * 340, vy: -120 - Math.random() * 380, life: 0, max: .5 + Math.random() * .9, s: 1 + Math.random() * 2 });
      }
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      list = list.filter(p => (p.life += dt) < p.max);
      for (const p of list) {
        p.vy += 620 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        const k = 1 - p.life / p.max;
        ctx.strokeStyle = `rgba(255,${Math.round(150 + 90 * k)},${Math.round(60 * k)},${k})`;
        ctx.lineWidth = p.s; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * .025, p.y - p.vy * .025); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    return { build, step };
  }


  /* ---------------------------------------------------------
     Tarjeta DropiPay: ondas de puntos digitales sobre la superficie.
     Puntos diminutos que respiran; al girar la tarjeta se revelan.
     --------------------------------------------------------- */
  /* Color de las ondas de puntos: se lee de la variable CSS --dots-color
     (ver bloque "AJUSTES WAVE DOTS" al final de styles.css). */
  const dotsColor = () => (getComputedStyle(document.documentElement).getPropertyValue('--dots-color') || '').trim() || '#ff9a2e';
  function CardDots(cv, o = {}) {
    const ctx = cv.getContext('2d'), GAP = o.gap || 6, GAIN = o.gain || 1, FLOOR = o.floor != null ? o.floor : .16, SZ = o.size || 1;
    let W = 0, H = 0, dpr = 1, pts = [], reveal = 0, lastRy = null, maskC = null;
    let pulses = [], inside = false, lpx = 0, lpy = 0;
    function build() {
      if (o.fit) o.fit(cv);
      dpr = Math.min(2, devicePixelRatio || 1);
      W = cv.clientWidth; H = cv.clientHeight;
      if (!W || !H) return;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      pts = [];
      for (let y = GAP / 2; y < H; y += GAP) for (let x = GAP / 2; x < W; x += GAP) pts.push({ x, y, ph: Math.random() * 6.28 });
      maskC = o.mask ? o.mask(W, H, dpr) : null;
    }
    /* Pulso: al pasar el cursor encima nace una onda que recorre los puntos */
    function sense(dt) {
      pulses = pulses.filter(q => (q.t += dt) < q.life);
      if (!hasMouse || RM) { inside = false; return; }
      const r = cv.getBoundingClientRect(); if (!r.width || !r.height) return;
      const x = (px - r.left) / r.width * W, y = (py - r.top) / r.height * H;
      const isIn = x >= 0 && y >= 0 && x <= W && y <= H;
      if (isIn && (!inside || Math.hypot(px - lpx, py - lpy) > 54)) {
        pulses.push({ x, y, t: 0, life: 1.6 }); lpx = px; lpy = py;
        if (pulses.length > 5) pulses.shift();
      }
      inside = isIn;
    }
    function draw(dt, ry, active) {
      if (!W) build();
      if (!W) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (!active || RM || !pts.length) { lastRy = null; pulses = []; return; }
      sense(dt);
      const w = lastRy == null ? 0 : Math.abs(ry - lastRy) / Math.max(dt, .001);
      lastRy = ry;
      const target = clamp(FLOOR + w / 60 + Math.abs(ry - 16) / 70);
      reveal += (target - reveal) * Math.min(1, dt * 3.5);
      const breath = .62 + .38 * Math.sin(time * 1.5);
      const band = .5 - (ry - 16) / 46;                 // el brillo viaja con el ángulo
      const ox = W * -.1, oy = H * 1.15;
      const SPD = Math.max(W, H) * .62, PW = Math.max(14, GAP * 3.2);
      const live = pulses.map(q => ({ x: q.x, y: q.y, r: q.t * SPD, k: Math.pow(1 - q.t / q.life, 1.4) }));
      ctx.fillStyle = o.color || dotsColor();
      for (const p of pts) {
        const d = Math.hypot(p.x - ox, p.y - oy);
        const v = .5 + .5 * Math.sin(d * .055 - time * 2.3) * Math.cos(p.x * .012 + time * .7);
        const crest = v * v * v * v;
        const bx = p.x / W - band, lit = Math.exp(-(bx * bx) / .06);
        let a = GAIN * reveal * breath * (crest * .95 + .06) * (.3 + .7 * lit) * (.75 + .25 * Math.sin(time * 3 + p.ph));
        let pk = 0;
        for (const q of live) {
          const e = (Math.hypot(p.x - q.x, p.y - q.y) - q.r) / PW;
          if (e > -3 && e < 3) pk += Math.exp(-e * e) * q.k;
        }
        a += pk * 1.15;
        if (a < .025) continue;
        ctx.globalAlpha = Math.min(1, a);
        const z = (crest > .7 || pk > .35 ? 1.6 + pk * .8 : 1.05) * SZ;
        ctx.fillRect(p.x - z / 2, p.y - z / 2, z, z);
      }
      ctx.globalAlpha = 1;
      if (maskC) {
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(maskC, 0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    return { build, draw };
  }

  /* Posición de la línea base de un texto dentro de su propia caja (para
     dibujarlo en canvas exactamente donde lo pinta el navegador). */
  function textBox(face) {
    const cs = getComputedStyle(face), fs = parseFloat(cs.fontSize);
    const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const c = document.createElement('canvas').getContext('2d');
    c.font = font; if ('letterSpacing' in c) c.letterSpacing = cs.letterSpacing;
    const text = face.textContent.trim(), m = c.measureText(text);
    const A = m.fontBoundingBoxAscent != null ? m.fontBoundingBoxAscent : m.actualBoundingBoxAscent;
    const D = m.fontBoundingBoxDescent != null ? m.fontBoundingBoxDescent : m.actualBoundingBoxDescent;
    let lh = parseFloat(cs.lineHeight); if (!lh || isNaN(lh)) lh = fs * 1.2;
    return { font, ls: cs.letterSpacing, text, x: parseFloat(cs.paddingLeft) || 0, y: (parseFloat(cs.paddingTop) || 0) + (lh - (A + D)) / 2 + A, w: face.offsetWidth, h: face.offsetHeight };
  }
  const offsetIn = (el, anc) => { let x = 0, y = 0, n = el; while (n && n !== anc) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; } return { x, y }; };

  /* Ondas de puntos sobre las cifras 3D (1.000): mismas que la tarjeta y el
     cinturón, recortadas a la forma de los números. */
  function NumDots(num) {
    const face = $('.num3d-face', num), cv = document.createElement('canvas');
    cv.className = 'num-dots'; cv.setAttribute('aria-hidden', 'true'); num.appendChild(cv);
    let tb = null;
    return CardDots(cv, {
      gap: 6, gain: 2.1, floor: .46, size: 1.3,
      fit(c) { tb = textBox(face); c.style.width = tb.w + 'px'; c.style.height = tb.h + 'px'; },
      mask(W, H, dpr) {
        const m = document.createElement('canvas'); m.width = Math.round(W * dpr); m.height = Math.round(H * dpr);
        const x = m.getContext('2d'); x.scale(dpr, dpr); x.font = tb.font; if ('letterSpacing' in x) x.letterSpacing = tb.ls;
        x.textBaseline = 'alphabetic'; x.fillStyle = '#000'; x.fillText(tb.text, tb.x, tb.y);
        return m;
      }
    });
  }

  /* ---------------------------------------------------------
     Patrón ASCII animado (Un solo acceso): anillos de caracteres que
     nacen del centro y giran; el cursor los enciende al pasar.
     --------------------------------------------------------- */
  function Ascii(cv, o = {}) {
    const ctx = cv.getContext('2d'), CH = ' .·:-=+*x%#@';
    const COLS = o.colors || ['#ff8405', '#ffe2c2'], AMUL = o.alpha != null ? o.alpha : .8;
    let W = 0, H = 0, dpr = 1, CS = 14, cols = 0, rows = 0, atlas = null;
    function build() {
      dpr = Math.min(2, devicePixelRatio || 1);
      W = cv.clientWidth; H = cv.clientHeight; if (!W || !H) return;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      CS = o.cell ? (W < 520 ? Math.round(o.cell * .75) : o.cell) : (W < 520 ? 10 : 13); cols = Math.ceil(W / CS); rows = Math.ceil(H / CS);
      const c = document.createElement('canvas'), u = Math.round(CS * dpr);
      c.width = u * CH.length; c.height = u * 2;
      const g = c.getContext('2d');
      g.font = `600 ${Math.round(u * .92)}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      COLS.forEach((col, row) => { g.fillStyle = col; [...CH].forEach((ch, i) => g.fillText(ch, i * u + u / 2, row * u + u / 2 + u * .04)); });
      atlas = { c, u };
    }
    function draw(k) {
      if (!W) build();
      if (!W || !atlas) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (k <= .01) return;
      const cx = W / 2, cy = H / 2, R = o.cover ? Math.hypot(W, H) / 2 : Math.min(W, H) / 2, u = atlas.u, n = CH.length;
      let mxl = -1e4, myl = -1e4;
      if (hasMouse) { const r = cv.getBoundingClientRect(); mxl = (px - r.left) / r.width * W; myl = (py - r.top) / r.height * H; }
      const T = RM ? 0 : time;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const x = (i + .5) * CS, y = (j + .5) * CS, dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) / R;
        if (d > 1.04) continue;
        const a = Math.atan2(dy, dx);
        const wave = .5 + .5 * Math.sin(d * 17 - T * 2.2 + Math.sin(a * 3 + T * .45) * .9);
        const swirl = .5 + .5 * Math.sin(a * 6 - T * .8 + d * 6);
        let v = wave * .72 + swirl * .28;
        v *= smooth(clamp((1.04 - d) / .32)) * (.18 + .82 * smooth(clamp((d - .2) / .22)));
        const md = Math.hypot(x - mxl, y - myl);
        if (md < 130) v += Math.pow(1 - md / 130, 2) * .9;
        v *= k;
        if (v < .14) continue;
        const idx = Math.min(n - 1, 1 + Math.floor(v * (n - 1)));
        ctx.globalAlpha = Math.min(1, v * AMUL);
        ctx.drawImage(atlas.c, idx * u, v > .8 ? u : 0, u, u, Math.round(i * CS * dpr), Math.round(j * CS * dpr), u, u);
      }
      ctx.globalAlpha = 1;
    }
    return { build, draw };
  }

  /* ---------------------------------------------------------
     Fondo antigravedad de la cortina de capítulo: partículas en
     anillos concéntricos que giran; el cursor las dispersa y un
     resorte las devuelve a su anillo.
     --------------------------------------------------------- */
  function Antigravity(cv) {
    const ctx = cv.getContext('2d');
    let W = 0, H = 0, dpr = 1, P = [];
    function build() {
      dpr = Math.min(2, devicePixelRatio || 1);
      W = cv.clientWidth; H = cv.clientHeight; if (!W || !H) return;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      const base = Math.min(W * .62, H), N = W < 760 ? 150 : 300, RINGS = [.26, .4, .56, .74];
      const cx = W / 2, cy = H / 2;
      P = [];
      for (let i = 0; i < N; i++) {
        const ring = i % RINGS.length, a = Math.random() * Math.PI * 2, r = base * RINGS[ring] * (1 + (Math.random() - .5) * .07);
        P.push({
          ring, a, r, x: cx + Math.cos(a) * r * .86, y: cy + Math.sin(a) * r * .86, vx: 0, vy: 0,
          sp: (ring % 2 ? -1 : 1) * (.05 + ring * .018), len: 5 + Math.random() * 8, w: 1.4 + Math.random() * 1.4,
          hot: Math.random() < .35, ph: Math.random() * 6.28
        });
      }
    }
    function step(dt) {
      if (!W) build();
      if (!W) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2, RR = Math.max(120, Math.min(W, H) * .2);
      ctx.lineCap = 'round';
      for (const p of P) {
        p.a += p.sp * dt;
        const br = 1 + Math.sin(time * .7 + p.ring * 1.3) * .03;
        const hx = cx + Math.cos(p.a) * p.r * br, hy = cy + Math.sin(p.a) * p.r * br;
        p.vx += (hx - p.x) * 14 * dt; p.vy += (hy - p.y) * 14 * dt;
        if (hasMouse && !RM) {
          const dx = p.x - px, dy = p.y - py, dd = Math.hypot(dx, dy) || 1;
          if (dd < RR) { const f = Math.pow(1 - dd / RR, 2) * 3200 * dt; p.vx += dx / dd * f; p.vy += dy / dd * f; }
        }
        const damp = Math.exp(-4.2 * dt); p.vx *= damp; p.vy *= damp;
        p.x += p.vx * dt; p.y += p.vy * dt;
        const sp = Math.hypot(p.vx, p.vy), tg = p.a + Math.PI / 2, mix = clamp((sp - 90) / 220), ang = mix > 0 ? Math.atan2(lerp(Math.sin(tg), p.vy / (sp || 1), mix), lerp(Math.cos(tg), p.vx / (sp || 1), mix)) : tg;
        const L = p.len * (1 + Math.min(2, sp / 260)), c = Math.cos(ang) * L / 2, s2 = Math.sin(ang) * L / 2;
        const tw = .45 + .55 * (.5 + .5 * Math.sin(time * 1.4 + p.ph));
        ctx.strokeStyle = p.hot ? `rgba(255,132,5,${(.75 * tw).toFixed(3)})` : `rgba(255,220,181,${(.42 * tw).toFixed(3)})`;
        ctx.lineWidth = p.w;
        ctx.beginPath(); ctx.moveTo(p.x - c, p.y - s2); ctx.lineTo(p.x + c, p.y + s2); ctx.stroke();
      }
    }
    return { build, step };
  }

  /* ---------------------------------------------------------
     Castillo en 3D (capas en profundidad) con escudo geodésico
     invisible: solo se ilumina donde lo golpea un impacto.
     --------------------------------------------------------- */
  function Castle(box) {
    const NS = 'http://www.w3.org/2000/svg';
    const inner = $('.castle-in', box), svg = $('.shield', box);
    const layers = $$('.castle-l', box).map(l => ({ el: l, z: l.classList.contains('castle-l--b2') ? -1 : l.classList.contains('castle-l--b1') ? -.5 : 0 }));
    const spotsG = $('.shield-spots', svg), flashR = $('.shield-flash', svg), hits = $('.hits', svg);
    const CX = 1267, CY = 1656, RX = 1250, RY = 1235;           // casquete del domo (unidades del SVG)
    const mk = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
    const shots = [], rings = [], spots = [];
    for (let i = 0; i < 4; i++) {
      const g = mk('g', { opacity: 0 }), ln = mk('line', { 'stroke-width': 11 }), hd = mk('circle', { r: 15, class: 'proj-head' });
      g.append(ln, hd); hits.appendChild(g); shots.push({ g, ln, hd, on: false });
      const r = mk('circle', { class: 'ripple', opacity: 0 }); hits.appendChild(r); rings.push({ el: r, on: false });
      const sp = mk('circle', { fill: 'url(#spotGrad)', r: 0, opacity: 0 }); spotsG.appendChild(sp); spots.push({ el: sp, on: false });
    }
    let flash = 0, nextShot = .4;
    function fire() {
      const s = shots.find(x => !x.on); if (!s) return;
      const th = Math.PI * (.14 + Math.random() * .72);
      const hx = CX + RX * Math.cos(th), hy = CY - RY * Math.sin(th);
      let nx = RY * Math.cos(th), ny = -RX * Math.sin(th); const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
      const j = (Math.random() - .5) * .5, c = Math.cos(j), sn = Math.sin(j);
      const dx = nx * c - ny * sn, dy = nx * sn + ny * c;
      Object.assign(s, { on: true, t: 0, dur: .45 + Math.random() * .25, hx, hy, sx: hx + dx * 1500, sy: hy + dy * 1500 });
    }
    function impact(x, y) {
      const r = rings.find(q => !q.on) || rings[0]; Object.assign(r, { on: true, t: 0, x, y });
      const sp = spots.find(q => !q.on) || spots[0]; Object.assign(sp, { on: true, t: 0, x, y });
      flash = 1;
    }
    function update(a, sh, active, dt) {
      // Entrada: las capas se separan en profundidad
      const k = eo(clamp(a));
      const ry = RM ? -14 : Math.sin(time * .45) * 20 + mx * 14 - 8, rx = RM ? 8 : 10 - my * 7 + Math.sin(time * .32) * 3;
      inner.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${lerp(.86, 1, k).toFixed(4)})`;
      layers.forEach(({ el, z }) => {
        el.style.transform = `translateZ(${(z * 46 * k).toFixed(2)}px)`;
        el.style.opacity = z === 0 ? k.toFixed(3) : (k * (z < -.7 ? .25 : .5)).toFixed(3);
      });
      svg.style.transform = `translateZ(${(18 * k).toFixed(2)}px)`;
      // Escudo: invisible salvo en el punto de impacto
      flash = Math.max(0, flash - dt * 2.2);
      flashR.setAttribute('opacity', (flash * .28).toFixed(3));
      if (active && sh >= .99 && !RM) {
        nextShot -= dt;
        if (nextShot <= 0) { fire(); nextShot = .5 + Math.random() * .9; }
      }
      shots.forEach(s => {
        if (!s.on) return;
        s.t += dt / s.dur;
        if (s.t >= 1 || !active) {
          s.on = false; s.g.setAttribute('opacity', 0);
          if (active) impact(s.hx, s.hy);
          return;
        }
        const e = eIn(s.t), x = lerp(s.sx, s.hx, e), y = lerp(s.sy, s.hy, e);
        const ux = (s.hx - s.sx) / 1500, uy = (s.hy - s.sy) / 1500;
        s.ln.setAttribute('x1', x.toFixed(1)); s.ln.setAttribute('y1', y.toFixed(1));
        s.ln.setAttribute('x2', (x - ux * 260).toFixed(1)); s.ln.setAttribute('y2', (y - uy * 260).toFixed(1));
        s.hd.setAttribute('cx', x.toFixed(1)); s.hd.setAttribute('cy', y.toFixed(1));
        s.g.setAttribute('opacity', Math.min(1, s.t * 5).toFixed(2));
      });
      rings.forEach(r => {
        if (!r.on) return;
        r.t += dt / .6;
        if (r.t >= 1) { r.on = false; r.el.setAttribute('opacity', 0); return; }
        const e = eo(r.t);
        r.el.setAttribute('cx', r.x.toFixed(1)); r.el.setAttribute('cy', r.y.toFixed(1));
        r.el.setAttribute('r', (20 + e * 190).toFixed(1));
        r.el.setAttribute('stroke-width', (13 - e * 10).toFixed(2));
        r.el.setAttribute('opacity', (1 - e).toFixed(2));
      });
      spots.forEach(q => {
        if (!q.on) return;
        q.t += dt / 1.1;
        if (q.t >= 1) { q.on = false; q.el.setAttribute('opacity', 0); return; }
        const e = eo(q.t);
        q.el.setAttribute('cx', q.x.toFixed(1)); q.el.setAttribute('cy', q.y.toFixed(1));
        q.el.setAttribute('r', (120 + e * 820).toFixed(1));
        q.el.setAttribute('opacity', (Math.pow(1 - q.t, 1.6)).toFixed(3));
      });
    }
    return { update };
  }

  /* ---------------------------------------------------------
     Contador tipo tablero de aeropuerto / cuenta regresiva NASA
     Cada dígito es una paleta que se voltea. Al entrar al panel
     los dígitos barajan números antes de fijarse; luego corre en vivo.
     --------------------------------------------------------- */
  function FlipBoard(root, target) {
    const groups = { d: 3, h: 2, m: 2, s: 2 };
    const cells = [];
    Object.keys(groups).forEach(u => {
      const box = $(`.flip-g[data-u="${u}"] .flip-cells`, root);
      for (let i = 0; i < groups[u]; i++) {
        const el = document.createElement('span');
        el.className = 'fc';
        el.innerHTML = '<span class="fc-t"><b>0</b></span><span class="fc-b"><b>0</b></span><span class="fc-lt"><b>0</b></span><span class="fc-lb"><b>0</b></span>';
        box.appendChild(el);
        const [t, b, lt, lb] = [...el.children].map(n => ({ n, b: n.firstChild }));
        cells.push({ el, t, b, lt, lb, cur: '0', anims: [], tok: 0, shuf: 0, next: 0 });
      }
    });
    function setNow(c, v) { c.anims.forEach(a => a.cancel()); c.anims = []; c.tok++; c.cur = v; [c.t, c.b, c.lt, c.lb].forEach(h => { h.b.textContent = v; }); c.el.classList.remove('is-flip'); }
    function flip(c, v, fast) {
      if (c.cur === v) return;
      if (RM) { setNow(c, v); return; }
      const old = c.cur; c.anims.forEach(a => a.cancel()); c.tok++; const tok = c.tok; c.cur = v;
      c.t.b.textContent = v; c.b.b.textContent = old; c.lt.b.textContent = old; c.lb.b.textContent = v;
      const D = fast ? 80 : 200;
      const a1 = c.lt.n.animate([{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(-90deg)' }], { duration: D, easing: 'cubic-bezier(.55,0,1,.45)', fill: 'forwards' });
      const a2 = c.lb.n.animate([{ transform: 'rotateX(90deg)' }, { transform: 'rotateX(0deg)' }], { duration: D * 1.1, delay: D, easing: 'cubic-bezier(.2,.9,.3,1.25)', fill: 'forwards' });
      c.anims = [a1, a2]; c.el.classList.add('is-flip');
      a2.finished.then(() => {
        if (tok !== c.tok) return;
        c.b.b.textContent = v; c.lt.b.textContent = v; a1.cancel(); a2.cancel(); c.anims = [];
        c.el.classList.remove('is-flip');
      }).catch(() => {});
    }
    const digits = () => {
      const ms = Math.max(0, target - Date.now()), S = Math.floor(ms / 1000);
      const d = Math.min(999, Math.floor(S / 86400)), h = Math.floor(S / 3600) % 24, m = Math.floor(S / 60) % 60, sc = S % 60;
      return (String(d).padStart(3, '0') + pad2(h) + pad2(m) + pad2(sc)).split('');
    };
    let armed = false;
    root.setAttribute('aria-label', `Cuenta regresiva: ${digits().slice(0, 3).join('').replace(/^0+/, '') || '0'} días para el despegue`);
    function update(vis) {
      const now = performance.now();
      if (vis < .15 || vis > 1.85) { if (armed) { armed = false; cells.forEach(c => setNow(c, '0')); } return; }
      if (!armed && vis > .5) {
        armed = true;
        cells.forEach((c, i) => { c.shuf = RM ? 0 : 7 + i * 2 + ((Math.random() * 4) | 0); c.next = now + i * 55; });
      }
      if (!armed) return;
      const want = digits();
      cells.forEach((c, i) => {
        if (c.shuf > 0) {
          if (now >= c.next) { c.shuf--; c.next = now + 95; flip(c, c.shuf ? String((Math.random() * 10) | 0) : want[i], true); }
          return;
        }
        flip(c, want[i], false);
      });
    }
    return { update };
  }

  /* ---------------------------------------------------------
     Controladores de escena
     update(p, e, dt): p = progreso fijado (0..1), e = entrada (0..1)
     --------------------------------------------------------- */
  /* Fotos de fondo con lente ojo de pez: se desplazan con el cursor (parallax)
     y se asientan al entrar, igual que la foto de Beneficios. */
  function lensParallax(ph, k) {
    if (!ph) return;
    const fx = RM ? 0 : mx, fy = RM ? 0 : my;
    ph.style.transform = `translate3d(${(fx * 10).toFixed(2)}px,${(fy * 6).toFixed(2)}px,0) scale(${lerp(1.12, 1.04, k).toFixed(4)})`;
  }

  const controllers = {

    open(el) {
      const stage = $('.stage', el), num = $('.num3d', el), wrap = $('.open-num', el), glow = $('.num-glow', el);
      const l1 = $('.open-line--1', el), l2 = $('.open-line--2', el), l3 = $('.open-line--3', el);
      const words = $$('.open-words li', el), wordsWrap = $('.open-words', el), head = $('.open-head', el), hint = $('.scroll-hint', el);
      const seq = $('.seq', el), beam = $('.beam', el);
      const P = Particles($('.particles', el), $('.num3d-face', num), stage);
      const ND = NumDots(num), ndCv = $('.num-dots', num);
      return {
        live: true, build() { P.build(); ND.build(); },
        // El tramo en que el 1.000 se desintegra (.2 → .5) se toma su tiempo
        beatDur(from, to) { return (Math.min(from, to) < .3 && Math.max(from, to) > .45) ? 5.4 : (Math.max(from, to) <= .2 ? 2.6 : 0); },
        update(p, e, dt) {
          const sat = 1 - seg(p, .08, .2);
          num.style.setProperty('--sat', sat.toFixed(3));
          const d = seg(p, .2, .5);
          // Antes de desintegrarse, el 1.000 queda de frente: las partículas nacen en su sitio exacto
          const flat = 1 - eio(seg(p, .1, .2));
          const rx = (RM ? 6 : 9 - my * 10 + Math.sin(time * .3) * 2) * flat, ry = (RM ? -14 : -16 + mx * 22 + Math.sin(time * .35) * 7) * flat;
          num.style.transform = `rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg)`;
          ndCv.style.opacity = sat.toFixed(3);
          ND.draw(dt, ry + 16 + Math.sin(time * .55) * 22, sat > .05 && d < .02);
          wrap.style.opacity = 1 - seg(d, 0, RM ? .4 : .14);
          glow.style.opacity = (1 - d) * (.35 + .65 * sat);
          beam.style.opacity = .9 * (1 - d * .6);
          P.draw(d, sat, seg(p, .5, .86));
          drawSeq(seq, seg(p, 0, .6));
          if (seq.classList.contains('is-ready')) seq.style.opacity = (lerp(.35, 1, seg(p, .12, .24)) * (1 - seg(p, .52, .62))).toFixed(3);

          op(l1, 1 - seg(p, .07, .12), `translateY(${-seg(p, .07, .12) * 20}px)`);
          op(l2, seg(p, .11, .16) * (1 - seg(p, .36, .44)), `translateY(${(1 - seg(p, .11, .16)) * 20}px)`);
          op(l3, seg(p, .45, .5));
          wordsWrap.style.opacity = 1 - seg(p, .84, .88);
          const active = Math.floor((p - .5) / .055);
          words.forEach((w, i) => {
            const a = .5 + i * .055, t = eo(seg(p, a, a + .06));
            w.firstElementChild.style.transform = `translateY(${(1 - t) * 160}%)`;
            w.classList.toggle('is-on', i === Math.min(active, words.length - 1) && p >= a);
          });
          op(head, seg(p, .87, .94), `translateY(${(1 - seg(p, .87, .94)) * 30}px)`);
          hint.style.opacity = 1 - seg(p, 0, .05);
        }
      };
    },

    orbit(el) {
      const orbit = $('.orbit', el), items = $$('.orbit-item', el), core = $('.orbit-core', el), ring = $('.orbit-ring--2', el);
      const AS = Ascii($('.ascii', el));
      const h = $('.h-xl', el), lead = $('.lead', el), roles = $('.roles', el), chips = $$('.chips li', el), handle = $('.handle', el);
      return {
        live: true, build: AS.build,
        update(p, e) {
          revealLines(h, seg(e, .35, 1));
          op(lead, seg(e, .6, 1));
          AS.draw(eo(seg(e, .25, 1)));
          const spread = eo(seg(e, .4, 1) * .4 + seg(p, 0, .3) * .6);
          const R = orbit.clientWidth / 2 * .86, rot = p * 160 + (RM ? 0 : time * 5);
          items.forEach((it, i) => {
            const a = ((i / items.length) * 360 + rot) * Math.PI / 180;
            it.style.transform = `translate(-50%,-50%) translate(${Math.cos(a) * R * spread}px,${Math.sin(a) * R * spread}px) scale(${.6 + .4 * spread})`;
            it.style.opacity = spread;
          });
          core.style.transform = `translate(-50%,-50%) scale(${.7 + .3 * eo(seg(e, .3, 1))})`;
          if (ring) ring.style.setProperty('--ang', `${rot * 1.4}deg`);
          op(roles, seg(p, .32, .4));
          chips.forEach((c, i) => {
            const t = seg(p, .36 + i * .05, .42 + i * .05);
            op(c, t, `translateY(${(1 - t) * 10}px)`);
            c.classList.toggle('is-on', t >= 1 && p < .36 + (i + 1) * .05 + .06);
          });
          op(handle, seg(p, .66, .74));
        }
      };
    },

    route(el) {
      /* Mapa 3D: plano inclinado con China y Colombia extruidas (capas en Z como
         el castillo) y la trayectoria en arco que se levanta del plano. */
      const plane3 = $('.route-plane', el), wall = $('.route-wall', el), arc = $('.route-arc', el);
      const path = $('.route-path', el), bgp = $('.route-bg', el), flow = $('.route-flow', el);
      const cn = $('.node--cn', el), co = $('.node--co', el), gshadow = $('.ground-shadow', el);
      const plane = $('.plane', el), body = $('.plane-body', el), top = $('.plane-top', el);
      const copy = $('.route-copy', el), countries = $$('.countries li', el), seq = $('.seq', el);
      const stage = $('.stage', el);
      const lbls = $$('.route-lbl', el).map(l => ({ el: l, node: l.dataset.node === 'cn' ? cn : co }));
      lbls.forEach(l => { l.dot = $('.node-dot', l.node); });
      // Capas de profundidad de cada mapa (detrás de la capa frontal)
      $$('.geo', el).forEach(g => {
        [2, 1].forEach(k => { const c = g.cloneNode(true); c.classList.add('geo--b', `geo--b${k}`); g.parentNode.insertBefore(c, g); });
        g.classList.add('geo--f');
      });
      // Copia desplazada del trazo: le da grosor al avión
      const depth = top.cloneNode(true); depth.setAttribute('class', 'plane-depth'); body.insertBefore(depth, top);
      const VB = { x: -120, y: -560, s: 1600 }, CN = { x: 1060, y: 150 }, CO = { x: 300, y: 330 };
      const gAng = Math.atan2(CO.y - CN.y, CO.x - CN.x) * 180 / Math.PI;
      let len = 0, Wl = 0, Hl = 0, k = 1;
      const angAt = l => { const a = path.getPointAtLength(clamp(l - 2, 0, len)), b = path.getPointAtLength(clamp(l + 2, 0, len)); return Math.atan2(b.y - a.y, b.x - a.x); };
      const build = () => {
        const S = plane3.clientWidth; if (!S) return;
        k = S / VB.s;
        const ax = (CN.x - VB.x) * k, ay = (CN.y - VB.y) * k, bx = (CO.x - VB.x) * k, by = (CO.y - VB.y) * k;
        Wl = Math.hypot(bx - ax, by - ay); Hl = Wl * .4;
        const ang = Math.atan2(by - ay, bx - ax);
        Object.assign(wall.style, { left: `${ax}px`, top: `${ay - Hl}px`, width: `${Wl}px`, height: `${Hl}px`, transform: `rotateZ(${ang}rad) rotateX(-90deg)` });
        arc.setAttribute('viewBox', `0 0 ${Wl.toFixed(1)} ${Hl.toFixed(1)}`);
        const d = `M0 ${Hl.toFixed(1)} Q ${(Wl / 2).toFixed(1)} ${(-Hl * .84).toFixed(1)} ${Wl.toFixed(1)} ${Hl.toFixed(1)}`;
        [path, bgp, flow].forEach(q => q.setAttribute('d', d));
        len = path.getTotalLength();
        flow.style.strokeDasharray = `${(len * .08).toFixed(1)} ${(len * 1.2).toFixed(1)}`;
      };
      return {
        live: !RM, build,
        update(p, e) {
          if (!len) build();
          if (!len) return;
          op(copy, seg(e, .4, 1), `translateY(${(1 - seg(e, .4, 1)) * 30}px)`);
          const t = eio(seg(p, .04, .5));
          // El arco se dibuja en el aire y queda lleno al llegar
          if (t >= .999) { path.style.strokeDasharray = 'none'; path.style.strokeDashoffset = '0'; }
          else { path.style.strokeDasharray = `${len} ${len + 40}`; path.style.strokeDashoffset = (len * (1 - t)).toFixed(2); }
          // Avión: sigue la tangente del arco (sube y baja en 3D)
          const l = len * t, pt = path.getPointAtLength(l), ang = angAt(l), alt = Math.sin(Math.PI * t);
          const sc = k * (1.05 + .35 * alt);
          plane.setAttribute('transform', `translate(${pt.x.toFixed(2)} ${pt.y.toFixed(2)}) rotate(${(ang * 180 / Math.PI).toFixed(2)}) scale(${sc.toFixed(3)} ${(sc * .82).toFixed(3)})`);
          depth.setAttribute('transform', `translate(${(-1.2 * alt).toFixed(2)} 2.6)`);
          const vis = seg(t, 0, .03) * (1 - seg(t, .965, 1));
          plane.style.opacity = vis.toFixed(3);
          // Sombra del avión sobre el mapa: misma posición, en el suelo
          const gx = lerp(CN.x, CO.x, t), gy = lerp(CN.y, CO.y, t);
          gshadow.setAttribute('transform', `translate(${gx.toFixed(1)} ${gy.toFixed(1)}) rotate(${gAng.toFixed(1)}) scale(${(1 - alt * .35).toFixed(3)})`);
          gshadow.style.opacity = (vis * (.6 - alt * .38)).toFixed(3);
          // Pulso de energía que recorre el arco ya completo
          const done = seg(t, .96, 1);
          flow.style.opacity = (done * .9).toFixed(3);
          if (done > 0) flow.style.strokeDashoffset = (-((time * len * .32) % (len * 1.28))).toFixed(1);
          cn.classList.toggle('is-on', e > .8);
          co.classList.toggle('is-on', t >= .99);
          // Los mapas se iluminan: China al despegar, Colombia al aterrizar
          const leave = t > 0 && t < .4 ? Math.sin(Math.PI * seg(t, 0, .4)) : 0;
          const breathe = RM ? 0 : (Math.sin(time * 1.6) + 1) * .05;
          plane3.style.setProperty('--hcn', clamp(seg(e, .5, 1) * .3 + leave * .7 + breathe).toFixed(3));
          plane3.style.setProperty('--hco', clamp(seg(e, .5, 1) * .16 + seg(t, .84, 1) * .84 + (t >= .99 ? breathe : 0)).toFixed(3));
          // Plano inclinado tipo navegación, oscilando suave con el cursor
          const tilt = lerp(30, 54, eo(seg(e, .1, 1)));
          const rz = RM ? -10 : -10 + Math.sin(time * .16) * 16 + mx * 8;
          plane3.style.transform = `translate(-50%,-50%) rotateX(${tilt.toFixed(2)}deg) rotateZ(${rz.toFixed(3)}deg)`;
          const sr = stage.getBoundingClientRect();
          lbls.forEach(lb => {
            const r = lb.dot.getBoundingClientRect();
            lb.el.style.transform = `translate3d(${(r.left + r.width / 2 - sr.left).toFixed(1)}px,${(r.top - sr.top).toFixed(1)}px,0) translate(-50%,-125%)`;
            lb.el.classList.toggle('is-on', lb.node.classList.contains('is-on'));
            lb.el.style.opacity = (lb.node === cn ? seg(e, .5, 1) : seg(t, .85, 1)).toFixed(3);
          });
          countries.forEach((c, i) => c.classList.toggle('is-on', i < 5 ? p > .52 + i * .065 : p > .88));
          drawSeq(seq, p);
        }
      };
    },

    rule(el) {
      const wall = $('.rule-wall', el), track = $('.rule-track', el), row = $('.rule-row', track), spans = $$('span', row);
      const kicker = $('.rule-kicker', el), a = $('.rule-a', el), b = $('.rule-b', el);
      const text = spans[0].textContent;
      let w = 0, run = 0, lines = [];
      return {
        live: true,
        build() {
          // Llena el fondo con la frase: una línea hacia la derecha, la siguiente hacia la izquierda
          lines.forEach(l => l.el.remove()); lines = [];
          w = spans[0].offsetWidth + (parseFloat(getComputedStyle(row).columnGap) || 0);
          const lh = track.offsetHeight || 1, n = Math.max(3, Math.ceil(wall.clientHeight / lh) + 2) | 1, mid = n >> 1;
          for (let i = 0; i < n; i++) {
            if (i === mid) continue;
            const ln = document.createElement('div');
            ln.className = 'rule-line'; ln.setAttribute('aria-hidden', 'true');
            ln.innerHTML = `<div class="rule-row"><span>${text}</span><span>${text}</span><span>${text}</span></div>`;
            if (i < mid) wall.insertBefore(ln, track); else wall.appendChild(ln);
            const off = i - mid;
            lines.push({ el: ln, row: ln.firstElementChild, dir: off % 2 ? 1 : -1, sp: .55 + Math.random() * .5, ph: Math.random() * w, far: Math.abs(off) });
          }
        },
        update(p, e, dt) {
          run += (RM ? 0 : 70) * dt;
          const enter = (1 - eo(e)) * innerWidth * .4;
          const x = -(((run + p * w * .6) % w) + w) % w + enter;
          row.style.transform = `translate3d(${x}px,0,0)`;
          lines.forEach(l => {
            const m = (run * l.sp + l.ph + p * w * .3) % w;
            const lx = l.dir < 0 ? -m : -w + m;
            l.row.style.transform = `translate3d(${(lx + enter * l.dir * -1).toFixed(1)}px,0,0)`;
          });
          op(kicker, seg(e, .5, 1));
          op(a, seg(p, .38, .55), `translateY(${(1 - seg(p, .38, .55)) * 16}px)`);
          op(b, seg(p, .62, .82), `translateY(${(1 - seg(p, .62, .82)) * 16}px)`);
        }
      };
    },

    webe(el) {
      const head = $('.webe-head', el), h = $('.h-xl', el), lead = $('.lead', head);
      const f15 = $('.fee-15', el), f0 = $('.fee-0', el), glow = $('.fee-glow', el), ca = $('.fee-cap--a', el), cb = $('.fee-cap--b', el);
      const photo = $('.photo--webe', el);
      return {
        live: !RM,
        update(p, e) {
          lensParallax(photo, eo(seg(e, .2, 1)));
          revealLines(h, seg(e, .35, 1));
          op(lead, seg(e, .6, 1));
          const out1 = seg(p, .18, .26);
          op(head, 1 - out1, `translateY(calc(-50% - ${out1 * 60}px))`);
          const a = eo(seg(p, .26, .36)), fall = eio(seg(p, .42, .6)), land = eo(seg(p, .56, .72));
          f15.textContent = `${Math.max(1, Math.round(15 - fall * 14))}%`;
          op(f15, a * (1 - fall), `translateY(${(1 - a) * -12 + fall * 70}vh)`);
          op(f0, land, `translateY(${(1 - land) * -70}vh) scale(${lerp(1.15, 1, land)})`);
          glow.style.opacity = land;
          op(ca, a * (1 - seg(p, .44, .5)));
          op(cb, seg(p, .7, .78), `translateY(${(1 - seg(p, .7, .78)) * 14}px)`);
        }
      };
    },

    webeui(el) {
      const ui = $('.ui', el), copy = $('.ui-copy', el), type = $('.type', el), caret = $('.caret', el);
      const think = $('.msg--think', el), ai = $('.msg--ai', el), lis = $$('.msg--ai li', el), btn = $('.ui-btn', el), seq = $('.seq', el);
      const text = type.dataset.text;
      return {
        live: !RM,
        update(p, e) {
          const t = eio(seg(e, .2, 1) * .45 + seg(p, 0, .32) * .55);
          const tx = RM ? 0 : mx * 3 * t, ty = RM ? 0 : -my * 2 * t;
          ui.style.transform = `rotateX(${(1 - t) * 40 + ty}deg) rotateY(${tx}deg) rotateZ(${(1 - t) * -7}deg) translateY(${(1 - t) * 12}vh) scale(${.84 + .16 * t})`;
          op(copy, seg(p, .26, .38), `translateY(${(1 - seg(p, .26, .38)) * 24}px)`);
          const typed = seg(p, .36, .58);
          type.textContent = text.slice(0, Math.round(text.length * typed));
          caret.style.opacity = typed > 0 && typed < 1 ? 1 : 0;
          op(think, seg(p, .59, .61) * (1 - seg(p, .66, .68)));
          op(ai, seg(p, .67, .72), `translateY(${(1 - seg(p, .67, .72)) * 10}px)`);
          lis.forEach((l, i) => op(l, seg(p, .72 + i * .03, .75 + i * .03)));
          op(btn, seg(p, .84, .88));
          drawSeq(seq, p);
        }
      };
    },

    ley(el) {
      const head = $('.ley-head', el), h = $('.h-xl', el), lead = $('.lead', head), dash = $('.ley-dash', el), access = $('.ley-access', el);
      const dropsVal = $('.drops-val', el), bgv = $('.bg-video', el), photo = $('.photo--ley', el);
      const axes = $$('.axis', el).map(a => ({
        el: a, val: $('.axis-val', a), tiers: $$('.tier', a),
        steps: a.dataset.steps.split(',').map(Number), usd: a.dataset.format === 'usd'
      }));
      // Ondas de puntos sobre cada medallón (recortadas a la forma de su imagen)
      const allTiers = $$('.tier', el);
      const badgeDots = $$('.badge', el).map(b => {
        const cv = document.createElement('canvas');
        cv.className = 'badge-dots'; cv.setAttribute('aria-hidden', 'true'); b.appendChild(cv);
        const setMask = () => {
          const m = $(':scope > img', b);
          if (m && m.src) { const u = `url("${m.src}")`; cv.style.webkitMaskImage = u; cv.style.maskImage = u; b.classList.add('has-dots'); }
        };
        setMask(); addEventListener('slots', setMask);
        return { cv, d: CardDots(cv, { gap: 3, gain: 2.2, floor: .55, size: 1 }), ph: Math.random() * 6 };
      });
      return {
        live: !RM,
        build() { badgeDots.forEach(B => B.d.build()); },
        update(p, e, dt) {
          revealLines(h, seg(e, .35, 1));
          op(lead, seg(e, .6, 1));
          lensParallax(photo, eo(seg(e, .2, 1)));
          if (photo) photo.style.setProperty('--po', lerp(.62, .24, seg(p, .12, .24)).toFixed(3));
          const o = seg(p, .12, .18);
          op(head, 1 - o, `translateY(calc(-50% - ${o * 50}px))`);
          op(dash, seg(p, .17, .24));
          if (bgv) bgv.style.setProperty('--vo', lerp(.62, .26, seg(p, .12, .24)).toFixed(3));
          axes.forEach((a, i) => {
            const f = seg(p, .24 + i * .04, .78 + i * .04);
            a.el.style.setProperty('--fill', f.toFixed(4));
            const v = piece(f, a.steps);
            a.val.textContent = a.usd ? usd(v) : fmt(v);
            if (i === 0) dropsVal.textContent = fmt(v);
            const n = a.tiers.length;
            a.tiers.forEach((t, k) => t.classList.toggle('is-on', f >= (k + 1) / n - .001));
          });
          op(access, seg(p, .88, .95), `translateX(-50%) translateY(${(1 - seg(p, .88, .95)) * 16}px)`);
          const allOn = allTiers.length && allTiers.every(t => t.classList.contains('is-on'));
          el.classList.toggle('all-on', !!allOn);
          badgeDots.forEach(B => B.d.draw(dt || .016, 16 + Math.sin(time * .6 + B.ph) * 26, allOn));
        }
      };
    },

    placa(el) {
      const stage = $('.stage', el), forja = $('.forja', el), inner = $('.forja-in', el), line = $('.forja-line', el);
      const paths = $$('.forja-line [pathLength]', el).map(p => ({ el: p, k: +p.style.getPropertyValue('--k') || 0 }));
      const beltDots = CardDots($('.belt-dots', el), { gap: 5, gain: 2, floor: .5, size: 1.3 }), sheen = $('.belt-sheen', el);
      const N = Math.max(1, paths.length), img = $('.forja-img', el), edge = $('.forja-edge', el), halo = $('.forja-halo', el);
      const title = $('.placa-title', el);
      const S = Sparks($('.sparks', el), stage);
      let lastA = -1;
      return {
        live: true, build() { S.build(); beltDots.build(); },
        update(p, e, dt) {
          // 1 · El trazo se arma al entrar
          const a = clamp(seg(e, .15, 1) * .35 + seg(p, 0, .3) * .65);
          if (Math.abs(a - lastA) > 1e-4) {
            paths.forEach(({ el: path, k }) => {
              const d = clamp(a * 1.7 - (k / N) * .7);
              path.style.strokeDashoffset = (1 - eo(d)).toFixed(4);
            });
            lastA = a;
          }
          // 2 · El revelador descubre la placa real
          const f = seg(p, .34, .74), fe = eio(f);
          img.style.clipPath = `inset(${((1 - fe) * 100).toFixed(2)}% 0 0 0)`;
          edge.style.setProperty('--edgeP', (1 - fe).toFixed(4));
          edge.style.opacity = f > 0 && f < 1 ? 1 : 0;
          const pulse = RM ? 0 : (Math.sin(time * 1.6) + 1) * .5;
          line.style.setProperty('--g', ((eo(a) * (.55 + .45 * pulse)) * (1 - fe * .7)).toFixed(3));
          line.style.opacity = (1 - fe * .55).toFixed(3);
          halo.style.opacity = (eo(a) * .6 + fe * .4).toFixed(3);
          // Leve inclinación cuando ya está revelada
          const cool = seg(p, .7, .85);
          const rx = RM ? 0 : -my * 7 * cool, ry = RM ? 0 : mx * 12 * cool + Math.sin(time * .5) * 4 * cool;
          inner.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) scale(${lerp(.9, 1, eo(a))})`;
          // Ondas de puntos sobre el cinturón (como la tarjeta DropiPay) y brillo que lo recorre
          const sweep = RM ? 16 : 16 + Math.sin(time * .55) * 26 + ry * 1.5;
          beltDots.draw(dt, sweep, fe > .25);
          if (sheen) sheen.style.setProperty('--sx', `${(130 - ((time * 22) % 200)).toFixed(1)}%`);
          const r = img.getBoundingClientRect(), sr = stage.getBoundingClientRect();
          const forging = f > 0 && f < 1 && Math.abs(p - this._p) > 1e-5;
          S.step(dt, forging ? 220 : 0, r.left - sr.left + r.width * .06, r.right - sr.left - r.width * .06, r.top - sr.top + r.height * (1 - fe));
          this._p = p;
          op(title, seg(p, .8, .95), `translateY(${(1 - eo(seg(p, .8, .95))) * 24}px)`);
          // Solo el cinturón en pantalla: centrado y más grande. Al salir el texto vuelve a su sitio.
          forja.style.setProperty('--kt', eio(seg(p, .78, .95)).toFixed(4));
        }
      };
    },

    bene(el) {
      const track = $('.bene-track', el), panels = $$('.panel', el), idx = $('.bene-index', el), idxB = $('b', idx);
      const n = panels.length;
      const card = $('.card', el), line = $('.dash-line path', el);
      const dots = CardDots($('.card-dots', el), { gain: 1.6, floor: .34, size: 1.2 }), castle = Castle($('.castle', el));
      const monIn = $('.mon-in', el), glare = $('.mon-glare', el);
      const flipB = FlipBoard($('.flip', el), new Date(CONFIG.starkDate).getTime());
      const dof = $('.dof', el), dofL = $$('.dof-l', el).map(l => ({ el: l, z: +l.dataset.z })), dofBars = $('.dof .dash-bars', el), dofVal = $('.dof-val', el);
      const adv = $$('.adventures li', el);
      const introVid = $('.panel--intro .bg-video video', el);
      const rocket = $('.rocket', el), rk = $('.rk', el), flame = $('.rk-flame', el), arm = $('.tower-arm', el), stark = $('.stark', el);
      let smokeCv = $('.smoke', el), SM = Fluid(smokeCv);
      if (!SM) { const n = smokeCv.cloneNode(); smokeCv.replaceWith(n); smokeCv = n; SM = Clouds(n); }
      // El cursor sobre el panel del cohete también deja humo
      const starkStage = $('.stark-stage', el); let lpx = null, lpy = null;
      if (SM.pointer && starkStage) starkStage.addEventListener('pointermove', ev => {
        const r = smokeCv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
        if (lpx != null) SM.pointer(x, y, x - lpx, y - lpy);
        lpx = x; lpy = y;
      }, { passive: true });
      if (starkStage) starkStage.addEventListener('pointerleave', () => { lpx = lpy = null; });
      // Cohete en 3D: copias del trazo en profundidad (como el castillo)
      const rocketIn = $('.rocket-in', el);
      const rkLayers = [[-1, 'b2'], [-.5, 'b1']].map(([z, c]) => {
        const g = rocket.cloneNode(true);
        g.classList.add('rocket--ghost', `rocket--${c}`);
        g.querySelectorAll('defs, .rk-flame').forEach(n => n.remove());
        rocketIn.insertBefore(g, rocket);
        return { el: g, z, rk: $('.rk', g) };
      });
      // Reconocimiento: un solo logo Leyendas en tres capas (fondo 3 · mitad 2 · frente 1)
      const rankIn = $('.rank-in', el), logoTpl = $('#ley-logo'), NS = 'http://www.w3.org/2000/svg';
      const rankLayers = [];
      [['3', -1], ['2', 0], ['1', 1]].forEach(([key, z], li) => {
        [2, 1, 0].forEach(g => {
          const svg = document.createElementNS(NS, 'svg');
          svg.setAttribute('viewBox', '0 0 1050.34 1048.79');
          svg.setAttribute('class', `rank-l rank-l--${key}` + (g ? ` rank-l--ghost rank-l--g${g}` : ''));
          const art = logoTpl.content.querySelector(`[data-l="${key}"]`).cloneNode(true);
          const shapes = [...art.querySelectorAll('path, polygon, polyline')];
          shapes.forEach(sh => sh.setAttribute('pathLength', '1'));
          svg.appendChild(art); rankIn.appendChild(svg);
          rankLayers.push({ el: svg, z, g, li, shapes });
        });
      });
      const miles = $('.miles-val', el);
      const lider = $('.panel--lider', el), lt = $$('.lt', el), ghost = $('.lider-ghost', el), liderPhoto = $('.photo--lider', el), liderInfo = $('.lider-info', el);
      const titles = panels.map(pn => $$('.panel-title .ch', pn));
      const lineLen = line.getTotalLength ? line.getTotalLength() : 400;
      line.style.strokeDasharray = lineLen;
      // Posición horizontal por progreso: el panel 4 se sostiene mientras despega el cohete
      const K = [[.02, 0], [.16, 1], [.30, 2], [.44, 3], [.58, 4], [.72, 4], [.84, 5], [.98, 6]];
      const hpAt = p => {
        if (p <= K[0][0]) return 0;
        for (let i = 1; i < K.length; i++) if (p <= K[i][0]) {
          const t = (p - K[i - 1][0]) / (K[i][0] - K[i - 1][0]);
          return lerp(K[i - 1][1], K[i][1], i === 6 ? smooth(t) : t);
        }
        return K[K.length - 1][1];
      };
      const nozzle = { x: 0, y: 0 };
      return {
        live: !RM,
        build() { SM.build(); dots.build(); },
        // El tramo del despegue (panel 4 → 5) dura más para que se vea completo
        beatDur(from, to) { return (Math.min(from, to) < .6 && Math.max(from, to) > .8) ? 3.6 : 0; },
        update(p, e, dt) {
          const hp = hpAt(p);
          if (introVid && introVid.src && !RM) {
            if (hp < 1.02 && introVid.paused) introVid.play().catch(() => {});
            else if (hp >= 1.02 && !introVid.paused) introVid.pause();
          }
          track.style.transform = `translate3d(${(-hp * 100).toFixed(4)}vw,0,0)`;
          const c = i => clamp(hp - i + 1, 0, 2);
          idxB.textContent = Math.max(1, Math.round(hp));
          op(idx, seg(hp, .5, .9));

          titles.forEach((chs, i) => {
            if (!i || !chs.length) return;
            const k = seg(c(i), .45, 1);
            chs.forEach((ch, j) => {
              const t = eo(clamp(k * 1.6 - (j / chs.length) * .6));
              ch.style.transform = `translateY(${((1 - t) * .4).toFixed(3)}em)`;
              ch.style.opacity = t.toFixed(3);
            });
          });

          // 1 Económicos: tarjeta DropiPay
          const c1 = c(1), cr = RM ? 0 : mx * 7, cy = RM ? 0 : -my * 5;
          const fl = RM ? 0 : Math.sin(time * .8) * 1.2;
          const ry = lerp(-34, 16, eo(c1 / 2)) + cr;
          card.style.transform = `rotateY(${ry}deg) rotateX(${lerp(16, -4, eo(c1 / 2)) + cy}deg) translateY(${fl}%)`;
          card.style.setProperty('--sx', `${lerp(130, -30, clamp(c1 - .3, 0, 1.4) / 1.4)}%`);
          dots.draw(dt, ry, c1 > .15 && c1 < 1.85);
          // 2 Legal: el castillo se dibuja, levanta el escudo y resiste impactos
          const c2 = c(2);
          castle.update(clamp(seg(c2, .3, .82)), seg(c2, .7, 1), c2 > .6 && c2 < 1.4, dt);
          // 3 Operativo: profundidad de campo
          const k3 = eo(seg(c(3), .5, 1));
          dofBars.style.setProperty('--g', k3.toFixed(3));
          line.style.strokeDashoffset = lineLen * (1 - eo(seg(c(3), .6, 1)));
          dofVal.textContent = fmt(k3 * 2840);
          const off3 = (1 - clamp(c(3), 0, 1)) - clamp(c(3) - 1, 0, 1);
          dofL.forEach(({ el: l, z }) => {
            const px = (RM ? 0 : mx) * z * 14 + off3 * z * 90, py = (RM ? 0 : my) * z * 8;
            l.style.transform = `translate3d(${px.toFixed(2)}px,${py.toFixed(2)}px,${z > 0 ? 80 : 0}px)`;
          });
          // Pantalla lineal girando en 3D
          const c3 = c(3);
          if (c3 > 0 && c3 < 2) {
            const spin = RM ? 0 : Math.sin(time * .42) * 24;
            const rY = spin + (RM ? 0 : mx * 9) - (1 - clamp(c3)) * 46 + clamp(c3 - 1) * 30;
            const rX = 5 + (RM ? 0 : -my * 6 + Math.sin(time * .31) * 3);
            monIn.style.transform = `rotateY(${rY.toFixed(2)}deg) rotateX(${rX.toFixed(2)}deg)`;
            glare.style.setProperty('--gx', `${(50 - rY * 2.2).toFixed(1)}%`);
          }
          dof.style.opacity = k3 * .4 + .6 * seg(c(3), .3, .8);
          // 4 Experiencias: Proyecto Stark
          const c4 = c(4);
          const ai = Math.floor(time / 1.5) % adv.length;
          adv.forEach((a, i) => a.classList.toggle('is-on', c4 > .6 && c4 < 1.4 && i === ai));
          const L = seg(p, .585, .76), ign = seg(L, 0, .2), lift = seg(L, .18, 1);
          const shake = RM ? 0 : Math.sin(time * 70) * 4 * ign * (1 - lift);
          const yUp = -eIn(lift) * 4200;
          const rkT = `translate(${shake.toFixed(2)} ${yUp.toFixed(1)})`;
          rk.setAttribute('transform', rkT);
          if (c4 > 0 && c4 < 2) {
            const ry4 = RM ? -16 : Math.sin(time * .4) * 20 + mx * 14 - 10, rx4 = RM ? 4 : 5 - my * 6;
            rocketIn.style.transform = `rotateX(${rx4.toFixed(2)}deg) rotateY(${ry4.toFixed(2)}deg)`;
            rkLayers.forEach(L => {
              L.rk.setAttribute('transform', rkT);
              L.el.style.transform = `translateZ(${(L.z * 40).toFixed(1)}px)`;
            });
          }
          const flick = RM ? 0 : (Math.random() - .5) * .12;
          flame.style.setProperty('--fl', (lerp(.14 + flick * .3, 1 + flick, ign)).toFixed(3));
          flame.style.setProperty('--fo', (lerp(.55, 1, ign)).toFixed(3));
          if (arm) arm.style.opacity = (1 - ign * .85).toFixed(3);
          stark.style.transform = `translateY(${(-lift * 6).toFixed(2)}vh)`;
          flipB.update(c4);
          if (c4 > .2 && c4 < 1.9) {
            // viewBox del cohete: 620 -40 1300 1740 · tobera en (1267, 1390) · plataforma en y 1400
            const r = rocket.getBoundingClientRect(), cr2 = smokeCv.getBoundingClientRect(), sc = r.height / 1740;
            nozzle.x = r.left - cr2.left + (1267 - 620) * sc; nozzle.y = r.top - cr2.top + (1390 + 40 + yUp) * sc;
            const ground = r.top - cr2.top + (1400 + 40) * sc;
            SM.step(dt, nozzle, ground, 1, ign * (1 - seg(lift, .5, 1)), lift > 0 && lift < .9 ? 1 : 0);
          }
          // 5 Reconocimiento: logo Leyendas en capas 3D (se dibuja y se separa en profundidad)
          const c5 = c(5), k = eo(seg(c5, .45, 1));
          if (c5 > 0 && c5 < 2) {
            const fx = RM ? 0 : mx, fy = RM ? 0 : my, drift = RM ? 0 : Math.sin(time * .45);
            rankIn.style.transform = `rotateX(${(8 - fy * 10).toFixed(2)}deg) rotateY(${(fx * 20 + drift * 14 + (1 - k) * -30).toFixed(2)}deg)`;
            rankLayers.forEach(L => {
              const dk = eo(clamp(k * 1.7 - L.li * .3));
              if (L.dk !== dk) { L.shapes.forEach(sh => { sh.style.strokeDashoffset = (1 - dk).toFixed(4); }); L.dk = dk; }
              const bob = RM ? 0 : Math.sin(time * 1.1 + L.li * 1.4) * 4;
              L.el.style.transform = `translate3d(0,${bob.toFixed(2)}px,${(L.z * 74 * k - L.g * 9).toFixed(1)}px)`;
            });
          }
          // 6 Formación: titular con profundidad de campo
          const c6 = c(6), k6 = eo(seg(c6, .45, 1));
          const fx = RM ? 0 : mx, fy = RM ? 0 : my;
          const blur1 = lerp(14, 0, eo(seg(c6, .55, .95))), blur3 = lerp(18, 0, eo(seg(c6, .65, 1)));
          lt[0].style.filter = `blur(${blur1.toFixed(2)}px)`;
          lt[0].style.transform = `translate3d(${(-fx * 16).toFixed(2)}px,${(-fy * 8).toFixed(2)}px,0)`;
          lt[1].style.filter = `blur(${lerp(10, 2.4, k6).toFixed(2)}px)`;
          lt[1].style.transform = `translate3d(${(-fx * 6).toFixed(2)}px,${(-fy * 3).toFixed(2)}px,0)`;
          lt[2].style.filter = `blur(${blur3.toFixed(2)}px)`;
          lt[2].style.transform = `translate3d(${(-fx * 12).toFixed(2)}px,${(-fy * 6).toFixed(2)}px,0)`;
          lt.forEach(t => { t.style.opacity = k6.toFixed(3); });
          ghost.style.transform = `translate3d(${(fx * 22).toFixed(2)}px,${(fy * 10).toFixed(2)}px,0)`;
          ghost.style.opacity = k6.toFixed(3);
          liderPhoto.style.transform = `translate3d(${(fx * 10).toFixed(2)}px,${(fy * 6).toFixed(2)}px,0) scale(${lerp(1.12, 1.04, k6).toFixed(4)})`;
          op(liderInfo, eo(seg(c6, .7, 1)), `translateY(${((1 - eo(seg(c6, .7, 1))) * 20).toFixed(2)}px)`);
          miles.textContent = fmt(eo(seg(c6, .7, 1)) * 125000);
        }
      };
    },

    compare(el) {
      const t = $('.compare', el), h = $('.h-lg', el), m = $('.migra', el);
      return {
        update(p, e) {
          t.classList.toggle('is-in', e > .45);
          op(h, seg(e, .2, .8), `translateY(${(1 - eo(seg(e, .2, .8))) * 30}px)`);
          op(m, seg(e, .6, 1));
        }
      };
    },

    rules(el) {
      const list = $('.rules', el);
      return { update(p, e) { list.classList.toggle('is-in', e > .35); } };
    },

    close(el) {
      let ring = $$('.close-ring > .ri', el); const num = $('.num3d', el), hero = $('.close-hero', el), title = $('.close-title', el);
      const fin = $('.close-final', el), flash = $('.flash', el), black = $('.blackout', el), cta = $('.close-cta', el), seq = $('.seq', el);
      const foot = $('.close-foot', el);
      const ND = NumDots(num);
      const asciiBg = $('.ascii-bg', el);
      const AB = asciiBg ? Ascii(asciiBg, { cover: true, cell: 15, alpha: .55, colors: ['#3d3d3d', '#5e5e5e'] }) : null;
      const words = fin.textContent.trim().split(/\s+/);
      fin.setAttribute('aria-label', fin.textContent.trim());
      fin.innerHTML = words.map(w => `<span class="w" aria-hidden="true">${w}</span>`).join(' ');
      const ws = $$('.w', fin);
      ws.forEach((w, i) => { if (i >= words.indexOf('Leyendas')) w.classList.add('is-hot'); });
      let widths = [], heights = [];
      return {
        live: !RM,
        build() { ring = $$('.close-ring > .ri', el); widths = ring.map(s => s.offsetWidth || 80); ND.build(); if (AB) AB.build(); },
        update(p, e, dt) {
          const asm = eo(seg(e, .3, 1) * .4 + seg(p, 0, .2) * .6);
          const R = CONFIG.ringRadius || { x: .3, y: .3 }, big = Math.max(80, ...widths) * 1.1;
          const k = lerp(.2, 1, asm);
          const Rx = Math.min(innerWidth * (innerWidth < 761 ? .36 : R.x), innerWidth / 2 - big / 2 - 24) * k;
          const Ry = Math.min(innerHeight * R.y, innerHeight / 2 - big / 2 - 80) * k;
          // Las insignias que pasan detrás del titular blanco se desenfocan y pierden color, de forma gradual
          const tv = seg(p, .22, .3) * (1 - seg(p, .44, .5)) * seg(e, .3, 1);
          const tr = tv > .001 ? title.getBoundingClientRect() : null, hr = ringEl.getBoundingClientRect();
          const FEATHER = Math.max(90, innerHeight * .14);
          ring.forEach((s, i) => {
            const a = (i / ring.length) * Math.PI * 2 + (RM ? 0 : time * .12) + p * 1.2;
            const ox = Math.cos(a) * Rx, oy = Math.sin(a) * Ry;
            s.style.transform = `translate(${ox}px,${oy}px) translate(-50%,-50%) scale(${.6 + .4 * asm})`;
            let b = 0;
            if (tr) {
              const cx = hr.left + ox, cy = hr.top + oy, half = (widths[i] || 80) * .3;
              const dx = Math.max(tr.left - cx, 0, cx - tr.right), dy = Math.max(tr.top - cy, 0, cy - tr.bottom);
              b = (1 - smooth(clamp((Math.hypot(dx, dy) - half) / FEATHER))) * tv;
            }
            s.style.filter = b > .002
              ? `drop-shadow(0 0 16px rgba(255,132,5,${(.45 * (1 - b)).toFixed(3)})) blur(${(b * 6).toFixed(2)}px) grayscale(${(b * .9).toFixed(3)})`
              : '';
            s.style.opacity = (asm * (1 - b * .3)).toFixed(3);
          });
          const nry = RM ? -12 : -14 + mx * 20 + Math.sin(time * .35) * 6;
          num.style.transform = `rotateX(${RM ? 6 : 8 - my * 9}deg) rotateY(${nry}deg) scale(${lerp(.82, 1, asm)})`;
          if (AB) AB.draw(seg(e, .2, 1) * (1 - seg(p, .74, .8)));
          ND.draw(dt, nry + 30 + Math.sin(time * .55) * 22, asm > .2 && p < .52);
          op(hero, seg(e, .3, 1) * (1 - seg(p, .46, .52)));
          op(title, seg(p, .22, .3) * (1 - seg(p, .44, .5)), `translateY(${(1 - seg(p, .22, .3)) * 20}px)`);
          ws.forEach((w, i) => w.classList.toggle('is-on', p >= .5 + i * (.22 / ws.length)));
          fin.style.opacity = 1 - seg(p, .8, .84);
          flash.style.opacity = RM ? 0 : seg(p, .76, .79) * (1 - seg(p, .79, .86));
          black.style.opacity = seg(p, .8, .86);
          const c = seg(p, .86, .93);
          op(cta, c, `translateY(${(1 - c) * 24}px)`);
          cta.classList.toggle('is-live', c > .5);
          op(foot, seg(p, .9, 1));
          drawSeq(seq, p);
        }
      };
    }
  };

  /* ---------------------------------------------------------
     Objetos que se pueden lanzar: cinturones y placas
     Se arrastran con el cursor o el dedo y vuelven a su sitio
     con un resorte.
     --------------------------------------------------------- */
  function Throwable(el) {
    const t = { el, x: 0, y: 0, vx: 0, vy: 0, drag: false, lx: 0, ly: 0, rest: true };
    el.setAttribute('data-drag', '');
    el.addEventListener('pointerdown', e => {
      t.drag = true; t.rest = false; t.lx = e.clientX; t.ly = e.clientY; t.vx = t.vy = 0;
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      el.classList.add('is-grab'); root.classList.add('is-grabbing');
      e.preventDefault();
    });
    el.addEventListener('pointermove', e => {
      if (!t.drag) return;
      const dx = e.clientX - t.lx, dy = e.clientY - t.ly;
      t.lx = e.clientX; t.ly = e.clientY; t.x += dx; t.y += dy; t.vx = dx; t.vy = dy;
    });
    const up = () => { if (!t.drag) return; t.drag = false; el.classList.remove('is-grab'); root.classList.remove('is-grabbing'); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    return t;
  }
  function stepThrow(t, dt) {
    if (t.rest) return;
    if (!t.drag) {
      const f = Math.min(3, dt * 60);
      t.vx = (t.vx - t.x * .05 * f) * Math.pow(.86, f);
      t.vy = (t.vy - t.y * .05 * f) * Math.pow(.86, f);
      t.x += t.vx * f; t.y += t.vy * f;
      if (Math.abs(t.x) + Math.abs(t.y) + Math.abs(t.vx) + Math.abs(t.vy) < .08) { t.x = t.y = t.vx = t.vy = 0; t.rest = true; }
    }
    t.el.style.translate = `${t.x.toFixed(1)}px ${t.y.toFixed(1)}px`;
    t.el.style.rotate = `${clamp(t.vx * 1.4, -40, 40).toFixed(1)}deg`;
  }

  /* ---------------------------------------------------------
     Escenas
     --------------------------------------------------------- */
  const scenes = $$('.scene').map((el, i) => {
    const ctl = controllers[el.dataset.scene] ? controllers[el.dataset.scene](el) : null;
    const beats = (el.dataset.beats || '0').split(',').map(Number);
    return {
      el, i, ctl, beats, p: beats[0], e: 1, tw: [], last: -1, vis: false,
      curtain: el.dataset.curtain || '',
      kin: $$('[data-kin] .ch', el).map(c => ({ el: c, x: 0, y: 0, r: 0 })),
      thr: $$('.close-ring > .ri, .rank-in > .ki', el).map(Throwable)
    };
  });
  const N = scenes.length;
  const sceneOf = node => scenes.findIndex(s => s.el === node || s.el.contains(node));

  /* Capítulos (riel) */
  const railLinks = $$('.rail a');
  const chapters = railLinks.map(a => ({ a, name: a.textContent.trim(), idx: sceneOf($(a.getAttribute('href'))) }));
  const chapterAt = i => { let c = 0; chapters.forEach((ch, k) => { if (i >= ch.idx) c = k; }); return c; };

  /* Tweens por escena (p = progreso, e = entrada) */
  function tween(s, prop, to, dur, ease = eio) {
    s.tw = s.tw.filter(t => t.prop !== prop);
    if (RM || dur <= 0) { s[prop] = to; return Promise.resolve(); }
    return new Promise(res => s.tw.push({ prop, from: s[prop], to, t0: performance.now(), dur: dur * 1000, ease, res }));
  }
  function runTweens(s, now) {
    if (!s.tw.length) return;
    s.tw = s.tw.filter(t => {
      const k = clamp((now - t.t0) / t.dur);
      s[t.prop] = lerp(t.from, t.to, t.ease(k));
      if (k >= 1) { t.res(); return false; }
      return true;
    });
  }
  const beatDur = dp => clamp(1.45 + Math.abs(dp) * 3.4, 1.7, 3.4);

  /* ---------- Cortina de capítulo ---------- */
  const Curtain = (() => {
    const el = $('.curtain'), word = $('.curtain-word', el), num = $('.curtain-n', el);
    const AG = Antigravity($('.curtain-ag', el));
    let chars = [];
    function set(text, n) {
      word.textContent = text;
      word.style.fontSize = '';
      chars = [];
      word.textContent = '';
      [...text].forEach(chr => {
        const c = document.createElement('span');
        c.className = 'cc'; c.textContent = chr === ' ' ? '\u00a0' : chr;
        word.appendChild(c); chars.push(c);
      });
      num.textContent = `( ${n} )`;
      el.classList.add('is-on');
      AG.build();
      const fit = word.clientWidth * .98 / word.scrollWidth;
      if (fit < 1) word.style.fontSize = `${parseFloat(getComputedStyle(word).fontSize) * fit}px`;
    }
    async function cover(text, n) {
      set(text, n);
      const a = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 950, easing: SOFT, fill: 'forwards' });
      chars.forEach((c, i) => c.animate(
        [{ transform: 'translateY(35%)', opacity: 0, filter: 'blur(10px)' }, { transform: 'none', opacity: 1, filter: 'blur(0)' }],
        { duration: 1100, delay: 200 + i * 30, easing: SOFT, fill: 'both' }));
      num.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: 200, easing: SOFT, fill: 'both' });
      await a.finished;
      await wait(200 + chars.length * 30 + 600);
    }
    async function reveal() {
      chars.forEach((c, i) => c.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(-18%)', opacity: 0 }], { duration: 900, delay: i * 16, easing: SOFT, fill: 'forwards' }));
      const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1300, delay: 300, easing: SOFT, fill: 'forwards' });
      await a.finished;
      el.classList.remove('is-on');
      el.getAnimations({ subtree: true }).forEach(x => x.cancel());
    }
    return { cover, reveal, step: dt => { if (el.classList.contains('is-on')) AG.step(dt); } };
  })();

  /* ---------- HUD: número de escena, capítulo y pasos ---------- */
  const hudN = $('.hud-n'), hudCh = $('.hud-ch'), hudBeats = $('.hud-beats'), bar = $('.progress i');
  const beatOffset = []; let totalBeats = 0;
  scenes.forEach(s => { beatOffset.push(totalBeats); totalBeats += s.beats.length; });
  let hudShown = -1, curCh = -1;
  const pagerUp = $$('[data-step="-1"]'), pagerDown = $$('[data-step="1"]');
  $$('[data-step]').forEach(b => b.addEventListener('click', () => step(+b.dataset.step)));
  function hud() {
    const s = scenes[cur];
    if (hudShown !== cur) {
      const dir = cur > hudShown ? 1 : -1, old = hudN.lastElementChild, nu = document.createElement('i');
      nu.textContent = pad2(cur + 1);
      hudN.appendChild(nu);
      if (old && !RM && hudShown >= 0) {
        nu.animate([{ transform: `translateY(${dir * 100}%)` }, { transform: 'none' }], { duration: 700, easing: EASE });
        old.animate([{ transform: 'none' }, { transform: `translateY(${-dir * 100}%)` }], { duration: 700, easing: EASE }).finished.then(() => old.remove());
      } else if (old) old.remove();
      hudBeats.innerHTML = s.beats.length > 1 ? s.beats.map(() => '<i></i>').join('') : '';
      hudShown = cur;
    }
    $$('i', hudBeats).forEach((t, k) => t.classList.toggle('is-on', k <= beat));
    const ch = chapterAt(cur);
    if (ch !== curCh) {
      curCh = ch; hudCh.textContent = chapters[ch] ? chapters[ch].name : '';
      railLinks.forEach((a, i) => a.setAttribute('aria-current', i === ch ? 'true' : 'false'));
    }
    bar.style.transform = `scaleX(${(beatOffset[cur] + beat) / Math.max(1, totalBeats - 1)})`;
    pagerUp.forEach(b => { b.disabled = cur === 0 && beat === 0; });
    pagerDown.forEach(b => { b.disabled = cur === N - 1 && beat === scenes[N - 1].beats.length - 1; });
  }

  /* ---------- Navegación ---------- */
  let cur = 0, beat = 0, busy = false, queued = 0;

  function show(s) {
    s.vis = true; s.last = -1; s.el.classList.add('is-vis'); s.el.removeAttribute('inert');
    if (!RM) s.el.querySelectorAll('.bg-video video').forEach(v => { if (v.src) v.play().catch(() => {}); });
  }
  function hide(s) {
    s.vis = false; s.el.classList.remove('is-vis'); s.el.setAttribute('inert', '');
    s.el.querySelectorAll('.bg-video video').forEach(v => v.pause());
  }

  function done() {
    busy = false;
    if (queued) { const q = queued; queued = 0; step(q); }
  }
  function hurry() {
    const now = performance.now();
    scenes[cur].tw.forEach(t => {
      const el = now - t.t0;
      if (t.dur - el > 380) {
        t.from = lerp(t.from, t.to, t.ease(clamp(el / t.dur)));
        t.t0 = now; t.dur = 380; t.ease = eo;
      }
    });
  }

  function step(dir) {
    if (busy) { queued = dir; return; }
    const s = scenes[cur];
    if (dir > 0) {
      if (beat < s.beats.length - 1) return toBeat(beat + 1);
      if (cur < N - 1) return toScene(cur + 1, 1);
    } else {
      if (beat > 0) return toBeat(beat - 1);
      if (cur > 0) return toScene(cur - 1, -1);
    }
  }

  function toBeat(b) {
    const s = scenes[cur], to = s.beats[b];
    beat = b; busy = true; hud();
    const custom = s.ctl && s.ctl.beatDur ? s.ctl.beatDur(s.p, to) : 0;
    tween(s, 'p', to, custom || beatDur(to - s.p), custom ? (t => .5 - Math.cos(Math.PI * t) / 2) : eio).then(done);
  }

  function slide(from, to, dir) {
    from.el.style.zIndex = 1; to.el.style.zIndex = 2;
    const D = RM ? 320 : CONFIG.sectionMs;
    const anims = RM
      ? [to.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: D })]
      : [
          to.el.animate([
            { opacity: 0, transform: `translateY(${dir * 3}vh) scale(1.008)` },
            { opacity: 1, transform: 'none' }
          ], { duration: D * .9, delay: D * .1, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'backwards' }),
          from.el.animate([
            { opacity: 1, transform: 'none' },
            { opacity: 0, transform: `translateY(${-dir * 2.4}vh) scale(.992)` }
          ], { duration: D * .85, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' })
        ];
    return Promise.all(anims.map(a => a.finished)).then(() => {
      anims.forEach(a => a.cancel());
      from.el.style.zIndex = ''; to.el.style.zIndex = '';
    });
  }

  async function toScene(j, dir, opt = {}) {
    if (j < 0 || j >= N) return;
    const from = scenes[cur], to = scenes[j];
    if (j === cur) { if (opt.beat != null && opt.beat !== beat) toBeat(opt.beat); return; }
    busy = true; queued = 0;
    const b = opt.beat != null ? opt.beat : dir > 0 ? 0 : to.beats.length - 1;
    const fresh = opt.fresh || dir > 0;
    to.tw = [];
    if (fresh) { to.p = 0; to.e = 0; } else { to.p = to.beats[b]; to.e = 1; }
    cur = j; beat = b; hud();
    if (to.el.id) history.replaceState(null, '', `#${to.el.id}`);
    const enter = () => fresh
      ? Promise.all([tween(to, 'e', 1, 2.4, eo), tween(to, 'p', to.beats[b], beatDur(to.beats[b]))])
      : Promise.resolve();

    const useCurtain = !RM && to.curtain && (opt.curtain || dir > 0);
    if (useCurtain) {
      await Curtain.cover(to.curtain, chapterAt(j));
      show(to); hide(from);
      await Promise.all([Curtain.reveal(), enter()]);
    } else {
      show(to);
      const entering = enter();
      await slide(from, to, dir);
      hide(from);
      await entering;
    }
    done();
  }

  function goTo(j, opt = {}) {
    if (busy || j < 0) return;
    if (j === cur) { toBeat(opt.beat != null ? opt.beat : 0); return; }
    toScene(j, j > cur ? 1 : -1, { fresh: true, curtain: true, ...opt });
  }

  /* Enlaces internos (#capítulo) */
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    if (!id) return;
    const target = id === 'top' ? scenes[0].el : document.getElementById(id);
    const j = target ? sceneOf(target) : -1;
    if (j < 0) return;
    e.preventDefault();
    const last = id === 'cierre' && a.classList.contains('topbar-cta') ? { beat: scenes[j].beats.length - 1 } : {};
    goTo(j, last);
  });

  /* ¿Hay un contenedor con scroll propio que todavía puede moverse en esa dirección? */
  function scrollable(node, dir) {
    for (let n = node; n && n !== document.body; n = n.parentElement) {
      if (n.hasAttribute && n.hasAttribute('data-scroll') && n.scrollHeight > n.clientHeight + 2) {
        if (dir > 0 ? n.scrollTop + n.clientHeight < n.scrollHeight - 2 : n.scrollTop > 2) return n;
      }
    }
    return null;
  }

  /* Rueda / trackpad: un gesto = un paso */
  let wAcc = 0, wLast = 0, wFresh = true;
  addEventListener('wheel', e => {
    if (e.ctrlKey) return;
    const now = performance.now();
    if (now - wLast > CONFIG.wheelGap) { wFresh = true; wAcc = 0; }
    wLast = now;
    const k = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? innerHeight : 1;
    const horiz = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    if (horiz && scenes[cur].el.dataset.scene !== 'bene') return;
    const d = (horiz ? e.deltaX : e.deltaY) * k;
    if (Math.abs(e.deltaY) >= Math.abs(e.deltaX) && scrollable(e.target, Math.sign(d))) return;
    e.preventDefault();
    if (!wFresh) return;
    wAcc += d;
    if (Math.abs(wAcc) > 24) { wFresh = false; wAcc = 0; step(Math.sign(d)); }
  }, { passive: false });

  /* Táctil: swipe vertical u horizontal */
  let t0 = null;
  addEventListener('touchstart', e => {
    if (e.touches.length > 1 || e.target.closest('[data-drag]')) { t0 = null; return; }
    const t = e.touches[0];
    t0 = { x: t.clientX, y: t.clientY, down: scrollable(e.target, 1), up: scrollable(e.target, -1) };
  }, { passive: true });
  addEventListener('touchmove', e => {
    if (!t0) return;
    const dy = t0.y - e.touches[0].clientY;
    if (!(dy > 0 ? t0.down : t0.up) && e.cancelable) e.preventDefault();
  }, { passive: false });
  addEventListener('touchend', e => {
    if (!t0) return;
    const t = e.changedTouches[0], dy = t0.y - t.clientY, dx = t0.x - t.clientX, st = t0;
    t0 = null;
    const vertical = Math.abs(dy) >= Math.abs(dx), d = vertical ? dy : dx;
    if (Math.abs(d) < 42) return;
    if (vertical && (dy > 0 ? st.down : st.up)) return;
    step(Math.sign(d));
  }, { passive: true });

  /* Teclado */
  addEventListener('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    const k = e.key, onBtn = e.target.closest('button, a');
    let d = 0;
    if (k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !e.shiftKey && !onBtn)) d = 1;
    else if (k === 'ArrowUp' || k === 'PageUp' || (k === ' ' && e.shiftKey && !onBtn)) d = -1;
    else if (k === 'ArrowRight' && scenes[cur].el.dataset.scene === 'bene') d = 1;
    else if (k === 'ArrowLeft' && scenes[cur].el.dataset.scene === 'bene') d = -1;
    else if (k === 'Home') { e.preventDefault(); goTo(0); return; }
    else if (k === 'End') { e.preventDefault(); goTo(N - 1, { beat: scenes[N - 1].beats.length - 1 }); return; }
    if (!d) return;
    if ((k === 'ArrowDown' || k === 'ArrowUp') && scrollable(document.activeElement, d)) return;
    e.preventDefault();
    if (e.repeat && busy) return;
    step(d);
  });

  /* ---------- CTA ---------- */
  $$('[data-cta]').forEach(a => { a.href = CONFIG.ctaUrl; });

  /* ---------------------------------------------------------
     Tipografía viva: las letras se apartan del cursor
     --------------------------------------------------------- */
  function kinetic(s) {
    if (RM || !s.kin.length) return;
    if (!hasMouse && s.kinRest) return;
    const rects = s.kin.map(k => k.el.getBoundingClientRect());
    let moving = false;
    s.kin.forEach((k, i) => {
      const r = rects[i];
      let tx = 0, ty = 0, tr = 0;
      if (hasMouse && r.width && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth) {
        const cx = r.left + r.width / 2 - k.x, cy = r.top + r.height / 2 - k.y;
        const dx = cx - px, dy = cy - py, d = Math.hypot(dx, dy) || 1, R = Math.max(90, r.height * 1.7);
        if (d < R) {
          const f = Math.pow(1 - d / R, 2), amp = Math.min(14, r.height * .14);
          tx = dx / d * f * amp; ty = dy / d * f * amp; tr = dx / d * f * 6;
        }
      }
      k.x += (tx - k.x) * .1; k.y += (ty - k.y) * .1; k.r += (tr - k.r) * .1;
      if (Math.abs(k.x) + Math.abs(k.y) + Math.abs(k.r) < .02) { k.x = k.y = k.r = 0; }
      else moving = true;
      k.el.style.translate = k.x || k.y ? `${k.x.toFixed(2)}px ${k.y.toFixed(2)}px` : '';
      k.el.style.rotate = k.r ? `${k.r.toFixed(2)}deg` : '';
    });
    s.kinRest = !moving;
  }

  /* ---------------------------------------------------------
     Bucle principal
     --------------------------------------------------------- */
  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(.05, (now - lastT) / 1000); lastT = now; time += dt;
    mx += (tmx - mx) * .06; my += (tmy - my) * .06;
    for (const s of scenes) {
      if (!s.vis) continue;
      runTweens(s, now);
      s.thr.forEach(t => stepThrow(t, dt));
      if (!s.ctl) continue;
      const key = s.p + s.e * 7;
      if (!s.ctl.live && key === s.last) continue;
      s.last = key;
      s.ctl.update(s.p, s.e, dt);
    }
    kinetic(scenes[cur]);
    Curtain.step(dt);
    requestAnimationFrame(frame);
  }

  /* Titulares con dos Tusker: mismo tamaño en ambas líneas; si la línea
     ancha no cabe, el titular completo se reduce hasta caber. */
  function fitTitles() {
    $$('.h-xl.reveal, .placa-title').forEach(h => {
      h.style.fontSize = '';
      const avail = h.clientWidth; if (!avail) return;
      const fs = parseFloat(getComputedStyle(h).fontSize);
      const r = document.createRange();
      let w = 0;
      $$(':scope > span', h).forEach(line => {
        const inner = $(':scope > i', line) || line;
        r.selectNodeContents(inner);
        w = Math.max(w, r.getBoundingClientRect().width);
      });
      if (w > avail * .98) h.style.fontSize = `${(fs * avail * .97 / w).toFixed(2)}px`;
    });
  }
  function measure() { fitTitles(); scenes.forEach(s => { s.last = -1; if (s.ctl && s.ctl.build) s.ctl.build(); }); }
  let rz;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(measure, 150); });
  addEventListener('slots', measure);
  window.LP = { goTo, step, scenes: () => scenes, state: () => ({ cur, beat, busy }) };

  /* Arranque: respeta el #capítulo de la URL */
  const start = location.hash ? document.getElementById(location.hash.slice(1)) : null;
  cur = start ? Math.max(0, sceneOf(start)) : 0;
  scenes.forEach((s, i) => (i === cur ? show(s) : hide(s)));
  measure();
  hud();
  requestAnimationFrame(frame);
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    measure();
    document.body.classList.add('is-loaded');
  });
})();
