"""Matita: request/response models (docs/05-api.md) and the model's structured output (docs/06 §4)."""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas import HHMM, PaymentMethod, StudentRef, SubjectRef

MAX_TURNS = 20
MAX_CHARS = 2000
MAX_DRAFTS = 5

# ---------------------------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------------------------


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: Annotated[str, Field(min_length=1, max_length=MAX_CHARS)]


class AssistantContext(BaseModel):
    student_id: uuid.UUID | None = None
    today: dt.date | None = None


class AssistantRequest(BaseModel):
    messages: Annotated[list[ChatTurn], Field(min_length=1, max_length=MAX_TURNS)]
    context: AssistantContext | None = None

    @field_validator("messages")
    @classmethod
    def _last_is_user(cls, value: list[ChatTurn]) -> list[ChatTurn]:
        if value[-1].role != "user":
            raise ValueError("L'ultimo messaggio deve essere dell'utente.")
        return value


class LessonDraft(BaseModel):
    type: Literal["lesson"] = "lesson"
    id: uuid.UUID
    student: StudentRef
    subject: SubjectRef | None
    date: dt.date
    start_time: HHMM
    end_time: HHMM
    hourly_rate_cents: int
    amount_cents: int
    topic: str | None
    notes: str | None
    warnings: list[str]


class PaymentDraft(BaseModel):
    type: Literal["payment"] = "payment"
    id: uuid.UUID
    student: StudentRef
    amount_cents: int
    paid_on: dt.date
    method: PaymentMethod
    note: str | None
    warnings: list[str]


class MessageDraft(BaseModel):
    type: Literal["message"] = "message"
    id: uuid.UUID
    recipient_hint: str
    channel: Literal["whatsapp", "email", "sms"]
    text: str


Draft = Annotated[LessonDraft | PaymentDraft | MessageDraft, Field(discriminator="type")]


class AssistantUsage(BaseModel):
    requests_today: int
    daily_limit: int


class AssistantReply(BaseModel):
    reply: str
    drafts: list[Draft]
    refused: bool
    usage: AssistantUsage


# ---------------------------------------------------------------------------------------------
# Model output (validated with Pydantic; anything else gets a fixed "riprova" text, docs/06 §4)
# ---------------------------------------------------------------------------------------------


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LessonDraftIn(_Strict):
    type: Literal["lesson"]
    student_id: uuid.UUID
    subject_id: uuid.UUID | None
    date: dt.date
    start_time: HHMM
    end_time: HHMM
    topic: Annotated[str, Field(max_length=200)] | None
    notes: Annotated[str, Field(max_length=4000)] | None


class PaymentDraftIn(_Strict):
    type: Literal["payment"]
    student_id: uuid.UUID
    amount_cents: Annotated[int, Field(ge=1, le=10_000_000)]
    paid_on: dt.date
    method: PaymentMethod
    note: Annotated[str, Field(max_length=500)] | None


class MessageDraftIn(_Strict):
    type: Literal["message"]
    recipient_hint: Annotated[str, Field(min_length=1, max_length=120)]
    channel: Literal["whatsapp", "email", "sms"]
    text: Annotated[str, Field(min_length=1, max_length=MAX_CHARS)]


DraftIn = Annotated[LessonDraftIn | PaymentDraftIn | MessageDraftIn, Field(discriminator="type")]


class ModelOutput(_Strict):
    reply: str
    refused: bool
    # Drafts are validated one by one, so a single bad draft does not discard the others.
    drafts: list[dict[str, Any]]


def _nullable(schema: dict[str, Any]) -> dict[str, Any]:
    return {"anyOf": [schema, {"type": "null"}]}


def _obj(properties: dict[str, Any]) -> dict[str, Any]:
    # Strict mode (OpenAI and Anthropic): every property required, no extra keys.
    return {
        "type": "object",
        "properties": properties,
        "required": list(properties),
        "additionalProperties": False,
    }


_STR = {"type": "string"}

OUTPUT_SCHEMA: dict[str, Any] = _obj(
    {
        "reply": {"type": "string", "description": "Risposta per l'utente, in italiano."},
        "refused": {"type": "boolean", "description": "true solo se la richiesta è fuori ambito."},
        "drafts": {
            "type": "array",
            "description": "Da 0 a 5 bozze a matita.",
            "items": {
                "anyOf": [
                    _obj(
                        {
                            "type": {"type": "string", "enum": ["lesson"]},
                            "student_id": {"type": "string", "description": "id restituito dagli strumenti"},
                            "subject_id": _nullable(_STR),
                            "date": {"type": "string", "description": "AAAA-MM-GG"},
                            "start_time": {"type": "string", "description": "HH:MM"},
                            "end_time": {"type": "string", "description": "HH:MM"},
                            "topic": _nullable(_STR),
                            "notes": _nullable(_STR),
                        }
                    ),
                    _obj(
                        {
                            "type": {"type": "string", "enum": ["payment"]},
                            "student_id": {"type": "string"},
                            "amount_cents": {"type": "integer", "description": "importo in centesimi"},
                            "paid_on": {"type": "string", "description": "AAAA-MM-GG"},
                            "method": {"type": "string", "enum": ["cash", "bank_transfer", "other"]},
                            "note": _nullable(_STR),
                        }
                    ),
                    _obj(
                        {
                            "type": {"type": "string", "enum": ["message"]},
                            "recipient_hint": {"type": "string"},
                            "channel": {"type": "string", "enum": ["whatsapp", "email", "sms"]},
                            "text": {"type": "string"},
                        }
                    ),
                ]
            },
        },
    }
)
