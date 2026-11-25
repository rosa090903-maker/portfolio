/* ─────────────────────────────────────────────
   흰 점으로 된 3D 신경망 (WebGL gl.POINTS, 라이브러리 없음 · file:// 에서 동작)
   · 점 위치는 처음 한 번만 GPU 버퍼에 올린다 (main.js buildNeural 이 만든다)
   · 자라기(uGrow) · 반짝임 · 신호 펄스 · 시냅스 점멸은 전부 셰이더에서 uniform 으로
   · 투영은 main.js 의 proj() 와 같은 핀홀 식 → 바닥 그림자·라벨과 어긋나지 않는다
   점마다 속성 15개: xyz, 크기, 밝기, 위상(0..1), 종류, born(경로 거리 0..1), branch(뿌리 번호), 출발점 xyz, 색 rgb
   종류: 0 가지·뿌리 · 1 분기점(시냅스) · 2 누를 수 있는 끝(작업·키워드) · 3 먼지·땅 · 4 다음 작업(깜빡임)
         · 5 떠오르는 점 (y = 시작 위상, 셰이더가 뿌리 아래 → 가지 위로 올린다)
   화학작용: uRx[6] = (줄기 번호 | -1 = 전체, 닿은 자리 born, 지난 시간 s, 켜짐) → 닿은 자리에서 앞뒤로 번지는 반응
   나무 색 = 프리즘: 하양 · 파랑 중심. 가지를 따라 보라~시안이 돌고, 보는 각도·시간에 따라 미끄러진다.
     밝게 빛나는 점은 흰 빛, 어두운 점은 깊은 파랑, 드물게 빨강·노랑 무지개 알갱이 (uPrism). 바닥 그림일 때는 aCol (흰색)
   바닥 그림 → 나무 (morph): 점마다 바닥 위 출발점 aO 와 색 aCol
     uMorphT < 0 이면 모든 점이 바닥에 깔린 그림(사각 타일, 불투명). 닿은 뒤엔 닿은 자리에서 먼 순서로 떠올라
     소용돌이치며 솟구친 다음 나무 자리로 모이고, 다 모이면 원래처럼 겹치면 밝아지는 빛 점이 된다
   (이전 점 나무 버전은 dots.before-neural.js, 카메라 전 버전은 dots.before-camera.js)
   ───────────────────────────────────────────── */
