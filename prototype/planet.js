// Планета главного экрана. Всё её состояние — два числа от 0 до 1:
// kaizen (любовь, близость) и blueOcean (достаток, новые возможности).
// Шейдеры читают их напрямую; переходы между состояниями — плавные твины.

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const DEG = Math.PI / 180;

// Та же развёртка, что у SphereGeometry: долгота 0 смотрит в +X, восток — в −Z.
function latLon(lat, lon, r = 1) {
  const phi = (lon + 180) * DEG;
  const theta = (90 - lat) * DEG;
  return new THREE.Vector3(
    -Math.cos(phi) * Math.sin(theta) * r,
    Math.cos(theta) * r,
    Math.sin(phi) * Math.sin(theta) * r
  );
}

const NOISE = /* glsl */`
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
                   mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
                   mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
    return s;
  }
`;

const SURFACE_VERT = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vPosO;
  void main() {
    vUv = uv;
    vPosO = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const EARTH_FRAG = /* glsl */`
  uniform sampler2D uDay, uNight, uWater, uHeat;
  uniform vec3 uSunDir, uCamPos;
  uniform float uK, uB, uTime, uResidual, uMotion;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vPosO;
  ${NOISE}
  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(uCamPos - vPosW);
    vec3 L = normalize(uSunDir);
    float ndl = dot(N, L);
    float dayMix = smoothstep(-0.10, 0.20, ndl);
    float k = uK, b = uB;
    float health = clamp(0.5 * k + 0.5 * b, 0.0, 1.0);
    float sick = 1.0 - health;

    vec3 day = texture2D(uDay, vUv).rgb;
    float water = texture2D(uWater, vUv).r;
    float heat = texture2D(uHeat, vUv).r;
    float lights = texture2D(uNight, vUv).r;

    // Суша. Kaizen: зелень прорастает из множества точек, а не заливкой.
    float lum = dot(day, vec3(0.2126, 0.7152, 0.0722));
    float snow = smoothstep(0.45, 0.7, lum);
    float growN = noise(vPosO * 26.0) * 0.55 + noise(vPosO * 7.0) * 0.45;
    float grow = smoothstep(growN - 0.10, growN + 0.10, k * 1.1);
    vec3 lush = day * vec3(0.80, 1.22, 0.74);
    vec3 land = mix(day, lush, grow * (1.0 - snow) * 0.65);

    // Океан. Blue Ocean: вода становится глубокой, чистой и светится.
    vec3 deep = day * vec3(0.55, 1.05, 1.55) + vec3(0.0, 0.012, 0.04);
    vec3 ocean = mix(day, deep, b);
    // Красный океан: в болезни вода мутная, с ржавым оттенком.
    ocean = mix(ocean, vec3(lum) * vec3(0.9, 0.55, 0.5), sick * 0.35);
    vec3 surf = mix(land, ocean, water);

    // Болезнь: цвет выцветает в сепию и тускнеет.
    vec3 sepia = vec3(lum) * vec3(1.10, 0.95, 0.80);
    surf = mix(surf, sepia * 0.85, sick * 0.55);

    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 140.0) * water * (0.15 + 0.35 * b) * smoothstep(0.05, 0.35, dot(N, V));
    vec3 dayCol = surf * (0.06 + 1.1 * max(ndl, 0.0)) + vec3(1.0, 0.95, 0.88) * spec * 0.6;
    // тёплая полоса терминатора
    dayCol += vec3(1.0, 0.25, 0.06) * 0.07 * exp(-pow(ndl * 7.0, 2.0)) * (1.0 - water * 0.5);

    // Ночь. Огни не гаснут, а меняют цвет: планета лечится вместе с людьми.
    // Цвета — в линейном пространстве: на экране они станут светлее.
    vec3 cSick = vec3(1.00, 0.09, 0.03);
    vec3 cCold = vec3(0.45, 0.66, 1.00);
    vec3 cWarm = vec3(1.00, 0.45, 0.12);
    vec3 cBoth = vec3(1.00, 0.60, 0.25);
    vec3 lightCol = mix(mix(cSick, cCold, b), mix(cWarm, cBoth, b), k);
    float jitter = 0.5 + 0.5 * sin(uTime * 3.3 + noise(vPosO * 45.0) * 14.0);
    float flicker = 1.0 - (1.0 - k) * (1.0 - 0.6 * b) * 0.45 * jitter * uMotion;
    // «Богатая, но холодная»: мелкие огоньки гаснут, остаются одинокие крупные.
    float lonely = b * (1.0 - k);
    float lit = smoothstep(0.02 + 0.22 * lonely, 0.75, lights);
    vec3 nightCol = surf * 0.025 + lightCol * lit * flicker * 2.2;
    vec3 col = mix(nightCol, dayCol, dayMix);

    // Очаги износа — по плотности населения. Kaizen гасит их точками,
    // Blue Ocean — широкими областями. До нуля не доходит: не максимум.
    float fineN = noise(vPosO * 34.0);
    float coarseN = fbm(vPosO * 2.2);
    float reliefK = smoothstep(fineN - 0.10, fineN + 0.10, k * 0.92) * 0.9;
    float reliefB = smoothstep(coarseN - 0.14, coarseN + 0.14, b * 1.08) * 0.7;
    // очаги — как угли: плотнее в центрах городов, слабее над водой
    float ember = 0.55 + 0.45 * noise(vPosO * 70.0);
    float fever = pow(heat, 1.5) * ember * (1.0 - 0.75 * water) * (1.0 - reliefK) * (1.0 - reliefB) * uResidual;
    float pulse = 1.0 - 0.28 * uMotion * (0.5 + 0.5 * sin(uTime * 1.7 + coarseN * 10.0));
    col += vec3(1.0, 0.035, 0.012) * fever * pulse * mix(0.32, 1.25, 1.0 - dayMix);

    // Атмосфера на краю диска: в болезни — смог, в здоровье — чистая синева.
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    vec3 haze = mix(vec3(0.55, 0.16, 0.08), vec3(0.13, 0.36, 1.0), health);
    col += haze * fres * (0.15 + 0.85 * smoothstep(-0.3, 0.5, ndl)) * 0.55;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const CLOUD_FRAG = /* glsl */`
  uniform sampler2D uClouds;
  uniform vec3 uSunDir;
  uniform float uHealth, uShift;
  varying vec2 vUv;
  varying vec3 vNormalW;
  void main() {
    float c = texture2D(uClouds, vec2(vUv.x + uShift, vUv.y)).r;
    c = smoothstep(0.18, 0.95, c);
    float ndl = dot(normalize(vNormalW), normalize(uSunDir));
    float day = smoothstep(-0.12, 0.25, ndl);
    vec3 tint = mix(vec3(0.74, 0.62, 0.52), vec3(1.0), uHealth);
    vec3 col = tint * (0.04 + 1.05 * max(ndl, 0.0));
    gl_FragColor = vec4(col, c * (0.06 + 0.74 * day));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const ATMO_VERT = /* glsl */`
  varying vec3 vNormalV;
  varying vec3 vNormalW;
  void main() {
    vNormalV = normalize(normalMatrix * normal);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ATMO_FRAG = /* glsl */`
  uniform vec3 uSunDir;
  uniform float uHealth, uEdge;
  varying vec3 vNormalV;
  varying vec3 vNormalW;
  void main() {
    // Видно только кольцо вокруг Земли: 1 у края диска, 0 у внешнего края.
    float i = pow(clamp(-vNormalV.z / uEdge, 0.0, 1.0), 1.6);
    float sun = smoothstep(-0.45, 0.6, dot(normalize(vNormalW), normalize(uSunDir)));
    vec3 col = mix(vec3(0.70, 0.20, 0.09), vec3(0.12, 0.38, 1.0), uHealth);
    float a = i * (0.18 + 0.82 * sun) * 0.9;
    gl_FragColor = vec4(col * a, a);
    #include <colorspace_fragment>
  }
`;

const LINE_VERT = /* glsl */`
  attribute float aT;
  attribute float aSeed;
  varying float vT;
  varying float vSeed;
  void main() {
    vT = aT;
    vSeed = aSeed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Дуги Blue Ocean: по ним бегут импульсы обмена от города к городу.
const ARC_FRAG = /* glsl */`
  uniform float uAmount, uTime, uMotion;
  uniform vec3 uColor;
  varying float vT;
  varying float vSeed;
  void main() {
    float appear = smoothstep(vSeed * 0.8, vSeed * 0.8 + 0.2, uAmount);
    float ends = smoothstep(0.0, 0.06, vT) * smoothstep(1.0, 0.94, vT);
    float head = fract(uTime * 0.12 + vSeed * 7.0);
    float d = head - vT;
    float tail = step(0.0, d) * exp(-d * 10.0) * uMotion;
    float a = appear * ends * (0.07 + 1.1 * tail);
    gl_FragColor = vec4(uColor * a, a);
    #include <colorspace_fragment>
  }
`;

// Нити Kaizen: короткие связи между соседями, мерцают спокойно.
const THREAD_FRAG = /* glsl */`
  uniform float uAmount, uTime, uMotion;
  uniform vec3 uColor;
  varying float vT;
  varying float vSeed;
  void main() {
    float appear = smoothstep(vSeed * 0.85, vSeed * 0.85 + 0.15, uAmount);
    float ends = smoothstep(0.0, 0.15, vT) * smoothstep(1.0, 0.85, vT);
    float shimmer = 0.7 + 0.3 * sin(uTime * 1.2 + vSeed * 40.0) * uMotion;
    float a = appear * ends * shimmer * 0.55;
    gl_FragColor = vec4(uColor * a, a);
    #include <colorspace_fragment>
  }
`;

function buildLines(pairs, segments, lift, material) {
  const pos = [];
  const t = [];
  const seed = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const p = new THREE.Vector3();
  let prev = new THREE.Vector3();
  let prevT = 0;
  pairs.forEach(([lat1, lon1, lat2, lon2], i) => {
    a.copy(latLon(lat1, lon1));
    b.copy(latLon(lat2, lon2));
    const angle = a.angleTo(b);
    const h = lift(angle);
    const s = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const rnd = Math.abs(s);
    for (let j = 0; j <= segments; j++) {
      const u = j / segments;
      // сферическая интерполяция + подъём над поверхностью
      const sinA = Math.sin(angle);
      const w1 = Math.sin((1 - u) * angle) / sinA;
      const w2 = Math.sin(u * angle) / sinA;
      p.set(a.x * w1 + b.x * w2, a.y * w1 + b.y * w2, a.z * w1 + b.z * w2)
        .normalize().multiplyScalar(1.002 + h * Math.sin(Math.PI * u));
      if (j > 0) {
        pos.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
        t.push(prevT, u);
        seed.push(rnd, rnd);
      }
      prev = p.clone();
      prevT = u;
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aT', new THREE.Float32BufferAttribute(t, 1));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  return new THREE.LineSegments(geo, material);
}

function buildStars(count) {
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const alpha = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    pos.set([r * Math.cos(th) * 60, u * 60, r * Math.sin(th) * 60], i * 3);
    size[i] = 0.6 + Math.pow(Math.random(), 4) * 1.8;
    alpha[i] = 0.25 + Math.random() * 0.6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPixel: { value: 1 } },
    vertexShader: `
      attribute float aSize; attribute float aAlpha; uniform float uPixel; varying float vA;
      void main() { vA = aAlpha; gl_PointSize = aSize * uPixel;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying float vA;
      void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
        gl_FragColor = vec4(vec3(0.85, 0.9, 1.0), vA * smoothstep(0.5, 0.1, d)); }`,
    transparent: true,
    depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export class Planet {
  constructor(canvas, { reducedMotion = false, textureBase = 'assets/planet/', onReady } = {}) {
    this.canvas = canvas;
    this.reducedMotion = reducedMotion;
    this.base = textureBase;
    this.state = { k: 0, b: 0 };
    this.tween = { k: null, b: null };
    this.residual = 1;
    this.running = false;
    this.clock = new THREE.Clock();
    this.time = 0;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x060a14, 1);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
    this.sun = new THREE.Vector3(-0.82, 0.32, 0.48).normalize();

    this.tilt = new THREE.Group();
    this.tilt.rotation.set(0.28, 0, -0.32);
    this.spin = new THREE.Group();
    this.tilt.add(this.spin);
    this.scene.add(this.tilt);
    // В начале к зрителю повёрнуты Европа и Африка, Азия уходит в ночь.
    const phi = (22 + 180) * DEG;
    this.spin.rotation.y = -Math.atan2(-Math.cos(phi), Math.sin(phi));

    this.stars = buildStars(1600);
    this.scene.add(this.stars);

    this.shared = {
      uK: { value: 0 }, uB: { value: 0 }, uTime: { value: 0 }, uResidual: { value: 1 },
      uMotion: { value: reducedMotion ? 0 : 1 },
      uSunDir: { value: this.sun }, uCamPos: { value: this.camera.position },
    };

    const mobile = Math.min(window.innerWidth, window.innerHeight) < 700;
    this.mobile = mobile;
    const loader = new THREE.TextureLoader();
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const tex = (name, srgb = false) => new Promise((resolve, reject) => {
      loader.load(this.base + name, (t) => {
        t.anisotropy = aniso;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.wrapS = THREE.RepeatWrapping;
        resolve(t);
      }, undefined, reject);
    });
    const big = !mobile && window.innerWidth * Math.min(2, window.devicePixelRatio || 1) > 1800;
    Promise.all([
      tex(big ? 'day-4k.jpg' : 'day-2k.jpg', true),
      tex(big ? 'night-4k.jpg' : 'night-2k.jpg'),
      tex('water-2k.png'),
      tex('heat-1k.png'),
      tex('clouds-2k.jpg'),
      fetch(this.base + 'links.json').then((r) => r.json()),
    ]).then(([day, night, water, heat, clouds, links]) => {
      this.build({ day, night, water, heat, clouds, links, mobile });
      onReady && onReady();
    }).catch((err) => {
      console.error('Планета не загрузилась', err);
      onReady && onReady(err);
    });
  }

  build({ day, night, water, heat, clouds, links, mobile }) {
    const seg = mobile ? [128, 96] : [192, 128];
    const earthMat = new THREE.ShaderMaterial({
      uniforms: {
        ...this.shared,
        uDay: { value: day }, uNight: { value: night }, uWater: { value: water }, uHeat: { value: heat },
      },
      vertexShader: SURFACE_VERT,
      fragmentShader: EARTH_FRAG,
    });
    this.spin.add(new THREE.Mesh(new THREE.SphereGeometry(1, seg[0], seg[1]), earthMat));

    this.cloudUniforms = {
      uClouds: { value: clouds }, uSunDir: this.shared.uSunDir, uHealth: { value: 0 }, uShift: { value: 0 },
    };
    const cloudMat = new THREE.ShaderMaterial({
      uniforms: this.cloudUniforms,
      vertexShader: SURFACE_VERT,
      fragmentShader: CLOUD_FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.spin.add(new THREE.Mesh(new THREE.SphereGeometry(1.007, seg[0], seg[1]), cloudMat));

    const atmoR = 1.1;
    this.atmoUniforms = {
      uSunDir: this.shared.uSunDir, uHealth: { value: 0 },
      uEdge: { value: Math.sqrt(1 - 1 / (atmoR * atmoR)) },
    };
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(atmoR, 96, 64),
      new THREE.ShaderMaterial({
        uniforms: this.atmoUniforms,
        vertexShader: ATMO_VERT,
        fragmentShader: ATMO_FRAG,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.tilt.add(atmo);

    const lineMat = (frag, color) => new THREE.ShaderMaterial({
      uniforms: {
        uAmount: { value: 0 }, uTime: this.shared.uTime, uMotion: this.shared.uMotion,
        uColor: { value: new THREE.Color(color) },
      },
      vertexShader: LINE_VERT,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const arcs = links.arcs.filter((_, i) => i % 3 !== 2);
    this.arcs = buildLines(arcs, 48, (ang) => 0.025 + 0.18 * (ang / Math.PI), lineMat(ARC_FRAG, 0x5cc8ff));
    const threads = mobile ? links.threads.filter((_, i) => i % 2 === 0) : links.threads;
    this.threads = buildLines(threads, 8, (ang) => 0.003 + 0.08 * ang, lineMat(THREAD_FRAG, 0xffc46b));
    this.spin.add(this.arcs, this.threads);

    this.ready = true;
    this.apply();
    this.start();
  }

  // Куда поставить планету: центр и радиус диска в пикселях холста.
  layout(width, height, cx, cy, radius) {
    const dpr = Math.min(window.devicePixelRatio || 1, this.mobile ? 1.75 : 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.stars.material.uniforms.uPixel.value = dpr;
    const cam = this.camera;
    cam.aspect = width / height;
    const halfFov = (cam.fov / 2) * DEG;
    const alpha = Math.atan((radius / (height / 2)) * Math.tan(halfFov));
    cam.position.set(0, 0, 1 / Math.sin(alpha));
    cam.setViewOffset(width, height, -(cx - width / 2), -(cy - height / 2), width, height);
    cam.updateProjectionMatrix();
    this.renderOnce();
  }

  // Новое целевое состояние. instant — без анимации (при возвращении на сайт).
  set(k, b, { instant = false } = {}) {
    const dur = this.reducedMotion ? 0.6 : 4.5;
    for (const [key, to] of [['k', k], ['b', b]]) {
      if (instant) {
        this.state[key] = to;
        this.tween[key] = null;
      } else if (this.tween[key]?.to !== to && this.state[key] !== to) {
        this.tween[key] = { from: this.state[key], to, t: 0, dur };
      }
    }
    this.target = { k, b };
    if (instant) this.residual = k && b ? 0.5 : 1;
    this.apply();
    this.renderOnce();
  }

  apply() {
    const { k, b } = this.state;
    this.shared.uK.value = k;
    this.shared.uB.value = b;
    this.shared.uResidual.value = this.residual;
    if (!this.ready) return;
    const health = 0.5 * k + 0.5 * b;
    this.cloudUniforms.uHealth.value = health;
    this.atmoUniforms.uHealth.value = health;
    this.arcs.material.uniforms.uAmount.value = b;
    this.threads.material.uniforms.uAmount.value = k;
  }

  step(dt) {
    for (const key of ['k', 'b']) {
      const tw = this.tween[key];
      if (!tw) continue;
      tw.t += dt;
      const x = Math.min(1, tw.t / tw.dur);
      this.state[key] = tw.from + (tw.to - tw.from) * ease(x);
      if (x >= 1) this.tween[key] = null;
    }
    // Когда оба направления включены, улучшение не останавливается:
    // последние очаги медленно гаснут, но до нуля не доходят.
    const both = this.target && this.target.k && this.target.b && !this.tween.k && !this.tween.b;
    const goal = both ? 0.22 : 1;
    const rate = both ? 1 / 30 : 1 / 1.5;
    this.residual += (goal - this.residual) * Math.min(1, dt * rate * 3);
    this.apply();
    if (!this.reducedMotion) {
      this.spin.rotation.y += dt * 0.035;
      this.cloudUniforms.uShift.value = (this.cloudUniforms.uShift.value + dt * 0.0012) % 1;
    }
    this.time += dt;
    this.shared.uTime.value = this.time;
  }

  start() {
    if (this.running || !this.ready) return;
    this.running = true;
    this.clock.getDelta();
    const loop = () => {
      if (!this.running) return;
      this.step(Math.min(0.1, this.clock.getDelta()));
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  renderOnce() {
    if (this.ready && !this.running) this.renderer.render(this.scene, this.camera);
  }
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch (e) {
    return false;
  }
}
