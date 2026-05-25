# GitCAD Agent Demo Guide

This is the exact demo path for the Lyzr GitAgent challenge.

## What The Challenge Wants

The challenge asks for a project built using GitAgent, plus:

- a GitHub repository
- a 3-5 minute demo video
- a short architecture and thought-process explanation

The important thing to demonstrate is not only the CAD preview. Demonstrate that the agent workflow lives in git and produces versioned repository artifacts.

## What To Commit Before Recording

Commit the source project first so the generated workflow changes are easy to see as a diff.

```bash
cd /path/to/gitcad-agent
git init
git add .
git commit -m "Initial GitCAD multi-agent workflow"
```

Then run the workflow during the demo. If you want the generated artifacts to appear as fresh changes, reset only the generated outputs before the demo:

```bash
git rm -r --cached src/generated workflow
git checkout -- src/generated workflow
```

For a simpler demo, keep the generated artifacts committed and show `npm run workflow` rewriting them plus `workflow/workflow-report.md`.

## Demo Flow

1. Open the repository root.

```bash
cd /path/to/gitcad-agent
```

2. Show the GitAgent structure.

```bash
ls
find agents -maxdepth 2 -type f | sort
find skills tools workflows -maxdepth 3 -type f | sort
```

Show these files:

```text
agent.yaml
SOUL.md
RULES.md
agents/
skills/
tools/
workflows/
memory/
config/
```

3. Show the multi-agent workflow.

```bash
cat workflows/floorplan-generation.yaml
```

Explain the handoff:

```text
repo-inspector -> spec-parser -> geometry-planner -> code-generator -> validator -> repair -> reporter
```

4. Run the workflow.

```bash
npm run workflow
```

Expected result:

```text
Workflow complete: PASS
```

5. Show the generated repo artifacts.

```bash
ls src/generated
cat src/generated/geometry-report.md
cat workflow/workflow-report.md
```

6. Show the generated CAD layout/code.

```bash
sed -n '1,120p' src/generated/floorplan.layout.json
sed -n '1,120p' src/generated/floorplan.ts
```

7. Run the browser preview.

```bash
npm run dev
```

Open:

```text
http://localhost:5566/gitcad-agent.html
```

Show:

- validation status is `PASS`
- rooms/walls/openings are counted
- plan view renders
- model view toggle works

8. Show git diff.

```bash
git diff
```

This is the key GitAgent point: the agent creates auditable repository changes instead of only returning a chat answer.

## What To Say The Agentic Part Is

The agentic part is the repo-native workflow:

```text
prompt
-> repo-inspector
-> spec-parser
-> geometry-planner
-> code-generator
-> validator
-> repair if needed
-> reporter
-> generated files
-> validation report
-> preview
-> git diff
```

Each role has its own `agent.yaml`, `SOUL.md`, and `RULES.md`. The root `agent.yaml` declares the overall GitAgent workflow, model providers, skills, tools, and delegation.

## Packaging For GitHub

This folder is now designed to be pushed as its own repository.

The preview now uses raw `opengeometry` plus `three`, so this folder can be pushed as an independent GitHub repository.

Install dependencies:

```bash
npm install
```

The relevant package dependency is:

```json
"opengeometry": "^2.0.9"
```

Do not commit:

```text
node_modules/
dist/
.env
```
