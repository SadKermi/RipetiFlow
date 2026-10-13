"""Matita guardrails enforced in code (D-42), independent of what the model does.

Amounts (D-42: "i numeri mostrati nelle bozze vengono dagli strumenti"). Every euro amount written
in the reply or in a message draft must come from an allowed source:
- a successful data-tool result of this request (`ToolContext.known_cents`);
- a number the user wrote in any turn (read leniently: "50", "37,50", "cinquanta");
- an amount in an earlier assistant turn of the conversation (it passed this same check then);
- a lesson draft of this response (rate and amount are recomputed from the ledger);
- a payment draft of this response whose amount is itself from one of the sources above.
A payment draft with an amount from nowhere is kept with a warning (the user may have dictated it in a
form the parser does not read); a message draft with an unverified amount is discarded; a reply with
an unverified amount is replaced. Text inside the data (e.g. student notes) is never a source.
"""

from __future__ import annotations

import datetime as dt
import re
import unicodedata
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
# Output that fails validation is not a refusal (refused=false): the request may well be in scope.
INVALID_OUTPUT_TEXT = (
    "Non sono riuscito a preparare una risposta affidabile. Riprova con una richiesta più semplice, "
    "per esempio: «quanto mi deve Giulia?»"
)
UNVERIFIED_NUMBERS_TEXT = (
    "Non sono riuscito a verificare sul registro gli importi della risposta, quindi non te li mostro. "
    "Riprova la domanda, per esempio indicando lo studente o il periodo."
)
UNVERIFIED_NUMBERS_WITH_DRAFTS_TEXT = (
    "Ecco le bozze. Non ti mostro il riepilogo perché conteneva importi che non ho potuto verificare "
    "sul registro."
)
UNSTATED_AMOUNT_WARNING = "Importo non indicato nel messaggio: verificalo."
DUPLICATE_DRAFT_WARNING = "Duplica un'altra bozza di questa risposta."

_EMOJI = re.compile(
    "["
    "\U0001f000-\U0001faff"  # pictographs, emoticons, transport, symbols & pictographs ext.
    "\U0001f1e6-\U0001f1ff"  # flags
    "☀-➿"  # misc symbols & dingbats
    "⬀-⯿"  # arrows/stars used as emoji
    "️‍⃣"  # variation selector, ZWJ, keycap
    "]+"
)
# Amounts as Matita writes them: with a currency marker ("45,00 €", "€ 50", "1.200 euro").
_AMOUNT = re.compile(
    r"(?:€\s?(?P<a>\d{1,3}(?:\.\d{3})+|\d+)(?:,(?P<ac>\d{1,2}))?)"
    r"|(?:(?P<b>\d{1,3}(?:\.\d{3})+|\d+)(?:,(?P<bc>\d{1,2}))?\s?(?:€|euro\b|eur\b))",
    re.IGNORECASE,
)
# Any number the user typed, read as euros ("50", "37,50", "37.50", "1.200").
_NUMBER = re.compile(r"(?<![\d])(?P<int>\d{1,3}(?:\.\d{3})+|\d+)(?:[.,](?P<dec>\d{1,2}))?(?![\d])")
_WORD = re.compile(r"[a-z]+")

_DRAFT_ADAPTER: TypeAdapter[LessonDraftIn | PaymentDraftIn | MessageDraftIn] = TypeAdapter(DraftIn)
# D-16 / docs/06: the price of a lesson never comes from the model, so a price it adds is dropped.
_LESSON_PRICE_KEYS = ("hourly_rate_cents", "amount_cents", "rate_cents", "price_cents")


def clean_text(text: str, limit: int = MAX_CHARS) -> str:
    text = _EMOJI.sub("", text)
    text = re.sub(r"[ \t]{2,}", " ", text).strip()
    if len(text) > limit:
        text = text[: max(limit - 1, 0)].rstrip() + "…"
    return text


