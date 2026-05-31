-- Helm: root_cause_constellation
-- Purpose: the four-source causality query, joining GitHub, Sentry, PagerDuty, and Slack.
-- Slack messages are exposed by Coral as a table function; pass raw Slack timestamp
-- bounds as arguments, and query the returned `ts` column as a Timestamp.

WITH deployments AS (
  SELECT
    number AS pr_number,
    title AS pr_title,
    user__login AS author,
    html_url AS pr_url,
    merged_at
  FROM github.pulls
  WHERE owner = '<GITHUB_OWNER>'
    AND repo = '<GITHUB_REPO>'
    AND state = 'closed'
    AND merged_at IS NOT NULL
    AND CAST(merged_at AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '30 days'
),
errors AS (
  SELECT
    id AS sentry_issue_id,
    title AS error_title,
    project AS sentry_project,
    level,
    count AS times_seen,
    first_seen
  FROM sentry.issues
  WHERE query = 'is:unresolved'
    AND level IN ('error', 'fatal')
),
incidents AS (
  SELECT
    id AS incident_id,
    title AS incident_title,
    service__summary AS service_name,
    urgency,
    status,
    created_at AS incident_started_at
  FROM pagerduty.incidents
  WHERE created_at IS NOT NULL
),
slack_window AS (
  SELECT
    ts,
    text,
    user_id AS slack_user
  FROM slack.messages(
    channel => '<SLACK_INCIDENTS_CHANNEL>',
    oldest => '<SLACK_OLDEST_TS>',
    latest => '<SLACK_LATEST_TS>'
  )
)
SELECT
  d.pr_number,
  d.pr_title,
  d.author,
  e.error_title,
  e.sentry_project,
  e.level,
  e.times_seen,
  i.incident_id,
  i.incident_title,
  i.urgency,
  COUNT(sw.ts) AS slack_messages,
  CASE
    WHEN i.incident_id IS NOT NULL AND COUNT(sw.ts) > 0 THEN 100
    WHEN i.incident_id IS NOT NULL THEN 80
    WHEN COUNT(sw.ts) > 0 THEN 60
    ELSE 40
  END AS evidence_score
FROM deployments d
JOIN errors e
  ON CAST(e.first_seen AS TIMESTAMP) >= CAST(d.merged_at AS TIMESTAMP)
 AND CAST(e.first_seen AS TIMESTAMP) <= CAST(d.merged_at AS TIMESTAMP) + INTERVAL '24 hours'
LEFT JOIN incidents i
  ON lower(i.service_name) LIKE '%' || lower(e.sentry_project) || '%'
LEFT JOIN slack_window sw
  ON lower(sw.text) LIKE '%' || lower(e.sentry_project) || '%'
  OR lower(sw.text) LIKE '%' || lower(e.error_title) || '%'
GROUP BY
  d.pr_number, d.pr_title, d.author,
  e.error_title, e.sentry_project, e.level, e.times_seen,
  i.incident_id, i.incident_title, i.urgency
ORDER BY evidence_score DESC, e.times_seen DESC
LIMIT 40;
