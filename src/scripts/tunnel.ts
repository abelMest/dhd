// The Editions tunnel: a scroll-driven flight down a glowing heartbeat road through a white miniature city.
// One stop per edition; the card on screen cross-fades to the edition in front of the camera.
// Loaded only when someone opens Tunnel view with motion welcome and WebGL available; the list is always the fallback.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export interface Stop { id: string; title: string; dek: string; topic: string; date: string; mins: number }

const SPACING = 22;           // road length between two editions
const BLUE = new THREE.Color('#298fc9');
const GLOW = new THREE.Color('#4fb0e6');

export function mountTunnel(root: HTMLElement, all: Stop[]) {
  const stage = root.querySelector<HTMLElement>('.stage3d')!;
  const card = root.querySelector<HTMLElement>('.tCard')!;
  const bar = root.querySelector<HTMLElement>('.tProgress span');
  const filter = root.querySelector<HTMLSelectElement>('select');

  // Renderer: capped pixel ratio keeps phones and older laptops smooth.
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  stage.prepend(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#edf3f7');
  scene.fog = new THREE.Fog('#edf3f7', 30, 140);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 220);
  // Lit so the city stays just under the bloom threshold: only the road lines glow.
  scene.add(new THREE.HemisphereLight('#ffffff', '#c4d4e0', 1.7));
  const sun = new THREE.DirectionalLight('#fff8ef', 1.15);
  sun.position.set(30, 50, 20);
  scene.add(sun);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.1, 0.45, 0.97);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // Shared materials and geometries for the city.
  const white = new THREE.MeshStandardMaterial({ color: '#f3f6f9', roughness: 0.95 });
  const leaf = new THREE.MeshStandardMaterial({ color: '#d6e4ee', roughness: 1 });
  const roadMat = new THREE.MeshStandardMaterial({ color: '#c9d6e0', roughness: 1 });
  // Line colours above 1.0 so they, and only they, pass the bloom threshold.
  const lineMat = new THREE.MeshBasicMaterial({ color: GLOW.clone().multiplyScalar(2.2), toneMapped: false });
  const beatMat = new THREE.MeshBasicMaterial({ color: BLUE.clone().multiplyScalar(4), toneMapped: false });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const ball = new THREE.IcosahedronGeometry(1, 1);

  let world = new THREE.Group();
  scene.add(world);
  let curve: THREE.CatmullRomCurve3;
  let stops: Stop[] = [];
  let st: ScrollTrigger | null = null;
  let progress = 0;

  const rand = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

  function build(items: Stop[]) {
    scene.remove(world);
    world.traverse((o) => { if ((o as THREE.Mesh).geometry && o !== world) ((o as THREE.Mesh).geometry as THREE.BufferGeometry).dispose?.(); });
    world = new THREE.Group();
    scene.add(world);
    stops = items;
    const n = Math.max(2, items.length);
    // A gently winding road, one bend per few editions.
    const pts = Array.from({ length: n + 2 }, (_, i) => new THREE.Vector3(Math.sin(i * 0.7) * 7, 0, -i * SPACING));
    curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4);
    const segs = n * 60;

    // Road surface: a flat ribbon following the curve.
    const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3();
    const pos: number[] = [], idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, p = curve.getPointAt(t), tan = curve.getTangentAt(t);
      side.crossVectors(tan, up).normalize().multiplyScalar(2.6);
      pos.push(p.x - side.x, 0, p.z - side.z, p.x + side.x, 0, p.z + side.z);
      if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    roadGeo.setIndex(idx); roadGeo.computeVertexNormals();
    world.add(new THREE.Mesh(roadGeo, roadMat));

    // Three glowing lines; the middle one beats like an ECG at every edition.
    const stopT = (k: number) => (k + 1) / (n + 1);
    const lane = (offset: number, beat: boolean) => {
      const lp: THREE.Vector3[] = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs, p = curve.getPointAt(t), tan = curve.getTangentAt(t);
        side.crossVectors(tan, up).normalize().multiplyScalar(offset);
        let y = 0.04;
        if (beat) for (let k = 0; k < n; k++) {
          const d = (t - stopT(k)) * (n + 1) * SPACING;   // distance in road units from stop k
          if (Math.abs(d) < 3) y += d > -0.6 && d < 0.6 ? 2.6 * (1 - Math.abs(d) / 0.6) : d < 0 ? -0.5 * Math.max(0, 1 - Math.abs(d + 1.2)) : 0.6 * Math.max(0, 1 - Math.abs(d - 1.8));
        }
        lp.push(new THREE.Vector3(p.x + side.x, y, p.z + side.z));
      }
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lp), segs, beat ? 0.11 : 0.07, 6, false);
      world.add(new THREE.Mesh(geo, beat ? beatMat : lineMat));
    };
    lane(0, true); lane(-2.3, false); lane(2.3, false);

    // A low-poly city either side: white blocks and round trees, thinning into the fog.
    const blocks = new THREE.InstancedMesh(box, white, n * 26);
    const trees = new THREE.InstancedMesh(ball, leaf, n * 18);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), at = new THREE.Vector3();
    let b = 0, tr = 0;
    for (let i = 0; i < n * 26; i++) {
      const t = rand(), p = curve.getPointAt(t), tan = curve.getTangentAt(t);
      side.crossVectors(tan, up).normalize();
      const dist = 8 + rand() * 30, s = rand() < 0.5 ? -1 : 1;
      const w = 1.5 + rand() * 3.5, h = 1 + rand() ** 2 * 9, d = 1.5 + rand() * 3.5;
      at.set(p.x + side.x * dist * s, h / 2, p.z + side.z * dist * s);
      q.setFromAxisAngle(up, rand() * Math.PI);
      blocks.setMatrixAt(b++, m.compose(at, q, sc.set(w, h, d)));
    }
    for (let i = 0; i < n * 18; i++) {
      const t = rand(), p = curve.getPointAt(t), tan = curve.getTangentAt(t);
      side.crossVectors(tan, up).normalize();
      const dist = 4 + rand() * 18, s = rand() < 0.5 ? -1 : 1, r = 0.5 + rand() * 0.9;
      at.set(p.x + side.x * dist * s, r, p.z + side.z * dist * s);
      trees.setMatrixAt(tr++, m.compose(at, q.identity(), sc.set(r, r, r)));
    }
    world.add(blocks, trees);

    // A glowing ring hangs over the road at every edition.
    const ringGeo = new THREE.TorusGeometry(1.1, 0.06, 8, 48);
    for (let k = 0; k < n; k++) {
      const p = curve.getPointAt(stopT(k)), tan = curve.getTangentAt(stopT(k));
      const ring = new THREE.Mesh(ringGeo, lineMat);
      ring.position.set(p.x, 4.4, p.z);
      ring.lookAt(p.x + tan.x, 4.4, p.z + tan.z);
      world.add(ring);
    }

    // Dust drifting in the air.
    const count = 700, dust = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const p = curve.getPointAt(rand());
      dust.set([p.x + (rand() - 0.5) * 40, rand() * 12, p.z + (rand() - 0.5) * 30], i * 3);
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dust, 3));
    const motes = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#7cc8f2', size: 0.09, transparent: true, opacity: 0.8 }));
    motes.name = 'dust';
    world.add(motes);

    // The section is as tall as the road: about one screen of scrolling per edition.
    root.style.height = `${Math.max(2, n) * 70 + 100}vh`;
    st?.kill();
    st = ScrollTrigger.create({
      trigger: root, start: 'top top', end: 'bottom bottom', scrub: 0.8,
      onUpdate: (s) => { progress = s.progress; if (bar) bar.style.transform = `scaleX(${s.progress})`; },
    });
    ScrollTrigger.refresh();
    current = -1;
    show(0);
  }

  // The card for the edition in front of the camera.
  let current = -1;
  function show(k: number) {
    if (k === current || !stops[k]) return;
    current = k;
    const s = stops[k];
    card.classList.add('swap');
    setTimeout(() => {
      card.querySelector('.cnt')!.textContent = `${String(k + 1).padStart(2, '0')} / ${String(stops.length).padStart(2, '0')}`;
      card.querySelector('.kk')!.textContent = s.topic;
      card.querySelector('h2')!.textContent = s.title;
      card.querySelector('p.d')!.textContent = s.dek;
      card.querySelector('.meta')!.textContent = `${s.date} · ${s.mins} min read`;
      card.querySelector<HTMLAnchorElement>('a.btn')!.href = `/editions/${s.id}/`;
      card.classList.remove('swap');
    }, 260);
  }

  const resize = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  // Render only while the tunnel is on screen.
  let visible = false, raf = 0, eased = 0;
  const clock = new THREE.Clock();
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const dt = clock.getDelta();
    eased += (progress - eased) * Math.min(1, dt * 6);
    const n = stops.length;
    const t = (eased * n + 0.4) / (n + 1);               // stand just before stop k when k is current
    const p = curve.getPointAt(Math.min(0.999, t)), ahead = curve.getPointAt(Math.min(1, t + 0.012));
    camera.position.set(p.x, 3.6, p.z + 0.5);
    camera.lookAt(ahead.x, 2.0, ahead.z);
    const dust = world.getObjectByName('dust');
    if (dust) dust.rotation.y += dt * 0.01;
    show(Math.min(n - 1, Math.round(eased * (n - 1))));
    composer.render();
  };
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    cancelAnimationFrame(raf);
    if (visible) { clock.getDelta(); frame(); }
  }).observe(root);

  filter?.addEventListener('change', () => {
    const topic = filter.value;
    build(topic ? all.filter((s) => s.topic === topic) : all);
    root.scrollIntoView();
  });

  build(all);

  return () => {
    cancelAnimationFrame(raf);
    st?.kill();
    renderer.dispose();
    renderer.domElement.remove();
    root.style.height = '';
  };
}

export function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
