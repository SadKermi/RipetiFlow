"""OpenAI Responses API adapter (default provider, D-41).

Shapes verified against the installed `openai` 3.x package: function tools with `strict`, results
sent back as `function_call_output` input items, structured output via `text.format` json_schema.
With `store=False` nothing is kept server-side, so every call re-sends the previous output items;
reasoning items need `include=["reasoning.encrypted_content"]` to be replayable.
"""

from __future__ import annotations

import json
from typing import Any, Literal

import openai

from app.assistant.providers import (
    ChatMessage,
    ProviderError,
    ProviderResult,
    ToolExecutor,
    ToolSpec,
    Usage,
)


def _replayable(item: Any) -> dict[str, Any]:
    data: dict[str, Any] = item.to_dict(exclude_none=True)
    if data.get("type") != "reasoning":
        # Ids reference server-side items, which do not exist with store=False.
        data.pop("id", None)
    return data


class OpenAIProvider:
    name = "openai"

    def __init__(self, api_key: str, model: str, timeout: float, max_output_tokens: int) -> None:
        self.model = model
        self._max_output_tokens = max_output_tokens
        self._client = openai.AsyncOpenAI(api_key=api_key, timeout=timeout, max_retries=1)

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
        items: list[Any] = [{"role": m.role, "content": m.content} for m in messages]
        tool_params: list[Any] = [
            {
                "type": "function",
                "name": t.name,
                "description": t.description,
                "parameters": t.parameters,
                "strict": True,
            }
            for t in tools
        ]
        result = ProviderResult(text="")
        while True:
            last_round = result.tool_rounds >= max_tool_rounds
            tool_choice: Literal["auto", "none"] = "none" if last_round else "auto"
            try:
                response = await self._client.responses.create(
                    model=self.model,
                    instructions=system,
                    input=items,
                    tools=tool_params,
                    tool_choice=tool_choice,
                    text={
                        "format": {
                            "type": "json_schema",
                            "name": "matita_reply",
                            "schema": output_schema,
                            "strict": True,
                        }
                    },
                    reasoning={"effort": "low"},
                    include=["reasoning.encrypted_content"],
                    store=False,
                    max_output_tokens=self._max_output_tokens,
                )
            except openai.OpenAIError as exc:
                raise ProviderError(f"openai: {type(exc).__name__}") from exc

            if response.usage is not None:
                details = response.usage.input_tokens_details
                result.usage.add(
                    Usage(
                        input_tokens=response.usage.input_tokens,
                        output_tokens=response.usage.output_tokens,
                        cached_input_tokens=details.cached_tokens if details else 0,
                    )
                )
            calls = [item for item in response.output if item.type == "function_call"]
            if not calls or last_round:
                result.text = response.output_text
                return result

            result.tool_rounds += 1
            items.extend(_replayable(item) for item in response.output)
            for call in calls:
                result.tool_calls += 1
                try:
                    arguments = json.loads(call.arguments)
                except json.JSONDecodeError:
                    arguments = None
                output = await execute_tool(call.name, arguments)
                items.append({"type": "function_call_output", "call_id": call.call_id, "output": output})
