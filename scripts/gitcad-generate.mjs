import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const GENERATED_DIR = path.join(ROOT, "src/generated");

const DEFAULT_PROMPT =
  "Create a 12m x 8m apartment floorplan with a living room, bedroom, kitchen, bathroom, one main door, and two windows.";

const ROOM_DEFAULTS = {
  living_room: { label: "Living Room", width: 6, depth: 4, color: 0xd9ead3 },
  bedroom: { label: "Bedroom", width: 6, depth: 4, color: 0xd0e2f3 },
  kitchen: { label: "Kitchen", width: 4, depth: 4, color: 0xfce5cd },
  bathroom: { label: "Bathroom", width: 3, depth: 2.5, color: 0xd9d2e9 },
  office: { label: "Office", width: 4, depth: 4, color: 0xead1dc },
  dining: { label: "Dining", width: 4, depth: 3, color: 0xfff2cc },
};

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function parseDimensions(prompt) {
  const match = prompt.match(/(\d+(?:\.\d+)?)\s*m?\s*[x×]\s*(\d+(?:\.\d+)?)\s*m?/i);
  if (!match) return { width: 12, depth: 8 };
  return { width: Number(match[1]), depth: Number(match[2]) };
}

function parseRooms(prompt) {
  const lower = prompt.toLowerCase();
  const found = Object.entries(ROOM_DEFAULTS)
    .filter(([id, room]) => lower.includes(id.replace("_", " ")) || lower.includes(room.label.toLowerCase()))
    .map(([id, room]) => ({
      id,
      name: room.label,
      approxWidth: room.width,
      approxDepth: room.depth,
      color: room.color,
    }));

  return found.length
    ? found
    : ["living_room", "bedroom", "kitchen", "bathroom"].map((id) => ({
        id,
        name: ROOM_DEFAULTS[id].label,
        approxWidth: ROOM_DEFAULTS[id].width,
        approxDepth: ROOM_DEFAULTS[id].depth,
        color: ROOM_DEFAULTS[id].color,
      }));
}

function parseOpenings(prompt) {
  const lower = prompt.toLowerCase();
  const doorCount = lower.includes("door") ? Math.max(1, Number(lower.match(/(\d+|one|two|three)\s+main door/)?.[1] ?? 1) || 1) : 1;
  const windowWord = lower.match(/(\d+|one|two|three|four)\s+windows?/);
  const wordToNumber = { one: 1, two: 2, three: 3, four: 4 };
  const windowCount = windowWord ? wordToNumber[windowWord[1]] ?? Number(windowWord[1]) : 2;

  return {
    doors: Array.from({ length: doorCount }, (_, index) => ({
      id: `door_${index + 1}`,
      type: "door",
      width: 1,
      preferredWall: "south",
    })),
    windows: Array.from({ length: windowCount }, (_, index) => ({
      id: `window_${index + 1}`,
      type: "window",
      width: 1.2,
      preferredWall: index % 2 === 0 ? "north" : "east",
    })),
  };
}

function buildSpec(prompt) {
  const dimensions = parseDimensions(prompt);
  const rooms = parseRooms(prompt);
  const openings = parseOpenings(prompt);

  return {
    projectName: "gitcad_apartment_floorplan",
    sourcePrompt: prompt,
    units: "meters",
    building: dimensions,
    rooms,
    openings,
  };
}

function layoutRooms(spec) {
  const { width, depth } = spec.building;
  const firstRowDepth = depth * 0.5;
  const secondRowDepth = depth - firstRowDepth;
  const rooms = spec.rooms;
  const layout = [];

  if (rooms.length === 1) {
    layout.push({ ...rooms[0], x: 0, z: 0, width, depth });
    return layout;
  }

  const topRooms = rooms.slice(0, Math.ceil(rooms.length / 2));
  const bottomRooms = rooms.slice(Math.ceil(rooms.length / 2));

  let x = 0;
  topRooms.forEach((room, index) => {
    const roomWidth = index === topRooms.length - 1 ? width - x : width / topRooms.length;
    layout.push({ ...room, x, z: 0, width: roomWidth, depth: firstRowDepth });
    x += roomWidth;
  });

  x = 0;
  bottomRooms.forEach((room, index) => {
    const roomWidth = index === bottomRooms.length - 1 ? width - x : width / bottomRooms.length;
    layout.push({ ...room, x, z: firstRowDepth, width: roomWidth, depth: secondRowDepth });
    x += roomWidth;
  });

  return layout;
}

