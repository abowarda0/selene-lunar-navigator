import { useEffect, useRef, type ReactElement } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { api } from "../api/client";
import type { Site } from "../api/types";

interface Props {
  readonly sites: readonly Site[];
  readonly selected: string;
  readonly onHover: (id: string | null) => void;
  /** Called after the fly-in animation toward the clicked site. */
  readonly onOpen: (id: string) => void;
  /** Called when WebGL is unavailable, so the parent can show the 2D map instead. */
  readonly onFail: () => void;
}

const R = 1;
const FLY_MS = 900;
const DEG = Math.PI / 180;

/** Same mapping as THREE.SphereGeometry's texture: u = lon / 360 from 0° E. */
export function globePoint(latDeg: number, lonDeg: number, r: number): [number, number, number] {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  return [-r * Math.cos(lat) * Math.cos(lon), r * Math.sin(lat), r * Math.cos(lat) * Math.sin(lon)];
}

/** The real Moon (NASA LOLA global relief) with the stored sites as pins; click a pin to fly to it. */
export function MoonGlobe3D({ sites, selected, onHover, onOpen, onFail }: Props): ReactElement {
  const mount = useRef<HTMLDivElement | null>(null);
  const cb = useRef({ onHover, onOpen });
  cb.current = { onHover, onOpen };
  const selRef = useRef(selected);
  selRef.current = selected;

  useEffect(() => {
    const el = mount.current;
    if (!el) return undefined;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { onFail(); return undefined; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.01, 50);
    const home = new THREE.Vector3(0.9, -2.6, 1.9);           // looking up at the south pole
    camera.position.copy(home);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 1.4;
    controls.maxDistance = 6;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
    scene.add(new THREE.AmbientLight(0x8fa6c8, 0.06));                // faint earthshine on the night side
    const sun = new THREE.DirectionalLight(0xfff4e2, 3.4);            // low side light: a real day/night edge
    sun.position.set(6, -0.6, -1.2);
    scene.add(sun);
    const tex = new THREE.TextureLoader().load(api.assetUrl("moon_ldem4.png"));
    tex.colorSpace = THREE.SRGBColorSpace;
    // The LOLA relief image doubles as a bump map, so craters and mountains catch the light and cast shade.
    const moon = new THREE.Mesh(new THREE.SphereGeometry(R, 192, 96), new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 0.035, roughness: 1, metalness: 0 }));
    scene.add(moon);
    const pins = sites.map((s) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 12, 8), new THREE.MeshBasicMaterial({ color: s.kind === "landed" ? 0x4da3ff : 0xffb15c }));
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.011, 0.014, 32), new THREE.MeshBasicMaterial({ color: s.kind === "landed" ? 0x4da3ff : 0xffb15c, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
      m.add(ring);
      m.position.set(...globePoint(s.lat, s.lon_e, R * 1.004));
      m.userData = { id: s.id };
      m.lookAt(0, 0, 0);                                               // the ring lies flat on the surface
      scene.add(m);
      return m;
    });
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let down: { x: number; y: number } | null = null;
    let fly: { from: THREE.Vector3; to: THREE.Vector3; t0: number; id: string } | null = null;
    const hit = (e: PointerEvent): string | null => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const h = ray.intersectObjects([moon, ...pins])[0];
      if (!h) return null;
      if (h.object !== moon) return h.object.userData.id as string;
      const near = pins.find((p) => p.position.distanceTo(h.point) < 0.05);   // forgiving click near a pin
      return near ? (near.userData.id as string) : null;
    };
    const onMove = (e: PointerEvent) => { const id = hit(e); cb.current.onHover(id); renderer.domElement.style.cursor = id ? "pointer" : "grab"; };
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; controls.autoRotate = false; };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const id = hit(e);
      if (!id) return;
      const pin = pins.find((p) => p.userData.id === id);
      if (pin) fly = { from: camera.position.clone(), to: pin.position.clone().multiplyScalar(1.45), t0: performance.now(), id };
    };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    const onResize = () => { renderer.setSize(el.clientWidth, el.clientHeight); camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); };
    window.addEventListener("resize", onResize);
    renderer.setAnimationLoop((now) => {
      pins.forEach((p) => {
        const on = p.userData.id === selRef.current;
        p.scale.setScalar(on ? 1.25 + 0.15 * Math.sin(now / 400) : 1);
      });
      if (fly) {
        const k = Math.min(1, (now - fly.t0) / FLY_MS);
        camera.position.lerpVectors(fly.from, fly.to, 1 - (1 - k) ** 3);
        camera.lookAt(0, 0, 0);
        if (k >= 1) { const id = fly.id; fly = null; cb.current.onOpen(id); }
      } else {
        controls.update();
      }
      renderer.render(scene, camera);
    });
    return () => {
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [sites, onFail]);

  return (
    <figure className="globe3d">
      <div className="globe3d-view" ref={mount} aria-label="3D Moon with landing sites. Drag to turn, click a pin to open that site." role="img" />
      <figcaption className="src">Real Moon relief (NASA LOLA). Drag to turn · click an orange pin (south-pole candidates) or blue pin (past landings) to fly there.</figcaption>
    </figure>
  );
}
