"""Matita guardrails enforced in code (D-42), independent of what the model does."""

from __future__ import annotations

import datetime as dt
import re
import uuid
from dataclasses import dataclass, field
from typing import Any

from pydantic import TypeAdapter, ValidationError

from app.assistant.schemas import (
    MAX_CHARS,
    MAX_DRAFTS,
    DraftIn,
    LessonDraft,
    LessonDraftIn,
    MessageDraft,
    MessageDraftIn,
    PaymentDraft,
    PaymentDraftIn,
)
from app.db.pool import Conn
from app.domain.common import (
    TutorClock,
    check_date_window,
    check_lesson_times,
    display_name,
    format_date_it,
    format_euro,
    lesson_amount_cents,
)
from app.schemas import StudentRef, SubjectRef

REFUSAL_TEXT = (
    "Posso aiutarti solo con il tuo registro: lezioni, pagamenti, saldi e messaggi per studenti e "
    "famiglie. Prova per esempio: «quanto mi deve Giulia?»"
)
INVALID_OUTPUT_TEXT = (
    "Non sono riuscito a preparare una risposta affidabile. Riprova con una richiesta più semplice, "
    "per esempio: «quanto mi deve Giulia?»"
)
UNVERIFIED_NUMBERS_TEXT = (
    "Per risponderti con numeri precisi devo consultare il registro, ma questa volta non l'ho fatto. "
    "Riprova la domanda, per esempio indicando lo studente o il periodo."
)

_EMOJI = re.compile(
    "["
    "\U0001f000-\U0001faff"  # pictographs, emoticons, transport, symbols & pictographs ext.
    "\U0001f1e6-\U0001f1ff"  # flags
    "☀-➿"  # misc symbols & dingbats
    "⬀-⯿"  # arrows/stars used as emoji
    "️‍⃣"  # variation selector, ZWJ, keycap
    "]+"
)
_AMOUNT = re.compile(
    r"(?:€\s?(?P<a>\d{1,3}(?:\.\d{3})+|\d+)(?:,(?P<ac>\d{1,2}))?)"
    r"|(?:(?P<b>\d{1,3}(?:\.\d{3})+|\d+)(?:,(?P<bc>\d{1,2}))?\s?(?:€|euro\b|eur\b))",
    re.IGNORECASE,
)

_DRAFT_ADAPTER: TypeAdapter[LessonDraftIn | PaymentDraftIn | MessageDraftIn] = TypeAdapter(DraftIn)


def clean_text(text: str, limit: int = MAX_CHARS) -> str:
    text = _EMOJI.sub("", text)
    text = re.sub(r"[ \t]{2,}", " ", text).strip()
    if len(text) > limit:
        text = text[: limit - 1].rstrip() + "…"
    return text


def amounts_in(text: str) -> set[int]:
    """Euro amounts written in Italian text, in cents ("45,00 €", "€ 50", "1.200 euro")."""
    found: set[int] = set()
    for match in _AMOUNT.finditer(text):
        euros = match.group("a") or match.group("b")
        cents = match.group("ac") or match.group("bc") or "0"
        if euros is None:
            continue
        value = int(euros.replace(".", "")) * 100 + int(cents.ljust(2, "0"))
        found.add(value)
    return found


def unverified_amounts(reply: str, known_cents: set[int], user_text: str, draft_cents: set[int]) -> set[int]:
    """Amounts in the reply that no tool returned and the user did not write."""
    allowed = known_cents | amounts_in(user_text) | draft_cents
    return {a for a in amounts_in(reply) if a not in allowed}


@dataclass
class Enriched:
    drafts: list[LessonDraft | PaymentDraft | MessageDraft] = field(default_factory=list)
    discarded: list[str] = field(default_factory=list)


async def _student(conn: Conn, raw_id: uuid.UUID) -> Any:
    # RLS: a student of another tutor is simply not found.
    return await conn.fetchrow(
        "select id, first_name, last_name, archived_at, default_subject_id from app.students where id = $1",
        raw_id,
    )


