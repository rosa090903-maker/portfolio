/* ─────────────────────────────────────────────
   소리 — 파일 없이 Web Audio 로 만든다
   · 바탕: 낮고 따뜻한 화음이 천천히 숨 쉰다
   · 커서를 훑으면: 종이가 스치는 쉬익 소리 + 낮은 불꽃 울림
   · 초록 글씨가 타면: 타닥타닥 불씨 튀는 소리
   브라우저 정책상 첫 클릭/키 입력 뒤에만 켜진다.
   ───────────────────────────────────────────── */
const Sound = (() => {
  let ac, master, hissG, rumbleG, droneG, crackBus, crackBufs = [];
  let started = false, on = false;
  let act = 0;

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
    droneG.gain.setTargetAtTime(.35 + .65 * intro, t, .8);
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

  return { toggle, ensure, update, get on() { return on; } };
})();
