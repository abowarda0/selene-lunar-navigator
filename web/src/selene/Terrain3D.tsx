import { useEffect, useRef, useState, type ReactElement } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { decodeHeights, sunVector, type HeightGrid } from "../lib/heightmap";

interface Props {
  readonly siteId: string;
  readonly siteName: string;
  readonly sunAz: number;
  readonly sunEl: number;
  readonly earthAz: number;
  readonly earthEl: number;
  readonly sunUp: boolean;
  readonly linkUp: boolean;
  readonly whenLabel: string;
  readonly cursor: number;
  readonly hours: number;
  readonly onCursor: (h: number) => void;
}

type View = "overview" | "eye";
interface Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly sunLight: THREE.DirectionalLight;
  readonly sunSprite: THREE.Sprite;
  readonly earth: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  terrain: THREE.Mesh | null;
  fly: { from: THREE.Vector3; to: THREE.Vector3; target: THREE.Vector3; t0: number } | null;
}

const KM = 1000;
const SKY_R = 400;              // km: Sun and Earth markers sit beyond the terrain
const OVERVIEW = new THREE.Vector3(34, 66, 84);
const RELIEF = [1, 2, 4] as const;
const EYE_H = 0.012;            // km: a camera ~12 m above the site (lander deck + panels)
const STEP_MS = 70;             // playback: one mission hour per frame step

function glowTexture(inner: string, outer: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.25, inner);
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(c);
}

function makeStage(el: HTMLDivElement): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setSize(el.clientWidth, el.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070b);
  const camera = new THREE.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 0.005, 2000);
  camera.position.set(0, 60, 60);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.01;
  scene.add(new THREE.HemisphereLight(0x9fb6d8, 0x101010, 0.22));   // faint earthshine so shadows are not pure black
  const sunLight = new THREE.DirectionalLight(0xfff1dc, 3.2);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(4096, 4096);
  Object.assign(sunLight.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 1, far: 480 });
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.03;
  scene.add(sunLight, sunLight.target);
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture("#fff4d6", "rgba(255,190,90,0)"), depthWrite: false }));
  sunSprite.scale.set(44, 44, 1);
  const earth = new THREE.Mesh(new THREE.SphereGeometry(7, 32, 16), new THREE.MeshBasicMaterial({ color: 0x4da3ff }));
  const stars = new THREE.BufferGeometry();
  const pts: number[] = [];
  for (let i = 0; i < 1500; i += 1) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(900);
    if (v.y > -50) pts.push(v.x, Math.abs(v.y), v.z);
  }
  stars.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  scene.add(sunSprite, earth, new THREE.Points(stars, new THREE.PointsMaterial({ color: 0x8892a6, size: 1.2, sizeAttenuation: false })));
  const pin = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3, 20), new THREE.MeshBasicMaterial({ color: 0xff9f43 }));
  pin.rotation.x = Math.PI;
  pin.position.y = 2.2;
  const pinRing = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.4, 40), new THREE.MeshBasicMaterial({ color: 0xff9f43, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthTest: false }));
  pinRing.rotation.x = -Math.PI / 2;
  pinRing.position.y = 0.05;
  scene.add(pinRing);
  scene.add(pin);
  return { renderer, scene, camera, controls, sunLight, sunSprite, earth, terrain: null, fly: null };
}

