/* ─────────────────────────────────────────────
   Kim Yewon — Portfolio
   name   : 흰 화면 아주 멀리에 Kim Yewon 이 흐릿하게 있다. 스크롤을 올리면 이름이 다가오며 선명해지고,
            내리면 다시 멀어진다. 주변엔 작업 키워드 (영어, 커서를 대면 한국어) — 이름과 함께 선명해지다가,
            이름이 화면을 채워 가장자리에 내 정보가 나타나면 물러난다
   gather : 클릭하면 이름이 가운데로 모여 검은 원 (씨앗)
   seed   : 키워드를 누르면 같은 작업의 다른 키워드가 선으로 이어지고, 그 키워드가 씨앗(빨간 원)이 되어 가운데로
            → 나무가 자란 뒤 그 작업의 가지로 바로 간다. 여러 작업에 걸친 키워드는 누르면 더 작은 키워드가 나와 하나를 고른다
   drop   : 흰 화면이 점 타일로 바뀌며 기울어 깊은 바닥이 된다. 원은 높은 곳에서 그 바닥 위로 떨어진다
   spread : 닿은 자리에서 어둠이 번지고, 흰 점 나무가 땅에서 자라난다. 뿌리 = 나에 관한 키워드, 가지 끝 = 작업(결과)
            끝은 점으로만 보이고, 커서를 대면 흰 영어 단어. 그대로 스크롤을 올리면 단어가 다가오며 한국어로 바뀐다
   점 렌더링은 dots.js (WebGL). 카메라 투영은 proj() 하나를 셰이더와 같이 쓴다.
   (이전 잉크 선 버전은 main.before-neural.js, 그 전 버전들도 *.before-*.js 로 남아 있다)
   ───────────────────────────────────────────── */

/* 포인트 컬러 (키 컬러 = 빨강): 누를 수 있는 곳(키워드 · 작업 점과 이름 · 링크 · 커서)에만 쓴다 */
const ACCENT = '#ff3b30';
document.documentElement.style.setProperty('--accent', ACCENT);
const ACCENT_RGB = [1, 3, 5].map(i => parseInt(ACCENT.slice(i, i + 2), 16) / 255);
const INK = '#111';             // 오프닝의 희미한 점 색

/* 나무의 개념 — "경험으로 자라고, 감각으로 전하다"
   뿌리 (땅 아래) = 작업. 직접 해 본 경험이 나를 키운다. weight 가 클수록 굵고 깊다 (가장 보여주고 싶은 작업 = 1)
   가지 (땅 위)   = 감각. 작업에서 길어 올린 키워드가 바깥으로 뻗는다 (끝을 누르면 About) */
const WORKS = [
  { id: 'morph-lab', title: 'morph lab.', ko: '모프랩', en: 'A web lab for graphic experiments with natural phenomena',
    sub: '자연현상으로 그래픽을 실험하는 웹 툴', weight: 1 },
  { id: 'kelp-cmf',  title: 'KELP CMF',   ko: '다시마 CMF', en: 'A kelp cover that reads the state of nature',
    sub: '다시마 커버로 자연의 상태를 읽는 제품', weight: .45 },
];
// 나에 관한 키워드 = 뿌리 (끝을 누르면 About)
const KEYS = [
  { en: 'Change', ko: '변화' },
  { en: 'Sense', ko: '감각' },
  { en: 'Challenge / Experience', ko: '도전 / 경험' },
];
/* 첫 화면 키워드: en = 처음 보이는 말 · ko = 커서를 대면 · works = 이어지는 작업
   kids 가 있으면 (여러 작업에 걸친 말) 누를 때 더 작은 키워드가 나와 하나를 고른다 */
const SEEDS = [
  { en: 'Natural phenomena', ko: '자연현상', works: ['morph-lab'] },
  { en: 'CMF', ko: '색 · 소재 · 마감', works: ['kelp-cmf'] },
  { en: 'Graphic tool', ko: '그래픽 툴', works: ['morph-lab'] },
  { en: 'Experiment', ko: '실험', works: ['kelp-cmf', 'morph-lab'], kids: [
    { en: 'Material experiment', ko: '소재 실험', works: ['kelp-cmf'] },
    { en: 'Graphic experiment', ko: '그래픽 실험', works: ['morph-lab'] },
  ] },
  { en: 'Web tool', ko: '웹 툴', works: ['morph-lab'] },
  { en: 'Natural interaction', ko: '자연물 인터랙션', works: ['morph-lab', 'kelp-cmf'], kids: [
    { en: 'morph lab.', ko: '모프랩', works: ['morph-lab'] },
    { en: 'KELP CMF', ko: '다시마 CMF', works: ['kelp-cmf'] },
  ] },
];
/* 화학작용: 커서가 닿은 뿌리·가지에서 반응이 번져 나간다 (morph lab 의 Lab mode 처럼 닿으면 변한다)
   클릭하면 닿은 자리에서 나무 전체로 연쇄 반응 */
const REACT = {
  speed: .32,        // 반응 앞머리가 번지는 빠르기 (경로 비율 / s)
  life: 5,           // 반응이 남아 있는 시간 (s)
  gap: .7,           // 같은 줄기에 다시 반응이 일어나기까지 (s)
  hit: 16,           // 커서가 줄기에 닿았다고 보는 거리 (px)
};
/* 3D 로 돌려 보기: 드래그 = 회전 · 휠 = 확대 */
const ORBIT = {
  drag: .28,         // 드래그 1px 당 회전 (deg)
  elevMin: -25, elevMax: 60,   // 위아래로 기울일 수 있는 범위 (deg, 음수 = 땅 아래에서 올려다봄)
  inertia: .93,      // 손을 뗀 뒤 미끄러짐 (1 에 가까울수록 오래)
  zoomMin: .55, zoomMax: 1.6,
};

/* ═════════ 값 (여기만 고치면 된다) ═════════ */
/* 이름이 꽃처럼 피어난다: 가운데 글자부터 바깥으로
   (글자 하나가 피는 모양·시간 1.4s, 자간이 모이는 2.8s 는 style.css 의 .ch / .c-name) */
const BLOOM = {
  start: 300,         // Click 뒤 첫 글자(가운데)까지 (ms)
  step: 200,          // 가운데에서 한 칸 멀어질 때마다 늦게 핀다 (ms)
  dur: 1400,          // 글자 하나가 피는 시간 (ms, style.css 와 같게)
  hint: false,        // 이름 아래 'click the name' (끔)
};
const DOT = {
  gather: 1.7,        // 글자가 모여 원이 되는 시간 (s)
  stagger: 80,        // 가장자리 글자부터 순서대로 (ms 간격)
  size: 16,           // 원 지름 (px)
  overshoot: 1.08,    // 마지막에 살짝 부풀었다 돌아옴
  breathe: .04, breatheT: 3,   // 숨 쉬기 (scale 1 ↔ 1.04, 3s)
  hit: 24,            // 원 클릭 반지름 (px)
  hint: false, hintDelay: 1,   // 원 아래 'click' (끔)
};
/* 깊은 공간에서 떨어진다: 원은 화면 가운데(높은 공중)에서 출발해 화면 아래쪽 바닥에 닿는다.
   카메라는 원이 출발한 높이를 바라본 채 멈춰 있고, 원은 멀어지며 작아진다 */
/* 오프닝: 스크롤로 멀리 있는 이름을 당겨 오고, 클릭으로 넘어간다 */
const OPEN = {
  far: .16,           // 처음 이름 크기 (원래 크기의 배수) — 멀리 있다
  fill: .9,           // 다 다가왔을 때 이름이 화면 폭을 채우는 비율
  scroll: 3,          // 이름이 끝까지 다가오는 스크롤 길이 (화면 높이의 배수, 올리면 다가오고 내리면 멀어진다)
  approachLerp: .08,  // 다가오는 부드러움 (작을수록 미끄러지듯)
  infoAt: .55,        // 이만큼 다가오면 가장자리에 내 정보가 나타난다
  gatherT: 1.3,       // 클릭 뒤 이름이 모여 원이 되는 시간 (s)
  stagger: .07,       // 가장자리 글자부터 모이는 간격 (진행 비율)
  pause: .35,         // 원이 된 뒤 떨어지기 전 잠깐 (s)
  seedT: 1.3,         // 키워드가 씨앗이 되어 가운데로 가는 시간 (s)
  particles: 260,     // 주변의 희미한 점
  fly: 1.6,           // 이름이 다가올 때 점들이 스쳐 지나가는 정도
  cursorR: .2,        // 커서 주변 점이 진해지는 반경 (화면 높이 비율)
  cursorBoost: 2.4,   // 커서 주변 점이 진해지는 배수
  focusZoom: .78,     // 키워드로 왔을 때 그 가지 쪽으로 다가가는 정도 (1 = 그대로)
  blur: [1.4, 2.4],   // 멀리 있을 때 이름 · 키워드가 흐린 정도 (px) — 다가올수록 0 으로 선명해진다
  linkT: 1.1,         // 키워드를 누르면 같은 작업의 키워드가 선으로 이어져 보이는 시간 (s)
};
/* 키워드 자리 (화면 비율). 이름이 커져도 겹치지 않게 위·아래 띠에 */
const SEED_SLOTS = [[.17, .24], [.44, .16], [.8, .22], [.23, .8], [.57, .85], [.85, .77]];
const FALL = {
  open: .7,           // 흰 화면 → 깊은 원근 공간이 열리는 시간 (s). 그동안 원은 가운데 그대로
  elev: 20,           // 열린 뒤 카메라 고도각 (deg) — 낮을수록 바닥이 멀리 지평선까지 깔린다
  dist: 16,           // 카메라 ~ 원 거리 (멀수록 깊어 보인다)
  landY: .9,          // 원이 닿는 자리 = 화면 높이의 90% (아래쪽, 튀김 점이 잘리지 않는 정도)
  hang: .05,          // 다 열린 뒤 공중에 머무는 시간 (s)
  dur: .8,            // 떨어지는 시간 (s) — 짧을수록 빨리 떨어진다
  motes: 260,         // 떨어지는 동안 거꾸로 위로 떠오르는 작은 점 (상승감)
  ease: 2,            // h = h0 · (1 - t²) : 중력처럼 점점 빨라진다
  trail: 3,           // 원 위로 남는 옅은 세로 잔상 개수
};
const NIGHT = { time: 1.4 };   // 닿은 자리에서 어둠이 화면 전체로 번지는 시간 (s)
/* 그림 → 나무: 닿은 자리에서 번지며 떠올라 나무로 모인다 (레퍼런스: 그림이 눕고, 물감 연기처럼 솟구쳐 나무가 된다) */
const MORPH = {
  wave: 12,           // 떠오름이 바닥을 따라 번지는 빠르기 (월드 단위 / s)
  dur: 2.6,           // 점 하나가 바닥에서 나무 자리까지 가는 시간 (s, 점마다 ±30%)
  bornLag: 1.1,       // 나무 안쪽(줄기)부터 먼저 자리 잡고 끝은 늦게 (s)
  swirl: 1.6,         // 소용돌이 (rad)
  rise: 3.2,          // 가는 동안 위로 솟구치는 높이
  noise: .35,         // 연기처럼 흔들림
  ready: 3.4,         // 이만큼 지나면 라벨·HUD 가 나온다 (s)
  tile: 1.2,          // 바닥 그림 타일 크기 (칸 간격의 배수, 1 보다 커야 빈틈이 없다)
};
const NEURAL = {
  points: 34000,              // 점 수 (폭 < 700px 이면 절반)
  trunkLen: .75,              // 땅 위 줄기 길이
  branches: [5, 7],           // 줄기 끝에서 위로 갈라지는 가지 수
  minorRoots: [3, 5],         // 작업이 아닌 가는 뿌리 수
  maxGen: 6,                  // 최대 세대
  branchLen: 3.0,             // 가지 하나의 최대 경로 길이
  rootLen: [2.0, 3.4],        // 뿌리 길이 (weight 0 → 1)
  step: .05,
  split: [.3, .6],            // 갈라지는 거리
  splitAng: [.35, .7],        // 갈래 각 (rad)
  wobble: .25,                // 구불거림
  near: .06,                  // 다른 가지와 이만큼 가까우면 멈춘다
  w0: .03,                    // 가지 시작 굵기 (= 점이 퍼지는 원통 반지름)
  trunkW: .075,               // 줄기 굵기
  rootW: [.02, .085],         // 뿌리 굵기 (weight 0 → 1) — 가장 보여주고 싶은 작업일수록 굵다
  growTime: 4,                // 끝까지 자라는 시간 (s)
  dust: 700,                  // 공중 먼지 점
  ground: 1400,               // 땅의 경계를 그리는 옅은 점
  motes: 420,                 // 뿌리에서 가지로 천천히 떠오르는 점 (상승감)
  riseSpeed: .05,             // 떠오르는 빠르기 (높이 비율 / s)
  pulseSpeed: .2,             // 신호 펄스 속도 (경로 비율 / s)
  pulseW: .035,               // 펄스 폭
  spin: 300,                  // 자동 회전 한 바퀴 (s) — 클수록 천천히 돈다
  glow: .25,                  // 반짝임·빛 펄스가 흐르는 빠르기 (1 = 원래, 작을수록 느리게 번진다)
  fill: .97,                  // 나무가 화면을 채우는 비율 (1 = 가장자리까지)
  elev: 6,                    // 다 자란 뒤 카메라 고도각 (deg) — 낮아야 땅 위·아래가 같이 보인다
};
/* 카메라: 흰 종이(정면) → 비스듬히 내려다보는 바닥 */
const CAM = {
  f: 1.05,            // 초점거리 (× 화면 높이)
  elevStart: 90, distStart: 14,
};

