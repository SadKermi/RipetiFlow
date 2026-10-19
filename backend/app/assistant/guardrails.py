"""Matita guardrails enforced in code (D-42), independent of what the model does.

Numbers (D-42: "i numeri mostrati nelle bozze vengono dagli strumenti"). Every euro amount and every
duration in a text Matita shows (the reply, a message draft and its recipient, the topic and notes of
a lesson draft, the note of a payment draft) must come from an allowed source:
- a successful data-tool result of this request (`ToolContext.known_cents` / `known_minutes`);
- a number the user wrote in any turn, read leniently ("50", "37,50", "cinquanta", "un'ora e mezza";
  "2" may be 2 € or 2 hours), but never the parts of a clock time or a date ("16:30", "06/10");
- an earlier assistant turn of the conversation (it passed this same check then);
- the tutor's default lesson length;
- a lesson draft of this response (rate, amount and duration are recomputed from the ledger), and the
  totals of the lesson drafts;
- a payment draft of this response whose amount is itself from one of the sources above.
A reply with an unverified number is replaced; a message draft with one is discarded; a payment draft
whose amount comes from nowhere is kept with a warning (the user may have dictated it in a form the
parser does not read), and so is a lesson or payment draft with an unverified number in its free
text. Text inside the data (e.g. student notes) is never a source.

What is read as a number:
- amounts in every common spelling: "45,00 €", "€45", "45 euro", "EUR 45", "45.50 €", "1.234,50 €",
  "1,234.50 €", "1 234,00 €", "45–50 €", "tra 45 e 50 €", "trenta euro", and "45,00" (two decimals,
  no currency) unless a unit or a clock word says otherwise ("1,50 ore", "33,33%", "alle 16,30").
  An amount next to a currency marker whose separators allow no single reading ("1.2345 €",
  "30.30,00 €") is UNREADABLE and never verified;
- durations: "2 ore", "1,5 h", "1:30 h", "1 h 30 min", "1h30", "un'ora e mezza", "tre quarti d'ora",
  "90 minuti". One introduced by "circa", "quasi", "più di"... may round its source by up to
  APPROX_TOLERANCE_MINUTES. A rate ("30 €/h", "30 € all'ora", "30 € per un'ora") is no duration;
- never: plain counts ("2 studenti"), years, phone numbers, percentages, clock times and dates.
Checks read text as the reader sees it: invisible format characters (zero-width spaces, joiners, bidi
controls) are removed from every text shown and any space becomes a plain one, and compatibility forms
("⁴⁵", fullwidth digits, no-break spaces) are folded before reading.
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
    format_minutes,
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
    "Non sono riuscito a verificare sul registro gli importi o le ore della risposta, quindi non te li "
    "mostro. Riprova la domanda, per esempio indicando lo studente o il periodo."
)
UNVERIFIED_NUMBERS_WITH_DRAFTS_TEXT = (
    "Ecco le bozze. Non ti mostro il riepilogo perché conteneva importi o ore che non ho potuto "
    "verificare sul registro."
)
UNSTATED_AMOUNT_WARNING = "Importo non indicato nel messaggio: verificalo."
UNVERIFIED_TEXT_WARNING = "Il testo contiene importi o ore non verificati sul registro: controllalo."
DUPLICATE_DRAFT_WARNING = "Duplica un'altra bozza di questa risposta."
MESSAGE_AMOUNTS_REASON = "messaggio con importi non verificati sul registro"
MESSAGE_HOURS_REASON = "messaggio con ore non verificate sul registro"

# An amount next to a currency marker that cannot be read unambiguously: never an allowed amount.
UNREADABLE = -1
# "circa 2 ore" for 2 h 10 min: an approximate duration may round its source by this much.
APPROX_TOLERANCE_MINUTES = 15

_EMOJI = re.compile(
    "["
    "\U0001f000-\U0001faff"  # pictographs, emoticons, transport, symbols & pictographs ext.
    "\U0001f1e6-\U0001f1ff"  # flags
    "☀-➿"  # misc symbols & dingbats
    "⬀-⯿"  # arrows/stars used as emoji
    "️‍⃣"  # variation selector, ZWJ, keycap
    "]+"
)

# --- Reading numbers ------------------------------------------------------------------------------
# The patterns run on `_scan(text)`: lower case, compatibility forms folded, invisible characters out.

_L = r"[^\W\d_]"  # a letter, accented ones included
_MARKER = rf"(?:€|(?<!{_L})eur(?:o|i)?(?!{_L}))"
# A written number: digit groups joined by "." or "," ("1.234,50", "1,234.50", "45"), or by a space
# before a group of exactly three digits ("1 234,50"). `_read_amount` decides how to read it.
_NUM = r"\d+(?:(?:[.,]|\x20(?=\d{3}(?!\d)))\d+)*"
_RANGE = r"(?:\s*[-–—]\s*|\s+(?:e|o|a)\s+)"  # "45–50 €", "tra 45 e 50 €", "da 45 a 50 €"
_AMOUNT_THEN_MARKER = re.compile(
    rf"(?<![\d.,])(?:(?P<low>{_NUM}){_RANGE})?(?P<num>{_NUM})\s*(?P<marker>{_MARKER})"
)
_MARKER_THEN_AMOUNT = re.compile(
    rf"(?P<marker>{_MARKER})[ \t]*[:=]?[ \t]*[-+]?[ \t]*(?P<num>{_NUM})(?:\s*[-–—]\s*(?P<high>{_NUM}))?"
)
_MARKER_ONLY = re.compile(_MARKER)
# "45,00" with no currency: two decimals are money, unless a unit follows ("1,50 ore", "33,33%").
_BARE_AMOUNT = re.compile(
    r"(?<![\d.,])(?P<num>\d{1,3}(?:\.\d{3})+,\d{2}|\d{1,3}(?:\x20\d{3})+,\d{2}|\d+,\d{2})(?!\d|[.,]\d)"
    rf"(?!\s*(?:%|/\d|(?:ore|ora|h|minuti|minuto|min|km|kg|cm|mm|m|punti|volte|anni)(?!{_L})))"
)
# ... or a clock word comes before ("alle 16,30"). Also used for "dalle 15 alle 16 a 30 €"/"alle 16h".
_CLOCK_BEFORE = re.compile(
    rf"(?<!{_L})(?:alle|dalle|ore|verso le|entro le|fino alle|dopo le|prima delle)\s*$"
)
# Clock times and dates in the user's text: their parts are no amounts or durations the user stated.
_CLOCK_OR_DATE = re.compile(
    r"(?<!\d)\d{1,2}(?:[:.]\d{2})?\s*[-–]\s*\d{1,2}:\d{2}(?!\d)"  # "15-16:30", "15.00–16:30"
    r"|(?<!\d)\d{1,2}:\d{2}(?:\s*[-–]\s*\d{1,2}(?:[:.]\d{2})?)?(?!\d)"  # "16:30", "15:00-16"
    r"|(?<!\d)\d{4}-\d{1,2}-\d{1,2}(?!\d)"  # "2026-10-06"
    r"|(?<!\d)\d{1,2}/\d{1,2}(?:/\d{2,4})?(?!\d)"  # "06/10", "06/10/2026"
    rf"|(?<!{_L})(?:alle|dalle)\s+\d{{1,2}}(?:[.,:]\d{{2}})?(?!\d)"  # "alle 16", "dalle 15.30"
)
_ANY_NUMBER = re.compile(rf"(?<![\d.,]){_NUM}")
_WORD = re.compile(rf"{_L}+")
_WORD_OR_SIGN = re.compile(rf"{_L}+|\S")

# Durations. Hours first ("2 ore", "1,5 h", "1:30 h", "un'ora", "due ore"), with an optional tail of
# minutes ("30", "30 min", "e mezza", "e un quarto", "e quindici minuti"); then minutes alone.
_HOURS = re.compile(
    rf"(?<![\d.,:/⁄])(?P<num>\d+(?:[.,:]\d{{1,2}})?)\s*(?:ore|ora|h)(?!{_L})"
    rf"|(?<!{_L})(?P<word>{_L}+)(?:\s+|\s*'\s*)(?P<unit>ore|ora)(?!{_L})"
)
_HOURS_TAIL = re.compile(
    r"\s*(?:e\s+)?(?:"
    rf"(?P<min>\d{{1,2}})(?:\s*(?:minuti|minuto|min)(?!{_L})|(?!\s*\w))"
    rf"|(?P<half>mezz[ao])(?!{_L})"
    rf"|(?P<quarters>un|tre)\s+quart[oi](?!{_L})"
    rf"|(?P<word>{_L}+)\s+minut[oi](?!{_L})"
    ")"
)
_MINUTES = re.compile(
    rf"(?<![\d.,:/⁄])(?P<num>\d+)\s*(?:minuti|minuto|min)(?!{_L})"
    rf"|(?<!{_L})(?P<word>{_L}+)\s+minut[oi](?!{_L})"
    rf"|(?<!{_L})(?P<half>mezz(?:a\s*|\s*'\s*)?ora)(?!{_L})"
    rf"|(?<!{_L})(?P<quarters>un|tre)\s+quart[oi]\s+d\s*'\s*ora(?!{_L})"
)
_QUARTERS = {"un": 15, "tre": 45}
# "30 € per un'ora", "30 €/h": the unit of a rate, not a duration.
_RATE_BEFORE = re.compile(rf"{_MARKER}\s*(?:/|per|a|al|ogni)?\s*$")
_APPROXIMATE_BEFORE = re.compile(
    rf"(?<!{_L})(?:circa|quasi|oltre|più di|meno di|almeno|intorno a(?:lle)?|sulle|all'incirca|"
    r"poco più di|poco meno di)\s*$"
)
_ARTICLES = {"un", "uno", "una"}

_DRAFT_ADAPTER: TypeAdapter[LessonDraftIn | PaymentDraftIn | MessageDraftIn] = TypeAdapter(DraftIn)
# D-16 / docs/06: the price of a lesson never comes from the model, so a price it adds is dropped.
_LESSON_PRICE_KEYS = ("hourly_rate_cents", "amount_cents", "rate_cents", "price_cents")


def clean_text(text: str, limit: int = MAX_CHARS) -> str:
    """Model text as shown: no emoji, no invisible format characters (so the digits checked are the
    digits the reader sees), every space a plain one, no runs of spaces, at most `limit` characters."""
    text = _EMOJI.sub("", text)
    text = "".join(
        " " if unicodedata.category(c) == "Zs" else c for c in text if unicodedata.category(c) != "Cf"
    )
    text = re.sub(r"[ \t]{2,}", " ", text).strip()
    if len(text) > limit:
        text = text[: max(limit - 1, 0)].rstrip() + "…"
    return text


def _scan(text: str) -> str:
    """The text the checks read: compatibility forms folded ("⁴⁵", "４５" → "45", no-break spaces →
    spaces), invisible format characters and stray combining marks removed, lower case."""
    folded = unicodedata.normalize("NFKC", text)
    kept = "".join(c for c in folded if unicodedata.category(c) not in ("Cf", "Mn", "Me"))
    return kept.lower().replace("’", "'").replace("ʼ", "'")


def _preceded_by(pattern: re.Pattern[str], text: str, index: int) -> bool:
    """Whether the text just before `index` ends with `pattern` (a pattern ending in `\\s*$`)."""
    return pattern.search(text, max(0, index - 40), index) is not None


def _read_amount(number: str) -> int:
    """Cents of a written number read as euros: "45" → 4500, "45,5" and "45.50" → 4550, "1.234,50",
    "1,234.50" and "1 234,50" → 123450, "1.200" → 120000. UNREADABLE when its separators allow no
    single reading ("1.2345", "30.30,00", "1.234.5")."""
    groups = re.split(r"[., ]", number)
    separators = re.findall(r"[., ]", number)
    decimals = 0
    last = separators[-1] if separators else ""
    if last in (".", ",") and len(groups[-1]) <= 2 and separators.count(last) == 1:
        decimals = int(groups.pop().ljust(2, "0"))
        separators.pop()
    # What is left is the whole euros: one thousands separator, groups of three ("1.234", "1 234").
    if separators and (
        len(set(separators)) > 1 or len(groups[0]) > 3 or any(len(g) != 3 for g in groups[1:])
    ):
        return UNREADABLE
    return int("".join(groups)) * 100 + decimals


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


def _number_word(word: str) -> int | None:
    ascii_word = unicodedata.normalize("NFKD", word).encode("ascii", "ignore").decode()
    return italian_number(ascii_word)


def _words_before(text: str, index: int) -> int | None:
    """Value of the number words just before `index`: "trenta" → 30, "mille e duecento" → 1200."""
    total = 0
    words: list[str] = []
    for token in reversed(_WORD_OR_SIGN.findall(text, max(0, index - 80), index)):
        if token == "e" and words:
            continue
        value = _number_word(token)
        if value is None or value <= total:  # "trenta e cinquanta": only the last one is read
            break
        total += value
        words.append(token)
    if not words or (len(words) == 1 and words[0] in _ARTICLES):  # "neanche un euro"
        return None
    return total


# --- Amounts ---------------------------------------------------------------------------------------


def amounts_in(text: str) -> set[int]:
    """Euro amounts written in `text` (module docstring), in cents; UNREADABLE marks an amount next to
    a currency marker that cannot be read unambiguously."""
    scan = _scan(text)
    found: set[int] = set()
    suffix_markers: set[int] = set()
    for match in _AMOUNT_THEN_MARKER.finditer(scan):  # "45 €", "45–50 €", "45 euro"
        suffix_markers.add(match.start("marker"))
        found.add(_read_amount(match["num"]))
        if match["low"] and not _preceded_by(_CLOCK_BEFORE, scan, match.start("low")):
            found.add(_read_amount(match["low"]))
    for match in _MARKER_THEN_AMOUNT.finditer(scan):  # "€45", "EUR 45", "€ 45–50"
        if match.start("marker") not in suffix_markers:  # not "30 € 2 volte"
            found.update(_read_amount(n) for n in (match["num"], match["high"]) if n)
    for match in _MARKER_ONLY.finditer(scan):  # "trenta euro"
        value = _words_before(scan, match.start())
        if value is not None:
            found.add(value * 100)
    for match in _BARE_AMOUNT.finditer(scan):  # "45,00"
        if not _preceded_by(_CLOCK_BEFORE, scan, match.start()):
            found.add(_read_amount(match["num"]))
    return found


def stated_cents(text: str) -> set[int]:
    """Every number in a user's text, read as an amount in euros (lenient on purpose: it only ever
    widens what Matita may repeat, it never invents an amount). The parts of clock times and dates
    ("16:30", "06/10") are not numbers the user stated."""
    scan = _CLOCK_OR_DATE.sub(" ", _scan(text))
    found = amounts_in(scan)
    found.update(_read_amount(match.group()) for match in _ANY_NUMBER.finditer(scan))
    for word in _WORD.findall(scan):
        value = _number_word(word)
        if value is not None:
            found.add(value * 100)
    found.discard(UNREADABLE)
    return found


# --- Durations -------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Duration:
    readings: frozenset[int]  # minutes; "1,30 ore" reads as 1 h 18 min or as 1 h 30 min
    approximate: bool  # "circa 2 ore"

    @property
    def label(self) -> str:
        return format_minutes(min(self.readings))


def _hour_readings(number: str) -> set[int]:
    """Minutes in a number of hours: "2" → 120, "1,5" → 90, "1:30" → 90, "1,30" → 78 or 90."""
    separator = next((c for c in number if c in ".,:"), "")
    if not separator:
        return {int(number) * 60}
    whole, _, fraction = number.partition(separator)
    hours = int(whole) * 60
    if separator == ":":
        return {hours + int(fraction)} if int(fraction) < 60 else set()
    readings = {hours + round(int(fraction) * 60 / 10 ** len(fraction))}
    if len(fraction) == 2 and int(fraction) < 60:
        readings.add(hours + int(fraction))  # "1,30" said for "1 h 30"
    return readings


def _tail_minutes(tail: re.Match[str] | None) -> int | None:
    if tail is None:
        return None
    if tail["min"]:
        return int(tail["min"])
    if tail["half"]:
        return 30
    if tail["quarters"]:
        return _QUARTERS[tail["quarters"]]
    return _number_word(tail["word"])


def durations_in(text: str) -> list[Duration]:
    """Durations written in `text` (module docstring)."""
    scan = _scan(text)
    found: list[Duration] = []
    spans: list[tuple[int, int]] = []
    for match in _HOURS.finditer(scan):
        if match["num"]:
            readings = _hour_readings(match["num"])
        else:
            value = _number_word(match["word"])
            # "un'ora", "due ore"; never "sei ora" ("you are now"), "l'ora", "per ora".
            singular_ok = match["unit"] == "ore" or match["word"] in _ARTICLES
            readings = {value * 60} if value is not None and singular_ok else set()
        start, end = match.span()
        # "alle 16h" is a clock time, "30 € per un'ora" a rate.
        if _preceded_by(_CLOCK_BEFORE, scan, start) or _preceded_by(_RATE_BEFORE, scan, start):
            continue
        if not readings:
            continue
        tail = _HOURS_TAIL.match(scan, end)
        extra = _tail_minutes(tail)
        if tail is not None and extra is not None:
            readings = {r + extra for r in readings}
            end = tail.end()
        spans.append((start, end))
        found.append(Duration(frozenset(readings), _preceded_by(_APPROXIMATE_BEFORE, scan, start)))
    for start, end in spans:  # what is read as hours is not read again as minutes
        scan = scan[:start] + " " * (end - start) + scan[end:]
    for match in _MINUTES.finditer(scan):
        if match["num"]:
            minutes: int | None = int(match["num"])
        elif match["word"]:
            minutes = _number_word(match["word"])
        else:
            minutes = 30 if match["half"] else _QUARTERS[match["quarters"]]
        if minutes is not None:
            approximate = _preceded_by(_APPROXIMATE_BEFORE, scan, match.start())
            found.append(Duration(frozenset({minutes}), approximate))
    return found


def stated_minutes(text: str) -> set[int]:
    """Durations in a user's text, plus every number in it read as minutes or as hours (lenient, as
    `stated_cents`: "90" may be 90 minutes, "2" and "1,5" may be hours)."""
    found = {minutes for duration in durations_in(text) for minutes in duration.readings}
    for cents in stated_cents(text):
        if cents % 100 == 0:
            found.add(cents // 100)
        if cents * 60 % 100 == 0:
            found.add(cents * 60 // 100)
    return found


# --- Allowed numbers -------------------------------------------------------------------------------


@dataclass
class Allowed:
    cents: set[int] = field(default_factory=set)
    minutes: set[int] = field(default_factory=set)

    def unverified_amounts(self, text: str) -> set[int]:
        return {a for a in amounts_in(text) if a == UNREADABLE or a not in self.cents}

    def unverified_durations(self, text: str) -> list[Duration]:
        return [d for d in durations_in(text) if not self._known(d)]

    def _known(self, duration: Duration) -> bool:
        if duration.readings & self.minutes:
            return True
        return duration.approximate and any(
            abs(reading - known) <= APPROX_TOLERANCE_MINUTES
            for reading in duration.readings
            for known in self.minutes
        )

    def unverified(self, text: str) -> list[str]:
        """The numbers of `text` that come from no allowed source, for the logs ("999,00 €", "3 h")."""
        amounts = sorted(self.unverified_amounts(text))
        labels = ["importo illeggibile" if a == UNREADABLE else format_euro(a) for a in amounts]
        return labels + [d.label for d in self.unverified_durations(text)]


@dataclass(frozen=True)
class NumberSources:
    tool_cents: set[int]  # from successful data-tool results of this request
    tool_minutes: set[int]
    default_lesson_minutes: int  # from the tutor's profile
    user_text: str  # every user turn
    assistant_text: str  # every earlier assistant turn

    def allowed(self) -> Allowed:
        earlier = self.assistant_text
        cents = self.tool_cents | stated_cents(self.user_text) | amounts_in(earlier)
        cents.discard(UNREADABLE)
        minutes = self.tool_minutes | stated_minutes(self.user_text) | {self.default_lesson_minutes}
        minutes.update(m for duration in durations_in(earlier) for m in duration.readings)
        return Allowed(cents, minutes)


@dataclass
class Enriched:
    # Numbers the reply may show: the sources plus the numbers of this response's verified drafts.
    allowed: Allowed
    drafts: list[LessonDraft | PaymentDraft | MessageDraft] = field(default_factory=list)
    discarded: list[str] = field(default_factory=list)


# --- Drafts ----------------------------------------------------------------------------------------


async def _student(conn: Conn, raw_id: uuid.UUID) -> Any:
    # RLS: a student of another tutor is simply not found.
    return await conn.fetchrow(
        "select id, first_name, last_name, archived_at, default_subject_id from app.students where id = $1",
        raw_id,
    )


def _overlaps(a: LessonDraft, start: dt.time, end: dt.time, day: dt.date) -> bool:
    return a.date == day and a.start_time < end and a.end_time > start


def _minutes_between(start: dt.time, end: dt.time) -> int:
    return (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute)


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
    minutes = _minutes_between(draft.start_time, draft.end_time)
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
    out.allowed.cents.update({int(rate), amount})
    out.allowed.minutes.add(minutes)
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
    if draft.amount_cents not in out.allowed.cents:
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


def _free_text(draft: LessonDraft | PaymentDraft) -> str:
    parts = (draft.topic, draft.notes) if isinstance(draft, LessonDraft) else (draft.note,)
    return "\n".join(p for p in parts if p)


def _message(draft: MessageDraftIn, out: Enriched) -> MessageDraft | None:
    text = clean_text(draft.text)
    if not text:
        out.discarded.append("messaggio vuoto")
        return None
    recipient = clean_text(draft.recipient_hint, 120)
    # A made-up debt in a payment reminder would be copied straight to a parent.
    if out.allowed.unverified_amounts(f"{recipient}\n{text}"):
        out.discarded.append(MESSAGE_AMOUNTS_REASON)
        return None
    if out.allowed.unverified_durations(f"{recipient}\n{text}"):
        out.discarded.append(MESSAGE_HOURS_REASON)
        return None
    return MessageDraft(id=uuid.uuid4(), recipient_hint=recipient, channel=draft.channel, text=text)


def _parse(raw: dict[str, Any]) -> LessonDraftIn | PaymentDraftIn | MessageDraftIn | None:
    if raw.get("type") == "lesson":
        raw = {k: v for k, v in raw.items() if k not in _LESSON_PRICE_KEYS}
    try:
        return _DRAFT_ADAPTER.validate_python(raw)
    except ValidationError:
        return None


async def enrich_drafts(
    conn: Conn, raw_drafts: list[dict[str, Any]], clock: TutorClock, sources: NumberSources
) -> Enriched:
    """Validate each draft, then recompute/verify it against the database (as the user).

    Lessons are handled first (their amounts and durations come from the ledger), then payments
    (checked against those amounts too), then the free text of both and the messages (checked against
    everything verified); the output keeps the model's order.
    """
    out = Enriched(allowed=sources.allowed())
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
    lessons = [d for d in slots if isinstance(d, LessonDraft)]
    if len(lessons) > 1:  # "3 lezioni, 4 h 30 min e 135,00 € in tutto"
        out.allowed.cents.add(sum(d.amount_cents for d in lessons))
        out.allowed.minutes.add(sum(_minutes_between(d.start_time, d.end_time) for d in lessons))
    for index, draft in enumerate(parsed):
        if isinstance(draft, PaymentDraftIn):
            payments = [d for d in slots if isinstance(d, PaymentDraft)]
            slots[index] = await _payment(conn, draft, clock, out, payments)
    for done in slots:
        if isinstance(done, PaymentDraft) and UNSTATED_AMOUNT_WARNING not in done.warnings:
            out.allowed.cents.add(done.amount_cents)
    for done in slots:
        if isinstance(done, LessonDraft | PaymentDraft) and out.allowed.unverified(_free_text(done)):
            done.warnings.append(UNVERIFIED_TEXT_WARNING)
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
