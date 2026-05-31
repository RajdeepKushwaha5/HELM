# Helm — Submission Video Script (balanced ~4:30 cut)

This is the recording script for **Helm**. It keeps the full story spine but is cut to
land in about **4:30** so a judge watches it to the end. Helm's pitch in one line:

> **The answers a team needs live *between* their tools — and those tools were never built to talk. Coral turns all of them into one local SQL database. Helm is what you build on top.**

Three beats, one engine:
1. **Which PR broke production?** — code × errors × incidents (Helm's home, lead here)
2. **Which AI spend shipped nothing?** — LLM cost × tickets × code (follow the money)
3. **Which companies would even want this?** — jobs × public sentiment × code (the twist: same engine, different world)

**Do not open with the sales angle.** Open as who Helm is — an engineering intelligence
agent — and let the range reveal itself at the end.

---

## ⏱️ Timing map (target 4:30)

| Time | Act | Scene |
|---|---|---|
| 0:00–0:40 | Hook & architecture | WSL proof → Mission Control (green health) |
| 0:40–1:50 | The hero | Live Monitor → Root Cause → SQL proof |
| 1:50–2:25 | Don't trust me, run it | Ask Helm → SQL Sandbox |
| 2:25–3:10 | And it keeps going (montage) | Cascade · Team Health · CI Health · PR Review Agent |
| 3:10–4:10 | The twist | Token ROI → Lighthouse |
| 4:10–4:30 | Close | Mission Control |

---

## 🛠️ Pre-recording checklist (do this every time)

-   [ ] **WSL (Ubuntu) terminal open**, font size `16pt+` for legibility.
-   [ ] **Backend up** (`uvicorn` on `:8000`) and **frontend up** (Vite on `:5173`).
-   [ ] **Make the source strip green BEFORE you record.** This is the one that bit you:
    1. After the backend starts, open `http://127.0.0.1:8000/api/coral/health` in a tab and wait until every source shows `"status":"ok"` (a few seconds on the first call — Coral is warming).
    2. *Then* hard-refresh the Helm tab (**Ctrl+Shift+R**). The strip turns green and stays green.
    3. If you ever see "0/N online" with red dots, it's just a cold-start cache — warm the health endpoint and hard-refresh. Never start recording on red.
-   [ ] **Warm the slow pages once** (so they're instant on camera): Live Monitor, Token ROI, Lighthouse, PR Review Agent (run on PR `#18`), Handover Brief (for `RajdeepKushwaha5`).
-   [ ] Browser at 100–110% zoom, sidebar visible, notifications off, taskbar hidden.

---

## 🚀 ACT 0 — The hook (0:00 – 0:40)

### Scene 1 — The WSL proof (0:00 – 0:20)
**DO:** Start on the Ubuntu WSL terminal. Run:
```bash
export CORAL_CONFIG_DIR=/home/rjdp/coral-local-test
/home/rjdp/.local/bin/coral source list
```
Let the **twelve** sources fill the screen.

**SAY:**
> "Let's start with proof this is real. Running locally on my machine is Coral — a federated SQL engine — with twelve live sources connected: GitHub, Sentry, PagerDuty, Linear, Slack, CircleCI, Langfuse, Adzuna, HackerNews, and more. Helm copies zero data. No warehouse, no ETL. Everything you're about to see is a live SQL query running straight against these APIs."

### Scene 2 — Mission Control & architecture (0:20 – 0:40)
**DO:** Cut to the browser, **Mission Control**. Point to the source health strip — **all green**. Briefly point to the header pill: `8 SQL queries · 6 cross-source · ~58 MCP calls saved`.

**SAY:**
> "Here's Mission Control. Every metric on this page is live SQL, and all our sources are online — three of them, CircleCI, HackerNews and Langfuse, we built from scratch for this hackathon. One more thing up here: a normal AI agent would answer these questions by making about fifty-eight sequential tool calls — one slow round-trip at a time, with all the cost and timeouts that brings. Coral runs the whole thing as a single compiled query. That's the core idea, so let me show you what it unlocks."

---

## 🚨 ACT 1 — The hero: which PR broke production? (0:40 – 1:50)

*This is Helm's identity. Spend your best 70 seconds here.*

### Scene 3 — The crisis (0:40 – 1:00)
**DO:** Click **Live Monitor**. Let the widgets render; the PR → error chain card is visible.

**SAY:**
> "Here's a story every engineer knows. Production just broke. The pager's going off, Slack is noisy, Sentry is full of crashes — and you know a pull request caused it, but which one? The clue's in GitHub, the crash is in Sentry, the page is in PagerDuty, the thread is in Slack. Four systems, four tabs, stitched together by hand at the worst possible moment."

### Scene 4 — Root Cause: one SQL join (1:00 – 1:30)
**DO:** Click **Root Cause**. Show the 4-source causal card graph; hover the links. Optionally click **Constellation** for the node graph.

**SAY:**
> "Helm does it in one query. On the left, a merged GitHub PR. On the right, the production error in Sentry. In the middle, Coral runs a live SQL join — matching the merge time to the first-seen error window, the error to the PagerDuty incident, the incident to the Slack thread. It finds the exact PR that broke production. One query instead of an hour of digging."

### Scene 5 — Every answer carries its proof (1:30 – 1:50)
**DO:** Open the **SQL Proof** panel on the card. Point at the SQL text, source chips, row count, runtime in ms.

**SAY:**
> "And you don't take my word for it. Every answer in Helm carries its own proof — the exact SQL, the sources it read, the row count, the runtime. No chart is ever shown without the query behind it. That's the rule."

---

## 🔎 ACT 2 — Don't trust me, run it (1:50 – 2:25)

### Scene 6 — Ask Helm, in plain English (1:50 – 2:10)
**DO:** Click **Ask Helm**. Type: `Which PR caused the latest production error?` Let it stream and land. Then type a follow-up: `What's their deploy error rate?` and point to the **"Memory: 2 turns"** indicator.

**SAY:**
> "If you'd rather just ask, you can. Ask Helm turns plain English into Coral SQL, has Gemini explain the verified rows, and attaches the query as evidence. And notice the follow-up — I didn't repeat who I meant. Helm keeps the session in local memory and carries the author into the next query. Multi-turn conversation, backed by real SQL."

### Scene 7 — Run it yourself (2:10 – 2:25)
**DO:** Click **SQL Sandbox** → pick the **PR → Error JOIN** template → **Run**.

**SAY:**
> "And if you want to run it raw, the SQL Sandbox lets you query live APIs directly. Here's the PR-to-error join, returning live GitHub and Sentry rows as one clean table. That one screen is the whole idea of Helm."

---

## ⚡ ACT 3 — And it keeps going (montage) (2:25 – 3:10)

*Fast cuts, one breath each. Don't linger — this is the "there's a lot here" beat. Keep moving.*

**DO:** Quick navigate, ~8–10 seconds per page, pointing at the one thing that matters on each:
1. **Cascade Warning** — point at the risk score and the deploy-to-error chains.
2. **Team Health / Workload Risk** — point at the `RajdeepKushwaha5` row (off-hours PRs + overdue tickets + errors).
3. **CI Health** — point at a PR that passed CI green but still crashed production.
4. **PR Review Agent** — show the pre-generated review for PR #18, then flash the **Approval Queue** (clipboard-only).

**SAY:**
> "And the same engine keeps answering. *Cascade Warning* catches regressions before the pager even fires — newly merged PRs already throwing Sentry errors. *Team Health* joins GitHub, Linear, and Sentry per engineer to find who's overloaded — pushing PRs off-hours, carrying overdue tickets, and shipping errors. *CI Health* finds PRs that passed CI green but still crashed production. And the *PR Review Agent* writes a full review from the live diff, errors, and incidents — but Helm never writes back to your tools. Every action lands in an approval queue, clipboard-only, human in the loop."

---

## 🎨 ACT 4 — The twist: same engine, new worlds (3:10 – 4:10)

### Scene 9 — Token ROI: follow the money (3:10 – 3:40)
**DO:** Click **Token ROI**. Let the score ring and table load. Point at `customer-rag-pipeline` (orphan spend), then `billing-agent` (linked to a real Linear ticket). Optionally click **Model Mismatch**.

**SAY:**
> "Now watch the same engine solve a completely different problem. Every company in 2026 knows its AI bill — almost none know what that money built. Token ROI joins Langfuse cost with Linear tickets and the code those tokens shipped. The top row burned the most money this week but has no ticket and shipped nothing — orphan spend, impossible to see before because the cost lived in Langfuse and the work lived in Linear. Below it, Coral matched the spend to the exact ticket it paid for. Same engine — different tables."

### Scene 10 — Lighthouse: outside engineering entirely (3:40 – 4:10)
**DO:** Click **Lighthouse**. Let the prospect cards load. Point at the Adzuna job title, the HackerNews pain quote, and the generated outreach copy.

**SAY:**
> "And it doesn't even have to be your own company. Lighthouse joins Adzuna job listings, public HackerNews threads, and GitHub activity to find sales prospects — companies hiring data engineers, with public quotes about pipeline pain, and it drafts personalized outreach. We changed the tables, not the tool. That's the whole point of Coral."

---

## 🏁 ACT 5 — Close (4:10 – 4:30)

**DO:** Navigate back to **Mission Control**. Let it sit.

**SAY:**
> "One local SQL engine told us which PR broke production, who's overloaded, which AI tokens were wasted, and which companies to sell to next — all live, all backed by raw SQL proof, and nothing copied or stored. That's local-first federated SQL. That's Helm."

**DO:** Hold two seconds. Fade to black.

---

## 📚 Every other page (ordered reference + splice-in lines)

The cut above is the winning 4:30. But Helm has more, and you should know what each
remaining page is so you can (a) answer judge questions, and (b) splice any of them in
if you want to stretch toward 5 minutes. They're listed **in story order** — each one
slots into the act it naturally belongs to. One line of what it is, one line to say.

### Slots into Act 0 (the hook)
- **How Helm Works (Architecture).** A visual flow diagram of the federated engine plus the "AI tool loop vs Coral" comparison.
  > "Under the hood, every source is compiled into one query plan — not fifty-eight sequential API calls."

### Slots into Act 1 (the incident hero)
- **Constellation.** The same incident chain drawn as an interactive node graph.
  > "Same incident, as a live graph — every edge is a SQL join condition."
- **Cascade Warning.** Predictive: newly merged PRs already throwing Sentry errors but no page yet. *(Also the first beat of the Act 3 montage.)*
  > "Catches regressions before the pager even fires."

### Slots into Act 3 (deep-dive attribution — the "prove it with math" block)
- **Deploy Trend.** GitHub deployment frequency over time.
  > "How often we ship, as a time series."
- **Release Impact.** Deploy frequency joined against Sentry error volume.
  > "Overlays release cadence with error volume — is shipping faster breaking things?"
- **Release Attribution.** Maps Sentry releases to GitHub commit SHAs.
  > "Which PR shipped in which release, and how many new errors it introduced."
- **MTTR Attribution.** Mean time from merge to first production error, per author.
  > "Average time from merge to first production error, by engineer."

### Slots into Act 3 (team & service health)
- **Workload Risk.** Flags the overloaded engineers surfaced by Team Health. *(Second beat of the montage.)*
  > "Who's pushing off-hours, carrying overdue tickets, and shipping errors — all at once."
- **Ticket Pressure.** The same workload, rolled up to team level from Linear.
  > "Team-level ticket load — which squad is drowning."
- **Service Health.** Sentry errors joined with PagerDuty incidents by service name.
  > "Which microservices are genuinely unstable, by joining errors to incidents."

### Slots into Act 3 (CI & review debt)
- **CI Health.** PRs that passed CI green but still crashed production. *(Third beat of the montage.)*
  > "Green build, broken prod — the exact gap in test coverage."
- **Review Debt Aging.** Open PRs stalled in review, mapped to active Sentry errors.
  > "The fix is already written — it's just stuck waiting for approval while the error keeps firing."
- **Ticket Thread Tracker.** Linear ticket mentions across Slack channels.
  > "Which tickets are generating the most Slack noise."

### Slots into Act 3 (gated AI actions)
- **PR Review Agent.** Full structured review from the live diff, errors, and incidents. *(Fourth beat of the montage.)*
  > "A complete review, written from live SQL evidence — not a guess."
- **Self-Heal.** Takes the causal chain, scores the risk, drafts a Slack update + Linear ticket + GitHub rollback note.
  > "Turns the root cause into draft remediation — nothing is ever sent."
- **Risk Scorecard.** The audit trail: risk level behind every deployment.
  > "Compliance view — the score behind every deploy."
- **Approval Queue.** Every drafted action held clipboard-only, human in the loop. *(Shown at the end of the montage.)*
  > "Helm never writes back to your tools. A human approves everything."
- **Handover Brief.** Aggregates an engineer's PR history, tickets, and error ownership into a transfer brief.
  > "A full on-call handover for any engineer, in seconds."

### Slots into Act 2 (proof / inspectability)
- **SQL Proofs center.** One place to audit every query the app ran.
  > "Every statement, runtime, and row count Helm produced — all auditable in one place."

> **How to use this:** the 4:30 cut already names Cascade, Team Health/Workload Risk,
> CI Health, PR Review Agent, and Approval Queue inside the montage. The rest are
> *bench depth* — keep them ready for Q&A, or drop one or two into the montage if you
> have time. Don't try to show all of them on camera; that's how you get back to 7:35.

---

## 🎙️ Delivery notes
- **Pace:** Acts 0–2 are slow and clear (this is your story). Act 3 is fast (don't explain, just show). Acts 4–5 slow back down for the payoff.
- **If a panel is slow on camera:** *"That's Coral querying live — no cached warehouse behind it, give it a second."*
- **If asked about the ~58 MCP calls / efficiency:** that figure is real and shown in the header pill (queries × sources). Speak to *that*, not to a percentage. Avoid quoting accuracy/cost/latency percentages unless you can show the measurement — lead with "one compiled query vs ~58 sequential tool calls," which is provable on screen.
- **Never start on a red source strip.** Warm `/api/coral/health` and hard-refresh first.

---

## 💡 Optional adds (only if you have time before recording)
- **A single "wow" number on Mission Control** the eye lands on in second one (e.g. "1 PR → 1 prod error, found in 4.6s across 2 sources"). Judges remember one number.
- **Make the hero card the literal first thing on Live Monitor** so Scene 3→4 needs zero scrolling.
- Everything else in the app is already strong — resist adding features now. The win is in *tightening the telling*, not in more pages.