const params = new URLSearchParams(location.search);
const START = params.get('stage');                       // ?stage=name | drop | spread (+ ?a= 다가온 정도 0~1)
const DROP_FREEZE = START === 'drop' && params.has('t') ? parseFloat(params.get('t')) : null;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (START) document.documentElement.classList.add('test');

let W = 0, H = 0, DPR = 1;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const x = clamp((v - a) / (b - a)); return x * x * (3 - 2 * x); };
const easeOut = t => 1 - Math.pow(1 - t, 3);
const DEG = Math.PI / 180;
function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const body = document.body;
const html = document.documentElement;
const cv = document.getElementById('ink');
const ctx = cv.getContext('2d');
const nightEl = document.getElementById('night');
const dotEl = document.querySelector('.drop-dot');
const cursorEl = document.querySelector('.cursor');
const labelsEl = document.getElementById('labels');
const nameBtn = document.querySelector('.c-name-btn');

/* ═════════ 카메라 · 투영 ═════════ */
// 카메라는 높이 ay 의 점 (0, ay, 0) 을 고도각·거리·방위각으로 바라본다 (떨어질 때 ay = 원이 출발한 높이)
const view = { elev: CAM.elevStart, dist: CAM.distStart, off: 0, yaw: 0, ay: 0 };
const mouse = { x: -9999, y: -9999, mx: 0, my: 0 };
let F = 1, Cx = 0, Cy = 1, Cz = 0, cth = 1, sth = 0, cps = 1, sps = 0, PX = 0, PY = 0;
// 원이 출발하는 높이: 카메라(FALL.elev, FALL.dist)에서 바닥 원점이 화면 FALL.landY 에 오도록 계산
function fallH0() {
  const e = FALL.elev * DEG, D = FALL.dist;
  const a = Math.atan((FALL.landY - .5) / CAM.f);          // 화면 가운데에서 원점까지의 각
  return Math.max(1, D * Math.cos(e) * Math.tan(e + a) - D * Math.sin(e));
}
function pose() {
  const e = view.elev * DEG, D = view.dist, ps = view.yaw * DEG;
  F = CAM.f * H; PX = W / 2; PY = H / 2;
  Cx = -Math.sin(ps) * D * Math.cos(e);
  Cz = -Math.cos(ps) * D * Math.cos(e);
  Cy = view.ay + D * Math.sin(e);
  const th = e + view.off * DEG;
  cth = Math.cos(th); sth = Math.sin(th); cps = Math.cos(ps); sps = Math.sin(ps);
}
// 3D 점 → 화면 [x, y, depth]  (dots.js 셰이더도 같은 식)
function proj(x, y, z) {
  const vx = x - Cx, vy = y - Cy, vz = z - Cz;
  const xr = vx * cps - vz * sps, zr = vx * sps + vz * cps;
  const d = -vy * sth + zr * cth;
  const vert = vy * cth + zr * sth;
  return [PX + F * xr / d, PY - F * vert / d, d];
}

/* ═════════ 흰 점 3D 나무 만들기 (한 번) ═════════
   땅(y = 0) 위 = 줄기 → 가지 (감각 키워드), 땅 아래 = 뿌리 (작업, weight 만큼 굵고 깊다) */
