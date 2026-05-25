# Demo Script

1. Show `agent.yaml`, `SOUL.md`, `RULES.md`, and `skills/`.
2. Show `.env.example` and explain that the deterministic demo runs without keys, while `OPENROUTER_API_KEY` enables the preferred live AI agent path. Claude, OpenAI, and Gemini keys are documented as fallback/native provider options.
3. Explain that the agent is repo-native: rules, skills, memory, generated files, and validation all live in git.
4. Run the live adapter path when an API key is configured, or let it record deterministic fallback:

```bash
npm run workflow:llm
```

5. Run the deterministic multi-agent workflow directly:

```bash
npm run workflow
```

6. Show `workflow/llm-adapter.json`, `workflow/workflow-report.md`, and explain the role handoff.
7. Optionally run the deterministic generator directly:

```bash
npm run generate
```

8. Show generated artifacts in `src/generated/`.
9. Show `geometry-report.md` with `Status: PASS`.
10. Run:

```bash
npm run dev
```

11. Open `http://localhost:5566/gitcad-agent.html`.
12. Switch between Plan and Model views.
13. End with `git diff` to show the repo-native output surface.
