-- Helm: service_instability
-- Purpose: join Sentry error volume with PagerDuty incident pressure by service.

WITH sentry_counts AS (
  SELECT
    project AS service_name,
    COUNT(*) AS sentry_errors,
    SUM(CAST(count AS BIGINT)) AS total_error_events,
    MAX(CAST(count AS BIGINT)) AS worst_error_count
  FROM sentry.issues
  WHERE query = 'is:unresolved'
    AND level IN ('error', 'fatal')
  GROUP BY project
),
pd_counts AS (
  SELECT
    service__summary AS service_name,
    COUNT(*) AS pd_incidents
  FROM pagerduty.incidents
  WHERE created_at IS NOT NULL
    AND CAST(created_at AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '30 days'
  GROUP BY service__summary
)
SELECT
  s.service_name,
  s.sentry_errors,
  s.total_error_events,
  COALESCE(p.pd_incidents, 0) AS pd_incidents,
  s.worst_error_count
FROM sentry_counts s
LEFT JOIN pd_counts p
  ON lower(p.service_name) LIKE '%' || lower(s.service_name) || '%'
ORDER BY s.sentry_errors DESC, pd_incidents DESC
LIMIT 20;

