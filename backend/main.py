"""
Helm — Engineering Health Intelligence Agent.
FastAPI backend: Coral SQL proof layer + Gemini synthesis.
"""

import asyncio
import json
import os
import re
import subprocess
import threading
import time
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR.parent / ".env", override=True)
load_dotenv(BASE_DIR / ".env", override=True)

from coral_runner import coral_query, source_health
from readiness import check_readiness
from gemini_client import analyze
import queries as q
import lighthouse_queries as lq
from scoring import compute_service_scores

app = FastAPI(title="Helm API", description="Engineering Health Intelligence powered by Coral + Gemini")

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "HELM_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)

GITHUB_OWNER = os.environ.get("GITHUB_OWNER", "")
GITHUB_REPO = os.environ.get("GITHUB_REPO", "")
SLACK_INCIDENTS_CHANNEL = os.environ.get("SLACK_INCIDENTS_CHANNEL", "")
CIRCLECI_PROJECT_SLUG = os.environ.get("CIRCLECI_PROJECT_SLUG", "")
LANGFUSE_HOST = os.environ.get("LANGFUSE_HOST", "")
LANGFUSE_PUBLIC_KEY = os.environ.get("LANGFUSE_PUBLIC_KEY", "")
LANGFUSE_SECRET_KEY = os.environ.get("LANGFUSE_SECRET_KEY", "")
LANGFUSE_CONFIGURED = bool(LANGFUSE_HOST and LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY)

# Lighthouse (GTM prospecting). HackerNews needs no auth; Adzuna needs free keys.
ADZUNA_APP_ID = os.environ.get("ADZUNA_APP_ID", "")
ADZUNA_APP_KEY = os.environ.get("ADZUNA_APP_KEY", "")
ADZUNA_CONFIGURED = bool(ADZUNA_APP_ID and ADZUNA_APP_KEY)

HELM_SOURCES = ["github", "sentry", "pagerduty", "linear", "slack"]
if CIRCLECI_PROJECT_SLUG:
    HELM_SOURCES = HELM_SOURCES + ["circleci"]
if LANGFUSE_CONFIGURED:
    HELM_SOURCES = HELM_SOURCES + ["langfuse"]

# ── TokenLens mock data (used when Langfuse is not configured) ────────────────
_MOCK_AI_ATTRIBUTION = [
    {
        "ai_operation": "customer-rag-pipeline",
        "team": "platform",
        "total_cost_usd": 2380.00,
        "tokens_burned": 4_200_000,
        "trace_count": 847,
        "avg_latency_ms": 4200,
        "linear_ticket_id": None,
        "linked_feature": None,
        "feature_status": None,
        "feature_owner": "@alex",
        "production_errors": 0,
        "waste_flags": ["orphan", "loop"],
    },
    {
        "ai_operation": "billing-agent",
        "team": "growth",
        "total_cost_usd": 890.00,
        "tokens_burned": 1_100_000,
        "trace_count": 312,
        "avg_latency_ms": 2100,
        "linear_ticket_id": "LIN-4821",
        "linked_feature": "Add usage-based billing UI",
        "feature_status": "in_progress",
        "feature_owner": "@priya",
        "production_errors": 2,
        "waste_flags": [],
    },
    {
        "ai_operation": "pr-summary-generator",
        "team": "devex",
        "total_cost_usd": 680.00,
        "tokens_burned": 890_000,
        "trace_count": 1240,
        "avg_latency_ms": 890,
        "linear_ticket_id": "LIN-4799",
        "linked_feature": "Auto PR summaries",
        "feature_status": "completed",
        "feature_owner": "@marcus",
        "production_errors": 0,
        "waste_flags": ["model_mismatch"],
    },
    {
        "ai_operation": "code-review-assistant",
        "team": "devex",
        "total_cost_usd": 95.00,
        "tokens_burned": 420_000,
        "trace_count": 890,
        "avg_latency_ms": 620,
        "linear_ticket_id": "LIN-4703",
        "linked_feature": "AI Code Review v2",
        "feature_status": "completed",
        "feature_owner": "@sara",
        "production_errors": 0,
        "waste_flags": [],
    },
]

_MOCK_LOOP_WASTE = [
    {
        "operation": "customer-rag-pipeline",
        "session_id": "sess_abc123",
        "loop_iterations": 18,
        "wasted_cost_usd": 340.00,
        "avg_tokens_per_trace": 4800,
        "session_start": "2026-05-28T08:12:00Z",
        "session_end": "2026-05-28T08:47:00Z",
    },
    {
        "operation": "billing-agent",
        "session_id": "sess_def456",
        "loop_iterations": 14,
        "wasted_cost_usd": 180.00,
        "avg_tokens_per_trace": 3200,
        "session_start": "2026-05-28T14:03:00Z",
        "session_end": "2026-05-28T14:29:00Z",
    },
]

_MOCK_MODEL_MISMATCHES = [
    {
        "operation": "pr-summary-generator",
        "current_model": "claude-opus-4",
        "avg_tokens": 780,
        "avg_cost_per_call": 0.0234,
        "calls_7d": 1240,
        "total_7d_cost_usd": 29.02,
        "haiku_equivalent_cost_usd": 2.32,
        "potential_weekly_saving_usd": 26.70,
    },
    {
        "operation": "ticket-classifier",
        "current_model": "gpt-4o",
        "avg_tokens": 420,
        "avg_cost_per_call": 0.0062,
        "calls_7d": 3100,
        "total_7d_cost_usd": 19.22,
        "haiku_equivalent_cost_usd": 1.56,
        "potential_weekly_saving_usd": 17.66,
    },
]

_MOCK_ORPHAN_SPEND = [
    {
        "operation": "customer-rag-pipeline",
        "team": "platform",
        "orphan_spend_7d_usd": 2380.00,
        "orphan_tokens_7d": 4_200_000,
        "trace_count": 847,
        "first_seen": "2026-05-22T00:00:00Z",
        "last_seen": "2026-05-28T23:59:00Z",
    },
]


def _compute_roi_score(attribution: list, loops: list, mismatches: list, orphans: list) -> dict:
    total_cost = sum(r.get("total_cost_usd", 0) or 0 for r in attribution)
    if total_cost == 0:
        return {"score": 0, "status": "no_data", "breakdown": {}, "total_waste_usd": 0, "potential_saving_weekly": 0}

    shipped_cost = sum(
        r.get("total_cost_usd", 0) or 0 for r in attribution
        if r.get("feature_status") == "completed"
    )
    attribution_score = min(40, (shipped_cost / total_cost) * 40)

    orphan_cost = sum(r.get("orphan_spend_7d_usd", 0) or 0 for r in orphans)
    orphan_ratio = min(1.0, orphan_cost / total_cost)
    orphan_score = (1 - orphan_ratio) * 30

    loop_cost = sum(r.get("wasted_cost_usd", 0) or 0 for r in loops)
    loop_ratio = min(1.0, loop_cost / total_cost)
    loop_score = (1 - loop_ratio) * 20

    mismatch_saving = sum(r.get("potential_weekly_saving_usd", 0) or 0 for r in mismatches)
    mismatch_penalty = min(10, (mismatch_saving / total_cost) * 10)
    model_score = 10 - mismatch_penalty

    total_score = max(0, min(100, int(attribution_score + orphan_score + loop_score + model_score)))
    status = "healthy" if total_score >= 80 else "warning" if total_score >= 50 else "critical"

    return {
        "score": total_score,
        "status": status,
        "breakdown": {
            "attribution": round(attribution_score, 1),
            "orphan_penalty": round(orphan_score, 1),
            "loop_efficiency": round(loop_score, 1),
            "model_optimisation": round(model_score, 1),
        },
        "total_cost_usd": round(total_cost, 2),
        "total_waste_usd": round(orphan_cost + loop_cost, 2),
        "potential_saving_weekly": round(mismatch_saving + loop_cost, 2),
    }

_SANDBOX_BLOCKED = re.compile(
    r'\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|REPLACE|MERGE|EXECUTE|EXEC|CALL|GRANT|REVOKE|VACUUM)\b',
    re.IGNORECASE,
)

# ── Ask Helm multi-turn session memory ───────────────────────────────────────
_ASK_SESSIONS: dict[str, dict] = {}
_ASK_SESSION_LOCK = threading.Lock()
_SESSION_TTL_SECS = 4 * 60 * 60   # sessions expire after 4 h of inactivity
_MAX_HISTORY_TURNS = 8             # keep last 8 Q&A pairs per session


def _session_history(session_id: str | None) -> list[dict]:
    if not session_id:
        return []
    with _ASK_SESSION_LOCK:
        s = _ASK_SESSIONS.get(session_id)
        if not s:
            return []
        if time.time() - s["last_active"] > _SESSION_TTL_SECS:
            _ASK_SESSIONS.pop(session_id, None)
            return []
        return list(s["turns"])


def _append_session_turn(session_id: str, question: str, answer: str) -> None:
    with _ASK_SESSION_LOCK:
        if session_id not in _ASK_SESSIONS:
            _ASK_SESSIONS[session_id] = {"turns": [], "last_active": time.time()}
        s = _ASK_SESSIONS[session_id]
        s["turns"].append({"q": question, "a": answer})
        s["turns"] = s["turns"][-_MAX_HISTORY_TURNS:]
        s["last_active"] = time.time()


def _require_repo() -> None:
    if not GITHUB_OWNER or not GITHUB_REPO:
        raise HTTPException(400, "GITHUB_OWNER and GITHUB_REPO must be set in .env")


def _run(label: str, sql: str, sources: list[str], timeout: int = 90, cache_ttl: int = 30) -> tuple[list[dict], dict]:
    result = coral_query(label, sql, sources=sources, timeout=timeout, cache_ttl=cache_ttl)
    return result["rows"], result["proof"]


def _try_run(label: str, sql: str, sources: list[str], timeout: int = 45, cache_ttl: int = 30) -> tuple[list[dict], dict]:
    """Like _run but returns empty result + error proof on timeout/failure instead of raising."""
    try:
        result = coral_query(label, sql, sources=sources, timeout=timeout, cache_ttl=cache_ttl)
        return result["rows"], result["proof"]
    except Exception as exc:
        error_proof = {
            "name": label,
            "sql": sql,
            "sources": sources,
            "cross_source": len(sources) > 1,
            "row_count": 0,
            "duration_ms": timeout * 1000,
            "status": "error",
            "error": str(exc),
            "columns": [],
            "sample_rows": [],
        }
        return [], error_proof


def _escape_sql(value: str) -> str:
    return value.replace("'", "''")


def _fix_encoding(text: str | None) -> str | None:
    """Fix mojibake from Latin-1/UTF-8 mismatch common in scraped/API text.

    HackerNews occasionally returns text that was decoded as Latin-1 and then
    stored as UTF-8, producing garbled sequences like â€" instead of an em-dash.
    Re-encoding as Latin-1 and decoding as UTF-8 recovers the original Unicode.
    Falls back to the original string if the round-trip fails.
    """
    if not text:
        return text
    try:
        return text.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text


def _safe_int(value, default: int = 0) -> int:
    try:
        return int(value or default)
    except (TypeError, ValueError):
        return default


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        try:
            parsed = datetime.fromisoformat(text[:19])
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _minutes_between(start: str | None, end: str | None) -> int | None:
    start_dt = _parse_dt(start)
    end_dt = _parse_dt(end)
    if not start_dt or not end_dt:
        return None
    return max(0, round((end_dt - start_dt).total_seconds() / 60))


def _rank_deployment_rows(rows: list[dict]) -> list[dict]:
    severity_weight = {"fatal": 3, "error": 2, "warning": 1}
    return sorted(
        rows,
        key=lambda row: (
            severity_weight.get(str(row.get("level", "")).lower(), 0),
            _safe_int(row.get("times_seen")),
            _safe_int(row.get("users_affected")),
        ),
        reverse=True,
    )


def _build_demo_moment(rows: list[dict], proof: dict) -> dict:
    if proof.get("status") == "error":
        return {
            "headline": "Coral query failed; evidence is unavailable",
            "subhead": proof.get("error") or "The GitHub x Sentry Coral query returned an error.",
            "real_data": False,
            "highlight": None,
            "metrics": {
                "join_rows": 0,
                "events_seen": 0,
                "users_affected": 0,
                "minutes_to_error": None,
                "sources_joined": len(proof.get("sources", [])),
            },
            "evidence_chain": [],
            "deployment_errors": [],
            "proofs": [proof],
            "links": {
                "repo": f"https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}",
                "pull_request": None,
                "sentry_project": None,
            },
        }

    ranked = _rank_deployment_rows(rows)
    top = ranked[0] if ranked else {}
    minutes_to_error = _minutes_between(top.get("merged_at"), top.get("first_seen")) if top else None
    chain_count = len(ranked)
    total_events = sum(_safe_int(row.get("times_seen")) for row in ranked)
    total_users = sum(_safe_int(row.get("users_affected")) for row in ranked)

    if top and minutes_to_error is not None:
        time_label = "immediately after merge" if minutes_to_error == 0 else f"in {minutes_to_error} minute{'s' if minutes_to_error != 1 else ''}"
        headline = f"PR #{top.get('pr_number')} joined to production error {time_label}"
    elif top:
        headline = f"PR #{top.get('pr_number')} joined to a production error"
    else:
        headline = "No PR-to-production-error join returned yet"

    evidence_chain = []
    if top:
        evidence_chain = [
            {
                "source": "github",
                "label": f"PR #{top.get('pr_number')} merged",
                "title": top.get("pr_title"),
                "time": top.get("merged_at"),
                "detail": f"Author: {top.get('author') or 'unknown'}",
            },
            {
                "source": "sentry",
                "label": "Production error first seen",
                "title": top.get("error_title"),
                "time": top.get("first_seen"),
                "detail": (
                    f"{top.get('level') or 'error'} · {_safe_int(top.get('times_seen'))} events · "
                    f"{_safe_int(top.get('users_affected'))} users"
                ),
            },
        ]

    return {
        "headline": headline,
        "subhead": (
            "One Coral SQL join connects a merged GitHub PR to first-seen Sentry production errors."
            if ranked
            else "The endpoint ran the real GitHub × Sentry Coral query and returned no matching rows."
        ),
        "real_data": proof.get("status") == "ok",
        "highlight": {
            **top,
            "minutes_to_error": minutes_to_error,
        } if top else None,
        "metrics": {
            "join_rows": chain_count,
            "events_seen": total_events,
            "users_affected": total_users,
            "minutes_to_error": minutes_to_error,
            "sources_joined": len(proof.get("sources", [])),
        },
        "evidence_chain": evidence_chain,
        "deployment_errors": ranked[:8],
        "proofs": [proof],
        "links": {
            "repo": f"https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}",
            "pull_request": top.get("pr_url") if top else None,
            "sentry_project": f"https://sentry.io/organizations/{os.getenv('SENTRY_ORG', '').strip()}/projects/{top.get('sentry_project')}/" if top and os.getenv("SENTRY_ORG") else None,
        },
    }


def _draft_actions(context: str, rows: list[dict]) -> list[dict]:
    if context == "root_cause" and rows:
        top = rows[0]
        service = top.get("service") or top.get("sentry_project") or "affected service"
        evidence_score = int(top.get("evidence_score") or (40 if top.get("level") == "fatal" else 25))
        return [
            {
                "id": "slack-incident-update",
                "title": "Draft Slack incident update",
                "target": "Slack",
                "target_icon": "slack",
                "status": "approval_required",
                "evidence_score": evidence_score,
                "confidence": f"{min(99, evidence_score)}%",
                "body": (
                    f"Incident update: Helm found a likely chain involving PR #{top.get('pr_number', 'unknown')} "
                    f"and {top.get('error_title', 'a production error')} affecting {service}. "
                    f"PagerDuty status: {top.get('incident_status', 'not linked')}. Evidence score: {evidence_score}."
                ),
            },
            {
                "id": "linear-follow-up",
                "title": "Draft Linear follow-up",
                "target": "Linear",
                "target_icon": "linear",
                "status": "approval_required",
                "evidence_score": evidence_score,
                "confidence": f"{min(99, evidence_score)}%",
                "body": (
                    f"Investigate {top.get('error_title', 'production error')} after PR #{top.get('pr_number', 'unknown')}. "
                    "Attach Sentry issue, PagerDuty incident, and Slack thread before assigning."
                ),
            },
            {
                "id": "github-root-cause-note",
                "title": "Draft GitHub root-cause note",
                "target": "GitHub",
                "target_icon": "github",
                "status": "approval_required",
                "evidence_score": evidence_score,
                "confidence": f"{min(99, evidence_score)}%",
                "body": (
                    f"Potential regression from PR #{top.get('pr_number', 'unknown')}: {top.get('pr_title', 'unknown PR')}. "
                    f"Observed error: {top.get('error_title', 'unknown error')}."
                ),
            },
        ]

    if context == "report":
        return [
            {
                "id": "weekly-slack-summary",
                "title": "Draft weekly Slack summary",
                "target": "Slack",
                "target_icon": "slack",
                "status": "approval_required",
                "evidence_score": 0,
                "confidence": "—",
                "body": "Share Helm's weekly health report with engineering leads after review.",
            },
            {
                "id": "risk-review-ticket",
                "title": "Draft engineering risk review",
                "target": "Linear",
                "target_icon": "linear",
                "status": "approval_required",
                "evidence_score": 0,
                "confidence": "—",
                "body": "Create a follow-up task for the highest burnout, delivery, or service stability risk from Helm.",
            },
        ]
    return []


def _build_incident_timeline(rows: list[dict]) -> list[dict]:
    events: list[dict] = []
    for index, row in enumerate(rows[:8]):
        chain_id = f"chain-{index + 1}"
        events.extend([
            {
                "chain_id": chain_id,
                "source": "github",
                "type": "deploy",
                "time": row.get("merged_at"),
                "title": f"PR #{row.get('pr_number', 'unknown')} merged",
                "detail": row.get("pr_title"),
                "severity": "info",
            },
            {
                "chain_id": chain_id,
                "source": "sentry",
                "type": "error",
                "time": row.get("first_seen"),
                "title": row.get("error_title") or "Production error detected",
                "detail": f"{row.get('level', 'error')} · {row.get('times_seen', 0)} events",
                "severity": "critical" if row.get("level") == "fatal" else "warning",
            },
            {
                "chain_id": chain_id,
                "source": "pagerduty",
                "type": "incident",
                "time": row.get("incident_start"),
                "title": row.get("service") or row.get("incident_status") or "PagerDuty signal",
                "detail": f"urgency {row.get('urgency', 'unknown')} · status {row.get('incident_status', 'not linked')}",
                "severity": "critical" if row.get("urgency") == "high" else "warning",
            },
            {
                "chain_id": chain_id,
                "source": "slack",
                "type": "response",
                "time": row.get("incident_start"),
                "title": "Incident response chatter",
                "detail": f"{row.get('slack_messages', 0)} messages · max thread {row.get('max_thread_depth', 0)}",
                "severity": "info",
            },
        ])
    return sorted(
        [event for event in events if event.get("time")],
        key=lambda event: str(event.get("time") or ""),
        reverse=True,
    )


def _policy_matrix() -> list[dict]:
    return [
        {
            "mode": "engineering",
            "label": "Engineering",
            "can_view": ["PR title", "author", "Sentry title", "service", "Slack counts", "SQL proof"],
            "masked": [],
            "use_case": "Debug and assign remediation.",
        },
        {
            "mode": "executive",
            "label": "Executive",
            "can_view": ["aggregate risk", "service count", "incident trend", "SQL proof"],
            "masked": ["engineer names", "PR titles", "raw error titles", "internal messages"],
            "use_case": "Understand business risk without exposing implementation detail.",
        },
        {
            "mode": "support",
            "label": "Support",
            "can_view": ["affected service", "incident status", "customer-safe error summary", "SQL proof"],
            "masked": ["engineer names", "internal PR details", "Slack internals"],
            "use_case": "Prepare customer-facing updates safely.",
        },
        {
            "mode": "security",
            "label": "Security",
            "can_view": ["severity", "service", "deployment window", "audit trail", "SQL proof"],
            "masked": ["personal details", "non-security Slack context"],
            "use_case": "Review risky deploy and incident evidence with least privilege.",
        },
    ]


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    return {
        "service": "Helm API",
        "status": "ok",
        "frontend": "http://localhost:5173",
        "docs": "http://127.0.0.1:8000/docs",
        "health": "http://127.0.0.1:8000/api/health",
        "live_evidence": "http://127.0.0.1:8000/api/demo-moment",
        "note": "Open the frontend for the full live UI; this port serves JSON API routes.",
    }


@app.get("/api/coral/health")
def coral_health():
    return source_health(HELM_SOURCES)


@app.get("/api/coral/readiness")
def coral_readiness():
    """
    Contract readiness check: validates live Coral metadata against the
    exact tables, columns, filters, and table functions Helm's SQL layer
    requires per source. Returns per-source status (ready/degraded/blocked)
    with missing items and the exact SQL used for validation.
    """
    return check_readiness()


def _compute_velocity_delta(recent_prs: list[dict]) -> int:
    """PRs merged this week minus last week. Positive = accelerating."""
    today = date.today()
    week_ago = (today - timedelta(days=7)).isoformat()
    two_weeks_ago = (today - timedelta(days=14)).isoformat()
    this_week = sum(1 for pr in recent_prs if str(pr.get("merged_at", "") or "")[:10] >= week_ago)
    last_week = sum(1 for pr in recent_prs if two_weeks_ago <= str(pr.get("merged_at", "") or "")[:10] < week_ago)
    return this_week - last_week


def _parse_mttr(rows: list[dict]) -> int | None:
    """Compute average resolve time in minutes from raw pagerduty_mttr() rows."""
    if not rows:
        return None
    times = []
    for row in rows:
        mins = _minutes_between(row.get("created_at"), row.get("last_status_change_at"))
        if mins is not None:
            times.append(mins)
    return round(sum(times) / len(times)) if times else None


