/* ─────────────────────────────────────────────
   흰 점으로 된 3D 신경망 (WebGL gl.POINTS, 라이브러리 없음 · file:// 에서 동작)
   · 점 위치는 처음 한 번만 GPU 버퍼에 올린다 (main.js buildNeural 이 만든다)
   · 자라기(uGrow) · 반짝임 · 신호 펄스 · 시냅스 점멸은 전부 셰이더에서 uniform 으로
   · 투영은 main.js 의 proj() 와 같은 핀홀 식 → 바닥 그림자·라벨과 어긋나지 않는다
   점마다 속성 15개: xyz, 크기, 밝기, 위상(0..1), 종류, born(경로 거리 0..1), branch(뿌리 번호), 출발점 xyz, 색 rgb
   종류: 0 가지·뿌리 · 1 분기점(시냅스) · 2 누를 수 있는 끝(작업·키워드) · 3 먼지·땅 · 4 다음 작업(깜빡임)
         · 5 떠오르는 점 (y = 시작 위상, 셰이더가 뿌리 아래 → 가지 위로 올린다)
   화학작용: uRx[6] = (줄기 번호 | -1 = 전체, 닿은 자리 born, 지난 시간 s, 켜짐) → 닿은 자리에서 앞뒤로 번지는 반응
   나무 색 = 흰색 (작업 점·반응만 포인트 컬러). (프리즘 버전은 dots.before-white.js)
   바닥 그림 → 나무 (morph): 점마다 바닥 위 출발점 aO 와 색 aCol
     uMorphT < 0 이면 모든 점이 바닥에 깔린 그림(사각 타일, 불투명). 닿은 뒤엔 닿은 자리에서 먼 순서로 떠올라
     소용돌이치며 솟구친 다음 나무 자리로 모이고, 다 모이면 원래처럼 겹치면 밝아지는 빛 점이 된다
   (이전 점 나무 버전은 dots.before-neural.js, 카메라 전 버전은 dots.before-camera.js)
   '선' 모드 (main.js MAIN_MODE = 'line'): 같은 캔버스 · 같은 투영으로
     · 고리 (RING_VS) — line.js 의 buildRing 점. 소리에 맞춰 uLow 박동 · uMid 가시 길이 · uHigh 떨림
     · 잉크 실 다발 (INK_VS, gl.LINES) — line.js 의 Ink.write 가 매 프레임 채운 선분
     둘 다 알파 0 으로 내보내 겹칠수록 밝아진다 (renderLine)
   ───────────────────────────────────────────── */