def amounts_in(text: str) -> set[int]:
    """Euro amounts written in Italian text with a currency marker, in cents."""
    found: set[int] = set()
    for match in _AMOUNT.finditer(text):
        euros = match.group("a") or match.group("b")
        cents = match.group("ac") or match.group("bc") or "0"
        if euros is None:
            continue
        found.add(int(euros.replace(".", "")) * 100 + int(cents.ljust(2, "0")))
    return found


# --- Italian number words ("cinquanta", "centoventi", "duemilacinquecento"), read leniently ---------

_UNITS = {"un": 1, "uno": 1, "una": 1, "due": 2, "tre": 3, "quattro": 4, "cinque": 5}
_UNITS |= {"sei": 6, "sette": 7, "otto": 8, "nove": 9}
_TEENS = {"dieci": 10, "undici": 11, "dodici": 12, "tredici": 13, "quattordici": 14, "quindici": 15}
_TEENS |= {"sedici": 16, "diciassette": 17, "diciotto": 18, "diciannove": 19}
_TENS = {"venti": 20, "trenta": 30, "quaranta": 40, "cinquanta": 50}
_TENS |= {"sessanta": 60, "settanta": 70, "ottanta": 80, "novanta": 90}


def _below_100(word: str) -> int | None:
    if word in _UNITS:
        return _UNITS[word]
    if word in _TEENS:
        return _TEENS[word]
    for tens, value in _TENS.items():
        if word == tens:
            return value
        if word.startswith(tens) and word[len(tens) :] in _UNITS:  # "trentacinque"
            return value + _UNITS[word[len(tens) :]]
        rest = word[len(tens) - 1 :]
        if word.startswith(tens[:-1]) and rest in ("un", "uno", "otto"):  # "ventuno", "quarantotto"
            return value + _UNITS[rest]
    return None


def _below_1000(word: str) -> int | None:
    head, found, tail = word.partition("cento")
    if not found:
        return _below_100(word)
    hundreds = 1 if not head else _UNITS.get(head)
    if hundreds is None or (head and hundreds < 2):
        return None
    if not tail:
        return hundreds * 100
    rest = _below_100(tail) or _below_100("o" + tail)  # "centottanta"
    return None if rest is None else hundreds * 100 + rest


def italian_number(word: str) -> int | None:
    """Value of an Italian number word below 1.000.000 (accents already stripped), else None."""
    if word.startswith("mille"):
        thousands, tail = 1, word[len("mille") :]
    elif "mila" in word:
        head, _, tail = word.partition("mila")
        thousands = _below_1000(head) or 0
        if thousands < 2:
            return None
    else:
        return _below_1000(word)
    rest = _below_1000(tail) if tail else 0
    return None if rest is None else thousands * 1000 + rest


def stated_cents(text: str) -> set[int]:
    """Every number in a user's text, read as an amount in euros (lenient on purpose: it only ever
    widens what Matita may repeat, it never invents an amount)."""
    found = set(amounts_in(text))
    for match in _NUMBER.finditer(text):
        whole = int(match.group("int").replace(".", ""))
        decimals = match.group("dec")
        found.add(whole * 100 + (int(decimals.ljust(2, "0")) if decimals else 0))
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    for word in _WORD.findall(ascii_text):
        value = italian_number(word)
        if value is not None:
            found.add(value * 100)
    return found


def unverified_amounts(text: str, allowed: set[int]) -> set[int]:
    """Amounts (with a currency marker) in `text` that come from no allowed source."""
    return {a for a in amounts_in(text) if a not in allowed}


@dataclass(frozen=True)
class AmountSources:
    tool_cents: set[int]  # from successful data-tool results of this request
    user_text: str  # every user turn
    assistant_text: str  # every earlier assistant turn

    def allowed(self) -> set[int]:
        return set(self.tool_cents) | stated_cents(self.user_text) | amounts_in(self.assistant_text)


