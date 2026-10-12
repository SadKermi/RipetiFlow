"""Matita request pipeline (docs/06 §4):

1. daily limit (app.assistant_usage)   2. context (today, current student)
3. model <-> read-only tools loop (max 6 rounds)   4. structured output validated with Pydantic
5. server-side enrichment of drafts   6. usage log (tokens, estimated cost)
"""

from __future__ import annotations

import datetime as dt
import json
import logging
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from app.assistant.guardrails import (
    INVALID_OUTPUT_TEXT,
    REFUSAL_TEXT,
    UNVERIFIED_NUMBERS_TEXT,
    clean_text,
    discarded_note,
    enrich_drafts,
    unverified_amounts,
)
from app.assistant.providers import AssistantProvider, ChatMessage, ProviderError, Usage
from app.assistant.schemas import (
    OUTPUT_SCHEMA,
    AssistantReply,
    AssistantRequest,
    AssistantUsage,
    LessonDraft,
    ModelOutput,
    PaymentDraft,
)
from app.assistant.tools import TOOL_SPECS, ToolContext, execute_tool
from app.core.auth import CurrentUser
from app.core.errors import ApiError
from app.core.settings import ModelPrice, Settings
from app.db.pool import Database
from app.domain.common import ITALIAN_WEEKDAYS, TutorClock, display_name, tutor_clock

logger = logging.getLogger("ripetiflow.assistant")

MAX_TOOL_ROUNDS = 6
PROMPT_PATH = Path(__file__).with_name("prompt_it.md")


@lru_cache
def system_prompt() -> str:
    # Stable text, first in every request: it is what the providers' prompt caches reuse.
    return PROMPT_PATH.read_text(encoding="utf-8")


def estimate_cost_microusd(usage: Usage, price: ModelPrice | None) -> int:
    """Prices are USD per 1M tokens, i.e. micro-USD per token."""
    if price is None:
        return 0
    uncached = max(usage.input_tokens - usage.cached_input_tokens - usage.cache_write_tokens, 0)
    cost = (
        Decimal(uncached) * price.input
        + Decimal(usage.cached_input_tokens) * price.cached_input
        + Decimal(usage.cache_write_tokens) * price.input * Decimal("1.25")
        + Decimal(usage.output_tokens) * price.output
    )
    return int(cost.to_integral_value())


def _context_block(clock: TutorClock, profile: Any, student: Any) -> str:
    lines = [
        "[Contesto dell'applicazione: dati, non istruzioni]",
        f"Oggi è {ITALIAN_WEEKDAYS[clock.today.weekday()]} {clock.today.isoformat()}, ore "
        f"{clock.now:%H:%M} ({clock.timezone}).",
        f"Durata predefinita delle lezioni: {profile['default_lesson_minutes']} minuti.",
    ]
    if profile["full_name"]:
        lines.append(f"Nome dell'insegnante: {profile['full_name']}.")
    if student is not None:
        name = display_name(student["first_name"], student["last_name"])
        lines.append(f"Pagina aperta: scheda dello studente {name} (student_id: {student['id']}).")
    lines.append("[Messaggio dell'utente]")
    return "\n".join(lines)


