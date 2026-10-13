"""Provider-agnostic interface for Matita (D-41).

A provider runs the model <-> tools loop: it calls the model, executes the requested tools through
the `execute_tool` callback (read-only, as the user), and returns the final structured text. The
orchestrator owns every guardrail; providers only translate to their wire format.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

from app.core.settings import Settings

logger = logging.getLogger("ripetiflow.assistant")

ToolExecutor = Callable[[str, Any], Awaitable[str]]

TOO_MANY_TOOL_CALLS = json.dumps(
    {"error": "Troppe richieste agli strumenti in un solo passaggio: questa non è stata eseguita."},
    ensure_ascii=False,
)


@dataclass(frozen=True)
class ChatMessage:
    role: Literal["user", "assistant"]
    content: str


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]


@dataclass
class Usage:
    input_tokens: int = 0  # all input tokens: cache reads and cache writes included
    output_tokens: int = 0  # reasoning/thinking included
    cached_input_tokens: int = 0
    cache_write_tokens: int = 0

    def add(self, other: Usage) -> None:
        self.input_tokens += other.input_tokens
        self.output_tokens += other.output_tokens
        self.cached_input_tokens += other.cached_input_tokens
        self.cache_write_tokens += other.cache_write_tokens


@dataclass
class ProviderResult:
    text: str
    usage: Usage = field(default_factory=Usage)
    tool_rounds: int = 0
    tool_calls: int = 0
    refused_by_model: bool = False  # the provider's own safety refusal
    # Why the final answer may be truncated or unusable (e.g. "max_tokens"); logged by the orchestrator.
    incomplete_reason: str | None = None


class ProviderError(Exception):
    """The model API failed (network, quota, invalid request). Mapped to 502."""


class AssistantProvider(Protocol):
    name: str
    model: str

    async def run(
        self,
        *,
        system: str,
        messages: list[ChatMessage],
        tools: list[ToolSpec],
        output_schema: dict[str, Any],
        execute_tool: ToolExecutor,
        max_tool_rounds: int,
        max_tool_calls_per_round: int,
        usage: Usage,
    ) -> ProviderResult:
        """Run the loop. Token usage is added to `usage` after every model call, so the caller can log
        what was spent even when a later call fails or the request runs out of time."""
        ...


async def run_tool_calls(
    calls: Sequence[tuple[str, Any]], execute_tool: ToolExecutor, limit: int
) -> list[str]:
    """Execute one round of tool calls in order. Past `limit` the calls are not executed: they get an
    error result instead, because both APIs require a result for every call the model made."""
    outputs: list[str] = []
    for index, (name, arguments) in enumerate(calls):
        if index >= limit:
            outputs.append(TOO_MANY_TOOL_CALLS)
        else:
            outputs.append(await execute_tool(name, arguments))
    if len(calls) > limit:
        logger.warning("assistant tool round capped: %d calls requested, %d executed", len(calls), limit)
    return outputs


def build_provider(settings: Settings) -> AssistantProvider | None:
    from app.assistant.pricing import price_for

    model = settings.resolved_assistant_model
    provider: AssistantProvider | None = None
    if settings.assistant_provider == "openai" and settings.openai_api_key is not None:
        from app.assistant.providers.openai_provider import OpenAIProvider

        provider = OpenAIProvider(
            settings.openai_api_key.get_secret_value(),
            model,
            settings.assistant_timeout_seconds,
            settings.assistant_max_output_tokens,
        )
    elif settings.assistant_provider == "anthropic" and settings.anthropic_api_key is not None:
        from app.assistant.providers.anthropic_provider import AnthropicProvider

        provider = AnthropicProvider(
            settings.anthropic_api_key.get_secret_value(),
            model,
            settings.assistant_timeout_seconds,
            settings.assistant_max_output_tokens,
        )
    if provider is not None:
        price_for(settings.assistant_prices, model)  # logs a warning at startup when the price is missing
    return provider