@dataclass
class Enriched:
    drafts: list[LessonDraft | PaymentDraft | MessageDraft] = field(default_factory=list)
    discarded: list[str] = field(default_factory=list)
    # Amounts the reply may show: the sources plus the amounts of this response's verified drafts.
    allowed_cents: set[int] = field(default_factory=set)


async def _student(conn: Conn, raw_id: uuid.UUID) -> Any:
    # RLS: a student of another tutor is simply not found.
    return await conn.fetchrow(
        "select id, first_name, last_name, archived_at, default_subject_id from app.students where id = $1",
        raw_id,
    )


def _overlaps(a: LessonDraft, start: dt.time, end: dt.time, day: dt.date) -> bool:
    return a.date == day and a.start_time < end and a.end_time > start


async def _lesson(
    conn: Conn, draft: LessonDraftIn, clock: TutorClock, out: Enriched, others: list[LessonDraft]
) -> LessonDraft | None:
    student = await _student(conn, draft.student_id)
    if student is None:
        out.discarded.append("studente non trovato")
        return None
    errors = check_lesson_times(draft.start_time, draft.end_time) + check_date_window(draft.date, clock.today)
    if errors:
        out.discarded.append(errors[0].message.rstrip(".").lower())
        return None
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
        return None
    minutes = (draft.end_time.hour * 60 + draft.end_time.minute) - (
        draft.start_time.hour * 60 + draft.start_time.minute
    )
    first_name = student["first_name"]
    name = display_name(first_name, student["last_name"])
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
    day = format_date_it(draft.date, with_year=False)
    for other in overlapping:
        if other["student_id"] == student["id"]:
            warnings.append(
                f"Esiste già una lezione con {first_name} il {day} alle {other['start_time']:%H:%M}."
            )
        else:
            other_name = display_name(other["first_name"], other["last_name"])
            warnings.append(
                f"Si sovrappone alla lezione con {other_name} del {day} "
                f"({other['start_time']:%H:%M}–{other['end_time']:%H:%M})."
            )
    # Drafts of the same response (e.g. a model repeating itself, or "ogni martedì" twice the same day).
    for other_draft in others:
        if not _overlaps(other_draft, draft.start_time, draft.end_time, draft.date):
            continue
        same = (
            other_draft.student.id == student["id"]
            and other_draft.start_time == draft.start_time
            and other_draft.end_time == draft.end_time
        )
        if same:
            warnings.append(DUPLICATE_DRAFT_WARNING)
            continue
        warnings.append(
            f"Si sovrappone a un'altra bozza ({other_draft.student.display_name}, "
            f"{other_draft.start_time:%H:%M}–{other_draft.end_time:%H:%M})."
        )
        back = f"Si sovrappone a un'altra bozza ({name}, {draft.start_time:%H:%M}–{draft.end_time:%H:%M})."
        if back not in other_draft.warnings:
            other_draft.warnings.append(back)
    if dt.datetime.combine(draft.date, draft.end_time) > clock.local_naive:
        warnings.append("Data nel futuro: la lezione sarà programmata.")
    if student["archived_at"] is not None:
        warnings.append("Lo studente è archiviato.")
    amount = lesson_amount_cents(int(rate), minutes)
    out.allowed_cents.update({int(rate), amount})
    return LessonDraft(
        id=uuid.uuid4(),
        student=StudentRef(id=student["id"], display_name=name),
        subject=subject,
        date=draft.date,
        start_time=draft.start_time,
        end_time=draft.end_time,
        hourly_rate_cents=int(rate),
        amount_cents=amount,
        topic=clean_text(draft.topic, 200) or None if draft.topic else None,
        notes=clean_text(draft.notes, 4000) or None if draft.notes else None,
        warnings=list(dict.fromkeys(warnings)),  # e.g. the same overlap with two identical drafts
    )


