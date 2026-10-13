"""Matita request pipeline (docs/06 §4):

1. daily limit (app.assistant_usage, day in Europe/Rome)   2. context (today, current student)
3. model <-> read-only tools loop (max 6 rounds, max 8 calls per round, overall time budget)
4. structured output validated with Pydantic   5. server-side enrichment and checks of the drafts
6. amounts in the reply checked against their sources   7. usage log (tokens, estimated cost)
"""

from __future__ import annotations

import asyncio
import datetime as dt
import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from pydantic import ValidationError

from app.assistant.guardrails import (
    INVALID_OUTPUT_TEXT,
    REFUSAL_TEXT,
    UNVERIFIED_NUMBERS_TEXT,
    UNVERIFIED_NUMBERS_WITH_DRAFTS_TEXT,
    AmountSources,
    clean_text,
    discarded_note,
    enrich_drafts,
    unverified_amounts,
)
from app.assistant.pricing import estimate_cost_microusd, price_for
from app.assistant.providers import AssistantProvider, ChatMessage, ProviderError, ProviderResult, Usage
from app.assistant.schemas import (
    MAX_CHARS,
    OUTPUT_SCHEMA,
    AssistantReply,
    AssistantRequest,
    AssistantUsage,
    ChatTurn,
    ModelOutput,
)
from app.assistant.tools import TOOL_SPECS, ToolContext, execute_tool
from app.core.auth import CurrentUser
from app.core.errors import ApiError
from app.core.settings import Settings
from app.db.pool import Database
from app.domain.common import ITALIAN_WEEKDAYS, TutorClock, display_name, tutor_clock

logger = logging.getLogger("ripetiflow.assistant")

MAX_TOOL_ROUNDS = 6
MAX_TOOL_CALLS_PER_ROUND = 8
PROMPT_PATH = Path(__file__).with_name("prompt_it.md")
# The daily limit resets at midnight in Italy for every tutor. It is never keyed on the profile
# timezone: the tutor can change that (PATCH /me) and would get the quota of adjacent days.
QUOTA_ZONE = ZoneInfo("Europe/Rome")
UPSTREAM_DETAIL = "Matita non è raggiungibile in questo momento. Riprova tra poco."
EMPTY_REPLY_WITH_DRAFTS = "Ecco cosa ho preparato."
EMPTY_REPLY = "Non ho preparato nessuna bozza."


@lru_cache
def system_prompt() -> str:
    # Stable text, first in every request: it is what the providers' prompt caches reuse.
    return PROMPT_PATH.read_text(encoding="utf-8")


def quota_day() -> dt.date:
    return dt.datetime.now(QUOTA_ZONE).date()


def _conversation(turns: list[ChatTurn]) -> list[ChatTurn]:
    """Leading assistant turns (e.g. a greeting shown by the UI) are dropped: Anthropic requires the
    first message to be from the user, and docs/05 only requires the last one to be."""
    first_user = next(index for index, turn in enumerate(turns) if turn.role == "user")
    return turns[first_user:]


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
        """Never raises: it runs in a `finally` and must not hide the request's own outcome."""
        if not (usage.input_tokens or usage.output_tokens):
            return
        cost = estimate_cost_microusd(usage, price_for(self.settings.assistant_prices, self.provider.model))
        try:
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
        except Exception:
            logger.exception("assistant usage could not be logged: %s", usage)

    async def _run_model(
        self, user: CurrentUser, day: dt.date, messages: list[ChatMessage], ctx: ToolContext
    ) -> ProviderResult:
        """The whole loop runs under one time budget; the tokens spent are logged whatever happens
        (the provider adds them to `usage` after every model call)."""

        async def run_tool(name: str, arguments: Any) -> str:
            return await execute_tool(ctx, name, arguments)

        usage = Usage()
        budget = self.settings.assistant_total_timeout_seconds
        deadline = asyncio.timeout(budget)
        try:
            async with deadline:
                return await self.provider.run(
                    system=system_prompt(),
                    messages=messages,
                    tools=TOOL_SPECS,
                    output_schema=OUTPUT_SCHEMA,
                    execute_tool=run_tool,
                    max_tool_rounds=MAX_TOOL_ROUNDS,
                    max_tool_calls_per_round=MAX_TOOL_CALLS_PER_ROUND,
                    usage=usage,
                )
        except ProviderError as exc:
            logger.warning("assistant provider failed: %s", exc)
            raise ApiError("upstream_error", UPSTREAM_DETAIL) from exc
        except TimeoutError as exc:
            if not deadline.expired():
                raise
            logger.warning("assistant request exceeded its %s s budget (tools: %s)", budget, ctx.calls)
            raise ApiError("upstream_error", UPSTREAM_DETAIL) from exc
        finally:
            await self._log_usage(user, day, usage)

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

        day = quota_day()
        requests_today = await self._take_quota(user, day)
        usage_info = AssistantUsage(
            requests_today=requests_today, daily_limit=self.settings.assistant_daily_limit
        )

        turns = _conversation(request.messages)
        messages = [ChatMessage(t.role, t.content) for t in turns[:-1]]
        messages.append(
            ChatMessage("user", f"{_context_block(clock, profile, student)}\n{turns[-1].content}")
        )
        ctx = ToolContext(db=self.db, user=user, clock=clock)
        result = await self._run_model(user, day, messages, ctx)

        if result.refused_by_model:
            return AssistantReply(reply=REFUSAL_TEXT, drafts=[], refused=True, usage=usage_info)
        try:
            output = ModelOutput.model_validate(json.loads(result.text))
        except (json.JSONDecodeError, ValidationError):
            logger.info(
                "assistant output rejected by schema validation (incomplete: %s)", result.incomplete_reason
            )
            # Not a refusal: the request may well be in scope (docs/06 §4).
            return AssistantReply(reply=INVALID_OUTPUT_TEXT, drafts=[], refused=False, usage=usage_info)
        if output.refused:
            # The refusal text is fixed in code, whatever the model wrote.
            return AssistantReply(reply=REFUSAL_TEXT, drafts=[], refused=True, usage=usage_info)

        sources = AmountSources(
            tool_cents=set(ctx.known_cents),
            user_text="\n".join(t.content for t in turns if t.role == "user"),
            assistant_text="\n".join(t.content for t in turns if t.role == "assistant"),
        )
        async with self.db.user_tx(user, readonly=True) as conn:
            enriched = await enrich_drafts(conn, output.drafts, clock, sources)

        # The reply goes back as an assistant turn of the next request: with the note it must still
        # fit the turn limit (MAX_CHARS).
        note = discarded_note(enriched.discarded)
        body = clean_text(output.reply, MAX_CHARS - len(note))
        unverified = unverified_amounts(f"{output.reply}\n{body}", enriched.allowed_cents)
        if unverified:
            # D-42: never show an amount that comes from no tool, no user turn and no verified draft.
            logger.info("assistant reply replaced: unverified amounts %s", sorted(unverified))
            body = UNVERIFIED_NUMBERS_WITH_DRAFTS_TEXT if enriched.drafts else UNVERIFIED_NUMBERS_TEXT
        if not body:
            body = EMPTY_REPLY_WITH_DRAFTS if enriched.drafts else EMPTY_REPLY
        return AssistantReply(reply=body + note, drafts=enriched.drafts, refused=False, usage=usage_info)
