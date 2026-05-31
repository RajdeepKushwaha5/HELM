-- Cascade Early Warning
-- Detect deploy -> error -> incident chains inside a two-hour window.
-- Replace OWNER and REPO before running.

SELECT
    g.number            AS pr_number,
    g.title             AS pr_title,
    g.user__login       AS author,
    g.merged_at,
    s.title             AS error_title,
    s.level,
    s.count             AS error_events,
    s.user_count        AS users_affected,
    s.project           AS service,
    s.first_seen        AS error_first_seen,
    pd.id               AS incident_id,
    pd.urgency          AS incident_urgency,
    pd.status           AS incident_status,
    pd.service__summary AS incident_service,
    pd.created_at       AS incident_created_at
FROM github.pulls g
JOIN sentry.issues s
    ON CAST(s.first_seen AS TIMESTAMP) >= CAST(g.merged_at AS TIMESTAMP)
   AND CAST(s.first_seen AS TIMESTAMP) <= CAST(g.merged_at AS TIMESTAMP) + INTERVAL '2 hours'
LEFT JOIN pagerduty.incidents pd
    ON pd.service__summary ILIKE '%' || s.project || '%'
   AND CAST(pd.created_at AS TIMESTAMP) >= CAST(s.first_seen AS TIMESTAMP)
   AND CAST(pd.created_at AS TIMESTAMP) <= CAST(s.first_seen AS TIMESTAMP) + INTERVAL '2 hours'
WHERE g.owner = 'OWNER'
  AND g.repo  = 'REPO'
  AND g.state = 'closed'
  AND CAST(g.merged_at AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '7 days'
  AND s.level IN ('error', 'fatal')
  AND s.query = 'is:unresolved'
ORDER BY g.merged_at DESC, s.count DESC
LIMIT 20;
