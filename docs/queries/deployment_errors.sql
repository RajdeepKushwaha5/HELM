-- Helm: deployment_errors
-- Purpose: prove which merged GitHub PRs line up with first-seen unresolved Sentry errors.
-- Replace placeholders before running in Coral.

SELECT
  g.number AS pr_number,
  g.title AS pr_title,
  g.user__login AS author,
  g.html_url AS pr_url,
  g.merged_at,
  s.title AS error_title,
  s.project AS sentry_project,
  s.level,
  s.count AS times_seen,
  s.first_seen,
  CAST(s.first_seen AS TIMESTAMP) - CAST(g.merged_at AS TIMESTAMP) AS time_to_error
FROM github.pulls g
JOIN sentry.issues s
  ON CAST(s.first_seen AS TIMESTAMP) >= CAST(g.merged_at AS TIMESTAMP)
 AND CAST(s.first_seen AS TIMESTAMP) <= CAST(g.merged_at AS TIMESTAMP) + INTERVAL '24 hours'
WHERE g.owner = '<GITHUB_OWNER>'
  AND g.repo = '<GITHUB_REPO>'
  AND g.state = 'closed'
  AND g.merged_at IS NOT NULL
  AND CAST(g.merged_at AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '30 days'
  AND s.query = 'is:unresolved'
  AND s.level IN ('error', 'fatal')
ORDER BY g.merged_at DESC, s.count DESC
LIMIT 40;

