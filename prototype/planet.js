// Планета главного экрана. Всё её состояние — два числа от 0 до 1:
// kaizen (любовь, близость) и blueOcean (достаток, новые возможности).
// Шейдеры читают их напрямую; переходы между состояниями — плавные твины.
//
// Что меняется: воздух (смог рассеивается), вода (мутная становится чистой
// и синей), земля (выжженная зеленеет), огни городов меняют цвет, очаги износа
// гаснут. Кольцо вокруг планеты — символ единства: Kaizen строит одну его
// половину, Blue Ocean — другую, и только вместе кольцо смыкается.

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const DEG = Math.PI / 180;

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
    float smog = 1.0 - 0.5 * k - 0.5 * b;   // воздух: каждое направление чистит половину

    vec3 day = texture2D(uDay, vUv).rgb;
    float water = texture2D(uWater, vUv).r;
    float heat = texture2D(uHeat, vUv).r;
    float lights = texture2D(uNight, vUv).r;
    float lum = dot(day, vec3(0.2126, 0.7152, 0.0722));

    // Земля: выжженная сепия → естественный цвет → зелень, которая
    // прорастает из множества точек (Kaizen — маленькими шагами).
    float snow = smoothstep(0.45, 0.7, lum);
    vec3 barren = vec3(lum) * vec3(1.12, 0.95, 0.76) * 0.92;
    vec3 land = mix(barren, day, clamp(0.25 + 0.45 * b + 0.3 * k, 0.0, 1.0));
    float growN = noise(vPosO * 26.0) * 0.55 + noise(vPosO * 7.0) * 0.45;
    float grow = smoothstep(growN - 0.10, growN + 0.10, k * 1.1);
    land = mix(land, day * vec3(0.78, 1.25, 0.72), grow * (1.0 - snow) * 0.6);

    // Вода: мутная, бурая → чистая глубокая синева (Blue Ocean).
    vec3 murky = vec3(lum) * vec3(0.95, 0.84, 0.70) * 0.85 + vec3(0.02, 0.014, 0.008);
    vec3 ocean = mix(murky, day, clamp(0.25 + 0.3 * k + 0.45 * b, 0.0, 1.0));
    ocean = mix(ocean, day * vec3(0.55, 1.05, 1.55) + vec3(0.0, 0.012, 0.04), b);
    vec3 surf = mix(land, ocean, water);

    // Смог поверх всего: бурая дымка, тем плотнее, чем больнее планета.
    vec3 smogCol = vec3(0.46, 0.38, 0.30);
    surf = mix(surf, smogCol * (0.35 + lum), smog * 0.38);

    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 140.0) * water * (0.1 + 0.4 * b) * smoothstep(0.05, 0.35, dot(N, V));
    vec3 dayCol = surf * (0.06 + 1.1 * max(ndl, 0.0)) + vec3(1.0, 0.95, 0.88) * spec * 0.6;
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
    float lonely = b * (1.0 - k);   // «богатая, но холодная»: остаются одинокие огни
    float lit = smoothstep(0.02 + 0.22 * lonely, 0.75, lights);
    vec3 nightSky = mix(vec3(0.010, 0.020, 0.056), vec3(0.030, 0.019, 0.012), smog);
    vec3 nightCol = surf * 0.05 + nightSky + lightCol * lit * flicker * 2.2;
    vec3 col = mix(nightCol, dayCol, dayMix);

    // Очаги износа — по плотности населения. Kaizen гасит их точками,
    // Blue Ocean — широкими областями. До нуля не доходит: не максимум.
    float fineN = noise(vPosO * 34.0);
    float coarseN = fbm(vPosO * 2.2);
    float reliefK = smoothstep(fineN - 0.10, fineN + 0.10, k * 0.92) * 0.9;
    float reliefB = smoothstep(coarseN - 0.14, coarseN + 0.14, b * 1.08) * 0.7;
    float ember = 0.55 + 0.45 * noise(vPosO * 70.0);
    float fever = pow(heat, 1.5) * ember * (1.0 - 0.75 * water) * (1.0 - reliefK) * (1.0 - reliefB) * uResidual;
    float pulse = 1.0 - 0.28 * uMotion * (0.5 + 0.5 * sin(uTime * 1.7 + coarseN * 10.0));
    col += vec3(1.0, 0.035, 0.012) * fever * pulse * mix(0.32, 1.25, 1.0 - dayMix);

    // Край диска: в болезни — бурый смог, в здоровье — чистая синева.
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    vec3 haze = mix(vec3(0.13, 0.36, 1.0), vec3(0.50, 0.30, 0.18), smog);
    col += haze * fres * (0.15 + 0.85 * smoothstep(-0.3, 0.5, ndl)) * 0.55;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const CLOUD_FRAG = /* glsl */`
  uniform sampler2D uClouds;
  uniform vec3 uSunDir;
  uniform float uSmog, uShift;
  varying vec2 vUv;
  varying vec3 vNormalW;
  void main() {
    float c = texture2D(uClouds, vec2(vUv.x + uShift, vUv.y)).r;
    c = smoothstep(0.18, 0.95, c);
    float ndl = dot(normalize(vNormalW), normalize(uSunDir));
    float day = smoothstep(-0.12, 0.25, ndl);
    vec3 tint = mix(vec3(1.0), vec3(0.66, 0.58, 0.50), uSmog);
    vec3 col = tint * (0.04 + 1.05 * max(ndl, 0.0));
    gl_FragColor = vec4(col, c * (0.06 + 0.74 * day) * (1.0 + 0.15 * uSmog));
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

// Ореол на светлом фоне: не свечение, а полупрозрачная дымка.
const ATMO_FRAG = /* glsl */`
  uniform vec3 uSunDir;
  uniform float uSmog, uEdge;
  varying vec3 vNormalV;
  varying vec3 vNormalW;
  void main() {
    float i = pow(clamp(-vNormalV.z / uEdge, 0.0, 1.0), 1.4);
    float sun = smoothstep(-0.5, 0.6, dot(normalize(vNormalW), normalize(uSunDir)));
    vec3 col = mix(vec3(0.30, 0.62, 1.0), vec3(0.42, 0.32, 0.24), uSmog);
    float a = i * (0.25 + 0.75 * sun) * 0.62;
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`;

const RING_VERT = /* glsl */`
  varying vec3 vPosL;
  varying vec3 vPosW;
  varying vec3 vNormalW;
  void main() {
    vPosL = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

// Кольцо из модулей. Пока его нет, виден только пунктир — место, где оно
// может быть. Каждая половина строится от дальней стороны к ближней:
// Kaizen — золотая, Blue Ocean — синяя. Смыкаются они прямо перед зрителем.
const RING_FRAG = /* glsl */`
  uniform float uK, uB, uFront, uTime, uMotion;
  uniform vec3 uSunDir, uCamPos, uGold, uBlue;
  varying vec3 vPosL;
  varying vec3 vPosW;
  varying vec3 vNormalW;
  const float PI = 3.14159265;
  void main() {
    float ang = atan(vPosL.y, vPosL.x);
    float rel = mod(ang - uFront + PI, 2.0 * PI) - PI;   // 0 — ближе всего к зрителю
    float side = step(0.0, rel);                          // 1 — половина Kaizen
    float prog = mix(uB, uK, side) * 1.02;
    float fromBack = (PI - abs(rel)) / PI;                // 0 сзади, 1 спереди
    float built = 1.0 - smoothstep(prog - 0.012, prog, fromBack);

    // Свет: рассеянный и блик; в тени планеты кольцо темнее.
    vec3 N = normalize(vNormalW);
    vec3 L = normalize(uSunDir);
    vec3 V = normalize(uCamPos - vPosW);
    float t = dot(vPosW, L);
    float shadow = t < 0.0 ? smoothstep(0.9, 1.05, sqrt(max(dot(vPosW, vPosW) - t * t, 0.0))) : 1.0;
    float diff = max(dot(N, L), 0.0) * shadow;
    float spec = pow(max(dot(N, normalize(L + V)), 0.0), 36.0) * shadow;

    float u = ang / (2.0 * PI);
    float seg = fract(u * 64.0);
    float joint = smoothstep(0.0, 0.07, seg) * smoothstep(1.0, 0.93, seg);
    float node = step(0.75, fract(u * 16.0)) * exp(-pow((seg - 0.5) / 0.16, 2.0));

    vec3 base = mix(uBlue, uGold, side);
    vec3 col = base * (0.5 + 0.8 * diff) * mix(0.6, 1.0, joint) + vec3(1.0, 0.97, 0.9) * spec * 0.55;

    float growing = step(prog, 1.0);
    float tip = exp(-pow((fromBack - prog) / 0.02, 2.0)) * growing;
    float closed = smoothstep(0.985, 1.0, min(uK, uB));
    float seam = exp(-pow(rel / 0.035, 2.0)) * closed;
    float run = closed * uMotion * pow(0.5 + 0.5 * cos(ang - uTime * 0.35), 24.0);
    col += vec3(1.0, 0.96, 0.86) * (tip * 0.9 + seam * 0.7 + run * 0.4 + node * built * 0.35);

    // Пунктир там, где кольца ещё нет.
    float dash = step(0.5, fract(u * 160.0));
    vec3 ghost = vec3(0.36, 0.43, 0.52);
    float alpha = mix(0.26 * dash, 1.0, built);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(mix(ghost, col, built), alpha);
    #include <colorspace_fragment>
  }
`;

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

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0xffffff, 0);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
    this.sun = new THREE.Vector3(-0.72, 0.33, 0.61).normalize();

    this.tilt = new THREE.Group();
    this.tilt.rotation.set(0.28, 0, -0.32);
    this.spin = new THREE.Group();
    this.tilt.add(this.spin);
    this.scene.add(this.tilt);
    // В начале к зрителю повёрнуты Европа и Африка, Азия уходит в ночь.
    const phi = (22 + 180) * DEG;
    this.spin.rotation.y = -Math.atan2(-Math.cos(phi), Math.sin(phi));

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
    ]).then(([day, night, water, heat, clouds]) => {
      this.build({ day, night, water, heat, clouds, mobile });
      onReady && onReady();
    }).catch((err) => {
      console.error('Планета не загрузилась', err);
      onReady && onReady(err);
    });
  }

  build({ day, night, water, heat, clouds, mobile }) {
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

    this.cloudUniforms = { uClouds: { value: clouds }, uSunDir: this.shared.uSunDir, uSmog: { value: 1 }, uShift: { value: 0 } };
    this.spin.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.007, seg[0], seg[1]),
      new THREE.ShaderMaterial({
        uniforms: this.cloudUniforms,
        vertexShader: SURFACE_VERT,
        fragmentShader: CLOUD_FRAG,
        transparent: true,
        depthWrite: false,
      })
    ));

    const atmoR = 1.1;
    this.atmoUniforms = { uSunDir: this.shared.uSunDir, uSmog: { value: 1 }, uEdge: { value: Math.sqrt(1 - 1 / (atmoR * atmoR)) } };
    this.tilt.add(new THREE.Mesh(
      new THREE.SphereGeometry(atmoR, 96, 64),
      new THREE.ShaderMaterial({
        uniforms: this.atmoUniforms,
        vertexShader: ATMO_VERT,
        fragmentShader: ATMO_FRAG,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
      })
    ));

    // Кольцо лежит в плоскости экватора. uFront — угол его точки,
    // ближайшей к зрителю: там половины и смыкаются.
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.28, 0.012, 12, mobile ? 480 : 720),
      new THREE.ShaderMaterial({
        uniforms: {
          uK: this.shared.uK, uB: this.shared.uB, uTime: this.shared.uTime, uMotion: this.shared.uMotion,
          uSunDir: this.shared.uSunDir, uCamPos: this.shared.uCamPos, uFront: { value: 0 },
          uGold: { value: new THREE.Color('#d9a02b') }, uBlue: { value: new THREE.Color('#1c8fd8') },
        },
        vertexShader: RING_VERT,
        fragmentShader: RING_FRAG,
        transparent: true,
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.renderOrder = 2;
    this.tilt.add(ring);
    this.scene.updateMatrixWorld(true);
    let best = -Infinity;
    for (let a = 0; a < Math.PI * 2; a += 0.5 * DEG) {
      const z = new THREE.Vector3(Math.cos(a) * 1.28, Math.sin(a) * 1.28, 0).applyMatrix4(ring.matrixWorld).z;
      if (z > best) { best = z; ring.material.uniforms.uFront.value = a; }
    }

    this.ready = true;
    this.apply();
    this.start();
  }

  // Куда поставить планету: центр и радиус диска в пикселях холста.
  layout(width, height, cx, cy, radius) {
    if (width < 10 || height < 10) return;
    const dpr = Math.min(window.devicePixelRatio || 1, this.mobile ? 1.75 : 2);
    const size = `${width}x${height}@${dpr}`;
    if (size !== this.size) {   // смена размера холста очищает его — не делаем этого зря
      this.size = size;
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(width, height, false);
    }
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
    const smog = 1 - 0.5 * k - 0.5 * b;
    this.cloudUniforms.uSmog.value = smog;
    this.atmoUniforms.uSmog.value = smog;
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
