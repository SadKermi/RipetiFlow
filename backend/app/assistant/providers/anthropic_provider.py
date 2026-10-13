"""Anthropic Messages API adapter (alternative provider, D-41).

Follows the claude-api skill: manual tool loop (`tool_use` -> `tool_result`), strict tools, final
answer constrained with `output_config.format` (json_schema). No forced `tool_choice` (it returns
400 on the newest models): `auto`, and `none` on the last round. The assistant turns are appended
verbatim (`response.content`) so thinking blocks stay valid, and the system prompt is cached.

Thinking models (e.g. claude-sonnet-5-5 runs adaptive thinking when `thinking` is omitted) spend
thinking tokens out of `max_tokens`, so the limit comes from settings with room for both. Any stop
reason other than `end_turn`/`tool_use` (`max_tokens`, `model_context_window_exceeded`, ...) means
the answer may be truncated: it is logged and reported as `incomplete_reason`.
"""

from __future__ import annotations

import logging
from typing import Any

import anthropic

from app.assistant.providers import (
    ChatMessage,
    ProviderError,
    ProviderResult,
    ToolExecutor,
    ToolSpec,
    Usage,
    run_tool_calls,
)

logger = logging.getLogger("ripetiflow.assistant")


class AnthropicProvider:
    name = "anthropic"

    def __init__(
        self,
        api_key: str,
        model: str,
        timeout: float,
        max_output_tokens: int,
        *,
        client: anthropic.AsyncAnthropic | None = None,  # tests pass a client with a mocked transport
    ) -> None:
        self.model = model
        self._max_tokens = max_output_tokens
        self._client = client or anthropic.AsyncAnthropic(api_key=api_key, timeout=timeout, max_retries=1)

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
        max_tool_calls_per_round: int,
        usage: Usage,
    ) -> ProviderResult:
        history: list[Any] = [{"role": m.role, "content": m.content} for m in messages]
        tool_params: list[Any] = [
            {"name": t.name, "description": t.description, "input_schema": t.parameters, "strict": True}
            for t in tools
        ]
        system_blocks: list[Any] = [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]
        result = ProviderResult(text="", usage=usage)
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

            cached = response.usage.cache_read_input_tokens or 0
            written = response.usage.cache_creation_input_tokens or 0
            usage.add(
                Usage(
                    input_tokens=response.usage.input_tokens + cached + written,
                    output_tokens=response.usage.output_tokens,
                    cached_input_tokens=cached,
                    cache_write_tokens=written,
                )
            )
            stop = response.stop_reason
            if stop == "refusal":
                logger.info("anthropic model refused the request")
                result.refused_by_model = True
                return result

            tool_uses = [block for block in response.content if block.type == "tool_use"]
            if stop == "tool_use" and tool_uses and not last_round:
                result.tool_rounds += 1
                result.tool_calls += len(tool_uses)
                history.append({"role": "assistant", "content": response.content})
                outputs = await run_tool_calls(
                    [(block.name, block.input) for block in tool_uses], execute_tool, max_tool_calls_per_round
                )
                history.append(
                    {
                        "role": "user",
                        "content": [
                            {"type": "tool_result", "tool_use_id": block.id, "content": output}
                            for block, output in zip(tool_uses, outputs, strict=True)
                        ],
                    }
                )
                continue

            if stop != "end_turn":
                logger.warning("anthropic final answer stopped with %s, model %s", stop, self.model)
                result.incomplete_reason = stop or "unknown"
            result.text = "".join(block.text for block in response.content if block.type == "text")
            return result
