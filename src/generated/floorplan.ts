import { Cuboid, OpenGeometry, Polygon, Vector3 } from "opengeometry";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import layout from "./floorplan.layout.json";

type RenderMode = "plan" | "model";
type RenderOptions = { mode?: RenderMode; wasmURL: string };
type WallLayout = { id?: string; start: [number, number]; end: [number, number] };
type RoomLayout = {
  id: string;
  name: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  color: number;
};
type OpeningLayout = {
  id: string;
  type: "door" | "window";
  hostWallId: string;
  width: number;
  station: number;
  height: number;
  sillHeight?: number;
  label: string;
};
type WallOpening = OpeningLayout & {
  clampedWidth: number;
  clampedStation: number;
  start: number;
  end: number;
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

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(centerX, 0, centerZ);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  controls.enableRotate = mode === "model";
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.minDistance = 5;
  controls.maxDistance = 34;
  controls.update();

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
  return {
    scene,
    renderer,
    camera,
    controls,
    dispose: () => {
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
    },
  };
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

function wallAngle(wall: WallLayout): number {
  return Math.atan2(wall.end[1] - wall.start[1], wall.end[0] - wall.start[0]);
}

function stationPoint(wall: WallLayout, station: number): [number, number] {
  const length = wallLength(wall);
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, station / length));
  return [
    wall.start[0] + (wall.end[0] - wall.start[0]) * t,
    wall.start[1] + (wall.end[1] - wall.start[1]) * t,
  ];
}

function addWallCuboid(
  scene: THREE.Scene,
  wall: WallLayout,
  station: number,
  width: number,
  thickness: number,
  height: number,
  color: number,
  y = height / 2,
) {
  if (width <= 0.02 || height <= 0.02) return;
  const [centerX, centerZ] = stationPoint(wall, station);
  const cuboid = new Cuboid({
    center: point(0, y, 0),
    width,
    height,
    depth: thickness,
    color,
  });
  cuboid.setPlacement({
    translation: point(centerX, 0, centerZ),
    rotation: point(0, -wallAngle(wall), 0),
    scale: point(1, 1, 1),
  });
  cuboid.outline = true;
  scene.add(cuboid);
}

function normalizeOpenings(wall: WallLayout, openings: OpeningLayout[]): WallOpening[] {
  const length = wallLength(wall);
  return openings
    .map((opening) => {
      const clampedWidth = Math.min(opening.width, Math.max(0.2, length - 0.4));
      const halfWidth = clampedWidth / 2;
      const clampedStation = Math.max(halfWidth + 0.1, Math.min(length - halfWidth - 0.1, opening.station));
      return {
        ...opening,
        clampedWidth,
        clampedStation,
        start: clampedStation - halfWidth,
        end: clampedStation + halfWidth,
      };
    })
    .sort((left, right) => left.start - right.start);
}

function addDoor(scene: THREE.Scene, wall: WallLayout, door: WallOpening, thickness: number, wallHeight: number, mode: RenderMode) {
  if (mode === "plan") {
    addWallCuboid(scene, wall, door.clampedStation, door.clampedWidth, thickness + 0.16, 0.12, PALETTE.door, 0.1);
    return;
  }
  const doorHeight = Math.min(door.height || 2.1, wallHeight - 0.15);
  const headerHeight = Math.max(0, wallHeight - doorHeight);
  if (headerHeight > 0.04) {
    addWallCuboid(scene, wall, door.clampedStation, door.clampedWidth, thickness, headerHeight, PALETTE.wall, doorHeight + headerHeight / 2);
  }
  addWallCuboid(scene, wall, door.clampedStation, door.clampedWidth * 0.92, thickness * 0.38, doorHeight, PALETTE.door, doorHeight / 2);
}

