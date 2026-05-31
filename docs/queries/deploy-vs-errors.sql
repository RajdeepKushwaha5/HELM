-- Deploy vs Error Trend: monthly GitHub × Sentry time-bucketed JOIN
-- Shows deploy cadence vs error introduction rate per month over the last 6 months.
-- Replace :owner, :repo with your values.
--
-- This is a cross-source temporal aggregate: two independent time series
-- (GitHub deploy frequency, Sentry error introduction) joined and grouped by
-- calendar month in one DataFusion plan. Neither GitHub nor Sentry exposes
-- both series natively.

SELECT
    SUBSTR(g.merged_at, 1, 7)                                     AS year_month,
    COUNT(DISTINCT g.number)                                       AS deploys,
    COUNT(DISTINCT s.id)                                           AS new_errors,
    COALESCE(SUM(s.count), 0)                                      AS total_error_events,
    COUNT(DISTINCT CASE WHEN s.level = 'fatal' THEN s.id END)      AS fatal_errors,
    COUNT(DISTINCT g.user__login)                                   AS active_authors
FROM github.pulls g
LEFT JOIN sentry.issues s
    ON CAST(s.first_seen AS TIMESTAMP) >= CAST(g.merged_at AS TIMESTAMP)
   AND CAST(s.first_seen AS TIMESTAMP) <= CAST(g.merged_at AS TIMESTAMP) + INTERVAL '24 hours'
   AND s.query = 'is:unresolved'
   AND s.level IN ('error', 'fatal')
   AND NOT EXISTS (
       SELECT 1
       FROM github.pulls newer
       WHERE newer.owner = ':owner'
         AND newer.repo  = ':repo'
         AND newer.state = 'closed'
         AND CAST(newer.merged_at AS TIMESTAMP) > CAST(g.merged_at AS TIMESTAMP)
         AND CAST(newer.merged_at AS TIMESTAMP) <= CAST(s.first_seen AS TIMESTAMP)
   )
WHERE g.owner = ':owner'
  AND g.repo  = ':repo'
  AND g.state = 'closed'
  AND CAST(g.merged_at AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '180 days'
GROUP BY SUBSTR(g.merged_at, 1, 7)
ORDER BY year_month ASC
LIMIT 12;