const Dots = (() => {
  const STRIDE = 15;
  let cv, gl, prog, buf, U = {}, A = {}, n = 0, ok = false;
  // '선' 모드: 고리 · 잉크 실
  let rProg, rBuf, rU = {}, rA = {}, rN = 0, iProg, iBuf, iU = {}, iA = {};

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
  vec3 tree = vec3(.95, .965, 1.);                                // 흰색 (아주 약간 푸른)
  vCol = mix(aCol, tree, smoothstep(.1, .7, e));
  vE = e;
}`;

  // proj() 와 같은 투영 (pos → gl_Position, d = 깊이). 뒤쪽이면 화면 밖으로
  const PROJ = `
  vec3 v = pos - uC;
  float xr = v.x * uRot.z - v.z * uRot.w, zr = v.x * uRot.w + v.z * uRot.z;
  float d = -v.y * uRot.y + zr * uRot.x;
  float vert = v.y * uRot.x + zr * uRot.y;
  if (d < .08) { gl_Position = vec4(2., 2., 2., 1.); gl_PointSize = 0.; vA = 0.; return; }
  vec2 s = vec2(uScr.y + uScr.x * xr / d, uScr.z - uScr.x * vert / d);
  gl_Position = vec4(s.x / uRes.x * 2. - 1., 1. - s.y / uRes.y * 2., 0., 1.);`;

  /* 고리: 옆에서 보면 세로 선, 돌리면 원. 소리 → uLow 부풂 · uMid 가시 (커서와 가까운 각도 uBeatAng 둘레로) · uHigh 지직 */
  const RING_VS = `
precision highp float;
attribute vec4 aR;                    // θ, off, side, kind
attribute vec4 aS;                    // size, bright, seed, born
attribute vec3 aD;                    // 가시: 길이 · 가로 방향 / 먼지: 자리
uniform vec3 uC; uniform vec4 uRot; uniform vec4 uScr; uniform vec2 uRes;
uniform float uDpr, uGrow, uTime, uR, uLow, uMid, uHigh, uBeatAng, uBeatW, uAlpha, uPulse;
uniform vec4 uWave[8];                // 파동: 생긴 각도 · 지난 시간 (s) · 세기 · 방향 (±1)
uniform float uWaveY[8];              // 파동이 생긴 자리의 화면 높이 (px) — 선일 때는 높이로 잰다
uniform vec4 uPull;                   // 커서 쪽으로 휨: 각도 · 양 (월드) · 폭 (rad) · 화면 높이 (px)
uniform vec3 uSX;                     // 화면 가로 방향 (월드)
uniform float uEdge, uWaveC, uWaveK;  // 옆에서 보는 정도 (1 = 선) · 파동 속도 (rad/s) · 촘촘함
uniform float uThorn;                 // 가시가 자라 나온 정도 (커서가 가까울 때 0 → 1)
uniform vec4 uHum[2];                 // 섹션 아래 파동: 각도 · 화면 x (px) · 세기 (월드) · -
uniform float uHumW, uHumK, uHumSpeed; // 파동의 폭 · 촘촘함 · 흐르는 빠르기
varying float vA;
float h1(float x){ return fract(sin(x * 12.9898) * 43758.5453); }
// 고리 위 두 각도의 거리
float adist(float th, float a){ return abs(mod(th - a + 3.14159, 6.28318) - 3.14159); }
// 점의 화면 높이 (px). 옆에서 보면 앞 · 뒤 절반이 원근 때문에 같은 각도라도 높이가 달라서, 선일 때는 높이로 잰다
float screenX(vec3 p){
  vec3 v = p - uC;
  float xr = v.x * uRot.z - v.z * uRot.w, zr = v.x * uRot.w + v.z * uRot.z, d = -v.y * uRot.y + zr * uRot.x;
  return uScr.y + uScr.x * xr / max(d, .1);
}
float screenY(vec3 p){
  vec3 v = p - uC;
  float zr = v.x * uRot.w + v.z * uRot.z, d = -v.y * uRot.y + zr * uRot.x, vert = v.y * uRot.x + zr * uRot.y;
  return uScr.z - uScr.x * vert / max(d, .1);
}
// 선의 파동: 커서가 올라간 섹션 아래에서만, 소리처럼 출렁인다. 선일 때는 화면 세로로, 원일 때는 바깥쪽으로
vec3 wave(float th, vec3 rad){
  vec3 dir = normalize(mix(rad, vec3(0., 1., 0.), uEdge));
  float e = smoothstep(.5, .95, uEdge);
  float sx = screenX(rad * uR), hs = uScr.x * uR / uScr.w;          // 이 점의 화면 x · 고리 반지름 (px)
  float off = 0.;
  for (int j = 0; j < 2; j++) {
    vec4 h = uHum[j];
    if (h.z <= 0.) continue;
    float s = mix(mod(th - h.x + 3.14159, 6.28318) - 3.14159, (sx - h.y) / hs, e);
    off += h.z * exp(-s * s / (uHumW * uHumW)) * sin(s * uHumK - uTime * uHumSpeed);
  }
  // 원근: 앞 · 뒤 절반이 화면에서 같은 만큼 움직이도록 (선일 때)
  vec3 v = rad * uR - uC;
  float zr = v.x * uRot.w + v.z * uRot.z, dd = -v.y * uRot.y + zr * uRot.x;
  off *= mix(1., max(.2, dd) / uScr.w, uEdge);
  return dir * off;
}
void main(){
  float th = aR.x, kind = aR.w, sd = aS.z;
  float R = uR * (1. + uPulse);                 // 줄기는 소리에 부풀지 않는다 (가만히)
  vec3 rad = vec3(sin(th), 0., cos(th));        // 누운 고리 (x-z 평면)
  float dA = abs(mod(th - uBeatAng + 3.14159, 6.28318) - 3.14159);
  float near = exp(-pow(dA / (uBeatW * 3.14159), 2.));
  vec3 pos; float b = aS.y;
  if (kind < .5) {                     // 몸통
    pos = rad * (R + aR.y) + vec3(0., aR.z, 0.) + wave(th, rad);
  } else if (kind < 1.5) {             // 잔털: 짧게, 가만히
    float len = aD.x * .3;
    vec3 dir = normalize(rad * .55 + vec3(0., aD.y, 0.));
    pos = rad * R + dir * aR.y * len + wave(th, rad);
    b *= (1. - aR.y * .5) * .5;
  } else if (kind < 2.5) {             // 먼지
    pos = aD;
  } else {                             // 가시: 커서와 가까운 자리의 가시만 줄기에서 바깥으로 자라 나온다
    pos = aD;
    float e = smoothstep(.5, .95, uEdge), hs = uScr.x * uR / uScr.w;
    float dd = mix(adist(th, uPull.x), abs(screenY(rad * uR) - uPull.w) / hs, e);
    float reach = uThorn * exp(-dd * dd / .16) * 1.2;          // 가까울수록 끝까지
    b *= smoothstep(aR.y, aR.y + .08, reach);
  }
  ${PROJ}
  float vis = clamp((uGrow - aS.w) / .03, 0., 1.);
  gl_PointSize = max(1., aS.x * uDpr * clamp(uScr.w / d, .6, 1.8));
  vA = b * vis * uAlpha;
}`;
  const RING_FS = `
precision mediump float;
varying float vA;
void main(){
  vec2 c = gl_PointCoord * 2. - 1.;
  float a = (1. - smoothstep(.1, 1., dot(c, c))) * vA;
  gl_FragColor = vec4(vec3(.95, .965, 1.) * a, 0.);   // 알파 0 = 겹치면 밝아진다
}`;
  /* 잉크 실: 가는 선분, 꼬리로 갈수록 투명 */
  const INK_VS = `
precision highp float;
attribute vec3 aPos;
attribute float aA;
uniform vec3 uC; uniform vec4 uRot; uniform vec4 uScr; uniform vec2 uRes;
uniform float uAlpha;
varying float vA;
void main(){
  vec3 pos = aPos;
  ${PROJ}
  vA = aA * uAlpha;
}`;
  const INK_FS = `
precision mediump float;
varying float vA;
void main(){ gl_FragColor = vec4(vec3(.96, .97, 1.) * vA, 0.); }`;

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

  function link(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  // 프로그램마다 쓰는 속성만 켠다 (A: {이름: 위치}, spec: [[이름, 개수, 시작]], stride: float 수)
  function attrs(a, spec, stride) {
    for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
    for (const [k, size, off] of spec) {
      if (a[k] < 0) continue;
      gl.enableVertexAttribArray(a[k]);
      gl.vertexAttribPointer(a[k], size, gl.FLOAT, false, stride * 4, off * 4);
    }
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
    try {
      rProg = link(RING_VS, RING_FS);
      ['aR', 'aS', 'aD'].forEach(k => rA[k] = gl.getAttribLocation(rProg, k));
      ['uC', 'uRot', 'uScr', 'uRes', 'uDpr', 'uGrow', 'uTime', 'uR', 'uLow', 'uMid', 'uHigh', 'uBeatAng', 'uBeatW', 'uAlpha', 'uPulse', 'uWave', 'uPull', 'uSX', 'uEdge', 'uWaveC', 'uWaveK', 'uWaveY', 'uThorn', 'uHum', 'uHumW', 'uHumK', 'uHumSpeed']
        .forEach(k => rU[k] = gl.getUniformLocation(rProg, k));
      iProg = link(INK_VS, INK_FS);
      ['aPos', 'aA'].forEach(k => iA[k] = gl.getAttribLocation(iProg, k));
      ['uC', 'uRot', 'uScr', 'uRes', 'uAlpha'].forEach(k => iU[k] = gl.getUniformLocation(iProg, k));
      rBuf = gl.createBuffer(); iBuf = gl.createBuffer();
    } catch (e) { console.warn(e); rProg = iProg = null; }
    gl.useProgram(prog);
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
  }
  function bindMain() {
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    attrs(A, [['aPos', 3, 0], ['aA', 4, 3], ['aB', 2, 7], ['aO', 3, 9], ['aCol', 3, 12]], STRIDE);
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
    bindMain();
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

  /* ── '선' 모드 ── */
  function setRing(data) {
    if (!ok || !rProg) return;
    rN = data.length / 11;
    gl.bindBuffer(gl.ARRAY_BUFFER, rBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  }
  // u: { C, rot, scr, res, dpr, grow, time, r, low, mid, high, beatAng, beatW, alpha, pulse, ink: {data, count}, inkAlpha }
  function renderLine(u) {
    if (!ok || !rProg) return;
    clear();
    if (u.alpha <= 0) return;
    const common = (U2) => {
      gl.uniform3fv(U2.uC, u.C); gl.uniform4fv(U2.uRot, u.rot); gl.uniform4fv(U2.uScr, u.scr); gl.uniform2fv(U2.uRes, u.res);
    };
    if (rN) {
      gl.useProgram(rProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, rBuf);
      attrs(rA, [['aR', 4, 0], ['aS', 4, 4], ['aD', 3, 8]], 11);
      common(rU);
      gl.uniform1f(rU.uDpr, u.dpr); gl.uniform1f(rU.uGrow, u.grow); gl.uniform1f(rU.uTime, u.time);
      gl.uniform1f(rU.uR, u.r); gl.uniform1f(rU.uLow, u.low); gl.uniform1f(rU.uMid, u.mid); gl.uniform1f(rU.uHigh, u.high);
      gl.uniform1f(rU.uBeatAng, u.beatAng); gl.uniform1f(rU.uBeatW, u.beatW); gl.uniform1f(rU.uAlpha, u.alpha); gl.uniform1f(rU.uPulse, u.pulse || 0);
      gl.uniform4fv(rU.uWave, u.waves || new Float32Array(32));
      gl.uniform1fv(rU.uWaveY, u.waveY || new Float32Array(8));
      gl.uniform4fv(rU.uPull, u.pull || [0, 0, .3, 0]);
      gl.uniform3fv(rU.uSX, u.sx || [1, 0, 0]);
      gl.uniform1f(rU.uEdge, u.edge == null ? 1 : u.edge);
      gl.uniform1f(rU.uWaveC, u.waveC || 2.4); gl.uniform1f(rU.uWaveK, u.waveK || 14);
      gl.uniform1f(rU.uThorn, u.thorn || 0);
      gl.uniform4fv(rU.uHum, u.hum || new Float32Array(8));
      gl.uniform1f(rU.uHumW, u.humW || .28); gl.uniform1f(rU.uHumK, u.humK || 26); gl.uniform1f(rU.uHumSpeed, u.humSpeed || 9);
      gl.drawArrays(gl.POINTS, 0, rN);
    }
    if (u.ink && u.ink.count) {
      gl.useProgram(iProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, iBuf);
      gl.bufferData(gl.ARRAY_BUFFER, u.ink.data.subarray(0, u.ink.count * 4), gl.DYNAMIC_DRAW);
      attrs(iA, [['aPos', 3, 0], ['aA', 1, 3]], 4);
      common(iU);
      gl.uniform1f(iU.uAlpha, u.inkAlpha == null ? 1 : u.inkAlpha);
      gl.drawArrays(gl.LINES, 0, u.ink.count);
    }
  }

  return { init, setPoints, resize, render, clear, setRing, renderLine, STRIDE, get ok() { return ok; } };
})();
