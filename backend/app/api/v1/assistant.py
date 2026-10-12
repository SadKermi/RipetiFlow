"""Matita (D-40..D-42)."""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.api.deps import CurrentUserDep
from app.assistant.orchestrator import Matita
from app.assistant.schemas import AssistantReply, AssistantRequest
from app.core.errors import ApiError

router = APIRouter(tags=["assistant"])


@router.post("/assistant/messages", response_model=AssistantReply)
async def post_message(request: Request, body: AssistantRequest, user: CurrentUserDep) -> AssistantReply:
    provider = request.app.state.assistant_provider
    if provider is None:
        raise ApiError("unavailable", "Matita non è disponibile: nessun provider AI configurato.")
    matita = Matita(request.app.state.db, provider, request.app.state.settings)
    return await matita.handle(user, body)
