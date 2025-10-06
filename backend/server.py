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

load_dotenv(".env")
load_dotenv("../.env")

LOGGER = logging.getLogger("advisor.backend")

ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "frontend" / "data"
# Allow all origins during development
CORS_ORIGINS = "*"

# ---------------------------------------------------------------------------

class KnowledgePayload(BaseModel):
    scheduleOptions: str = Field(..., description="JSON string of schedule options")
    professors: str = Field(..., description="JSON string of professor ratings")
    degreePlan: str = Field(..., description="JSON string of degree requirements")
    requiredClasses: str = Field(default="", description="Text content with required classes and rules")


class QueryRequest(BaseModel):
    user: str = Field(..., description="Serialized student setup JSON from localStorage")
    knowledge: KnowledgePayload
    message: str = Field(..., min_length=1)

    @field_validator("user", mode="before")
    def ensure_json_like(cls, value: Any) -> Any:  # noqa: D417
        if isinstance(value, dict):
            # Convert dict to JSON string
            return json.dumps(value)
        elif isinstance(value, str):
            return value
        else:
            raise ValueError("User payload must be a JSON string or dict")
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


def load_text(path: Path) -> str:
    """Load a text file and return its contents as a string."""
    try:
        with path.open("r", encoding="utf-8") as handle:
            return handle.read().strip()
    except FileNotFoundError:
        return ""


@lru_cache(maxsize=1)
def preload_data() -> CachedData:
    """Load local JSON fixtures once for quick health checks and prompts."""

    if not DATA_DIR.exists():
        raise RuntimeError(f"Data directory missing at {DATA_DIR}")

    payload = {
        "degreePlan": load_json(DATA_DIR / "degree.json"),
        "scheduleOptions": load_json(DATA_DIR / "schedule.json"),
        "professors": load_json(DATA_DIR / "professors.json"),
        "requiredClasses": load_text(DATA_DIR / "required_classes.txt"),
    }
    return CachedData(payload)

# ---------------------------------------------------------------------------

app = Flask(__name__)
CORS(app)
adapter = GeminiAdapter()

# ✅ FIXED: use before_first_request instead of before_serving
def warm_cache() -> None:
    """Ensure JSON fixtures load on boot and log adapter status."""

    try:
        preload_data()
        LOGGER.info(f"[INIT] Loaded fixtures from {DATA_DIR} (degree plan, schedules, professors, required classes)")
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
    LOGGER.info("[API] POST /query - Processing advisor request")
    payload = request.get_json(silent=True)
    if payload is None:
        LOGGER.warning("[API] Invalid JSON payload received")
        return jsonify({"detail": "Invalid JSON payload"}), 400

    try:
        query = QueryRequest(**payload)
        LOGGER.info("[API] Request validation successful")
    except ValidationError as error:
        LOGGER.warning(f"[API] Validation failed: {len(error.errors())} errors")
        # Convert pydantic errors to serializable format
        error_details = []
        for err in error.errors():
            error_details.append({
                "field": ".".join(str(x) for x in err["loc"]),
                "message": err["msg"],
                "type": err["type"]
            })
        return jsonify({"detail": "Invalid request", "errors": error_details}), 400

    try:
        # Merge frontend knowledge with server-side loaded data
        cached_data = preload_data()
        merged_knowledge = query.knowledge.model_dump()
        merged_knowledge["requiredClasses"] = cached_data.root["requiredClasses"]
        
        LOGGER.info(f"[AI] Generating response for message: '{query.message[:50]}{'...' if len(query.message) > 50 else ''}'")
        result: AdapterResult = _run_async(
            adapter.generate_response(
                user_setup=query.user,
                knowledge=merged_knowledge,
                message=query.message,
            )
        )
        LOGGER.info(f"[AI] Response generated successfully (provider: {result.debug.get('provider', 'unknown') if result.debug else 'unknown'})")
    except json.JSONDecodeError as error:
        LOGGER.warning(f"[API] Malformed JSON in payload: {str(error)[:100]}")
        return jsonify({"detail": "Invalid JSON in request"}), 400
    except Exception as error:  # pragma: no cover - fail-safe
        LOGGER.exception(f"[API] Unexpected error: {str(error)[:100]}")
        return jsonify({"detail": "Advisor service error"}), 500

    response = QueryResponse(
        message=result.message,
        schedule=result.schedule,
        debug=result.debug,
    )
    LOGGER.info(f"[API] Response ready: {len(result.message)} chars, schedule={'yes' if result.schedule else 'no'}")
    return jsonify(response.model_dump())


# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8080, debug=True)