async def _payment(
    conn: Conn, draft: PaymentDraftIn, clock: TutorClock, out: Enriched, others: list[PaymentDraft]
) -> PaymentDraft | None:
    student = await _student(conn, draft.student_id)
    if student is None:
        out.discarded.append("studente non trovato")
        return None
    errors = check_date_window(draft.paid_on, clock.today, "paid_on")
    if errors:
        out.discarded.append(errors[0].message.rstrip(".").lower())
        return None
    warnings: list[str] = []
    # Checked against the sources and this response's lesson drafts only, never against itself.
    if draft.amount_cents not in out.allowed_cents:
        warnings.append(UNSTATED_AMOUNT_WARNING)
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
    if any(
        p.student.id == student["id"] and p.paid_on == draft.paid_on and p.amount_cents == draft.amount_cents
        for p in others
    ):
        warnings.append(DUPLICATE_DRAFT_WARNING)
    if draft.paid_on > clock.today:
        warnings.append("Data nel futuro.")
    if student["archived_at"] is not None:
        warnings.append("Lo studente è archiviato.")
    return PaymentDraft(
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


def _message(draft: MessageDraftIn, out: Enriched) -> MessageDraft | None:
    text = clean_text(draft.text)
    if not text:
        out.discarded.append("messaggio vuoto")
        return None
    if unverified_amounts(text, out.allowed_cents):
        # A made-up debt in a payment reminder would be copied straight to a parent.
        out.discarded.append("messaggio con importi non verificati sul registro")
        return None
    return MessageDraft(
        id=uuid.uuid4(),
        recipient_hint=clean_text(draft.recipient_hint, 120),
        channel=draft.channel,
        text=text,
    )


def _parse(raw: dict[str, Any]) -> LessonDraftIn | PaymentDraftIn | MessageDraftIn | None:
    if raw.get("type") == "lesson":
        raw = {k: v for k, v in raw.items() if k not in _LESSON_PRICE_KEYS}
    try:
        return _DRAFT_ADAPTER.validate_python(raw)
    except ValidationError:
        return None


async def enrich_drafts(
    conn: Conn, raw_drafts: list[dict[str, Any]], clock: TutorClock, sources: AmountSources
) -> Enriched:
    """Validate each draft, then recompute/verify it against the database (as the user).

    Lessons are handled first (their amounts come from the ledger), then payments (checked against
    those amounts too), then messages (checked against everything verified); the output keeps the
    model's order.
    """
    out = Enriched(allowed_cents=sources.allowed())
    extra = len(raw_drafts) - MAX_DRAFTS
    if extra > 0:
        out.discarded.extend([f"oltre il massimo di {MAX_DRAFTS} bozze per richiesta"] * extra)
    parsed = [_parse(raw) for raw in raw_drafts[:MAX_DRAFTS]]
    slots: list[LessonDraft | PaymentDraft | MessageDraft | None] = [None] * len(parsed)
    for index, draft in enumerate(parsed):
        if draft is None:
            out.discarded.append("dati incompleti o non validi")
        elif isinstance(draft, LessonDraftIn):
            lessons = [d for d in slots if isinstance(d, LessonDraft)]
            slots[index] = await _lesson(conn, draft, clock, out, lessons)
    for index, draft in enumerate(parsed):
        if isinstance(draft, PaymentDraftIn):
            payments = [d for d in slots if isinstance(d, PaymentDraft)]
            slots[index] = await _payment(conn, draft, clock, out, payments)
    for done in slots:
        if isinstance(done, PaymentDraft) and UNSTATED_AMOUNT_WARNING not in done.warnings:
            out.allowed_cents.add(done.amount_cents)
    for index, draft in enumerate(parsed):
        if isinstance(draft, MessageDraftIn):
            slots[index] = _message(draft, out)
    out.drafts = [d for d in slots if d is not None]
    return out


def discarded_note(reasons: list[str]) -> str:
    """One note for every discarded draft: "ho scartato 2 bozze (motivo; motivo)"."""
    if not reasons:
        return ""
    unique = list(dict.fromkeys(reasons))
    noun = "una bozza" if len(reasons) == 1 else f"{len(reasons)} bozze"
    return f"\n\nNota: ho scartato {noun} ({'; '.join(unique)})."