function addWindow(scene: THREE.Scene, wall: WallLayout, windowDef: WallOpening, thickness: number, wallHeight: number, mode: RenderMode) {
  if (mode === "plan") {
    addWallCuboid(scene, wall, windowDef.clampedStation, windowDef.clampedWidth, thickness + 0.12, 0.12, PALETTE.glass, 0.11);
    return;
  }

  const sillHeight = Math.max(0.45, Math.min(windowDef.sillHeight ?? 0.9, wallHeight - 0.8));
  const glassHeight = Math.max(0.5, Math.min(windowDef.height || 1, wallHeight - sillHeight - 0.25));
  const lintelHeight = Math.max(0, wallHeight - sillHeight - glassHeight);
  const frameThickness = 0.08;

  addWallCuboid(scene, wall, windowDef.clampedStation, windowDef.clampedWidth, thickness, sillHeight, PALETTE.wall, sillHeight / 2);
  if (lintelHeight > 0.04) {
    addWallCuboid(scene, wall, windowDef.clampedStation, windowDef.clampedWidth, thickness, lintelHeight, PALETTE.wall, sillHeight + glassHeight + lintelHeight / 2);
  }

  const frameY = sillHeight + glassHeight / 2;
  addWallCuboid(scene, wall, windowDef.clampedStation, windowDef.clampedWidth * 0.92, thickness * 0.2, glassHeight * 0.82, PALETTE.glass, frameY);
  addWallCuboid(scene, wall, windowDef.clampedStation - windowDef.clampedWidth / 2 + frameThickness / 2, frameThickness, thickness * 0.36, glassHeight, PALETTE.frame, frameY);
  addWallCuboid(scene, wall, windowDef.clampedStation + windowDef.clampedWidth / 2 - frameThickness / 2, frameThickness, thickness * 0.36, glassHeight, PALETTE.frame, frameY);
  addWallCuboid(scene, wall, windowDef.clampedStation, windowDef.clampedWidth, thickness * 0.36, frameThickness, PALETTE.frame, sillHeight + frameThickness / 2);
  addWallCuboid(scene, wall, windowDef.clampedStation, windowDef.clampedWidth, thickness * 0.36, frameThickness, PALETTE.frame, sillHeight + glassHeight - frameThickness / 2);
}

function addWall(scene: THREE.Scene, wall: WallLayout, openings: OpeningLayout[], thickness: number, height: number, mode: RenderMode) {
  const length = wallLength(wall);
  const wallHeight = mode === "plan" ? 0.08 : height;
  const normalizedOpenings = normalizeOpenings(wall, openings);
  let cursor = 0;

  for (const opening of normalizedOpenings) {
    const segmentStart = cursor;
    const segmentEnd = Math.max(segmentStart, opening.start);
    addWallCuboid(scene, wall, (segmentStart + segmentEnd) / 2, segmentEnd - segmentStart, thickness, wallHeight, PALETTE.wall);

    if (opening.type === "door") {
      addDoor(scene, wall, opening, thickness, height, mode);
    } else {
      addWindow(scene, wall, opening, thickness, height, mode);
    }
    cursor = Math.max(cursor, opening.end);
  }

  addWallCuboid(scene, wall, (cursor + length) / 2, length - cursor, thickness, wallHeight, PALETTE.wall);
}

export async function renderGeneratedFloorplan(container: HTMLElement, options: RenderOptions) {
  await OpenGeometry.create({ wasmURL: options.wasmURL });
  const built: any[] = [];
  const mode = options.mode ?? "plan";
  const { scene, renderer, camera, controls, dispose } = makeScene(container, mode);

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

  const openingsByWall = new Map<string, OpeningLayout[]>();
  for (const opening of [...layout.doors, ...layout.windows] as OpeningLayout[]) {
    const existing = openingsByWall.get(opening.hostWallId) ?? [];
    existing.push(opening);
    openingsByWall.set(opening.hostWallId, existing);
  }

  for (const wall of layout.walls) {
    addWall(
      scene,
      wall as WallLayout,
      openingsByWall.get(wall.id) ?? [],
      layout.wallDefaults.thickness,
      layout.wallDefaults.height,
      mode,
    );
  }

  let frameId = 0;
  const animate = () => {
    controls.update();
    renderer.render(scene, camera);
    frameId = window.requestAnimationFrame(animate);
  };
  animate();

  return {
    layout,
    elements: built,
    dispose: () => {
      window.cancelAnimationFrame(frameId);
      dispose();
    },
  };
}

export { layout };