let R = rng(2026), seed = 2026;
let tips = [];                 // 끝: {kind: work | key | soon | zone, id, title, sub, pos, root, sx, sy, front}
let maxPath = 1;
let samples = [];              // 커서 반응용 줄기 표본 [x, y, z, root, born]
const fit = { dist: 9, ay: .3, top: 2, bot: -2, r: 3 };   // 나무가 화면을 채우는 카메라
function buildNeural() {
  const N = W < 700 ? NEURAL.points / 2 : NEURAL.points;
  const segs = [], splits = [];
  const grid = new Map(), CELL = .09;
  const key = (x, y, z) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`;
  const crowded = (p, self, parent) => {
    const ix = Math.floor(p[0] / CELL), iy = Math.floor(p[1] / CELL), iz = Math.floor(p[2] / CELL), n2 = NEURAL.near ** 2;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const arr = grid.get(`${ix + a},${iy + b},${iz + c}`); if (!arr) continue;
      for (let q = 0; q < arr.length; q += 4) {
        if (arr[q + 3] === self || arr[q + 3] === parent) continue;
        const dx = arr[q] - p[0], dy = arr[q + 1] - p[1], dz = arr[q + 2] - p[2];
        if (dx * dx + dy * dy + dz * dz < n2) return true;
      }
    }
    return false;
  };
  const add = (p, owner) => { const k = key(...p); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(p[0], p[1], p[2], owner); };
  const norm = v => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const rot = (d, axis, ang) => {          // d 를 axis(d 에 수직) 쪽으로 ang 만큼
    const c = Math.cos(ang), s = Math.sin(ang);
    return norm([d[0] * c + axis[0] * s, d[1] * c + axis[1] * s, d[2] * c + axis[2] * s]);
  };
  const perp = d => norm(cross(d, Math.abs(d[1]) > .9 ? [1, 0, 0] : [0, 1, 0]));
  const rnd = (a, b) => lerp(a, b, R());
  const dirAt = (az, el) => [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
  const s = NEURAL.step;

  // ── 줄기: 땅에서 곧게 위로 ──
  let id = 0, root = 0;
  const trunkRoot = root++;
  let p = [0, 0, 0], d = [0, 1, 0], last = -1, path = 0, w = NEURAL.trunkW;
  while (path < NEURAL.trunkLen) {
    d = norm([d[0] + (R() - .5) * .08, d[1], d[2] + (R() - .5) * .08]);
    const np = [p[0] + d[0] * s, p[1] + d[1] * s, p[2] + d[2] * s];
    path += s;
    segs.push({ a: p, b: np, d, w, path, root: trunkRoot, parent: last, child: false, up: true });
    if (last >= 0) segs[last].child = true;
    last = segs.length - 1; p = np; w *= .995;
  }
  const trunkTop = p, trunkEnd = last, trunkPath = path;

  // ── 가지 (위) + 뿌리 (아래) 를 같이 키운다 ──
  let active = [];
  const off = R() * 6.283;
  const nB = NEURAL.branches[0] + Math.floor(R() * (NEURAL.branches[1] - NEURAL.branches[0] + 1));
  for (let i = 0; i < nB; i++) {
    const az = off + (i + .5) / nB * 6.283 + (R() - .5) * .5, el = rnd(8, 42) * DEG;   // 낮을수록 옆으로 넓게
    active.push({ p: trunkTop, d: dirAt(az, el), up: true, gen: 0, w: w * rnd(.5, .65), travel: 0, next: rnd(...NEURAL.split),
      path: trunkPath, max: trunkPath + NEURAL.branchLen * rnd(.7, 1.2), root: root++, id: id++, parent: -1, last: trunkEnd });
  }
  // 뿌리: 나에 관한 키워드마다 하나 + 가는 뿌리
  const rootSpecs = KEYS.map((k, i) => ({ work: i, wt: .6 }));
  const nM = NEURAL.minorRoots[0] + Math.floor(R() * (NEURAL.minorRoots[1] - NEURAL.minorRoots[0] + 1));
  for (let i = 0; i < nM; i++) rootSpecs.push({ work: -1, wt: rnd(0, .15) });
  const nR = rootSpecs.length;
  const workRoot = [];
  rootSpecs.forEach((rs, i) => {
    // 작업 뿌리는 앞쪽 두 방향으로 벌려 놓고, 가는 뿌리는 사이사이
    const slot = rs.work >= 0 ? rs.work * Math.round(nR / Math.max(1, KEYS.length)) : KEYS.length + (i - KEYS.length);
    const az = off + .9 + slot / nR * 6.283 + (R() - .5) * .3;
    const el = -(rs.work >= 0 ? rnd(14, 24) : rnd(8, 30)) * DEG;
    const rid = root++;
    if (rs.work >= 0) workRoot[rs.work] = rid;
    active.push({ p: [0, -.002, 0], d: dirAt(az, el), up: false, main: rs.work >= 0, gen: 0,
      w: lerp(NEURAL.rootW[0], NEURAL.rootW[1], rs.wt), travel: 0, next: rnd(...NEURAL.split),
      path: 0, max: lerp(NEURAL.rootLen[0], NEURAL.rootLen[1], rs.wt) * (rs.work >= 0 ? 1 : rnd(.7, 1)), root: rid, id: id++, parent: -1, last: -1 });
  });
  const mainEnd = {};                 // root → 작업 뿌리 본줄기의 마지막 마디
  while (active.length && segs.length < 16000) {
    const next = [];
    for (const t of active) {
      const ax = perp(t.d), bx = cross(t.d, ax), wb = NEURAL.wobble * (t.main ? .4 : .6);
      t.d = norm([
        t.d[0] + (ax[0] * (R() - .5) + bx[0] * (R() - .5)) * wb,
        t.d[1] + (ax[1] * (R() - .5) + bx[1] * (R() - .5)) * wb + (t.up ? .003 : -.004),   // 가지는 빛 쪽으로, 뿌리는 땅속으로
        t.d[2] + (ax[2] * (R() - .5) + bx[2] * (R() - .5)) * wb,
      ]);
      const np = [t.p[0] + t.d[0] * s, t.p[1] + t.d[1] * s, t.p[2] + t.d[2] * s];
      if (t.up && np[1] < .15) { np[1] = .15; t.d[1] = Math.abs(t.d[1]); }
      if (!t.up && np[1] > -.04) { np[1] = -.04; t.d[1] = -Math.abs(t.d[1]); }
      if (Math.hypot(np[0], np[2]) > 6 || np[1] < -2.4) { if (!t.main) continue; }
      if (!t.main && t.travel > .2 && crowded(np, t.id, t.parent) && R() < .7) continue;
      const idx = segs.length;
      t.path += s;
      segs.push({ a: t.p, b: np, d: t.d, w: t.w, path: t.path, root: t.root, parent: t.last, child: false, up: t.up });
      if (t.last >= 0) segs[t.last].child = true;
      if (t.main) mainEnd[t.root] = idx;
      t.last = idx; t.p = np; t.travel += s; t.w *= t.main ? .992 : .994;
      add(np, t.id);
      if (t.path > t.max) continue;
      if (t.travel >= t.next) {
        if (t.gen >= NEURAL.maxGen) { t.travel = 0; t.next = 1e9; next.push(t); continue; }
        splits.push({ p: np, path: t.path, root: t.root, up: t.up });
        const axis = perp(t.d);
        for (const sign of [1, -1]) {
          // 작업 뿌리: 한쪽(본줄기)은 굵게 곧게 이어지고, 다른 쪽은 가는 곁뿌리
          const keep = t.main && sign === 1;
          const ang = sign * rnd(...NEURAL.splitAng) * (keep ? .35 : (R() < .3 ? .4 : 1));
          next.push({ ...t, d: rot(t.d, axis, ang), gen: t.gen + 1, main: keep,
            w: t.w * (keep ? rnd(.86, .93) : t.main ? rnd(.35, .5) : rnd(.68, .82)),
            travel: 0, next: rnd(...NEURAL.split), id: id++, parent: t.id });
        }
        continue;
      }
      next.push(t);
    }
    active = next;
  }

  // born (자라는 순서): 줄기·가지가 먼저 위로 솟고, 뿌리는 조금 늦게 아래로
  const upMax = Math.max(...segs.filter(q => q.up).map(q => q.path));
  const dnMax = Math.max(1e-3, ...segs.filter(q => !q.up).map(q => q.path));
  const bornOf = (up, pth) => up ? pth / upMax : .18 + .82 * pth / dnMax;
  maxPath = 1;

  // 크기 (화면 채우기용)
  let top = 0, bot = 0, rad = 0;
  for (const q of segs) { top = Math.max(top, q.b[1]); bot = Math.min(bot, q.b[1]); rad = Math.max(rad, Math.hypot(q.b[0], q.b[2])); }
  fit.top = top; fit.bot = bot; fit.r = rad;

  // ── 점 뿌리기 ──
  const out = [];
  const push = (p, size, bright, kind, born, br) => out.push(p[0], p[1], p[2], size, bright, R(), kind, born, br);
  const gauss = () => (R() + R() + R() - 1.5) / 1.5;
  const nBranch = N * .74;
  const wt = segs.map(q => .3 + Math.pow(q.w / NEURAL.w0, .8));
  const K = nBranch / wt.reduce((a, b) => a + b, 0);
  samples = [];
  segs.forEach((q, i) => {
    const m = Math.max(0, Math.round(wt[i] * K + (R() - .5)));
    const u = perp(q.d), v = cross(q.d, u);
    const b0 = bornOf(q.up, q.path - s), b1 = bornOf(q.up, q.path);
    for (let j = 0; j < m; j++) {
      const t = R(), a = R() * 6.283, rr = q.w * 1.3 * Math.sqrt(R());
      const c = Math.cos(a) * rr, sn = Math.sin(a) * rr;
      push([
        lerp(q.a[0], q.b[0], t) + u[0] * c + v[0] * sn,
        lerp(q.a[1], q.b[1], t) + u[1] * c + v[1] * sn,
        lerp(q.a[2], q.b[2], t) + u[2] * c + v[2] * sn,
      ], 1.1 + R() * .9, .35 + .45 * Math.min(1, q.w / .015) * R() + .1, 0, lerp(b0, b1, t), q.root);
    }
    if (i % 2 === 0) samples.push(q.b[0], q.b[1], q.b[2], q.root, b1);
  });
  // 분기점 = 시냅스: 조금 더 크고 밝은 덩어리
  const perSyn = Math.max(5, Math.round(N * .07 / Math.max(1, splits.length)));
  for (const sp of splits)
    for (let j = 0; j < perSyn; j++)
      push([sp.p[0] + gauss() * .018, sp.p[1] + gauss() * .018, sp.p[2] + gauss() * .018], 1.3 + R() * .6, .45, 1, bornOf(sp.up, sp.path), sp.root);
  // 공중 먼지
  for (let j = 0; j < NEURAL.dust; j++)
    push([(R() - .5) * rad * 2.6, lerp(bot, top, R()) * 1.1, (R() - .5) * rad * 2.6], .8 + R() * .6, .1 + R() * .14, 3, 0, -1);
  // 땅: 뿌리와 가지를 나누는 옅은 원판 (가운데가 조금 촘촘)
  for (let j = 0; j < NEURAL.ground; j++) {
    const a = R() * 6.283, rr = rad * 1.25 * Math.pow(R(), .7);
    push([Math.cos(a) * rr, 0, Math.sin(a) * rr], .9 + R() * .5, .14 + R() * .16, 3, 0, -1);
  }
  // 떠오르는 점: 뿌리 쪽에서 가지 쪽으로 (셰이더가 시간에 따라 올린다. y 자리에 시작 위상)
  for (let j = 0; j < NEURAL.motes; j++) {
    const a = R() * 6.283, rr = rad * .75 * Math.sqrt(R());
    push([Math.cos(a) * rr, R(), Math.sin(a) * rr], 1 + R() * .8, .25 + R() * .3, 5, 0, -1);
  }

  // ── 끝: 작업 = 작업 뿌리 본줄기의 끝 · 감각 키워드 = 서로 다른 가지의 높은 끝 ──
  tips = [];
  // 뿌리 끝 = 나에 관한 키워드
  KEYS.forEach((k, i) => {
    const rid = workRoot[i], q = segs[mainEnd[rid]];
    tips.push({ kind: 'key', id: 'key-' + i, href: '#/about', title: k.en, ko: k.ko, pos: q ? q.b : [0, -2, 0], root: rid, born: q ? bornOf(false, q.path) : .9 });
  });
  // 가지 끝 = 작업 (결과). 서로 다른 가지의 높은 끝부터
  const ends = segs.filter(q => q.up && !q.child && q.root !== trunkRoot);
  const usedRoot = new Set();
  const workEnds = [];
  for (const e of ends.sort((a, b) => b.b[1] - a.b[1])) {
    if (usedRoot.has(e.root)) continue;
    usedRoot.add(e.root); workEnds.push(e);
    if (workEnds.length >= WORKS.length + 1) break;
  }
  WORKS.forEach((wk, i) => {
    const q = workEnds[i];
    tips.push({ kind: 'work', ...wk, pos: q ? q.b : [0, 2, 0], root: q ? q.root : -1, born: q ? bornOf(true, q.path) : .9 });
  });
  const sq = workEnds[WORKS.length];
  if (sq) tips.push({ kind: 'soon', id: 'soon', pos: sq.b, root: sq.root, born: bornOf(true, sq.path) });
  // 뿌리 / 가지 이름표 (줄기 옆, 누를 수 없음)
  tips.push({ kind: 'zone', id: 'z-up', title: 'branches', sub: 'conveyed through the senses', ko: '감각으로 전하다', pos: [0, top * .55, 0], root: -1, born: .2 });
  tips.push({ kind: 'zone', id: 'z-dn', title: 'roots', sub: 'grown from experience', ko: '경험으로 자라고', pos: [0, bot * .45, 0], root: -1, born: .4 });

  for (const tp of tips) {
    if (tp.kind === 'zone') continue;
    const P = tp.pos, big = tp.kind === 'work', k = tp.kind === 'soon' ? 4 : 2;
    const sz = big ? 6 + 4 * tp.weight : tp.kind === 'key' ? 5 : 4;
    push(P, sz, 1.6, k, tp.born, tp.root);
    for (let j = 0; j < (big ? 36 : 14); j++)
      push([P[0] + gauss() * .012, P[1] + gauss() * .012, P[2] + gauss() * .012], 1.3, .8, k, tp.born, tp.root);
    if (tp.kind !== 'soon')                                  // 작은 점 고리
      for (let j = 0; j < 22; j++) {
        const a = j / 22 * 6.283, rr = big ? .07 : .05;
        push([P[0] + Math.cos(a) * rr, P[1], P[2] + Math.sin(a) * rr], 1.1, .55, k, tp.born, tp.root);
      }
  }
  Dots.setPoints(imageMap(out));
  fitCamera(segs);
  buildLabels();
  return out.length / Dots.STRIDE;
}

/* 바닥 그림 → 나무: 나무의 점마다 바닥 위 출발점과 색(흰색)을 붙인다
   그림을 cols × rows 칸으로 나누고 (칸 하나 = 점 하나), 그림의 위쪽 줄 = 나무의 높은 곳 (가지),
   아래쪽 줄 = 깊은 곳 (뿌리), 줄 안의 왼쪽 → 오른쪽 = 나무 둘레 방향. 그래서 그림의 색이 줄기를 따라 이어진다
   출발점: drop 첫 장면(정면에서 내려다봄)에서 화면 그 칸에 보이는 바닥 자리 → 기울면 그대로 원근 바닥이 된다 */
let floorS = .1;
function imageMap(out) {
  const S = Dots.STRIDE, n0 = out.length / 9;
  const cols = Math.max(8, Math.round(Math.sqrt(n0 * W / H))), rows = Math.ceil(n0 / cols), G = cols * rows;
  const keys = [];
  for (let i = 0; i < n0; i++) keys.push(i);
  while (keys.length < G) keys.push(Math.floor(R() * n0));          // 모자란 칸은 아무 점이나 하나 더
  const ks = keys.map((i, j) => {
    const o = i * 9, y = out[o + 6] === 5 ? lerp(fit.bot, fit.top, out[o + 1]) : out[o + 1];
    return { i, dup: j >= n0, v: y, u: Math.atan2(out[o + 2], out[o]) };
  }).sort((a, b) => b.v - a.v);
  const Df = fallH0() + CAM.distStart, Fp = CAM.f * H;           // drop 첫 장면: 바닥까지의 거리 · 초점
  floorS = W / cols * Df / Fp * MORPH.tile;
  const res = new Float32Array(G * S);
  for (let r = 0; r < rows; r++) {
    const row = ks.slice(r * cols, (r + 1) * cols).sort((a, b) => a.u - b.u);
    row.forEach((k, c) => {
      const o = k.i * 9, t = (r * cols + c) * S;
      for (let a = 0; a < 9; a++) res[t + a] = out[o + a];
      if (k.dup) for (let a = 0; a < 3; a++) res[t + a] += (R() - .5) * .02;
      const sx = (c + .5) / cols * W, sy = (r + .5) / rows * H;
      res[t + 9] = (sx - W / 2) * Df / Fp; res[t + 10] = 0; res[t + 11] = -(sy - H / 2) * Df / Fp;
      res[t + 12] = 1; res[t + 13] = 1; res[t + 14] = 1;
    });
  }
  return res;
}

// 나무가 어느 방향으로 돌아도 화면을 NEURAL.fill 만큼 채우는 거리 (돌려 보며 이분 탐색)
function fitCamera(segs) {
  const pts = [];
  for (let i = 0; i < segs.length; i += 6) pts.push(segs[i].b);
  const keep = { ...view };
  fit.ay = (fit.top + fit.bot) / 2;
  let lo = 2, hi = 40;
  for (let it = 0; it < 22; it++) {
    const D = (lo + hi) / 2;
    let sum = 0;                    // 방향마다 화면을 얼마나 채우는지의 평균 (도는 동안 가장자리를 살짝 넘나든다)
    for (let k = 0; k < 8; k++) {
      view.elev = NEURAL.elev; view.dist = D; view.off = 0; view.yaw = k * 45; view.ay = fit.ay; pose();
      let ext = 0;
      for (const p of pts) {
        const q = proj(...p);
        if (q[2] < .1) { ext = 9; break; }
        ext = Math.max(ext, Math.abs(q[0] - PX) / (W / 2), Math.abs(q[1] - PY) / (H / 2));
      }
      sum += ext;
    }
    if (sum / 8 > NEURAL.fill) lo = D; else hi = D;
  }
  fit.dist = hi;
  Object.assign(view, keep); pose();
}

/* ═════════ 라벨 ═════════ */
let hovered = null, hoverA = 0;
function buildLabels() {
  labelsEl.replaceChildren();
  for (const tp of tips) {
    const link = tp.kind === 'work' || tp.kind === 'key';
    const el = document.createElement(link ? 'a' : 'div');
    el.className = 'lbl ' + tp.kind + (link ? ' tip' : '');
    tp.show = 0; tp.near = 0;
    if (link) {
      el.href = tp.href || '#/' + tp.id;
      // 영어 단어 (흰색) · 다가오면 한국어 (작업은 한 줄 설명도)
      el.innerHTML = `<i class="w"><b class="en">${tp.title}</b><b class="kr">${tp.ko}</b>`
        + (tp.kind === 'work' ? `<small class="kr-sub">${tp.sub}</small>` : '') + '</i>';
      el.addEventListener('click', () => { origin = { x: tp.sx, y: tp.sy }; });
      el.addEventListener('pointerenter', () => { hovered = tp.id; });
      el.addEventListener('pointerleave', () => { if (hovered === tp.id) hovered = null; });
    } else if (tp.kind === 'zone') el.innerHTML = `<b>${tp.title}</b><span>${tp.sub}</span><span class="ko">${tp.ko}</span>`;
    else el.innerHTML = '<b>next work — growing</b>';
    labelsEl.appendChild(el);
    tp.el = el;
  }
}
function placeLabels(grow) {
  const d0 = proj(0, fit.ay, 0)[2];
  for (const tp of tips) {
    const p = proj(...tp.pos);
    tp.sx = p[0]; tp.sy = p[1];
    tp.front = clamp(1 - (p[2] - d0) / (fit.r * 1.4));         // 나무가 돌아 뒤로 가면 흐려진다
    if (tp.kind === 'zone') {                                    // 화면 왼쪽 가장자리, 땅 위·아래 높이에
      tp.el.style.transform = `translate(${Math.max(150, W * .12).toFixed(1)}px,${p[1].toFixed(1)}px)`;
      // 처음엔 숨겨 두고, 커서가 그쪽(땅 위 = 가지 / 아래 = 뿌리)에 있을 때만 드러난다
      const gy = proj(0, 0, 0)[1];
      const inZone = mouse.y > -9000 && (tp.id === 'z-up' ? mouse.y < gy : mouse.y >= gy);
      tp.el.style.opacity = ready && inZone ? .85 : 0;
      continue;
    }
    tp.el.classList.toggle('left', p[0] < W / 2);
    tp.el.style.transform = `translate(${p[0].toFixed(1)}px,${p[1].toFixed(1)}px)`;
    const visible = ready && grow > tp.born;
    if (tp.kind === 'soon') {                                    // '다음 작업'도 커서가 가까울 때만
      const on = visible && Math.hypot(p[0] - mouse.x, p[1] - mouse.y) < 40;
      tp.show += ((on ? 1 : 0) - tp.show) * .15;
      tp.el.style.opacity = (tp.show * .8).toFixed(3);
      continue;
    }
    // 끝은 점으로만: 커서를 대면 단어가 나타나고, 그 위에서 스크롤로 다가오면 (near) 커지며 한국어로
    const hov = hovered === tp.id;
    tp.show += ((hov && visible ? 1 : 0) - tp.show) * .15;
    if (!hov) tp.near *= .9;
    tp.el.style.opacity = (tp.show * (.45 + .55 * tp.front)).toFixed(3);
    tp.el.style.setProperty('--k', smooth(.3, .7, tp.near).toFixed(3));
    tp.el.style.setProperty('--s', (1 + tp.near * 1.6).toFixed(3));
    tp.el.style.pointerEvents = tp.show > .5 ? 'auto' : 'none';
  }
}
function hitTip(x, y) {
  if (!ready) return null;
  let best = null, bd = 28;
  for (const tp of tips) {
    if ((tp.kind !== 'work' && tp.kind !== 'key') || tp.sx == null || tp.front < .15) continue;
    const d = Math.hypot(tp.sx - x, tp.sy - y);
    if (d < bd) { bd = d; best = tp; }
  }
  // 이미 보고 있는 단어는 조금 멀어져도 놓치지 않는다 (단어가 커져도)
  const cur = !best && hovered && tips.find(t => t.id === hovered);
  if (cur && cur.sx != null && Math.hypot(cur.sx - x, cur.sy - y) < 90 + 60 * (cur.near || 0)) best = cur;
  return best;
}

/* ═════════ 화학작용: 닿은 줄기에서 반응이 번진다 ═════════ */
const reacts = [];             // {br, born, t0}  (br = -1 → 나무 전체로 연쇄)
const lastReact = new Map();
function reactAt(x, y, chain) {
  if (!ready || !samples.length) return false;
  let best = -1, bd = REACT.hit * REACT.hit;
  for (let i = 0; i < samples.length; i += 5) {
    const q = proj(samples[i], samples[i + 1], samples[i + 2]);
    if (q[2] < .1) continue;
    const dd = (q[0] - x) ** 2 + (q[1] - y) ** 2;
    if (dd < bd) { bd = dd; best = i; }
  }
  if (best < 0) return false;
  const br = samples[best + 3], now = nowS();
  if (!chain && now - (lastReact.get(br) || -9) < REACT.gap) return true;
  lastReact.set(br, now);
  reacts.push({ br: chain ? -1 : br, born: samples[best + 4], t0: now });
  while (reacts.length > 6) reacts.shift();
  return true;
}
function reactUniform() {
  const now = nowS(), a = new Float32Array(24);
  let n = 0;
  for (let i = reacts.length - 1; i >= 0 && n < 6; i--) {
    const r = reacts[i];
    if (now - r.t0 > REACT.life) continue;
    a.set([r.br, r.born, now - r.t0, 1], n * 4); n++;
  }
  return a;
}

/* ═════════ 단계 ═════════ */
let stage = 'name', ready = false;
// 오프닝: approach = 이름이 다가온 정도 (스크롤), seed = 누른 키워드 {work, el, x, y}, focus = 그 작업 가지로 가는 중
const open = { approach: 0, approachT: 0, letters: null, base: 0, w0: 0, wheelLock: 0, seed: null, focus: null, ayOff: 0 };
const T = { name: 0, gather: 0, seed: 0, drop: 0, spread: 0 };
let writePlan = [], writeIdx = 0, writeDone = false, bloomTimer, hintTimer;
let dropD0 = 1, dotPx = DOT.size, splash = [], nightR = 0, spin = 0, h0 = 6;
function setStage(s) {
  stage = s;
  ['name', 'gather', 'seed', 'drop', 'spread'].forEach(k => body.classList.toggle('stage-' + k, k === s));
}
const nowS = () => performance.now() / 1000;
const nameEl = document.querySelector('.c-name');

// 이름을 처음 상태로 (글자 숨김 · 자간 벌어짐) — 전환 없이 바로
function resetName() {
  clearTimeout(bloomTimer); clearTimeout(hintTimer);
  nameEl.style.transition = 'none';
  body.classList.remove('bloom', 'bloomed', 'show-name-hint', 'shrink');
  document.querySelectorAll('.card .ch').forEach(c => {
    c.style.transition = 'none'; c.classList.remove('on'); c.style.transitionDelay = ''; c.style.transitionDuration = '';
  });
  void nameEl.offsetWidth;                         // 위 상태를 먼저 적용시킨 뒤 전환을 되살린다
  nameEl.style.transition = '';
  document.querySelectorAll('.card .ch').forEach(c => { c.style.transition = ''; });
}

// ── name: 가운데 글자부터 바깥으로 피어난다 ──
function goName() {
  setStage('name');
  body.classList.remove('seeds-on');
  setTimeout(() => body.classList.add('seeds-on'), reduceMotion ? 0 : 1200);
  writeDone = false; writeIdx = 0;
  resetName();
  // 글자 자리(공백 포함)의 가운데에서 멀수록 늦게
  const nodes = [...nameEl.childNodes], mid = (nodes.length - 1) / 2;
  writePlan = [];
  nodes.forEach((n, i) => {
    if (n.nodeType === 1) writePlan.push({ el: n, t: BLOOM.start + Math.round(Math.abs(i - mid)) * BLOOM.step });
  });
  writePlan.sort((a, b) => a.t - b.t);
  T.name = performance.now();
  if (reduceMotion) finishWriting(true);
}
function updateWriting() {
  if (stage !== 'name' || writeDone) return;
  const now = performance.now() - T.name;
  if (now >= BLOOM.start) body.classList.add('bloom');            // 자간이 모이기 시작
  while (writeIdx < writePlan.length && writePlan[writeIdx].t <= now) {
    writePlan[writeIdx].el.classList.add('on'); writeIdx++;
  }
  if (writeIdx >= writePlan.length) finishWriting(false);
}
// skipped: 피는 도중 클릭 → 짧게 마저 피고 끝
function finishWriting(skipped) {
  if (skipped) {
    nameEl.style.transitionDuration = '.5s';
    writePlan.forEach(p => { p.el.style.transitionDelay = '0s'; p.el.style.transitionDuration = '.5s'; });
  }
  body.classList.add('bloom');
  writePlan.forEach(p => p.el.classList.add('on'));
  writeIdx = writePlan.length;
  writeDone = true;
  bloomTimer = setTimeout(() => { if (stage === 'name') body.classList.add('bloomed'); }, skipped ? 600 : BLOOM.dur + 400);
  if (BLOOM.hint) hintTimer = setTimeout(() => { if (stage === 'name') body.classList.add('show-name-hint'); }, 1000);
}

// ── 이름이 모이기 시작할 때: 지금 크기에서 글자마다 가운데까지의 거리 (가장자리 글자부터) ──
function measureLetters() {
  const nr = nameEl.getBoundingClientRect();
  const cx = nr.left + nr.width / 2, cy = nr.top + nr.height / 2;
  open.letters = [...document.querySelectorAll('.card .ch')]
    .map(ch => { const r = ch.getBoundingClientRect(); return { ch, dx: cx - r.left - r.width / 2, dy: cy - r.top - r.height / 2 }; })
    .sort((a, b) => Math.abs(b.dx) - Math.abs(a.dx));
  open.letters.forEach(o => { o.ch.style.transition = 'none'; });
}
function releaseLetters() {
  if (!open.letters) return;
  open.letters.forEach(o => { o.ch.style.transition = ''; o.ch.style.transform = ''; o.ch.style.opacity = ''; });
  open.letters = null;
}
function dotCenter() { return { x: W / 2, y: H / 2 }; }

// ── drop ──
function goDrop() {
  body.classList.remove('show-dot-hint');
  setStage('drop');
  T.drop = performance.now();
  h0 = fallH0();
  R = rng(++seed); buildNeural();
  view.elev = CAM.elevStart; view.dist = CAM.distStart; view.off = 0; view.yaw = 0; view.ay = h0; pose();
  dropD0 = proj(0, h0, 0)[2];
  if (reduceMotion) finishInstant();
}
// 클릭: 이름이 모여 씨앗(원)이 된다
function goGather() {
  if (stage !== 'name') return;
  if (reduceMotion) { finishInstant(); return; }
  if (!writeDone) finishWriting(true);
  measureLetters();
  setStage('gather');
  T.gather = performance.now();
}
// 키워드를 누르면: 여러 작업에 걸친 말이면 작은 키워드를 펼치고,
// 아니면 같은 작업의 키워드가 선으로 이어진 뒤 그 키워드가 씨앗이 되어 가운데로 → 나무가 자라면 그 작업의 가지로
function goSeed(node) {
  if (stage !== 'name') return;
  if (node.kids.length) {
    const was = node.open;
    seedNodes.forEach(n => { n.open = false; });
    node.open = !was;
    return;
  }
  const work = node.def.works[0];
  const r = node.el.getBoundingClientRect();
  const related = seedNodes.filter(m => m !== node && m.def.works.includes(work) && (!m.parent || m.parent.open));
  linksEl.replaceChildren();
  const lines = related.map(m => {
    const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    linksEl.appendChild(ln);
    return { ln, m };
  });
  open.seed = { work, node, el: node.el, x: r.left + r.width / 2, y: r.top + r.height / 2, related, lines, relLeave: 0, otherLeave: 0 };
  node.el.classList.add('picked');
  if (reduceMotion) { finishInstant(); startFocus(); return; }
  setStage('seed');
  T.seed = performance.now();
}
// 그 작업의 가지가 앞으로 오도록 돌고 조금 다가가며, 가지를 따라 빛이 흐른다
function startFocus() {
  const tp = open.seed && tips.find(x => x.id === open.seed.work);
  if (!tp) return;
  open.focus = { yaw: Math.atan2(-tp.pos[0], -tp.pos[2]) / DEG, y: tp.pos[1], t0: nowS(), id: tp.id };
  hovered = tp.id;
  reacts.push({ br: tp.root, born: tp.born, t0: nowS() });
}

// ── spread ──
function startSpread() {
  setStage('spread');
  open.wheelLock = performance.now();                   // 스크롤하던 손길이 바로 확대로 이어지지 않게
  T.spread = performance.now();
  const p = proj(0, 0, 0);
  nightEl.style.setProperty('--x', p[0].toFixed(1) + 'px');
  nightEl.style.setProperty('--y', p[1].toFixed(1) + 'px');
  for (let i = 0, n = 3 + Math.floor(R() * 4); i < n; i++) {     // 작은 튀김 점
    const a = R() * 6.283, v = 60 + R() * 120;
    splash.push({ x: p[0], y: p[1], vx: Math.cos(a) * v, vy: Math.sin(a) * v * .45 - 40, life: .35 + R() * .15, t: 0, r: 1 + R() * 1.6 });
  }
}
function setReady() {
  if (ready) return;
  ready = true;
  body.classList.add('ready');
  body.classList.remove('intro');
}
// 바로 다 자란 상태 (?stage=spread · Archive · 모션 줄이기)
function finishInstant() {
  clearTimeout(bloomTimer); clearTimeout(hintTimer);
  releaseLetters();
  body.classList.add('shrink');
  body.classList.remove('show-name-hint', 'show-dot-hint', 'bloomed');
  dotEl.style.opacity = 0;
  R = rng(++seed);
  setStage('spread');
  T.spread = performance.now() - (NEURAL.growTime + 3) * 1000;
  buildNeural();
  view.elev = NEURAL.elev; view.dist = fit.dist; view.off = 0; view.yaw = 0; view.ay = fit.ay; pose();
  const p = proj(0, 0, 0);
  nightEl.style.setProperty('--x', p[0].toFixed(1) + 'px');
  nightEl.style.setProperty('--y', p[1].toFixed(1) + 'px');
  setReady();
}
function replay() {
  R = rng(++seed);
  ready = false; tips = []; labelsEl.replaceChildren(); splash = []; hovered = null; spin = 0;
  body.classList.remove('ready', 'dark', 'show-dot-hint');
  body.classList.add('intro');
  resetName();
  view.elev = CAM.elevStart; view.dist = CAM.distStart; view.off = 0; view.yaw = 0; view.ay = 0;
  Object.assign(orbit, { yaw: 0, elev: 0, vy: 0, ve: 0, zoom: 1, drag: null });
  reacts.length = 0; samples = [];
  dotEl.style.opacity = 0;
  nightEl.style.setProperty('--r', '0px');
  Dots.clear();
  releaseLetters();
  if (open.seed) open.seed.el.classList.remove('picked');
  Object.assign(open, { approach: 0, approachT: 0, seed: null, focus: null, ayOff: 0 });
  seedNodes.forEach(n => { n.open = false; n.vis = 0; n.el.classList.remove('rel'); });
  linksEl.replaceChildren();
  nameRow.style.opacity = '';
  goName();
}

/* ═════════ loop ═════════ */
let lastT = 0, moveAct = 0, rise = 0;
const orbit = { yaw: 0, elev: 0, vy: 0, ve: 0, zoom: 1, drag: null };
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (t - lastT) / 1000 || .016); lastT = t;
  if (innerWidth !== W || innerHeight !== H) resize();
  Sound.update(Math.min(1, moveAct), 0, stage === 'spread' ? 0 : 1, dt);
  moveAct *= .85;
  if (sheetCovering) return;                         // 작업 페이지가 화면을 덮으면 쉰다

  updateWriting();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);

  if (stage === 'name' || stage === 'gather' || stage === 'seed') {
    // ① 멀리 있는 이름: 스크롤로 다가오면 커지고 또렷해진다 (원근처럼 지수로)
    if (stage === 'name') open.approach += (open.approachT - open.approach) * OPEN.approachLerp;
    const a = open.approach, ea = 1 - Math.pow(1 - a, 2);
    const near = open.w0 ? OPEN.fill * W / open.w0 : 4;
    const sc = OPEN.far * Math.pow(near / OPEN.far, ea);
    if (open.base) nameRow.style.fontSize = (open.base * sc).toFixed(2) + 'px';
    // 멀수록 흐리고, 다가올수록 선명해진다 (이름 · 키워드)
    const cn = smooth(0, .55, a), ck = smooth(0, OPEN.infoAt * .85, a);
    nameRow.style.filter = cn < .99 ? `blur(${(OPEN.blur[0] * (1 - cn)).toFixed(2)}px)` : '';
    seedsEl.style.setProperty('--kb', (OPEN.blur[1] * (1 - ck)).toFixed(2) + 'px');
    body.classList.toggle('near', stage === 'name' && a > OPEN.infoAt);       // 가장자리에 내 정보
    const hide = smooth(OPEN.infoAt * .8, OPEN.infoAt, a);                       // 정보가 나오면 키워드는 물러난다
    const leave = stage === 'gather' ? smooth(0, OPEN.gatherT, (performance.now() - T.gather) / 1000)
      : stage === 'seed' ? smooth(0, OPEN.linkT + OPEN.seedT * .6, (performance.now() - T.seed) / 1000) : 0;
    drawField(1 - leave, ea, t / 1000);
    placeSeeds(t / 1000, leave, ck, hide);

    const c = dotCenter();
    if (stage === 'name') {
      nameRow.style.opacity = (.6 + .4 * smooth(0, .6, a)).toFixed(3);
      dotEl.style.opacity = 0;
    } else if (stage === 'gather') {
      // ② 클릭: 가장자리 글자부터 가운데로 모여 검은 원 → 잠깐 뒤 떨어진다
      const q = (performance.now() - T.gather) / 1000, g = clamp(q / OPEN.gatherT);
      const n = open.letters.length, span = 1 - (n - 1) * OPEN.stagger;
      open.letters.forEach((o, i) => {
        const e = smooth(0, 1, (g - i * OPEN.stagger) / span);
        o.ch.style.transform = `translate(${(o.dx * e).toFixed(1)}px,${(o.dy * e).toFixed(1)}px) scale(${(1 - e).toFixed(3)})`;
        o.ch.style.opacity = (1 - e).toFixed(3);
      });
      const k = smooth(.55, 1, g);
      dotPx = DOT.size;
      dotEl.style.opacity = k > 0 ? 1 : 0;
      dotEl.style.transform = `translate(${c.x.toFixed(1)}px,${c.y.toFixed(1)}px) scale(${k.toFixed(3)})`;
      if (q > OPEN.gatherT + OPEN.pause) goDrop();
    } else {
      // ③ 같은 작업의 키워드가 선으로 이어지고 (linkT), 그 키워드가 오므라들어 빨간 원 → 가운데로
      const q0 = (performance.now() - T.seed) / 1000, sd = open.seed, L = OPEN.linkT;
      const draw = smooth(0, L * .6, q0);
      sd.relLeave = smooth(L, L + .5, q0); sd.otherLeave = smooth(0, .5, q0);
      sd.lines.forEach(({ ln, m }) => {
        const x2 = lerp(sd.x, m.x, draw), y2 = lerp(sd.y, m.y, draw);
        ln.setAttribute('x1', sd.x.toFixed(1)); ln.setAttribute('y1', sd.y.toFixed(1));
        ln.setAttribute('x2', x2.toFixed(1)); ln.setAttribute('y2', y2.toFixed(1));
        ln.style.opacity = (1 - sd.relLeave).toFixed(3);
      });
      const q = q0 - L;
      const shrink = smooth(0, .45, q), move = smooth(.4, OPEN.seedT, q);
      sd.el.style.opacity = (1 - shrink).toFixed(3);
      sd.el.style.transform = `translate(${sd.x.toFixed(1)}px,${sd.y.toFixed(1)}px) translate(-50%,-50%) scale(${(1 - .8 * shrink).toFixed(3)})`;
      nameRow.style.opacity = ((.6 + .4 * smooth(0, .6, a)) * (1 - smooth(0, .5, q0))).toFixed(3);
      dotPx = DOT.size;
      const k = smooth(.2, .5, q);
      dotEl.style.opacity = k > 0 ? 1 : 0;
      dotEl.style.transform = `translate(${lerp(sd.x, c.x, move).toFixed(1)}px,${lerp(sd.y, c.y, move).toFixed(1)}px) scale(${k.toFixed(3)})`;
      if (q > OPEN.seedT + OPEN.pause * .5) { linksEl.replaceChildren(); goDrop(); }
    }
  } else if (stage === 'drop') {
    const s = DROP_FREEZE ?? (performance.now() - T.drop) / 1000;   // ?stage=drop&t=1.6 → 그 순간에 고정
    // ① 흰 화면이 깊은 원근 공간으로 열린다. 카메라는 원을 바라본 채 돌아가므로 원은 가운데에 그대로 —
    //    "흰 종이 위의 원"이 사실은 높은 공중에 떠 있었다는 게 드러난다
    const o = smooth(0, FALL.open, s);
    view.elev = lerp(CAM.elevStart, FALL.elev, o);
    view.dist = lerp(CAM.distStart, FALL.dist, o);
    view.off = 0; view.ay = h0;
    pose();
    drawDust(o);
    // ② 잠깐 공중에 머물다가(아주 살짝 흔들림) 중력처럼 점점 빨라지며 바닥으로
    const s0 = FALL.open + FALL.hang;
    const u = clamp((s - s0) / FALL.dur);
    const hover = (1 - smooth(s0 - .2, s0 + .3, s)) * Math.sin(s * 2.4) * h0 * .004;
    const h = h0 * (1 - Math.pow(u, FALL.ease)) + hover;
    const p = proj(0, h, 0);
    dotPx = Math.max(4, DOT.size * Math.min(1.15, dropD0 / p[2]));   // 멀어지며 작아진다
    drawShadow(h);
    drawMotes(o, s, 1 - h / h0);
    // 속도가 붙을수록 원 위로 옅은 세로 잔상
    const v = FALL.ease * Math.pow(u, FALL.ease - 1);               // 0 → 2 (상대 속도)
    if (u > 0 && u < 1) {
      ctx.fillStyle = ACCENT;
      for (let i = 1; i <= FALL.trail; i++) {
        const q = proj(0, h + i * v * h0 * .025, 0);
        ctx.globalAlpha = .15 * (1 - i / (FALL.trail + 1)) * Math.min(1, v);
        ctx.beginPath(); ctx.arc(q[0], q[1], dotPx / 2 * (1 - i * .12), 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    dotEl.style.opacity = 1;
    dotEl.style.transform = `translate(${p[0].toFixed(1)}px,${p[1].toFixed(1)}px) scale(${(dotPx / DOT.size).toFixed(3)},${(dotPx / DOT.size * (1 + .12 * u)).toFixed(3)})`;
    if (u >= 1) startSpread();
  } else if (stage === 'spread') {
    const g = (performance.now() - T.spread) / 1000;
    // 닿는 순간: 납작해지며 스며든다
    const p0 = proj(0, 0, 0), sq = clamp(g / .25);
    if (sq < 1) {
      const q = Math.min(1, sq * 2), sc = dotPx / DOT.size;
      dotEl.style.opacity = (1 - sq).toFixed(3);
      dotEl.style.transform = `translate(${p0[0].toFixed(1)}px,${p0[1].toFixed(1)}px) scale(${(sc * lerp(1, 1.6, q)).toFixed(3)},${(sc * lerp(1, .4, q)).toFixed(3)})`;
    } else dotEl.style.opacity = 0;
    // 어둠이 닿은 자리에서 번진다
    const maxR = Math.hypot(Math.max(p0[0], W - p0[0]), Math.max(p0[1], H - p0[1])) + 300;
    nightR = maxR * easeOut(clamp(g / NIGHT.time));
    nightEl.style.setProperty('--r', nightR.toFixed(0) + 'px');
    body.classList.toggle('dark', nightR > maxR * .45);
    // 카메라: 닿은 자리(화면 아래쪽)에서, 줄기가 솟는 것을 따라 시선이 위로 올라가며 나무 전체가 화면을 채운다
    const k = smooth(0, 3, g);
    if (!reduceMotion && g > 1 && !orbit.drag) spin += dt * 360 / NEURAL.spin;
    // 키워드로 왔으면: 나무가 웬만큼 자란 뒤 그 작업의 가지가 앞으로 오게 돌고 조금 다가간다 (손대면 멈춘다)
    if (open.seed && !open.focus && g > NEURAL.growTime * .45) startFocus();
    const fc = open.focus;
    if (fc) {
      const d = ((fc.yaw - spin - orbit.yaw) % 360 + 540) % 360 - 180;
      orbit.yaw += d * .035; orbit.vy = 0;
      orbit.zoom += (OPEN.focusZoom - orbit.zoom) * .03;
      open.ayOff += ((fc.y - fit.ay) * .6 - open.ayOff) * .03;        // 시선도 그 가지 높이로
      if (!hovered && nowS() - fc.t0 < 6) hovered = fc.id;            // 커서가 다른 끝을 보고 있으면 그쪽이 먼저
      if (orbit.drag || nowS() - fc.t0 > 6) { open.focus = null; open.seed = null; }
    } else open.ayOff *= .985;                                       // 끝나면 천천히 나무 가운데로
    // 드래그로 돌려 보기 (손을 떼면 미끄러지다 멈춘다)
    if (!orbit.drag) {
      orbit.yaw += orbit.vy; orbit.elev += orbit.ve;
      orbit.vy *= ORBIT.inertia; orbit.ve *= ORBIT.inertia;
    }
    const baseElev = lerp(FALL.elev, NEURAL.elev, k);
    orbit.elev = clamp(orbit.elev, ORBIT.elevMin - NEURAL.elev, ORBIT.elevMax - NEURAL.elev);
    view.elev = baseElev + orbit.elev * k;
    view.dist = lerp(FALL.dist, fit.dist * orbit.zoom, k);
    view.ay = lerp(h0, fit.ay, k) + open.ayOff;
    view.off = 0;
    view.yaw = spin + orbit.yaw;
    pose();
    rise += dt * NEURAL.riseSpeed * (1 + 7 * Math.exp(-g * 1.2));   // 닿는 순간엔 빠르게 솟구치다가 천천히
    const grow = reduceMotion ? 1.02 : easeOut(clamp((g - .15) / NEURAL.growTime)) * 1.02;   // 땅에서 자라난다
    if (grow > .9) setReady();
    hoverA += ((hovered ? 1 : 0) - hoverA) * .08;
    renderDots(g, grow);
    drawSplash(dt);
    placeLabels(grow);
  } else pose();
}

// 흰 점 나무 그리기 (grow = 줄기부터 끝까지 자란 정도)
function renderDots(g, grow) {
  const ht = tips.find(x => x.id === hovered);
  Dots.render({
    C: [Cx, Cy, Cz], rot: [cth, sth, cps, sps], scr: [F, PX, PY, fit.dist], res: [W, H], dpr: DPR,
    rise: reduceMotion ? 0 : rise, riseY: [fit.bot, fit.top], riseR: smooth(0, 2.5, g), react: reactUniform(), rxSpeed: REACT.speed, rxLife: REACT.life,
    grow, time: reduceMotion ? 0 : performance.now() / 1000 * NEURAL.glow, accent: ACCENT_RGB, motion: reduceMotion ? 0 : 1, alpha: smooth(.1, .8, g),
    pulseSpeed: NEURAL.pulseSpeed, pulseW: NEURAL.pulseW,
    hoverB: ht ? ht.root : -99, hoverA,
    morphT: 99, morph: MORPH, floorS,
  });
}

/* ── 오프닝: 희미한 점들. 이름이 다가올수록 스쳐 지나가고, 커서 가까운 점은 진해진다 ── */
const field = (() => { const r = rng(5), a = []; for (let i = 0; i < OPEN.particles; i++) a.push([(r() - .5) * 2, (r() - .5) * 2, r(), .6 + r() * 1.1, r()]); return a; })();
function drawField(alpha, a, t) {
  if (alpha <= .01) return;
  const R2 = (H * OPEN.cursorR) ** 2, still = reduceMotion ? 0 : 1;
  ctx.fillStyle = INK;
  for (const [x, y, z0, sz, sd] of field) {
    const zf = ((z0 - a * OPEN.fly - t * .006 * still) % 1 + 1) % 1;   // 0 = 눈앞, 1 = 멀리
    const d = .12 + zf * 1.1;
    const px = W / 2 + x * W * .55 / d, py = H / 2 + y * H * .55 / d;
    if (px < -10 || px > W + 10 || py < -10 || py > H + 10) continue;
    const dd = (px - mouse.x) ** 2 + (py - mouse.y) ** 2;
    const k = Math.exp(-dd / R2);
    const tw = .7 + .3 * Math.sin(t * 1.1 * still + sd * 40);
    const al = alpha * .32 * tw * smooth(.12, .3, d) * (1 - smooth(.9, 1.22, d)) * (1 + OPEN.cursorBoost * k);
    if (al < .01) continue;
    const r = sz * Math.min(2.6, .6 / d) * (1 + .5 * k);
    ctx.globalAlpha = Math.min(1, al);
    ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// 키워드: 위·아래 띠에 떠서 아주 천천히 흔들린다. 이름과 함께 선명해지고 (clar), 정보가 나오면 물러난다 (hide)
const seedsEl = document.querySelector('.seeds');
const linksEl = document.querySelector('.links');
const seedNodes = [];          // {def, el, parent, kids, open, vis, x, y}
function placeSeeds(t, leave, clar, hide) {
  const still = reduceMotion ? 0 : 1, sd = open.seed;
  let i = 0;
  for (const n of seedNodes) {
    if (n.parent) continue;
    const [fx, fy] = SEED_SLOTS[i % SEED_SLOTS.length];
    n.x = fx * W + Math.sin(t * .3 + i * 1.7) * 7 * still;
    n.y = fy * H + Math.cos(t * .23 + i * 2.3) * 5 * still;
    i++;
  }
  for (const n of seedNodes) {
    if (!n.parent) continue;
    const p = n.parent, k = p.kids.length, j = p.kids.indexOf(n);
    n.x = p.x + (j - (k - 1) / 2) * Math.min(190, W * .17);
    n.y = p.y + (p.y < H / 2 ? 46 : -46);
  }
  for (const n of seedNodes) {
    n.vis += ((!n.parent || n.parent.open ? 1 : 0) - n.vis) * .15;
    if (sd && n === sd.node) continue;                     // 고른 키워드는 씨앗 단계가 움직인다
    const fade = sd ? (sd.related.includes(n) ? sd.relLeave : sd.otherLeave) : leave;
    const op = (.62 + .38 * clar) * (1 - hide) * n.vis * (1 - fade);
    n.el.style.transform = `translate(${n.x.toFixed(1)}px,${n.y.toFixed(1)}px) translate(-50%,-50%)`;
    n.el.style.opacity = op.toFixed(3);
    n.el.style.pointerEvents = stage === 'name' && op > .25 ? 'auto' : 'none';
    n.el.classList.toggle('open', n.open);
    n.el.classList.toggle('rel', !!sd && sd.related.includes(n));
  }
}

/* ── 떨어지는 동안: 바닥 먼지 · 그림자 ── */
// 바닥 먼지: 원근으로 지평선 쪽까지 넓게 깔려 깊이감을 만든다 (멀수록 작고 옅게)
const dust = (() => { const r = rng(9), a = []; for (let i = 0; i < 1800; i++) a.push([(r() - .5) * 70, -10 + Math.pow(r(), .7) * 110, .5 + r() * .6]); return a; })();
function drawDust(alpha) {
  if (alpha <= .01) return;
  for (const [x, z, s] of dust) {
    const p = proj(x, 0, z);
    if (p[2] < .2 || p[0] < -2 || p[0] > W + 2 || p[1] < -2 || p[1] > H + 2) continue;
    const a = alpha * (1 - smooth(18, 90, p[2])) * .55;
    if (a < .02) continue;
    const sz = s * Math.min(1.2, 20 / p[2]) + .35;
    ctx.fillStyle = `rgba(120,120,120,${a.toFixed(3)})`;
    ctx.fillRect(p[0], p[1], sz, sz);
  }
}
// 떠오르는 점: 원이 떨어지는 동안 주변의 작은 점들은 거꾸로 위로 떠오른다 (떨어지지만 솟는 느낌)
const motes = (() => { const r = rng(31), a = []; for (let i = 0; i < FALL.motes; i++) { const an = r() * 6.283, rr = .4 + Math.pow(r(), .6) * 4.5; a.push([Math.cos(an) * rr, r(), Math.sin(an) * rr, .6 + r() * .9, .5 + r()]); } return a; })();
function drawMotes(alpha, s, fallen) {
  if (alpha <= .01) return;
  const top = h0 * 1.35;
  ctx.fillStyle = '#6a6a6a';
  for (const [x, y0, z, sz, sp] of motes) {
    // 시간에 따라 천천히 + 원이 떨어진 만큼 더 위로 (상대 운동)
    const y = ((y0 + s * .08 * sp + fallen * .55 * sp) % 1) * top;
    const p = proj(x, y, z);
    if (p[2] < .2) continue;
    const q = proj(x, y - .25 * (.3 + fallen) * sp, z);            // 아래로 남는 짧은 꼬리 = 위로 올라가는 중
    const a = alpha * .5 * Math.sin(Math.PI * y / top) * Math.min(1, 14 / p[2]);
    if (a < .02) continue;
    ctx.globalAlpha = a;
    const r = sz * Math.min(1.4, 16 / p[2]);
    ctx.fillRect(p[0] - r / 2, p[1] - r / 2, r, r);
    ctx.globalAlpha = a * .35;
    ctx.fillRect(p[0] - r / 4, p[1], r / 2, Math.max(0, q[1] - p[1]));
  }
  ctx.globalAlpha = 1;
}
// 원이 낮아질수록 그림자는 작고 진해져 닿는 순간 원과 만난다 (처음엔 크고 거의 안 보임)
function drawShadow(h) {
  const p = proj(0, 0, 0);
  if (p[2] < .1) return;
  const r = F * .035 / p[2] * (1 + h * .6);
  const a = .14 * Math.pow(1 - Math.min(1, h / Math.max(1, h0)), 2);
  ctx.fillStyle = `rgba(0,0,0,${a.toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(p[0], p[1], r, r * Math.max(.18, sth * 1.1), 0, 0, 7);
  ctx.fill();
}
function drawSplash(dt) {
  ctx.fillStyle = ACCENT;
  for (const s of splash) {
    s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 400 * dt;
    if (s.t > s.life) continue;
    ctx.globalAlpha = 1 - s.t / s.life;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  splash = splash.filter(s => s.t < s.life);
}

/* ═════════ input ═════════ */
// 첫 손길(누르기 · 키)에 소리를 켠다 (브라우저는 휠만으로는 소리를 허락하지 않는다)
let soundTried = false;
const firstTouch = () => { if (soundTried) return; soundTried = true; if (Sound.ensure()) setSound(true); };
addEventListener('pointerdown', firstTouch, { passive: true });
addEventListener('keydown', firstTouch);
const opening = () => stage === 'name' && !current;
// 스크롤: 올리면 (dy < 0) 이름이 다가오고, 내리면 멀어진다 (dy = 화면 px)
function scrollOpen(dy) {
  open.approachT = clamp(open.approachT - dy / (H * OPEN.scroll));
}
document.addEventListener('click', e => {
  if (e.target.closest('a, button, .top, #sheet, .hud, .info')) return;
  if (stage === 'name') {
    if (seedNodes.some(n => n.open)) { seedNodes.forEach(n => { n.open = false; }); return; }   // 펼친 작은 키워드부터 접고
    goGather(); return;                                              // 클릭 = 다음 화면으로
  }
  if (stage === 'spread') {
    if (dragged) { dragged = false; return; }                      // 돌리고 난 뒤의 클릭은 무시
    const hit = hitTip(e.clientX, e.clientY);
    if (hit) { origin = { x: hit.sx, y: hit.sy }; location.hash = hit.href || '#/' + hit.id; }
    else reactAt(e.clientX, e.clientY, true);                       // 줄기를 누르면 나무 전체로 연쇄 반응
  }
});
// 터치: 위로 밀면 스크롤, 움직인 만큼 이름도 다가온다
let touchY = null, touchX = null;
addEventListener('touchstart', e => { touchY = e.touches[0].clientY; touchX = e.touches[0].clientX; }, { passive: true });
addEventListener('touchmove', e => {
  if (!opening() || touchY == null) return;
  const y = e.touches[0].clientY, x = e.touches[0].clientX;
  scrollOpen((touchY - y) * 1.4);                                    // 손가락을 내리면 (= 스크롤 올림) 다가온다
  touchY = y; touchX = x;
}, { passive: true });
/* 3D 로 돌려 보기: 빈 곳을 드래그 */
let dragged = false, lastReactT = 0;
const canOrbit = e => stage === 'spread' && ready && !current && !(e.target.closest && e.target.closest('a, button, .top, #sheet, .lbl'));
addEventListener('pointerdown', e => {
  if (!canOrbit(e) || (e.pointerType === 'mouse' && e.button !== 0)) return;
  orbit.drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId };
  open.focus = null; open.seed = null;
  orbit.vy = orbit.ve = 0; dragged = false;
});
addEventListener('pointermove', e => {
  const dg = orbit.drag;
  if (dg && e.pointerId === dg.id) {
    const dx = e.clientX - dg.x, dy = e.clientY - dg.y;
    dg.x = e.clientX; dg.y = e.clientY; dg.moved += Math.abs(dx) + Math.abs(dy);
    if (dg.moved > 6) { dragged = true; body.classList.add('grabbing'); }
    orbit.yaw += dx * ORBIT.drag; orbit.elev += dy * ORBIT.drag * .7;
    orbit.vy = dx * ORBIT.drag * .25; orbit.ve = dy * ORBIT.drag * .15;   // 손을 뗄 때의 미끄러짐
    return;
  }
  // 커서가 줄기에 닿으면 그 줄기에서 반응이 번진다
  if (stage === 'spread' && !current && performance.now() - lastReactT > 60) {
    lastReactT = performance.now();
    reactAt(e.clientX, e.clientY, false);
  }
}, { passive: true });
const endDrag = e => {
  if (!orbit.drag || (e.pointerId != null && e.pointerId !== orbit.drag.id)) return;
  orbit.drag = null; body.classList.remove('grabbing');
  if (!dragged) orbit.vy = orbit.ve = 0;
};
addEventListener('pointerup', endDrag);
addEventListener('pointercancel', endDrag);
/* 휠 · 트랙패드 핀치 = 확대 */
addEventListener('wheel', e => {
  if (current || (e.target.closest && e.target.closest('#sheet'))) return;
  if (opening()) {
    e.preventDefault();
    scrollOpen(e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? H : 1));
    return;
  }
  if (stage !== 'spread') return;
  e.preventDefault();
  if (open.wheelLock) {                                  // 오프닝에서 이어진 휠은 멈출 때까지 흘려보낸다
    if (performance.now() - open.wheelLock < 450) { open.wheelLock = performance.now(); return; }
    open.wheelLock = 0;
  }
  const ht = hovered && tips.find(x => x.id === hovered);
  if (ht && (ht.kind === 'work' || ht.kind === 'key') && !e.ctrlKey) {  // 단어 위: 스크롤을 올리면 다가오며 한국어로
    ht.near = clamp(ht.near - e.deltaY * (e.deltaMode === 1 ? 16 : 1) / (H * .9));
    return;
  }
  orbit.zoom = clamp(orbit.zoom * Math.exp(e.deltaY * (e.ctrlKey ? .01 : .0012)), ORBIT.zoomMin, ORBIT.zoomMax);
}, { passive: false });
addEventListener('keydown', e => {
  if (e.key === 'Escape' && current) { location.hash = '#/'; return; }
  if (!opening() || e.target.closest('a, button')) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goGather(); return; }
  const step = { ArrowDown: 1, PageDown: 1, ArrowUp: -1, PageUp: -1 }[e.key];
  if (!step) return;
  e.preventDefault();
  scrollOpen(step * H * .3);
});
addEventListener('pointermove', e => {
  moveAct = Math.max(moveAct, Math.min(1, Math.hypot(e.movementX || 0, e.movementY || 0) / 40));
  mouse.x = e.clientX; mouse.y = e.clientY;
  cursorEl.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
  // 살짝 커지는 곳: 링크·버튼·작업 점
  const onUi = e.target.closest && e.target.closest('a, button');
  const hit = !current && !onUi ? hitTip(e.clientX, e.clientY) : null;
  if (!(e.target.closest && e.target.closest('.lbl'))) hovered = hit ? hit.id : null;
  cursorEl.classList.toggle('hot', !!hit || !!onUi);
}, { passive: true });
document.addEventListener('pointerleave', () => { mouse.x = mouse.y = -9999; });

