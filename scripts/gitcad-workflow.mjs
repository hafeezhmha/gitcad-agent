import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const WORKFLOW_DIR = path.join(ROOT, "workflow");
const GENERATED_DIR = path.join(ROOT, "src/generated");

const DEFAULT_PROMPT =
  process.env.GITCAD_DEFAULT_PROMPT ??
  "Create a 12m x 8m apartment floorplan with a living room, bedroom, kitchen, bathroom, one main door, and two windows.";

const steps = [
  {
    id: "repo_inspection",
    agent: "repo-inspector",
    description: "Inspect repo paths, commands, and generated artifact targets.",
  },
  {
    id: "spec_parse",
    agent: "spec-parser",
    description: "Normalize the user prompt into floorplan.spec.json.",
  },
  {
    id: "geometry_plan",
    agent: "geometry-planner",
    description: "Convert the spec into room coordinates, walls, doors, and windows.",
  },
  {
    id: "code_generate",
    agent: "code-generator",
    description: "Generate the OpenGeometry renderer module.",
  },
  {
    id: "validate",
    agent: "validator",
    description: "Validate geometry and write geometry-report.md.",
  },
  {
    id: "report",
    agent: "reporter",
    description: "Summarize artifacts, validation status, and next demo commands.",
  },
];

function rel(filePath) {
  return path.relative(ROOT, filePath).replaceAll(path.sep, "/");
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeRepoInspection(prompt) {
  await fs.mkdir(WORKFLOW_DIR, { recursive: true });
  const inspection = {
    prompt,
    agentRoot: ".",
    openGeometryImport: "opengeometry",
    generatedDir: "src/generated",
    preview: "examples/src/gitcad-agent.html",
    validationCommand: "npm run generate",
    buildCommand: "npm run build",
    devCommand: "npm run dev",
    requiredAgentFiles: [
      "agent.yaml",
      "SOUL.md",
      "RULES.md",
      "skills/cad-generation/SKILL.md",
      "skills/geometry-validation/SKILL.md",
    ],
  };
  await fs.writeFile(path.join(WORKFLOW_DIR, "repo-inspection.json"), JSON.stringify(inspection, null, 2) + "\n");
}

async function readValidationStatus() {
  const reportPath = path.join(GENERATED_DIR, "geometry-report.md");
  const report = await fs.readFile(reportPath, "utf8");
  return report.includes("Status: PASS") ? "PASS" : "FAIL";
}

async function writeWorkflowReport(prompt, commandOutput) {
  const status = await readValidationStatus();
  const specExists = await exists(path.join(GENERATED_DIR, "floorplan.spec.json"));
  const layoutExists = await exists(path.join(GENERATED_DIR, "floorplan.layout.json"));
  const rendererExists = await exists(path.join(GENERATED_DIR, "floorplan.ts"));
  const reportExists = await exists(path.join(GENERATED_DIR, "geometry-report.md"));
  const adapterPath = path.join(WORKFLOW_DIR, "llm-adapter.json");
  const adapter =
    process.env.GITCAD_LLM_ADAPTER_ACTIVE === "1" && (await exists(adapterPath))
      ? JSON.parse(await fs.readFile(adapterPath, "utf8"))
      : null;
  const adapterSection = adapter
    ? `
## LLM Adapter

- Live model call: ${adapter.live ? "yes" : "no"}
- Provider: ${adapter.provider}
- Model: ${adapter.model ?? "n/a"}
- Original prompt: ${adapter.originalPrompt}
- Normalized prompt: ${adapter.normalizedPrompt}
- Fallback reason: ${adapter.fallbackReason ?? "n/a"}
`
    : "";

  const content = `# GitCAD Multi-Agent Workflow Report

Status: ${status}

## Prompt

${prompt}
${adapterSection}

## Agents Executed

${steps.map((step) => `- ${step.agent}: ${step.description}`).join("\n")}

## Artifacts

- ${specExists ? "[x]" : "[ ]"} src/generated/floorplan.spec.json
- ${layoutExists ? "[x]" : "[ ]"} src/generated/floorplan.layout.json
- ${rendererExists ? "[x]" : "[ ]"} src/generated/floorplan.ts
- ${reportExists ? "[x]" : "[ ]"} src/generated/geometry-report.md
- [x] workflow/repo-inspection.json
- ${adapter ? "[x]" : "[ ]"} workflow/llm-adapter.json
- [x] workflow/workflow-report.md

## Validation Command

\`\`\`bash
npm run generate
\`\`\`

## Validation Output

\`\`\`text
${commandOutput.trim()}
\`\`\`

## Preview

\`\`\`bash
npm run dev
\`\`\`

Open:

\`\`\`text
http://localhost:5566/gitcad-agent.html
\`\`\`

## Git Diff

\`\`\`bash
git diff -- gitcad-agent
\`\`\`
`;

  await fs.writeFile(path.join(WORKFLOW_DIR, "workflow-report.md"), content);
}

async function main() {
  const prompt = process.argv.slice(2).join(" ").trim() || DEFAULT_PROMPT;

  console.log("GitCAD multi-agent workflow");
  console.log(`Prompt: ${prompt}`);
  console.log("");

  for (const step of steps) {
    console.log(`→ ${step.agent}`);
    console.log(`  ${step.description}`);

    if (step.id === "repo_inspection") {
      await writeRepoInspection(prompt);
      console.log(`  wrote ${rel(path.join(WORKFLOW_DIR, "repo-inspection.json"))}`);
    }

    if (step.id === "spec_parse") {
      console.log("  queued for deterministic generator");
    }

    if (step.id === "geometry_plan") {
      console.log("  queued for deterministic generator");
    }

    if (step.id === "code_generate") {
      console.log("  queued for deterministic generator");
    }

    if (step.id === "validate") {
      const { stdout, stderr } = await execFileAsync("node", ["scripts/gitcad-generate.mjs", prompt], {
        cwd: ROOT,
        env: process.env,
      });
      const output = [stdout, stderr].filter(Boolean).join("\n");
      process.env.GITCAD_LAST_VALIDATION_OUTPUT = output;
      console.log(output.trim().split("\n").map((line) => `  ${line}`).join("\n"));
    }

    if (step.id === "report") {
      await writeWorkflowReport(prompt, process.env.GITCAD_LAST_VALIDATION_OUTPUT ?? "");
      console.log(`  wrote ${rel(path.join(WORKFLOW_DIR, "workflow-report.md"))}`);
    }

    console.log("");
  }

  const status = await readValidationStatus();
  console.log(`Workflow complete: ${status}`);
}

await main();
