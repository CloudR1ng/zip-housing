import * as THREE from "three";
import { animate, stagger } from "animejs";
import { regions, homes } from "./data.js";

export function initMotion(initialRegion) {
  const host = document.querySelector("#hero-visual");
  const hero = document.querySelector(".hero");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let moving = !reduced.matches;
  const label = document.createElement("div");
  label.className = "network-label";
  label.innerHTML =
    "<span>NATIONWIDE LIVING NETWORK</span><b>17개의 시작점, 하나의 기준.</b>";
  host.append(label);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
  } catch {
    label.remove();
    return;
  }
  host.classList.add("has-scene");
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.setClearColor(0, 0);
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
  camera.position.set(0, 3.9, 5.6);
  camera.lookAt(0, 0, 0);
  const group = new THREE.Group();
  scene.add(group);
  group.rotation.y = -0.25;
  scene.add(new THREE.AmbientLight(0xc4f5ef, 2));
  const light = new THREE.DirectionalLight(0xd6ffaf, 3);
  light.position.set(-3, 7, 3);
  scene.add(light);
  const nodeGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.025, 16);
  const pillarGeometry = new THREE.CylinderGeometry(0.033, 0.06, 1, 6);
  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0x60b8a8,
    roughness: 0.45,
    metalness: 0.2,
  });
  const activeMaterial = new THREE.MeshStandardMaterial({
    color: 0xc5f68a,
    emissive: 0x72b844,
    emissiveIntensity: 0.55,
    roughness: 0.3,
  });
  const points = regions.map((r) => ({
    name: r.name,
    x: (r.lng - 127.3) * 0.8,
    z: -(r.lat - 36) * 0.7,
  }));
  const nodes = points.map((p, i) => {
    const average =
      homes.filter((h) => h.region === p.name).reduce((s, h) => s + h.rent, 0) /
      4;
    const height = 0.1 + average / 180;
    const pillar = new THREE.Mesh(pillarGeometry, baseMaterial);
    pillar.position.set(p.x, height / 2, p.z);
    pillar.scale.y = height;
    group.add(pillar);
    const top = new THREE.Mesh(nodeGeometry, activeMaterial);
    top.position.set(p.x, height + 0.025, p.z);
    group.add(top);
    return { p, top, pillar, height };
  });
  const gridPoints = [];
  for (let x = -2.4; x <= 2.4; x += 0.16)
    for (let z = -2.3; z <= 2.3; z += 0.16) gridPoints.push(x, -0.015, z);
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(gridPoints, 3),
  );
  const grid = new THREE.Points(
    gridGeo,
    new THREE.PointsMaterial({
      color: 0x578586,
      size: 0.012,
      transparent: true,
      opacity: 0.43,
    }),
  );
  group.add(grid);
  const circleGeo = new THREE.RingGeometry(0.105, 0.118, 48);
  const circleMat = new THREE.MeshBasicMaterial({
    color: 0xc4f580,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8,
  });
  const ring = new THREE.Mesh(circleGeo, circleMat);
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);
  const lineGroup = new THREE.Group();
  group.add(lineGroup);
  const pulseGeometry = new THREE.SphereGeometry(0.028, 8, 8);
  const pulseMaterial = new THREE.MeshBasicMaterial({ color: 0xc8f8a1 });
  const travellers = [];
  let curves = [];
  const selectedLabel = document.createElement("div");
  selectedLabel.className = "selected-region-label";
  host.append(selectedLabel);
  function select(name) {
    const current = nodes.find((n) => n.p.name === name) || nodes[5];
    for (const n of nodes) {
      n.pillar.material = n === current ? activeMaterial : baseMaterial;
      n.top.scale.setScalar(n === current ? 1.7 : 1);
    }
    ring.position.set(current.p.x, 0.005, current.p.z);
    selectedLabel.textContent = `${current.p.name} · 4개 시연 생활권`;
    for (const obj of [...lineGroup.children]) {
      lineGroup.remove(obj);
      if (obj.isLine) obj.geometry.dispose();
    }
    travellers.length = 0;
    curves = [];
    nodes
      .filter((n) => n !== current)
      .forEach((node, index) => {
        const start = new THREE.Vector3(
          current.p.x,
          current.height + 0.04,
          current.p.z,
        );
        const end = new THREE.Vector3(node.p.x, node.height + 0.04, node.p.z);
        const mid = start.clone().add(end).multiplyScalar(0.5);
        mid.y += start.distanceTo(end) * 0.3;
        const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
        curves.push(curve);
        const geometry = new THREE.BufferGeometry().setFromPoints(
          curve.getPoints(40),
        );
        const line = new THREE.Line(geometry, lineMaterial);
        lineGroup.add(line);
        const dot = new THREE.Mesh(pulseGeometry, pulseMaterial);
        dot.userData.offset = index / 16;
        lineGroup.add(dot);
        travellers.push(dot);
      });
    render();
  }
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0x76c7b8,
    transparent: true,
    opacity: 0.33,
  });
  function resize() {
    const width = host.clientWidth,
      height = host.clientHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  }
  let frame = 0,
    phase = 0,
    targetX = 0,
    targetY = 0,
    inView = true;
  function render() {
    renderer.render(scene, camera);
  }
  function tick() {
    if (!moving || !inView || document.hidden) {
      frame = 0;
      return;
    }
    phase += 0.007;
    group.rotation.y += (-0.25 + targetX * 0.16 - group.rotation.y) * 0.035;
    group.rotation.x += (targetY * 0.06 - group.rotation.x) * 0.035;
    ring.scale.setScalar(1 + Math.sin(phase * 2) * 0.18);
    circleMat.opacity = 0.6 + Math.sin(phase * 2) * 0.25;
    travellers.forEach((dot, i) => {
      dot.position.copy(
        curves[i].getPoint((phase * 0.15 + dot.userData.offset) % 1),
      );
    });
    render();
    frame = requestAnimationFrame(tick);
  }
  function play() {
    if (moving && inView && !document.hidden && !frame)
      frame = requestAnimationFrame(tick);
  }
  function sync() {
    if (!moving && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    play();
    render();
  }
  reduced.addEventListener("change", () => {
    moving = !reduced.matches;
    sync();
  });
  hero.addEventListener("pointermove", (e) => {
    const rect = hero.getBoundingClientRect();
    targetX = (e.clientX - rect.left) / rect.width - 0.5;
    targetY = (e.clientY - rect.top) / rect.height - 0.5;
  });
  hero.addEventListener("pointerleave", () => {
    targetX = targetY = 0;
  });
  document.addEventListener("visibilitychange", play);
  const observer = new IntersectionObserver(
    (entries) => {
      inView = entries[0].isIntersecting;
      play();
    },
    { threshold: 0 },
  );
  observer.observe(hero);
  const resizer = new ResizeObserver(resize);
  resizer.observe(host);
  document.addEventListener("zip:region", (e) => select(e.detail));
  document.addEventListener("zip:results", () => {
    if (moving && !reduced.matches)
      animate("#results .home-card", {
        opacity: [0, 1],
        translateY: [9, 0],
        delay: stagger(55),
        duration: 380,
        ease: "out(3)",
      });
  });
  if (moving) {
    animate(".hero-copy > *", {
      opacity: [0, 1],
      translateY: [14, 0],
      delay: stagger(90),
      duration: 750,
      ease: "out(3)",
    });
    animate(".hero-stat", {
      opacity: [0, 1],
      translateX: [12, 0],
      delay: 250,
      duration: 800,
      ease: "out(3)",
    });
  }
  select(initialRegion);
  resize();
  play();
}