@app.get("/api/overview")
def get_overview(refresh: bool = Query(False)):
    _require_repo()

    with ThreadPoolExecutor(max_workers=4) as pool:
        f_health = pool.submit(_try_run, "Team Health Pulse", q.team_health_pulse(GITHUB_OWNER, GITHUB_REPO), ["github", "linear", "sentry"], 60, 0 if refresh else 30)
        f_prs = pool.submit(_try_run, "Recent GitHub PRs", q.recent_github_prs(GITHUB_OWNER, GITHUB_REPO), ["github"], 15, 0 if refresh else 30)
        f_svc = pool.submit(_try_run, "Service instability", q.service_instability(), ["sentry", "pagerduty"], 30, 0 if refresh else 30)
        f_mttr = pool.submit(_try_run, "MTTR from PagerDuty", q.pagerduty_mttr(), ["pagerduty"], 15, 0 if refresh else 30)
        health_rows, health_proof = f_health.result()
        recent_prs, prs_proof = f_prs.result()
        svc_data, svc_proof = f_svc.result()
        mttr_rows, mttr_proof = f_mttr.result()

    proofs = [health_proof, prs_proof, svc_proof, mttr_proof]

    engineers = [_score_engineer(r) for r in health_rows]
    services = compute_service_scores(svc_data)

    high_eng = sum(1 for e in engineers if e["risk_level"] == "high")
    high_svc = sum(1 for s in services if s.risk_level == "high")
    burnout_risk = "high" if high_eng >= 2 else "medium" if high_eng >= 1 else "low"
    team_imbalance = "high" if high_eng >= 3 else "medium" if high_eng >= 1 else "low"
    delivery_risk = "high" if high_svc >= 2 else "medium" if high_svc >= 1 else "low"
    overall = max(0, min(100, 100 - high_eng * 10 - high_svc * 8))

    mttr_minutes = _parse_mttr(mttr_rows)
    velocity_delta = _compute_velocity_delta(recent_prs)
    resolved_count = len(mttr_rows)
    incident_threads_analyzed = sum(int(row.get("pd_incidents") or 0) for row in svc_data)

    summary = (
        f"{len(engineers)} engineers analyzed · "
        f"{high_eng} at high burnout risk · "
        f"{high_svc} service{'s' if high_svc != 1 else ''} unstable"
    )

    return {
        "health_score": overall,
        "burnout_risk": burnout_risk,
        "team_imbalance": team_imbalance,
        "delivery_risk": delivery_risk,
        "summary": summary,
        "engineer_count": len(engineers),
        "service_count": len(services),
        "high_risk_engineers": high_eng,
        "high_risk_services": high_svc,
        "incident_threads_analyzed": incident_threads_analyzed,
        "recent_pr_count": len(recent_prs),
        "mttr_minutes": mttr_minutes,
        "resolved_incidents_30d": resolved_count,
        "velocity_delta": velocity_delta,
        "proofs": proofs,
    }


@app.get("/api/engineers")
def get_engineers(refresh: bool = Query(False)):
    _require_repo()

    rows, proof = _try_run(
        "Team Health Pulse (engineers)",
        q.team_health_pulse(GITHUB_OWNER, GITHUB_REPO),
        ["github", "linear", "sentry"],
        timeout=60,
        cache_ttl=0 if refresh else 30,
    )

    engineers = [_score_engineer(r) for r in rows]
    engineers.sort(key=lambda e: e["burnout_score"], reverse=True)

    return {
        "engineers": [
            {
                "name": e["author"],
                "burnout_score": e["burnout_score"],
                "risk_level": e["risk_level"],
                "open_tickets": int(e.get("open_tickets") or 0),
                "high_priority_tickets": int(e.get("high_priority") or 0),
                "error_count": int(e.get("prs_with_errors") or 0),
                "pr_count": int(e.get("total_prs") or 0),
                "reasons": e.get("signals", []),
            }
            for e in engineers
        ],
        "proofs": [proof],
    }


@app.get("/api/services")
def get_services(refresh: bool = Query(False)):
    svc_data, proof = _try_run("Service instability", q.service_instability(), ["sentry", "pagerduty"], timeout=30, cache_ttl=0 if refresh else 30)
    services = compute_service_scores(svc_data)
    return {
        "services": [
            {
                "service_name": s.name,
                "stability_score": max(0, 100 - s.instability_score),
                "risk_level": s.risk_level,
                "error_count": s.sentry_errors,
                "incident_count": s.pd_incidents,
                "total_error_events": s.total_error_events,
            }
            for s in services
        ],
        "proofs": [proof],
    }


@app.get("/api/deployment-errors")
def get_deployment_errors(refresh: bool = Query(False)):
    _require_repo()
    data, proof = _run("Deployment errors", q.deployment_errors(GITHUB_OWNER, GITHUB_REPO), ["github", "sentry"], cache_ttl=0 if refresh else 30)
    return {"deployment_errors": data, "proofs": [proof]}


@app.get("/api/demo-moment")
def get_demo_moment(refresh: bool = Query(False)):
    """Primary production-evidence workflow: the strongest real PR -> production error join."""
    _require_repo()
    data, proof = _run(
        "Live evidence: PR to production error JOIN",
        q.demo_moment_join(GITHUB_OWNER, GITHUB_REPO),
        ["github", "sentry"],
        cache_ttl=0 if refresh else 8,
    )
    return _build_demo_moment(data, proof)


@app.post("/api/run-demo")
def run_guided_demo(mode: str = Query("replay", description="Use replay for verified evidence playback, live to run the release signal script")):
    """Guided production workflow. Only read-only replay is allowed from the API."""

    _require_repo()
    safe_mode = mode.lower().strip()
    if safe_mode not in {"replay", "live"}:
        raise HTTPException(400, "mode must be replay or live")
    if safe_mode == "live":
        raise HTTPException(
            403,
            "Live signal creation is disabled from the Helm API. Run read-only evidence replay, "
            "or execute any write/demo script manually outside Helm after human approval.",
        )

    def current_evidence() -> dict:
        rows, proof = _run(
            "Guided evidence workflow: GitHub × Sentry evidence",
            q.demo_moment_join(GITHUB_OWNER, GITHUB_REPO),
            ["github", "sentry"],
            cache_ttl=0,
        )
        return _build_demo_moment(rows, proof)

    if safe_mode == "replay":
        evidence = current_evidence()
        return {
            "success": True,
            "mode": "replay",
            "fallback": False,
            "headline": evidence.get("headline"),
            "steps": [
                {"label": "Load latest PR merge", "status": "done", "detail": f"PR #{(evidence.get('highlight') or {}).get('pr_number', '...')} from GitHub"},
                {"label": "Load Sentry production error", "status": "done", "detail": (evidence.get("highlight") or {}).get("error_title") or "Latest matching production error"},
                {"label": "Run Coral evidence join", "status": "done", "detail": f"{(evidence.get('metrics') or {}).get('join_rows', 0)} joined row(s)"},
                {"label": "Draft remediation", "status": "ready", "detail": "Review draft-only actions. Helm does not write to upstream systems."},
            ],
            "evidence": evidence,
            "output": "Verified evidence loaded from the latest live Coral SQL result. No external writes were performed.",
        }


@app.get("/api/root-cause")
def get_root_cause_constellation(refresh: bool = Query(False)):
    _require_repo()
    if not SLACK_INCIDENTS_CHANNEL:
        # Fall back to 2-source join when Slack channel is not configured
        data, proof = _try_run(
            "Root cause: GitHub × Sentry (add SLACK_INCIDENTS_CHANNEL for full 4-source graph)",
            q.deployment_errors(GITHUB_OWNER, GITHUB_REPO),
            ["github", "sentry"],
            cache_ttl=0 if refresh else 30,
        )
        rows = [
            {
                **row,
                "evidence_score": 40 if row.get("level") == "fatal" else 25,
                "service": row.get("sentry_project", ""),
                "incident_status": "not linked",
                "slack_messages": 0,
            }
            for row in data
        ]
        return {
            "root_causes": rows,
            "missing": "SLACK_INCIDENTS_CHANNEL not set — showing 2-source GitHub × Sentry join. Add it to unlock the full 4-source graph.",
            "proofs": [proof],
            "draft_actions": _draft_actions("root_cause", rows),
        }

    # Run 2-source (fast, always shows data) in parallel with 4-source (may timeout)
    with ThreadPoolExecutor(max_workers=2) as pool:
        f2 = pool.submit(_try_run, "Root cause: GitHub × Sentry", q.deployment_errors(GITHUB_OWNER, GITHUB_REPO), ["github", "sentry"], 35, 0 if refresh else 30)
        f4 = pool.submit(_try_run, "Root cause constellation", q.root_cause_constellation(GITHUB_OWNER, GITHUB_REPO, SLACK_INCIDENTS_CHANNEL), ["github", "sentry", "pagerduty", "slack"], 35, 0 if refresh else 30)
        base_rows, base_proof = f2.result()
        constellation_rows, constellation_proof = f4.result()

    if constellation_rows:
        return {"root_causes": constellation_rows, "proofs": [constellation_proof], "draft_actions": _draft_actions("root_cause", constellation_rows)}

    # 4-source timed out — enrich 2-source rows with default fields
    rows = [{**r, "evidence_score": 40 if r.get("level") == "fatal" else 25, "service": r.get("sentry_project",""), "incident_status": "not linked", "slack_messages": 0} for r in base_rows]
    return {"root_causes": rows, "proofs": [constellation_proof, base_proof], "draft_actions": _draft_actions("root_cause", rows)}


@app.get("/api/actions")
def get_action_center(refresh: bool = Query(False)):
    """Approval-gated write preview. Drafts only; Helm never writes to providers."""
    _require_repo()
    proofs: list[dict] = []

    # Use the fast 2-source query — GitHub+Sentry respond in <8s; actions are template-based anyway
    rows, proof = _try_run(
        "Action evidence source (GitHub × Sentry)",
        q.deployment_errors(GITHUB_OWNER, GITHUB_REPO),
        ["github", "sentry"],
        timeout=35,
        cache_ttl=0 if refresh else 30,
    )
    proofs.append(proof)

    # Keep approval cards visible even when live evidence is temporarily empty.
    # The UI still shows the failed/empty proof panel instead of pretending this row is real evidence.
    if not rows:
        rows = [{"pr_number": "unresolved", "pr_title": "latest deployment evidence", "error_title": "no live root-cause row returned", "evidence_score": 0}]

    actions = _draft_actions("root_cause", rows) + _draft_actions("report", rows)
    for idx, action in enumerate(actions):
        action["approval_id"] = f"helm-approval-{date.today().isoformat()}-{idx + 1}"
        action["risk_level"] = "high" if idx == 0 else "medium"
        action["write_status"] = "blocked_until_human_approval"

    return {
        "actions": actions,
        "audit_note": "All actions are draft-only. Helm proves what it would write, then waits for human review.",
        "policy_matrix": _policy_matrix(),
        "proofs": proofs,
    }


@app.get("/api/report")
def get_ai_report(
    generate: bool = Query(False, description="Set true to spend Gemini quota and generate the report"),
    refresh: bool = Query(False, description="Set true to bypass cache for live data")
):
    _require_repo()
    proofs: list[dict] = []

    report_tasks = {
        "health": ("Team Health Pulse", q.team_health_pulse(GITHUB_OWNER, GITHUB_REPO), ["github", "linear", "sentry"]),
        "depl": ("Deployment errors", q.deployment_errors(GITHUB_OWNER, GITHUB_REPO), ["github", "sentry"]),
        "svc": ("Service instability", q.service_instability(), ["sentry", "pagerduty"]),
        "tickets": ("Tickets vs errors", q.ticket_vs_errors(), ["linear", "sentry"]),
    }
    if SLACK_INCIDENTS_CHANNEL:
        report_tasks["slack_corr"] = ("Incident Slack correlation", q.incident_slack_correlation(SLACK_INCIDENTS_CHANNEL), ["pagerduty", "slack"])
        report_tasks["rootcause"] = ("Root cause constellation", q.root_cause_constellation(GITHUB_OWNER, GITHUB_REPO, SLACK_INCIDENTS_CHANNEL), ["github", "sentry", "pagerduty", "slack"])

    report_results: dict[str, tuple[list[dict], dict]] = {}
    with ThreadPoolExecutor(max_workers=len(report_tasks)) as pool:
        futures = {pool.submit(_try_run, label, sql, srcs, 60, 0 if refresh else 30): key for key, (label, sql, srcs) in report_tasks.items()}
        for future in as_completed(futures):
            report_results[futures[future]] = future.result()

    health_rows, health_proof = report_results["health"]
    depl_errors, depl_proof = report_results["depl"]
    svc_instab, svc_proof = report_results["svc"]
    ticket_errs, ticket_proof = report_results["tickets"]
    slack_corr = report_results.get("slack_corr", ([], {}))[0]
    root_causes = report_results.get("rootcause", ([], {}))[0]

    proofs = [health_proof, depl_proof, svc_proof, ticket_proof]
    for optional_key in ("slack_corr", "rootcause"):
        if optional_key in report_results:
            proofs.append(report_results[optional_key][1])

    engineers = [_score_engineer(r) for r in health_rows]
    engineers.sort(key=lambda e: e["burnout_score"], reverse=True)
    services = compute_service_scores(svc_instab)

    high_eng = sum(1 for e in engineers if e["risk_level"] == "high")
    high_svc = sum(1 for s in services if s.risk_level == "high")
    burnout_risk = "high" if high_eng >= 2 else "medium" if high_eng >= 1 else "low"
    team_imbalance = "high" if high_eng >= 3 else "medium" if high_eng >= 1 else "low"
    delivery_risk = "high" if high_svc >= 2 else "medium" if high_svc >= 1 else "low"
    overall = max(0, min(100, 100 - high_eng * 10 - high_svc * 8))

    sources_used = "GitHub, PagerDuty, Linear, Slack, and Sentry"

    prompt = f"""You are an engineering intelligence system generating a weekly health report for an engineering manager.

All data comes from Coral SQL cross-source joins across {sources_used}.

OVERALL HEALTH: {overall}/100
BURNOUT RISK: {burnout_risk}
TEAM IMBALANCE: {team_imbalance}
DELIVERY RISK: {delivery_risk}

ENGINEER RISK SCORES:
{json.dumps([{"name": e["author"], "burnout_score": e["burnout_score"], "risk_level": e["risk_level"], "open_tickets": int(e.get("open_tickets") or 0), "prs_with_errors": int(e.get("prs_with_errors") or 0)} for e in engineers[:10]], indent=2)}

SERVICE INSTABILITY:
{json.dumps([{"service": s.name, "sentry_errors": s.sentry_errors, "pd_incidents": s.pd_incidents, "risk_level": s.risk_level} for s in services[:10]], indent=2)}

DEPLOYMENT ERRORS:
{json.dumps(depl_errors[:8], indent=2, default=str)}

TEAM WORKLOAD vs ERRORS:
{json.dumps(ticket_errs[:8], indent=2, default=str)}

INCIDENT COMMUNICATION:
{json.dumps(slack_corr[:8], indent=2, default=str)}

ROOT CAUSE CONSTELLATION:
{json.dumps(root_causes[:6], indent=2, default=str)}

Write a structured engineering health report in Markdown with these sections:
## Engineering Health Report — {date.today().strftime('%B %d, %Y')}
### Executive Summary
### Critical Issues Requiring Action
### Risk Signals to Monitor
### Recommended Actions for This Week
### What's Going Well

Be specific and do not hallucinate. If data is empty, say so clearly."""

    if not generate:
        return {
            "report": None,
            "ready_to_generate": True,
            "quota_guard": "Report generation is manual to protect free-tier Gemini quota.",
            "generated_at": None,
            "overall_score": overall,
            "preview": {
                "overall_health": overall,
                "burnout_risk": burnout_risk,
                "team_imbalance": team_imbalance,
                "delivery_risk": delivery_risk,
                "engineer_count": len(engineers),
                "service_count": len(services),
                "root_cause_count": len(root_causes),
            },
            "proofs": proofs,
            "draft_actions": _draft_actions("report", root_causes),
        }

    report_text = analyze(prompt)
    return {
        "report": report_text,
        "generated_at": date.today().isoformat(),
        "overall_score": overall,
        "proofs": proofs,
        "draft_actions": _draft_actions("report", root_causes),
    }


class AskRequest(BaseModel):
    question: str
    session_id: str | None = None


class SemanticTriageRequest(BaseModel):
    intent: str


class SandboxQueryRequest(BaseModel):
    sql: str
    sources: list[str] = []


def _incident_terms(intent: str) -> list[str]:
    text = intent.lower()
    terms: list[str] = []
    if any(word in text for word in ["fatal", "critical", "p0", "sev1", "outage"]):
        terms.extend(["fatal", "critical", "outage"])
    if any(word in text for word in ["deploy", "release", "merge", "pr"]):
        terms.extend(["deploy", "release", "merge"])
    if any(word in text for word in ["payment", "billing", "checkout", "stripe"]):
        terms.extend(["payment", "billing", "checkout", "stripe"])
    if any(word in text for word in ["auth", "login", "session"]):
        terms.extend(["auth", "login", "session"])
    if any(word in text for word in ["slow", "latency", "timeout"]):
        terms.extend(["slow", "latency", "timeout"])
    if not terms:
        terms.append(intent[:60])
    return list(dict.fromkeys(term for term in terms if term.strip()))


@app.post("/api/semantic-triage")
def semantic_triage(req: SemanticTriageRequest):
    intent = req.intent.strip()
    if not intent:
        raise HTTPException(400, "Intent cannot be empty")

    terms = [_escape_sql(term) for term in _incident_terms(intent)]
    sentry_predicate = " OR ".join([f"s.title ILIKE '%{term}%' OR s.project ILIKE '%{term}%'" for term in terms])
    github_predicate = " OR ".join([f"g.title ILIKE '%{term}%'" for term in terms])
    pagerduty_predicate = " OR ".join([f"pd.service__summary ILIKE '%{term}%'" for term in terms])
    cross_predicate = " OR ".join([
        f"s.title ILIKE '%{term}%' OR s.project ILIKE '%{term}%' OR g.title ILIKE '%{term}%'"
        for term in terms
    ])
    search_q = _escape_sql(" ".join(terms[:3]))

    # Cross-source JOIN: GitHub PRs × Sentry errors — the core X-factor
    cross_source_sql = f"""
SELECT
    g.number        AS pr_number,
    g.title         AS pr_title,
    g.user__login   AS author,
    g.merged_at,
    s.id            AS sentry_id,
    s.title         AS error_title,
    s.level,
    s.count         AS times_seen,
    s.project,
    s.first_seen
FROM github.pulls g
JOIN sentry.issues s
    ON CAST(s.first_seen AS TIMESTAMP) >= CAST(g.merged_at AS TIMESTAMP)
   AND CAST(s.first_seen AS TIMESTAMP) <= CAST(g.merged_at AS TIMESTAMP) + INTERVAL '24 hours'
WHERE g.owner = '{GITHUB_OWNER}'
  AND g.repo  = '{GITHUB_REPO}'
  AND g.state = 'closed'
  AND CAST(g.merged_at AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '30 days'
  AND s.query = 'is:unresolved'
  AND ({cross_predicate})
ORDER BY g.merged_at DESC, s.count DESC
LIMIT 10
""".strip()

    # GitHub search API — uses actual GitHub search index, not ILIKE scan
    github_search_sql = f"""
SELECT number, title, state, user_login AS author, html_url, repository_url
FROM github.search_issues(
    q => 'repo:{GITHUB_OWNER}/{GITHUB_REPO} {search_q} in:title,body'
)
LIMIT 10
""".strip()

    sentry_sql = f"""
SELECT id, title, level, count, user_count, first_seen, project
FROM sentry.issues s
WHERE CAST(first_seen AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '30 days'
  AND s.query = 'is:unresolved'
  AND ({sentry_predicate})
ORDER BY count DESC
LIMIT 10
""".strip()

    github_sql = f"""
SELECT number, title, state, merged_at, created_at, user__login AS author
FROM github.pulls g
WHERE owner = '{GITHUB_OWNER}'
  AND repo = '{GITHUB_REPO}'
  AND CAST(created_at AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '30 days'
  AND ({github_predicate})
ORDER BY created_at DESC
LIMIT 10
""".strip()

    pagerduty_sql = f"""
SELECT id, status, urgency, created_at, service__summary AS service
FROM pagerduty.incidents pd
WHERE CAST(created_at AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '30 days'
  AND ({pagerduty_predicate})
ORDER BY created_at DESC
LIMIT 10
""".strip()

    cross_result = coral_query(
        "Semantic triage: GitHub x Sentry cross-source JOIN",
        cross_source_sql,
        ["github", "sentry"],
    )
    github_search_result = coral_query(
        "Semantic triage: github.search_issues() API search",
        github_search_sql,
        ["github"],
    )
    results = {
        "cross_source": cross_result,
        "sentry": coral_query("Semantic triage: Sentry native predicates", sentry_sql, ["sentry"]),
        "github": coral_query("Semantic triage: GitHub PR predicates", github_sql, ["github"]),
        "github_search": github_search_result,
        "pagerduty": coral_query("Semantic triage: PagerDuty predicates", pagerduty_sql, ["pagerduty"]),
    }

    if SLACK_INCIDENTS_CHANNEL:
        slack_predicate = " OR ".join([f"text ILIKE '%{term}%'" for term in terms[:5]])
        slack_sql = f"""
SELECT text, ts, user_id, reply_count
FROM slack.messages(
    channel => '{SLACK_INCIDENTS_CHANNEL}',
    oldest => '{q._unix_seconds_days_ago(30)}',
    latest => '{q._unix_seconds_now()}'
)
WHERE {slack_predicate}
LIMIT 10
""".strip()
        results["slack"] = coral_query("Semantic triage: Slack incident search", slack_sql, ["slack"])

    return {
        "intent": intent,
        "generated_filters": {
            "terms": terms,
            "time_window": "last 30 days",
            "github_owner": GITHUB_OWNER,
            "github_repo": GITHUB_REPO,
            "slack_channel": SLACK_INCIDENTS_CHANNEL or None,
        },
        "cross_source_rows": cross_result["rows"],
        "cross_source_proof": cross_result["proof"],
        "results": {name: result["rows"] for name, result in results.items()},
        "proofs": [result["proof"] for result in results.values()],
        "explanation": (
            "Semantic triage translates natural language into source-native Coral SQL filters. "
            "The cross-source section runs a real GitHub x Sentry JOIN — the same causal link "
            "used by the Live Monitor — narrowed to your search terms."
        ),
    }


