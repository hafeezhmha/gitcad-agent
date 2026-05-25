# GitCAD Rules

## Scope

- Generate one-floor rectangular plans only.
- Use meters as the only unit.
- Use rectangular rooms only.
- Keep room coordinates inside the building boundary.
- Use simple wall-hosted doors and windows.
- Prefer deterministic layout choices over clever but fragile geometry.

## Required Artifacts

Every successful generation must produce:

- `floorplan.spec.json`: user intent normalized into structured design data.
- `floorplan.layout.json`: concrete coordinates, walls, rooms, doors, and windows.
- `floorplan.ts`: browser renderer code for OpenGeometry and Three.js.
- `geometry-report.md`: validation result and summary.

## Validation

Before reporting success:

- Building dimensions must be positive.
- Rooms must have positive width and depth.
- Rooms must fit within the building boundary.
- Room area must not exceed building area.
- Walls must have positive length.
- Openings must reference valid walls.
- Opening width must fit on the host wall.

If validation fails, repair the layout once before giving up.

## OpenGeometry API Discipline

Do not invent CAD APIs. Use existing repository examples and public exports first.
For this MVP, use OpenGeometry primitives such as `OpenGeometry`, `Vector3`, `Polygon`, and `Cuboid`, with Three.js for scene setup.