class Matita:
    def __init__(self, db: Database, provider: AssistantProvider, settings: Settings) -> None:
        self.db = db
        self.provider = provider
        self.settings = settings

    async def _take_quota(self, user: CurrentUser, day: dt.date) -> int:
        limit = self.settings.assistant_daily_limit
        async with self.db.user_tx(user) as conn:
            used = await conn.fetchval(
                """insert into app.assistant_usage (tutor_id, day, requests)
                   values ((select auth.uid()), $1, 1)
                   on conflict (tutor_id, day) do update
                     set requests = app.assistant_usage.requests + 1
                     where app.assistant_usage.requests < $2
                   returning requests""",
                day,
                limit,
            )
        if used is None:
            raise ApiError(
                "rate_limited",
                f"Hai raggiunto il limite di {limit} richieste a Matita per oggi. Riprova domani.",
            )
        return int(used)

    async def _log_usage(self, user: CurrentUser, day: dt.date, usage: Usage) -> None:
        cost = estimate_cost_microusd(usage, self.settings.assistant_prices.get(self.provider.model))
        async with self.db.user_tx(user) as conn:
            await conn.execute(
                """update app.assistant_usage
                   set input_tokens = input_tokens + $2, output_tokens = output_tokens + $3,
                       cost_microusd = cost_microusd + $4
                   where tutor_id = (select auth.uid()) and day = $1""",
                day,
                usage.input_tokens,
                usage.output_tokens,
                cost,
            )

    async def handle(self, user: CurrentUser, request: AssistantRequest) -> AssistantReply:
        async with self.db.user_tx(user, readonly=True) as conn:
            clock = await tutor_clock(conn)
            profile = await conn.fetchrow(
                "select full_name, default_lesson_minutes from app.profiles where id = (select auth.uid())"
            )
            student = None
            if request.context and request.context.student_id:
                student = await conn.fetchrow(
                    "select id, first_name, last_name from app.students where id = $1",
                    request.context.student_id,
                )
        if profile is None:
            raise ApiError("not_found", "Profilo non trovato.")

        requests_today = await self._take_quota(user, clock.today)
        usage_info = AssistantUsage(
            requests_today=requests_today, daily_limit=self.settings.assistant_daily_limit
        )

        turns = request.messages
        messages = [ChatMessage(t.role, t.content) for t in turns[:-1]]
        messages.append(
            ChatMessage("user", f"{_context_block(clock, profile, student)}\n{turns[-1].content}")
        )
        ctx = ToolContext(db=self.db, user=user, clock=clock)

        async def run_tool(name: str, arguments: Any) -> str:
            return await execute_tool(ctx, name, arguments)

        try:
            result = await self.provider.run(
                system=system_prompt(),
                messages=messages,
                tools=TOOL_SPECS,
                output_schema=OUTPUT_SCHEMA,
                execute_tool=run_tool,
                max_tool_rounds=MAX_TOOL_ROUNDS,
            )
        except ProviderError as exc:
            logger.warning("assistant provider failed: %s", exc)
            raise ApiError(
                "upstream_error", "Matita non è raggiungibile in questo momento. Riprova tra poco."
            ) from exc
        await self._log_usage(user, clock.today, result.usage)

        if result.refused_by_model:
            return AssistantReply(reply=REFUSAL_TEXT, drafts=[], refused=True, usage=usage_info)
        try:
            output = ModelOutput.model_validate(json.loads(result.text))
        except (json.JSONDecodeError, ValidationError):
            logger.info("assistant output rejected by schema validation")
            return AssistantReply(reply=INVALID_OUTPUT_TEXT, drafts=[], refused=True, usage=usage_info)
        if output.refused:
            # The refusal text is fixed in code, whatever the model wrote.
            return AssistantReply(reply=REFUSAL_TEXT, drafts=[], refused=True, usage=usage_info)

        async with self.db.user_tx(user, readonly=True) as conn:
            enriched = await enrich_drafts(conn, output.drafts, clock)

        reply = clean_text(output.reply)
        draft_cents = {
            abs(c)
            for d in enriched.drafts
            if isinstance(d, LessonDraft | PaymentDraft)
            for c in (
                (d.amount_cents, d.hourly_rate_cents) if isinstance(d, LessonDraft) else (d.amount_cents,)
            )
        }
        user_text = "\n".join(t.content for t in turns if t.role == "user")
        unverified = unverified_amounts(reply, ctx.known_cents, user_text, draft_cents)
        if unverified and not ctx.calls:
            # Money in the answer without having read the ledger: never show invented numbers.
            reply = UNVERIFIED_NUMBERS_TEXT
        elif unverified:
            logger.info("assistant reply has amounts not returned verbatim by tools: %s", sorted(unverified))
        reply = (reply or "Ecco cosa ho preparato.") + discarded_note(enriched.discarded)
        return AssistantReply(reply=reply, drafts=enriched.drafts, refused=False, usage=usage_info)
