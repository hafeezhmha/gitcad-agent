# Geometry Planner Rules

- Output `src/generated/floorplan.layout.json`.
- Every room must be inside the building boundary.
- Every wall must have nonzero length.
- Doors and windows must reference valid wall IDs.
- Prefer simple grid splits over complex packing.
