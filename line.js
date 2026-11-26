/* ─────────────────────────────────────────────
   본 화면 '선' 모드 (main.js 의 MAIN_MODE = 'line')
   · Line.buildRing : 3D 공간에 세운 입자 고리. 처음엔 정확히 옆에서 보므로 세로 흰 선으로 보인다
     고리 평면 = y-z 평면 (x = 0). 카메라가 -z 쪽에서 보면 선, 옆(x 축)으로 돌면 원
     점마다 11개: θ, off, side, kind, size, bright, seed, born, dx, dy, dz
       kind 0 몸통  : off = 반지름 방향 두께, side = x 방향 두께
       kind 1 가시  : off = 가시를 따라간 자리 (0..1), dx = 길이, dy = 가로 방향 (±1)
       kind 2 먼지  : dx, dy, dz = 자리
   · Line.Ink : 잉크 실 다발. 고리의 한 점에서 터져 curl noise 를 따라 흐르며 긴 꼬리를 남긴다
   · Line.noise / curl : 3D 심플렉스 노이즈와 그 회전장
   ───────────────────────────────────────────── */
const Line = (() => {
  /* ── 3D 심플렉스 노이즈 (Stefan Gustavson) ── */
  const G = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];
  const perm = new Uint8Array(512);
  (() => {
    const p = []; let s = 1337;
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  })();
  const F3 = 1 / 3, G3 = 1 / 6;
  const corner = (gi, x, y, z) => {
    let t = .6 - x * x - y * y - z * z;
    if (t < 0) return 0;
    t *= t; const g = G[gi];
    return t * t * (g[0] * x + g[1] * y + g[2] * z);
  };
  function noise(xin, yin, zin) {
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    return 32 * (corner(perm[ii + perm[jj + perm[kk]]] % 12, x0, y0, z0)
      + corner(perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] % 12, x1, y1, z1)
      + corner(perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] % 12, x2, y2, z2)
      + corner(perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] % 12, x3, y3, z3));
  }
  // curl noise: 세 노이즈 장을 퍼텐셜로 쓴 회전장 (발산 없음 → 연기·잉크처럼 소용돌이친다)
  const nb = (x, y, z) => noise(x + 31.4, y + 17.1, z - 9.2);
  const nc = (x, y, z) => noise(x - 13.7, y + 41.3, z + 27.5);
  function curl(x, y, z, out) {
    const e = .1, k = 1 / (2 * e);
    out[0] = ((nc(x, y + e, z) - nc(x, y - e, z)) - (nb(x, y, z + e) - nb(x, y, z - e))) * k;
    out[1] = ((noise(x, y, z + e) - noise(x, y, z - e)) - (nc(x + e, y, z) - nc(x - e, y, z))) * k;
    out[2] = ((nb(x + e, y, z) - nb(x - e, y, z)) - (noise(x, y + e, z) - noise(x, y - e, z))) * k;
    return out;
  }

  /* ── 입자 고리 ── */
  const STRIDE = 11;
  // R: 0..1 난수 함수, cfg: main.js 의 RING
  function buildRing(cfg, R) {
    const out = [];
    const gauss = () => (R() + R() + R() - 1.5) / 1.5;
    const push = (...v) => out.push(...v);
    const r = cfg.r;
    // 굵게 뭉친 마디 (붓 자국 질감)
    const knots = [];
    for (let i = 0; i < 16; i++) knots.push({ th: R() * 6.2832, w: .015 + R() * .05, k: .5 + R() * 1.5 });
    for (let i = 0; i < cfg.body; i++) {
      let th, clump = 0;
      if (R() < .42) { const kn = knots[(R() * knots.length) | 0]; th = kn.th + gauss() * kn.w; clump = kn.k; }
      else th = R() * 6.2832;
      const thick = 1 + clump * 1.6;
      push(th, gauss() * .011 * thick, gauss() * .009 * thick, 0,
        1 + R() * (clump ? 1.2 : .6), .42 + R() * .38 + clump * .12, R(), Math.abs(Math.sin(th)), 0, 0, 0);
    }
    // 가시: 고리 평면 밖으로도 살짝 뻗은 점 줄 (옆에서는 가로 가시, 정면에서는 원 밖으로 삐죽한 털)
    let n = 0;
    while (n < cfg.spikes) {
      const th = R() * 6.2832, len = .1 + Math.pow(R(), 1.6) * .8, side = R() < .5 ? -1 : 1;
      const m = 5 + ((len * 16) | 0);
      for (let j = 0; j < m && n < cfg.spikes; j++, n++) {
        const u = (j + R() * .6) / m;
        push(th, u, 0, 1, .9 + R() * .6, .55 - u * .25, R(), Math.abs(Math.sin(th)), len, side, 0);
      }
    }
    // 먼지: 주변에 희미하게, 일부는 가로로 늘어선 점선 스크래치
    n = 0;
    while (n < cfg.dust) {
      if (R() < .3) {
        const y = (R() - .5) * r * 2.6, z = (R() - .5) * r * 2.6, x0 = (R() - .5) * r * 2.4, m = 8 + ((R() * 14) | 0);
        for (let j = 0; j < m && n < cfg.dust; j++, n++)
          push(0, 0, 0, 2, .8 + R() * .5, .18 + R() * .2, R(), .4 + R() * .6, x0 + j * .035, y, z);
      } else {
        push(0, 0, 0, 2, .7 + R() * .7, .08 + R() * .16, R(), .4 + R() * .6, (R() - .5) * r * 2.8, (R() - .5) * r * 2.8, (R() - .5) * r * 2.8);
        n++;
      }
    }
    return new Float32Array(out);
  }
  // 고리 위 각도 th 의 자리 (월드)
  const ringPoint = (r, th) => [0, r * Math.sin(th), r * Math.cos(th)];

  /* ── 잉크 실 다발 ── */
  const Ink = (() => {
    let fil = [], maxFil = 375, tail = 32;
    const c = [0, 0, 0];
    function config(max, t) { tail = t; maxFil = Math.max(8, Math.floor(max / t)); }
    function make(p, v, life, a) {
      const tl = new Float32Array(tail * 3);
      for (let i = 0; i < tail; i++) { tl[i * 3] = p[0]; tl[i * 3 + 1] = p[1]; tl[i * 3 + 2] = p[2]; }
      return { p: [...p], v, tl, n: 1, age: 0, life, a };
    }
    // o: 고리 위 터지는 자리, th: 그 자리의 각도, count: 실 수, power: 세기 0..1+, opt: { life:[a,b], ribbon: 확률 }
    function burst(o, th, count, power, opt) {
      const rad = [0, Math.sin(th), Math.cos(th)];
      const rnd = () => Math.random() * 2 - 1;
      for (let i = 0; i < count; i++) {
        const slow = Math.random() < .55;                        // 반은 가운데에 짙게 뭉치고, 반은 멀리 가늘게
        const sp = power * (slow ? .12 + .3 * Math.random() : .55 + 2.2 * Math.random() ** 2);
        const sx = Math.random() < .5 ? -1 : 1;
        const d = [rad[0] * .7 + sx * .85 + rnd() * .5, rad[1] * .7 + rnd() * .5, rad[2] * .7 + rnd() * .5];
        const l = Math.hypot(...d) || 1;
        const p = [o[0] + rnd() * .03, o[1] + rnd() * .03, o[2] + rnd() * .03];
        const life = (opt.life[0] + Math.random() * (opt.life[1] - opt.life[0])) * (slow ? .7 : 1);
        fil.push(make(p, [d[0] / l * sp, d[1] / l * sp, d[2] / l * sp], life, slow ? .3 : .16));
      }
      // 가끔: 6~10 가닥이 같은 길을 살짝 어긋나게 따라가 겹친 등고선 리본
      if (Math.random() < opt.ribbon) {
        const k = 6 + ((Math.random() * 5) | 0), sx = Math.random() < .5 ? -1 : 1;
        const d = [sx, rad[1] * .9 + rnd() * .4, rad[2] * .9 + rnd() * .4], l = Math.hypot(...d);
        const sp = power * (.9 + Math.random() * 1.2), life = opt.life[1] * (.8 + Math.random() * .4);
        for (let j = 0; j < k; j++) {
          const off = (j - k / 2) * .018;
          fil.push(make([o[0], o[1] + off, o[2] + off * .5], [d[0] / l * sp, d[1] / l * sp, d[2] / l * sp], life, .2));
        }
      }
      if (fil.length > maxFil) fil.splice(0, fil.length - maxFil);   // 오래된 것부터
    }
    // P: { curl, high, wind (회전 속도, rad/s), time }
    function update(dt, P) {
      for (let i = fil.length - 1; i >= 0; i--) {
        const f = fil[i];
        f.age += dt;
        if (f.age > f.life) { fil.splice(i, 1); continue; }
        const p = f.p, v = f.v;
        curl(p[0] * .55, p[1] * .55, p[2] * .55 + P.time * .05, c);
        const k = P.curl * dt * 1.8;
        v[0] += c[0] * k; v[1] += c[1] * k; v[2] += c[2] * k;
        // 돌리면 회전 반대 방향으로 휘날린다 (세로축 둘레)
        v[0] += -p[2] * -P.wind * .35 * dt; v[2] += p[0] * -P.wind * .35 * dt;
        if (P.high > .01) { const h = P.high * .9 * dt; v[0] += (Math.random() - .5) * h; v[1] += (Math.random() - .5) * h; v[2] += (Math.random() - .5) * h; }
        const drag = Math.exp(-dt * 1.1);
        v[0] *= drag; v[1] *= drag; v[2] *= drag;
        p[0] += v[0] * dt; p[1] += v[1] * dt; p[2] += v[2] * dt;
        f.tl.copyWithin(3, 0, (tail - 1) * 3);
        f.tl[0] = p[0]; f.tl[1] = p[1]; f.tl[2] = p[2];
        if (f.n < tail) f.n++;
      }
    }
    // 선분 정점 (x, y, z, 투명도) × 2 를 채우고 정점 수를 돌려준다
    let buf = new Float32Array(0);
    function write() {
      let need = 0;
      for (const f of fil) need += (f.n - 1) * 8;
      if (buf.length < need) buf = new Float32Array(need * 1.3 | 0);
      let o = 0;
      for (const f of fil) {
        const u = f.age / f.life;
        const a = f.a * Math.min(1, f.age / .12) * (1 - u * u);
        for (let i = 0; i < f.n - 1; i++) {
          const a0 = a * (1 - i / tail), a1 = a * (1 - (i + 1) / tail), t = f.tl;
          buf[o++] = t[i * 3]; buf[o++] = t[i * 3 + 1]; buf[o++] = t[i * 3 + 2]; buf[o++] = a0;
          buf[o++] = t[i * 3 + 3]; buf[o++] = t[i * 3 + 4]; buf[o++] = t[i * 3 + 5]; buf[o++] = a1;
        }
      }
      return { data: buf, count: o / 4 };
    }
    return { config, burst, update, write, clear: () => { fil = []; }, get count() { return fil.length; } };
  })();

  return { noise, curl, buildRing, ringPoint, Ink, STRIDE };
})();
