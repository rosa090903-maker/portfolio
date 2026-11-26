/* ─────────────────────────────────────────────
   소리 — 파일 없이 Web Audio 로 만든다
   · 바탕: 낮고 따뜻한 화음이 천천히 숨 쉰다
   · 커서를 훑으면: 종이가 스치는 쉬익 소리 + 낮은 불꽃 울림
   · 초록 글씨가 타면: 타닥타닥 불씨 튀는 소리
   · 본 화면 ('선' 모드): 커서를 섹션에 대면 낮은 베이스가 "둥·둥·둥" (hum) — 그 섹션 아래 선이 같이 출렁인다
   · (쉬어 둔) 생성형 글리치 / IDM — 서브 킥 심장박동 · 노이즈 파열음 · 스터터 · 비트크러시 · 금속 톤
     16분음표 시퀀서를 AudioContext 시간으로 미리 예약한다. energy (0..1) 가 밀도를 정한다
     levels() = 지금 소리의 low · mid · high 와 이번 프레임에 울린 박 (화면이 같이 터지게)
     소리가 꺼져 있거나 아직 켜지기 전이면 같은 시퀀서를 무음으로 (performance 시계로) 돌려 화면만 반응
   브라우저 정책상 첫 클릭/키 입력 뒤에만 켜진다.
   ───────────────────────────────────────────── */
