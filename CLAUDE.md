# Project context: Clinic Wait Time app + model comparison script (course project)

## Goal
Continue and maintain a small course project from the files in this folder.
Never ask for, print, or store API keys or tokens.

## 1. Clinic wait-time page (built, prototype hosted)
- One self-contained HTML page (about 60 KB, no libraries, no network calls) with a
  patient view and a staff view (add `#staff` to the address). It shows the current
  wait, "closed", or "we don't have a current wait time".
- Rules:
  - A wait is shown only if posted within 60 minutes (caution at 45).
  - Open/closed comes from weekly hours in the clinic's time zone plus a one-day
    override (closing early or closed all day) that expires at midnight clinic time.
  - A "Confirm: still about N minutes" button re-posts the same wait in one tap.
- Files: `page.template.html` (source of truth), `build.py` (builds `index.html`),
  `tests.js` (37 tests), `flow-tests.js` (10 persona flow tests), `a11y-audit.js`.
- Commands (originally written for Windows PowerShell; same on macOS):
  ```
  python build.py index.html
  node tests.js index.html
  npm install jsdom axe-core
  node flow-tests.js index.html
  node a11y-audit.js index.html result.json
  ```
- IMPORTANT: `index.html` embeds its own template so staff can republish it. Always
  edit `page.template.html` and rebuild with `build.py`. Never hand-edit `index.html`.
  Rebuild with the current live state (wait, updatedAt, override) if given.
- Publishing happens in claude.ai (Artifact), not from here.
- Honest status: the 3 "users" tested so far were simulated personas, not real people.
  Real-phone, slow-3G, screen-reader and 200% zoom checks are not done.
  Demo clinic name and phone number (555) 010-0199 are fictional.
- The source files were created in a claude.ai chat and must be copied into this
  folder (download from `/mnt/user-data/outputs/clinic-wait-time/` in that chat).
  They are NOT here yet.

## 2. Model comparison script (Python, not built into the page)
- Uses the internal LLM Gateway Express, which is OpenAI-compatible, NOT the Anthropic SDK:
  - base: `https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl`
  - `GET /v1/models`, `POST /chat/completions`
  - header: `Authorization: Bearer <key from env var ENG_AI_MODEL_GW_KEY>`
- List models first and use only IDs the gateway returns.
- Non-production only. Never send customer data. Limit: 50 requests/minute/user.
- The user sets the key themselves in their shell (on macOS:
  `export ENG_AI_MODEL_GW_KEY=...`), never in a file.
- May need VPN. Support: Slack #llm-gateway-express-support.

## How to work
- Run the tests after every change and report failures as they are.
- Say what could not be verified. Do not claim something works until tests ran.
- Keep changes small. Ask before adding dependencies.