function normalizePoint(point) {
  return point.map((value) => Number(value.toFixed(3)));
}

function edgeKey(start, end) {
  return [normalizePoint(start).join(","), normalizePoint(end).join(",")].sort().join("|");
}

function roomEdges(room) {
  const x1 = room.x;
  const z1 = room.z;
  const x2 = room.x + room.width;
  const z2 = room.z + room.depth;
  return {
    north: { start: [x1, z1], end: [x2, z1] },
    east: { start: [x2, z1], end: [x2, z2] },
    south: { start: [x2, z2], end: [x1, z2] },
    west: { start: [x1, z2], end: [x1, z1] },
  };
}

function buildWalls(rooms) {
  const edges = new Map();
  for (const room of rooms) {
    for (const [side, edge] of Object.entries(roomEdges(room))) {
      const key = edgeKey(edge.start, edge.end);
      if (!edges.has(key)) {
        edges.set(key, {
          start: normalizePoint(edge.start),
          end: normalizePoint(edge.end),
          roomIds: [],
          sides: {},
        });
      }
      const existing = edges.get(key);
      existing.roomIds.push(room.id);
      existing.sides[room.id] = side;
    }
  }

  return Array.from(edges.values()).map((edge, index) => ({
    id: `wall_${index + 1}`,
    start: edge.start,
    end: edge.end,
    roomIds: edge.roomIds,
    sides: edge.sides,
    exterior: edge.roomIds.length === 1,
  }));
}

function wallLength(wall) {
  return Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
}

function findExteriorWall(walls, preferredSide) {
  return (
    walls.find((wall) => wall.exterior && Object.values(wall.sides).includes(preferredSide)) ??
    walls.find((wall) => wall.exterior)
  );
}

function buildOpenings(spec, walls) {
  const doors = spec.openings.doors.map((door, index) => {
    const host = findExteriorWall(walls, door.preferredWall);
    return {
      id: door.id,
      type: "door",
      hostWallId: host?.id ?? "",
      width: door.width,
      station: Math.min(Math.max(wallLength(host) / 2, door.width / 2 + 0.15), wallLength(host) - door.width / 2 - 0.15),
      height: 2.1,
      label: index === 0 ? "Main Door" : `Door ${index + 1}`,
    };
  });

  const windows = spec.openings.windows.map((win, index) => {
    const host = findExteriorWall(walls, win.preferredWall);
    const length = wallLength(host);
    const fraction = index % 2 === 0 ? 0.35 : 0.65;
    return {
      id: win.id,
      type: "window",
      hostWallId: host?.id ?? "",
      width: win.width,
      station: Math.min(Math.max(length * fraction, win.width / 2 + 0.15), length - win.width / 2 - 0.15),
      height: 1,
      sillHeight: 0.9,
      label: `Window ${index + 1}`,
    };
  });

  return { doors, windows };
}

function buildLayout(spec) {
  const rooms = layoutRooms(spec).map((room) => ({
    id: slugify(room.id),
    name: room.name,
    x: Number(room.x.toFixed(3)),
    z: Number(room.z.toFixed(3)),
    width: Number(room.width.toFixed(3)),
    depth: Number(room.depth.toFixed(3)),
    color: room.color,
  }));
  const walls = buildWalls(rooms);
  const openings = buildOpenings(spec, walls);

  return {
    projectName: spec.projectName,
    units: spec.units,
    building: { x: 0, z: 0, width: spec.building.width, depth: spec.building.depth },
    wallDefaults: { thickness: 0.28, height: 3 },
    rooms,
    walls,
    doors: openings.doors,
    windows: openings.windows,
  };
}

