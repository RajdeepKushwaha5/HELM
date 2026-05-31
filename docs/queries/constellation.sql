-- Incident Constellation: 4-source causal chain
-- GitHub PR → Sentry error → PagerDuty incident → Slack response
-- One DataFusion execution plan. Replace :owner, :repo, :channel, :oldest, and :latest with your values.
-- Slack messages are exposed by Coral as a table function; ts is already a UTC Timestamp.
--
-- This query is architecturally impossible without Coral: it joins four independent
-- SaaS APIs using time-window conditions in a single SQL plan, requiring no ETL,
-- no warehouse, and no intermediate data copies.

WITH slack_msgs AS (
    SELECT text, ts, reply_count
    FROM slack.messages(channel => ':channel', oldest => ':oldest', latest => ':latest')
)
SELECT
    g.number                            AS pr_number,
    g.title                             AS pr_title,
    g.user__login                       AS author,
    SUBSTR(g.merged_at, 1, 19)          AS merged_at,
    s.id                                AS sentry_id,
    s.title                             AS error_title,
    s.level                             AS severity,
    s.count                             AS error_events,
    s.project                           AS service,
    SUBSTR(s.first_seen, 1, 19)         AS error_first_seen,
    pd.id                               AS incident_id,
    pd.urgency                          AS urgency,
    pd.status                           AS incident_status,
    SUBSTR(pd.created_at, 1, 19)        AS incident_created_at,
    pd.service__summary                 AS incident_service,
    COUNT(sl.text)                      AS slack_messages,
    COALESCE(MAX(sl.reply_count), 0)    AS thread_depth,
    (
        CASE WHEN s.level = 'fatal' THEN 40 ELSE 20 END
        + CASE WHEN pd.id IS NOT NULL THEN 30 ELSE 0 END
        + CASE WHEN COUNT(sl.text) >= 3 THEN 20 ELSE COUNT(sl.text) * 5 END
        + CASE WHEN s.count >= 100 THEN 10 ELSE 0 END
    )                                   AS evidence_score
FROM github.pulls g
JOIN sentry.issues s
    ON CAST(s.first_seen AS TIMESTAMP) >= CAST(g.merged_at AS TIMESTAMP)
   AND CAST(s.first_seen AS TIMESTAMP) <= CAST(g.merged_at AS TIMESTAMP) + INTERVAL '24 hours'
LEFT JOIN pagerduty.incidents pd
    ON pd.service__summary ILIKE '%' || s.project || '%'
   AND CAST(pd.created_at AS TIMESTAMP) >= CAST(s.first_seen AS TIMESTAMP)
   AND CAST(pd.created_at AS TIMESTAMP) <= CAST(s.first_seen AS TIMESTAMP) + INTERVAL '72 hours'
LEFT JOIN slack_msgs sl
    ON CAST(sl.ts AS TIMESTAMP) >= CAST(pd.created_at AS TIMESTAMP)
   AND CAST(sl.ts AS TIMESTAMP) <= CAST(pd.created_at AS TIMESTAMP) + INTERVAL '4 hours'
   AND (   sl.text ILIKE '%incident%'
        OR sl.text ILIKE '%outage%'
        OR sl.text ILIKE '%down%'
        OR sl.text ILIKE '%p0%'
        OR sl.text ILIKE '%p1%')
WHERE g.owner = ':owner'
  AND g.repo  = ':repo'
  AND g.state = 'closed'
  AND CAST(g.merged_at AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '30 days'
  AND s.level IN ('error', 'fatal')
  AND s.query = 'is:unresolved'
  -- NOT EXISTS ensures we attribute the error to the most recent PR before it appeared,
  -- not to an older PR that happens to also be in the 24h window.
  AND NOT EXISTS (
      SELECT 1
      FROM github.pulls newer
      WHERE newer.owner = ':owner'
        AND newer.repo  = ':repo'
        AND newer.state = 'closed'
        AND CAST(newer.merged_at AS TIMESTAMP) > CAST(g.merged_at AS TIMESTAMP)
        AND CAST(newer.merged_at AS TIMESTAMP) <= CAST(s.first_seen AS TIMESTAMP)
  )
GROUP BY
    g.number, g.title, g.user__login, g.merged_at,
    s.id, s.title, s.level, s.count, s.project, s.first_seen,
    pd.id, pd.urgency, pd.status, pd.created_at, pd.service__summary
ORDER BY evidence_score DESC, s.count DESC
LIMIT 8;
