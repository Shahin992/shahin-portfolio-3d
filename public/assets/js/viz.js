/* 3D scenes and data visualizations. Zero dependencies (Canvas 2D + CSS 3D).
   Each scene only animates while on screen and respects prefers-reduced-motion. */
(function () {
  "use strict";
  var root = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var TAU = Math.PI * 2;
  var D2R = Math.PI / 180;

  /* ---------- palette from CSS variables (updates on theme change) ---------- */
  var pal = {};
  var themeListeners = [];
  function hex(c) {
    c = c.trim();
    if (c[0] !== "#") return [128, 128, 128];
    if (c.length === 4) c = "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  }
  function readPalette() {
    var cs = getComputedStyle(root);
    ["ink", "accent", "muted", "bg", "bg-2", "rule-strong"].forEach(function (k) { pal[k] = hex(cs.getPropertyValue("--" + k)); });
  }
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a.toFixed(3) + ")"; }
  readPalette();
  new MutationObserver(function () { readPalette(); themeListeners.forEach(function (fn) { fn(); }); })
    .observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  /* ---------- helpers ---------- */
  function loop(el, draw) {
    var visible = false, raf = 0;
    function frame(t) { raf = 0; if (!visible || document.hidden) return; draw(t); raf = requestAnimationFrame(frame); }
    function kick() {
      if (reduce) { draw(0); return; }
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
    }
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) kick(); }, { rootMargin: "80px" }).observe(el);
    document.addEventListener("visibilitychange", kick);
    themeListeners.push(function () { draw(performance.now()); });
    return { redraw: function () { draw(performance.now()); } };
  }
  function fitCanvas(canvas, ctx) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h };
  }

  /* ---------- 1. Hero: 3D wireframe terrain ---------- */
  function waveField(canvas) {
    var ctx = canvas.getContext("2d");
    var s = { w: 0, h: 0 }, cols = 120, rows = 34;
    var mx = 0, my = 0, tx = 0, ty = 0;
    function resize() {
      s = fitCanvas(canvas, ctx);
      cols = s.w < 640 ? 70 : 130; rows = s.w < 640 ? 24 : 36;
    }
    function height(x, z, t) {
      return Math.sin(x * 0.95 + t * 0.8) * 0.3
           + Math.cos(z * 0.75 + t * 0.6) * 0.3
           + Math.sin(x * 0.55 + z * 0.5 - t * 0.5) * 0.28
           + Math.sin(x * 2.1 + z * 1.3 + t * 1.2) * 0.07;
    }
    function draw(time) {
      var t = time * 0.001;
      mx += (tx - mx) * 0.05; my += (ty - my) * 0.05;
      ctx.clearRect(0, 0, s.w, s.h);
      var fx = s.w * 0.55, fy = s.h * 1.05, horizon = s.h * 0.06;
      var camH = 1.65 + my * 0.45, yaw = mx * 0.2;
      var cy = Math.cos(yaw), sy = Math.sin(yaw);
      var spanX = 20;
      ctx.lineJoin = "round";
      // far to near so near lines paint on top
      for (var j = rows - 1; j >= 0; j--) {
        var z0 = 2 + j * 0.4;
        var depth = 1 - j / rows;
        ctx.beginPath();
        var started = false;
        var crests = [];
        for (var i = 0; i < cols; i++) {
          var x0 = (i / (cols - 1) - 0.5) * spanX * 2;
          var y = height(x0, z0, t);
          var x = x0 * cy - (z0 - 7) * sy;
          var z = x0 * sy + (z0 - 7) * cy + 7;
          if (z < 1) { started = false; continue; }
          var px = s.w / 2 + (x / z) * fx;
          var py = horizon + ((camH - y) / z) * fy;
          if (!started) { ctx.moveTo(px, py); started = true; } else { ctx.lineTo(px, py); }
          if (y > 0.58 && i % 2 === 0) crests.push(px, py, z);
        }
        ctx.strokeStyle = rgba(pal.ink, 0.06 + depth * 0.42);
        ctx.lineWidth = 0.6 + depth * 0.9;
        ctx.stroke();
        ctx.fillStyle = rgba(pal.accent, 0.35 + depth * 0.6);
        for (var c = 0; c < crests.length; c += 3) {
          var r = Math.min(2.8, Math.max(0.7, 3.6 / crests[c + 2]));
          ctx.beginPath(); ctx.arc(crests[c], crests[c + 1], r, 0, TAU); ctx.fill();
        }
      }
    }
    resize();
    var l = loop(canvas, draw);
    new ResizeObserver(function () { resize(); l.redraw(); }).observe(canvas);
    window.addEventListener("pointermove", function (e) {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });
  }

  /* ---------- 2. Wireframe globe pinned on Dhaka ---------- */
  function globe(canvas) {
    var ctx = canvas.getContext("2d");
    var s = { w: 0, h: 0 };
    var DHAKA = { lat: 23.81, lon: 90.41 };
    var tilt = 0.36, base = -DHAKA.lon * D2R, drag = 0, dragging = false, lastX = 0;
    var dots = [];
    for (var k = 0, N = 1100; k < N; k++) {
      var phi = Math.acos(1 - (2 * (k + 0.5)) / N), th = Math.PI * (1 + Math.sqrt(5)) * k;
      dots.push([90 - phi / D2R, (th / D2R) % 360]);
    }
    function resize() { s = fitCanvas(canvas, ctx); }
    function proj(lat, lon, rot, R, cx, cy) {
      var la = lat * D2R, lo = lon * D2R + rot;
      var x = Math.cos(la) * Math.sin(lo), y = Math.sin(la), z = Math.cos(la) * Math.cos(lo);
      var y2 = y * Math.cos(tilt) - z * Math.sin(tilt);
      var z2 = y * Math.sin(tilt) + z * Math.cos(tilt);
      return [cx + x * R, cy - y2 * R, z2];
    }
    function polyline(pts) {
      for (var i = 1; i < pts.length; i++) {
        var a = pts[i - 1], b = pts[i], zz = (a[2] + b[2]) / 2;
        ctx.strokeStyle = zz > 0 ? rgba(pal.ink, 0.12 + zz * 0.3) : rgba(pal.ink, 0.05);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
    }
    function draw(time) {
      var t = time * 0.001;
      if (!dragging) drag *= 0.985;
      var rot = base + Math.sin(t * 0.16) * 0.85 + drag;
      var R = Math.min(s.w, s.h) * 0.36, cx = s.w / 2, cy = s.h / 2;
      ctx.clearRect(0, 0, s.w, s.h);

      // body
      var g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      g.addColorStop(0, rgba(pal["bg-2"], 0.2)); g.addColorStop(1, rgba(pal["bg-2"], 1));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = rgba(pal.ink, 0.35); ctx.stroke();

      // orbit ring (back half)
      var orbit = [];
      for (var a = 0; a <= 360; a += 4) {
        var ar = a * D2R, ox = Math.cos(ar) * 1.38, oz = Math.sin(ar) * 1.38, oy = oz * 0.18;
        orbit.push([cx + ox * R, cy - (oy - oz * 0.12) * R, oz]);
      }
      ctx.setLineDash([3, 5]);
      for (var o = 1; o < orbit.length; o++) if (orbit[o][2] < 0) {
        ctx.strokeStyle = rgba(pal.ink, 0.18); ctx.beginPath();
        ctx.moveTo(orbit[o - 1][0], orbit[o - 1][1]); ctx.lineTo(orbit[o][0], orbit[o][1]); ctx.stroke();
      }
      ctx.setLineDash([]);

      // graticule
      ctx.lineWidth = 0.8;
      for (var lon = 0; lon < 360; lon += 30) {
        var m = []; for (var la = -90; la <= 90; la += 5) m.push(proj(la, lon, rot, R, cx, cy)); polyline(m);
      }
      for (var lat = -60; lat <= 60; lat += 30) {
        var p = []; for (var lo2 = 0; lo2 <= 360; lo2 += 5) p.push(proj(lat, lo2, rot, R, cx, cy)); polyline(p);
      }
      // dotted surface
      for (var d = 0; d < dots.length; d++) {
        var q = proj(dots[d][0], dots[d][1], rot, R, cx, cy);
        if (q[2] <= 0.02) continue;
        ctx.fillStyle = rgba(pal.ink, 0.08 + q[2] * 0.32);
        ctx.fillRect(q[0] - 0.7, q[1] - 0.7, 1.4, 1.4);
      }

      // orbit ring (front half) + satellite
      ctx.setLineDash([3, 5]); ctx.lineWidth = 1;
      for (var o2 = 1; o2 < orbit.length; o2++) if (orbit[o2][2] >= 0) {
        ctx.strokeStyle = rgba(pal.ink, 0.45); ctx.beginPath();
        ctx.moveTo(orbit[o2 - 1][0], orbit[o2 - 1][1]); ctx.lineTo(orbit[o2][0], orbit[o2][1]); ctx.stroke();
      }
      ctx.setLineDash([]);
      var sa = t * 0.5, sx = Math.cos(sa) * 1.38, sz = Math.sin(sa) * 1.38;
      ctx.fillStyle = rgba(pal.ink, sz >= 0 ? 0.9 : 0.25);
      ctx.beginPath(); ctx.arc(cx + sx * R, cy - (sz * 0.18 - sz * 0.12) * R, 3, 0, TAU); ctx.fill();

      // Dhaka pin
      var dh = proj(DHAKA.lat, DHAKA.lon, rot, R, cx, cy);
      if (dh[2] > 0) {
        var pulse = (t * 0.7) % 1;
        ctx.strokeStyle = rgba(pal.accent, 0.8 * (1 - pulse)); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(dh[0], dh[1], 5 + pulse * 22, 0, TAU); ctx.stroke();
        ctx.fillStyle = rgba(pal.accent, 1);
        ctx.beginPath(); ctx.arc(dh[0], dh[1], 5, 0, TAU); ctx.fill();
        ctx.font = "11px 'Geist Mono', ui-monospace, monospace";
        var labelW = ctx.measureText("23.8°N  90.4°E").width + 4;
        var dir = dh[0] + R * 0.32 + 22 + labelW > s.w - 6 ? -1 : 1;   // flip label near the right edge
        var lx = dh[0] + dir * R * 0.32, ly = dh[1] - R * 0.42, tx0 = lx + dir * 22;
        ctx.strokeStyle = rgba(pal.ink, 0.7); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(dh[0], dh[1]); ctx.lineTo(lx, ly); ctx.lineTo(lx + dir * 16, ly); ctx.stroke();
        ctx.textAlign = dir > 0 ? "left" : "right";
        ctx.fillStyle = rgba(pal.ink, 1);
        ctx.font = "500 12px 'Geist Mono', ui-monospace, monospace";
        ctx.fillText("DHAKA, BD", tx0, ly + 4);
        ctx.fillStyle = rgba(pal.muted, 1);
        ctx.font = "11px 'Geist Mono', ui-monospace, monospace";
        ctx.fillText("23.8°N  90.4°E", tx0, ly + 20);
        ctx.textAlign = "left";
      }
    }
    resize();
    var l = loop(canvas, draw);
    new ResizeObserver(function () { resize(); l.redraw(); }).observe(canvas);
    canvas.addEventListener("pointerdown", function (e) { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      drag += (e.clientX - lastX) * 0.008; lastX = e.clientX;
      if (reduce) l.redraw();
    });
    ["pointerup", "pointercancel"].forEach(function (ev) { canvas.addEventListener(ev, function () { dragging = false; }); });
  }

  /* ---------- 3. 3D tag sphere (real DOM text, crawlable) ---------- */
  function tagSphere(list) {
    var wrap = list.parentElement;
    var items = [].slice.call(list.children);
    var N = items.length;
    if (!N) return;
    list.classList.add("is-3d");
    var pts = items.map(function (_, i) {
      var phi = Math.acos(1 - (2 * (i + 0.5)) / N), th = Math.PI * (1 + Math.sqrt(5)) * i;
      return [Math.cos(th) * Math.sin(phi), Math.sin(th) * Math.sin(phi), Math.cos(phi)];
    });
    var ax = 0.25, ay = 0, vx = 0.0011, vy = 0.0026, R = 200, dragging = false, last = null, hover = false;
    function resize() { R = wrap.clientWidth * 0.36; }
    function draw() {
      if (!dragging) {
        var k = hover ? 0.25 : 1;
        vx += (0.0011 * k - vx) * 0.03; vy += (0.0026 * k - vy) * 0.03;
      }
      ax += vx; ay += vy;
      var cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay);
      for (var i = 0; i < N; i++) {
        var p = pts[i];
        var x = p[0] * cy + p[2] * sy;
        var z = -p[0] * sy + p[2] * cy;
        var y = p[1] * cx - z * sx;
        z = p[1] * sx + z * cx;
        var sc = 0.6 + (z + 1) * 0.32;
        var el = items[i];
        el.style.transform = "translate(-50%,-50%) translate3d(" + (x * R).toFixed(1) + "px," + (y * R).toFixed(1) + "px,0) scale(" + sc.toFixed(3) + ")";
        el.style.opacity = (0.16 + ((z + 1) / 2) * 0.84).toFixed(3);
        el.style.zIndex = String(Math.round((z + 1) * 100));
      }
    }
    resize();
    var l = loop(wrap, draw);
    new ResizeObserver(function () { resize(); l.redraw(); }).observe(wrap);
    wrap.addEventListener("pointerenter", function () { hover = true; });
    wrap.addEventListener("pointerleave", function () { hover = false; });
    wrap.addEventListener("pointerdown", function (e) { dragging = true; last = [e.clientX, e.clientY]; wrap.setPointerCapture(e.pointerId); });
    wrap.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      vy = (e.clientX - last[0]) * 0.004; vx = -(e.clientY - last[1]) * 0.004;
      last = [e.clientX, e.clientY];
      if (reduce) { ax += vx; ay += vy; l.redraw(); }
    });
    ["pointerup", "pointercancel"].forEach(function (ev) { wrap.addEventListener(ev, function () { dragging = false; }); });
  }

  /* ---------- 4. Stack map: hover a project or a technology to trace links ---------- */
  function stackMap(map) {
    var svg = map.querySelector("svg");
    if (!svg) return;
    function clear() {
      map.classList.remove("is-dim");
      [].forEach.call(svg.querySelectorAll(".is-on"), function (e) { e.classList.remove("is-on"); });
    }
    function focus(kind, key) {
      clear(); map.classList.add("is-dim");
      var sel = kind === "src" ? '.sm-edge[data-from="' + key + '"]' : '.sm-edge[data-to="' + key + '"]';
      [].forEach.call(svg.querySelectorAll(sel), function (e) {
        e.classList.add("is-on");
        var tech = svg.querySelector('.sm-tech[data-key="' + e.getAttribute("data-to") + '"]');
        var src = svg.querySelector('.sm-src[data-key="' + e.getAttribute("data-from") + '"]');
        if (tech) tech.classList.add("is-on");
        if (src) src.classList.add("is-on");
      });
    }
    [].forEach.call(svg.querySelectorAll(".sm-src, .sm-tech"), function (g) {
      var kind = g.classList.contains("sm-src") ? "src" : "tech";
      var key = g.getAttribute("data-key");
      g.addEventListener("mouseenter", function () { focus(kind, key); });
      g.addEventListener("focus", function () { focus(kind, key); });
      g.addEventListener("blur", clear);
    });
    svg.addEventListener("mouseleave", clear);
  }

  /* ---------- 5. Page-hero 3D wireframes: geodesic sphere, torus, torus knots ---------- */
  function norm3(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function geometry(type) {
    var V = [], E = [], seen = {}, i, j;
    function edge(a, b) { var k = a < b ? a + "_" + b : b + "_" + a; if (!seen[k]) { seen[k] = 1; E.push([a, b]); } }
    if (type === "ico") {
      var t = (1 + Math.sqrt(5)) / 2, mid = {};
      [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
       [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].forEach(function (v) { V.push(norm3(v)); });
      var m = function (a, b) {
        var k = a < b ? a + "_" + b : b + "_" + a;
        if (mid[k] === undefined) { mid[k] = V.length; V.push(norm3([V[a][0] + V[b][0], V[a][1] + V[b][1], V[a][2] + V[b][2]])); }
        return mid[k];
      };
      [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
       [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]]
        .forEach(function (f) {
          var a = m(f[0], f[1]), b = m(f[1], f[2]), c = m(f[2], f[0]);
          [[f[0], a, c], [f[1], b, a], [f[2], c, b], [a, b, c]].forEach(function (tri) { edge(tri[0], tri[1]); edge(tri[1], tri[2]); edge(tri[2], tri[0]); });
        });
    } else if (type === "torus") {
      var U = 32, W = 14, R = 0.74, r = 0.32;
      for (i = 0; i < U; i++) for (j = 0; j < W; j++) {
        var u = i / U * TAU, v = j / W * TAU;
        V.push([(R + r * Math.cos(v)) * Math.cos(u), r * Math.sin(v), (R + r * Math.cos(v)) * Math.sin(u)]);
      }
      for (i = 0; i < U; i++) for (j = 0; j < W; j++) { edge(i * W + j, ((i + 1) % U) * W + j); edge(i * W + j, i * W + (j + 1) % W); }
    } else {
      var p = 2, q = 3, pq = /knot(\d)(\d)/.exec(type), N = 200, M = 6, tube = 0.1;
      if (pq) { p = +pq[1]; q = +pq[2]; }
      var C = function (s) { var rr = (2 + Math.cos(q * s)) / 3.1; return [rr * Math.cos(p * s), rr * Math.sin(p * s), -Math.sin(q * s) / 3.1]; };
      for (i = 0; i < N; i++) {
        var s0 = i / N * TAU, c0 = C(s0), c1 = C(s0 + 0.001), c2 = C(s0 - 0.001);
        var T = norm3([c1[0] - c2[0], c1[1] - c2[1], c1[2] - c2[2]]), Nn = norm3(cross(T, [0, 0, 1])), B = cross(T, Nn);
        for (j = 0; j < M; j++) {
          var a0 = j / M * TAU, ca = Math.cos(a0) * tube, sa = Math.sin(a0) * tube;
          V.push([c0[0] + ca * Nn[0] + sa * B[0], c0[1] + ca * Nn[1] + sa * B[1], c0[2] + ca * Nn[2] + sa * B[2]]);
        }
      }
      for (i = 0; i < N; i++) for (j = 0; j < M; j++) { edge(i * M + j, ((i + 1) % N) * M + j); if (i % 3 === 0) edge(i * M + j, i * M + (j + 1) % M); }
    }
    return { V: V, E: E };
  }
  function shape3d(canvas) {
    var ctx = canvas.getContext("2d"), s = { w: 0, h: 0 };
    var type = canvas.getAttribute("data-shape") || "ico";
    var g = geometry(type), V = g.V, E = g.E, P = new Array(V.length);
    var mx = 0, my = 0, tx = 0, ty = 0;
    function resize() { s = fitCanvas(canvas, ctx); }
    function draw(time) {
      var t = time * 0.001;
      mx += (tx - mx) * 0.04; my += (ty - my) * 0.04;
      var ay = t * 0.22 + mx * 0.9, ax = (type === "torus" ? 0.95 : 0.35) + Math.sin(t * 0.3) * 0.18 + my * 0.5;
      var cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
      var R = Math.min(s.w, s.h) * 0.36, ox = s.w / 2, oy = s.h / 2, persp = 3.2, i;
      for (i = 0; i < V.length; i++) {
        var v = V[i], x = v[0] * cy + v[2] * sy, z = -v[0] * sy + v[2] * cy, y = v[1] * cx - z * sx;
        z = v[1] * sx + z * cx;
        var k = persp / (persp - z);
        P[i] = [ox + x * R * k, oy + y * R * k, z];
      }
      ctx.clearRect(0, 0, s.w, s.h);
      ctx.lineWidth = 1;
      var buckets = [[], [], [], []];
      for (i = 0; i < E.length; i++) {
        var a = P[E[i][0]], b = P[E[i][1]], bi = Math.floor(((a[2] + b[2]) / 2 + 1) * 2);
        buckets[bi < 0 ? 0 : bi > 3 ? 3 : bi].push(a, b);
      }
      for (var bb = 0; bb < 4; bb++) {
        var arr = buckets[bb];
        if (!arr.length) continue;
        ctx.strokeStyle = bb === 3 ? rgba(pal.accent, 0.5) : rgba(pal.ink, 0.07 + bb * 0.14);
        ctx.beginPath();
        for (var q2 = 0; q2 < arr.length; q2 += 2) { ctx.moveTo(arr[q2][0], arr[q2][1]); ctx.lineTo(arr[q2 + 1][0], arr[q2 + 1][1]); }
        ctx.stroke();
      }
      if (type === "ico") {
        for (i = 0; i < P.length; i++) {
          var pz = P[i][2];
          if (pz < -0.2) continue;
          ctx.fillStyle = rgba(pz > 0.75 ? pal.accent : pal.ink, 0.25 + (pz + 1) * 0.3);
          ctx.beginPath(); ctx.arc(P[i][0], P[i][1], 1.2 + (pz + 1) * 1.1, 0, TAU); ctx.fill();
        }
      }
    }
    resize();
    var l = loop(canvas, draw);
    new ResizeObserver(function () { resize(); l.redraw(); }).observe(canvas);
    window.addEventListener("pointermove", function (e) {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });
  }

  [].forEach.call(document.querySelectorAll("canvas[data-shape]"), shape3d);
  [].forEach.call(document.querySelectorAll("canvas[data-wave]"), waveField);
  [].forEach.call(document.querySelectorAll("canvas[data-globe]"), globe);
  [].forEach.call(document.querySelectorAll("[data-sphere]"), tagSphere);
  [].forEach.call(document.querySelectorAll("[data-stackmap]"), stackMap);
})();