async def _lesson(conn: Conn, draft: LessonDraftIn, clock: TutorClock, out: Enriched) -> None:
    student = await _student(conn, draft.student_id)
    if student is None:
        out.discarded.append("studente non trovato")
        return
    errors = check_lesson_times(draft.start_time, draft.end_time) + check_date_window(draft.date, clock.today)
    if errors:
        out.discarded.append(errors[0].message.rstrip(".").lower())
        return
    warnings: list[str] = []
    subject: SubjectRef | None = None
    subject_id = draft.subject_id if draft.subject_id is not None else student["default_subject_id"]
    if subject_id is not None:
        row = await conn.fetchrow("select id, name from app.subjects where id = $1", subject_id)
        if row is not None:
            subject = SubjectRef(id=row["id"], name=row["name"])
        elif draft.subject_id is not None:
            warnings.append("Materia non riconosciuta: lasciata vuota.")
    # D-16 / docs/06: the price never comes from the model.
    rate = await conn.fetchval("select app.rate_for($1, $2)", student["id"], draft.date)
    if rate is None:
        out.discarded.append("lo studente non ha una tariffa")
        return
    minutes = (draft.end_time.hour * 60 + draft.end_time.minute) - (
        draft.start_time.hour * 60 + draft.start_time.minute
    )
    first_name = student["first_name"]
    overlapping = await conn.fetch(
        """select l.student_id, s.first_name, s.last_name, l.start_time, l.end_time
           from app.lessons l join app.students s on s.id = l.student_id
           where l.tutor_id = (select auth.uid()) and l.lesson_date = $1
             and l.start_time < $3 and l.end_time > $2
           order by l.start_time""",
        draft.date,
        draft.start_time,
        draft.end_time,
    )
    for other in overlapping:
        when = f"{format_date_it(draft.date, with_year=False)} alle {other['start_time']:%H:%M}"
        if other["student_id"] == student["id"]:
            warnings.append(f"Esiste già una lezione con {first_name} il {when}.")
        else:
            name = display_name(other["first_name"], other["last_name"])
            warnings.append(
                f"Si sovrappone alla lezione con {name} del {format_date_it(draft.date, with_year=False)} "
                f"({other['start_time']:%H:%M}–{other['end_time']:%H:%M})."
            )
    if dt.datetime.combine(draft.date, draft.end_time) > clock.local_naive:
        warnings.append("Data nel futuro: la lezione sarà programmata.")
    if student["archived_at"] is not None:
        warnings.append("Lo studente è archiviato.")
    out.drafts.append(
        LessonDraft(
            id=uuid.uuid4(),
            student=StudentRef(id=student["id"], display_name=display_name(first_name, student["last_name"])),
            subject=subject,
            date=draft.date,
            start_time=draft.start_time,
            end_time=draft.end_time,
            hourly_rate_cents=int(rate),
            amount_cents=lesson_amount_cents(int(rate), minutes),
            topic=clean_text(draft.topic, 200) or None if draft.topic else None,
            notes=clean_text(draft.notes, 4000) or None if draft.notes else None,
            warnings=warnings,
        )
    )


async def _payment(conn: Conn, draft: PaymentDraftIn, clock: TutorClock, out: Enriched) -> None:
    student = await _student(conn, draft.student_id)
    if student is None:
        out.discarded.append("studente non trovato")
        return
    errors = check_date_window(draft.paid_on, clock.today, "paid_on")
    if errors:
        out.discarded.append(errors[0].message.rstrip(".").lower())
        return
    warnings: list[str] = []
    duplicate = await conn.fetchval(
        """select exists(select 1 from app.payments
           where student_id = $1 and paid_on = $2 and amount_cents = $3)""",
        student["id"],
        draft.paid_on,
        draft.amount_cents,
    )
    if duplicate:
        warnings.append(
            f"Esiste già un pagamento di {format_euro(draft.amount_cents)} di {student['first_name']} "
            f"il {format_date_it(draft.paid_on, with_year=False)}."
        )
    if draft.paid_on > clock.today:
        warnings.append("Data nel futuro.")
    if student["archived_at"] is not None:
        warnings.append("Lo studente è archiviato.")
    out.drafts.append(
        PaymentDraft(
            id=uuid.uuid4(),
            student=StudentRef(
                id=student["id"], display_name=display_name(student["first_name"], student["last_name"])
            ),
            amount_cents=draft.amount_cents,
            paid_on=draft.paid_on,
            method=draft.method,
            note=clean_text(draft.note, 500) or None if draft.note else None,
            warnings=warnings,
        )
    )


def _message(draft: MessageDraftIn, out: Enriched) -> None:
    text = clean_text(draft.text)
    if not text:
        out.discarded.append("messaggio vuoto")
        return
    out.drafts.append(
        MessageDraft(
            id=uuid.uuid4(),
            recipient_hint=clean_text(draft.recipient_hint, 120),
            channel=draft.channel,
            text=text,
        )
    )


async def enrich_drafts(conn: Conn, raw_drafts: list[dict[str, Any]], clock: TutorClock) -> Enriched:
    """Validate each draft, then recompute/verify it against the database (as the user)."""
    out = Enriched()
    if len(raw_drafts) > MAX_DRAFTS:
        out.discarded.append(f"al massimo {MAX_DRAFTS} bozze per richiesta")
    for raw in raw_drafts[:MAX_DRAFTS]:
        try:
            draft = _DRAFT_ADAPTER.validate_python(raw)
        except ValidationError:
            out.discarded.append("dati incompleti o non validi")
            continue
        if isinstance(draft, LessonDraftIn):
            await _lesson(conn, draft, clock, out)
        elif isinstance(draft, PaymentDraftIn):
            await _payment(conn, draft, clock, out)
        else:
            _message(draft, out)
    return out


def discarded_note(reasons: list[str]) -> str:
    if not reasons:
        return ""
    unique = list(dict.fromkeys(reasons))
    count = len(reasons)
    noun = "una bozza non valida" if count == 1 else f"{count} bozze non valide"
    return f"\n\nNota: ho scartato {noun} ({'; '.join(unique)})."
