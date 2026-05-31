"""
Lighthouse — GTM / prospecting intelligence Coral SQL queries.

Lighthouse finds companies that would want Coral by joining three public-data
signals through Coral SQL:

  HIRING  signal -> adzuna.search_jobs    (who is scaling a data/AI team)
  PAIN    signal -> hackernews.search     (who is publicly frustrated with
                                           ETL / pipeline / data-integration)
  BUILD   signal -> github.org_repos      (who has an active engineering org)

The cross-source value: a company hiring data engineers AND publicly complaining
about pipeline pain AND shipping code is a near-perfect Coral prospect. No single
tool surfaces that — it requires a join across the labour market, public
sentiment, and code activity.

All queries are read-only SELECTs.
"""


def _esc(value: str) -> str:
    return (value or "").replace("'", "''")


# ── PAIN signal (HackerNews — always live, no auth) ───────────────────────────


def hn_pain_signals(keywords: str = "etl pipeline data integration") -> str:
    """
    Public pain signal: the most-discussed HN stories about data-integration
    pain. High points + comments = strong, visible frustration. This is the
    signal that a market wants a better answer (Coral).
    """
    kw = _esc(keywords)
    return f"""
SELECT
    object_id,
    title,
    author,
    points,
    num_comments,
    url,
    created_at
FROM hackernews.search(query => '{kw}')
WHERE points >= 40
ORDER BY points DESC, num_comments DESC
LIMIT 25
""".strip()


def hn_company_mentions(company: str) -> str:
    """
    Pain/visibility signal for one specific company: recent HN stories that
    mention it. Used to attach an evidence quote to a prospect.
    """
    c = _esc(company)
    return f"""
SELECT
    object_id,
    title,
    points,
    num_comments,
    url,
    created_at
FROM hackernews.search(query => '{c}')
ORDER BY points DESC
LIMIT 5
""".strip()


# ── HIRING signal (Adzuna — needs free app_id/app_key) ────────────────────────


def adzuna_hiring(what: str = "data engineer", country: str = "us") -> str:
    """
    Hiring signal: active job postings for data/AI engineering roles. The number
    of open roles per company is a proxy for how much data pain they have and
    how much budget they are putting against it.
    """
    what_e = _esc(what)
    country_e = _esc(country)
    return f"""
SELECT
    company,
    title,
    location,
    created_at
FROM adzuna.search_jobs(what => '{what_e}', country => '{country_e}')
WHERE company IS NOT NULL
ORDER BY created_at DESC
LIMIT 50
""".strip()


def adzuna_market_pulse(what: str = "data engineer", country: str = "us") -> str:
    """
    Live labour-market demand signal: a sample of currently-open data/AI
    engineering roles across the market. Used for the headline "demand" KPI and
    as live proof that the Adzuna source is connected. Adzuna's `what` is a
    fuzzy full-text match, so this is a market-level pulse, not a per-company
    count (company names cannot be matched precisely through this endpoint).
    """
    what_e = _esc(what)
    country_e = _esc(country)
    return f"""
SELECT
    company,
    title,
    location,
    created_at
FROM adzuna.search_jobs(what => '{what_e}', country => '{country_e}')
WHERE company IS NOT NULL
ORDER BY created_at DESC
LIMIT 50
""".strip()


# ── BUILD signal (GitHub — bundled) ───────────────────────────────────────────


def github_org_activity(org: str) -> str:
    """
    Build signal: how active a company's public engineering org is. A live org
    with many recently-pushed repos in data-heavy languages is a company that
    builds, and therefore feels integration pain first-hand.
    """
    org_e = _esc(org)
    return f"""
SELECT
    name,
    language,
    stargazers_count,
    forks_count,
    pushed_at,
    html_url
FROM github.org_repos
WHERE org = '{org_e}'
ORDER BY pushed_at DESC
LIMIT 20
""".strip()


# ── THE CROSS-SOURCE KILLER JOIN (Adzuna × HackerNews) ────────────────────────


def hiring_x_pain_join(what: str = "data engineer", country: str = "us",
                       pain_keywords: str = "etl pipeline") -> str:
    """
    THE KILLER QUERY. Joins companies hiring data engineers (Adzuna) to public
    HackerNews pain about data-integration tooling (HN), matched on company name
    appearing in the HN discussion. A row here is a company that is both
    investing in data engineering AND publicly associated with pipeline pain —
    the strongest possible Coral prospect.

    Cross-source: Adzuna (labour market) × HackerNews (public sentiment).
    Impossible in any single tool.
    """
    what_e = _esc(what)
    country_e = _esc(country)
    pain_e = _esc(pain_keywords)
    return f"""
SELECT
    j.company                       AS company,
    COUNT(DISTINCT j.title)         AS open_data_roles,
    MAX(h.title)                    AS pain_signal,
    MAX(h.points)                   AS pain_points,
    MAX(h.url)                      AS pain_url
FROM adzuna.search_jobs(what => '{what_e}', country => '{country_e}') j
JOIN hackernews.search(query => '{pain_e}') h
    ON LOWER(h.title) LIKE '%' || LOWER(j.company) || '%'
WHERE j.company IS NOT NULL
  AND LENGTH(j.company) >= 4
GROUP BY j.company
ORDER BY open_data_roles DESC, pain_points DESC
LIMIT 25
""".strip()
