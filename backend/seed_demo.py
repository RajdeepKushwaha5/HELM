"""
Helm Demo Seed Script
Seeds GitHub PRs, Sentry-linked errors, Slack incident messages,
Linear issues, and PagerDuty incidents so the demo always looks great.

Usage:
    python seed_demo.py                  # seed everything
    python seed_demo.py --github         # GitHub PRs only
    python seed_demo.py --slack          # Slack messages only
    python seed_demo.py --linear         # Linear issues only
    python seed_demo.py --pagerduty      # PagerDuty incidents only
    python seed_demo.py --sentry-events  # Sentry error events only
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ── Load .env ────────────────────────────────────────────────────────────────
_ENV = Path(__file__).parent / ".env"
if _ENV.exists():
    for _line in _ENV.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            os.environ.setdefault(_k.strip(), _v.strip().strip('"'))

GITHUB_TOKEN  = os.environ.get("GITHUB_TOKEN", "")
GITHUB_OWNER  = os.environ.get("GITHUB_OWNER", "RajdeepKushwaha5")
GITHUB_REPO   = os.environ.get("GITHUB_REPO",  "nimbus-checkout-api")
LINEAR_API_KEY  = os.environ.get("LINEAR_API_KEY", "")
PAGERDUTY_TOKEN = os.environ.get("PAGERDUTY_API_TOKEN", "")
SLACK_TOKEN     = os.environ.get("SLACK_BOT_TOKEN") or os.environ.get("SLACK_TOKEN", "")
SLACK_CHANNEL   = os.environ.get("SLACK_INCIDENTS_CHANNEL", "")
SENTRY_TOKEN    = os.environ.get("SENTRY_TOKEN", "")
SENTRY_ORG      = os.environ.get("SENTRY_ORG", "")

NOW = datetime.now(timezone.utc)


# ── HTTP helpers ─────────────────────────────────────────────────────────────

def _req(url: str, method: str = "GET", data: dict | None = None, headers: dict | None = None) -> dict:
    body = json.dumps(data).encode() if data else None
    hdrs = headers or {}
    if body:
        hdrs.setdefault("Content-Type", "application/json")
    r = urllib.request.Request(url, data=body, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        body_text = e.read().decode(errors="replace")[:400]
        raise RuntimeError(f"HTTP {e.code} {e.reason} -> {body_text}") from e


def gh(path: str, method: str = "GET", data: dict | None = None) -> dict:
    return _req(
        f"https://api.github.com{path}",
        method, data,
        {
            "Authorization": f"Bearer {GITHUB_TOKEN}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )


def linear_gql(query: str, variables: dict | None = None) -> dict:
    return _req(
        "https://api.linear.app/graphql",
        "POST",
        {"query": query, "variables": variables or {}},
        {"Authorization": LINEAR_API_KEY},
    )


def pd(path: str, method: str = "GET", data: dict | None = None, from_email: str | None = None) -> dict:
    email = from_email or "helm-demo@example.com"
    return _req(
        f"https://api.pagerduty.com{path}",
        method, data,
        {
            "Authorization": f"Token token={PAGERDUTY_TOKEN}",
            "Accept": "application/vnd.pagerduty+json;version=2",
            "From": email,
        },
    )



def slack_post(channel: str, text: str, blocks: list | None = None) -> dict:
    payload: dict = {"channel": channel, "text": text}
    if blocks:
        payload["blocks"] = blocks
    return _req(
        "https://slack.com/api/chat.postMessage",
        "POST", payload,
        {"Authorization": f"Bearer {SLACK_TOKEN}"},
    )


def sentry(path: str, method: str = "GET", data: dict | None = None) -> dict:
    return _req(
        f"https://sentry.io/api/0{path}",
        method, data,
        {"Authorization": f"Bearer {SENTRY_TOKEN}"},
    )


def ok(msg: str):  print(f"  [OK] {msg}")
def warn(msg: str): print(f"  [!]  {msg}")
def err(msg: str):  print(f"  [X]  {msg}")
def section(title: str): print(f"\n--- {title} ---")


# ── Demo PR specs ─────────────────────────────────────────────────────────────

PR_SPECS = [
    {
        "branch": "fix/payment-null-guard",
        "title": "fix: null guard on payment processor response",
        "body": "## What\nPayment processor occasionally returns `null` on network blip. Added defensive null-check before parsing `transaction_id`.\n\n## Why\nSentry error `TypeError: Cannot read properties of null` was hitting ~30x/hr in production.\n\n## Testing\nAdded unit test for null response case. Smoke-tested against sandbox gateway.",
        "file": "src/payment.js",
        "content": '// payment.js\nexport function processPayment(response) {\n  // Guard against null response from payment gateway (see Sentry HELM-42)\n  if (!response || !response.transaction_id) {\n    throw new Error("Payment gateway returned null or missing transaction_id");\n  }\n  return {\n    transactionId: response.transaction_id,\n    status: response.status,\n    amount: response.amount,\n  };\n}\n',
    },
    {
        "branch": "fix/cart-session-timeout",
        "title": "fix: clear cart on session expiry to prevent stale checkout",
        "body": "## What\nCart was persisting across expired sessions, causing users to check out with another user's items in edge cases.\n\n## Why\nRace condition between session expiry and cart read. Cart now checks session validity on every read.\n\n## Risk\nLow — existing sessions unaffected, only impacts expired sessions.",
        "file": "src/cart.js",
        "content": '// cart.js\nexport function getCart(session) {\n  if (!session || session.expired) {\n    // Do not leak stale cart data across session boundary\n    return { items: [], total: 0, sessionValid: false };\n  }\n  return session.cart;\n}\n\nexport function addItem(session, item) {\n  if (!session || session.expired) {\n    throw new Error("Cannot add to cart: session has expired");\n  }\n  session.cart.items.push(item);\n  session.cart.total += item.price * item.quantity;\n  return session.cart;\n}\n',
    },
    {
        "branch": "fix/inventory-race-condition",
        "title": "fix: atomic inventory decrement to prevent overselling",
        "body": "## What\nInventory was being decremented non-atomically, allowing two concurrent checkouts to both succeed on the last item.\n\n## Why\nPagerDuty incident PDI-1892 traced to 47 oversold orders over the Black Friday weekend.\n\n## Solution\nAdded optimistic locking via `version` column. Retries up to 3x on version conflict.",
        "file": "src/inventory.js",
        "content": '// inventory.js\nconst MAX_RETRIES = 3;\n\nexport async function decrementStock(db, itemId, qty) {\n  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {\n    const item = await db.find("inventory", { id: itemId });\n    if (!item || item.stock < qty) {\n      throw new Error(`Insufficient stock for item ${itemId}`);\n    }\n    const updated = await db.updateWhere(\n      "inventory",\n      { id: itemId, version: item.version },\n      { stock: item.stock - qty, version: item.version + 1 }\n    );\n    if (updated) return true;\n  }\n  throw new Error("Inventory update conflict after retries — possible oversell condition");\n}\n',
    },
    {
        "branch": "feat/retry-inventory-api",
        "title": "feat: exponential back-off retry for inventory service calls",
        "body": "## What\nAdded retry logic with exponential back-off for the external inventory service calls.\n\n## Why\nInventory service has p99 latency spikes of ~4s during peak. Without retries, checkout failures spike in tandem.\n\n## Config\n- Max retries: 3\n- Base delay: 200ms\n- Jitter: ±50ms\n\n## Observability\nAdded `checkout.inventory_retry_count` metric to Sentry performance traces.",
        "file": "src/inventory_client.js",
        "content": '// inventory_client.js — retries with exponential back-off\nconst BASE_DELAY = 200;\nconst MAX_RETRIES = 3;\n\nasync function sleep(ms) {\n  return new Promise((r) => setTimeout(r, ms));\n}\n\nexport async function fetchInventory(itemId) {\n  let lastError;\n  for (let i = 0; i < MAX_RETRIES; i++) {\n    try {\n      const res = await fetch(`/api/inventory/${itemId}`);\n      if (!res.ok) throw new Error(`HTTP ${res.status}`);\n      return await res.json();\n    } catch (e) {\n      lastError = e;\n      const delay = BASE_DELAY * 2 ** i + Math.random() * 50;\n      await sleep(delay);\n    }\n  }\n  throw new Error(`Inventory fetch failed after ${MAX_RETRIES} retries: ${lastError?.message}`);\n}\n',
    },
    {
        "branch": "fix/auth-jwt-expiry",
        "title": "fix: reject expired JWTs before checkout proceeds",
        "body": "## What\nJWT expiry was only checked at login, not at checkout initiation. Long shopping sessions were proceeding with expired tokens.\n\n## Why\nSentry captured `JsonWebTokenError: jwt expired` 12x/day on the checkout confirm route.\n\n## Fix\nAdded middleware that re-validates JWT expiry on the `/checkout/confirm` route before any payment processing.",
        "file": "src/auth_middleware.js",
        "content": '// auth_middleware.js\nimport jwt from "jsonwebtoken";\n\nexport function requireValidJwt(req, res, next) {\n  const token = req.headers.authorization?.replace("Bearer ", "");\n  if (!token) {\n    return res.status(401).json({ error: "Missing authorization token" });\n  }\n  try {\n    const payload = jwt.verify(token, process.env.JWT_SECRET);\n    // Extra check: reject tokens within 30s of expiry to prevent race on long checkouts\n    if (payload.exp - Date.now() / 1000 < 30) {\n      return res.status(401).json({ error: "Token expiring too soon — please re-authenticate" });\n    }\n    req.user = payload;\n    next();\n  } catch (e) {\n    return res.status(401).json({ error: `JWT validation failed: ${e.message}` });\n  }\n}\n',
    },
]


# ── Slack message specs ───────────────────────────────────────────────────────

SLACK_MESSAGES = [
    {
        "text": ":rotating_light: *P1 INCIDENT — checkout.null-cart* Sentry spike: 47 `NullReferenceException` events in last 30 min. PR #18 (`fix/checkout-null-cart`) is the likely causal PR — merged 23 min before first error. Coral SQL join confirms 0 PagerDuty incidents prior to merge, 2 opened after.",
    },
    {
        "text": ":white_check_mark: *RESOLVED — checkout.null-cart* Fix deployed via PR #22. Sentry error rate back to baseline. MTTR: 38 minutes. Post-mortem Linear ticket created: HELM-91.",
    },
    {
        "text": ":warning: *DEGRADED — inventory service* p99 latency spiked to 4.2s after 14:30 UTC deploy. Checkout completion rate dropped 12%. PagerDuty: PD-2041 open. On-call: @rajdeep. Rollback candidate: PR #19 (`feat/retry-inventory-api`).",
    },
    {
        "text": ":male-detective: *Root cause confirmed* Coral SQL 4-source JOIN (GitHub × Sentry × PagerDuty × Slack): PR #20 (`fix/inventory-race-condition`) merged at 11:17 UTC → Sentry `StockConflictError` first seen 11:19 UTC → PD-2039 opened 11:22 UTC → this Slack thread 11:24 UTC. Evidence score: 87/100.",
    },
    {
        "text": ":bar_chart: *Weekly incident summary* 6 incidents this week (↑2 vs last). Top causal PR: #18 (3 incidents). Top affected service: checkout-api. Avg MTTR: 24 min. 2 PRs merged without review (see Review Debt). Coral SQL across GitHub × Sentry × PagerDuty — no manual correlation.",
    },
]


# ── GitHub seeder ─────────────────────────────────────────────────────────────

def seed_github():
    section("GitHub — creating demo PRs")
    if not GITHUB_TOKEN:
        err("GITHUB_TOKEN not set — skipping"); return

    # Get default branch SHA
    try:
        repo = gh(f"/repos/{GITHUB_OWNER}/{GITHUB_REPO}")
        default_branch = repo.get("default_branch", "main")
        ref = gh(f"/repos/{GITHUB_OWNER}/{GITHUB_REPO}/git/ref/heads/{default_branch}")
        base_sha = ref["object"]["sha"]
        ok(f"Base branch: {default_branch} @ {base_sha[:7]}")
    except Exception as e:
        err(f"Cannot fetch repo: {e}"); return

    created = []
    for spec in PR_SPECS:
        branch = spec["branch"]
        try:
            # Check if branch already exists
            try:
                gh(f"/repos/{GITHUB_OWNER}/{GITHUB_REPO}/git/ref/heads/{branch}")
                warn(f"Branch {branch} already exists — skipping")
                continue
            except Exception:
                pass

            # Create blob
            blob = gh(f"/repos/{GITHUB_OWNER}/{GITHUB_REPO}/git/blobs", "POST", {
                "content": spec["content"],
                "encoding": "utf-8",
            })

            # Get base tree
            base_commit = gh(f"/repos/{GITHUB_OWNER}/{GITHUB_REPO}/git/commits/{base_sha}")
            base_tree_sha = base_commit["tree"]["sha"]

            # Create tree
            tree = gh(f"/repos/{GITHUB_OWNER}/{GITHUB_REPO}/git/trees", "POST", {
                "base_tree": base_tree_sha,
                "tree": [{"path": spec["file"], "mode": "100644", "type": "blob", "sha": blob["sha"]}],
            })

            # Create commit
            commit = gh(f"/repos/{GITHUB_OWNER}/{GITHUB_REPO}/git/commits", "POST", {
                "message": spec["title"],
                "tree": tree["sha"],
                "parents": [base_sha],
            })

            # Create branch
            gh(f"/repos/{GITHUB_OWNER}/{GITHUB_REPO}/git/refs", "POST", {
                "ref": f"refs/heads/{branch}",
                "sha": commit["sha"],
            })

            # Create PR
            pr = gh(f"/repos/{GITHUB_OWNER}/{GITHUB_REPO}/pulls", "POST", {
                "title": spec["title"],
                "body": spec["body"],
                "head": branch,
                "base": default_branch,
            })
            ok(f"PR #{pr['number']}: {spec['title'][:60]}")
            created.append(pr["number"])
            time.sleep(0.5)  # rate limit buffer

        except Exception as e:
            err(f"{branch}: {e}")

    if created:
        ok(f"Created {len(created)} PRs: {created}")


# ── Slack seeder ──────────────────────────────────────────────────────────────

def seed_slack():
    section("Slack — sending incident messages")
    if not SLACK_TOKEN:
        err("SLACK_TOKEN / SLACK_BOT_TOKEN not set — skipping"); return
    if not SLACK_CHANNEL:
        err("SLACK_INCIDENTS_CHANNEL not set — skipping"); return

    for i, msg in enumerate(SLACK_MESSAGES):
        try:
            result = slack_post(SLACK_CHANNEL, msg["text"])
            if result.get("ok"):
                ok(f"Message {i+1}: {msg['text'][:60]}…")
            else:
                err(f"Message {i+1}: Slack API error — {result.get('error')}")
        except Exception as e:
            err(f"Message {i+1}: {e}")
        time.sleep(0.3)


# ── Linear seeder ─────────────────────────────────────────────────────────────

def _linear_issues():
    """
    Build Linear issue specs with GITHUB_REPO embedded in titles/descriptions.
    Critical: titles must contain the Sentry project name (GITHUB_REPO) so that
    the ILIKE fuzzy join in risk_scorecard and team_health_pulse can match them.
    """
    repo = GITHUB_REPO  # e.g. "nimbus-checkout-api"
    return [
        (
            f"Post-mortem: {repo} null-cart incident (PR #18)",
            f"## Timeline\nPR #18 merged 2026-05-22T21:17 UTC\nSentry `NullReferenceException` first seen 21:40 UTC\nPagerDuty incident opened 21:43 UTC\nFix deployed 22:15 UTC — MTTR 38 min\n\n## Root Cause\nNull cart not guarded before payment processor call in {repo}.\n\n## Action Items\n- [ ] Add null guard to all payment flows in {repo}\n- [ ] Add regression test for null cart\n- [ ] Update runbook: cart validation before payment\n- [ ] Review 4 similar call sites in {repo}"
        ),
        (
            f"Reassign: {repo} inventory race condition errors (PR #20 owner leaving)",
            f"## Context\nPR #20 introduced an inventory race condition in {repo}. Original author offboarding next week.\n\n## What needs handover\n- Understanding of the optimistic locking approach\n- 3 open Sentry error groups: `StockConflictError`, `InventoryVersionMismatch`, `OversellGuardTripped`\n- PagerDuty integration for `{repo}` alert\n\n## Priority\nHigh — P99 latency still elevated post-fix. Follow-up required."
        ),
        (
            f"Review debt: {repo} — 2 PRs merged without review triggered prod errors",
            f"## Issue\nHelm's Review Debt scanner flagged 2 PRs merged without any reviewer in {repo}:\n- PR #18 (self-merge) → 3 Sentry P1 errors\n- PR #21 (0 reviews) → 1 Sentry warning\n\n## Action\n- [ ] Add branch protection rule: require 1 reviewer\n- [ ] Retrospective on self-merge policy\n- [ ] Update CODEOWNERS for {repo} critical paths"
        ),
        (
            f"Add runbook: {repo} P1 incident response",
            f"## Runbook needed for {repo}\n1. Null cart / payment failure\n2. Inventory race condition\n3. Session expiry mid-checkout\n4. JWT validation failure\n\n## Format\n- Detection (which Sentry alert fires)\n- Triage (Coral SQL query to run)\n- Mitigation (rollback candidate, hotfix branch)\n- Comms (Slack message template, PagerDuty escalation)\n\n## Owner\nOn-call rotation lead"
        ),
        (
            f"Sentry error spike: {repo} auth JWT expiry on long checkout sessions",
            f"## Signal\nSentry: `JsonWebTokenError: jwt expired` — 12x/day on `{repo} /checkout/confirm` route.\n\n## Root cause\nJWT only validated at login. Long shopping sessions (>1hr) hit expiry during payment.\n\n## Fix in progress\nPR #25 adds middleware to re-validate JWT on checkout confirm. Pending review.\n\n## Affected users\n~3% of sessions > 60 min duration"
        ),
    ]

def seed_linear():
    section("Linear — creating demo issues")
    if not LINEAR_API_KEY:
        err("LINEAR_API_KEY not set — skipping"); return

    # Get team ID
    try:
        result = linear_gql("{ viewer { teams { nodes { id name } } } }")
        teams = (result.get("data") or {}).get("viewer", {}).get("teams", {}).get("nodes", [])
        if not teams:
            err("No Linear teams found — check API key permissions"); return
        team_id = teams[0]["id"]
        team_name = teams[0]["name"]
        ok(f"Team: {team_name} ({team_id[:8]}…)")
    except Exception as e:
        err(f"Linear auth failed: {e}"); return

    for title, desc in _linear_issues():
        try:
            mutation = """
            mutation CreateIssue($title: String!, $description: String!, $teamId: String!) {
              issueCreate(input: { title: $title, description: $description, teamId: $teamId }) {
                success
                issue { id identifier url }
              }
            }
            """
            res = linear_gql(mutation, {"title": title, "description": desc, "teamId": team_id})
            issue_data = (res.get("data") or {}).get("issueCreate", {})
            if issue_data.get("success"):
                issue = issue_data["issue"]
                ok(f"{issue['identifier']}: {title[:55]}…")
            else:
                errs = (res.get("errors") or [{}])
                err(f"Linear error: {errs[0].get('message', 'unknown')}")
        except Exception as e:
            err(f"{title[:40]}…: {e}")
        time.sleep(0.3)


# ── PagerDuty seeder ──────────────────────────────────────────────────────────

def seed_pagerduty():
    section("PagerDuty — creating demo incidents")
    if not PAGERDUTY_TOKEN:
        err("PAGERDUTY_API_TOKEN not set — skipping"); return

    # Dynamic email detection: Query /users to get a valid user's email
    from_email = "helm-demo@example.com"
    try:
        users_resp = pd("/users?limit=1")
        users = users_resp.get("users", [])
        if users:
            from_email = users[0]["email"]
            ok(f"Using dynamic PagerDuty requester email: {from_email}")
    except Exception as e:
        warn(f"Could not fetch PagerDuty users, using fallback: {e}")

    # Get services
    try:
        resp = pd("/services?limit=5", from_email=from_email)
        services = resp.get("services", [])
        if not services:
            err("No PagerDuty services found — create one in PagerDuty first"); return
        svc_id = services[0]["id"]
        svc_name = services[0]["name"]
        ok(f"Service: {svc_name} ({svc_id})")
    except Exception as e:
        err(f"PagerDuty auth failed (401 = expired token): {e}"); return

    # Get an escalation policy
    try:
        pol = pd("/escalation_policies?limit=1", from_email=from_email)
        policies = pol.get("escalation_policies", [])
        if not policies:
            err("No escalation policies found — skipping"); return
        policy_id = policies[0]["id"]
    except Exception as e:
        err(f"Cannot fetch escalation policy: {e}"); return

    # CRITICAL: incident titles MUST contain the Sentry project name as a substring
    # so the ILIKE join in queries.py (pd.service__summary ILIKE '%' || s.project || '%')
    # can link incidents to Sentry errors during the demo.
    incidents_specs = [
        (
            f"Checkout null-cart payment failure spike in {GITHUB_REPO}",
            f"P1 — 47 NullReferenceException in 30 min. Causal PR: #18. Sentry project: {GITHUB_REPO}. MTTR target: 30 min."
        ),
        (
            f"Inventory service p99 latency degradation in {GITHUB_REPO}",
            f"P2 — p99 4.2s, baseline 400ms. Checkout completion -12%. Sentry project: {GITHUB_REPO}. Causal PR: #20."
        ),
    ]

    # Try to rename the PagerDuty service so service__summary contains the Sentry project name.
    # The SQL join is on service__summary ILIKE '%<sentry_project>%' — name alignment is critical.
    try:
        pd(f"/services/{svc_id}", "PUT", {
            "service": {
                "type": "service",
                "name": GITHUB_REPO,
            }
        }, from_email=from_email)
        ok(f"Renamed PD service to '{GITHUB_REPO}' for ILIKE join alignment")
        svc_name = GITHUB_REPO
    except Exception as e:
        warn(f"Could not rename PD service (may need admin token): {e}")
        warn(f"Manual fix: rename '{svc_name}' to '{GITHUB_REPO}' in PagerDuty UI")

    for title, desc in incidents_specs:
        try:
            result = pd("/incidents", "POST", {
                "incident": {
                    "type": "incident",
                    "title": title,
                    "service": {"id": svc_id, "type": "service_reference"},
                    "escalation_policy": {"id": policy_id, "type": "escalation_policy_reference"},
                    "body": {"type": "incident_body", "details": desc},
                    "urgency": "high",
                }
            }, from_email=from_email)
            inc = result.get("incident", {})
            ok(f"{inc.get('incident_number', '?')}: {title[:55]}")
        except Exception as e:
            err(f"{title[:40]}: {e}")
        time.sleep(0.5)



# ── Sentry event seeder ───────────────────────────────────────────────────────

def seed_sentry_events():
    section("Sentry — checking project access")
    if not SENTRY_TOKEN or not SENTRY_ORG:
        err("SENTRY_TOKEN or SENTRY_ORG not set — skipping"); return

    try:
        projects = sentry(f"/organizations/{SENTRY_ORG}/projects/")
        if not isinstance(projects, list) or not projects:
            err("No Sentry projects found"); return
        for p in projects:
            ok(f"Project: {p['slug']} (DSN available — send real errors via sentry_sdk in your app)")
        warn("Sentry issues cannot be created via REST API — they must come from real SDK events.")
        warn("The existing Sentry errors from the app are already seeded and visible in Helm.")
        warn("To add more: run `python -m pytest tests/ --sentry-dsn=<dsn>` or trigger checkout errors in the app.")
    except Exception as e:
        err(f"Sentry access failed: {e}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Seed Helm demo data")
    parser.add_argument("--github",        action="store_true")
    parser.add_argument("--slack",         action="store_true")
    parser.add_argument("--linear",        action="store_true")
    parser.add_argument("--pagerduty",     action="store_true")
    parser.add_argument("--sentry-events", action="store_true")
    args = parser.parse_args()

    run_all = not any(vars(args).values())

    print("\n=== Helm Demo Seed ===")
    print(f"Repo: {GITHUB_OWNER}/{GITHUB_REPO}")
    print(f"Sentry org: {SENTRY_ORG}")

    if run_all or args.github:        seed_github()
    if run_all or args.slack:         seed_slack()
    if run_all or args.linear:        seed_linear()
    if run_all or args.pagerduty:     seed_pagerduty()
    if run_all or args.sentry_events: seed_sentry_events()

    print("\nDone. Restart the backend (uvicorn main:app --reload) then refresh Helm.\n")


if __name__ == "__main__":
    main()
