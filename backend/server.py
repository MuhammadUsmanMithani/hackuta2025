"""Flask backend for the AI Academic Advisor MVP."""

from __future__ import annotations

import asyncio
import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from pydantic import BaseModel, Field, RootModel, ValidationError, field_validator

from adapter_gemini import AdapterResult, GeminiAdapter

# ---------------------------------------------------------------------------

load_dotenv("../.env")

LOGGER = logging.getLogger("advisor.backend")

ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "frontend" / "data"
ALLOWED_ORIGINS = [
    "http://localhost",
    "http://localhost:3000",
    "http://localhost:4173",
    "http://127.0.0.1",
]

# ---------------------------------------------------------------------------

class KnowledgePayload(BaseModel):
    scheduleOptions: str = Field(..., description="JSON string of schedule options")
    professors: str = Field(..., description="JSON string of professor ratings")
    degreePlan: str = Field(..., description="JSON string of degree requirements")

    @classmethod
    def from_local_data(cls, max_length: Optional[int] = None) -> "KnowledgePayload":
        """Load JSON files from DATA_DIR and return compacted JSON strings.
        If max_length is provided, strings are truncated with an ellipsis.
        """
        try:
            schedule = load_json(DATA_DIR / "schedule.json")
            professors = load_json(DATA_DIR / "professors.json")
            degree = load_json(DATA_DIR / "degree.json")
        except Exception as err:
            raise RuntimeError(f"Failed to load local JSON fixtures: {err}")

        def compact(obj: Any) -> str:
            s = json.dumps(obj, separators=(",", ":"), ensure_ascii=False)
            if max_length and len(s) > max_length:
                return s[: max_length - 3] + "..."
            return s

        return cls(
            scheduleOptions=compact(schedule),
            professors=compact(professors),
            degreePlan=compact(degree),
        )


class ConversationTurn(BaseModel):
    role: str = Field(..., description="Speaker role such as 'user' or 'assistant'")
    content: str = Field(..., description="Message content")

    @field_validator("role")
    def normalize_role(cls, value: str) -> str:  # noqa: D417
        role = value.strip().lower()
        if role not in {"user", "assistant"}:
            raise ValueError("role must be 'user' or 'assistant'")
        return role


class QueryRequest(BaseModel):
    user: str = Field(..., description="Serialized student setup JSON from localStorage")
    knowledge: KnowledgePayload
    message: str = Field(..., min_length=1)
    history: List[ConversationTurn] = Field(default_factory=list)

    @field_validator("user", mode="before")
    def ensure_json_like(cls, value: Any) -> Any:  # noqa: D417
        if isinstance(value, str):
            return value
        if isinstance(value, dict):
            try:
                return json.dumps(value, separators=(",", ":"), ensure_ascii=False)
            except (TypeError, ValueError) as error:  # pragma: no cover - guard rails
                raise ValueError("User payload must be JSON serializable") from error
        raise ValueError("User payload must be a JSON string or object")


class QueryResponse(BaseModel):
    message: str
    schedule: Optional[Dict[str, Any]] = None
    debug: Optional[Dict[str, Any]] = None


class CachedData(RootModel):
    root: Dict[str, Any]


def load_json(path: Path) -> Any:
    if not path.exists():
        LOGGER.warning("JSON fixture not found at %s; using empty object", path)
        return {}

    # Use 'utf-8-sig' to strip a potential BOM and read the file as text so we can
    # detect and short-circuit on empty content before attempting to parse JSON.
    with path.open("r", encoding="utf-8-sig") as handle:
        content = handle.read()
        if not content.strip():
            LOGGER.warning("Empty JSON file at %s; using empty object", path)
            return {}

        try:
            return json.loads(content)
        except json.JSONDecodeError:
            LOGGER.warning("Empty or malformed JSON in %s; using empty object", path)
            return {}


@lru_cache(maxsize=1)
def preload_data() -> CachedData:
    """Load local JSON fixtures once for quick health checks and prompts."""

    if not DATA_DIR.exists():
        raise RuntimeError(f"Data directory missing at {DATA_DIR}")

    payload = {
        "degreePlan": load_json(DATA_DIR / "degree.json"),
        "scheduleOptions": load_json(DATA_DIR / "schedule.json"),
        "professors": load_json(DATA_DIR / "professors.json"),
    }
    return CachedData(payload)

# ---------------------------------------------------------------------------

app = Flask(__name__)
CORS(app, origins=ALLOWED_ORIGINS, supports_credentials=True)
adapter = GeminiAdapter()

# ✅ FIXED: use before_first_request instead of before_serving
def warm_cache() -> None:
    """Ensure JSON fixtures load on boot and log adapter status."""

    try:
        preload_data()
        LOGGER.info("Loaded local JSON fixtures from %s", DATA_DIR)
    except Exception as error:  # pragma: no cover - defensive logging
        LOGGER.exception("Failed to preload JSON fixture data: %s", error)

    if adapter.api_key:
        LOGGER.info("Gemini adapter initialized with model %s", adapter.model_name)
    else:
        LOGGER.warning("GEMINI_API_KEY is not set. Using offline fallback responses.")
warm_cache()
# ---------------------------------------------------------------------------

@app.route("/health", methods=["GET"])
def health() -> Any:
    data = preload_data().root
    return jsonify(
        {
            "status": "ok",
            "degreeCourses": len(data.get("degreePlan", {}).get("coreCourses", [])),
            "scheduleSections": len(data.get("scheduleOptions", [])),
            "professors": len(data.get("professors", [])),
            "geminiConfigured": bool(adapter.api_key),
        }
    )

# ---------------------------------------------------------------------------

def _run_async(coro):
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        return asyncio.run_coroutine_threadsafe(coro, loop).result()

    return asyncio.run(coro)


@app.route("/query", methods=["POST"])
def query_advisor() -> Any:
    payload = request.get_json(silent=True)
    if payload is None:
        return jsonify({"detail": "Invalid JSON payload"}), 400

    try:
        query = QueryRequest(**payload)
    except ValidationError as error:
        return jsonify({"detail": "Invalid request", "errors": error.errors()}), 400

    history_payload = [turn.model_dump() for turn in query.history]

    try:
        result: AdapterResult = _run_async(
            adapter.generate_response(
                user_setup=query.user,
                knowledge=query.knowledge.model_dump(),
                message=query.message,
                history=history_payload,
            )
        )
    except json.JSONDecodeError as error:
        LOGGER.warning("Malformed JSON in payload: %s", error)
        return jsonify({"detail": "Invalid JSON in request"}), 400
    except Exception as error:  # pragma: no cover - fail-safe
        LOGGER.exception("Unexpected error handling query: %s", error)
        return jsonify({"detail": "Advisor service error"}), 500

    response = QueryResponse(
        message=result.message,
        schedule=result.schedule,
        debug=result.debug,
    )
    return jsonify(response.model_dump())

# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(debug=True)