function validateLayout(layout) {
  const errors = [];
  const buildingArea = layout.building.width * layout.building.depth;
  const roomArea = layout.rooms.reduce((sum, room) => sum + room.width * room.depth, 0);
  const wallById = new Map(layout.walls.map((wall) => [wall.id, wall]));

  if (!(layout.building.width > 0) || !(layout.building.depth > 0)) {
    errors.push("Building dimensions must be positive.");
  }

  for (const room of layout.rooms) {
    if (!(room.width > 0) || !(room.depth > 0)) errors.push(`${room.id} has non-positive dimensions.`);
    if (room.x < 0 || room.z < 0) errors.push(`${room.id} starts outside the building boundary.`);
    if (room.x + room.width > layout.building.width + 0.001) errors.push(`${room.id} exceeds building width.`);
    if (room.z + room.depth > layout.building.depth + 0.001) errors.push(`${room.id} exceeds building depth.`);
  }

  if (roomArea > buildingArea + 0.001) {
    errors.push(`Room area ${roomArea.toFixed(2)}m2 exceeds building area ${buildingArea.toFixed(2)}m2.`);
  }

  for (const wall of layout.walls) {
    if (!(wallLength(wall) > 0.001)) errors.push(`${wall.id} has zero length.`);
  }

  for (const opening of [...layout.doors, ...layout.windows]) {
    const wall = wallById.get(opening.hostWallId);
    if (!wall) {
      errors.push(`${opening.id} references missing wall ${opening.hostWallId}.`);
      continue;
    }
    if (opening.width >= wallLength(wall) - 0.2) {
      errors.push(`${opening.id} is too wide for ${opening.hostWallId}.`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    metrics: {
      buildingArea: Number(buildingArea.toFixed(2)),
      roomArea: Number(roomArea.toFixed(2)),
      rooms: layout.rooms.length,
      walls: layout.walls.length,
      doors: layout.doors.length,
      windows: layout.windows.length,
    },
  };
}

function renderReport(validation) {
  const status = validation.ok ? "PASS" : "FAIL";
  const errorBlock = validation.errors.length
    ? validation.errors.map((error) => `- ${error}`).join("\n")
    : "- No validation errors.";

  return `# Geometry Validation Report

Status: ${status}

## Metrics

- Building area: ${validation.metrics.buildingArea} m2
- Room area: ${validation.metrics.roomArea} m2
- Rooms: ${validation.metrics.rooms}
- Walls: ${validation.metrics.walls}
- Doors: ${validation.metrics.doors}
- Windows: ${validation.metrics.windows}

## Checks

${errorBlock}

## Generated Files

- src/generated/floorplan.spec.json
- src/generated/floorplan.layout.json
- src/generated/floorplan.ts
- src/generated/geometry-report.md
`;
}

function renderFloorplanModule() {
  return `import { Cuboid, OpenGeometry, Polygon, Vector3 } from "opengeometry";
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
`;
}

async function main() {
  const prompt = process.argv.slice(2).join(" ").trim() || DEFAULT_PROMPT;
  const spec = buildSpec(prompt);
  const layout = buildLayout(spec);
  const validation = validateLayout(layout);

  await fs.mkdir(GENERATED_DIR, { recursive: true });
  await fs.writeFile(path.join(GENERATED_DIR, "floorplan.spec.json"), JSON.stringify(spec, null, 2) + "\n");
  await fs.writeFile(path.join(GENERATED_DIR, "floorplan.layout.json"), JSON.stringify(layout, null, 2) + "\n");
  await fs.writeFile(path.join(GENERATED_DIR, "floorplan.ts"), renderFloorplanModule());
  await fs.writeFile(path.join(GENERATED_DIR, "geometry-report.md"), renderReport(validation));

  const summary = validation.ok ? "validated" : "failed validation";
  console.log(`GitCAD floorplan ${summary}: ${validation.metrics.rooms} rooms, ${validation.metrics.walls} walls.`);
  if (!validation.ok) {
    validation.errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
  }
}

await main();
