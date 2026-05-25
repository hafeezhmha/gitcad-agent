import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const WORKFLOW_DIR = path.join(ROOT, "workflow");

const DEFAULT_PROMPT =
  process.env.GITCAD_DEFAULT_PROMPT ??
  "Create a 12m x 8m apartment floorplan with a living room, bedroom, kitchen, bathroom, one main door, and two windows.";

const SYSTEM_PROMPT = `You are the prompt normalization adapter for GitCAD Agent.
Convert a user request into one constrained CAD prompt for the deterministic generator.
Only support one-floor rectangular buildings, rectangular rooms, simple doors, and simple windows.
Return strict JSON with these keys:
{
  "normalizedPrompt": "one sentence that includes building dimensions, room names, door count, and window count",
  "assumptions": ["short assumption strings"],
  "unsupportedRequests": ["short unsupported request strings"]
}
Do not include markdown.`;

function loadDotEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return;
  const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match) return;
  const [, key, rawValue] = match;
  if (process.env[key]) return;
  process.env[key] = rawValue.replace(/^["']|["']$/g, "");
}

async function loadDotEnv() {
  try {
    const envFile = await fs.readFile(path.join(ROOT, ".env"), "utf8");
    envFile.split(/\r?\n/).forEach(loadDotEnvLine);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function selectProvider() {
  if (process.env.OPENROUTER_API_KEY) {
    return {
      name: "openrouter",
      model: process.env.OPENROUTER_MODEL || "google/gemini-2.5-pro",
      apiKey: process.env.OPENROUTER_API_KEY,
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      name: "openai",
      model: process.env.OPENAI_MODEL || "gpt-4o",
      apiKey: process.env.OPENAI_API_KEY,
    };
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return {
      name: "anthropic",
      model: process.env.ANTHROPIC_MODEL || process.env.GITCAD_FALLBACK_MODEL || "claude-sonnet-4-5-20251001",
      apiKey: process.env.ANTHROPIC_API_KEY,
    };
  }

  if (process.env.GEMINI_API_KEY) {
    return {
      name: "gemini",
      model: process.env.GEMINI_MODEL || process.env.GITCAD_MODEL || "gemini-2.0-flash",
      apiKey: process.env.GEMINI_API_KEY,
    };
  }

  return null;
}

function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("LLM response did not contain a JSON object.");
    return JSON.parse(match[0]);
  }
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Provider returned ${response.status}: ${body.slice(0, 500)}`);
  }
  return JSON.parse(body);
}

async function callOpenAiCompatible(provider, prompt) {
  const endpoint =
    provider.name === "openrouter" ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.openai.com/v1/chat/completions";
  const headers = {
    Authorization: `Bearer ${provider.apiKey}`,
    "Content-Type": "application/json",
  };

  if (provider.name === "openrouter") {
    headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL || "http://localhost:5566";
    headers["X-Title"] = process.env.OPENROUTER_SITE_NAME || "GitCAD Agent";
  }

  const data = await requestJson(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.1,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  return data.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic(provider, prompt) {
  const data = await requestJson("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: 1024,
      temperature: 0.1,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  return data.content?.map((part) => part.text ?? "").join("\n") ?? "";
}

async function callGemini(provider, prompt) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${provider.model}:generateContent?key=${provider.apiKey}`;
  const data = await requestJson(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
  });

  return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n") ?? "";
}

async function normalizeWithProvider(provider, prompt) {
  if (provider.name === "openrouter" || provider.name === "openai") {
    return callOpenAiCompatible(provider, prompt);
  }
  if (provider.name === "anthropic") return callAnthropic(provider, prompt);
  if (provider.name === "gemini") return callGemini(provider, prompt);
  throw new Error(`Unsupported provider: ${provider.name}`);
}

function fallbackAdapter(prompt, reason) {
  return {
    live: false,
    provider: "deterministic-fallback",
    model: null,
    originalPrompt: prompt,
    normalizedPrompt: prompt,
    assumptions: ["No live provider was available, so the original prompt was sent to the deterministic workflow."],
    unsupportedRequests: [],
    fallbackReason: reason,
  };
}

async function writeAdapterArtifact(adapter) {
  await fs.mkdir(WORKFLOW_DIR, { recursive: true });
  await fs.writeFile(path.join(WORKFLOW_DIR, "llm-adapter.json"), JSON.stringify(adapter, null, 2) + "\n");
}

async function main() {
  await loadDotEnv();
  const originalPrompt = process.argv.slice(2).join(" ").trim() || DEFAULT_PROMPT;
  const provider = selectProvider();
  let adapter;

  if (!provider) {
    adapter = fallbackAdapter(originalPrompt, "No OPENROUTER_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY was set.");
  } else {
    try {
      const responseText = await normalizeWithProvider(provider, originalPrompt);
      const parsed = extractJson(responseText);
      adapter = {
        live: true,
        provider: provider.name,
        model: provider.model,
        originalPrompt,
        normalizedPrompt: parsed.normalizedPrompt || originalPrompt,
        assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
        unsupportedRequests: Array.isArray(parsed.unsupportedRequests) ? parsed.unsupportedRequests : [],
      };
    } catch (error) {
      if (process.env.GITCAD_LLM_REQUIRED === "1") throw error;
      adapter = fallbackAdapter(originalPrompt, error.message);
    }
  }

  await writeAdapterArtifact(adapter);
  console.log(`GitCAD LLM adapter: ${adapter.live ? `${adapter.provider}:${adapter.model}` : adapter.provider}`);
  console.log(`Normalized prompt: ${adapter.normalizedPrompt}`);

  const { stdout, stderr } = await execFileAsync("node", ["scripts/gitcad-workflow.mjs", adapter.normalizedPrompt], {
    cwd: ROOT,
    env: { ...process.env, GITCAD_LLM_ADAPTER_ACTIVE: "1" },
  });
  process.stdout.write(stdout);
  process.stderr.write(stderr);
}

await main();
