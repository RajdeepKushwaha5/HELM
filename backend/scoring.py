"""
Engineering health scoring for Helm.
Computes service instability scores from Sentry + PagerDuty data.
"""

from __future__ import annotations
from dataclasses import dataclass


@dataclass
class ServiceScore:
    name: str
    sentry_errors: int = 0
    pd_incidents: int = 0
    total_error_events: int = 0
    instability_score: int = 0
    risk_level: str = "low"


def compute_service_scores(service_instability: list[dict]) -> list[ServiceScore]:
    services = []
    for row in service_instability:
        s = ServiceScore(
            name=row.get("service", "unknown"),
            sentry_errors=int(row.get("sentry_errors") or 0),
            pd_incidents=int(row.get("pd_incidents") or 0),
            total_error_events=int(row.get("total_error_events") or 0),
        )
        raw = s.sentry_errors * 10 + s.pd_incidents * 15 + (s.total_error_events // 10)
        s.instability_score = min(100, raw)
        if s.instability_score >= 60:
            s.risk_level = "high"
        elif s.instability_score >= 30:
            s.risk_level = "medium"
        else:
            s.risk_level = "low"
        services.append(s)
    return sorted(services, key=lambda s: s.instability_score, reverse=True)
