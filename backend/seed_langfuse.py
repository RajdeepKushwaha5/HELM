"""
Seed realistic Langfuse traces + generations so Token ROI runs on REAL data.

Ingests against the US region using the project keys in .env. Mirrors the
TokenLens story with genuine traces:
  - customer-rag-pipeline : ORPHAN (no linearId) + LOOP WASTE (16 gens, 1 session, today)
  - billing-agent         : linked to RJD-18, in progress, claude-sonnet-4
  - pr-summary-generator  : MODEL MISMATCH (claude-opus-4 on <3k-token tasks, 8 traces)
  - code-review-assistant : linked to RJD-16, clean, claude-haiku-4

Usage: python seed_langfuse.py
"""

import json
import os
import uuid
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
            k, _, v = _line.partition("=")
            os.environ.setdefault(k.strip(), v.strip().strip('"'))

HOST = "https://us.cloud.langfuse.com"
PUBLIC = os.environ["LANGFUSE_PUBLIC_KEY"]
SECRET = os.environ["LANGFUSE_SECRET_KEY"]

import base64
_AUTH = base64.b64encode(f"{PUBLIC}:{SECRET}".encode()).decode()

NOW = datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


events = []


def add_trace(trace_id, name, ts, team, feature_tag, linear_id=None,
              session_id=None, user_id="svc-agent"):
    metadata = {"featureTag": feature_tag, "team": team}
    if linear_id:
        metadata["linearId"] = linear_id
    body = {
        "id": trace_id,
        "timestamp": iso(ts),
        "name": name,
        "userId": user_id,
        "metadata": metadata,
        "release": "2026.5.0",
        "tags": [team, feature_tag],
    }
    if session_id:
        body["sessionId"] = session_id
    events.append({
        "id": str(uuid.uuid4()),
        "type": "trace-create",
        "timestamp": iso(ts),
        "body": body,
    })


def add_generation(trace_id, name, ts, model, in_tok, out_tok, cost_usd):
    total = in_tok + out_tok
    in_cost = round(cost_usd * in_tok / total, 6) if total else 0.0
    out_cost = round(cost_usd - in_cost, 6)
    events.append({
        "id": str(uuid.uuid4()),
        "type": "generation-create",
        "timestamp": iso(ts),
        "body": {
            "id": str(uuid.uuid4()),
            "traceId": trace_id,
            "type": "GENERATION",
            "name": name,
            "startTime": iso(ts),
            "endTime": iso(ts + timedelta(milliseconds=900 + out_tok)),
            "model": model,
            "modelParameters": {"temperature": 0.2},
            "usage": {
                "input": in_tok,
                "output": out_tok,
                "total": total,
                "unit": "TOKENS",
                "inputCost": in_cost,
                "outputCost": out_cost,
                "totalCost": round(cost_usd, 6),
            },
        },
    })


# ── 1. customer-rag-pipeline — ORPHAN + LOOP WASTE ────────────────────────────
# Loop-waste session: 1 trace TODAY with 16 generations (loop_waste window = 24h).
loop_tid = f"trace-rag-loop-{uuid.uuid4().hex[:8]}"
add_trace(loop_tid, "customer-rag-pipeline", NOW - timedelta(hours=3),
          team="platform", feature_tag="customer-rag",
          session_id="sess-rag-loop-01")  # no linearId -> orphan
for i in range(16):  # 16 > 10 -> loop waste
    add_generation(loop_tid, f"rag-step-{i+1}", NOW - timedelta(hours=3, minutes=30 - i),
                   "claude-opus-4", in_tok=3600, out_tok=1200, cost_usd=1.5)
# More orphan spend over the week (no linearId).
for d in range(1, 7):
    tid = f"trace-rag-{uuid.uuid4().hex[:8]}"
    add_trace(tid, "customer-rag-pipeline", NOW - timedelta(days=d, hours=2),
              team="platform", feature_tag="customer-rag")
    for j in range(3):
        add_generation(tid, f"rag-call-{j+1}", NOW - timedelta(days=d, hours=2),
                       "claude-opus-4", in_tok=3000, out_tok=900, cost_usd=1.4)

# ── 2. billing-agent — LINKED (RJD-18), in progress, sonnet ──────────────────
for d in range(0, 5):
    tid = f"trace-billing-{uuid.uuid4().hex[:8]}"
    add_trace(tid, "billing-agent", NOW - timedelta(days=d, hours=5),
              team="growth", feature_tag="billing", linear_id="RJD-18")
    for j in range(3):
        add_generation(tid, f"billing-step-{j+1}", NOW - timedelta(days=d, hours=5),
                       "claude-sonnet-4", in_tok=5200, out_tok=1500, cost_usd=1.3)

# ── 3. pr-summary-generator — MODEL MISMATCH (opus on small tasks, 8 traces) ──
for d in range(0, 8):
    tid = f"trace-prsum-{uuid.uuid4().hex[:8]}"
    add_trace(tid, "pr-summary-generator", NOW - timedelta(days=d % 6, hours=8),
              team="devex", feature_tag="pr-summary", linear_id="RJD-17")
    # small task (<3000 total tokens) on an expensive model = mismatch
    add_generation(tid, "summarize-pr", NOW - timedelta(days=d % 6, hours=8),
                   "claude-opus-4", in_tok=520, out_tok=240, cost_usd=0.28)

# ── 4. code-review-assistant — LINKED (RJD-16), clean, haiku ─────────────────
for d in range(0, 6):
    tid = f"trace-review-{uuid.uuid4().hex[:8]}"
    add_trace(tid, "code-review-assistant", NOW - timedelta(days=d, hours=11),
              team="devex", feature_tag="code-review", linear_id="RJD-16")
    add_generation(tid, "review-diff", NOW - timedelta(days=d, hours=11),
                   "claude-haiku-4", in_tok=2400, out_tok=600, cost_usd=0.05)


def send(batch):
    payload = json.dumps({"batch": batch}).encode()
    req = urllib.request.Request(
        f"{HOST}/api/public/ingestion",
        data=payload,
        headers={"Authorization": f"Basic {_AUTH}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status, resp.read().decode()


# Send in chunks of 100 events.
total_traces = sum(1 for e in events if e["type"] == "trace-create")
total_gens = sum(1 for e in events if e["type"] == "generation-create")
print(f"Prepared {len(events)} events: {total_traces} traces, {total_gens} generations")

for i in range(0, len(events), 100):
    chunk = events[i:i + 100]
    try:
        status, body = send(chunk)
        print(f"  batch {i // 100 + 1}: HTTP {status} ({len(chunk)} events)")
    except urllib.error.HTTPError as e:
        print(f"  batch {i // 100 + 1}: ERROR {e.code} -> {e.read().decode()[:300]}")

print("Done. Langfuse processes cost aggregation asynchronously (allow ~30-60s).")
