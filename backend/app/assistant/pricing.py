"""Estimated cost of Matita's model calls (D-42: usage log with an estimated cost per user)."""

from __future__ import annotations

import logging
import re
from collections.abc import Mapping
from decimal import Decimal

from app.assistant.providers import Usage
from app.core.settings import ModelPrice

logger = logging.getLogger("ripetiflow.assistant")

# Dated snapshots ("claude-haiku-4-5-20251001", "gpt-6-luna-2026-05-01") share the alias's price.
# Only a trailing date is stripped: a plain prefix match would price "gpt-6-luna-mini" as "gpt-6-luna".
_DATE_SUFFIX = re.compile(r"-(?:\d{8}|\d{4}-\d{2}-\d{2})$")
_warned: set[str] = set()


def price_for(prices: Mapping[str, ModelPrice], model: str) -> ModelPrice | None:
    price = prices.get(model) or prices.get(_DATE_SUFFIX.sub("", model))
    if price is None and model not in _warned:
        _warned.add(model)
        logger.warning(
            "no price configured for assistant model %r: its cost is logged as 0 (set ASSISTANT_PRICES)",
            model,
        )
    return price


def estimate_cost_microusd(usage: Usage, price: ModelPrice | None) -> int:
    """Prices are USD per 1M tokens, i.e. micro-USD per token."""
    if price is None:
        return 0
    uncached = max(usage.input_tokens - usage.cached_input_tokens - usage.cache_write_tokens, 0)
    write_price = price.cache_write if price.cache_write is not None else price.input
    cost = (
        Decimal(uncached) * price.input
        + Decimal(usage.cached_input_tokens) * price.cached_input
        + Decimal(usage.cache_write_tokens) * write_price
        + Decimal(usage.output_tokens) * price.output
    )
    return int(cost.to_integral_value())
