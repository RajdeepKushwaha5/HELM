-- Team Health Pulse: 3-source CTE JOIN in one DataFusion execution plan
-- GitHub PR timing × Linear ticket pressure × Sentry error ownership per engineer
-- Replace :owner, :repo with your values.
--
-- Three CTEs run inside a single coral sql call. DataFusion plans all three
-- source fetches together and joins by author name — NOT three separate API calls
-- merged in application code.

WITH pr_timing AS (
    -- GitHub: who is working at what hours?
    SELECT
        user__login                                                     AS author,
        COUNT(DISTINCT number)                                          AS total_prs,
        COUNT(DISTINCT CASE
            WHEN CAST(SUBSTR(created_at, 12, 2) AS INT) >= 22
              OR CAST(SUBSTR(created_at, 12, 2) AS INT) <= 5
            THEN number END)                                            AS late_night_prs,
        COUNT(DISTINCT CASE
            WHEN CAST(SUBSTR(created_at, 12, 2) AS INT) >= 19
              OR CAST(SUBSTR(created_at, 12, 2) AS INT) <= 8
            THEN number END)                                            AS off_hours_prs,
        MAX(SUBSTR(created_at, 1, 10))                                  AS last_pr_date
    FROM github.pulls
    WHERE owner = ':owner'
      AND repo  = ':repo'
      AND state = 'closed'
      AND CAST(created_at AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '30 days'
    GROUP BY user__login
),
ticket_load AS (
    -- Linear: who is under ticket pressure?
    SELECT
        assignee_name                                                   AS author,
        COUNT(*)                                                        AS open_tickets,
        SUM(CASE WHEN priority <= 2 AND priority > 0 THEN 1 ELSE 0 END) AS high_priority,
        SUM(CASE
            WHEN due_date IS NOT NULL
             AND due_date < SUBSTR(CAST(CURRENT_DATE AS VARCHAR), 1, 10)
            THEN 1 ELSE 0 END)                                          AS overdue_tickets,
        SUM(CASE WHEN state_type = 'started' THEN 1 ELSE 0 END)        AS in_progress_tickets
    FROM linear.issues
    WHERE state_type NOT IN ('completed', 'cancelled')
      AND assignee_name IS NOT NULL
    GROUP BY assignee_name
),
error_owners AS (
    -- GitHub × Sentry: whose PRs keep introducing production errors?
    SELECT
        g.user__login                       AS author,
        COUNT(DISTINCT g.number)            AS prs_with_errors,
        SUM(s.count)                        AS total_error_events,
        COUNT(DISTINCT s.id)                AS unique_errors
    FROM github.pulls g
    JOIN sentry.issues s
        ON CAST(s.first_seen AS TIMESTAMP) >= CAST(g.merged_at AS TIMESTAMP)
       AND CAST(s.first_seen AS TIMESTAMP) <= CAST(g.merged_at AS TIMESTAMP) + INTERVAL '24 hours'
       AND s.query = 'is:unresolved'
       AND s.level IN ('error', 'fatal')
    WHERE g.owner = ':owner'
      AND g.repo  = ':repo'
      AND g.state = 'closed'
      AND CAST(g.merged_at AS TIMESTAMP) >= CAST(CURRENT_DATE AS TIMESTAMP) - INTERVAL '30 days'
      -- Attribute error to the most recent PR before it appeared (NOT EXISTS causality filter)
      AND NOT EXISTS (
          SELECT 1
          FROM github.pulls newer
          WHERE newer.owner = ':owner'
            AND newer.repo  = ':repo'
            AND newer.state = 'closed'
            AND CAST(newer.merged_at AS TIMESTAMP) > CAST(g.merged_at AS TIMESTAMP)
            AND CAST(newer.merged_at AS TIMESTAMP) <= CAST(s.first_seen AS TIMESTAMP)
      )
    GROUP BY g.user__login
)
-- Final JOIN: combine all three signals per engineer
SELECT
    p.author,
    p.total_prs,
    p.late_night_prs,
    p.off_hours_prs,
    p.last_pr_date,
    COALESCE(t.open_tickets,        0)  AS open_tickets,
    COALESCE(t.high_priority,       0)  AS high_priority,
    COALESCE(t.overdue_tickets,     0)  AS overdue_tickets,
    COALESCE(t.in_progress_tickets, 0)  AS in_progress_tickets,
    COALESCE(e.prs_with_errors,     0)  AS prs_with_errors,
    COALESCE(e.total_error_events,  0)  AS total_error_events,
    COALESCE(e.unique_errors,       0)  AS unique_errors
FROM pr_timing p
LEFT JOIN ticket_load  t ON LOWER(t.author) = LOWER(p.author)
LEFT JOIN error_owners e ON e.author = p.author
ORDER BY p.late_night_prs DESC, t.high_priority DESC, e.prs_with_errors DESC
LIMIT 25;