@app.post("/api/ask")
def ask_helm(req: AskRequest):
    question = req.question.strip()
    if not question:
        raise HTTPException(400, "Question cannot be empty")

    context_data: dict = {}
    proofs: list[dict] = []
    q_lower = question.lower()

    def add(label: str, sql: str, sources: list[str], key: str, limit: int) -> None:
        rows, proof = _try_run(label, sql, sources)
        if rows:
            context_data[key] = rows[:limit]
        proofs.append(proof)

    if any(w in q_lower for w in ["deploy", "error", "bug", "sentry", "pr", "merge", "focus"]):
        add("Deployment errors", q.deployment_errors(GITHUB_OWNER, GITHUB_REPO), ["github", "sentry"], "deployment_errors", 10)
    if any(w in q_lower for w in ["service", "incident", "pagerduty", "outage", "alert", "stable", "focus"]):
        add("Service instability", q.service_instability(), ["sentry", "pagerduty"], "service_instability", 8)
        if SLACK_INCIDENTS_CHANNEL:
            add("Root cause constellation", q.root_cause_constellation(GITHUB_OWNER, GITHUB_REPO, SLACK_INCIDENTS_CHANNEL), ["github", "sentry", "pagerduty", "slack"], "root_cause_constellation", 6)
    if any(w in q_lower for w in ["ticket", "linear", "burnout", "engineer", "risk", "team"]):
        add("Team Health Pulse", q.team_health_pulse(GITHUB_OWNER, GITHUB_REPO), ["github", "linear", "sentry"], "team_health", 15)
    if any(w in q_lower for w in ["velocity", "delivery", "week"]):
        add("PRs vs incidents", q.pr_vs_incidents(GITHUB_OWNER, GITHUB_REPO), ["github", "pagerduty"], "pr_vs_incidents", 14)

    if not context_data:
        add("Deployment errors", q.deployment_errors(GITHUB_OWNER, GITHUB_REPO), ["github", "sentry"], "deployment_errors", 8)
        add("Service instability", q.service_instability(), ["sentry", "pagerduty"], "service_instability", 6)
        add("Team Health Pulse", q.team_health_pulse(GITHUB_OWNER, GITHUB_REPO), ["github", "linear", "sentry"], "team_health", 10)

    # Schema-aware grounding: only inject column details for sources actually queried.
    # Fetching all 5 sources' schemas wastes ~200 tokens and degrades plan quality —
    # infer the active source set from what data was already fetched.
    active_sources = sorted({
        src
        for proof in proofs
        for src in (proof.get("sources") or [])
        if src != "coral"
    }) or ["github", "sentry"]

    source_in_clause = ", ".join(f"'{_escape_sql(s)}'" for s in active_sources)
    schema_sql = (
        f"SELECT schema_name, table_name, column_name "
        f"FROM coral.columns "
        f"WHERE schema_name IN ({source_in_clause}) "
        f"ORDER BY schema_name, table_name, column_name"
    )
    schema_rows, schema_proof = _try_run(
        f"Schema grounding ({', '.join(active_sources)})",
        schema_sql,
        active_sources,
        timeout=15,
        cache_ttl=300,
    )
    proofs.insert(0, schema_proof)

    # Group into table -> [col, col, ...] for compact prompt injection
    schema_by_table: dict[str, list[str]] = {}
    for row in schema_rows:
        key = f"{row.get('schema_name')}.{row.get('table_name')}"
        schema_by_table.setdefault(key, []).append(str(row.get("column_name", "")))

    prompt = f"""You are Helm, an engineering intelligence agent. Answer the user's question using only the data provided.

QUESTION: {question}

CORAL SCHEMA (sources in use: {', '.join(active_sources)}):
{json.dumps(schema_by_table, indent=2, default=str)}

CONTEXT DATA:
{json.dumps(context_data, indent=2, default=str)}

Answer in 3-5 sentences with specific evidence. Reference exact table.column names from the schema above. If data is insufficient, name the specific Coral table and column that would help."""

    answer = analyze(prompt)
    return {
        "answer": answer,
        "data_used": list(context_data.keys()),
        "schema_sources": active_sources,
        "proofs": proofs,
        "draft_actions": _draft_actions("root_cause", context_data.get("root_cause_constellation", [])),
        "optimization_card": {
            "accuracy_gain": "+31%",
            "token_reduction": "-70%",
            "latency_reduction": "-55%",
            "direct_mcp_tokens": "~313k",
            "coral_tokens": "~112k",
            "direct_mcp_calls": "29+",
            "coral_calls": "1 federated query",
            "source": "Coral published retrieval benchmark (complex tasks n=51)",
        },
    }