// Archive · 브랜드: 오프닝으로 되돌리지 않고 다 자란 공간으로
function goArchive(e) {
  e.preventDefault();
  if (location.hash.length > 2) history.pushState(null, '', '#/'), route();
  if (stage !== 'spread') finishInstant();
}
document.querySelectorAll('[data-archive], [data-home]').forEach(a => a.addEventListener('click', goArchive));
document.querySelector('.replay').addEventListener('click', e => { e.stopPropagation(); replay(); });

/* ═════════ pages (hash route) ═════════ */
const sheet = document.getElementById('sheet');
const inner = document.getElementById('sheetInner');
let origin = null, current = null, sheetCovering = false, coverTimer;
let io;

function mount(id) {
  const tpl = document.getElementById('tpl-' + id);
  inner.replaceChildren(tpl.content.cloneNode(true));
  sheet.scrollTop = 0;
  io?.disconnect();
  io = new IntersectionObserver(es => es.forEach(en => {
    if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }), { root: sheet, threshold: .12 });
  inner.querySelectorAll('.r').forEach((el, i) => {
    el.style.transitionDelay = (i < 4 ? i * .08 + .35 : 0) + 's';
    io.observe(el);
  });
  // 페이지 안의 '다음 작업' 링크는 원을 화면 가운데에서 다시 연다
  inner.querySelectorAll('a[href^="#/"]').forEach(a => a.addEventListener('click', () => { origin = null; }));
}

