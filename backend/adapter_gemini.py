"""Gemini adapter for the AI Academic Advisor MVP.

The adapter attempts to call the Gemini `gemini-2.5-flash` model. When an
API key is not configured, it falls back to a deterministic local planner so
the frontend remains usable during development.
"""

from __future__ import annotations

import asyncio
import json
import os
import random
import textwrap
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

try:
	import google.generativeai as genai
except ImportError:  # pragma: no cover - optional dependency
	genai = None  # type: ignore


@dataclass
class AdapterResult:
	"""Normalized response from Gemini or the local fallback."""

	message: str
	schedule: Optional[Dict[str, List[Dict[str, Any]]]] = None
	debug: Optional[Dict[str, Any]] = None


class GeminiAdapter:
	"""Handles communication with Gemini with an offline fallback."""

	def __init__(self, model_name: str = "gemini-2.5-flash") -> None:
		self.model_name = model_name
		self.api_key = os.getenv("GEMINI_API_KEY")
		self._model = None
		if self.api_key and genai:
			genai.configure(api_key=self.api_key)
			self._model = genai.GenerativeModel(model_name)

	async def generate_response(
		self,
		user_setup: str,
		knowledge: Dict[str, str],
		message: str,
	) -> AdapterResult:
		if self._model is None:
			return self._fallback_response(user_setup, knowledge, message)

		prompt = self._build_prompt(user_setup, knowledge, message)
		
		# Save the complete prompt to debug file
		try:
			with open("debug_prompt.txt", "w", encoding="utf-8") as f:
				f.write("=== GEMINI PROMPT DEBUG ===\n")
				f.write(f"Timestamp: {datetime.now().isoformat()}\n")
				f.write(f"Model: {self.model_name}\n")
				f.write(f"User Message: {message}\n")
				f.write(f"Prompt Length: {len(prompt):,} characters\n")
				f.write("=" * 50 + "\n\n")
				f.write(prompt)
				f.write("\n\n" + "=" * 50 + "\n")
				f.write("END OF PROMPT\n")
			print(f"[DEBUG] Saved prompt to debug_prompt.txt ({len(prompt):,} chars)")
		except Exception as debug_error:
			print(f"[DEBUG] Warning: Could not save debug prompt: {debug_error}")
		
		try:
			result = await asyncio.to_thread(self._model.generate_content, prompt)
			text = result.text if hasattr(result, "text") else ""
			print(f"[GEMINI] Response received ({len(text)} chars)")
			
			parsed = self._parse_json(text)
			if not isinstance(parsed, dict) or "message" not in parsed:
				print(f"[GEMINI] Warning: Unexpected response format")
				raise ValueError("Gemini returned an unexpected payload")
			
			return AdapterResult(
				message=str(parsed.get("message", "")),
				schedule=parsed.get("schedule"),
				debug={"provider": "gemini", "raw": text[:200] + "..." if len(text) > 200 else text},
			)
		except Exception as error:  # pragma: no cover - network errors
			print(f"[GEMINI] Error: {str(error)[:100]}{'...' if len(str(error)) > 100 else ''}")
			return self._fallback_response(
				user_setup,
				knowledge,
				message,
				notes=f"Gemini error: {str(error)[:50]}",
			)

	def _parse_json(self, text: str) -> Dict[str, Any]:
		"""Extract JSON from Gemini output which may contain code fences."""

		if not text:
			return {"message": "No response received"}
		
		snippet = text.strip()
		
		# Handle code fences
		if "```" in snippet:
			parts = snippet.split("```")
			if len(parts) >= 3:
				snippet = parts[1]
			elif len(parts) == 2:
				snippet = parts[1]
		
		snippet = snippet.strip()
		
		# Remove language identifier
		if snippet.startswith("json"):
			snippet = snippet[4:].strip()
		
		try:
			return json.loads(snippet)
		except json.JSONDecodeError:
			# If JSON parsing fails, try to extract just the message part
			try:
				# Look for a JSON-like structure
				start = snippet.find('{')
				end = snippet.rfind('}')
				if start >= 0 and end > start:
					return json.loads(snippet[start:end+1])
			except json.JSONDecodeError:
				pass
			
			# Fallback: return the text as a message
			return {"message": snippet}

	def _build_prompt(self, user_setup: str, knowledge: Dict[str, str], message: str) -> str:
		schedule_options = knowledge.get("scheduleOptions", "")
		professors = knowledge.get("professors", "")
		degree_plan = knowledge.get("degreePlan", "")
		required_classes = knowledge.get("requiredClasses", "")

		return textwrap.dedent(
			f"""
			You are an AI academic advisor for the University of Texas at Arlington.
			Plan schedules and give thoughtful counseling using the supplied JSON.
			Only answer about UTA academics. Respond with a pure JSON object with
			these keys:
			  - "message": string summary or guidance for the student.
			  - "schedule": optional object keyed by day (mon-sun) where each value
				is a list of blocks with keys: from, to, course, title?, prof?.

			
			Keep responses concise, actionable, and tie recommendations to
			prerequisites, professor ratings, and time preferences.

			Student setup JSON:
			{user_setup}

			Degree plan JSON:
			{degree_plan}

			Professor ratings JSON:
			{professors}

			Next-term schedule options JSON:
			{schedule_options}

			Required Classes Information:
			{required_classes}

			Student question:
			{message}
			"""
		).strip()

	def _fallback_response(
		self,
		user_setup: str,
		knowledge: Dict[str, str],
		message: str,
		notes: Optional[str] = None,
	) -> AdapterResult:
		"""Generate a deterministic plan when Gemini is unavailable."""

		try:
			user = json.loads(user_setup)
		except json.JSONDecodeError:
			user = {}
		student = user.get("student", {})
		preferred_days = set(student.get("preferredDays", []))
		time_blocks = student.get("timeBlocks", {})

		try:
			options = json.loads(knowledge.get("scheduleOptions", "[]"))
		except json.JSONDecodeError:
			options = []

		try:
			profs = {item["profId"]: item for item in json.loads(knowledge.get("professors", "[]"))}
		except json.JSONDecodeError:
			profs = {}

		chosen = []
		for section in options:
			if len(chosen) >= 4:
				break
			section_days = section.get("days", [])
			if preferred_days and not preferred_days.intersection(section_days):
				continue

			# Respect time blocks when available
			valid = True
			for day in section_days:
				blocks = time_blocks.get(day)
				if not blocks:
					continue
				start = parse_minutes(section.get("start"))
				end = parse_minutes(section.get("end"))
				if start is None or end is None:
					continue
				if not any(parse_minutes(block.get("from")) <= start and parse_minutes(block.get("to")) >= end for block in blocks):
					valid = False
					break
			if not valid:
				continue

			chosen.append(section)

		if not chosen and options:
			chosen = random.sample(options, k=min(3, len(options)))

		schedule: Dict[str, List[Dict[str, Any]]] = {day: [] for day in DAY_ORDER}
		for section in chosen:
			prof = profs.get(section.get("profId"))
			for day in section.get("days", []):
				schedule.setdefault(day, []).append(
					{
						"from": section.get("start"),
						"to": section.get("end"),
						"course": section.get("courseId"),
						"title": section.get("courseTitle"),
						"prof": prof.get("name") if prof else section.get("profId"),
					}
				)

		schedule = {day: blocks for day, blocks in schedule.items() if blocks}

		interests = ", ".join(student.get("interests", [])) or "your interests"
		base_message = (
			"Here's a quick offline plan that respects your highlighted days and interests. "
			f"I prioritized sections that match {interests}."
		)
		if notes:
			base_message += f"\n\n(Debug: {notes})"

		return AdapterResult(message=base_message, schedule=schedule, debug={"provider": "fallback"})


def parse_minutes(value: Any) -> Optional[int]:
	try:
		hours, minutes = str(value).split(":")
		return int(hours) * 60 + int(minutes)
	except Exception:  # pragma: no cover - guard against malformed times
		return None


DAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
