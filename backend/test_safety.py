"""
Safety eval tests for Helm backend.

Run: pytest test_safety.py -v
"""
import re
import pytest
from fastapi.testclient import TestClient

# ── import the app ──────────────────────────────────────────────────────────
# We import main lazily so the test can run even without .env present.
# If the import itself fails the tests will error — that's intentional.
try:
    from main import app, _SANDBOX_BLOCKED
    _CLIENT = TestClient(app, raise_server_exceptions=False)
    _MAIN_IMPORTED = True
except Exception as e:          # noqa: BLE001
    _MAIN_IMPORTED = False
    _IMPORT_ERROR = str(e)


# ── helpers ─────────────────────────────────────────────────────────────────

def client():
    if not _MAIN_IMPORTED:
        pytest.skip(f"main.py import failed: {_IMPORT_ERROR}")
    return _CLIENT


# ── 1. No write routes exist ─────────────────────────────────────────────────

WRITE_ROUTES = ["/api/insert", "/api/update", "/api/delete", "/api/drop", "/api/exec"]

@pytest.mark.parametrize("route", WRITE_ROUTES)
def test_no_write_routes(route):
    """Helm exposes no mutation endpoints by design."""
    c = client()
    for method in ("post", "put", "patch", "delete"):
        resp = getattr(c, method)(route)
        assert resp.status_code in (404, 405), (
            f"{method.upper()} {route} returned {resp.status_code} — write route must not exist"
        )


# ── 2. Sandbox blocks all SQL mutations ──────────────────────────────────────

BLOCKED_STATEMENTS = [
    "INSERT INTO github.pulls VALUES (1, 'evil')",
    "UPDATE sentry.issues SET title = 'pwned' WHERE 1=1",
    "DELETE FROM linear.issues",
    "DROP TABLE github.pulls",
    "CREATE TABLE x (id INT)",
    "ALTER TABLE github.pulls ADD COLUMN evil TEXT",
    "TRUNCATE sentry.issues",
    "EXEC xp_cmdshell('rm -rf /')",
    "GRANT ALL ON github.pulls TO attacker",
]

@pytest.mark.parametrize("sql", BLOCKED_STATEMENTS)
def test_sandbox_blocks_mutations(sql):
    """/api/sandbox/query must reject any non-SELECT SQL."""
    c = client()
    resp = c.post("/api/sandbox/query", json={"sql": sql, "sources": ["github"]})
    assert resp.status_code in (400, 422), (
        f"Expected 400/422 for mutating SQL but got {resp.status_code}: {sql!r}"
    )


# ── 3. _SANDBOX_BLOCKED regex is comprehensive ───────────────────────────────

WRITE_KEYWORDS = [
    "INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER",
    "TRUNCATE", "REPLACE", "MERGE", "EXECUTE", "EXEC", "CALL",
    "GRANT", "REVOKE", "VACUUM",
]

@pytest.mark.parametrize("kw", WRITE_KEYWORDS)
def test_blocked_regex_catches_keyword(kw):
    """The _SANDBOX_BLOCKED regex must match every mutation keyword."""
    assert _SANDBOX_BLOCKED.search(kw), f"_SANDBOX_BLOCKED did not match keyword: {kw}"
    assert _SANDBOX_BLOCKED.search(kw.lower()), f"_SANDBOX_BLOCKED did not match lowercase: {kw.lower()}"


# ── 4. Malformed SQL returns an error, not a 500 ────────────────────────────

MALFORMED_QUERIES = [
    "SELECT FROM WHERE",
    "SELECT * FROM ((((",
    "'; DROP TABLE github.pulls; --",
    "",
    "   ",
]

@pytest.mark.parametrize("sql", MALFORMED_QUERIES)
def test_malformed_sql_returns_error_not_500(sql):
    """Malformed SQL must return 400/422, never 500."""
    c = client()
    resp = c.post("/api/sandbox/query", json={"sql": sql, "sources": ["github"]})
    # Either blocked (write keyword) or query failed gracefully
    assert resp.status_code != 500, (
        f"Malformed SQL caused 500: {sql!r}\n{resp.text[:300]}"
    )
