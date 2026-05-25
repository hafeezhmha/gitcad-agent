import { Cuboid, OpenGeometry, Polygon, Vector3 } from "opengeometry";
import * as THREE from "three";
import layout from "./floorplan.layout.json";

type RenderMode = "plan" | "model";
type RenderOptions = { mode?: RenderMode; wasmURL: string };
type WallLayout = { start: [number, number]; end: [number, number] };
type RoomLayout = {
  id: string;
  name: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  color: number;
};

const PALETTE = {
  wall: 0x2f3437,
  floor: 0xe9dfcf,
  door: 0xb77945,
  frame: 0x1f2933,
  glass: 0x8ecae6,
  grid: 0xc8c0b4,
};

function point(x: number, y: number, z: number): Vector3 {
  return new Vector3(x, y, z);
}

function wallLength(wall: WallLayout): number {
  return Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
}

function roomVertices(room: RoomLayout): [number, number, number][] {
  return [
    [room.x, 0, room.z],
    [room.x + room.width, 0, room.z],
    [room.x + room.width, 0, room.z + room.depth],
    [room.x, 0, room.z + room.depth],
  ];
}

function makeScene(container: HTMLElement, mode: RenderMode) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4f1ea);
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 600;
  const aspect = width / height;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  container.appendChild(renderer.domElement);

  const centerX = layout.building.x + layout.building.width / 2;
  const centerZ = layout.building.z + layout.building.depth / 2;
  const span = Math.max(layout.building.width, layout.building.depth) * 0.72;
  const camera = mode === "plan"
    ? new THREE.OrthographicCamera(-span * aspect, span * aspect, span, -span, 0.1, 100)
    : new THREE.PerspectiveCamera(48, aspect, 0.1, 100);

  if (mode === "plan") {
    camera.position.set(centerX, 18, centerZ + 0.001);
    camera.up.set(0, 0, -1);
  } else {
    camera.position.set(centerX + 10, 10, centerZ + 10);
    camera.up.set(0, 1, 0);
  }
  camera.lookAt(centerX, 0, centerZ);

  const ambient = new THREE.AmbientLight(0xffffff, 0.75);
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(centerX + 5, 12, centerZ + 3);
  scene.add(ambient, sun);

  const grid = new THREE.GridHelper(Math.max(layout.building.width, layout.building.depth) + 4, 20, PALETTE.grid, PALETTE.grid);
  grid.position.set(centerX, -0.04, centerZ);
  scene.add(grid);

  const onResize = () => {
    const nextWidth = container.clientWidth || 800;
    const nextHeight = container.clientHeight || 600;
    renderer.setSize(nextWidth, nextHeight);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
    }
  };
  window.addEventListener("resize", onResize);
  return { scene, renderer, camera, dispose: () => window.removeEventListener("resize", onResize) };
}

function addLabel(scene: THREE.Scene, text: string, x: number, z: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#191815";
  ctx.font = "600 24px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(x, 0.08, z);
  sprite.scale.set(1.8, 0.45, 1);
  scene.add(sprite);
}

function addWall(scene: THREE.Scene, wall: WallLayout, thickness: number, height: number, mode: RenderMode) {
  const length = wallLength(wall);
  const angle = Math.atan2(wall.end[1] - wall.start[1], wall.end[0] - wall.start[0]);
  const centerX = (wall.start[0] + wall.end[0]) / 2;
  const centerZ = (wall.start[1] + wall.end[1]) / 2;
  const wallHeight = mode === "plan" ? 0.08 : height;
  const cuboid = new Cuboid({
    center: point(0, wallHeight / 2, 0),
    width: length,
    height: wallHeight,
    depth: thickness,
    color: PALETTE.wall,
  });
  cuboid.setPlacement({
    translation: point(centerX, 0, centerZ),
    rotation: point(0, -angle, 0),
    scale: point(1, 1, 1),
  });
  cuboid.outline = true;
  scene.add(cuboid);
}

function addOpeningMarker(scene: THREE.Scene, wall: WallLayout, station: number, width: number, color: number, y: number) {
  const length = wallLength(wall);
  const t = Math.max(0, Math.min(1, station / length));
  const x = wall.start[0] + (wall.end[0] - wall.start[0]) * t;
  const z = wall.start[1] + (wall.end[1] - wall.start[1]) * t;
  const angle = Math.atan2(wall.end[1] - wall.start[1], wall.end[0] - wall.start[0]);
  const marker = new Cuboid({
    center: point(0, y, 0),
    width,
    height: 0.12,
    depth: 0.42,
    color,
  });
  marker.setPlacement({
    translation: point(x, 0, z),
    rotation: point(0, -angle, 0),
    scale: point(1, 1, 1),
  });
  scene.add(marker);
}

export async function renderGeneratedFloorplan(container: HTMLElement, options: RenderOptions) {
  await OpenGeometry.create({ wasmURL: options.wasmURL });
  const built: any[] = [];
  const walls = new Map<string, WallLayout>();
  const mode = options.mode ?? "plan";
  const { scene, renderer, camera, dispose } = makeScene(container, mode);

  const floor = new Cuboid({
    center: point(layout.building.x + layout.building.width / 2, -0.025, layout.building.z + layout.building.depth / 2),
    width: layout.building.width,
    height: 0.05,
    depth: layout.building.depth,
    color: PALETTE.floor,
  });
  scene.add(floor);
  built.push(floor);

  for (const room of layout.rooms) {
    const zone = new Polygon({
      vertices: roomVertices(room).map(([x, y, z]) => point(x, y + 0.01, z)),
      color: room.color,
    });
    zone.outline = true;
    scene.add(zone);
    addLabel(scene, room.name, room.x + room.width / 2, room.z + room.depth / 2);
    built.push(zone);
  }

  for (const wall of layout.walls) {
    walls.set(wall.id, wall as WallLayout);
    addWall(scene, wall as WallLayout, layout.wallDefaults.thickness, layout.wallDefaults.height, mode);
  }

  for (const doorDef of layout.doors) {
    const host = walls.get(doorDef.hostWallId);
    const wall = layout.walls.find((candidate) => candidate.id === doorDef.hostWallId) as WallLayout | undefined;
    if (!host || !wall) continue;
    const width = Math.min(doorDef.width, Math.max(0.7, wallLength(wall) - 0.3));
    addOpeningMarker(scene, wall, doorDef.station, width, PALETTE.door, mode === "plan" ? 0.12 : 1.05);
  }

  for (const windowDef of layout.windows) {
    const host = walls.get(windowDef.hostWallId);
    const wall = layout.walls.find((candidate) => candidate.id === windowDef.hostWallId) as WallLayout | undefined;
    if (!host || !wall) continue;
    const width = Math.min(windowDef.width, Math.max(0.5, wallLength(wall) - 0.3));
    addOpeningMarker(scene, wall, windowDef.station, width, PALETTE.glass, mode === "plan" ? 0.13 : 1.45);
  }

  renderer.render(scene, camera);
  return { layout, elements: built, dispose };
}

export { layout };
