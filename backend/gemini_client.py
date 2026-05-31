import os
import json
import re
from typing import Iterable

DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
_last_successful_key_index = 0


def _split_keys(value: str | None) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in re.split(r"[,;\r\n]+", value) if part.strip()]


def _is_placeholder(value: str) -> bool:
    lowered = value.lower()
    return lowered.startswith(("your_", "paste_", "replace_", "<")) or "here" in lowered


def _dedupe(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if not value or _is_placeholder(value) or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def _configured_keys() -> list[str]:
    candidates: list[str] = []
    candidates.extend(_split_keys(os.getenv("GEMINI_API_KEYS")))

    for index in range(1, 6):
        candidates.extend(_split_keys(os.getenv(f"GEMINI_API_KEY_{index}")))

    candidates.extend(_split_keys(os.getenv("GEMINI_API_KEY")))
    candidates.extend(_split_keys(os.getenv("GOOGLE_API_KEY")))
    return _dedupe(candidates)


def _gemini_model() -> str:
    return os.getenv("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)


def _rotate_from_last_success(keys: list[str]) -> list[tuple[int, str]]:
    if not keys:
        return []
    start = min(_last_successful_key_index, len(keys) - 1)
    indexed = list(enumerate(keys))
    return indexed[start:] + indexed[:start]


def _safe_error(exc: Exception, keys: list[str]) -> str:
    message = str(exc)
    for key in keys:
        message = message.replace(key, "<redacted>")
    return message[:500]


def analyze(prompt: str) -> str:
    global _last_successful_key_index

    keys = _configured_keys()
    if not keys:
        return (
            "[Gemini error: no API key configured. Set GEMINI_API_KEY_1, "
            "GEMINI_API_KEY_2, GEMINI_API_KEY_3, GEMINI_API_KEYS, or GEMINI_API_KEY.]"
        )

    errors: list[str] = []
    model_name = _gemini_model()
    for index, api_key in _rotate_from_last_success(keys):
        try:
            import google.generativeai as genai

            genai.configure(api_key=api_key)
            model = genai.GenerativeModel(model_name)
            response = model.generate_content(prompt)
            text = getattr(response, "text", "")
            if not text:
                raise RuntimeError("Gemini returned an empty response")

            _last_successful_key_index = index
            return text.strip()
        except Exception as exc:
            errors.append(f"key {index + 1}: {_safe_error(exc, keys)}")

    last_error = errors[-1] if errors else "unknown error"
    return (
        f"[Gemini error: all {len(keys)} configured API keys failed for "
        f"model {model_name}. Last error: {last_error}]"
    )


def analyze_with_data(prompt: str, data) -> str:
    blob = json.dumps(data, indent=2, default=str)
    return analyze(f"{prompt}\n\nDATA:\n```json\n{blob}\n```")
