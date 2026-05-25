---
name: cad-generation
description: Generate constrained OpenGeometry floorplan artifacts from architectural prompts.
license: MIT
compatibility: ">=0.1.0"
allowed-tools: read write cli run_validation git_diff
metadata:
  author: TheHouseKraft
  version: "0.1.0"
  category: cad
---

# CAD Generation Skill

Use this skill when turning architectural prompts into OpenGeometry artifacts.

## Workflow

1. Extract a constrained floorplan spec:
   - building width and depth in meters
   - requested rooms
   - requested exterior openings
2. Normalize missing dimensions conservatively.
3. Produce a simple rectangular layout:
   - split the building into rows/columns
   - keep all rooms inside the boundary
   - leave no negative or zero-size room
4. Generate walls from unique room edges.
5. Attach doors and windows to valid host walls.
6. Write generated artifacts under `src/generated/`.
7. Run validation and repair once if needed.

## Output Bias

Prefer a boring valid CAD plan over an ambitious invalid one.
Use readable IDs so the diff and demo are easy to explain.