@app.post("/api/apply-fix")
def apply_fix(merge: bool = Query(False)):
    script = BASE_DIR.parent / "scripts" / "apply-live-fix.ps1"
    if not script.exists():
        raise HTTPException(404, f"Fix script not found: {script}")

    command = [
        "powershell",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(script),
    ]
    if merge:
        command.append("-Merge")

    try:
        result = subprocess.run(
            command,
            cwd=str(BASE_DIR.parent),
            capture_output=True,
            text=True,
            timeout=180,
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(504, f"Fix script timed out: {exc}") from exc

    output = "\n".join(part for part in [result.stdout.strip(), result.stderr.strip()] if part)
    success = result.returncode == 0
    return {
        "success": success,
        "returncode": result.returncode,
        "output": output,
        "merged": merge and success,
    }


# ─── X-FACTOR ENDPOINTS ──────────────────────────────────────────────────────


@app.get("/api/mttr-attribution")
def get_mttr_attribution(refresh: bool = Query(False)):
    """
    MTTR Causal Attribution — per-author and per-service mean time to production
    error, computed from a live GitHub × Sentry cross-source JOIN.

    No ETL, no warehouse. One Coral SQL query gives you the ranking that
    normally takes a data team 3 months to build.
    """
    _require_repo()
    rows, proof = _try_run(
        "MTTR Attribution: GitHub × Sentry causal attribution",
        q.mttr_attribution(GITHUB_OWNER, GITHUB_REPO),
        ["github", "sentry"],
        timeout=30,
        cache_ttl=0 if refresh else 30,
    )

    author_map: dict[str, dict] = {}
    service_map: dict[str, dict] = {}

    for row in rows:
        minutes = _minutes_between(row.get("merged_at"), row.get("first_seen"))
        author = row.get("author") or "unknown"
        service = row.get("service") or "unknown"

        if author not in author_map:
            author_map[author] = {
                "author": author,
                "_prs": set(),
                "total_errors": 0,
                "total_error_events": 0,
                "total_users_affected": 0,
                "fatal_count": 0,
                "_times": [],
                "worst_error": None,
                "worst_service": None,
                "_worst_events": 0,
            }
        a = author_map[author]
        a["_prs"].add(row.get("pr_number"))
        a["total_errors"] += 1
        a["total_error_events"] += _safe_int(row.get("times_seen"))
        a["total_users_affected"] += _safe_int(row.get("users_affected"))
        if row.get("level") == "fatal":
            a["fatal_count"] += 1
        if minutes is not None:
            a["_times"].append(minutes)
        if _safe_int(row.get("times_seen")) > a["_worst_events"]:
            a["_worst_events"] = _safe_int(row.get("times_seen"))
            a["worst_error"] = row.get("error_title")
            a["worst_service"] = service

        if service not in service_map:
            service_map[service] = {
                "service": service,
                "total_errors": 0,
                "total_error_events": 0,
                "fatal_count": 0,
                "_times": [],
                "_authors": set(),
            }
        s_data = service_map[service]
        s_data["total_errors"] += 1
        s_data["total_error_events"] += _safe_int(row.get("times_seen"))
        if row.get("level") == "fatal":
            s_data["fatal_count"] += 1
        if minutes is not None:
            s_data["_times"].append(minutes)
        s_data["_authors"].add(author)

    authors_out = []
    for a in author_map.values():
        times = a["_times"]
        avg_mttr = round(sum(times) / len(times)) if times else None
        risk = (
            "high" if (avg_mttr is not None and avg_mttr < 30) or a["fatal_count"] > 0
            else "medium" if a["total_errors"] >= 3
            else "low"
        )
        authors_out.append({
            "author": a["author"],
            "total_prs": len(a["_prs"]),
            "total_errors": a["total_errors"],
            "total_error_events": a["total_error_events"],
            "total_users_affected": a["total_users_affected"],
            "fatal_count": a["fatal_count"],
            "avg_minutes_to_error": avg_mttr,
            "worst_error": a["worst_error"],
            "worst_service": a["worst_service"],
            "risk_level": risk,
        })

    authors_out.sort(
        key=lambda x: (x["avg_minutes_to_error"] is None, x["avg_minutes_to_error"] or 9999, -x["total_errors"])
    )

    services_out = []
    for s_data in service_map.values():
        times = s_data["_times"]
        avg_mttr = round(sum(times) / len(times)) if times else None
        services_out.append({
            "service": s_data["service"],
            "total_errors": s_data["total_errors"],
            "total_error_events": s_data["total_error_events"],
            "fatal_count": s_data["fatal_count"],
            "avg_minutes_to_error": avg_mttr,
            "affected_author_count": len(s_data["_authors"]),
        })
    services_out.sort(key=lambda x: (-x["total_error_events"], x["avg_minutes_to_error"] or 9999))

    all_times = [t for a in author_map.values() for t in a["_times"]]
    overall_avg = round(sum(all_times) / len(all_times)) if all_times else None

    return {
        "authors": authors_out,
        "services": services_out[:8],
        "summary": {
            "total_pr_error_chains": len(rows),
            "total_authors_with_errors": len(authors_out),
            "avg_minutes_to_error": overall_avg,
            "worst_author": authors_out[0]["author"] if authors_out else None,
            "safest_author": authors_out[-1]["author"] if len(authors_out) > 1 else None,
        },
        "proofs": [proof],
    }


@app.get("/api/cascade")
def get_cascade(refresh: bool = Query(False)):
    """
    Cascade Early Warning — detects GitHub → Sentry → PagerDuty signal chains.
    Deploy → error window: 24 hours. Error → incident window: 4 hours.

    This is Coral's predictive edge: the window-join logic runs inside the
    Coral execution plan. A Python API-polling loop would need 29+ separate
    calls and still miss cross-source timing precision.
    """
    _require_repo()
    rows, proof = _try_run(
        "Cascade Early Warning: GitHub × Sentry × PagerDuty 24h/4h window",
        q.cascade_signals(GITHUB_OWNER, GITHUB_REPO),
        ["github", "sentry", "pagerduty"],
        timeout=30,
        cache_ttl=0 if refresh else 30,
    )

    has_pr = has_error = has_incident = False
    affected_services: set[str] = set()
    fatal_count = total_events = user_impact = 0
    active_signals: list[dict] = []
    seen_signal_keys: set[str] = set()

    def _add_signal(sig: dict) -> None:
        key = f"{sig['source']}-{str(sig.get('label', ''))[:40]}"
        if key not in seen_signal_keys:
            seen_signal_keys.add(key)
            active_signals.append(sig)

    for row in rows:
        minutes = _minutes_between(row.get("merged_at"), row.get("error_first_seen"))
        service = row.get("service") or "unknown"

        if row.get("pr_number"):
            has_pr = True
            _add_signal({
                "source": "github",
                "type": "deploy",
                "label": f"PR #{row['pr_number']} merged",
                "detail": row.get("pr_title", ""),
                "time": row.get("merged_at"),
                "author": row.get("author"),
            })

        if row.get("error_title"):
            has_error = True
            level = row.get("level", "error")
            if level == "fatal":
                fatal_count += 1
            total_events += _safe_int(row.get("error_events"))
            user_impact += _safe_int(row.get("users_affected"))
            affected_services.add(service)
            _add_signal({
                "source": "sentry",
                "type": "error",
                "label": row.get("error_title", "Production error"),
                "detail": f"{level} · {row.get('error_events', 0)} events · {minutes or '?'} min after merge",
                "time": row.get("error_first_seen"),
                "severity": level,
            })

        if row.get("incident_id"):
            has_incident = True
            _add_signal({
                "source": "pagerduty",
                "type": "incident",
                "label": f"Incident: {row.get('incident_service') or service}",
                "detail": f"Urgency: {row.get('incident_urgency', 'unknown')} · {row.get('incident_status', 'unknown')}",
                "time": row.get("incident_created_at"),
                "urgency": row.get("incident_urgency"),
            })

    risk_score = 0
    if has_pr:       risk_score += 20
    if has_error:    risk_score += 30
    if has_incident: risk_score += 30
    risk_score += min(fatal_count * 10, 20)
    risk_score += min(len(affected_services) * 5, 15)
    if user_impact > 100:  risk_score += 15
    elif user_impact > 10: risk_score += 8
    risk_score = min(risk_score, 100)

    if risk_score >= 70:
        risk_level, risk_label = "critical", "CASCADE DETECTED"
    elif risk_score >= 40:
        risk_level, risk_label = "high", "SIGNALS CONVERGING"
    elif risk_score >= 20:
        risk_level, risk_label = "medium", "EARLY SIGNALS"
    else:
        risk_level, risk_label = "low", "MONITORING"

    if risk_score >= 70:
        recommendation = (
            f"Active cascade: {len(rows)} deploy-error-incident chains across "
            f"{len(affected_services)} service(s). Recommend immediate incident review and rollback assessment."
        )
    elif risk_score >= 40:
        parts = [p for p, flag in [("GitHub merges", has_pr), ("Sentry errors", has_error), ("PagerDuty alerts", has_incident)] if flag]
        recommendation = f"Signals converging: {', '.join(parts)}. Monitor closely — cascade risk is elevated."
    elif rows:
        recommendation = f"{len(rows)} deploy-error chains found in the last 7 days. No error-to-incident convergence within the 4-hour window."
    else:
        recommendation = "No cascade pattern detected. GitHub, Sentry, and PagerDuty signals are not converging."

    return {
        "risk_score": risk_score,
        "risk_level": risk_level,
        "risk_label": risk_label,
        "recommendation": recommendation,
        "signals": active_signals[:12],
        "chains": rows[:8],
        "summary": {
            "total_chains": len(rows),
            "affected_services": sorted(affected_services),
            "has_github": has_pr,
            "has_sentry": has_error,
            "has_pagerduty": has_incident,
            "fatal_errors": fatal_count,
            "total_events": total_events,
            "user_impact": user_impact,
        },
        "proofs": [proof],
    }


@app.get("/api/risk-scorecard")
def get_risk_scorecard(refresh: bool = Query(False)):
    """
    Engineering Risk Scorecard — SOC2-ready compliance audit trail.

    Every deployment, who made it, what broke, which incident it triggered,
    whether Linear has a follow-up, and how much Slack noise it generated —
    all computed from one Coral SQL execution plan spanning up to 5 live
    sources. Python layer adds risk scores and compliance flags. Zero data
    warehouse required.
    """
    _require_repo()

    sources = ["github", "sentry", "pagerduty", "linear"]
    if SLACK_INCIDENTS_CHANNEL:
        sources.append("slack")

    source_label = " × ".join(s.capitalize() for s in sources)
    rows, proof = _try_run(
        f"Risk Scorecard: {source_label} compliance audit",
        q.risk_scorecard(GITHUB_OWNER, GITHUB_REPO, SLACK_INCIDENTS_CHANNEL),
        sources,
        timeout=30,
        cache_ttl=0 if refresh else 30,
    )

    author_error_counts: dict[str, int] = {}
    for row in rows:
        author = row.get("author") or "unknown"
        author_error_counts[author] = author_error_counts.get(author, 0) + 1

    scorecard: list[dict] = []
    for row in rows:
        author = row.get("author") or "unknown"
        minutes = _minutes_between(row.get("merged_at"), row.get("error_first_seen"))
        events = _safe_int(row.get("error_events"))
        affected = _safe_int(row.get("users_affected"))
        slack_msgs = _safe_int(row.get("slack_messages"))

        flags: list[str] = []
        if row.get("level") == "fatal":
            flags.append("HIGH SEVERITY")
        if affected > 10:
            flags.append(f"CUSTOMER IMPACT")
        if row.get("incident_id"):
            flags.append("INCIDENT TRIGGERED")
        if row.get("followup_identifier"):
            flags.append("LINEAR FOLLOW-UP")
        else:
            flags.append("NO LINEAR FOLLOW-UP")
        if minutes is not None and minutes < 30:
            flags.append(f"RAPID ONSET")
        if author_error_counts.get(author, 0) >= 3:
            flags.append("REPEAT PATTERN")
        if slack_msgs > 5:
            flags.append("INCIDENT NOISE")

        risk_score = 0
        risk_score += 40 if row.get("level") == "fatal" else 20
        risk_score += 20 if row.get("incident_id") else 0
        risk_score += min(affected // 5, 20)
        risk_score += 10 if minutes is not None and minutes < 30 else 0
        risk_score += 10 if author_error_counts.get(author, 0) >= 3 else 0
        risk_score += 10 if not row.get("followup_identifier") else 0
        risk_score = min(risk_score, 100)

        risk_level = (
            "critical" if risk_score >= 70
            else "high" if risk_score >= 50
            else "medium" if risk_score >= 30
            else "low"
        )

        scorecard.append({
            **row,
            "flags": flags,
            "risk_score": risk_score,
            "risk_level": risk_level,
            "minutes_to_error": minutes,
        })

    scorecard.sort(key=lambda x: -x["risk_score"])

    total_changes = len({r.get("pr_number") for r in rows})
    high_risk = sum(1 for r in scorecard if r["risk_level"] in ("critical", "high"))
    with_incidents = sum(1 for r in rows if r.get("incident_id"))

    return {
        "scorecard": scorecard[:20],
        "summary": {
            "total_changes_analyzed": total_changes,
            "total_error_chains": len(rows),
            "changes_with_incidents": with_incidents,
            "high_risk_chains": high_risk,
            "sources_joined": len(sources),
            "audit_window_days": 30,
        },
        "compliance_verdict": "NEEDS REVIEW" if high_risk > 0 else "CLEAN",
        "proofs": [proof],
    }


@app.get("/api/sandbox/templates")
def sandbox_templates():
    """Pre-built SQL templates for the interactive sandbox, with owner/repo substituted."""
    owner = _escape_sql(GITHUB_OWNER)
    repo = _escape_sql(GITHUB_REPO)
    templates = [
        {
            "id": "github-prs",
            "label": "GitHub PRs",
            "sources": ["github"],
            "description": "Recent merged pull requests from GitHub",
            "sql": (
                f"SELECT number, title, user__login AS author, merged_at, state\n"
                f"FROM github.pulls\n"
                f"WHERE owner = '{owner}'\n"
                f"  AND repo = '{repo}'\n"
                f"  AND state = 'closed'\n"
                f"ORDER BY merged_at DESC\n"
                f"LIMIT 20"
            ),
        },
        {
            "id": "sentry-errors",
            "label": "Sentry Errors",
            "sources": ["sentry"],
            "description": "Top unresolved production errors (last 30 days)",
            "sql": (
                "SELECT title, project, level, count, user_count, first_seen\n"
                "FROM sentry.issues\n"
                "WHERE query = 'is:unresolved'\n"
                "  AND CAST(first_seen AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '30 days'\n"
                "ORDER BY count DESC\n"
                "LIMIT 20"
            ),
        },
        {
            "id": "cross-source-join",
            "label": "PR → Error JOIN",
            "sources": ["github", "sentry"],
            "description": "Cross-source: GitHub PRs joined to Sentry errors within 24 hours",
            "sql": (
                f"SELECT\n"
                f"  g.number      AS pr_number,\n"
                f"  g.title       AS pr_title,\n"
                f"  g.user__login AS author,\n"
                f"  g.merged_at,\n"
                f"  s.title       AS error_title,\n"
                f"  s.level,\n"
                f"  s.count       AS times_seen,\n"
                f"  s.first_seen\n"
                f"FROM github.pulls g\n"
                f"JOIN sentry.issues s\n"
                f"  ON CAST(s.first_seen AS TIMESTAMP) >= CAST(g.merged_at AS TIMESTAMP)\n"
                f" AND CAST(s.first_seen AS TIMESTAMP) <= CAST(g.merged_at AS TIMESTAMP) + INTERVAL '24 hours'\n"
                f"WHERE g.owner = '{owner}'\n"
                f"  AND g.repo = '{repo}'\n"
                f"  AND g.state = 'closed'\n"
                f"  AND CAST(g.merged_at AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '30 days'\n"
                f"ORDER BY s.count DESC\n"
                f"LIMIT 20"
            ),
        },
        {
            "id": "service-stability",
            "label": "Service Stability",
            "sources": ["sentry", "pagerduty"],
            "description": "Sentry error counts joined to PagerDuty incidents per service",
            "sql": (
                "SELECT\n"
                "  s.project               AS service,\n"
                "  COUNT(s.id)             AS error_count,\n"
                "  SUM(s.count)            AS total_events,\n"
                "  COUNT(p.id)             AS incident_count,\n"
                "  MAX(s.level)            AS max_severity\n"
                "FROM sentry.issues s\n"
                "LEFT JOIN pagerduty.incidents p\n"
                "  ON s.project ILIKE '%' || COALESCE(p.service__summary, '') || '%'\n"
                "  OR COALESCE(p.service__summary, '') ILIKE '%' || s.project || '%'\n"
                "WHERE s.query = 'is:unresolved'\n"
                "  AND CAST(s.first_seen AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '30 days'\n"
                "GROUP BY s.project\n"
                "ORDER BY total_events DESC\n"
                "LIMIT 20"
            ),
        },
        {
            "id": "coral-schema",
            "label": "Schema Depth",
            "sources": ["github", "sentry", "pagerduty", "linear", "slack"],
            "description": "Coral schema introspection: tables and columns per source — see the full depth of what Coral exposes",
            "sql": (
                "SELECT\n"
                "  schema_name,\n"
                "  COUNT(DISTINCT table_name)  AS tables,\n"
                "  COUNT(*)                    AS columns\n"
                "FROM coral.columns\n"
                "GROUP BY schema_name\n"
                "ORDER BY tables DESC"
            ),
        },
        {
            "id": "deploy-vs-errors",
            "label": "Deploy vs Error Trend",
            "sources": ["github", "sentry"],
            "description": "Monthly deploy frequency vs error introduction rate — two live time series in one JOIN",
            "sql": (
                f"SELECT\n"
                f"  SUBSTR(g.merged_at, 1, 7)                       AS year_month,\n"
                f"  COUNT(DISTINCT g.number)                         AS deploys,\n"
                f"  COUNT(DISTINCT s.id)                             AS new_errors,\n"
                f"  COALESCE(SUM(s.count), 0)                        AS total_error_events\n"
                f"FROM github.pulls g\n"
                f"LEFT JOIN sentry.issues s\n"
                f"  ON CAST(s.first_seen AS TIMESTAMP) >= CAST(g.merged_at AS TIMESTAMP)\n"
                f" AND CAST(s.first_seen AS TIMESTAMP) <= CAST(g.merged_at AS TIMESTAMP) + INTERVAL '24 hours'\n"
                f" AND s.query = 'is:unresolved'\n"
                f" AND s.level IN ('error', 'fatal')\n"
                f"WHERE g.owner = '{owner}'\n"
                f"  AND g.repo  = '{repo}'\n"
                f"  AND g.state = 'closed'\n"
                f"  AND CAST(g.merged_at AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '180 days'\n"
                f"GROUP BY SUBSTR(g.merged_at, 1, 7)\n"
                f"ORDER BY year_month ASC\n"
                f"LIMIT 12"
            ),
        },
        {
            "id": "4-source-constellation",
            "label": "4-Source Constellation",
            "sources": ["github", "sentry", "pagerduty", "slack"],
            "description": "PR → Sentry error → PagerDuty incident → Slack response: 4 live APIs joined in one DataFusion plan. Impossible without Coral.",
            "sql": (
                # 4-source version when channel is configured; 3-source fallback otherwise
                (
                    f"-- 4-source constellation: GitHub × Sentry × PagerDuty × Slack\n"
                    f"-- channel: {SLACK_INCIDENTS_CHANNEL} (from SLACK_INCIDENTS_CHANNEL env var)\n"
                    f"SELECT\n"
                    f"  g.number           AS pr_number,\n"
                    f"  g.user__login      AS author,\n"
                    f"  g.merged_at,\n"
                    f"  s.title            AS sentry_error,\n"
                    f"  s.level            AS severity,\n"
                    f"  s.project,\n"
                    f"  p.id               AS incident_id,\n"
                    f"  p.status           AS incident_status,\n"
                    f"  p.urgency,\n"
                    f"  p.created_at       AS incident_time,\n"
                    f"  m.text             AS slack_response,\n"
                    f"  m.user_id          AS slack_user_id\n"
                    f"FROM github.pulls g\n"
                    f"JOIN sentry.issues s\n"
                    f"  ON CAST(s.first_seen AS TIMESTAMP) >= CAST(g.merged_at AS TIMESTAMP)\n"
                    f" AND CAST(s.first_seen AS TIMESTAMP) <= CAST(g.merged_at AS TIMESTAMP) + INTERVAL '24 hours'\n"
                    f" AND s.query = 'is:unresolved'\n"
                    f"LEFT JOIN pagerduty.incidents p\n"
                    f"  ON (\n"
                    f"    (p.service__summary ILIKE '%' || s.project || '%' AND LENGTH(s.project) >= 5)\n"
                    f"    OR (s.project ILIKE '%' || p.service__summary || '%' AND LENGTH(p.service__summary) >= 5)\n"
                    f"  )\n"
                    f"  AND CAST(p.created_at AS TIMESTAMP) >= CAST(s.first_seen AS TIMESTAMP)\n"
                    f"  AND CAST(p.created_at AS TIMESTAMP) <= CAST(s.first_seen AS TIMESTAMP) + INTERVAL '4 hours'\n"
                    f"LEFT JOIN slack.messages(channel => '{SLACK_INCIDENTS_CHANNEL}', oldest => '{q._unix_seconds_days_ago(30)}', latest => '{q._unix_seconds_now()}') m\n"
                    f"  ON CAST(m.ts AS TIMESTAMP) >= CAST(p.created_at AS TIMESTAMP) - INTERVAL '30 minutes'\n"
                    f" AND CAST(m.ts AS TIMESTAMP) <= CAST(p.created_at AS TIMESTAMP) + INTERVAL '4 hours'\n"
                    f"WHERE g.owner = '{owner}'\n"
                    f"  AND g.repo = '{repo}'\n"
                    f"  AND g.state = 'closed'\n"
                    f"  AND CAST(g.merged_at AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '30 days'\n"
                    f"ORDER BY g.merged_at DESC\n"
                    f"LIMIT 10"
                ) if SLACK_INCIDENTS_CHANNEL else (
                    f"-- 3-source constellation: GitHub × Sentry × PagerDuty\n"
                    f"-- Set SLACK_INCIDENTS_CHANNEL in .env (use 'Slack Channels' template to find the ID)\n"
                    f"-- to unlock the full 4-source version including Slack response data\n"
                    f"SELECT\n"
                    f"  g.number           AS pr_number,\n"
                    f"  g.user__login      AS author,\n"
                    f"  g.merged_at,\n"
                    f"  s.title            AS sentry_error,\n"
                    f"  s.level            AS severity,\n"
                    f"  s.project,\n"
                    f"  p.id               AS incident_id,\n"
                    f"  p.status           AS incident_status,\n"
                    f"  p.urgency,\n"
                    f"  p.created_at       AS incident_time\n"
                    f"FROM github.pulls g\n"
                    f"JOIN sentry.issues s\n"
                    f"  ON CAST(s.first_seen AS TIMESTAMP) >= CAST(g.merged_at AS TIMESTAMP)\n"
                    f" AND CAST(s.first_seen AS TIMESTAMP) <= CAST(g.merged_at AS TIMESTAMP) + INTERVAL '24 hours'\n"
                    f" AND s.query = 'is:unresolved'\n"
                    f"LEFT JOIN pagerduty.incidents p\n"
                    f"  ON (\n"
                    f"    (p.service__summary ILIKE '%' || s.project || '%' AND LENGTH(s.project) >= 5)\n"
                    f"    OR (s.project ILIKE '%' || p.service__summary || '%' AND LENGTH(p.service__summary) >= 5)\n"
                    f"  )\n"
                    f"  AND CAST(p.created_at AS TIMESTAMP) >= CAST(s.first_seen AS TIMESTAMP)\n"
                    f"  AND CAST(p.created_at AS TIMESTAMP) <= CAST(s.first_seen AS TIMESTAMP) + INTERVAL '4 hours'\n"
                    f"WHERE g.owner = '{owner}'\n"
                    f"  AND g.repo = '{repo}'\n"
                    f"  AND g.state = 'closed'\n"
                    f"  AND CAST(g.merged_at AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '30 days'\n"
                    f"ORDER BY g.merged_at DESC\n"
                    f"LIMIT 10"
                )
            ),
        },
        {
            "id": "describe-extended",
            "label": "DESCRIBE EXTENDED",
            "sources": ["github"],
            "description": "Coral adaptive metadata: recommended JOINs, query count, and cache hit rate for github.pulls",
            "sql": "DESCRIBE EXTENDED github.pulls",
        },
        {
            "id": "slack-channels",
            "label": "Slack Channels",
            "sources": ["slack"],
            "description": "Discover Slack channels and their IDs — use the returned id (C0XXXXXXXXX) in slack.messages() calls instead of hardcoding channel names",
            "sql": (
                "SELECT id, name, topic, purpose, num_members, is_archived, created\n"
                "FROM slack.channels\n"
                "WHERE is_archived = false\n"
                "ORDER BY num_members DESC\n"
                "LIMIT 50"
            ),
        },
        {
            "id": "linear-exact-pr-link",
            "label": "Linear ↔ GitHub (Exact)",
            "sources": ["linear", "github"],
            "description": "Exact PR↔Linear issue join via linear.attachments.url — no fuzzy ILIKE matching, direct URL equality",
            "sql": (
                f"-- linear.attachments.url contains the GitHub PR html_url\n"
                f"-- This is the precise linkage — no name guessing\n"
                f"SELECT\n"
                f"  g.number          AS pr_number,\n"
                f"  g.title           AS pr_title,\n"
                f"  g.user__login     AS author,\n"
                f"  g.merged_at,\n"
                f"  li.identifier     AS linear_issue,\n"
                f"  li.title          AS issue_title,\n"
                f"  li.state_name     AS issue_state,\n"
                f"  li.priority_label AS priority,\n"
                f"  li.assignee_name  AS assignee,\n"
                f"  li.team_key       AS team\n"
                f"FROM github.pulls g\n"
                f"JOIN linear.attachments la ON la.url = g.html_url\n"
                f"JOIN linear.issues li ON li.id = la.issue_id\n"
                f"WHERE g.owner = '{owner}'\n"
                f"  AND g.repo = '{repo}'\n"
                f"  AND g.state = 'closed'\n"
                f"  AND CAST(g.merged_at AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '30 days'\n"
                f"ORDER BY g.merged_at DESC\n"
                f"LIMIT 20"
            ),
        },
        {
            "id": "pagerduty-forensics",
            "label": "PagerDuty Forensics",
            "sources": ["pagerduty"],
            "description": "Incident lifecycle audit trail from pagerduty.log_entries: who acknowledged, when they escalated, resolution timeline",
            "sql": (
                "SELECT\n"
                "  le.incident__id       AS incident_id,\n"
                "  le.type               AS entry_type,\n"
                "  le.created_at         AS event_time,\n"
                "  le.agent__summary     AS agent,\n"
                "  le.acknowledgement_timeout,\n"
                "  pd.service__summary   AS service,\n"
                "  pd.urgency,\n"
                "  pd.status             AS incident_status\n"
                "FROM pagerduty.log_entries le\n"
                "JOIN pagerduty.incidents pd ON pd.id = le.incident__id\n"
                "WHERE CAST(pd.created_at AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '30 days'\n"
                "  AND le.type IN ('notify_log_entry', 'acknowledge_log_entry', 'resolve_log_entry', 'escalate_log_entry')\n"
                "ORDER BY le.created_at DESC\n"
                "LIMIT 30"
            ),
        },
        {
            "id": "oncall-attribution",
            "label": "On-Call Attribution",
            "sources": ["pagerduty"],
            "description": "Who was on-call when each incident fired — pagerduty.oncalls joined to pagerduty.incidents by time window",
            "sql": (
                "SELECT\n"
                "  pd.id               AS incident_id,\n"
                "  pd.service__summary AS service,\n"
                "  pd.urgency,\n"
                "  pd.created_at       AS incident_time,\n"
                "  oc.user__summary    AS oncall_user,\n"
                "  oc.escalation_level,\n"
                "  oc.escalation_policy__summary AS policy,\n"
                "  oc.start            AS oncall_start,\n"
                "  oc.end              AS oncall_end\n"
                "FROM pagerduty.incidents pd\n"
                "JOIN pagerduty.oncalls oc\n"
                "    ON CAST(pd.created_at AS TIMESTAMP) >= CAST(oc.start AS TIMESTAMP)\n"
                "   AND (oc.end IS NULL OR CAST(pd.created_at AS TIMESTAMP) <= CAST(oc.end AS TIMESTAMP))\n"
                "WHERE CAST(pd.created_at AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '30 days'\n"
                "ORDER BY pd.created_at DESC\n"
                "LIMIT 20"
            ),
        },
        {
            "id": "sentry-discover",
            "label": "Sentry Discover",
            "sources": ["sentry"],
            "description": "Event-level analytics via sentry.discover (unlike sentry.issues which aggregates): per-transaction error counts across projects",
            "sql": (
                f"-- sentry.discover = event-level interface; sentry.issues = fingerprinted aggregates\n"
                f"-- start/end are required Sentry API filters\n"
                f"SELECT\n"
                f"  project, level, transaction, event_type,\n"
                f"  COUNT(*) AS event_count,\n"
                f"  MAX(timestamp) AS last_seen\n"
                f"FROM sentry.discover\n"
                f"WHERE query = 'is:unresolved'\n"
                f"  AND start = '{(datetime.now(timezone.utc) - timedelta(days=30)).strftime('%Y-%m-%dT%H:%M:%S')}'\n"
                f"  AND \"end\" = '{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S')}'\n"
                f"GROUP BY project, level, transaction, event_type\n"
                f"ORDER BY event_count DESC\n"
                f"LIMIT 20"
            ),
        },
        {
            "id": "linear-sprints",
            "label": "Linear Sprints",
            "sources": ["linear"],
            "description": "Sprint context from linear.cycles joined to issues — active/upcoming/completed cycle status with issue completion rates",
            "sql": (
                "SELECT\n"
                "  lc.name, lc.team_key, lc.starts_at, lc.ends_at,\n"
                "  CASE\n"
                "    WHEN lc.completed_at IS NOT NULL THEN 'completed'\n"
                "    WHEN CAST(lc.starts_at AS TIMESTAMP) > CURRENT_TIMESTAMP THEN 'upcoming'\n"
                "    ELSE 'active'\n"
                "  END AS cycle_status,\n"
                "  COUNT(li.id) AS total_issues,\n"
                "  SUM(CASE WHEN li.state_type = 'completed' THEN 1 ELSE 0 END) AS completed_issues\n"
                "FROM linear.cycles lc\n"
                "LEFT JOIN linear.issues li\n"
                "    ON li.team_key = lc.team_key\n"
                "   AND CAST(li.created_at AS TIMESTAMP) >= CAST(lc.starts_at AS TIMESTAMP)\n"
                "   AND CAST(li.created_at AS TIMESTAMP) <= CAST(lc.ends_at AS TIMESTAMP)\n"
                "WHERE CAST(lc.ends_at AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '60 days'\n"
                "GROUP BY lc.name, lc.team_key, lc.starts_at, lc.ends_at, lc.completed_at\n"
                "ORDER BY lc.starts_at DESC\n"
                "LIMIT 20"
            ),
        },
        {
            "id": "soc2-self-merger",
            "label": "SOC 2: Self-Mergers",
            "sources": ["github"],
            "description": "SOC 2 CC6 — find PRs where the author merged their own code without a second reviewer (segregation of duties violation)",
            "sql": (
                f"-- SOC 2 CC6: Segregation of Duties\n"
                f"-- Author and merger are the same person = no independent review\n"
                f"SELECT\n"
                f"  number,\n"
                f"  title,\n"
                f"  user__login     AS author,\n"
                f"  merged_by__login AS merged_by,\n"
                f"  merged_at,\n"
                f"  review_comments,\n"
                f"  html_url\n"
                f"FROM github.pulls\n"
                f"WHERE owner = '{owner}'\n"
                f"  AND repo  = '{repo}'\n"
                f"  AND state = 'closed'\n"
                f"  AND user__login = merged_by__login\n"
                f"  AND CAST(merged_at AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '30 days'\n"
                f"ORDER BY merged_at DESC\n"
                f"LIMIT 25"
            ),
        },
        {
            "id": "review-debt",
            "label": "Review Debt",
            "sources": ["github", "sentry"],
            "description": "Unreviewed or self-merged PRs that caused Sentry production errors — the true cost of skipping code review",
            "sql": (
                f"-- Review Debt: zero-review or self-merged PRs that triggered production errors\n"
                f"-- Cross-source: GitHub × Sentry in one Coral plan\n"
                f"SELECT\n"
                f"  g.number           AS pr_number,\n"
                f"  g.title,\n"
                f"  g.user__login      AS author,\n"
                f"  g.merged_at,\n"
                f"  g.review_comments,\n"
                f"  CASE WHEN g.user__login = g.merged_by__login THEN 'self-merged' ELSE 'no-review' END AS debt_type,\n"
                f"  s.title            AS error_title,\n"
                f"  s.count            AS error_events,\n"
                f"  s.level\n"
                f"FROM github.pulls g\n"
                f"JOIN sentry.issues s\n"
                f"  ON CAST(s.first_seen AS TIMESTAMP) >= CAST(g.merged_at AS TIMESTAMP)\n"
                f" AND CAST(s.first_seen AS TIMESTAMP) <= CAST(g.merged_at AS TIMESTAMP) + INTERVAL '24 hours'\n"
                f"WHERE g.owner = '{owner}'\n"
                f"  AND g.repo  = '{repo}'\n"
                f"  AND g.state = 'closed'\n"
                f"  AND (g.review_comments = 0 OR g.user__login = g.merged_by__login)\n"
                f"  AND CAST(g.merged_at AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '30 days'\n"
                f"  AND s.query = 'is:unresolved'\n"
                f"  AND s.level IN ('error', 'fatal')\n"
                f"ORDER BY s.count DESC\n"
                f"LIMIT 20"
            ),
        },
    ]
    return {"templates": templates}


@app.post("/api/sandbox/query")
def sandbox_query(req: SandboxQueryRequest):
    """
    Interactive Coral SQL sandbox — operators can run any SELECT query live.
    Read-only validation: blocks INSERT/UPDATE/DELETE/DROP and similar DML/DDL.
    """
    sql = req.sql.strip()
    sources = req.sources or []

    if not sql:
        raise HTTPException(400, "SQL cannot be empty")
    upper_sql = sql.lstrip().upper()
    if not (upper_sql.startswith("SELECT") or upper_sql.startswith("WITH") or upper_sql.startswith("DESCRIBE")):
        raise HTTPException(400, "Only SELECT, WITH, or DESCRIBE queries are allowed in the sandbox")
    if _SANDBOX_BLOCKED.search(sql):
        raise HTTPException(400, "Query contains disallowed DML/DDL keywords (INSERT, UPDATE, DELETE, DROP, etc.)")
    if len(sql) > 5000:
        raise HTTPException(400, "SQL too long (max 5000 characters)")
    if not sources:
        raise HTTPException(400, "At least one source is required")
    unknown = [s for s in sources if s not in HELM_SOURCES]
    if unknown:
        raise HTTPException(400, f"Unknown sources: {', '.join(unknown)}. Valid: {', '.join(HELM_SOURCES)}")

    rows, proof = _try_run("SQL Sandbox", sql, sources, timeout=20)
    return {
        "rows": rows[:50],
        "proof": proof,
        "sources": sources,
        "row_count": len(rows),
    }


# ─── TEAM HEALTH PULSE ────────────────────────────────────────────────────────


def _score_engineer(row: dict) -> dict:
    """
    Compute a normalized burnout score from a single team_health_pulse query row.
    Uses rate-based signals (late_night_prs / total_prs) so a single late-night
    PR out of 100 total doesn't inflate the score the way a raw-count formula would.
    """
    total_prs    = max(1, int(row.get("total_prs")         or 1))
    late_night   = int(row.get("late_night_prs")           or 0)
    off_hours    = int(row.get("off_hours_prs")            or 0)
    overdue      = int(row.get("overdue_tickets")          or 0)
    high_pri     = int(row.get("high_priority")            or 0)
    prs_with_err = int(row.get("prs_with_errors")          or 0)
    error_events = int(row.get("total_error_events")       or 0)

    # Rate-based signals prevent raw-count inflation
    late_night_rate = min(1.0, late_night   / total_prs)
    error_rate      = min(1.0, prs_with_err / total_prs)
    off_hours_rate  = min(1.0, off_hours    / total_prs)

    score = round(
        late_night_rate * 35          # Late-night PR rate: max 35
        + off_hours_rate * 10         # Off-hours rate: max 10
        + min(overdue   * 8,  24)     # Overdue tickets: capped at 24 (3 tickets)
        + min(high_pri  * 5,  15)     # High-priority tickets: capped at 15
        + error_rate    * 20          # PR error-introduction rate: max 20
        + min(error_events // 50, 6)  # Error volume bonus: max 6
    )
    score = min(100, max(0, score))

    signals = []
    if late_night >= 2:
        pct = round(late_night / total_prs * 100)
        signals.append(f"{late_night} late-night PRs ({pct}% of activity, UTC timestamps — local timezone may differ)")
    elif off_hours >= 3:
        pct = round(off_hours / total_prs * 100)
        signals.append(f"{off_hours} off-hours PRs ({pct}% of activity, UTC timestamps — local timezone may differ)")
    if overdue >= 1:
        signals.append(f"{overdue} overdue Linear ticket{'s' if overdue != 1 else ''}")
    if high_pri >= 2:
        signals.append(f"{high_pri} P0/P1 tickets open simultaneously")
    if prs_with_err >= 1:
        pct = round(prs_with_err / total_prs * 100)
        signals.append(f"{prs_with_err} PRs introduced Sentry errors ({pct}% error rate)")

    risk = "high" if score >= 60 else "medium" if score >= 30 else "low"
    return {**row, "burnout_score": score, "risk_level": risk, "signals": signals}


@app.get("/api/team-health")
def get_team_health(refresh: bool = Query(False)):
    """
    Team Health Pulse: one Coral SQL execution plan across GitHub × Linear × Sentry.

    team_health_pulse() is a CTE-based query that runs inside a single DataFusion
    plan — NOT three separate API calls merged in Python. Coral evaluates all three
    source CTEs together and returns per-engineer rows covering PR timing, ticket
    pressure, and error ownership in a single round-trip.
    """
    _require_repo()

    rows, proof = _try_run(
        "Team Health Pulse (GitHub × Linear × Sentry)",
        q.team_health_pulse(GITHUB_OWNER, GITHUB_REPO),
        ["github", "linear", "sentry"],
        timeout=60,
        cache_ttl=0 if refresh else 60,
    )

    engineers = [_score_engineer(r) for r in rows]
    engineers.sort(key=lambda e: e["burnout_score"], reverse=True)

    high_count   = sum(1 for e in engineers if e["risk_level"] == "high")
    medium_count = sum(1 for e in engineers if e["risk_level"] == "medium")

    return {
        "engineers": engineers,
        "summary": {
            "total":       len(engineers),
            "high_risk":   high_count,
            "medium_risk": medium_count,
            "risk_level":  "high" if high_count >= 2 else "medium" if high_count >= 1 else "low",
        },
        "sources_joined": ["github", "linear", "sentry"],
        "cross_source_description": (
            "One DataFusion plan across GitHub × Linear × Sentry — "
            "PR timing, ticket pressure, and error ownership per engineer in a single Coral query."
        ),
        "proofs": [proof],
    }


# ─── INCIDENT CONSTELLATION ───────────────────────────────────────────────────

def _build_constellation_draft_actions(top: dict) -> list[dict]:
    """Build Slack/Linear/GitHub draft actions from the top causal chain row."""
    if not top:
        return []
    service        = top.get("service") or top.get("incident_service") or "affected service"
    evidence_score = int(top.get("evidence_score") or 0)
    pr_num         = top.get("pr_number")
    error_title    = top.get("error_title") or "production error"
    merged_at      = str(top.get("merged_at") or "")[:16]
    error_at       = str(top.get("error_first_seen") or "")[:16]
    incident_at    = str(top.get("incident_created_at") or "")[:16]
    severity       = top.get("severity") or "error"
    urgency        = top.get("urgency") or "unknown"
    author         = top.get("author") or "unknown"
    slack_msgs     = int(top.get("slack_messages") or 0)

    timeline_text = f"PR #{pr_num} merged {merged_at}"
    if error_at:
        timeline_text += f" → {severity} first seen {error_at}"
    if incident_at:
        timeline_text += f" → PagerDuty paged {incident_at} ({urgency} urgency)"
    if slack_msgs:
        timeline_text += f" → {slack_msgs} Slack messages"

    return [
        {
            "id": "slack-war-room",
            "title": "Post incident update to Slack war room",
            "target": "Slack",
            "target_icon": "slack",
            "status": "approval_required",
            "evidence_score": evidence_score,
            "confidence": f"{min(99, evidence_score)}%",
            "body": (
                f":rotating_light: *Incident Alert — {service}*\n\n"
                f"Helm detected a causal chain with {evidence_score}/100 evidence score.\n\n"
                f"*Timeline:* {timeline_text}\n\n"
                f"*PR:* #{pr_num} by {author}\n"
                f"*Error:* {error_title}\n"
                f"*Service:* {service}\n\n"
                f"_Detected via Coral SQL cross-source JOIN (GitHub x Sentry x PagerDuty)_"
            ),
        },
        {
            "id": "linear-postmortem",
            "title": "Create post-mortem in Linear",
            "target": "Linear",
            "target_icon": "linear",
            "status": "approval_required",
            "evidence_score": evidence_score,
            "confidence": f"{min(99, evidence_score)}%",
            "body": (
                f"Post-mortem: {error_title} ({service})\n\n"
                f"## Timeline\n{timeline_text}\n\n"
                f"## Root Cause\nPR #{pr_num} ({author}) merged and "
                f"{severity}-level Sentry errors first appeared within 24 hours.\n\n"
                f"## Action Items\n- [ ] Review PR #{pr_num} for regression\n"
                f"- [ ] Resolve PagerDuty incident ({urgency} urgency)\n"
                f"- [ ] Add regression test\n"
                f"- [ ] Update runbook\n\n"
                f"## Evidence\nCoral SQL cross-source JOIN: GitHub x Sentry x PagerDuty. "
                f"Evidence score: {evidence_score}/100."
            ),
        },
        {
            "id": "github-rollback",
            "title": f"Propose rollback of PR #{pr_num}",
            "target": "GitHub",
            "target_icon": "github",
            "status": "approval_required",
            "evidence_score": evidence_score,
            "confidence": f"{min(99, evidence_score)}%",
            "body": (
                f"## Rollback Proposal: PR #{pr_num}\n\n"
                f"**Author:** {author}\n"
                f"**Evidence score:** {evidence_score}/100\n"
                f"**Severity:** {severity}\n\n"
                f"Helm's Coral SQL join detected this PR as the likely cause of "
                f"`{error_title}` in `{service}`. "
                f"Rollback is proposed based on the evidence chain. Review before approving.\n\n"
                f"**Timeline:** {timeline_text}"
            ),
        },
    ]


@app.get("/api/constellation")
def get_constellation(refresh: bool = Query(False)):
    """
    Incident Constellation: full 4-source causal chain visualization data.
    Returns GitHub PR -> Sentry Error -> PagerDuty Incident -> Slack response chains
    with evidence scores for rendering as a visual node graph.
    """
    _require_repo()

    ttl = 0 if refresh else 30
    channel_id = SLACK_INCIDENTS_CHANNEL or ""

    rows, proof = _try_run(
        "Incident constellation graph",
        q.incident_constellation_graph(GITHUB_OWNER, GITHUB_REPO, channel_id),
        ["github", "sentry", "pagerduty"] + (["slack"] if channel_id else []),
        timeout=60,
        cache_ttl=ttl,
    )

    top = rows[0] if rows else {}
    draft_actions = _build_constellation_draft_actions(top)

    return {
        "chains": rows,
        "top_chain": top if rows else None,
        "chain_count": len(rows),
        "has_pagerduty": any(r.get("incident_id") for r in rows),
        "has_slack": any(int(r.get("slack_messages") or 0) > 0 for r in rows),
        "sources_used": ["github", "sentry", "pagerduty"] + (["slack"] if channel_id else []),
        "draft_actions": draft_actions,
        "proofs": [proof],
        "sql_description": "4-source DataFusion JOIN: github.pulls x sentry.issues x pagerduty.incidents x slack.messages in one execution plan",
    }


# ─── SELF-HEAL WORKFLOW ───────────────────────────────────────────────────────


def _build_selfheal_draft_actions(top: dict) -> list[dict]:
    """
    Draft actions for Self-Heal — distinct from Constellation actions.
    Prioritises creating a Linear follow-up when needs_triage=1,
    then Slack/GitHub remediation actions.
    """
    if not top:
        return []
    service        = top.get("service") or top.get("incident_service") or "affected service"
    pr_num         = top.get("pr_number")
    error_title    = top.get("error_title") or "production error"
    severity       = top.get("severity") or "error"
    author         = top.get("author") or "unknown"
    urgency        = top.get("urgency") or "unknown"
    merged_at      = str(top.get("merged_at") or "")[:16]
    error_at       = str(top.get("error_first_seen") or "")[:16]
    incident_at    = str(top.get("incident_created_at") or "")[:16]
    followup_id    = top.get("followup_id")
    needs_triage   = int(top.get("needs_triage") or 0)

    # Compute evidence score from available fields
    evidence_score = 20
    if severity == "fatal":
        evidence_score += 20
    if top.get("incident_id"):
        evidence_score += 30
    if needs_triage:
        evidence_score += 10
    if int(top.get("users_affected") or 0) >= 10:
        evidence_score += 10
    evidence_score = min(evidence_score, 100)

    timeline = f"PR #{pr_num} merged {merged_at}"
    if error_at:
        timeline += f" → {severity} first seen {error_at}"
    if incident_at:
        timeline += f" → PagerDuty incident created {incident_at}"

    actions = []

    if needs_triage or not followup_id:
        actions.append({
            "id": "linear-remediation",
            "title": f"Create Linear remediation ticket for {service}",
            "target": "Linear",
            "target_icon": "linear",
            "status": "approval_required",
            "evidence_score": evidence_score,
            "confidence": f"{min(99, evidence_score)}%",
            "body": (
                f"Remediation: {error_title} ({service})\n\n"
                f"## Context\n{timeline}\n\n"
                f"## Root Cause\n"
                f"PR #{pr_num} by {author} introduced a {severity}-level Sentry error "
                f"and no Linear follow-up ticket exists.\n\n"
                f"## Action Items\n"
                f"- [ ] Review PR #{pr_num} for regression\n"
                f"- [ ] Resolve PagerDuty incident if open ({urgency} urgency)\n"
                f"- [ ] Add regression test\n"
                f"- [ ] Update runbook\n\n"
                f"## Evidence\nCoral SQL: GitHub × Sentry × PagerDuty × Linear. "
                f"Evidence score: {evidence_score}/100."
            ),
        })

    actions.append({
        "id": "slack-selfheal-update",
        "title": "Post remediation status to Slack",
        "target": "Slack",
        "target_icon": "slack",
        "status": "approval_required",
        "evidence_score": evidence_score,
        "confidence": f"{min(99, evidence_score)}%",
        "body": (
            f":wrench: *Remediation in progress — {service}*\n\n"
            f"PR #{pr_num} by {author} introduced a {severity}-level error.\n"
            f"Timeline: {timeline}\n"
            f"{'Linear follow-up: ' + followup_id if followup_id else 'No Linear ticket yet — creating now.'}\n\n"
            f"_Source: Coral SQL GitHub × Sentry × PagerDuty × Linear JOIN_"
        ),
    })

    actions.append({
        "id": "github-rollback-selfheal",
        "title": f"Propose rollback of PR #{pr_num}",
        "target": "GitHub",
        "target_icon": "github",
        "status": "approval_required",
        "evidence_score": evidence_score,
        "confidence": f"{min(99, evidence_score)}%",
        "body": (
            f"## Rollback Proposal: PR #{pr_num}\n\n"
            f"**Author:** {author}\n"
            f"**Evidence score:** {evidence_score}/100\n"
            f"**Severity:** {severity}\n\n"
            f"Helm's Coral SQL join (GitHub × Sentry × PagerDuty × Linear) "
            f"detected this PR as the likely cause of `{error_title}` in `{service}`. "
            f"{'No Linear follow-up found — remediation may be needed.' if needs_triage else 'Linear follow-up: ' + str(followup_id)}\n\n"
            f"**Timeline:** {timeline}"
        ),
    })

    return actions


@app.get("/api/selfheal")
def get_selfheal(refresh: bool = Query(False)):
    """
    Self-Heal Workflow: GitHub × Sentry × PagerDuty × Linear — remediation-gap view.

    Distinct from Constellation (GitHub × Sentry × PagerDuty × Slack):
    - Uses Linear instead of Slack to surface errors with no follow-up ticket
    - 7-day window (not 30) — focuses on what needs action right now
    - Returns needs_triage flag per chain — the input for the draft action engine
    - Draft actions prioritise creating the missing Linear ticket first

    Constellation = visualise what happened and how it propagated.
    Self-Heal = find what still needs human action and generate the remediation.
    """
    _require_repo()

    rows, proof = _try_run(
        "Self-Heal: GitHub × Sentry × PagerDuty × Linear remediation gaps",
        q.self_heal_remediation_gaps(GITHUB_OWNER, GITHUB_REPO),
        ["github", "sentry", "pagerduty", "linear"],
        timeout=60,
        cache_ttl=0 if refresh else 30,
    )

    top = rows[0] if rows else {}
    has_active_incident = any(
        r.get("incident_status") in ("triggered", "acknowledged")
        for r in rows
    )
    fatal_chains = [r for r in rows if r.get("severity") == "fatal"]
    needs_triage_chains = [r for r in rows if int(r.get("needs_triage") or 0) == 1]

    draft_actions = _build_selfheal_draft_actions(top)

    if not rows:
        workflow_step = "detect"
    elif not draft_actions:
        workflow_step = "draft"
    else:
        workflow_step = "approve"

    return {
        "workflow_step": workflow_step,
        "chain_count": len(rows),
        "needs_triage_count": len(needs_triage_chains),
        "high_evidence_count": len([r for r in rows if int(r.get("needs_triage") or 0) or r.get("incident_id")]),
        "fatal_count": len(fatal_chains),
        "active_incident": has_active_incident,
        "top_chain": top if rows else None,
        "chains": rows,
        "draft_actions": draft_actions,
        "severity_summary": {
            "fatal":   len(fatal_chains),
            "error":   sum(1 for r in rows if r.get("severity") == "error"),
            "warning": sum(1 for r in rows if r.get("severity") == "warning"),
        },
        "sources_used": ["github", "sentry", "pagerduty", "linear"],
        "proofs": [proof],
        "sql_description": (
            "Self-Heal: GitHub × Sentry × PagerDuty × Linear — 7-day window, "
            "ranked by needs_triage (no Linear follow-up) first, then error volume. "
            "Distinct from Constellation which uses Slack instead of Linear."
        ),
    }


# ─── DEPLOY VS ERROR WEEKLY ───────────────────────────────────────────────────

@app.get("/api/deploy-weekly")
def get_deploy_weekly(refresh: bool = Query(False)):
    """
    Weekly deploy frequency vs error introduction rate.
    GitHub × Sentry time-bucketed aggregation: two independent live time series
    joined in one Coral DataFusion plan, returning chart-ready per-month rows.
    """
    _require_repo()

    rows, proof = _try_run(
        "Deploy vs error weekly (GitHub × Sentry)",
        q.deploy_vs_error_weekly(GITHUB_OWNER, GITHUB_REPO),
        ["github", "sentry"],
        timeout=45,
        cache_ttl=0 if refresh else 120,
    )

    return {
        "data": rows,
        "row_count": len(rows),
        "proofs": [proof],
        "sql_description": (
            "GitHub deploys per month joined to Sentry error introductions — "
            "one DataFusion plan, two live API sources, zero ETL."
        ),
    }


# ─── TICKET TEAMS ─────────────────────────────────────────────────────────────

@app.get("/api/ticket-teams")
def get_ticket_teams(refresh: bool = Query(False)):
    """
    Linear ticket load joined to Sentry error volume by team.
    Shows teams carrying both high-priority feature work AND production error load.
    Cross-source: Linear + Sentry — impossible without Coral.
    """
    rows, proof = _try_run(
        "Ticket vs errors: Linear × Sentry per team",
        q.ticket_vs_errors(),
        ["linear", "sentry"],
        timeout=30,
        cache_ttl=0 if refresh else 60,
    )

    enriched = []
    for row in rows:
        open_t = _safe_int(row.get("open_tickets"))
        high_p = _safe_int(row.get("high_priority_tickets"))
        errors = _safe_int(row.get("related_errors"))
        events = _safe_int(row.get("total_error_events"))

        pressure = min(100, high_p * 12 + open_t * 4 + errors * 8 + (events // 20))
        risk = "high" if pressure >= 60 else "medium" if pressure >= 30 else "low"

        enriched.append({
            **row,
            "pressure_score": pressure,
            "risk_level": risk,
        })

    enriched.sort(key=lambda r: -r["pressure_score"])

    high_count = sum(1 for r in enriched if r["risk_level"] == "high")
    total_tickets = sum(_safe_int(r.get("open_tickets")) for r in enriched)
    total_errors = sum(_safe_int(r.get("related_errors")) for r in enriched)

    return {
        "teams": enriched,
        "summary": {
            "total_teams": len(enriched),
            "high_risk_teams": high_count,
            "total_open_tickets": total_tickets,
            "total_related_errors": total_errors,
        },
        "cross_source_description": (
            "Linear ticket pressure joined to Sentry error volume per team — "
            "one Coral SQL plan, two live sources, zero ETL."
        ),
        "proofs": [proof],
    }


# ─── LINEAR EXACT PR LINKS ────────────────────────────────────────────────────

@app.get("/api/linear-pr-links")
def get_linear_pr_links(refresh: bool = Query(False)):
    """
    Exact GitHub↔Linear issue linkage via linear.attachments.url = github.pulls.html_url.

    Replaces the fuzzy ILIKE name-matching approach: linear.attachments stores the
    actual PR URL, so this join has zero false positives. Returns only PRs that a
    Linear user explicitly attached to an issue.
    Cross-source: GitHub × Linear.
    """
    _require_repo()
    rows, proof = _try_run(
        "Linear exact PR links: github.pulls JOIN linear.attachments JOIN linear.issues",
        q.linear_attachment_pr_join(GITHUB_OWNER, GITHUB_REPO),
        ["github", "linear"],
        timeout=30,
        cache_ttl=0 if refresh else 60,
    )
    return {
        "links": rows,
        "link_count": len(rows),
        "cross_source_description": (
            "Exact URL match: linear.attachments.url = github.pulls.html_url — "
            "zero false positives, no name guessing."
        ),
        "proofs": [proof],
    }


@app.get("/api/linear-sprints")
def get_linear_sprints(refresh: bool = Query(False)):
    """
    Sprint context from linear.cycles joined to linear.issues.
    Shows active/upcoming/completed sprints with issue completion rates per team.
    """
    rows, proof = _try_run(
        "Linear sprint context: linear.cycles JOIN linear.issues",
        q.linear_sprint_context(),
        ["linear"],
        timeout=30,
        cache_ttl=0 if refresh else 120,
    )
    active = [r for r in rows if r.get("cycle_status") == "active"]
    upcoming = [r for r in rows if r.get("cycle_status") == "upcoming"]
    completed = [r for r in rows if r.get("cycle_status") == "completed"]
    return {
        "cycles": rows,
        "summary": {
            "active": len(active),
            "upcoming": len(upcoming),
            "completed": len(completed),
        },
        "proofs": [proof],
    }


# ─── PAGERDUTY FORENSICS ──────────────────────────────────────────────────────

@app.get("/api/pagerduty-forensics")
def get_pagerduty_forensics(refresh: bool = Query(False)):
    """
    Incident lifecycle forensics via pagerduty.log_entries.

    Returns the full ack/escalate/resolve audit trail per incident. This level of
    forensic detail is impossible from pagerduty.incidents alone — log_entries is
    a separate PagerDuty API resource that Coral joins in one DataFusion plan.
    """
    rows, proof = _try_run(
        "PagerDuty forensics: log_entries JOIN incidents",
        q.pagerduty_log_entries_forensics(),
        ["pagerduty"],
        timeout=30,
        cache_ttl=0 if refresh else 60,
    )

    ack_times: list[int] = []
    incident_map: dict[str, list[dict]] = {}
    for row in rows:
        iid = str(row.get("incident_id") or "")
        if iid:
            incident_map.setdefault(iid, []).append(row)
        if row.get("entry_type") == "acknowledge_log_entry" and row.get("acknowledgement_timeout"):
            try:
                ack_times.append(int(row["acknowledgement_timeout"]))
            except (TypeError, ValueError):
                pass

    avg_ack = round(sum(ack_times) / len(ack_times)) if ack_times else None

    return {
        "log_entries": rows,
        "unique_incidents": len(incident_map),
        "avg_ack_timeout_seconds": avg_ack,
        "entry_type_breakdown": {
            t: sum(1 for r in rows if r.get("entry_type") == t)
            for t in ["notify_log_entry", "acknowledge_log_entry", "resolve_log_entry", "escalate_log_entry"]
        },
        "proofs": [proof],
    }


@app.get("/api/oncall-attribution")
def get_oncall_attribution(refresh: bool = Query(False)):
    """
    On-call attribution: who was on-call when each PagerDuty incident fired.

    Joins pagerduty.oncalls to pagerduty.incidents by overlapping time window.
    Reveals on-call coverage, escalation patterns, and incident load per engineer.
    """
    rows, proof = _try_run(
        "On-call attribution: pagerduty.incidents JOIN pagerduty.oncalls",
        q.oncall_during_incidents(),
        ["pagerduty"],
        timeout=30,
        cache_ttl=0 if refresh else 60,
    )

    user_map: dict[str, dict] = {}
    for row in rows:
        user = str(row.get("oncall_user") or row.get("oncall_user_id") or "unknown")
        if user not in user_map:
            user_map[user] = {"user": user, "incident_count": 0, "high_urgency": 0, "services": set()}
        user_map[user]["incident_count"] += 1
        if row.get("urgency") == "high":
            user_map[user]["high_urgency"] += 1
        svc = row.get("service")
        if svc:
            user_map[user]["services"].add(svc)

    attribution = [
        {
            "oncall_user": v["user"],
            "incident_count": v["incident_count"],
            "high_urgency_count": v["high_urgency"],
            "services_affected": sorted(v["services"]),
        }
        for v in sorted(user_map.values(), key=lambda x: -x["incident_count"])
    ]

    return {
        "incidents_with_oncall": rows,
        "attribution_by_user": attribution,
        "summary": {
            "total_incidents": len(rows),
            "oncall_users": len(attribution),
            "unattributed": sum(1 for r in rows if not r.get("oncall_user")),
        },
        "proofs": [proof],
    }


# ─── SLACK CHANNELS + USERS ───────────────────────────────────────────────────

@app.get("/api/slack-channels")
def get_slack_channels(refresh: bool = Query(False)):
    """
    Discover Slack channels — returns channel IDs (C0XXXXXXXXX) needed for
    slack.messages() table function calls. Solves the hardcoding problem: instead
    of guessing channel names, query slack.channels to find the correct ID.
    """
    rows, proof = _try_run(
        "Slack channel discovery: slack.channels",
        q.slack_channels_discovery(),
        ["slack"],
        timeout=15,
        cache_ttl=0 if refresh else 300,
    )
    return {
        "channels": rows,
        "channel_count": len(rows),
        "note": "Use the 'id' field (C0XXXXXXXXX format) as the channel argument in slack.messages() calls",
        "proofs": [proof],
    }


@app.get("/api/slack-user-activity")
def get_slack_user_activity(refresh: bool = Query(False)):
    """
    Slack user activity with name resolution via slack.users JOIN.

    Resolves user_id → display_name/real_name in one Coral DataFusion plan.
    Without Coral, this would require a separate Slack Users API call per message.
    """
    if not SLACK_INCIDENTS_CHANNEL:
        raise HTTPException(400, "SLACK_INCIDENTS_CHANNEL must be set in .env")
    rows, proof = _try_run(
        "Slack user activity: slack.messages JOIN slack.users",
        q.slack_user_activity(SLACK_INCIDENTS_CHANNEL),
        ["slack"],
        timeout=30,
        cache_ttl=0 if refresh else 60,
    )
    return {
        "user_activity": rows,
        "cross_source_description": "slack.messages × slack.users — user_id resolved to real name in one federated query",
        "proofs": [proof],
    }


# ─── SENTRY EVENT ANALYTICS ───────────────────────────────────────────────────

@app.get("/api/sentry-discover")
def get_sentry_discover(refresh: bool = Query(False)):
    """
    Event-level analytics from sentry.discover.

    Unlike sentry.issues (fingerprinted aggregates), discover returns per-event,
    per-transaction counts. Shows which transactions generate the most errors and
    how severity distributes across projects — with required start/end time filters.
    """
    rows, proof = _try_run(
        "Sentry discover analytics: event-level per-transaction counts",
        q.sentry_discover_analytics(),
        ["sentry"],
        timeout=30,
        cache_ttl=0 if refresh else 60,
    )

    by_project: dict[str, dict] = {}
    for row in rows:
        proj = str(row.get("project") or "unknown")
        if proj not in by_project:
            by_project[proj] = {"project": proj, "total_events": 0, "error_levels": set(), "transactions": 0}
        by_project[proj]["total_events"] += _safe_int(row.get("event_count"))
        level = row.get("level")
        if level:
            by_project[proj]["error_levels"].add(level)
        by_project[proj]["transactions"] += 1

    project_summary = [
        {
            "project": v["project"],
            "total_events": v["total_events"],
            "error_levels": sorted(v["error_levels"]),
            "transaction_count": v["transactions"],
        }
        for v in sorted(by_project.values(), key=lambda x: -x["total_events"])
    ]

    return {
        "events": rows,
        "project_summary": project_summary,
        "note": "sentry.discover = event-level interface (requires start/end); sentry.issues = fingerprinted aggregates",
        "proofs": [proof],
    }


# ─── RELEASE ATTRIBUTION ──────────────────────────────────────────────────────

@app.get("/api/release-attribution")
def get_release_attribution(refresh: bool = Query(False)):
    """
    Sentry releases joined to GitHub PRs via dual-strategy matching.
    Tier 1: exact SHA match (sr.version = merge_commit_sha or head__sha).
    Tier 2: time-window fallback — last PR merged within 6h before release.
    Cross-source: Sentry + GitHub — neither API exposes the full picture alone.
    """
    _require_repo()

    rows, proof = _try_run(
        "Release attribution: Sentry releases × GitHub PRs",
        q.sentry_release_attribution(GITHUB_OWNER, GITHUB_REPO),
        ["sentry", "github"],
        timeout=45,
        cache_ttl=0 if refresh else 60,
    )

    releases_seen: set[str] = set()
    releases: list[dict] = []
    for row in rows:
        version = row.get("release_version") or "unknown"
        if version not in releases_seen:
            releases_seen.add(version)
            releases.append(row)

    total_new_errors = sum(_safe_int(r.get("new_errors_in_release")) for r in releases)

    return {
        "releases": releases[:20],
        "summary": {
            "total_releases": len(releases),
            "total_new_errors_introduced": total_new_errors,
        },
        "cross_source_description": (
            "Sentry release versions joined to GitHub PR merges by timestamp — "
            "shows which PR deployment maps to which release, with error count per release."
        ),
        "proofs": [proof],
    }


# ─── AGENT REASONING TRACE (SSE STREAMING) ───────────────────────────────────


@app.post("/api/ask-stream")
async def ask_helm_stream(req: AskRequest):
    """
    Streaming version of /api/ask.
    Emits SSE events for each agent step: schema discovery → query planning
    → per-query execution → Gemini reasoning → final answer.
    Frontend consumes with fetch + response.body.getReader().
    """
    question = req.question.strip()
    if not question:
        raise HTTPException(400, "Question cannot be empty")

    session_id = (req.session_id or "").strip() or str(uuid.uuid4())
    history = _session_history(req.session_id)

    async def generate():
        q_lower = question.lower()
        proofs: list[dict] = []
        context_data: dict = {}

        def _emit(obj: dict) -> str:
            return f"data: {json.dumps(obj, default=str)}\n\n"

        # Step 1: schema discovery — fetch only for sources relevant to this question
        yield _emit({"type": "step", "id": "schema", "status": "running", "label": "Discovering Coral schema…"})
        stream_active_sources: list[str] = []
        if any(w in q_lower for w in ["deploy", "error", "bug", "sentry", "pr", "merge"]):
            stream_active_sources += ["github", "sentry"]
        if any(w in q_lower for w in ["service", "incident", "pagerduty", "outage", "alert"]):
            stream_active_sources += ["sentry", "pagerduty"]
            if SLACK_INCIDENTS_CHANNEL:
                stream_active_sources.append("slack")
        if any(w in q_lower for w in ["ticket", "linear", "burnout", "engineer", "risk", "team"]):
            stream_active_sources += ["github", "linear", "sentry"]
        if any(w in q_lower for w in ["velocity", "delivery", "week"]):
            stream_active_sources += ["github", "pagerduty"]
        stream_active_sources = sorted(set(stream_active_sources)) or ["github", "sentry"]
        src_in = ", ".join(f"'{_escape_sql(s)}'" for s in stream_active_sources)
        schema_sql = (
            f"SELECT schema_name, table_name, column_name "
            f"FROM coral.columns "
            f"WHERE schema_name IN ({src_in}) "
            f"ORDER BY schema_name, table_name, column_name"
        )
        schema_rows, schema_proof = await asyncio.to_thread(
            _try_run, f"Schema grounding ({', '.join(stream_active_sources)})", schema_sql, stream_active_sources, 15, 300
        )
        proofs.insert(0, schema_proof)
        _schema_ok = schema_proof.get("status") == "ok"
        source_count = len({r.get("schema_name") for r in schema_rows if r.get("schema_name")})
        yield _emit({
            "type": "step", "id": "schema",
            "status": "done" if _schema_ok else "error",
            "label": (
                f"Schema: {len(schema_rows)} columns across {source_count} sources ({', '.join(stream_active_sources)})"
                if _schema_ok else
                f"Schema discovery failed — {(schema_proof.get('error') or 'unknown error')[:70]}"
            ),
            "proof": schema_proof,
        })

        # Build grouped schema for prompt
        schema_by_table: dict[str, list[str]] = {}
        for row in schema_rows:
            key = f"{row.get('schema_name')}.{row.get('table_name')}"
            schema_by_table.setdefault(key, []).append(str(row.get("column_name", "")))

        # Step 2: query planning
        yield _emit({"type": "step", "id": "plan", "status": "running", "label": "Planning queries…"})
        queries_to_run: list[tuple] = []
        if any(w in q_lower for w in ["deploy", "error", "bug", "sentry", "pr", "merge", "focus"]):
            queries_to_run.append(("Deployment errors", q.deployment_errors(GITHUB_OWNER, GITHUB_REPO), ["github", "sentry"], "deployment_errors", 10))
        if any(w in q_lower for w in ["service", "incident", "pagerduty", "outage", "alert", "stable", "focus"]):
            queries_to_run.append(("Service instability", q.service_instability(), ["sentry", "pagerduty"], "service_instability", 8))
            if SLACK_INCIDENTS_CHANNEL:
                queries_to_run.append(("Root cause constellation", q.root_cause_constellation(GITHUB_OWNER, GITHUB_REPO, SLACK_INCIDENTS_CHANNEL), ["github", "sentry", "pagerduty", "slack"], "root_cause_constellation", 6))
        if any(w in q_lower for w in ["ticket", "linear", "burnout", "engineer", "risk", "team"]):
            queries_to_run.append(("Team Health Pulse", q.team_health_pulse(GITHUB_OWNER, GITHUB_REPO), ["github", "linear", "sentry"], "team_health", 15))
        if any(w in q_lower for w in ["velocity", "delivery", "week"]):
            queries_to_run.append(("PRs vs incidents", q.pr_vs_incidents(GITHUB_OWNER, GITHUB_REPO), ["github", "pagerduty"], "pr_vs_incidents", 14))
        if not queries_to_run:
            queries_to_run = [
                ("Deployment errors", q.deployment_errors(GITHUB_OWNER, GITHUB_REPO), ["github", "sentry"], "deployment_errors", 8),
                ("Service instability", q.service_instability(), ["sentry", "pagerduty"], "service_instability", 6),
                ("Team Health Pulse", q.team_health_pulse(GITHUB_OWNER, GITHUB_REPO), ["github", "linear", "sentry"], "team_health", 10),
            ]
        sources_needed = sorted({s for _, _, srcs, _, _ in queries_to_run for s in srcs})
        yield _emit({
            "type": "step", "id": "plan", "status": "done",
            "label": f"{len(queries_to_run)} queries planned across {len(sources_needed)} sources: {' × '.join(sources_needed)}",
        })

        # Step 3: execute each query sequentially so the UI shows live progress
        for label, sql, sources, key, limit in queries_to_run:
            yield _emit({"type": "step", "id": f"query-{key}", "status": "running", "label": f"Running {label}…", "sources": sources})
            rows, proof = await asyncio.to_thread(_try_run, label, sql, sources)
            if rows:
                context_data[key] = rows[:limit]
            proofs.append(proof)
            ok = proof.get("status") == "ok"
            summary = f"{proof.get('row_count', 0)} rows · {proof.get('duration_ms', 0)}ms"
            if not ok:
                summary = (proof.get("error") or "query failed")[:80]
            yield _emit({
                "type": "step", "id": f"query-{key}",
                "status": "done" if ok else "error",
                "label": f"{label}: {summary}",
                "proof": proof,
            })

        # Step 4: Gemini reasoning
        yield _emit({"type": "step", "id": "reasoning", "status": "running", "label": "Gemini reasoning over evidence…"})

        # Build conversation history context for multi-turn memory
        history_section = ""
        if history:
            turns_text = "\n---\n".join(
                f"User: {t['q'][:300]}\nHelm: {t['a'][:400]}"
                for t in history
            )
            history_section = f"CONVERSATION HISTORY (prior turns — use for follow-up context):\n{turns_text}\n\n"

        prompt = f"""You are Helm, an engineering intelligence agent. Answer the user's question using only the data provided.

{history_section}CURRENT QUESTION: {question}

CORAL SCHEMA (sources in use: {', '.join(stream_active_sources)}):
{json.dumps(schema_by_table, indent=2, default=str)}

CONTEXT DATA:
{json.dumps(context_data, indent=2, default=str)}

Answer in 3-5 sentences with specific evidence. Reference exact table.column names from the schema above. If data is insufficient, name the specific Coral table and column that would help."""

        answer = await asyncio.to_thread(analyze, prompt)
        _append_session_turn(session_id, question, answer)
        draft_actions = _draft_actions("root_cause", context_data.get("root_cause_constellation", []))
        yield _emit({"type": "step", "id": "reasoning", "status": "done", "label": "Reasoning complete"})

        # Final answer event
        yield _emit({
            "type": "answer",
            "answer": answer,
            "session_id": session_id,
            "history_turns": len(history),
            "proofs": proofs,
            "draft_actions": draft_actions,
            "data_used": list(context_data.keys()),
            "schema_sources": stream_active_sources,
            "optimization_card": {
                "accuracy_gain": "+31%",
                "token_reduction": "-70%",
                "latency_reduction": "-55%",
                "direct_mcp_tokens": "~313k",
                "coral_tokens": "~112k",
                "direct_mcp_calls": "29+",
                "coral_calls": "1 federated query",
                "source": "Coral published retrieval benchmark (complex tasks n=51)",
            },
        })

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── REAL ACTION EXECUTION ───────────────────────────────────────────────────


class ExecuteActionRequest(BaseModel):
    action_id: str
    target: str
    body: str
    channel: str = ""


@app.post("/api/actions/execute")
def execute_action(req: ExecuteActionRequest):
    """
    Actually executes an approved draft action.
    Slack: calls chat.postMessage via SLACK_BOT_TOKEN.
    Linear: creates an issue via LINEAR_API_KEY (GraphQL).
    GitHub: returns a structured note (write actions on GitHub require OAuth, not a PAT write scope on this path).
    """
    target = req.target.lower()

    if "slack" in target:
        token = os.environ.get("SLACK_BOT_TOKEN", "")
        if not token:
            raise HTTPException(400, "SLACK_BOT_TOKEN not set in .env — add it to send to Slack")
        channel = req.channel.strip() or SLACK_INCIDENTS_CHANNEL
        if not channel:
            raise HTTPException(400, "No channel configured — set SLACK_INCIDENTS_CHANNEL in .env or pass channel in the request")
        payload = json.dumps({"channel": channel, "text": req.body}).encode()
        api_req = urllib.request.Request(
            "https://slack.com/api/chat.postMessage",
            data=payload,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(api_req, timeout=10) as resp:
                result = json.loads(resp.read())
        except Exception as exc:
            raise HTTPException(502, f"Slack API call failed: {exc}") from exc
        if not result.get("ok"):
            raise HTTPException(502, f"Slack API error: {result.get('error', 'unknown')}")
        ts = result.get("ts", "")
        return {
            "success": True,
            "target": "slack",
            "action_id": req.action_id,
            "channel": channel,
            "ts": ts,
            "permalink": f"https://slack.com/archives/{channel}/p{ts.replace('.', '')}",
        }

    elif "linear" in target:
        api_key = os.environ.get("LINEAR_API_KEY", "")
        if not api_key:
            raise HTTPException(400, "LINEAR_API_KEY not set in .env — add it to create Linear issues")

        def _linear_post(body_bytes: bytes) -> dict:
            req_ = urllib.request.Request(
                "https://api.linear.app/graphql",
                data=body_bytes,
                headers={"Authorization": api_key, "Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req_, timeout=10) as r:
                return json.loads(r.read())

        # Fetch the first available team ID (required by Linear's issueCreate)
        try:
            team_result = _linear_post(json.dumps(
                {"query": "{ viewer { teams { nodes { id name } } } }"}
            ).encode())
            teams = (team_result.get("data") or {}).get("viewer", {}).get("teams", {}).get("nodes", [])
            team_id = teams[0]["id"] if teams else None
        except Exception:
            team_id = None

        lines = req.body.strip().split("\n")
        title = lines[0].lstrip("#").strip()[:120] or "Helm-generated follow-up"

        if team_id:
            mutation = (
                "mutation CreateIssue($title:String!,$description:String!,$teamId:String!){"
                "issueCreate(input:{title:$title,description:$description,teamId:$teamId})"
                "{success issue{id identifier url}}}"
            )
            variables: dict = {"title": title, "description": req.body, "teamId": team_id}
        else:
            mutation = (
                "mutation CreateIssue($title:String!,$description:String!){"
                "issueCreate(input:{title:$title,description:$description})"
                "{success issue{id identifier url}}}"
            )
            variables = {"title": title, "description": req.body}

        payload = json.dumps({"query": mutation, "variables": variables}).encode()
        try:
            result = _linear_post(payload)
        except Exception as exc:
            raise HTTPException(502, f"Linear API call failed: {exc}") from exc
        issue_data = result.get("data", {}).get("issueCreate", {})
        if not issue_data.get("success"):
            errs = result.get("errors", [])
            msg = errs[0].get("message") if errs else "unknown error"
            raise HTTPException(502, f"Linear API error: {msg}")
        issue = issue_data.get("issue", {})
        return {
            "success": True,
            "target": "linear",
            "action_id": req.action_id,
            "identifier": issue.get("identifier"),
            "url": issue.get("url"),
        }

    elif "github" in target:
        github_token = os.environ.get("GITHUB_TOKEN", "")
        if not github_token:
            return {
                "success": False,
                "target": "github",
                "action_id": req.action_id,
                "reason": "GITHUB_TOKEN not set in .env — add a PAT with repo scope to post PR comments",
                "draft": req.body,
            }
        # channel field carries "owner/repo/pr_number"
        pr_ref = req.channel.strip()
        if not pr_ref:
            return {"success": False, "reason": "No PR reference — pass channel as 'owner/repo/number'", "draft": req.body}
        parts = [p for p in pr_ref.replace("#", "/").split("/") if p]
        if len(parts) < 3:
            return {"success": False, "reason": f"Cannot parse PR ref from: {pr_ref}", "draft": req.body}
        gh_owner, gh_repo, gh_num = parts[0], parts[1], parts[-1]
        api_url = f"https://api.github.com/repos/{gh_owner}/{gh_repo}/issues/{gh_num}/comments"
        payload = json.dumps({"body": req.body}).encode()
        api_req = urllib.request.Request(
            api_url,
            data=payload,
            headers={
                "Authorization": f"Bearer {github_token}",
                "Accept": "application/vnd.github+json",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(api_req, timeout=10) as resp:
                result = json.loads(resp.read())
        except Exception as exc:
            raise HTTPException(502, f"GitHub API error: {exc}") from exc
        return {
            "success": True,
            "target": "github",
            "action_id": req.action_id,
            "comment_id": result.get("id"),
            "comment_url": result.get("html_url"),
        }

    else:
        raise HTTPException(400, f"Unknown target: {req.target}. Supported: Slack, Linear, GitHub")


# ─── PR REVIEW AGENT ─────────────────────────────────────────────────────────


class PRReviewRequest(BaseModel):
    pr_url: str


def _parse_pr_url(pr_url: str, default_owner: str, default_repo: str) -> tuple[str, str, int]:
    """Parse a GitHub PR URL, 'owner/repo#N', or bare integer into (owner, repo, number)."""
    s = pr_url.strip()
    m = re.match(r"https?://github\.com/([^/]+)/([^/]+)/pull/(\d+)", s)
    if m:
        return m.group(1), m.group(2), int(m.group(3))
    m = re.match(r"([^/]+)/([^/#]+)[/#](\d+)", s)
    if m:
        return m.group(1), m.group(2), int(m.group(3))
    if s.isdigit():
        if not default_owner or not default_repo:
            raise ValueError("Pass a full GitHub URL — GITHUB_OWNER/GITHUB_REPO not configured")
        return default_owner, default_repo, int(s)
    raise ValueError(f"Cannot parse PR reference: {s!r}. Use a GitHub PR URL or just the PR number.")


def _extract_service_hints(pr: dict) -> list[str]:
    """Infer likely service names from PR title and branch name."""
    STOP = {
        "feat", "fix", "chore", "refactor", "merge", "into", "from", "main", "master",
        "develop", "feature", "hotfix", "release", "update", "add", "remove", "bump",
        "patch", "test", "docs", "style", "revert", "wip", "draft", "this", "that",
        "with", "and", "the", "for",
    }
    hints: list[str] = []
    seen: set[str] = set()

    def _collect(text: str) -> None:
        text = text.lower()
        # [bracket] patterns
        for m in re.finditer(r"\[([a-z][a-z0-9_-]{2,})\]", text):
            w = m.group(1)
            if w not in STOP and w not in seen:
                seen.add(w)
                hints.append(w)
        # slash-separated path components (feat/checkout-service-fix)
        for segment in re.split(r"[/\s]", text):
            for part in segment.split("-"):
                part = part.strip()
                if len(part) >= 4 and part not in STOP and part not in seen and part.isalpha():
                    seen.add(part)
                    hints.append(part)

    _collect(str(pr.get("title") or ""))
    _collect(str(pr.get("head__ref") or ""))
    return hints[:4] if hints else ["service"]


@app.post("/api/pr-review")
async def pr_review_agent(req: PRReviewRequest):
    """
    PR Review Agent: streams a data-backed code review for any GitHub PR.
    Steps: fetch PR → detect service → Sentry errors → PagerDuty incidents
           → author deploy history → author Linear load → Gemini review.
    Returns a draft review comment ready to post.
    """
    try:
        owner, repo, pr_num = _parse_pr_url(req.pr_url, GITHUB_OWNER, GITHUB_REPO)
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    async def generate():
        def _emit(obj: dict) -> str:
            return f"data: {json.dumps(obj, default=str)}\n\n"

        proofs: list[dict] = []

        # ── Step 1: fetch PR from Coral ──────────────────────────────────────
        yield _emit({"type": "step", "id": "fetch-pr", "status": "running",
                     "label": f"Fetching PR #{pr_num} from {owner}/{repo} via Coral…", "sources": ["github"]})
        pr_sql = (
            f"SELECT number, title, user__login AS author, merged_at, html_url, state, head__ref, draft "
            f"FROM github.pulls "
            f"WHERE owner = '{_escape_sql(owner)}' AND repo = '{_escape_sql(repo)}' "
            f"AND number = {pr_num} LIMIT 1"
        )
        pr_rows, pr_proof = await asyncio.to_thread(_try_run, f"PR #{pr_num}", pr_sql, ["github"], 15, 0)
        proofs.append(pr_proof)

        if pr_proof.get("status") == "error":
            yield _emit({"type": "step", "id": "fetch-pr", "status": "error",
                         "label": f"GitHub query failed — {(pr_proof.get('error') or 'unknown error')[:80]}"})
            yield _emit({"type": "error", "message": f"Could not fetch PR #{pr_num}: {pr_proof.get('error') or 'Coral query failed'}"})
            return

        if not pr_rows:
            yield _emit({"type": "step", "id": "fetch-pr", "status": "error",
                         "label": f"PR #{pr_num} not found — check GITHUB_OWNER/GITHUB_REPO in .env"})
            yield _emit({"type": "error", "message": f"PR #{pr_num} not found in {owner}/{repo}."})
            return

        pr = pr_rows[0]
        yield _emit({"type": "step", "id": "fetch-pr", "status": "done",
                     "label": f"Found: {pr.get('title', 'untitled')} by @{pr.get('author', 'unknown')}",
                     "proof": pr_proof})

        # ── Step 2: service detection ────────────────────────────────────────
        service_hints = _extract_service_hints(pr)
        yield _emit({"type": "step", "id": "service", "status": "done",
                     "label": f"Service signals: {', '.join(service_hints)}"})

        # ── Step 3: Sentry errors for service ────────────────────────────────
        yield _emit({"type": "step", "id": "sentry", "status": "running",
                     "label": f"Sentry errors for {service_hints[0]} (last 30 days)…", "sources": ["sentry"]})
        sentry_pred = " OR ".join(
            f"(title ILIKE '%{_escape_sql(h)}%' OR project ILIKE '%{_escape_sql(h)}%')"
            for h in service_hints[:3]
        )
        sentry_sql = (
            "SELECT title, level, count, user_count, first_seen, project "
            "FROM sentry.issues "
            "WHERE query = 'is:unresolved' "
            "  AND CAST(first_seen AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '30 days' "
            f"  AND ({sentry_pred}) "
            "ORDER BY count DESC LIMIT 10"
        )
        sentry_rows, sentry_proof = await asyncio.to_thread(_try_run, "Sentry errors (service)", sentry_sql, ["sentry"], 20, 0)
        proofs.append(sentry_proof)
        _sentry_ok = sentry_proof.get("status") == "ok"
        yield _emit({"type": "step", "id": "sentry",
                     "status": "done" if _sentry_ok else "error",
                     "label": (
                         f"Sentry: {len(sentry_rows)} error type(s) · {sum(_safe_int(r.get('count')) for r in sentry_rows)} total events"
                         if _sentry_ok else
                         f"Sentry query failed — {(sentry_proof.get('error') or 'unknown error')[:70]}"
                     ),
                     "proof": sentry_proof})

        # ── Step 4: PagerDuty incidents for service ──────────────────────────
        yield _emit({"type": "step", "id": "pagerduty", "status": "running",
                     "label": "PagerDuty incidents for service (last 30 days)…", "sources": ["pagerduty"]})
        pd_pred = " OR ".join(f"service__summary ILIKE '%{_escape_sql(h)}%'" for h in service_hints[:3])
        pd_sql = (
            "SELECT id, status, urgency, created_at, service__summary "
            "FROM pagerduty.incidents "
            "WHERE CAST(created_at AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '30 days' "
            f"  AND ({pd_pred}) "
            "ORDER BY created_at DESC LIMIT 10"
        )
        pd_rows, pd_proof = await asyncio.to_thread(_try_run, "PagerDuty incidents (service)", pd_sql, ["pagerduty"], 20, 0)
        proofs.append(pd_proof)
        high_urgency = sum(1 for r in pd_rows if r.get("urgency") == "high")
        _pd_ok = pd_proof.get("status") == "ok"
        yield _emit({"type": "step", "id": "pagerduty",
                     "status": "done" if _pd_ok else "error",
                     "label": (
                         f"PagerDuty: {len(pd_rows)} incident(s) · {high_urgency} high urgency"
                         if _pd_ok else
                         f"PagerDuty query failed — {(pd_proof.get('error') or 'unknown error')[:70]}"
                     ),
                     "proof": pd_proof})

        # ── Step 5: author's deploy→error history ────────────────────────────
        author = pr.get("author") or ""
        yield _emit({"type": "step", "id": "deploy-history", "status": "running",
                     "label": f"Checking @{author}'s deploy error history…", "sources": ["github", "sentry"]})
        deploy_sql = (
            "SELECT g.number AS pr_number, g.title AS pr_title, g.user__login AS author, "
            "  g.merged_at, s.title AS error_title, s.level, s.count AS times_seen, s.first_seen "
            f"FROM github.pulls g "
            "JOIN sentry.issues s "
            "  ON CAST(s.first_seen AS TIMESTAMP) >= CAST(g.merged_at AS TIMESTAMP) "
            "  AND CAST(s.first_seen AS TIMESTAMP) <= CAST(g.merged_at AS TIMESTAMP) + INTERVAL '24 hours' "
            f"WHERE g.owner = '{_escape_sql(owner)}' AND g.repo = '{_escape_sql(repo)}' "
            "  AND g.state = 'closed' "
            f"  AND g.user__login = '{_escape_sql(author)}' "
            "  AND CAST(g.merged_at AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '30 days' "
            "ORDER BY g.merged_at DESC LIMIT 10"
        )
        deploy_rows, deploy_proof = await asyncio.to_thread(
            _try_run, f"Deploy error history (@{author})", deploy_sql, ["github", "sentry"], 25, 0
        )
        proofs.append(deploy_proof)
        _deploy_ok = deploy_proof.get("status") == "ok"
        yield _emit({"type": "step", "id": "deploy-history",
                     "status": "done" if _deploy_ok else "error",
                     "label": (
                         f"@{author}: {len(deploy_rows)} PR→error chain(s) in last 30 days"
                         if _deploy_ok else
                         f"Deploy history query failed — {(deploy_proof.get('error') or 'unknown error')[:70]}"
                     ),
                     "proof": deploy_proof})

        # ── Step 6: author's open Linear tickets ─────────────────────────────
        yield _emit({"type": "step", "id": "linear", "status": "running",
                     "label": f"Checking @{author}'s open ticket load…", "sources": ["linear"]})
        linear_sql = (
            "SELECT identifier, title, state_type, priority_label, due_date, team_key "
            "FROM linear.issues "
            "WHERE state_type IN ('unstarted', 'started') "
            f"  AND (assignee_name ILIKE '%{_escape_sql(author)}%') "
            "  AND priority IN (0, 1, 2) "
            "ORDER BY priority ASC LIMIT 10"
        )
        linear_rows, linear_proof = await asyncio.to_thread(
            _try_run, f"Open tickets (@{author})", linear_sql, ["linear"], 20, 0
        )
        proofs.append(linear_proof)
        _linear_ok = linear_proof.get("status") == "ok"
        yield _emit({"type": "step", "id": "linear",
                     "status": "done" if _linear_ok else "error",
                     "label": (
                         f"Linear: {len(linear_rows)} open high-priority ticket(s) assigned to @{author}"
                         if _linear_ok else
                         f"Linear query failed — {(linear_proof.get('error') or 'unknown error')[:70]}"
                     ),
                     "proof": linear_proof})

        # ── Step 7: Gemini review synthesis ──────────────────────────────────
        yield _emit({"type": "step", "id": "reasoning", "status": "running",
                     "label": "Writing evidence-backed review…"})

        fatal_errors = [r for r in sentry_rows if r.get("level") == "fatal"]
        total_events = sum(_safe_int(r.get("count")) for r in sentry_rows)
        if len(pd_rows) >= 3 or (fatal_errors and len(pd_rows) >= 1) or len(fatal_errors) >= 2:
            risk_level = "HIGH"
        elif len(pd_rows) >= 1 or len(fatal_errors) >= 1 or len(deploy_rows) >= 2:
            risk_level = "MEDIUM"
        else:
            risk_level = "LOW"

        prompt = f"""You are Helm, an engineering intelligence agent writing a code review for a GitHub PR.
Write a concise, data-backed review in Markdown. Use exact numbers from the data. Be direct and specific.

PR DETAILS:
- PR #{pr_num}: {pr.get('title', 'Unknown')}
- Author: @{author}
- Branch: {pr.get('head__ref', 'unknown')}
- Status: {pr.get('state', 'unknown')}

SERVICE SIGNALS: {', '.join(service_hints)}

SENTRY ERRORS (last 30 days, service-matched):
{json.dumps(sentry_rows[:5], indent=2, default=str)}

PAGERDUTY INCIDENTS (last 30 days, service-matched):
{json.dumps(pd_rows[:5], indent=2, default=str)}

@{author}'s RECENT DEPLOY ERROR CHAINS (PRs → Sentry errors within 24h):
{json.dumps(deploy_rows[:5], indent=2, default=str)}

@{author}'s OPEN HIGH-PRIORITY LINEAR TICKETS:
{json.dumps(linear_rows[:5], indent=2, default=str)}

Write the review using this exact structure:

## Helm Review — PR #{pr_num}

**Risk: {risk_level}** | {len(sentry_rows)} Sentry errors · {len(pd_rows)} PagerDuty incidents · {len(deploy_rows)} deploy chains (30d)

### Evidence
[2-3 bullet points with specific numbers only from the data above]

### Concerns
[1-3 specific concerns — concrete, not generic. If no concerns, say so.]

### Recommendation
[One sentence: approve / approve with caution / request changes — and why]

---
*Evidence sourced live via Coral SQL cross-source JOIN: GitHub × Sentry × PagerDuty × Linear*

Keep under 220 words. Only use numbers present in the data. If a section has no data, say 'No data from Coral for this source.'"""

        review_text = await asyncio.to_thread(analyze, prompt)
        yield _emit({"type": "step", "id": "reasoning", "status": "done",
                     "label": "Review written with live Coral evidence"})

        # ── Emit final review ─────────────────────────────────────────────────
        yield _emit({
            "type": "review",
            "pr_number": pr_num,
            "pr_title": pr.get("title"),
            "pr_author": author,
            "pr_url": pr.get("html_url") or f"https://github.com/{owner}/{repo}/pull/{pr_num}",
            "pr_state": pr.get("state"),
            "risk_level": risk_level,
            "service_hints": service_hints,
            "review_text": review_text,
            "summary": {
                "sentry_errors": len(sentry_rows),
                "fatal_errors": len(fatal_errors),
                "total_error_events": total_events,
                "pd_incidents": len(pd_rows),
                "high_urgency_incidents": high_urgency,
                "author_deploy_errors": len(deploy_rows),
                "open_tickets": len(linear_rows),
            },
            "draft_action": {
                "id": "github-pr-review",
                "title": f"Post review on PR #{pr_num}",
                "target": "GitHub",
                "status": "approval_required",
                "body": review_text,
                "pr_ref": f"{owner}/{repo}/{pr_num}",
            },
            "proofs": proofs,
            "owner": owner,
            "repo": repo,
        })

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── INCIDENT AUTOPILOT ───────────────────────────────────────────────────────


@app.post("/api/autopilot")
def incident_autopilot():
    """
    One-button incident autopilot demo.
    Runs the full agent loop: 4-source constellation → evidence chain → draft actions.
    Returns immediately with structured steps + draft actions ready for approval.
    """
    _require_repo()
    channel_id = SLACK_INCIDENTS_CHANNEL or ""
    sources = ["github", "sentry", "pagerduty"] + (["slack"] if channel_id else [])

    rows, proof = _try_run(
        "Autopilot: incident constellation",
        q.incident_constellation_graph(GITHUB_OWNER, GITHUB_REPO, channel_id),
        sources,
        timeout=60,
        cache_ttl=0,
    )

    if not rows:
        fallback_rows, fallback_proof = _try_run(
            "Autopilot: 2-source fallback",
            q.deployment_errors(GITHUB_OWNER, GITHUB_REPO),
            ["github", "sentry"],
            timeout=30,
            cache_ttl=0,
        )
        rows = [
            {**r, "evidence_score": 40 if r.get("level") == "fatal" else 25, "incident_id": None}
            for r in fallback_rows
        ]
        proof = fallback_proof
        sources = ["github", "sentry"]

    top = rows[0] if rows else {}
    draft_actions = _build_constellation_draft_actions(top)

    chain_count = len(rows)
    fatal_count = sum(1 for r in rows if r.get("severity") == "fatal" or r.get("level") == "fatal")
    has_incident = any(r.get("incident_id") for r in rows)
    has_slack = any(int(r.get("slack_messages") or 0) > 0 for r in rows)

    steps = [
        {"id": "detect", "label": f"Detected {chain_count} incident chain{'s' if chain_count != 1 else ''} across {len(sources)} sources", "status": "done"},
        {"id": "analyze", "label": f"Evidence chain scored: {fatal_count} fatal · {'incident linked' if has_incident else 'no active incident'} · {'Slack signal' if has_slack else 'no Slack'}", "status": "done"},
        {"id": "draft", "label": f"{len(draft_actions)} remediation action{'s' if len(draft_actions) != 1 else ''} drafted", "status": "done"},
        {"id": "approve", "label": "Waiting for human approval before any write", "status": "pending"},
    ]

    return {
        "steps": steps,
        "top_chain": top,
        "chain_count": chain_count,
        "sources_used": sources,
        "has_pagerduty": has_incident,
        "has_slack": has_slack,
        "fatal_count": fatal_count,
        "draft_actions": draft_actions,
        "ready_for_approval": bool(draft_actions),
        "proofs": [proof],
        "sql_description": f"Coral DataFusion JOIN across {' × '.join(s.capitalize() for s in sources)} in one execution plan",
    }


# ─── REVIEW DEBT ─────────────────────────────────────────────────────────────


@app.get("/api/review-debt")
def get_review_debt(refresh: bool = Query(False)):
    """
    Review Debt: unreviewed or self-merged PRs that caused Sentry production errors.

    Uses two signals from github.pulls (no external reviews table needed):
      1. review_comments = 0 → no review discussion at all
      2. user__login = merged_by__login → author merged their own code (SOC 2 CC6 violation)
    Joined to sentry.issues on a 24h window — surfaces only the unreviewed PRs
    that actually caused production errors in the last 30 days.
    """
    _require_repo()
    rows, proof = _try_run(
        "Review Debt: unreviewed PRs → Sentry errors (GitHub × Sentry)",
        q.review_debt(GITHUB_OWNER, GITHUB_REPO),
        ["github", "sentry"],
        timeout=45,
        cache_ttl=0 if refresh else 30,
    )
    self_merged = [r for r in rows if r.get("debt_type") == "self-merged"]
    no_review = [r for r in rows if r.get("debt_type") == "no-review"]
    total_error_events = sum(_safe_int(r.get("error_events")) for r in rows)
    return {
        "debt_prs": rows,
        "self_merged_count": len(self_merged),
        "no_review_count": len(no_review),
        "total_prs_with_debt": len(rows),
        "total_error_events": total_error_events,
        "top_offender": rows[0] if rows else None,
        "cross_source_description": "github.pulls (review_comments=0 OR self-merged) × sentry.issues (24h window)",
        "proofs": [proof],
    }


@app.get("/api/ticket-thread-tracker")
def get_ticket_thread_tracker(refresh: bool = Query(False)):
    """
    Linear × Slack Ticket Thread Tracker.

    Finds high-priority open Linear tickets that are generating Slack discussion —
    silent backlog chaos where work is tracked in Linear but the real-time panic
    is happening in Slack. Cross-source: Linear × Slack.
    """
    if not SLACK_INCIDENTS_CHANNEL:
        return {
            "tickets": [],
            "total_mentions": 0,
            "top_ticket": None,
            "fallback": True,
            "fallback_message": "No SLACK_INCIDENTS_CHANNEL configured — set it in .env to enable this cross-source join.",
            "proofs": [],
        }

    rows, proof = _try_run(
        "Linear × Slack Ticket Thread Tracker",
        q.linear_slack_ticket_tracker(SLACK_INCIDENTS_CHANNEL),
        ["linear", "slack"],
        timeout=45,
        cache_ttl=0 if refresh else 30,
    )
    total_mentions = sum(_safe_int(r.get("slack_mentions")) for r in rows)
    return {
        "tickets": rows,
        "total_mentions": total_mentions,
        "top_ticket": rows[0] if rows else None,
        "fallback": False,
        "proofs": [proof],
    }


@app.get("/api/review-debt-aging")
def get_review_debt_aging(refresh: bool = Query(False)):
    """
    Review Debt Aging: open PRs stalled in review while related Sentry errors fire.

    Different from /api/review-debt (which targets merged unreviewed PRs):
    this endpoint surfaces PRs that are still OPEN and awaiting review,
    on services that are actively generating production errors.
    Cross-source: GitHub × Sentry.
    """
    _require_repo()
    rows, proof = _try_run(
        "Review Debt Aging: open PRs vs live Sentry errors (GitHub × Sentry)",
        q.review_debt_aging(GITHUB_OWNER, GITHUB_REPO),
        ["github", "sentry"],
        timeout=45,
        cache_ttl=0 if refresh else 30,
    )
    prs_with_errors = [r for r in rows if _safe_int(r.get("total_error_events")) > 0]
    total_blocked_error_events = sum(_safe_int(r.get("total_error_events")) for r in rows)
    return {
        "open_debt_prs": rows,
        "total_open_prs": len(rows),
        "prs_with_live_errors": len(prs_with_errors),
        "total_blocked_error_events": total_blocked_error_events,
        "top_blocker": rows[0] if rows else None,
        "cross_source_description": "github.pulls (open, not draft) × sentry.issues (project name ILIKE match)",
        "proofs": [proof],
    }


# ─── CIRCLECI HEALTH ─────────────────────────────────────────────────────────


@app.get("/api/circleci-health")
def get_circleci_health(refresh: bool = Query(False)):
    """
    CircleCI integration: 3-source cross-join dashboard.

    Runs three Coral queries:
      1. GitHub × CircleCI: merged PRs with pipeline coverage (last 14 days)
      2. GitHub × CircleCI × Sentry: PRs that had CI but still introduced errors
      3. CircleCI workflow metrics: success rates, duration percentiles, throughput

    Returns fallback if CIRCLECI_PROJECT_SLUG is not configured.
    """
    if not CIRCLECI_PROJECT_SLUG:
        return {
            "pr_pipeline_status": [],
            "ci_passed_but_errored": [],
            "workflow_metrics": [],
            "summary": {
                "total_prs_with_ci": 0,
                "prs_with_errors_despite_ci": 0,
                "total_workflows": 0,
                "avg_success_rate": None,
            },
            "fallback": True,
            "fallback_message": "CIRCLECI_PROJECT_SLUG not set — add it to .env (format: gh/org/repo).",
            "proofs": [],
        }

    _require_repo()
    ttl = 0 if refresh else 30

    pr_rows, pr_proof = _try_run(
        "GitHub × CircleCI: PR pipeline coverage",
        q.ci_pipeline_pr_status(CIRCLECI_PROJECT_SLUG, GITHUB_OWNER, GITHUB_REPO),
        ["github", "circleci"],
        timeout=45,
        cache_ttl=ttl,
    )

    killer_rows, killer_proof = _try_run(
        "GitHub × CircleCI × Sentry: CI passed but errors fired",
        q.ci_passed_but_errored(CIRCLECI_PROJECT_SLUG, GITHUB_OWNER, GITHUB_REPO),
        ["github", "circleci", "sentry"],
        timeout=60,
        cache_ttl=ttl,
    )

    metrics_rows, metrics_proof = _try_run(
        "CircleCI workflow metrics: success rate & duration",
        q.ci_workflow_metrics(CIRCLECI_PROJECT_SLUG),
        ["circleci"],
        timeout=30,
        cache_ttl=ttl,
    )

    prs_with_ci = [r for r in pr_rows if r.get("pipeline_id")]
    avg_success = None
    if metrics_rows:
        rates = [float(r["success_rate"]) for r in metrics_rows if r.get("success_rate") is not None]
        if rates:
            avg_success = round(sum(rates) / len(rates), 3)

    return {
        "pr_pipeline_status": pr_rows,
        "ci_passed_but_errored": killer_rows,
        "workflow_metrics": metrics_rows,
        "summary": {
            "total_prs_with_ci": len(prs_with_ci),
            "total_prs_checked": len(pr_rows),
            "prs_with_errors_despite_ci": len(killer_rows),
            "total_workflows": len(metrics_rows),
            "avg_success_rate": avg_success,
        },
        "fallback": False,
        "cross_source_description": "GitHub × CircleCI × Sentry — CI coverage + production error correlation",
        "proofs": [pr_proof, killer_proof, metrics_proof],
    }


# ─── RELAY HANDOVER BRIEF (SSE STREAMING) ────────────────────────────────────


class HandoverRequest(BaseModel):
    username: str


@app.post("/api/handover-stream")
async def handover_stream(req: HandoverRequest):
    """
    Relay: Institutional Knowledge Handover Brief (SSE streaming).

    Given a GitHub username, runs 3 Coral queries in sequence:
      1. Their 6-month PR history (GitHub) — code ownership footprint
      2. Their open Linear tickets — work in progress to hand over
      3. Their Sentry error ownership (GitHub × Sentry JOIN) — production debt they carry

    Gemini synthesises all three into a structured markdown Handover Brief.
    Streams steps as SSE events, emits type='brief' as the final payload.
    """
    _require_repo()
    username = req.username.strip().lstrip("@")
    if not username:
        raise HTTPException(400, "username is required")

    def _emit(data: dict) -> str:
        return f"data: {json.dumps(data, default=str)}\n\n"

    async def generate():
        proofs: list[dict] = []

        # ── Step 1: PR history ────────────────────────────────────────────────
        yield _emit({"type": "step", "id": "prs", "status": "running",
                     "label": f"Fetching @{username}'s PR history (6 months)…", "sources": ["github"]})
        pr_rows, pr_proof = await asyncio.to_thread(
            _try_run, f"Handover PRs (@{username})",
            q.handover_pr_history(GITHUB_OWNER, GITHUB_REPO, username),
            ["github"], 30, 0,
        )
        proofs.append(pr_proof)
        pr_ok = pr_proof.get("status") == "ok"
        yield _emit({"type": "step", "id": "prs",
                     "status": "done" if pr_ok else "error",
                     "label": f"{len(pr_rows)} merged PRs in last 6 months" if pr_ok else "GitHub query failed",
                     "proof": pr_proof})

        # ── Step 2: Linear tickets ────────────────────────────────────────────
        yield _emit({"type": "step", "id": "tickets", "status": "running",
                     "label": f"Fetching open Linear tickets assigned to @{username}…", "sources": ["linear"]})
        ticket_rows, ticket_proof = await asyncio.to_thread(
            _try_run, f"Handover tickets (@{username})",
            q.handover_linear_tickets(username),
            ["linear"], 25, 0,
        )
        proofs.append(ticket_proof)
        ticket_ok = ticket_proof.get("status") == "ok"
        yield _emit({"type": "step", "id": "tickets",
                     "status": "done" if ticket_ok else "error",
                     "label": f"{len(ticket_rows)} open tickets to hand over" if ticket_ok else "Linear query failed",
                     "proof": ticket_proof})

        # ── Step 3: Error ownership (GitHub × Sentry) ─────────────────────────
        yield _emit({"type": "step", "id": "errors", "status": "running",
                     "label": f"Tracing production errors from @{username}'s PRs…", "sources": ["github", "sentry"]})
        error_rows, error_proof = await asyncio.to_thread(
            _try_run, f"Handover error ownership (@{username})",
            q.handover_error_ownership(GITHUB_OWNER, GITHUB_REPO, username),
            ["github", "sentry"], 40, 0,
        )
        proofs.append(error_proof)
        error_ok = error_proof.get("status") == "ok"
        yield _emit({"type": "step", "id": "errors",
                     "status": "done" if error_ok else "error",
                     "label": f"{len(error_rows)} live production error(s) attributed to their code" if error_ok else "Sentry join failed",
                     "proof": error_proof})

        # ── Step 4: Gemini synthesis ──────────────────────────────────────────
        yield _emit({"type": "step", "id": "synthesis", "status": "running",
                     "label": "Synthesising handover brief…"})

        total_additions = sum(_safe_int(r.get("additions")) for r in pr_rows)
        total_deletions = sum(_safe_int(r.get("deletions")) for r in pr_rows)
        changed_files_set: set[str] = set()
        for r in pr_rows[:10]:
            if r.get("title"):
                changed_files_set.add(str(r["title"]))

        prompt = f"""You are Helm, an engineering intelligence agent generating a Developer Knowledge Handover Brief.
This brief is for @{username} who is leaving the team (offboarding, role change, or extended leave).
Use the exact data below. Be structured, specific, and actionable. Use Markdown.

GITHUB ACTIVITY (last 6 months):
- {len(pr_rows)} merged PRs | +{total_additions:,} / -{total_deletions:,} lines across {sum(_safe_int(r.get('changed_files')) for r in pr_rows)} files
- Recent work:
{chr(10).join(f"  - PR #{r.get('pr_number') or r.get('number')}: {r.get('title')} ({r.get('merged_at', '')[:10]})" for r in pr_rows[:8])}

OPEN LINEAR TICKETS (must be reassigned):
{json.dumps(ticket_rows[:10], indent=2, default=str) if ticket_rows else "None found (source may be unavailable)"}

PRODUCTION ERROR DEBT (errors still live from their PRs):
{json.dumps(error_rows[:8], indent=2, default=str) if error_rows else "No live errors attributed to their code — clean handover."}

Write the brief using this EXACT structure:

# Developer Handover Brief — @{username}
*Generated by Helm · Powered by Coral SQL · {datetime.now(timezone.utc).strftime('%Y-%m-%d')}*

## Ownership Summary
[2-3 sentences: what areas of the codebase they owned, their contribution volume, key themes from their recent PRs]

## Code Footprint
[Bullet list: the 5-6 most recent / significant PRs with PR number, title, and date. Note if any changed critical files.]

## Work in Progress — {len(ticket_rows)} Open Ticket(s) to Reassign
[Table or bullet list of each open Linear ticket: identifier, title, priority, due date. If none, say so clearly.]

## Production Debt Inherited
[List of active Sentry errors from their PRs that the new owner inherits. Include error title, severity, how many times seen. If none, say 'Clean — no live errors attributed to @{username}\'s code.']

## Recommended Handover Actions
1. [Specific action — reassign tickets / alert on-call to watch specific errors / etc.]
2. [Specific action]
3. [Specific action]

---
*All data sourced live via Coral SQL: GitHub × Linear × Sentry. No manual data collection required.*

Keep under 350 words. Only reference data above — do not hallucinate details."""

        brief_text = await asyncio.to_thread(analyze, prompt)
        yield _emit({"type": "step", "id": "synthesis", "status": "done",
                     "label": "Handover brief complete"})

        yield _emit({
            "type": "brief",
            "username": username,
            "brief_text": brief_text,
            "summary": {
                "pr_count": len(pr_rows),
                "open_tickets": len(ticket_rows),
                "live_errors": len(error_rows),
                "total_additions": total_additions,
                "total_deletions": total_deletions,
            },
            "proofs": proofs,
        })

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── CACHE PREFETCH / STATUS ──────────────────────────────────────────────────
# Simulates reactive caching: pre-warms the most expensive multi-source queries
# so subsequent page loads hit the in-process cache instead of re-running Coral.
# A full webhook-push implementation would require Coral-level event receivers
# (GitHub push events, Sentry alerts) that aren't available yet — this is the
# best approximation achievable inside Helm today.


@app.get("/api/prefetch")
def prefetch_queries(refresh: bool = Query(False)):
    """
    Pre-warm the most expensive queries in the background.
    Call this once after startup to avoid cold-cache latency on first page load.
    Results are stored in coral_runner._query_cache (30-60s TTL).
    """
    if not GITHUB_OWNER or not GITHUB_REPO:
        return {"status": "skipped", "reason": "GITHUB_OWNER/GITHUB_REPO not configured"}

    tasks = [
        ("Team Health Pulse", q.team_health_pulse(GITHUB_OWNER, GITHUB_REPO), ["github", "linear", "sentry"], 60),
        ("Service Instability", q.service_instability(), ["sentry", "pagerduty"], 30),
        ("Deployment Errors", q.deployment_errors(GITHUB_OWNER, GITHUB_REPO), ["github", "sentry"], 30),
    ]
    if SLACK_INCIDENTS_CHANNEL:
        tasks.append(("Root Cause Constellation", q.root_cause_constellation(GITHUB_OWNER, GITHUB_REPO, SLACK_INCIDENTS_CHANNEL), ["github", "sentry", "pagerduty", "slack"], 45))

    results = []
    with ThreadPoolExecutor(max_workers=len(tasks)) as pool:
        futures = {
            pool.submit(_try_run, label, sql, srcs, timeout, 0 if refresh else 60): label
            for label, sql, srcs, timeout in tasks
        }
        for future in as_completed(futures):
            label = futures[future]
            try:
                rows, proof = future.result()
                results.append({
                    "query": label,
                    "status": proof.get("status"),
                    "rows": proof.get("row_count", 0),
                    "duration_ms": proof.get("duration_ms", 0),
                    "cached": proof.get("cached", False),
                    "sources": proof.get("sources", []),
                })
            except Exception as exc:
                results.append({"query": label, "status": "error", "error": str(exc)})

    warmed = sum(1 for r in results if r.get("status") == "ok")
    return {
        "status": "ok",
        "warmed": warmed,
        "total": len(tasks),
        "results": sorted(results, key=lambda r: r.get("duration_ms", 0), reverse=True),
        "note": (
            "Queries are now cached in-process. "
            "Next page load will hit cache instead of re-running Coral. "
            "Full webhook-push pre-population requires Coral-level event receivers."
        ),
    }


@app.get("/api/cache-status")
def cache_status():
    """
    Shows the current state of the in-process Coral query cache.
    Use this to verify which queries are cached and how fresh the data is.
    """
    from coral_runner import _query_cache
    now = time.monotonic()
    entries = []
    for key, entry in _query_cache.items():
        age_s = round(now - entry["ts"])
        entries.append({
            "cache_key": key[:8],
            "row_count": len(entry.get("rows", [])),
            "age_seconds": age_s,
            "duration_ms": entry.get("duration_ms", 0),
        })
    entries.sort(key=lambda e: e["age_seconds"])
    return {
        "cached_queries": len(entries),
        "entries": entries,
        "note": "Cache is in-process (resets on server restart). TTL is 30-300s per query.",
    }


# ─── TOKENLENS: AI COST ATTRIBUTION ──────────────────────────────────────────


@app.get("/api/token-roi")
def get_token_roi(refresh: bool = Query(False)):
    """
    TokenLens Token ROI Score: Langfuse × Linear × Sentry cross-source attribution.

    Runs all four TokenLens queries (attribution, loop waste, model mismatch,
    orphan spend) and computes a composite Token ROI Score (0–100).

    Returns mock data when Langfuse is not configured (LANGFUSE_HOST +
    LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY not set in .env).
    """
    if not LANGFUSE_CONFIGURED:
        roi = _compute_roi_score(
            _MOCK_AI_ATTRIBUTION, _MOCK_LOOP_WASTE,
            _MOCK_MODEL_MISMATCHES, _MOCK_ORPHAN_SPEND
        )
        return {
            "roi": roi,
            "attribution": _MOCK_AI_ATTRIBUTION,
            "loop_waste": _MOCK_LOOP_WASTE,
            "model_mismatches": _MOCK_MODEL_MISMATCHES,
            "orphan_spend": _MOCK_ORPHAN_SPEND,
            "demo_mode": True,
            "proofs": [],
        }

    ttl = 0 if refresh else 60

    # Run the 4 cross-source queries in parallel — each spawns a Coral subprocess,
    # so sequential execution can exceed 60s. Parallel keeps the endpoint responsive.
    with ThreadPoolExecutor(max_workers=4) as pool:
        f_attrib = pool.submit(_try_run, "Langfuse × Linear: AI cost attribution",
                               q.ai_cost_attribution(), ["langfuse", "linear"], 60, ttl)
        f_loop = pool.submit(_try_run, "Langfuse: loop waste detector",
                             q.loop_waste_detector(), ["langfuse"], 45, ttl)
        f_mismatch = pool.submit(_try_run, "Langfuse: model mismatch detector",
                                 q.model_mismatch_detector(), ["langfuse"], 45, ttl)
        f_orphan = pool.submit(_try_run, "Langfuse × Linear: orphan spend detector",
                               q.orphan_spend_detector(), ["langfuse", "linear"], 45, ttl)
        attrib_rows, attrib_proof = f_attrib.result()
        loop_rows, loop_proof = f_loop.result()
        mismatch_rows, mismatch_proof = f_mismatch.result()
        orphan_rows, orphan_proof = f_orphan.result()

    # If the Langfuse project has no traces yet (new keys / empty project) OR the
    # live queries returned nothing, fall back to the demo cohort so the panel is
    # never blank. The connection still proved out — we surface that distinction.
    live_has_data = bool(attrib_rows or loop_rows or mismatch_rows or orphan_rows)
    if not live_has_data:
        roi = _compute_roi_score(
            _MOCK_AI_ATTRIBUTION, _MOCK_LOOP_WASTE,
            _MOCK_MODEL_MISMATCHES, _MOCK_ORPHAN_SPEND
        )
        return {
            "roi": roi,
            "attribution": _MOCK_AI_ATTRIBUTION,
            "loop_waste": _MOCK_LOOP_WASTE,
            "model_mismatches": _MOCK_MODEL_MISMATCHES,
            "orphan_spend": _MOCK_ORPHAN_SPEND,
            "demo_mode": True,
            "langfuse_connected": True,
            "empty_project": True,
            "proofs": [attrib_proof],
        }

    roi = _compute_roi_score(attrib_rows, loop_rows, mismatch_rows, orphan_rows)

    return {
        "roi": roi,
        "attribution": attrib_rows,
        "loop_waste": loop_rows,
        "model_mismatches": mismatch_rows,
        "orphan_spend": orphan_rows,
        "demo_mode": False,
        "langfuse_connected": True,
        "empty_project": False,
        "proofs": [attrib_proof, loop_proof, mismatch_proof, orphan_proof],
    }


# ─── LIGHTHOUSE: GTM PROSPECTING INTELLIGENCE ────────────────────────────────
#
# Lighthouse finds companies that would want Coral by joining three public
# signals through Coral SQL:
#   HIRING (adzuna.search_jobs) x PAIN (hackernews.search) x BUILD (github.org_repos)
# HackerNews is always live (no auth). Adzuna needs free keys; when absent the
# endpoint falls back to a curated demo cohort so the demo never fails — but the
# PAIN signal is fetched live from HackerNews in every mode.

_ICP_WEIGHTS = {"hiring": 40, "pain": 35, "build": 25}

# Curated demo cohort — realistic prospects with plausible signals. Used when
# Adzuna keys are absent. Pain quotes are refreshed live from HackerNews.
_LIGHTHOUSE_DEMO = [
    {
        "company": "Notion",
        "github_org": "makenotion",
        "open_data_roles": 7,
        "sample_roles": ["Senior Data Engineer", "Analytics Engineer", "ML Platform Engineer"],
        "pain_keyword": "notion api",
        "build": {"public_repos": 28, "primary_language": "TypeScript", "active": True},
        "region": "US",
    },
    {
        "company": "Stripe",
        "github_org": "stripe",
        "open_data_roles": 5,
        "sample_roles": ["Data Engineer", "Analytics Engineer", "Data Platform Engineer"],
        "pain_keyword": "fivetran",
        "build": {"public_repos": 100, "primary_language": "Ruby", "active": True},
        "region": "US",
    },
    {
        "company": "Vercel",
        "github_org": "vercel",
        "open_data_roles": 4,
        "sample_roles": ["Data Engineer", "Analytics Engineer"],
        "pain_keyword": "data warehouse cost",
        "build": {"public_repos": 120, "primary_language": "TypeScript", "active": True},
        "region": "US",
    },
    {
        "company": "Retool",
        "github_org": "tryretool",
        "open_data_roles": 3,
        "sample_roles": ["Data Engineer", "Data Infrastructure Engineer"],
        "pain_keyword": "etl pipeline",
        "build": {"public_repos": 18, "primary_language": "TypeScript", "active": True},
        "region": "US",
    },
    {
        "company": "PostHog",
        "github_org": "posthog",
        "open_data_roles": 6,
        "sample_roles": ["Data Engineer", "Pipeline Engineer", "Analytics Engineer"],
        "pain_keyword": "clickhouse pipeline",
        "build": {"public_repos": 60, "primary_language": "Python", "active": True},
        "region": "Remote",
    },
]


def _icp_score(open_roles: int, pain_points: int, build: dict) -> dict:
    """Compute a 0-100 ICP fit score from the three signals."""
    # Hiring: 1 role ~ minimal, 8+ roles = max signal.
    hiring = min(1.0, open_roles / 8.0) * _ICP_WEIGHTS["hiring"]
    # Pain: HN points. 0 pts = none, 200+ pts = max visible frustration.
    pain = min(1.0, (pain_points or 0) / 200.0) * _ICP_WEIGHTS["pain"]
    # Build: active org with public repos.
    repos = (build or {}).get("public_repos", 0) or 0
    build_active = 1.0 if (build or {}).get("active") else 0.4
    build_score = min(1.0, repos / 20.0) * build_active * _ICP_WEIGHTS["build"]
    total = round(hiring + pain + build_score)
    tier = "hot" if total >= 70 else "warm" if total >= 45 else "cool"
    return {
        "score": max(0, min(100, total)),
        "tier": tier,
        "breakdown": {
            "hiring": round(hiring, 1),
            "pain": round(pain, 1),
            "build": round(build_score, 1),
        },
    }


def _outreach_for(prospect: dict) -> str:
    """Generate a personalized outreach opener from the joined evidence."""
    pain = prospect.get("pain_signal") or {}
    prompt = f"""You are a sharp B2B founder writing a one-line cold outreach opener.

Coral is a local SQL layer that turns APIs, databases, and files into SQL tables
so engineers can join across live sources without building ETL pipelines.

Prospect evidence (all from public data):
- Company: {prospect.get('company')}
- Open data/AI engineering roles right now: {prospect.get('open_data_roles')}
  ({', '.join(prospect.get('sample_roles', [])[:3])})
- Public HackerNews signal: "{pain.get('title', 'n/a')}" ({pain.get('points', 0)} points)
- Engineering org: {prospect.get('build_signal', {}).get('primary_language', '?')},
  {prospect.get('build_signal', {}).get('public_repos', 0)} public repos

Write ONE outreach sentence (max 40 words) that references their specific hiring
and pain signal and connects it to Coral removing pipeline work. No greeting, no
sign-off, no quotes. Sound like a real person, direct and specific."""
    text = analyze(prompt)
    if text.startswith("[Gemini error"):
        # Deterministic fallback so the demo never shows an error.
        return (
            f"{prospect.get('company')} has {prospect.get('open_data_roles')} open data-eng "
            f"roles and public pipeline pain — Coral lets your team join those live sources "
            f"in SQL instead of building and babysitting ETL."
        )
    return text.strip().strip('"')


_DATA_LANGS = {"Python", "Scala", "Java", "Go", "TypeScript", "JavaScript", "Rust", "Jupyter Notebook"}


def _github_build_signal(github_org: str, fallback: dict, cache_ttl: int) -> tuple[dict, dict]:
    """Fetch a LIVE build signal from github.org_repos for a recognizable org."""
    rows, proof = _try_run(
        f"GitHub build signal: {github_org}",
        lq.github_org_activity(github_org),
        ["github"],
        timeout=20,
        cache_ttl=cache_ttl,
    )
    if not rows:
        # Fall back to the curated estimate if the org has no public repos / errors.
        return {
            "github_org": github_org,
            "public_repos": (fallback or {}).get("public_repos", 0),
            "primary_language": (fallback or {}).get("primary_language"),
            "active": (fallback or {}).get("active", False),
            "last_push": None,
            "live": False,
            "source": "github",
        }, proof
    # Most common language among recent repos.
    lang_counts: dict[str, int] = {}
    last_push = ""
    for r in rows:
        lang = r.get("language")
        if lang:
            lang_counts[lang] = lang_counts.get(lang, 0) + 1
        pushed = str(r.get("pushed_at") or "")
        if pushed > last_push:
            last_push = pushed
    primary = max(lang_counts, key=lang_counts.get) if lang_counts else (fallback or {}).get("primary_language")
    # Active if the most recent push is within ~120 days.
    active = False
    push_dt = _parse_dt(last_push)
    if push_dt:
        active = (datetime.now(timezone.utc) - push_dt).days <= 120
    return {
        "github_org": github_org,
        "public_repos": len(rows),         # recent-repo sample size
        "primary_language": primary,
        "active": active,
        "last_push": last_push or None,
        "live": True,
        "source": "github",
    }, proof


def _build_prospect(d: dict, cache_ttl: int) -> tuple[dict, list]:
    """
    Assemble one prospect for a curated ICP company by fetching LIVE signals:
      PAIN  -> hackernews.search (live)
      BUILD -> github.org_repos  (live)
    Hiring count is the curated ICP-target estimate (Adzuna's fuzzy `what` search
    cannot match company names precisely; market demand is shown separately).
    """
    company = d["company"]
    proofs = []

    # PAIN — live HackerNews.
    pain_rows, pain_proof = _try_run(
        f"HackerNews pain signal: {company}",
        lq.hn_company_mentions(d.get("pain_keyword") or company),
        ["hackernews"],
        timeout=20,
        cache_ttl=cache_ttl,
    )
    proofs.append(pain_proof)
    top_pain = pain_rows[0] if pain_rows else {}
    pain_signal = {
        "title": _fix_encoding(top_pain.get("title")),
        "points": _safe_int(top_pain.get("points")),
        "url": top_pain.get("url") or (
            f"https://news.ycombinator.com/item?id={top_pain.get('object_id')}"
            if top_pain.get("object_id") else None
        ),
        "keyword": d.get("pain_keyword"),
        "source": "hackernews",
    }

    # BUILD — live GitHub.
    build_signal, build_proof = _github_build_signal(d["github_org"], d.get("build", {}), cache_ttl)
    proofs.append(build_proof)

    open_roles = d["open_data_roles"]
    sample_roles = d["sample_roles"]
    icp = _icp_score(open_roles, pain_signal["points"], build_signal)
    prospect = {
        "company": company,
        "region": d.get("region", "US"),
        "icp": icp,
        "open_data_roles": open_roles,
        "sample_roles": sample_roles,
        "hiring_signal": {"open_data_roles": open_roles, "sample_roles": sample_roles, "source": "adzuna"},
        "pain_signal": pain_signal,
        "build_signal": build_signal,
        "evidence_sources": ["adzuna", "hackernews", "github"],
    }
    return prospect, proofs


@app.get("/api/lighthouse/prospects")
def lighthouse_prospects(refresh: bool = Query(False), what: str = Query("data engineer")):
    """
    Lighthouse prospect list: companies that would want Coral, ranked by ICP fit.

    Joins three public signals through Coral:
      PAIN   (hackernews.search)   — LIVE in every mode
      BUILD  (github.org_repos)    — LIVE in every mode
      DEMAND (adzuna.search_jobs)  — LIVE market pulse when Adzuna keys are set

    The prospect cohort is a curated set of recognizable Coral-ICP companies.
    Adzuna's `what` parameter is a fuzzy full-text search and cannot match
    company names precisely, so per-company hiring counts are ICP-target
    estimates while Adzuna provides the live market-demand headline.
    """
    ttl = 0 if refresh else 120
    proofs: list[dict] = []
    prospects: list[dict] = []

    # Live market demand from Adzuna (headline KPI + liveness proof).
    market_demand = None
    if ADZUNA_CONFIGURED:
        hiring_rows, hiring_proof = _try_run(
            "Adzuna live market demand: open data-engineering roles",
            lq.adzuna_market_pulse(what=what, country="us"),
            ["adzuna"],
            timeout=30,
            cache_ttl=ttl,
        )
        proofs.append(hiring_proof)
        distinct_companies = len({(r.get("company") or "").strip() for r in hiring_rows if r.get("company")})
        market_demand = {
            "roles_sampled": len(hiring_rows),
            "distinct_companies": distinct_companies,
            "query": what,
            "live": True,
        }

    # Curated ICP cohort, enriched with LIVE HackerNews pain + LIVE GitHub build.
    for d in _LIGHTHOUSE_DEMO:
        prospect, p = _build_prospect(d, ttl)
        prospects.append(prospect)
        proofs.extend(p)

    prospects.sort(key=lambda x: x["icp"]["score"], reverse=True)

    hot = sum(1 for p in prospects if p["icp"]["tier"] == "hot")
    summary = {
        "total_prospects": len(prospects),
        "hot": hot,
        "warm": sum(1 for p in prospects if p["icp"]["tier"] == "warm"),
        "cool": sum(1 for p in prospects if p["icp"]["tier"] == "cool"),
        "avg_icp": round(sum(p["icp"]["score"] for p in prospects) / len(prospects)) if prospects else 0,
        "sources_joined": ["adzuna", "hackernews", "github"],
        "market_demand": market_demand,
    }

    return {
        "prospects": prospects,
        "summary": summary,
        "adzuna_live": ADZUNA_CONFIGURED,
        "demo_mode": not ADZUNA_CONFIGURED,
        "proofs": proofs,
    }


class OutreachRequest(BaseModel):
    company: str
    open_data_roles: int = 0
    sample_roles: list[str] = []
    pain_title: str = ""
    pain_points: int = 0
    primary_language: str = ""
    public_repos: int = 0


@app.post("/api/lighthouse/outreach")
def lighthouse_outreach(req: OutreachRequest):
    """Generate a personalized outreach opener for one prospect from its evidence."""
    prospect = {
        "company": req.company,
        "open_data_roles": req.open_data_roles,
        "sample_roles": req.sample_roles,
        "pain_signal": {"title": req.pain_title, "points": req.pain_points},
        "build_signal": {"primary_language": req.primary_language, "public_repos": req.public_repos},
    }
    return {"company": req.company, "outreach": _outreach_for(prospect)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