const Sound = (() => {
  let ac, master, hissG, rumbleG, droneG, crackBus, crackBufs = [];
  let started = false, on = false;
  let act = 0;
  // 글리치 음악
  const M = { bpm: 132, density: [.05, .85] };
  let musicG, crushIn, analyser, fdata, noiseB, clickB;
  let musicT = 0, energy = 0, events = [], barRng = Math.random;
  const seq = { next: 0, step: 0, mode: '' };
  let bassG;
  const hum = { hz: 0, next: 0, i: 0 };
  const HUM = { short: .24, long: .74 };   // 둥 · 둥 · 둥 사이, 세 번 뒤 쉼 (s)

  function noiseBuffer(sec) {
    const b = ac.createBuffer(1, ac.sampleRate * sec, ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function start() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0;
    const comp = ac.createDynamicsCompressor();
    master.connect(comp).connect(ac.destination);

    const nb = noiseBuffer(3);

    // 쉬익 — 종이를 스치는 바람
    const n1 = ac.createBufferSource(); n1.buffer = nb; n1.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = .55;
    hissG = ac.createGain(); hissG.gain.value = 0;
    n1.connect(bp).connect(hissG).connect(master); n1.start();

    // 낮은 불꽃 울림
    const n2 = ac.createBufferSource(); n2.buffer = nb; n2.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
    rumbleG = ac.createGain(); rumbleG.gain.value = 0;
    n2.connect(lp).connect(rumbleG).connect(master); n2.start(0, 1.3);

    // 바탕 화음 (A 단조 계열, 낮게)
    droneG = ac.createGain(); droneG.gain.value = 0;
    const dlp = ac.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 900;
    droneG.connect(dlp).connect(master);
    [[110, .05], [164.81, .03], [220.6, .018], [329.2, .008]].forEach(([f, g], i) => {
      const o = ac.createOscillator(); o.type = i ? 'sine' : 'triangle'; o.frequency.value = f;
      const og = ac.createGain(); og.gain.value = g;
      const lfo = ac.createOscillator(); lfo.frequency.value = .05 + i * .031;
      const lg = ac.createGain(); lg.gain.value = g * .6;
      lfo.connect(lg).connect(og.gain); lfo.start();
      o.connect(og).connect(droneG); o.start();
    });

    // 타닥 — 짧게 사그라드는 잡음 조각들
    crackBus = ac.createGain(); crackBus.gain.value = 1; crackBus.connect(master);
    for (let k = 0; k < 12; k++) {
      const len = Math.floor(ac.sampleRate * (.003 + Math.random() * .022));
      const b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * .18));
      crackBufs.push(b);
    }

    // 글리치 음악 버스: 음악 → 분석기 → master. 비트크러시는 계단 곡선 WaveShaper
    musicG = ac.createGain(); musicG.gain.value = 0;
    analyser = ac.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = .45;
    fdata = new Uint8Array(analyser.frequencyBinCount);
    musicG.connect(analyser); analyser.connect(master);
    const ws = ac.createWaveShaper(), cn = 2048, curve = new Float32Array(cn);
    for (let i = 0; i < cn; i++) { const x = i / (cn - 1) * 2 - 1; curve[i] = Math.round(x * 5) / 5; }
    ws.curve = curve;
    crushIn = ac.createGain(); crushIn.connect(ws).connect(musicG);
    noiseB = noiseBuffer(1);
    clickB = ac.createBuffer(1, 2, ac.sampleRate); clickB.getChannelData(0)[0] = 1;
    musicG.gain.setTargetAtTime(musicT * .9, ac.currentTime, .3);
    bassG = ac.createGain(); bassG.gain.value = 1; bassG.connect(analyser);

    started = on = true;
    master.gain.setTargetAtTime(.8, ac.currentTime, .6);
    droneG.gain.setTargetAtTime(1, ac.currentTime, 2.5);
    return true;
  }

  function crackle(strength) {
    const s = ac.createBufferSource();
    s.buffer = crackBufs[Math.random() * crackBufs.length | 0];
    s.playbackRate.value = .7 + Math.random() * .9;
    const f = ac.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.value = 700 + Math.random() * 4200; f.Q.value = 1.2;
    const g = ac.createGain(); g.gain.value = strength * (.25 + Math.random() * .75);
    s.connect(f).connect(g).connect(crackBus);
    s.start();
  }

  // speed: 이번 프레임 커서 활동 0..1, burn: 글씨 타는 양 0..1, intro: 첫 화면 보이는 정도 0..1
  function update(speed, burn, intro, dt) {
    if (!on) return;
    act += (speed - act) * .12;
    const t = ac.currentTime;
    hissG.gain.setTargetAtTime(act * .22 * intro, t, .05);
    rumbleG.gain.setTargetAtTime((act * .5 + burn * .6) * intro, t, .12);
    droneG.gain.setTargetAtTime(intro, t, .8);             // 본 화면에서는 바탕 화음 · 쉬익 소리를 끈다
    const rate = (act * 14 + burn * 70) * intro;          // 초당 타닥 횟수
    let p = rate * dt;
    while (p > 0) { if (Math.random() < p) crackle(.35 + burn * .5); p -= 1; }
  }

  function toggle() {
    if (!started) return start();
    on = !on;
    if (on) ac.resume();
    master.gain.setTargetAtTime(on ? .8 : 0, ac.currentTime, .25);
    return on;
  }
  function ensure() { if (!started) start(); return on; }

  /* ═════════ 글리치 / IDM ═════════ */
  const clock = () => started ? ac.currentTime : performance.now() / 1000;
  const live = () => started && seq.mode === 'ac';
  function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // 소리 하나 (예약) + 화면용 기록. low · mid · high = 그 소리가 각 대역에 주는 세기
  function play(type, t, o) {
    const v = o.v;
    if (type === 'kick') events.push({ t, low: v, mid: v * .1, high: 0, s: v, type });
    else if (type === 'burst') events.push({ t, low: 0, mid: v * (o.f < 2000 ? .9 : .35), high: v * (o.f < 2000 ? .3 : .9), s: v * .8, type });
    else if (type === 'click') events.push({ t, low: 0, mid: 0, high: v * .7, s: v * .4, type });
    else if (type === 'metal') events.push({ t, low: 0, mid: v * 2.5, high: v, s: v * 2, type });
    if (!live()) return;
    if (type === 'kick') {
      const os = ac.createOscillator(), g = ac.createGain();
      os.frequency.setValueAtTime(60, t); os.frequency.exponentialRampToValueAtTime(35, t + .12);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + .14);
      os.connect(g).connect(musicG); os.start(t); os.stop(t + .16);
    } else if (type === 'burst') {
      const sr = ac.createBufferSource(); sr.buffer = noiseB;
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = o.f; bp.Q.value = 1 + Math.random() * 5;
      const g = ac.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + o.dur);
      sr.connect(bp).connect(g).connect(o.crush ? crushIn : musicG); sr.start(t, Math.random() * .9); sr.stop(t + o.dur + .01);
    } else if (type === 'click') {
      const sr = ac.createBufferSource(); sr.buffer = clickB;
      const g = ac.createGain(); g.gain.value = v;
      sr.connect(g).connect(crushIn); sr.start(t);
    } else if (type === 'metal') {
      const c = ac.createOscillator(), m = ac.createOscillator(), mg = ac.createGain(), g = ac.createGain();
      c.frequency.value = 900; m.frequency.value = 900 * 1.414; mg.gain.value = 700;
      m.connect(mg).connect(c.frequency);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .003); g.gain.exponentialRampToValueAtTime(.0001, t + .28);
      c.connect(g).connect(musicG); c.start(t); m.start(t); c.stop(t + .3); m.stop(t + .3);
    }
  }
  // 16분음표 한 칸. 패턴은 마디마다 확률로 (고정 시드 + 약간의 랜덤), 마디가 지날수록 밀도가 오른다
  function step(i, t) {
    const st = 60 / M.bpm / 4, bar = Math.floor(i / 16), s = i % 16, e = energy;
    if (s === 0) barRng = mulberry(7 + (bar % 8) * 131);
    const r = () => barRng() * .8 + Math.random() * .2;
    const dens = (M.density[0] + (M.density[1] - M.density[0]) * e) * Math.min(1.6, 1 + bar * .02);
    // 서브 킥: "쿵-쿵, 쉼" 심장박동. 커서가 움직이지 않으면 (energy 거의 0) 울리지 않는다
    const hb = e < .06 ? 0 : s === 0 ? 1 : s === 3 ? .75 : (e > .25 && s === 8) ? .9 : (e > .25 && s === 11) ? .65 : (e > .7 && r() < .18) ? .7 : 0;
    if (hb) play('kick', t, { v: Math.min(1, e * 1.4) * hb });
    // 글리치 파열음: 5~40ms 노이즈, 대역 중심 800~9000Hz
    if (r() < dens * e * (s % 2 ? 1 : .6))
      play('burst', t + (r() < .3 ? st * .5 : 0), { dur: .005 + r() * .035, f: 800 + r() * 8200, v: .22 + .5 * e, crush: e > .7 && r() < .5 });
    // 스터터: 한 칸을 1/32 · 1/64 로 잘게
    if (e > .6 && r() < .07 * e) {
      const n = 4 + ((r() * 5) | 0), f = 800 + r() * 8200;
      for (let k = 0; k < n; k++) play('burst', t + k * st / n, { dur: st / n * .7, f, v: .3, crush: true });
    }
    // 1샘플 디지털 클릭 (비트크러시를 지나)
    if (r() < dens * e * .5) play('click', t + r() * st, { v: .25 + .4 * e });
    // 낮은 금속성 '띵'
    if (r() < .035 * (e + .1)) play('metal', t, { v: .1 + .15 * e });
  }
  // 둥: 낮은 사인 (살짝 위에서 떨어지며) + 작은 스피커에서도 들리게 한 옥타브 위 세모파, 낮은 통과 필터
  function thump(t, f, v) {
    events.push({ t, low: v, mid: v * .15, high: 0, s: v, type: 'bass' });
    if (!started) return;
    const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), g2 = ac.createGain(), lp = ac.createBiquadFilter();
    o.type = 'sine'; o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + .05);
    o2.type = 'triangle'; o2.frequency.setValueAtTime(f * 3.2, t); o2.frequency.exponentialRampToValueAtTime(f * 2, t + .05);
    g2.gain.value = .35;
    lp.type = 'lowpass'; lp.frequency.value = 420;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .006); g.gain.exponentialRampToValueAtTime(.0001, t + .45);
    o.connect(g); o2.connect(g2).connect(g); g.connect(lp).connect(bassG);
    o.start(t); o2.start(t); o.stop(t + .5); o2.stop(t + .5);
  }
  // 매 프레임: 앞으로 0.12s 안을 미리 예약 (글리치 칸 · 베이스 둥)
  function tick() {
    if (musicT <= 0 && !hum.hz && !events.length) return;
    const mode = started ? 'ac' : 'perf', now = clock();
    if (mode !== seq.mode) { events = []; seq.mode = mode; seq.next = now + .03; if (hum.hz) hum.next = now + .02; }
    if (seq.next < now - .5) seq.next = now + .03;
    const st = 60 / M.bpm / 4;
    if (musicT > 0) while (seq.next < now + .12) { step(seq.step++, seq.next); seq.next += st; }
    if (hum.hz) {
      if (hum.next < now - .5) hum.next = now + .02;
      while (hum.next < now + .12) {
        thump(hum.next, hum.hz, hum.i % 3 === 0 ? .95 : .75);
        hum.i++;
        hum.next += hum.i % 3 === 0 ? HUM.long : HUM.short;
      }
    }
  }
  // 섹션 위 베이스: hz (0 = 멈춤). 들어오면 바로 첫 '둥'
  function humAt(hz) {
    if (hz === hum.hz) return;
    hum.hz = hz;
    if (hz) { hum.next = clock() + .02; hum.i = 0; }
  }
  // 지금 소리의 대역 세기 (0..1) 와 이번 프레임에 울린 박
  function levels() {
    tick();
    const now = clock(), beats = [];
    let low = 0, mid = 0, high = 0;
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i], d = now - ev.t;
      if (d < 0) continue;
      if (d > 1.2) { events.splice(i, 1); continue; }
      if (!ev.fired) { ev.fired = true; if (ev.s > .12) beats.push(ev); }
      low += ev.low * Math.exp(-d / .14); mid += ev.mid * Math.exp(-d / .09); high += ev.high * Math.exp(-d / .05);
    }
    let L = { low: Math.min(1, low), mid: Math.min(1, mid), high: Math.min(1, high) };
    // 실제로 들리고 있으면 분석기 값으로 (20~150 · 150~2k · 2k~12kHz)
    if (started && on && (musicT > 0 || hum.hz) && analyser) {
      analyser.getByteFrequencyData(fdata);
      const hz = ac.sampleRate / analyser.fftSize;
      const band = (a, b) => { let sm = 0, c = 0; for (let i = Math.max(1, Math.floor(a / hz)); i <= Math.min(fdata.length - 1, Math.ceil(b / hz)); i++) { sm += fdata[i]; c++; } return c ? sm / c / 255 : 0; };
      const norm = v => Math.min(1, Math.max(0, (v - .2) / .5));
      L = { low: Math.max(norm(band(20, 150)), L.low * .5), mid: Math.max(norm(band(150, 2000)), L.mid * .5), high: Math.max(norm(band(2000, 12000)), L.high * .5) };
    }
    L.beats = beats;
    return L;
  }
  // level: 음악 크기 목표 (0 = 멈춤), fade: 바뀌는 시간 (s)
  function music(level, fade = .4) {
    if (level === musicT) return;
    if (level > 0 && musicT <= 0) seq.next = 0;
    musicT = level;
    if (musicG) musicG.gain.setTargetAtTime(level * .9, ac.currentTime, Math.max(.02, fade / 3));
  }
  const setEnergy = e => { energy = Math.max(0, Math.min(1, e)); };
  // 넘어가기 직전: 킥 한 번 + 0.3s 스터터
  // 넘어가기 직전: 깊은 '둥' 한 번
  function hit(hz = 44) {
    thump(clock() + .01, hz, 1);
  }
  const config = m => Object.assign(M, m);

  return { toggle, ensure, update, music, setEnergy, levels, hit, config, hum: humAt, get on() { return on; } };
})();
