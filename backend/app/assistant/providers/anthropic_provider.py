"""Anthropic Messages API adapter (alternative provider, D-41).

Follows the claude-api skill: manual tool loop (`tool_use` -> `tool_result`), strict tools, final
answer constrained with `output_config.format` (json_schema). No forced `tool_choice` (it returns
400 on the newest models): `auto`, and `none` on the last round. The assistant turns are appended
verbatim (`response.content`) so thinking blocks stay valid, and the system prompt is cached.
"""

from __future__ import annotations

from typing import Any

import anthropic

from app.assistant.providers import (
    ChatMessage,
    ProviderError,
    ProviderResult,
    ToolExecutor,
    ToolSpec,
    Usage,
)


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key: str, model: str, timeout: float, max_output_tokens: int) -> None:
        self.model = model
        self._max_tokens = max_output_tokens
        self._client = anthropic.AsyncAnthropic(api_key=api_key, timeout=timeout, max_retries=1)

    def _output_config(self, schema: dict[str, Any]) -> Any:
        config: dict[str, Any] = {"format": {"type": "json_schema", "schema": schema}}
        # Haiku 4.5 does not take an effort level; newer models think less at "low".
        if not self.model.startswith("claude-haiku"):
            config["effort"] = "low"
        return config

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
        history: list[Any] = [{"role": m.role, "content": m.content} for m in messages]
        tool_params: list[Any] = [
            {"name": t.name, "description": t.description, "input_schema": t.parameters, "strict": True}
            for t in tools
        ]
        system_blocks: list[Any] = [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]
        result = ProviderResult(text="")
        while True:
            last_round = result.tool_rounds >= max_tool_rounds
            tool_choice: Any = {"type": "none"} if last_round else {"type": "auto"}
            try:
                response = await self._client.messages.create(
                    model=self.model,
                    max_tokens=self._max_tokens,
                    system=system_blocks,
                    messages=history,
                    tools=tool_params,
                    tool_choice=tool_choice,
                    output_config=self._output_config(output_schema),
                )
            except anthropic.AnthropicError as exc:
                raise ProviderError(f"anthropic: {type(exc).__name__}") from exc

            usage = response.usage
            cached = usage.cache_read_input_tokens or 0
            written = usage.cache_creation_input_tokens or 0
            result.usage.add(
                Usage(
                    input_tokens=usage.input_tokens + cached + written,
                    output_tokens=usage.output_tokens,
                    cached_input_tokens=cached,
                    cache_write_tokens=written,
                )
            )
            if response.stop_reason == "refusal":
                result.refused_by_model = True
                return result

            tool_uses = [block for block in response.content if block.type == "tool_use"]
            if response.stop_reason != "tool_use" or not tool_uses or last_round:
                result.text = "".join(block.text for block in response.content if block.type == "text")
                return result

            result.tool_rounds += 1
            history.append({"role": "assistant", "content": response.content})
            results: list[Any] = []
            for block in tool_uses:
                result.tool_calls += 1
                output = await execute_tool(block.name, block.input)
                results.append({"type": "tool_result", "tool_use_id": block.id, "content": output})
            history.append({"role": "user", "content": results})
