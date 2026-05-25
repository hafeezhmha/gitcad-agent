# Spec Parser Rules

- Output `src/generated/floorplan.spec.json`.
- Use meters.
- Keep the MVP scope: one rectangular floor, rectangular rooms, simple openings.
- Preserve the original prompt in `sourcePrompt`.
- Do not emit layout coordinates; that belongs to the planner.
