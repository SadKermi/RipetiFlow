"""Provider-agnostic interface for Matita (D-41).

A provider runs the model <-> tools loop: it calls the model, executes the requested tools through
the `execute_tool` callback (read-only, as the user), and returns the final structured text. The
orchestrator owns every guardrail; providers only translate to their wire format.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

from app.core.settings import Settings

ToolExecutor = Callable[[str, Any], Awaitable[str]]


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
    input_tokens: int = 0  # all input tokens, cached included
    output_tokens: int = 0
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
    ) -> ProviderResult: ...


def build_provider(settings: Settings) -> AssistantProvider | None:
    model = settings.resolved_assistant_model
    if settings.assistant_provider == "openai" and settings.openai_api_key is not None:
        from app.assistant.providers.openai_provider import OpenAIProvider

        return OpenAIProvider(
            settings.openai_api_key.get_secret_value(),
            model,
            settings.assistant_timeout_seconds,
            settings.assistant_max_output_tokens,
        )
    if settings.assistant_provider == "anthropic" and settings.anthropic_api_key is not None:
        from app.assistant.providers.anthropic_provider import AnthropicProvider

        return AnthropicProvider(
            settings.anthropic_api_key.get_secret_value(),
            model,
            settings.assistant_timeout_seconds,
            settings.assistant_max_output_tokens,
        )
    return None
