-- MTTR Causal Attribution
-- GitHub pull requests joined to Sentry first-seen production errors.
-- Replace OWNER and REPO before running.

SELECT
    g.number      AS pr_number,
    g.title       AS pr_title,
    g.user__login AS author,
    g.merged_at,
    g.html_url    AS pr_url,
    s.id          AS error_id,
    s.title       AS error_title,
    s.level,
    s.count       AS times_seen,
    s.user_count  AS users_affected,
    s.first_seen,
    s.project     AS service
FROM github.pulls g
JOIN sentry.issues s
    ON CAST(s.first_seen AS TIMESTAMP) >= CAST(g.merged_at AS TIMESTAMP)
   AND CAST(s.first_seen AS TIMESTAMP) <= CAST(g.merged_at AS TIMESTAMP) + INTERVAL '24 hours'
WHERE g.owner = 'OWNER'
  AND g.repo  = 'REPO'
  AND g.state = 'closed'
  AND CAST(g.merged_at AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '30 days'
  AND s.level IN ('error', 'fatal')
  AND s.query = 'is:unresolved'
ORDER BY g.merged_at DESC
LIMIT 100;
