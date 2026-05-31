import subprocess
import json
import os
import re
import shlex
import time
import hashlib

CORAL_BIN = os.getenv("CORAL_BIN", "coral")

# Simple TTL cache keyed on SQL hash. Avoids re-running the same Coral subprocess
# call when a panel is revisited or multiple endpoints share the same query.
_CACHE_TTL_DEFAULT = 30  # seconds
_query_cache: dict[str, dict] = {}  # key -> {rows, proof, ts}


def _coral_command(args: list[str]) -> list[str]:
    return [*shlex.split(CORAL_BIN), *args]


def _missing_coral_message() -> str:
    return (
        f"Coral CLI not found using CORAL_BIN={CORAL_BIN!r}. Install Coral, add it to PATH, "
        "or set CORAL_BIN in helm/backend/.env to the full executable path."
    )


def _extract_sources(sql: str) -> list[str]:
    names = set(re.findall(r"\b(?:FROM|JOIN)\s+([a-zA-Z_][\w]*)\.", sql, flags=re.IGNORECASE))
    return sorted(name for name in names if name != "coral")


def _parse_rows(stdout: str) -> list[dict]:
    text = stdout.strip()
    if not text:
        return []

    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict) and isinstance(parsed.get("rows"), list):
            return parsed["rows"]
        if isinstance(parsed, dict):
            return [parsed]
    except json.JSONDecodeError:
        pass

    start = text.find("[")
    end = text.rfind("]")
    if start != -1 and end > start:
        for idx in (i for i, char in enumerate(text[: end + 1]) if char == "["):
            try:
                parsed = json.loads(text[idx : end + 1])
                if isinstance(parsed, list):
                    return parsed
            except json.JSONDecodeError:
                continue

    rows: list[dict] = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line[0] not in "[{":
            continue
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, list):
            rows.extend(row for row in parsed if isinstance(row, dict))
        elif isinstance(parsed, dict) and isinstance(parsed.get("rows"), list):
            rows.extend(row for row in parsed["rows"] if isinstance(row, dict))
        elif isinstance(parsed, dict):
            rows.append(parsed)
    return rows


def _clean_error(text: str) -> str:
    lines = [
        line for line in text.splitlines()
        if not line.startswith("wsl: Failed to translate ")
    ]
    return "\n".join(lines).strip()


def _columns(rows: list[dict]) -> list[str]:
    if not rows:
        return []
    columns: list[str] = []
    seen: set[str] = set()
    for row in rows[:10]:
        for key in row.keys():
            if key not in seen:
                seen.add(key)
                columns.append(key)
    return columns