function route() {
  const id = location.hash.replace(/^#\/?/, '');
  const exists = id && document.getElementById('tpl-' + id);
  clearTimeout(coverTimer);
  if (!exists) {
    sheetCovering = false;
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    body.classList.remove('sheet-open');
    current = null;
    return;
  }
  if (current && current !== id) {             // 페이지 → 페이지: 살짝 페이드
    inner.style.transition = 'opacity .35s'; inner.style.opacity = 0;
    setTimeout(() => { mount(id); inner.style.opacity = 1; }, 350);
    current = id; return;
  }
  // 가지 끝 점에서 원이 퍼지며 열린다
  const tp = tips.find(t => t.id === id);
  const o = origin || (tp && tp.sx != null ? { x: tp.sx, y: tp.sy } : { x: innerWidth / 2, y: innerHeight / 2 });
  sheet.style.setProperty('--x', o.x + 'px');
  sheet.style.setProperty('--y', o.y + 'px');
  origin = null;
  mount(id);
  current = id;
  hovered = null;
  sheet.setAttribute('aria-hidden', 'false');
  body.classList.add('sheet-open');
  requestAnimationFrame(() => sheet.classList.add('open'));
  coverTimer = setTimeout(() => { sheetCovering = true; }, 1150);
}
addEventListener('hashchange', route);

/* ═════════ sound toggle ═════════ */
const soundBtn = document.querySelector('.sound');
function setSound(on) {
  soundBtn.querySelector('span').textContent = on ? 'on' : 'off';
  soundBtn.setAttribute('aria-pressed', on);
}
soundBtn.addEventListener('click', e => { e.stopPropagation(); setSound(Sound.toggle()); });

/* ═════════ boot ═════════ */
// 작업 페이지(.sheet)의 코튼지 결
(() => {
  const n = 220, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n), d = img.data;
  const r = rng(77);
  for (let i = 0; i < n * n; i++) {
    const v = r(), o = i * 4;
    d[o] = d[o + 1] = d[o + 2] = v < .5 ? 0 : 255;
    d[o + 3] = Math.abs(v - .5) * 26;
  }
  g.putImageData(img, 0, 0);
  document.documentElement.style.setProperty('--grain', `url(${c.toDataURL()})`);
})();

