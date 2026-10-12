"""Scripted provider for tests: replays predefined tool calls and a final answer, no network."""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from app.assistant.providers import ChatMessage, ProviderResult, ToolExecutor, ToolSpec, Usage

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
    ) -> ProviderResult:
        self.calls.append({"system": system, "messages": messages, "tools": [t.name for t in tools]})
        result = ProviderResult(text="")
        if self.refuse:
            result.refused_by_model = True
            return result
        for step in self.steps:
            result.usage.add(self.usage_per_call)
            if step.tool_calls and result.tool_rounds < max_tool_rounds:
                result.tool_rounds += 1
                for name, arguments in step.tool_calls:
                    result.tool_calls += 1
                    output = await execute_tool(name, arguments)
                    self.tool_outputs.append(json.loads(output))
                continue
            final = step.final
            if callable(final):
                final = final(self.tool_outputs)
            result.text = final if isinstance(final, str) else json.dumps(final)
            return result
        return result
