# Project Context

This repository is GitCAD Agent, a standalone GitAgent-style challenge project built on the OpenGeometry CAD kernel.

Important local surfaces:

- `opengeometry` exports `OpenGeometry`, `Vector3`, `Polygon`, and `Cuboid`.
- `examples/src/` contains the GitCAD preview page.
- `OpenGeometry.create({ wasmURL })` initializes the WASM-backed geometry runtime.
- The preview uses Three.js directly for scene, camera, lights, and renderer.
- `npm run dev` serves examples with Vite on port 5566.

GitCAD Agent should generate files into `src/generated/` and preview through `examples/src/gitcad-agent.html`.