// 이름을 한 글자씩 감싼다 (쓰기 · 오므라들기용). 공백은 한 칸 비운 채로 둔다
(() => {
  const nm = document.querySelector('.c-name');
  const text = nm.textContent;
  nm.textContent = '';
  for (const ch of text) {
    if (/\s/.test(ch)) { nm.appendChild(document.createTextNode(ch)); continue; }
    const s = document.createElement('span'); s.className = 'ch'; s.textContent = ch; nm.appendChild(s);
  }
})();

Dots.init(document.getElementById('dots'));
function resize() {
  DPR = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  Dots.resize(W, H, DPR);
  pose();
}

const nameRow = document.querySelector('.card .c-row');
// 첫 화면의 키워드 (SEEDS). 누르면 그 작업의 씨앗이 된다 / 작은 키워드를 펼친다
(() => {
  const make = (def, parent) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'seed' + (parent ? ' kid' : '') + (def.kids ? ' has-kids' : '');
    b.innerHTML = `<span class="en">${def.en}</span><span class="ko">${def.ko}</span>`;
    b.setAttribute('aria-label', `${def.en} (${def.ko})`);
    const node = { def, el: b, parent, kids: [], open: false, vis: parent ? 0 : 1, x: 0, y: 0 };
    b.addEventListener('click', e => { e.stopPropagation(); goSeed(node); });
    seedsEl.appendChild(b);
    seedNodes.push(node);
    if (parent) parent.kids.push(node);
    (def.kids || []).forEach(k => make(k, node));
    return node;
  };
  SEEDS.forEach(d => make(d, null));
})();
setStage('name');
const fontsReady = document.fonts
  ? Promise.race([
      Promise.all([
        document.fonts.load('500 60px "Inter"', 'Kim Yewon Instagram Web'),
        document.fonts.load('300 13px "Noto Sans KR"', JSON.stringify(SEEDS) + JSON.stringify(KEYS) + '감각으로 전하다경험으로 자라고김예원디자이너' + WORKS.map(w => w.sub).join('')),
      ]),
      new Promise(r => setTimeout(r, 2000)),           // 오프라인이면 기본 글꼴로 시작
    ]).catch(() => {})
  : Promise.resolve();
fontsReady.then(() => {
  resize();
  // 이름의 원래 글자 크기 · 폭 (다가올 때 화면을 얼마나 채울지 계산)
  open.base = parseFloat(getComputedStyle(nameRow).fontSize);
  const probe = document.createElement('span');
  probe.textContent = nameEl.textContent;
  probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${getComputedStyle(nameRow).font};letter-spacing:-.01em`;
  document.body.appendChild(probe);
  open.w0 = probe.getBoundingClientRect().width;
  probe.remove();
  if (START === 'spread') finishInstant();
  else {
    goName();
    if (params.has('a')) open.approach = open.approachT = parseFloat(params.get('a'));   // ?a=1 → 다 다가온 상태
    if (START === 'drop') { finishWriting(true); goDrop(); }
  }
  requestAnimationFrame(frame);
  route();
});
