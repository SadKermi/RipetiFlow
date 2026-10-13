"""OpenAI Responses API adapter (default provider, D-41).

Shapes verified against the installed `openai` 3.x package: function tools with `strict`, results
sent back as `function_call_output` input items, structured output via `text.format` json_schema.
With `store=False` nothing is kept server-side, so every call re-sends the previous output items;
reasoning items need `include=["reasoning.encrypted_content"]` to be replayable.

The final answer is the last output message that is not `commentary` (newer models may emit
commentary messages before the answer: `response.output_text` would glue them to the JSON). A
`refusal` content part is the model's safety refusal; an `incomplete` response (e.g. the output token
limit, reasoning included) is logged and reported as such.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Literal

import openai
from openai.types.responses import Response

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


def _replayable(item: Any) -> dict[str, Any]:
    data: dict[str, Any] = item.to_dict(exclude_none=True)
    if data.get("type") != "reasoning":
        # Ids reference server-side items, which do not exist with store=False.
        data.pop("id", None)
    return data


def _usage(response: Response) -> Usage:
    if response.usage is None:
        return Usage()
    details = response.usage.input_tokens_details
    return Usage(
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
        cached_input_tokens=details.cached_tokens if details else 0,
        # Not reported by every model/API version: the SDK model is built without validation.
        cache_write_tokens=(getattr(details, "cache_write_tokens", 0) or 0) if details else 0,
    )


def _final_message(response: Response) -> tuple[str, bool]:
    """(text, refused) of the last non-commentary output message."""
    messages = [item for item in response.output if item.type == "message" and item.phase != "commentary"]
    if not messages:
        return "", False
    content = messages[-1].content
    text = "".join(part.text for part in content if part.type == "output_text")
    refused = any(part.type == "refusal" for part in content)
    return text, refused


class OpenAIProvider:
    name = "openai"

    def __init__(
        self,
        api_key: str,
        model: str,
        timeout: float,
        max_output_tokens: int,
        *,
        client: openai.AsyncOpenAI | None = None,  # tests pass a client with a mocked transport
    ) -> None:
        self.model = model
        self._max_output_tokens = max_output_tokens
        self._client = client or openai.AsyncOpenAI(api_key=api_key, timeout=timeout, max_retries=1)

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
        result = ProviderResult(text="", usage=usage)
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
            usage.add(_usage(response))

            if response.status in ("failed", "cancelled"):
                raise ProviderError(f"openai: response {response.status}")
            if response.status == "incomplete":
                details = response.incomplete_details
                reason = (details.reason if details else None) or "unknown"
                logger.warning("openai response incomplete (%s), model %s", reason, self.model)
                result.incomplete_reason = reason
                result.text, result.refused_by_model = _final_message(response)
                return result

            calls = [item for item in response.output if item.type == "function_call"]
            if not calls or last_round:
                result.text, result.refused_by_model = _final_message(response)
                if result.refused_by_model:
                    logger.info("openai model refused the request")
                return result

            result.tool_rounds += 1
            result.tool_calls += len(calls)
            items.extend(_replayable(item) for item in response.output)
            parsed: list[tuple[str, Any]] = []
            for call in calls:
                try:
                    arguments = json.loads(call.arguments)
                except json.JSONDecodeError:
                    arguments = None
                parsed.append((call.name, arguments))
            outputs = await run_tool_calls(parsed, execute_tool, max_tool_calls_per_round)
            for call, output in zip(calls, outputs, strict=True):
                items.append({"type": "function_call_output", "call_id": call.call_id, "output": output})