def coral_sql(query: str, timeout: int = 90) -> list[dict]:
    """Execute a Coral SQL query and return results as a list of dicts."""
    try:
        result = subprocess.run(
            _coral_command(["sql", "--format", "json", query]),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(_missing_coral_message()) from exc
    if result.returncode != 0:
        raise RuntimeError(_clean_error(result.stderr.strip()) or "Coral query failed")
    stdout = result.stdout.strip()
    if not stdout:
        return []
    return _parse_rows(stdout)


def coral_query(name: str, query: str, sources: list[str] | None = None, timeout: int = 90, cache_ttl: int = _CACHE_TTL_DEFAULT) -> dict:
    """Execute Coral SQL and return rows plus a judge-friendly proof object.

    cache_ttl: seconds to serve a cached result before re-running. Pass 0 to bypass.
    """
    cache_key = hashlib.md5(query.encode()).hexdigest()
    now = time.monotonic()
    proof_sources = sources or _extract_sources(query)

    if cache_ttl > 0 and cache_key in _query_cache:
        entry = _query_cache[cache_key]
        if now - entry["ts"] < cache_ttl:
            rows = entry["rows"]
            cached_proof = {
                "name": name,
                "sql": query,
                "sources": proof_sources,
                "cross_source": len(proof_sources) > 1,
                "row_count": len(rows),
                "duration_ms": entry.get("duration_ms", 1),
                "status": "ok",
                "error": None,
                "mode": "Coral CLI",
                "columns": _columns(rows),
                "sample_rows": rows[:5],
                "cached": True,
                "cache_age_s": round(now - entry["ts"]),
            }
            return {"rows": entry["rows"], "proof": cached_proof}

    started = time.perf_counter()
    proof = {
        "name": name,
        "sql": query,
        "sources": proof_sources,
        "cross_source": len(proof_sources) > 1,
        "row_count": 0,
        "duration_ms": 0,
        "status": "running",
        "error": None,
        "mode": "Coral CLI",
        "columns": [],
        "sample_rows": [],
    }

    result: dict = {}
    try:
        rows = coral_sql(query, timeout=timeout)
        proof["status"] = "ok"
        proof["failed"] = False
        proof["row_count"] = len(rows)
        proof["columns"] = _columns(rows)
        proof["sample_rows"] = rows[:5]
        result = {"rows": rows, "proof": proof}
    except Exception as exc:
        msg = str(exc)
        proof["status"] = "error"
        proof["failed"] = True
        if isinstance(exc, subprocess.TimeoutExpired):
            proof["error"] = f"query timed out after {timeout}s"
            proof["error_type"] = "timeout"
        elif "Coral CLI not found" in msg:
            proof["error"] = _clean_error(msg)
            proof["error_type"] = "coral_cli_missing"
        else:
            proof["error"] = _clean_error(msg)
            proof["error_type"] = "coral_sql_error"
        result = {"rows": [], "proof": proof}
    finally:
        proof["duration_ms"] = max(1, round((time.perf_counter() - started) * 1000))

    if cache_ttl > 0 and proof.get("status") == "ok":
        _query_cache[cache_key] = {
            "rows": result["rows"],
            "duration_ms": proof["duration_ms"],
            "ts": time.monotonic(),
        }

    return result


def _run_coral(args: list[str], timeout: int = 30) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(_coral_command(args), capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError as exc:
        raise RuntimeError(_missing_coral_message()) from exc


def source_health(required_sources: list[str]) -> dict:
    required_sources = list(required_sources)
    table_rows: list[dict] = []
    input_rows: list[dict] = []
    errors: list[str] = []

    try:
        table_result = _run_coral([
            "sql", "--format", "json",
            "SELECT schema_name, table_name FROM coral.tables ORDER BY 1, 2",
        ])
        if table_result.returncode == 0:
            table_rows = _parse_rows(table_result.stdout)
        else:
            errors.append(_clean_error(table_result.stderr.strip()) or "Failed to inspect coral.tables")
    except Exception as exc:
        errors.append(_clean_error(str(exc)))

    try:
        input_result = _run_coral([
            "sql", "--format", "json",
            "SELECT schema_name, key, kind, required, is_set FROM coral.inputs ORDER BY 1, 2",
        ])
        if input_result.returncode == 0:
            input_rows = _parse_rows(input_result.stdout)
    except Exception:
        input_rows = []

    column_rows: list[dict] = []
    try:
        col_result = _run_coral([
            "sql", "--format", "json",
            "SELECT schema_name, table_name, COUNT(*) AS column_count FROM coral.columns GROUP BY 1, 2 ORDER BY 1, 2",
        ])
        if col_result.returncode == 0:
            column_rows = _parse_rows(col_result.stdout)
    except Exception:
        column_rows = []

    table_function_rows: list[dict] = []
    try:
        tf_result = _run_coral([
            "sql", "--format", "json",
            "SELECT schema_name, function_name, kind FROM coral.table_functions ORDER BY 1, 2",
        ])
        if tf_result.returncode == 0:
            table_function_rows = _parse_rows(tf_result.stdout)
        else:
            errors.append(_clean_error(tf_result.stderr.strip()) or "Failed to inspect coral.table_functions")
    except Exception as exc:
        errors.append(_clean_error(str(exc)))
        table_function_rows = []

    filter_rows: list[dict] = []
    try:
        filter_result = _run_coral([
            "sql", "--format", "json",
            "SELECT schema_name, table_name, filter_name FROM coral.filters ORDER BY 1, 2",
        ])
        if filter_result.returncode == 0:
            filter_rows = _parse_rows(filter_result.stdout)
    except Exception as exc:
        errors.append(_clean_error(str(exc)))
        filter_rows = []

    tables_by_source: dict[str, list[str]] = {}
    for row in table_rows:
        schema = str(row.get("schema_name", ""))
        table = str(row.get("table_name", ""))
        if schema and table:
            tables_by_source.setdefault(schema, []).append(table)

    inputs_by_source: dict[str, list[dict]] = {}
    for row in input_rows:
        schema = str(row.get("schema_name", ""))
        if schema:
            inputs_by_source.setdefault(schema, []).append(row)

    column_counts_by_source: dict[str, int] = {}
    for row in column_rows:
        schema = str(row.get("schema_name", ""))
        if schema:
            column_counts_by_source[schema] = column_counts_by_source.get(schema, 0) + int(row.get("column_count") or 0)

    table_functions_by_source: dict[str, list[dict]] = {}
    for row in table_function_rows:
        schema = str(row.get("schema_name", ""))
        if schema:
            table_functions_by_source.setdefault(schema, []).append({
                "name": row.get("function_name"),
                "kind": row.get("kind"),
            })

    filters_by_source: dict[str, list[dict]] = {}
    for row in filter_rows:
        schema = str(row.get("schema_name", ""))
        if schema:
            filters_by_source.setdefault(schema, []).append({
                "table": row.get("table_name"),
                "filter": row.get("filter_name"),
            })

    sources = []
    run_source_tests = os.getenv("CORAL_SOURCE_TESTS", "").lower() in {"1", "true", "yes"}
    for source in required_sources:
        installed = source in tables_by_source
        test_status = "metadata" if installed else "skipped"
        test_error = None
        if installed and run_source_tests:
            try:
                test = _run_coral(["source", "test", source], timeout=45)
                test_status = "ok" if test.returncode == 0 else "error"
                test_error = None if test.returncode == 0 else _clean_error(test.stderr.strip() or test.stdout.strip())
            except Exception as exc:
                test_status = "error"
                test_error = _clean_error(str(exc))

        source_inputs = inputs_by_source.get(source, [])
        missing_inputs = [
            row.get("key")
            for row in source_inputs
            if row.get("required") and not row.get("is_set")
        ]
        sources.append({
            "name": source,
            "installed": installed,
            "table_count": len(tables_by_source.get(source, [])),
            "column_count": column_counts_by_source.get(source, 0),
            "tables": tables_by_source.get(source, []),
            "inputs": source_inputs,
            "missing_inputs": missing_inputs,
            "table_functions": table_functions_by_source.get(source, []),
            "filters": filters_by_source.get(source, []),
            "status": "ok" if installed and not missing_inputs and test_status in {"ok", "metadata"} else "warning",
            "last_test": {"status": test_status, "error": test_error},
        })

    discoverable_sources: list[str] = []
    try:
        discover_result = _run_coral(["source", "discover"], timeout=15)
        if discover_result.returncode == 0:
            raw = discover_result.stdout.strip()
            parsed = None
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                pass
            if isinstance(parsed, list):
                discoverable_sources = [str(s) for s in parsed if isinstance(s, str)]
            elif isinstance(parsed, dict):
                discoverable_sources = [str(s) for s in parsed.get("sources", []) if isinstance(s, str)]
            else:
                # Plain text output — one source name per line
                for line in raw.splitlines():
                    name = line.strip().split()[0] if line.strip() else ""
                    if name and name.isidentifier():
                        discoverable_sources.append(name)
    except Exception:
        pass

    # DESCRIBE EXTENDED — per installed source, returns recommended JOINs,
    # query count, and cache hit rate from the Coral X5 planner metadata.
    describe_extended: dict[str, list[dict]] = {}
    for source in required_sources:
        installed_tables = tables_by_source.get(source, [])
        if not installed_tables:
            continue
        # Pick a stable representative table to describe
        probe_table = installed_tables[0]
        try:
            de_result = _run_coral([
                "sql", "--format", "json",
                f"DESCRIBE EXTENDED {source}.{probe_table}",
            ], timeout=15)
            if de_result.returncode == 0:
                rows = _parse_rows(de_result.stdout)
                describe_extended[source] = rows
        except Exception:
            pass

    return {
        "status": "ok" if not errors else "warning",
        "sources": sources,
        "discoverable_sources": discoverable_sources,
        "describe_extended": describe_extended,
        "errors": errors,
    }
