"""Students, rates, ledger, activity and CSV export."""

from __future__ import annotations

import datetime as dt
import re
import unicodedata
import uuid
from typing import Annotated, Literal
from urllib.parse import quote

from fastapi import APIRouter, Query, Response, status

from app.api.deps import UserConn
from app.domain import activity, ledger, rates, students
from app.domain.common import tutor_clock
from app.schemas import (
    ActivityPage,
    ItemsPage,
    Ledger,
    Rate,
    RateCreate,
    RateCreated,
    RateInput,
    RatePreview,
    Student,
    StudentCreate,
    StudentPatch,
    StudentSummary,
)

router = APIRouter(tags=["students"])

CSV_MEDIA_TYPE = "text/csv; charset=utf-8"


def _slug(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-") or "studente"


def csv_response(content: bytes, filename: str) -> Response:
    disposition = f"attachment; filename=\"{filename}\"; filename*=UTF-8''{quote(filename)}"
    return Response(content=content, media_type=CSV_MEDIA_TYPE, headers={"Content-Disposition": disposition})


@router.get("/students", response_model=ItemsPage[StudentSummary])
async def list_students(
    conn: UserConn,
    q: Annotated[str | None, Query(max_length=100)] = None,
    archived: bool = False,
    sort: Literal["name", "balance", "next_lesson"] = "name",
) -> ItemsPage[StudentSummary]:
    return ItemsPage(items=await students.list_students(conn, q, archived, sort))


@router.post("/students", response_model=Student, status_code=status.HTTP_201_CREATED)
async def create_student(body: StudentCreate, conn: UserConn) -> Student:
    return await students.create_student(conn, body, await tutor_clock(conn))


@router.get("/students/{student_id}", response_model=Student)
async def get_student(student_id: uuid.UUID, conn: UserConn) -> Student:
    return await students.get_student(conn, student_id)


@router.patch("/students/{student_id}", response_model=Student)
async def patch_student(student_id: uuid.UUID, body: StudentPatch, conn: UserConn) -> Student:
    return await students.update_student(conn, student_id, body)


@router.post("/students/{student_id}/archive", response_model=Student)
async def archive_student(student_id: uuid.UUID, conn: UserConn) -> Student:
    return await students.set_archived(conn, student_id, True)


@router.post("/students/{student_id}/unarchive", response_model=Student)
async def unarchive_student(student_id: uuid.UUID, conn: UserConn) -> Student:
    return await students.set_archived(conn, student_id, False)


@router.delete("/students/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_student(student_id: uuid.UUID, conn: UserConn) -> Response:
    await students.delete_student(conn, student_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Rates (D-16) ---------------------------------------------------------------------------------


@router.get("/students/{student_id}/rates", response_model=ItemsPage[Rate])
async def list_rates(student_id: uuid.UUID, conn: UserConn) -> ItemsPage[Rate]:
    return ItemsPage(items=await rates.list_student_rates(conn, student_id))


@router.post("/students/{student_id}/rates/preview", response_model=RatePreview)
async def preview_rate(student_id: uuid.UUID, body: RateInput, conn: UserConn) -> RatePreview:
    return await rates.preview_rate(conn, student_id, body)


@router.post("/students/{student_id}/rates", response_model=RateCreated, status_code=status.HTTP_201_CREATED)
async def create_rate(student_id: uuid.UUID, body: RateCreate, conn: UserConn) -> RateCreated:
    return await rates.create_rate(conn, student_id, body)


@router.delete("/students/{student_id}/rates/{rate_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rate(
    student_id: uuid.UUID, rate_id: uuid.UUID, conn: UserConn, reprice_existing: bool = False
) -> Response:
    await rates.delete_rate(conn, student_id, rate_id, reprice_existing=reprice_existing)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Ledger & history (D-18, D-24) ------------------------------------------------------------------


@router.get("/students/{student_id}/ledger", response_model=Ledger)
async def get_ledger(
    student_id: uuid.UUID,
    conn: UserConn,
    from_: Annotated[dt.date | None, Query(alias="from")] = None,
    to: dt.date | None = None,
    order: Literal["asc", "desc"] = "desc",
) -> Ledger:
    return await ledger.student_ledger(conn, student_id, from_, to, order)


@router.get(
    "/students/{student_id}/ledger.csv",
    response_class=Response,
    responses={200: {"content": {"text/csv": {}}, "description": "Libro mastro in CSV"}},
)
async def get_ledger_csv(student_id: uuid.UUID, conn: UserConn) -> Response:
    name, content = await ledger.student_ledger_csv(conn, student_id)
    return csv_response(content, f"libro-mastro-{_slug(name)}.csv")


@router.get("/students/{student_id}/activity", response_model=ActivityPage)
async def get_activity(
    student_id: uuid.UUID,
    conn: UserConn,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    before: Annotated[str | None, Query(max_length=20)] = None,
) -> ActivityPage:
    return await activity.student_activity(conn, student_id, limit, before)


@router.get(
    "/export/ledger.csv",
    response_class=Response,
    tags=["export"],
    responses={200: {"content": {"text/csv": {}}, "description": "Libro mastro completo in CSV"}},
)
async def export_ledger_csv(conn: UserConn) -> Response:
    clock = await tutor_clock(conn)
    content = await ledger.full_ledger_csv(conn)
    return csv_response(content, f"ripetiflow-libro-mastro-{clock.today.isoformat()}.csv")
