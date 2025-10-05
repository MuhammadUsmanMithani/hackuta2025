"""Flask backend for the AI Academic Advisor MVP."""

from __future__ import annotations

import asyncio
import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Optional

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


class QueryRequest(BaseModel):
    user: str = Field(..., description="Serialized student setup JSON from localStorage")
    knowledge: KnowledgePayload
    message: str = Field(..., min_length=1)

    @field_validator("user", mode="before")
    def ensure_json_like(cls, value: Any) -> Any:  # noqa: D417
        if not isinstance(value, str):
            raise ValueError("User payload must be a JSON string")
        return value


class QueryResponse(BaseModel):
    message: str
    schedule: Optional[Dict[str, Any]] = None
    debug: Optional[Dict[str, Any]] = None


class CachedData(RootModel):
    root: Dict[str, Any]


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


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

    try:
        result: AdapterResult = _run_async(
            adapter.generate_response(
                user_setup=query.user,
                knowledge=query.knowledge.model_dump(),
                message=query.message,
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