const Dots = (() => {
  const STRIDE = 15;
  let cv, gl, prog, buf, U = {}, A = {}, n = 0, ok = false;

  const VS = `
precision highp float;
attribute vec3 aPos;
attribute vec4 aA;                    // size, bright, phase, kind
attribute vec2 aB;                    // born, branch
attribute vec3 aO;                    // 바닥 위 출발점 (오프닝 그림 속 자리)
attribute vec3 aCol;                  // 오프닝 그림의 그 자리 색
uniform float uMorphT, uWave, uMorphDur, uBornLag, uSwirl, uRiseH, uNoise, uFloorS;
uniform vec4 uPrism;                  // spread, view, speed, sparkle
uniform vec3 uPrism2;                 // white, deep, warm
uniform vec3 uC;                      // 카메라 위치
uniform vec4 uRot;                    // cos/sin pitch, cos/sin yaw
uniform vec4 uScr;                    // F, PX, PY, 기준 깊이
uniform vec2 uRes;
uniform float uDpr, uGrow, uTime, uMotion, uAlpha;
uniform float uPulseSpeed, uPulseW, uHoverB, uHoverA;
uniform float uRise, uRiseR;
uniform vec2 uRiseY;                  // 떠오르는 점의 아래·위 (뿌리 끝 ~ 가지 끝)
uniform vec4 uRx[6];
uniform float uRxSpeed, uRxLife;
varying float vA;
varying float vWork;
varying float vTint;
varying vec3 vCol;
varying float vE;

float h1(float x){ return fract(sin(x * 12.9898) * 43758.5453); }
// 프리즘 스펙트럼 (0..1 → 빨 · 주황 · 노랑 · 초록 · 시안 · 파랑 · 보라)
vec3 spectrum(float h){
  vec3 c = .5 + .5 * cos(6.2832 * (h + vec3(0., .33, .67)));
  return pow(c, vec3(1.6));
}

void main(){
  float size = aA.x, bright = aA.y, ph = aA.z, kind = aA.w;
  float born = aB.x, br = aB.y;

  bool mote = kind > 4.5 && kind < 5.5;
  vec3 pos = aPos;
  float moteA = 1.;
  if (mote) {                          // 뿌리 아래에서 가지 위로 천천히 떠오른다 (닿은 직후엔 줄기 가까이 모여 솟구친다)
    float f = fract(aPos.y + uRise * (.6 + .8 * fract(ph * 5.3)));
    pos.y = mix(uRiseY.x, uRiseY.y, f);
    pos.xz *= mix(.15, 1., uRiseR) * (1. - .45 * f);
    moteA = sin(3.1416 * f);
  }
  // 그림 → 나무: 닿은 자리에서 먼 순서로(물결) 떠올라, 소용돌이치며 솟구쳤다가 나무 자리로
  float rnd = fract(ph * 91.7);
  float delay = length(aO.xz) / uWave + born * uBornLag + rnd * .35;
  float m = clamp((uMorphT - delay) / (uMorphDur * (.7 + .6 * fract(ph * 37.1))), 0., 1.);
  float e = m * m * (3. - 2. * m);
  float fly = sin(3.1416 * e);
  // 먼저 제자리에서 위로 솟구치고(불꽃·물감 기둥처럼), 옆으로는 늦게 나무 쪽으로 모인다
  float eh = smoothstep(.3, 1., m);
  vec3 q = vec3(mix(aO.x, pos.x, eh), mix(aO.y, pos.y, e), mix(aO.z, pos.z, eh));
  float ang = uSwirl * fly * (.5 + rnd) * (fract(ph * 3.3) < .5 ? 1. : -1.) / (1. + length(q.xz) * .08);
  float ca = cos(ang), sa = sin(ang);
  q.xz = vec2(q.x * ca - q.z * sa, q.x * sa + q.z * ca);
  q.y += uRiseH * sin(3.1416 * min(1., m * 1.4)) * (.3 + 1.4 * fract(ph * 17.9));
  float nt = max(uMorphT, 0.) * 1.6;
  q += uNoise * fly * vec3(sin(q.y * 2.1 + nt + ph * 40.), sin(q.x * 1.7 + nt * .8 + ph * 20.), cos(q.z * 2.3 + nt * 1.1 + ph * 30.));
  pos = q;
  // proj() 와 같은 투영
  vec3 v = pos - uC;
  float xr = v.x * uRot.z - v.z * uRot.w, zr = v.x * uRot.w + v.z * uRot.z;
  float d = -v.y * uRot.y + zr * uRot.x;
  float vert = v.y * uRot.x + zr * uRot.y;
  if (d < .08) { gl_Position = vec4(2., 2., 2., 1.); gl_PointSize = 0.; vA = 0.; return; }
  vec2 s = vec2(uScr.y + uScr.x * xr / d, uScr.z - uScr.x * vert / d);
  gl_Position = vec4(s.x / uRes.x * 2. - 1., 1. - s.y / uRes.y * 2., 0., 1.);

  bool dust = (kind > 2.5 && kind < 3.5) || mote;
  // 자라기: 경로 거리(born)가 uGrow 보다 작으면 켜진다. 자라는 끝은 잠깐 더 밝게
  float vis = dust ? clamp(uGrow * 3., 0., 1.) : clamp((uGrow - born) / .012, 0., 1.);
  float front = dust ? 0. : exp(-pow((uGrow - born) / .025, 2.)) * step(uGrow, 1.0);

  // ① 개별 반짝임: 점마다 다른 주기(1.5~5s), 10% 는 가끔 별처럼 번쩍
  float per = 1.5 + 3.5 * fract(ph * 7.31);
  float tw = .35 + .65 * (.5 + .5 * sin(uTime * 6.2832 / per + ph * 6.2832));
  if (fract(ph * 13.7) < .1) tw += 2.2 * pow(max(0., sin(uTime * .9 + ph * 80.)), 60.);

  // ② 신호 펄스: 뿌리에서 가지 끝으로 흐르는 빛 덩어리 (뿌리마다 다른 때에 출발)
  float p = 0.;
  if (!dust) {
    for (int j = 0; j < 6; j++) {
      float fj = float(j);
      float sp = uPulseSpeed * (.7 + .6 * h1(fj * 3.1 + 1.));
      float cyc = uTime * sp + h1(fj * 7.7 + 2.);
      float k = floor(cyc);
      float x = fract(cyc) * 1.25 - .1;
      float on = step(.62, h1(br * 12.9 + k * 3.7 + fj * 1.37));
      p += on * exp(-pow((born - x) / uPulseW, 2.));
    }
    // hover: 그 가지로 펄스가 연달아 흐른다
    if (abs(br - uHoverB) < .5) p += uHoverA * (.35 + exp(-pow((fract(born * 3. - uTime * 1.4) - .5) / .07, 2.)));
  }
  // ③ 시냅스(분기점)는 펄스가 지날 때 크게 번쩍
  float syn = (kind > .5 && kind < 1.5) ? 1. : 0.;
  float work = (kind > 1.5 && kind < 2.5) ? 1. : 0.;
  float soon = kind > 3.5 ? 1. : 0.;
  if (uMotion < .5) { tw = .8; p = 0.; }
  if (work > .5) tw = 1. + .25 * sin(uTime * 1.6 + ph * 6.28) * uMotion;
  if (soon > .5) tw = .45 + .55 * (.5 + .5 * sin(uTime * 2.2 + ph * 6.28)) * uMotion;

  // ④ 화학작용: 닿은 자리에서 앞뒤로 번지는 반응 앞머리 + 지나간 자리에 잠깐 남는 포인트 컬러
  float rx = 0., tint = 0.;
  if (!dust) {
    for (int j = 0; j < 6; j++) {
      vec4 r = uRx[j];
      if (r.w < .5) continue;
      if (r.x > -.5 && abs(br - r.x) > .5) continue;
      float dist = abs(born - r.y), fr = r.z * uRxSpeed;
      float fade = 1. - smoothstep(uRxLife * .4, uRxLife, r.z);
      rx += exp(-pow((dist - fr) / .02, 2.)) * fade * (r.x < -.5 ? .8 : 1.2);
      tint = max(tint, (1. - smoothstep(fr - .08, fr + .005, dist)) * fade * .85);
    }
  }
  float b = bright * tw * (1. + p * (2.2 + syn * 4.)) + front * 1.6 + rx * 2.2 + tint * .35;
  b *= vis;
  b *= mix(1., .35, smoothstep(uScr.w * .9, uScr.w * 2.2, d));     // 멀수록 흐리게
  float near = clamp(uScr.w / d, .45, work > .5 ? 1.25 : 2.4);   // 작업 점은 가까워도 너무 커지지 않게
  float treePx = max(1., size * uDpr * near * (1. + p * (.5 + syn * 1.2) + rx * 1.1));
  float floorPx = clamp(uScr.x * uFloorS / d, 1., m > 0. ? 9. : 90.) * uDpr;     // 바닥 그림의 타일 한 칸 (떠오르면 작게)
  gl_PointSize = mix(floorPx, treePx, smoothstep(0., .2, m));
  vA = mix(1., b * uAlpha * moteA, e);
  vWork = work;
  vTint = clamp(tint + rx * .6, 0., 1.);
  // 색: 바닥에선 aCol → 나무에선 프리즘
  float hue = born * uPrism.x + br * .137 + (s.x / uRes.x - .5) * uPrism.y + uTime * uPrism.z + (ph - .5) * uPrism.w;
  // 대부분은 보라 · 파랑 · 시안 사이에서만 돌고, 일부(warm) 점만 빨강·노랑까지 도는 무지개
  float bh = .36 + .17 * sin(6.2832 * hue);
  vec3 spec = spectrum(fract(ph * 7.31) < uPrism2.z ? hue : bh);
  spec = mix(spec, vec3(1.), .22);                                  // 살짝 빛이 섞인 맑은 색
  vec3 copper = vec3(.12, .28, 1.);                                 // 어두운 점 = 깊은 파랑
  float lum = bright * tw * (1. + p * 2.) + rx * 1.5 + front;   // 빛을 많이 받는 점일수록
  // 어두운 점 = 구릿빛 · 빛을 받으면 무지개로 갈라지고 · 가장 밝은 곳은 흰 빛
  vec3 tree = mix(copper * .75, spec, smoothstep(uPrism2.y, uPrism2.y + .35, lum));
  tree = mix(tree, vec3(1.), smoothstep(uPrism2.x * .7, uPrism2.x * 1.6, lum));
  vCol = mix(aCol, tree, smoothstep(.1, .7, e));
  vE = e;
}`;

  const FS = `
precision mediump float;
varying float vA;
varying float vWork;
varying float vTint;
varying vec3 vCol;
varying float vE;
uniform vec3 uAccent;                  // 포인트 컬러 (작업 점 = 누를 수 있는 곳)
void main(){
  vec2 c = gl_PointCoord * 2. - 1.;
  float soft = 1. - smoothstep(.1, 1., dot(c, c));                       // 가장자리가 부드러운 원 (나무)
  float tile = 1. - smoothstep(.86, 1., max(abs(c.x), abs(c.y)));       // 빈틈 없는 사각 타일 (바닥 그림)
  float a = mix(tile, soft, smoothstep(0., .08, vE)) * vA;
  vec3 col = mix(vCol, uAccent, max(vWork, vTint * .8) * vE);            // 오프닝 그림의 색 · 작업 점은 포인트 컬러
  // 바닥에선 덮어 그리고(불투명), 나무가 되면 겹칠수록 밝아진다
  gl_FragColor = vec4(col * a, min(a, 1.) * (1. - vE));
}`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function init(canvas) {
    cv = canvas;
    gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) return false;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
    } catch (e) { console.warn(e); return false; }
    ['aPos', 'aA', 'aB', 'aO', 'aCol'].forEach(k => A[k] = gl.getAttribLocation(prog, k));
    ['uC', 'uRot', 'uScr', 'uRes', 'uDpr', 'uGrow', 'uTime', 'uMotion', 'uAlpha', 'uPulseSpeed', 'uPulseW', 'uHoverB', 'uHoverA', 'uAccent', 'uRise', 'uRiseR', 'uRiseY', 'uRxSpeed', 'uRxLife',
      'uMorphT', 'uWave', 'uMorphDur', 'uBornLag', 'uSwirl', 'uRiseH', 'uNoise', 'uFloorS', 'uPrism', 'uPrism2']
      .forEach(k => U[k] = gl.getUniformLocation(prog, k));
    U.uRx = gl.getUniformLocation(prog, 'uRx');
    buf = gl.createBuffer();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);          // 알파 0 = 겹치면 밝아짐, 알파 1 = 덮어 그림 (셰이더가 정한다)
    gl.disable(gl.DEPTH_TEST);
    ok = true;
    return true;
  }

  function setPoints(data) {
    if (!ok) return;
    n = data.length / STRIDE;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const F = 4;
    gl.enableVertexAttribArray(A.aPos); gl.vertexAttribPointer(A.aPos, 3, gl.FLOAT, false, STRIDE * F, 0);
    gl.enableVertexAttribArray(A.aA);   gl.vertexAttribPointer(A.aA, 4, gl.FLOAT, false, STRIDE * F, 3 * F);
    gl.enableVertexAttribArray(A.aB);   gl.vertexAttribPointer(A.aB, 2, gl.FLOAT, false, STRIDE * F, 7 * F);
    gl.enableVertexAttribArray(A.aO);   gl.vertexAttribPointer(A.aO, 3, gl.FLOAT, false, STRIDE * F, 9 * F);
    gl.enableVertexAttribArray(A.aCol); gl.vertexAttribPointer(A.aCol, 3, gl.FLOAT, false, STRIDE * F, 12 * F);
  }

  function resize(w, h, dpr) {
    if (!ok) return;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    gl.viewport(0, 0, cv.width, cv.height);
  }

  function clear() {
    if (!ok) return;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  // u: { C:[x,y,z], rot:[cth,sth,cps,sps], scr:[F,PX,PY,refDepth], res:[W,H], dpr, grow, time, motion, alpha, pulseSpeed, pulseW, hoverB, hoverA }
  function render(u) {
    if (!ok) return;
    clear();
    if (u.alpha <= 0 || !n) return;
    gl.uniform3fv(U.uC, u.C);
    gl.uniform4fv(U.uRot, u.rot);
    gl.uniform4fv(U.uScr, u.scr);
    gl.uniform2fv(U.uRes, u.res);
    gl.uniform1f(U.uDpr, u.dpr);
    gl.uniform1f(U.uGrow, u.grow);
    gl.uniform1f(U.uTime, u.time);
    gl.uniform1f(U.uMotion, u.motion);
    gl.uniform1f(U.uAlpha, u.alpha);
    gl.uniform1f(U.uPulseSpeed, u.pulseSpeed);
    gl.uniform1f(U.uPulseW, u.pulseW);
    gl.uniform1f(U.uHoverB, u.hoverB);
    gl.uniform1f(U.uHoverA, u.hoverA);
    gl.uniform3fv(U.uAccent, u.accent || [1, .37, .66]);
    gl.uniform1f(U.uRise, u.rise || 0);
    gl.uniform1f(U.uRiseR, u.riseR == null ? 1 : u.riseR);
    gl.uniform2fv(U.uRiseY, u.riseY || [-2, 2]);
    gl.uniform4fv(U.uRx, u.react || new Float32Array(24));
    gl.uniform1f(U.uRxSpeed, u.rxSpeed || .3);
    gl.uniform1f(U.uRxLife, u.rxLife || 5);
    const M = u.morph || {};
    gl.uniform1f(U.uMorphT, u.morphT == null ? 99 : u.morphT);
    gl.uniform1f(U.uWave, M.wave || 9);
    gl.uniform1f(U.uMorphDur, M.dur || 2.6);
    gl.uniform1f(U.uBornLag, M.bornLag || 0);
    gl.uniform1f(U.uSwirl, M.swirl || 0);
    gl.uniform1f(U.uRiseH, M.rise || 0);
    gl.uniform1f(U.uNoise, M.noise || 0);
    gl.uniform1f(U.uFloorS, u.floorS || .1);
    const P = u.prism || {};
    gl.uniform4f(U.uPrism, P.spread ?? 2.2, P.view ?? .7, P.speed ?? .04, P.sparkle ?? .3);
    gl.uniform3f(U.uPrism2, P.white ?? .75, P.deep ?? .4, P.warm ?? .06);
    gl.drawArrays(gl.POINTS, 0, n);
  }

  return { init, setPoints, resize, render, clear, STRIDE, get ok() { return ok; } };
})();
