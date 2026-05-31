-- Engineering Risk Scorecard
-- Deployment, production impact, incident, and Linear follow-up coverage in one Coral plan.
-- Replace OWNER and REPO before running.
-- Slack can be added with the application query when SLACK_INCIDENTS_CHANNEL is configured.

WITH open_followups AS (
    SELECT identifier, title, priority, priority_label, state_name, team_key, assignee_name
    FROM linear.issues
    WHERE state_type NOT IN ('completed', 'cancelled')
    LIMIT 100
)
SELECT
    g.number         AS pr_number,
    g.title          AS pr_title,
    g.user__login    AS author,
    g.merged_at,
    g.html_url       AS pr_url,
    s.title          AS error_title,
    s.level,
    s.count          AS error_events,
    s.user_count     AS users_affected,
    s.project        AS service,
    s.first_seen     AS error_first_seen,
    pd.id            AS incident_id,
    pd.urgency       AS incident_urgency,
    pd.status        AS incident_status,
    pd.created_at    AS incident_created_at,
    l.identifier     AS followup_identifier,
    l.title          AS followup_title,
    l.priority_label AS followup_priority,
    l.state_name     AS followup_state,
    l.assignee_name  AS followup_assignee
FROM github.pulls g
JOIN sentry.issues s
    ON CAST(s.first_seen AS TIMESTAMP) >= CAST(g.merged_at AS TIMESTAMP)
   AND CAST(s.first_seen AS TIMESTAMP) <= CAST(g.merged_at AS TIMESTAMP) + INTERVAL '24 hours'
LEFT JOIN pagerduty.incidents pd
    ON pd.service__summary ILIKE '%' || s.project || '%'
   AND CAST(pd.created_at AS TIMESTAMP) >= CAST(s.first_seen AS TIMESTAMP)
   AND CAST(pd.created_at AS TIMESTAMP) <= CAST(s.first_seen AS TIMESTAMP) + INTERVAL '72 hours'
LEFT JOIN open_followups l
    ON (
        l.team_key ILIKE '%' || s.project || '%'
        OR l.title ILIKE '%' || s.project || '%'
        OR l.title ILIKE '%' || g.title || '%'
        OR l.title ILIKE '%' || s.title || '%'
    )
WHERE g.owner = 'OWNER'
  AND g.repo  = 'REPO'
  AND g.state = 'closed'
  AND CAST(g.merged_at AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '30 days'
  AND s.level IN ('error', 'fatal')
  AND s.query = 'is:unresolved'
ORDER BY s.count DESC, g.merged_at DESC
LIMIT 30;
