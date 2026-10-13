"""Scripted provider for tests: replays predefined tool calls and a final answer, no network.

It behaves like the real adapters where the orchestrator can tell the difference: usage is added to
the caller's `usage` after every simulated model call, at most `max_tool_rounds` tool rounds run
(further tool steps are skipped, as if the last call had `tool_choice: none`), and each round goes
through `run_tool_calls` with the per-round cap.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from app.assistant.providers import (
    ChatMessage,
    ProviderResult,
    ToolExecutor,
    ToolSpec,
    Usage,
    run_tool_calls,
)

# A final answer may depend on what the tools returned (e.g. the id of the student found).
FinalAnswer = dict[str, Any] | str | Callable[[list[Any]], dict[str, Any] | str]


@dataclass
class FakeStep:
    tool_calls: list[tuple[str, Any]] = field(default_factory=list)
    final: FinalAnswer | None = None


@dataclass
class FakeProvider:
    steps: list[FakeStep]
    name: str = "fake"
    model: str = "gpt-6-luna"
    usage_per_call: Usage = field(default_factory=lambda: Usage(input_tokens=3000, output_tokens=300))
    tool_outputs: list[Any] = field(default_factory=list)
    calls: list[dict[str, Any]] = field(default_factory=list)
    refuse: bool = False

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
        self.calls.append({"system": system, "messages": messages, "tools": [t.name for t in tools]})
        result = ProviderResult(text="", usage=usage)
        if self.refuse:
            usage.add(self.usage_per_call)
            result.refused_by_model = True
            return result
        for step in self.steps:
            if step.tool_calls:
                if result.tool_rounds >= max_tool_rounds:
                    continue  # the real adapters force a final answer after the last round
                usage.add(self.usage_per_call)
                result.tool_rounds += 1
                result.tool_calls += len(step.tool_calls)
                outputs = await run_tool_calls(step.tool_calls, execute_tool, max_tool_calls_per_round)
                self.tool_outputs.extend(json.loads(output) for output in outputs)
                continue
            usage.add(self.usage_per_call)
            final = step.final
            if callable(final):
                final = final(self.tool_outputs)
            result.text = final if isinstance(final, str) else json.dumps(final)
            return result
        return result
