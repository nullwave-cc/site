// nullwave FM-1, drawn in 3D with lines only.
//
// A small dependency-free renderer: the FM-1 is built from convex solids (rounded boxes and
// cylinders). Each solid fills its visible faces with the page background and strokes only its
// silhouette and sharp creases, so hidden lines disappear and curved sides read as clean outlines.
//
// Usage: see DESIGN.md ("The FM-1 drawing"). In short:
//   <div class="fm1-3d" data-mode="hero|tour|still" data-view="three" data-on="REC,SHIFT"
//        data-screen="LOOP_MAIN" data-screens="PLAY_MAIN,LOOP_MAIN" data-steps='[...]'></div>
//   or from JS: const fm1 = FM1.mount(el, {view, on, screen}); fm1.set({...}); fm1.play(steps).
// Keys are only ever highlighted, never animated.
// Colours come from the CSS variables --fg, --bg and --red, so both themes work.
// prefers-reduced-motion: no draw-in, no drift, no presses; the camera and screens cut.
(function () {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const darkQ = matchMedia('(prefers-color-scheme: dark)');
  const TOP = 40; // height of the panel surface
  const FONT = 'ui-monospace,SFMono-Regular,Menlo,monospace';
  const DEG = Math.PI / 180;

  /* ---------- vectors ---------- */
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const avg = ps => { const s = [0, 0, 0]; ps.forEach(p => { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; }); return s.map(k => k / ps.length); };
  const W = (x, z) => [x - 500, z - 320]; // panel drawing coords -> world x/z, centred
  const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

  /* ---------- shapes ---------- */
  function dedupe(ps) {
    const out = [];
    ps.forEach(p => { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-3) out.push(p); });
    if (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 1e-3) out.pop();
    return out;
  }
  function rrect(x, y, w, h, r, seg = 6) {
    r = Math.min(r, w / 2, h / 2);
    const ps = [];
    [[x + w - r, y + r, -90], [x + w - r, y + h - r, 0], [x + r, y + h - r, 90], [x + r, y + r, 180]].forEach(([cx, cy, a0]) => {
      for (let i = 0; i <= seg; i++) { const a = (a0 + i / seg * 90) * DEG; ps.push(W(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); }
    });
    return dedupe(ps);
  }
  function circle(cx, cy, r, seg = 40) {
    return Array.from({ length: seg }, (_, i) => { const a = i / seg * 2 * Math.PI; return W(cx + Math.cos(a) * r, cy + Math.sin(a) * r); });
  }
  // a convex solid from a footprint polygon, between heights y0 and y1
  function prism(poly, y0, y1) {
    const n = poly.length, v = [];
    poly.forEach(([x, z]) => v.push([x, y1, z]));
    poly.forEach(([x, z]) => v.push([x, y0, z]));
    const faces = [[...Array(n).keys()], [...Array(n).keys()].map(i => 2 * n - 1 - i)];
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; faces.push([i, j, n + j, n + i]); }
    const c = avg(v);
    const F = faces.map(ix => {
      const ps = ix.map(i => v[i]);
      let nr = [0, 0, 0];
      ps.forEach((a, k) => {
        const b = ps[(k + 1) % ps.length];
        nr[0] += (a[1] - b[1]) * (a[2] + b[2]); nr[1] += (a[2] - b[2]) * (a[0] + b[0]); nr[2] += (a[0] - b[0]) * (a[1] + b[1]);
      });
      nr = norm(nr);
      const fc = avg(ps);
      if (dot(nr, sub(fc, c)) < 0) nr = nr.map(k => -k);
      return { ix, n: nr, c: fc };
    });
    const map = new Map(), E = [];
    F.forEach((f, fi) => f.ix.forEach((a, k) => {
      const b = f.ix[(k + 1) % f.ix.length], key = a < b ? a + '_' + b : b + '_' + a;
      let e = map.get(key);
      if (!e) { e = { a, b, f: [] }; map.set(key, e); E.push(e); }
      e.f.push(fi);
    }));
    E.forEach(e => { e.sharp = e.f.length < 2 || dot(F[e.f[0]].n, F[e.f[1]].n) < 0.9; });
    return { v, F, E, c };
  }

  /* ---------- the FM-1, in the same panel coordinates as the 2D drawing ---------- */
  const KNOBS = [
    [105, 100, 29, 'MASTER'], [215, 100, 29, 'SELECT'], [105, 205, 29, 'PRESETS'], [215, 205, 29, 'ALGORITHM'],
    [610, 100, 27, 'KNOB1'], [714, 100, 27, 'KNOB2'], [818, 100, 27, 'KNOB3'], [922, 100, 27, 'KNOB4'],
  ];
  const BUTTONS = [['FX', 'SEL', 'ENV', 'LFO', 'EDIT', 'GLO'], ['HOME', 'SAVE', 'ARP', 'SEQ', 'PLAY STOP', 'REC']];
  const BLACK = [82.5, 139, 195.5, 308.5, 365, 478, 534.5, 591, 704, 760.5, 873.5];
  const WHITE = Array.from({ length: 16 }, (_, i) => 54.2 + i * 56.5);

  // names people can use for parts; each expands to model part names
  const BUTTON_NAMES = BUTTONS.flat();
  const ALIASES = {
    KNOBS: KNOBS.map(k => k[3]), BUTTONS: BUTTON_NAMES, OCT: ['OCT-', 'OCT+'],
    SHIFT: ['OCT-', 'OCT+'], // holding OCT- or OCT+ is SHIFT
    'OCT−': ['OCT-'], DISPLAY: ['SCREEN'], PLAY: ['PLAY STOP'], STOP: ['PLAY STOP'], 'PLAY/STOP': ['PLAY STOP'],
  };
  const GROUPS = ['KEYS', 'KNOBS', ...KNOBS.map(k => k[3]), 'OCT-', 'OCT+', 'SHIFT', ...BUTTON_NAMES.filter(b => b !== 'PLAY STOP'), 'PLAY STOP', 'BUTTONS', 'SCREEN'];
  function expand(list) {
    const out = new Set();
    (Array.isArray(list) ? list : String(list || '').split(',')).map(x => x.trim().toUpperCase()).filter(Boolean)
      .forEach(n => (ALIASES[n] || [n]).forEach(m => out.add(m)));
    return out;
  }
  const VIEWS = { three: '-20,40,2050,500,330', front: '0,42,2050,500,330', top: '0,89,2050,500,330', left: '-38,36,2050,500,330', right: '34,36,2050,500,330', low: '-16,24,2050,500,330' };
  function parseView(v) {
    const [y, p, d, x, z] = (VIEWS[v] || v || VIEWS.three).split(',').map(Number);
    return { y, p, d: d || 2050, x: x == null || isNaN(x) ? 500 : x, z: z == null || isNaN(z) ? 330 : z };
  }

  function buildModel() {
    const body = { name: 'BODY', m: prism(rrect(4, 4, 992, 632, 44, 10), 0, TOP), at: [0, 0] };
    const flat = []; // outlines and labels printed on the panel
    const outline = (name, poly, alpha = .32) => flat.push({ name, poly, alpha });
    const label = (name, t, x, y, size = 15) => flat.push({ name, text: t, p: W(x, y), size });
    outline(null, rrect(58, 258, 210, 58, 14));
    outline(null, rrect(568, 160, 400, 140, 18));
    outline(null, rrect(36, 340, 928, 270, 20));
    outline('SCREEN', rrect(300, 44, 236, 236, 26), .7);

    const parts = [];
    const part = (name, poly, h, extra = {}) => parts.push(Object.assign({ name, m: prism(poly, TOP, TOP + h) }, extra));
    KNOBS.forEach(([x, y, r, name], i) => {
      part(name, circle(x, y, r - 3), 22, { knob: { x, y, r: r - 3, a: (i * 53 % 200 - 100) * DEG }, ring: circle(x, y, r - 10, 32), at: [x, y] });
      label(name, name, x, y - r - 11);
    });
    [[72, 'OCT-'], [170, 'OCT+']].forEach(([x, t]) => part(t, rrect(x, 268, 82, 38, 10), 8, { top: [t], at: [x + 41, 287] }));
    BUTTONS.forEach((row, ri) => row.forEach((t, ci) => {
      const x = 582 + ci * 63, y = 174 + ri * 62;
      part(t, rrect(x, y, 54, 48, 10), 8, { top: t.split(' '), at: [x + 27, y + 24] });
    }));
    WHITE.forEach(x => part('KEYS', rrect(x, 456, 44, 140, 22, 8), 10, { at: [x + 22, 526] }));
    BLACK.forEach(x => part('KEYS', rrect(x, 356, 44, 89, 22, 8), 10, { at: [x + 22, 400] }));
    // draw-in order: from the centre outwards
    parts.forEach(p => { p.delay = .25 + Math.hypot(p.at[0] - 500, (p.at[1] - 320) * 1.4) / 700 * .7; p.hl = 0; });
    return { body, flat, parts };
  }

  /* ---------- colours ---------- */
  const probe = document.createElement('canvas').getContext('2d');
  function rgb(c) {
    probe.fillStyle = '#000'; probe.fillStyle = c.trim();
    const s = probe.fillStyle;
    if (s[0] === '#') return [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
    return (s.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
  }
  const mix = (a, b, t, al = 1) => `rgba(${a.map((k, i) => Math.round(k + (b[i] - k) * t)).join(',')},${al})`;

  /* ---------- one drawing ---------- */
  function create(host, opts = {}) {
    if (host.fm1) return host.fm1;
    const ds = host.dataset;
    const mode = opts.mode || ds.mode || (ds.steps || opts.steps ? 'still' : 'hero');
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'A line drawing of the FM-1 keyboard running nullwave');
    host.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const model = buildModel();
    const st = {
      w: 0, h: 0, dpr: 1, t0: 0, drawn: reduce ? 1e9 : 0, visible: false, raf: 0, last: 0,
      cam: { y: -24, p: 36, d: 2050, x: 500, z: 330 }, goal: null, drag: [0, 0], dragging: false, ptr: [0, 0], scroll: 0,
      on: new Set(), col: null, cache: {}, list: [], scr: { cur: null, prev: null, mix: 1, next: 0, locked: false }, press: null,
    };
    st.goal = Object.assign({}, st.cam);

    function colours() {
      const cs = getComputedStyle(host);
      st.col = { fg: rgb(cs.getPropertyValue('--fg') || '#fff'), bg: rgb(cs.getPropertyValue('--bg') || '#000'), red: rgb(cs.getPropertyValue('--red') || '#E5202E') };
    }
    // screens are loaded by name, on demand, in the current theme
    function image(name) {
      if (!name) return null;
      if (!st.cache[name]) {
        const v = darkQ.matches ? 'dark' : 'light', im = new Image();
        im.onload = kick;
        im.src = name === '@splash' ? `/assets/splash-${v}.svg` : `/assets/screens/${name}-${v}.webp`;
        st.cache[name] = im;
      }
      return st.cache[name];
    }
    function showScreen(name, lock) {
      const sc = st.scr;
      if (lock) sc.locked = true;
      if (!name || name === sc.cur) return;
      sc.prev = sc.cur; sc.cur = name; sc.mix = reduce || !sc.prev ? 1 : 0;
      image(name); kick();
    }
    st.list = (opts.screens || ds.screens || '').split(',').map(x => x.trim()).filter(Boolean);
    const first = opts.screen || ds.screen || st.list[0] || 'PLAY_MAIN';
    colours();
    if (reduce || opts.screen || ds.screen) showScreen(first, !!(opts.screen || ds.screen));
    else showScreen('@splash');
    st.list.forEach(image);
    darkQ.addEventListener('change', () => { colours(); st.cache = {}; image(st.scr.cur); image(st.scr.prev); st.list.forEach(image); kick(); });

    function resize() {
      const r = host.getBoundingClientRect();
      st.dpr = Math.min(2, devicePixelRatio || 1);
      st.w = r.width; st.h = r.height;
      st.refFit = null; st.fit = null;
      canvas.width = Math.round(r.width * st.dpr); canvas.height = Math.round(r.height * st.dpr);
      kick();
    }
    new ResizeObserver(resize).observe(host);

    /* camera goals */
    // set what the drawing shows: highlights, screen, camera view and an optional button press
    function set(o = {}) {
      if (o.view != null) { Object.assign(st.goal, parseView(o.view)); if (reduce) Object.assign(st.cam, st.goal); }
      if (o.on != null) st.on = expand(o.on);
      if (o.screen) showScreen(o.screen, true);
      if (o.press) {
        const names = [...expand(o.press)].filter(n => n !== 'KEYS');
        st.press = reduce ? null : { names: new Set(names), t0: performance.now() };
      }
      kick();
    }
    Object.assign(st.goal, parseView(opts.view || ds.view));
    if (mode !== 'hero') Object.assign(st.cam, st.goal);
    st.on = expand(opts.on || ds.on);

    const tour = mode === 'tour' && host.closest('.tour');
    const views = tour ? [...tour.querySelectorAll('[data-feature]')] : null;
    function setFeature(f) {
      set({ view: f.dataset.view || 'three', on: f.dataset.on || '', screen: f.dataset.screen, press: f.dataset.press });
      views.forEach(n => n.classList.toggle('on', n === f));
    }
    if (views && views.length) {
      setFeature(views[0]);
      const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && setFeature(e.target)), { rootMargin: '-45% 0px -45% 0px' });
      views.forEach(f => io.observe(f));
    }

    /* how-to steps on a timer: [{on, screen, press, view}, ...] */
    let timer = 0, stepIx = -1;
    function play(steps, o = {}) {
      stop();
      if (!steps || !steps.length) return;
      const every = o.interval || +ds.interval || 2600, loop = o.loop != null ? o.loop : ds.loop !== 'false';
      const go = () => {
        stepIx = stepIx + 1 >= steps.length ? (loop ? 0 : steps.length - 1) : stepIx + 1;
        set(steps[stepIx]);
        host.dispatchEvent(new CustomEvent('fm1step', { detail: { index: stepIx, step: steps[stepIx] } }));
        if (reduce || (!loop && stepIx === steps.length - 1)) return;
        timer = setTimeout(go, every);
      };
      stepIx = -1; go();
    }
    function stop() { clearTimeout(timer); timer = 0; }
    let steps = opts.steps;
    if (!steps && ds.steps) { try { steps = JSON.parse(ds.steps); } catch (e) { console.warn('fm1-3d: data-steps is not valid JSON'); } }

    /* hero: drag to turn, tilt with scroll */
    if (mode === 'hero') {
      host.addEventListener('pointerdown', e => { st.dragging = true; st.ptr = [e.clientX, e.clientY]; host.setPointerCapture(e.pointerId); host.classList.add('grab'); });
      host.addEventListener('pointermove', e => {
        if (!st.dragging) return;
        st.drag[0] = Math.max(-70, Math.min(70, st.drag[0] + (e.clientX - st.ptr[0]) * .35));
        st.drag[1] = Math.max(-25, Math.min(40, st.drag[1] + (e.clientY - st.ptr[1]) * .25));
        st.ptr = [e.clientX, e.clientY]; kick();
      });
      const up = () => { st.dragging = false; host.classList.remove('grab'); };
      host.addEventListener('pointerup', up); host.addEventListener('pointercancel', up);
      const onScroll = () => {
        const r = host.getBoundingClientRect();
        st.scroll = Math.max(0, Math.min(1, (innerHeight * .45 - r.top) / (r.height + innerHeight * .2)));
        kick();
      };
      addEventListener('scroll', onScroll, { passive: true }); onScroll();
    }

    /* visibility: only animate while on screen */
    new IntersectionObserver(es => {
      st.visible = es[0].isIntersecting;
      if (st.visible && !st.t0) { st.t0 = performance.now(); if (steps) setTimeout(() => play(steps), reduce ? 0 : 1400); }
      kick();
    }).observe(host);
    document.addEventListener('visibilitychange', kick);

    function kick() { if (!st.raf) st.raf = requestAnimationFrame(frame); }

    function frame(now) {
      st.raf = 0;
      if (!st.w || !st.visible || document.hidden) return;
      const dt = Math.min(.05, st.last ? (now - st.last) / 1000 : .016);
      st.last = now;
      const t = st.t0 ? (now - st.t0) / 1000 : 0;
      let moving = false;

      // camera
      if (mode === 'hero') {
        const drift = reduce ? 0 : 1;
        Object.assign(st.goal, {
          y: -26 + drift * 9 * Math.sin(t * .16) + st.drag[0],
          p: 34 + drift * 3 * Math.sin(t * .11) + st.drag[1] + st.scroll * 34,
          d: 2050 - st.scroll * 150, x: 500, z: 330,
        });
        if (!st.dragging) { st.drag[0] *= Math.pow(.25, dt); st.drag[1] *= Math.pow(.25, dt); }
        moving = !reduce;
      }
      const k = reduce ? 1 : 1 - Math.exp(-dt * (mode === 'hero' ? 6 : 3.2));
      for (const key of ['y', 'p', 'd', 'x', 'z']) {
        const dlt = st.goal[key] - st.cam[key];
        st.cam[key] += dlt * k;
        if (Math.abs(dlt) > (key === 'd' ? .5 : .02)) moving = true;
      }

      // highlights and knobs
      model.parts.concat(model.flat).forEach(p => {
        const goal = st.on.has(p.name) ? 1 : 0;
        p.hl = p.hl == null ? goal : p.hl + (goal - p.hl) * (reduce ? 1 : 1 - Math.exp(-dt * 6));
        if (Math.abs(goal - p.hl) > .01) moving = true;
      });
      if (!reduce) model.parts.forEach((p, i) => {
        if (!p.knob) return;
        const lit = st.on.has(p.name);
        const goal = p.knob.base == null ? (p.knob.base = p.knob.a) : p.knob.base + (lit ? 1.1 * Math.sin(t * .6 + i) : .35 * Math.sin(t * .23 + i * 1.7));
        p.knob.a += (goal - p.knob.a) * (1 - Math.exp(-dt * 3));
        if (lit || mode === 'hero') moving = true;
      });

      // screen: splash after the draw-in, then the real screens
      const s = st.scr;
      if (!reduce && !s.locked && st.list.length) {
        if (!s.next) s.next = t + 2.4;
        if (t > s.next) { const i = st.list.indexOf(s.cur); showScreen(st.list[(i + 1) % st.list.length]); s.next = t + 3.4; }
        moving = moving || st.list.length > 1 || s.cur === '@splash';
      }
      if (s.mix < 1) { s.mix = Math.min(1, s.mix + dt / .7); moving = true; }
      if (st.press && now - st.press.t0 < 450) moving = true;
      if (t < 2.6 && !reduce) moving = true;

      draw(t);
      if (moving) kick();
    }

    function basis(cam) {
      const yaw = cam.y * DEG, pit = Math.min(89.5, cam.p) * DEG;
      const tg = [cam.x - 500, 0, cam.z - 320];
      const cp = [tg[0] + cam.d * Math.cos(pit) * Math.sin(yaw), tg[1] + cam.d * Math.sin(pit), tg[2] + cam.d * Math.cos(pit) * Math.cos(yaw)];
      const f = norm(sub(tg, cp)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
      return { cp, f, r, u };
    }
    // scale and centre that fit the body (plus a little headroom for knobs) into the canvas
    function frameFit(cam) {
      const { cp, f, r, u } = basis(cam);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      model.body.m.v.forEach(v => [v, [v[0], v[1] + 24, v[2]]].forEach(p => {
        const d = sub(p, cp), z = dot(d, f), x = dot(d, r) / z, y = dot(d, u) / z;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }));
      const s = Math.min(st.w * .94 / (x1 - x0), st.h * .9 / (y1 - y0));
      return { s, mx: (x0 + x1) / 2, my: (y0 + y1) / 2 };
    }

    function draw(t) {
      const { w, h, dpr, cam, col } = st;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const { cp, f, r, u } = basis(cam);
      
      const fit = frameFit(cam); // the whole unit always stays in frame
      {
        if (!st.fit) st.fit = fit;
        for (const key of ['s', 'mx', 'my']) st.fit[key] += (fit[key] - st.fit[key]) * .12;
      }
      const F0 = st.fit;
      const P = p => { const d = sub(p, cp), z = dot(d, f); return [w / 2 + (dot(d, r) / z - F0.mx) * F0.s, h / 2 - (dot(d, u) / z - F0.my) * F0.s]; };
      const seen = fc => dot(fc.n, sub(fc.c, cp)) < 0;
      const prog = d => (reduce ? 1 : ease((t - d) / .8));
      const line = (hl, a) => mix(col.fg, col.red, hl, a);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';

      function solid(o, p, stroke, width, dy = 0) {
        const pv = o.m.v.map(v => P(dy ? [v[0], v[1] + dy, v[2]] : v)), fv = o.m.F.map(seen);
        ctx.beginPath();
        o.m.F.forEach((fc, i) => {
          if (!fv[i]) return;
          fc.ix.forEach((kx, j) => { const q = pv[kx]; j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
          ctx.closePath();
        });
        ctx.fillStyle = mix(col.bg, col.bg, 0);
        ctx.fill();
        if (p <= 0) return fv;
        ctx.beginPath();
        for (const e of o.m.E) {
          const a = fv[e.f[0]], b = e.f.length > 1 && fv[e.f[1]];
          if (!(a || b) || (a && b && !e.sharp)) continue;
          const A = pv[e.a], B = pv[e.b];
          ctx.moveTo(A[0], A[1]);
          ctx.lineTo(A[0] + (B[0] - A[0]) * p, A[1] + (B[1] - A[1]) * p);
        }
        ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke();
        return fv;
      }
      function polyline(poly, y, close = true) {
        ctx.beginPath();
        poly.forEach(([x, z], i) => { const q = P([x, y, z]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
        if (close) ctx.closePath();
      }
      function flatText(txt, x, y, z, size, fill) {
        const o = P([x, y, z]), ex = P([x + 1, y, z]), ez = P([x, y, z + 1]);
        ctx.setTransform(dpr * (ex[0] - o[0]), dpr * (ex[1] - o[1]), dpr * (ez[0] - o[0]), dpr * (ez[1] - o[1]), dpr * o[0], dpr * o[1]);
        ctx.font = `500 ${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = fill; ctx.fillText(txt, 0, 0);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      // body, then what is printed on it, then the screen, then the controls back to front
      const pb = prog(0);
      solid(model.body, pb, line(0, .9), 1.3);
      const pf = prog(.45);
      if (pf > 0) model.flat.forEach(fl => {
        const hl = fl.hl || 0;
        if (fl.poly) { polyline(fl.poly, TOP); ctx.strokeStyle = line(hl, (fl.alpha + hl * .5) * pf); ctx.lineWidth = 1 + hl; ctx.stroke(); }
        else flatText(fl.text, fl.p[0], TOP, fl.p[1], fl.size, line(hl, (.5 + hl * .5) * pf));
      });

      const ps = prog(.9);
      if (ps > 0) {
        const c = [W(318, 62), W(518, 62), W(518, 262), W(318, 262)].map(([x, z]) => P([x, TOP, z]));
        ctx.save();
        ctx.beginPath(); c.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); ctx.clip();
        ctx.transform((c[1][0] - c[0][0]) / 240, (c[1][1] - c[0][1]) / 240, (c[3][0] - c[0][0]) / 240, (c[3][1] - c[0][1]) / 240, c[0][0], c[0][1]);
        const s = st.scr, img = image(s.cur), prev = image(s.prev);
        if (prev && prev.complete && prev.naturalWidth && s.mix < 1) { ctx.globalAlpha = ps; ctx.drawImage(prev, 0, 0, 240, 240); }
        if (img && img.complete && img.naturalWidth) { ctx.globalAlpha = ps * (prev ? s.mix : 1); ctx.drawImage(img, 0, 0, 240, 240); }
        ctx.restore();
        polyline([W(318, 62), W(518, 62), W(518, 262), W(318, 262)], TOP);
        ctx.strokeStyle = line(0, .35 * ps); ctx.lineWidth = 1; ctx.stroke();
      }

      const depth = o => dot(sub([o.m.c[0], o.m.c[1], o.m.c[2]], cp), f);
      model.parts.slice().sort((a, b) => depth(b) - depth(a)).forEach(o => {
        const p = prog(o.delay);
        let hl = o.hl || 0, dy = 0;
        if (st.press && st.press.names.has(o.name)) {
          const k = (performance.now() - st.press.t0) / 450;
          if (k >= 0 && k < 1) { dy = -5 * Math.sin(Math.PI * k); hl = Math.max(hl, Math.sin(Math.PI * k)); }
        }
        const fv = solid(o, p, line(hl, .9), 1.15 + hl * .6, dy);
        if (p <= 0 || !fv[0]) return;
        const y = o.m.v[0][1] + dy;
        if (o.knob) {
          polyline(o.ring, y); ctx.strokeStyle = line(hl, .35 * p); ctx.lineWidth = 1; ctx.stroke();
          const { x, y: py, r, a } = o.knob;
          const A = W(x + Math.sin(a) * r * .35, py - Math.cos(a) * r * .35), B = W(x + Math.sin(a) * r * .85, py - Math.cos(a) * r * .85);
          polyline([A, B], y, false); ctx.strokeStyle = hl > .5 ? line(1, p) : line(0, p); ctx.lineWidth = 1.8; ctx.stroke();
        }
        if (o.top) {
          const [x, z] = W(o.at[0], o.at[1]);
          if (o.top.length === 2) { flatText(o.top[0], x, y, z - 7.5, 11, line(hl, .6 * p)); flatText(o.top[1], x, y, z + 7.5, 11, line(hl, .6 * p)); }
          else flatText(o.top[0], x, y, z, 13, line(hl, .6 * p));
        }
      });
    }

    kick();
    return (host.fm1 = { set, play, stop, get step() { return stepIx; } });
  }

  window.FM1 = { mount: create, groups: GROUPS, views: Object.keys(VIEWS) };
  document.querySelectorAll('.fm1-3d').forEach(el => create(el));

  /* ---------- line portraits draw themselves in ---------- */
  document.querySelectorAll('svg.trace').forEach(svg => {
    if (reduce || !('IntersectionObserver' in window)) return;
    const paths = [...svg.querySelectorAll('path')];
    paths.forEach(p => { const L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L; });
    const io = new IntersectionObserver(es => {
      if (!es[0].isIntersecting) return;
      io.disconnect();
      paths.forEach((p, i) => {
        p.style.transition = `stroke-dashoffset 1.1s cubic-bezier(.2,.7,.2,1) ${(i / paths.length * 1.4).toFixed(3)}s`;
        p.style.strokeDashoffset = 0;
      });
    }, { threshold: .3 });
    io.observe(svg);
  });

  /* ---------- sections fade in ---------- */
  const rv = [...document.querySelectorAll('.reveal')];
  if (!reduce && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .15 });
    rv.forEach(n => io.observe(n));
  } else rv.forEach(n => n.classList.add('in'));
})();