function terrainMesh(grid: HeightGrid): THREE.Mesh {
  const n = grid.n;
  const h = decodeHeights(grid.heights_b64, n);
  const step = grid.step_m / KM;
  const half = grid.half_width_m / KM;
  const pos = new Float32Array(n * n * 3);
  const col = new Float32Array(n * n * 3);
  const span = Math.max(1, grid.h_max_m - grid.h_min_m);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const k = i * n + j;
      pos.set([-half + j * step, h[k] / KM, -half + i * step], k * 3);   // row 0 = north = -z
      const s = 0.42 + 0.33 * ((h[k] - grid.h_min_m) / span);
      col.set([s, s * 0.98, s * 0.95], k * 3);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    for (let j = 0; j < n - 1; j += 1) {
      const a = i * n + j;
      idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const place = (obj: THREE.Object3D, az: number, el: number, r: number): void => {
  const [x, y, z] = sunVector(az, el);
  obj.position.set(x * r, y * r, z * r);
};

/** Real LOLA terrain around the site, lit by the Sun from its true direction at the chosen moment. */
export function Terrain3D(p: Props): ReactElement {
  const mount = useRef<HTMLDivElement | null>(null);
  const stage = useRef<Stage | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [grid, setGrid] = useState<HeightGrid | null>(null);
  const [view, setView] = useState<View>("overview");
  const [playing, setPlaying] = useState(false);
  const [relief, setRelief] = useState<(typeof RELIEF)[number]>(2);

  useEffect(() => {
    const el = mount.current;
    if (!el) return undefined;
    let s: Stage;
    try { s = makeStage(el); } catch { setFailed("This browser cannot draw 3D (WebGL is off or unavailable). Open the app in Chrome, Edge or Firefox to see the terrain."); return undefined; }
    stage.current = s;
    const onResize = () => { s.renderer.setSize(el.clientWidth, el.clientHeight); s.camera.aspect = el.clientWidth / el.clientHeight; s.camera.updateProjectionMatrix(); };
    window.addEventListener("resize", onResize);
    s.renderer.setAnimationLoop((now) => {
      const f = s.fly;
      if (f) {
        const k = Math.min(1, (now - f.t0) / 1600);
        const e = 1 - (1 - k) ** 3;
        s.camera.position.lerpVectors(f.from, f.to, e);
        s.controls.target.copy(f.target);
        if (k >= 1) s.fly = null;
      }
      s.controls.update();
      s.renderer.render(s.scene, s.camera);
    });
    return () => { window.removeEventListener("resize", onResize); s.renderer.setAnimationLoop(null); s.renderer.dispose(); el.removeChild(s.renderer.domElement); stage.current = null; };
  }, []);

  useEffect(() => {
    let live = true;
    setGrid(null);
    fetch(`${import.meta.env.BASE_URL ?? "./"}data/height_${p.siteId}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { data: HeightGrid }) => { if (live) setGrid(j.data); })
      .catch(() => { if (live) setFailed("No 3D terrain for this site (it has no LOLA polar terrain data)."); });
    return () => { live = false; };
  }, [p.siteId]);

  useEffect(() => {
    const s = stage.current;
    if (!s || !grid) return;
    if (s.terrain) { s.scene.remove(s.terrain); s.terrain.geometry.dispose(); }
    s.terrain = terrainMesh(grid);
    s.terrain.scale.y = relief;
    s.scene.add(s.terrain);
    s.fly = { from: new THREE.Vector3(0, 260, 260), to: OVERVIEW.clone(), target: new THREE.Vector3(0, 0, 0), t0: performance.now() };
    setView("overview");
  }, [grid]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (stage.current?.terrain) stage.current.terrain.scale.y = relief; }, [relief]);

  useEffect(() => {
    const s = stage.current;
    if (!s) return;
    const [x, y, z] = sunVector(p.sunAz, p.sunEl);
    s.sunLight.position.set(x * 220, y * 220, z * 220);
    s.sunLight.intensity = p.sunEl > -0.3 ? 3.2 : 0;
    place(s.sunSprite, p.sunAz, Math.max(p.sunEl, -2), SKY_R);
    place(s.earth, p.earthAz, p.earthEl, SKY_R);
    s.earth.material.color.set(p.linkUp ? 0x4da3ff : 0x45505e);
  }, [p.sunAz, p.sunEl, p.earthAz, p.earthEl, p.linkUp]);

  const { cursor, hours, onCursor } = p;
  useEffect(() => {
    if (!playing) return undefined;
    const id = window.setInterval(() => onCursor(cursor + 1 > hours ? 0 : cursor + 1), STEP_MS);
    return () => window.clearInterval(id);
  }, [playing, cursor, hours, onCursor]);

  const goView = (v: View) => {
    const s = stage.current;
    setView(v);
    if (!s) return;
    const [x, , z] = sunVector(p.sunAz, 0);
    const to = v === "eye" ? new THREE.Vector3(0, EYE_H + 0.01, 0) : OVERVIEW.clone();
    const target = v === "eye" ? new THREE.Vector3(x * 5, EYE_H, z * 5) : new THREE.Vector3(0, 0, 0);
    s.fly = { from: s.camera.position.clone(), to, target, t0: performance.now() };
  };

  return (
    <section className="card t3d" aria-labelledby="t3d-h">
      <div className="t3d-head">
        <h2 id="t3d-h" className="sec-h">The landing site in 3D</h2>
        <div className="t3d-ctl" role="group" aria-label="Camera">
          <button type="button" className={`chip${view === "overview" ? " on" : ""}`} onClick={() => goView("overview")}>Overview</button>
          <button type="button" className={`chip${view === "eye" ? " on" : ""}`} onClick={() => goView("eye")}>Lander's eye (toward the Sun)</button>
          <span className="t3d-relief" role="group" aria-label="Height scale">
            {RELIEF.map((r) => <button key={r} type="button" className={`chip${relief === r ? " on" : ""}`} aria-pressed={relief === r} onClick={() => setRelief(r)}>{r === 1 ? "True heights" : `Heights ×${r}`}</button>)}
          </span>
          <button type="button" className="btn primary" onClick={() => setPlaying((v) => !v)}>{playing ? "Pause" : "Play the mission"}</button>
        </div>
      </div>
      <div className="t3d-view" ref={mount}>
        {failed && <p className="t3d-fail">{failed}</p>}
        {!failed && !grid && <p className="t3d-fail">Loading real terrain for {p.siteName}…</p>}
        <div className="t3d-status" aria-live="polite">
          <span className="mono">{p.whenLabel}</span>
          <span className={`t3d-pill ${p.sunUp ? "sun" : "off"}`}>{p.sunUp ? "Sun up: panels charging" : "Sun hidden: running on battery"}</span>
          <span className={`t3d-pill ${p.linkUp ? "earth" : "off"}`}>{p.linkUp ? "Earth link up" : "No link to Earth"}</span>
        </div>
      </div>
      <p className="src">Terrain: NASA LRO LOLA ({grid?.dem.join(", ") ?? "polar DEMs"}), 150 × 150 km around the site (finest maps near the centre) (orange marker = landing point). Heights are shown ×{relief} so the mountains are easy to see; choose True heights for the real shape and shadow lengths. Light comes from the Sun's real direction at this moment, from JPL Horizons; Earth is drawn at its real position, blue when a NASA dish can reach the lander. Mountains farther than 75 km are in the calculation but not drawn, so the labels above, not the shading, are the result.</p>
    </section>
  );
}
