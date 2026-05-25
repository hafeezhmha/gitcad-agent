# GitCAD Agent Progress

## Goal

Build a constrained GitAgent-powered CAD workflow for the Lyzr GitAgent challenge:

Prompt -> repo-native agent workflow -> generated floorplan spec/layout/code -> validation report -> OpenGeometry browser preview -> git diff.

## Scope

- Rectangular one-floor plans only.
- Rectangular rooms only.
- Simple doors and windows.
- Deterministic layout generation.
- Validation before demo.
- Visible GitAgent-style architecture files.

## Progress

- [x] Created progress tracker.
- [x] Inspected current OpenGeometry app surface.
- [x] Added GitAgent-style files.
- [x] Added floorplan generator.
- [x] Added geometry validator.
- [x] Added generated sample artifacts.
- [x] Added browser preview.
- [x] Verified build or dev flow.
- [x] Added AI agent environment scaffold.
- [x] Added OpenRouter, Claude, OpenAI, and Gemini provider env docs.
- [x] Added README architecture framing.
- [x] Added multi-agent role definitions.
- [x] Added multi-agent workflow runner.
- [x] Aligned manifests, tools, and skills with documented GitAgent protocol shape.
- [x] Added workflow artifacts: `workflow/repo-inspection.json` and `workflow/workflow-report.md`.
- [x] Verified `npm run workflow`.
- [x] Verified `npm run build`.
- [x] Repackaged preview to use raw `opengeometry` instead of parent OpenPlans source.
- [x] Verified raw OpenGeometry preview in headless Brave.
- [x] Removed local `node_modules/` and `dist/` build output after verification.
- [x] Added optional live LLM adapter command with deterministic fallback.

## Current Commands

```bash
npm run workflow
npm run workflow:llm
npm run generate
npm run build
npm run dev
```

Preview URL:

```text
http://localhost:5566/gitcad-agent.html
```

## Current Architecture

The challenge project now lives in `gitcad-agent/` as a separate GitAgent-style repository folder.

Multi-agent roles:

- `repo-inspector`
- `spec-parser`
- `geometry-planner`
- `code-generator`
- `validator`
- `repair`
- `reporter`

Protocol alignment:

- Main and sub-agent manifests include `spec_version: "0.1.0"`.
- Skills include YAML frontmatter.
- Declarative tools use `input_schema` and `implementation`.
- Native documented model providers are used in `agent.yaml`: `google`, `anthropic`, and `openai`.
- OpenRouter is documented as an adapter/runtime option in `.env.example` and `config/default.yaml`.
- `npm run workflow:llm` uses a live provider when configured, writes `workflow/llm-adapter.json`, and then runs the same deterministic validated workflow.

## Notes

- The project should be framed as a repo-native GitAgent workflow, not a generic chatbot.
- OpenGeometry is the rendering/kernel dependency; Three.js handles scene setup.
- Avoid broad CAD promises. The demo should show one reliable constrained workflow.
- Remaining work is demo/video packaging.
