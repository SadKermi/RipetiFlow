"""Lessons and payments."""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.api.deps import UserConn
from app.domain import lessons, payments
from app.domain.common import tutor_clock
from app.schemas import (
    ItemsPage,
    Lesson,
    LessonCreate,
    LessonDuplicate,
    LessonPatch,
    Payment,
    PaymentCreate,
    PaymentPatch,
)

router = APIRouter()


@router.get("/lessons", response_model=ItemsPage[Lesson], tags=["lessons"])
async def list_lessons(
    conn: UserConn,
    from_: Annotated[dt.date, Query(alias="from")],
    to: dt.date,
    student_id: uuid.UUID | None = None,
) -> ItemsPage[Lesson]:
    return ItemsPage(items=await lessons.list_lessons(conn, from_, to, student_id))


@router.post("/lessons", response_model=Lesson, status_code=status.HTTP_201_CREATED, tags=["lessons"])
async def create_lesson(body: LessonCreate, conn: UserConn) -> Lesson:
    return await lessons.create_lesson(conn, body, await tutor_clock(conn))


@router.get("/lessons/{lesson_id}", response_model=Lesson, tags=["lessons"])
async def get_lesson(lesson_id: uuid.UUID, conn: UserConn) -> Lesson:
    return await lessons.get_lesson(conn, lesson_id)


@router.patch("/lessons/{lesson_id}", response_model=Lesson, tags=["lessons"])
async def patch_lesson(lesson_id: uuid.UUID, body: LessonPatch, conn: UserConn) -> Lesson:
    return await lessons.update_lesson(conn, lesson_id, body, await tutor_clock(conn))


@router.delete("/lessons/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["lessons"])
async def delete_lesson(lesson_id: uuid.UUID, conn: UserConn) -> Response:
    await lessons.delete_lesson(conn, lesson_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/lessons/{lesson_id}/duplicate",
    response_model=Lesson,
    status_code=status.HTTP_201_CREATED,
    tags=["lessons"],
)
async def duplicate_lesson(lesson_id: uuid.UUID, body: LessonDuplicate, conn: UserConn) -> Lesson:
    return await lessons.duplicate_lesson(conn, lesson_id, body, await tutor_clock(conn))


@router.post("/payments", response_model=Payment, status_code=status.HTTP_201_CREATED, tags=["payments"])
async def create_payment(body: PaymentCreate, conn: UserConn) -> Payment:
    return await payments.create_payment(conn, body)


@router.get("/payments/{payment_id}", response_model=Payment, tags=["payments"])
async def get_payment(payment_id: uuid.UUID, conn: UserConn) -> Payment:
    return await payments.get_payment(conn, payment_id)


@router.patch("/payments/{payment_id}", response_model=Payment, tags=["payments"])
async def patch_payment(payment_id: uuid.UUID, body: PaymentPatch, conn: UserConn) -> Payment:
    return await payments.update_payment(conn, payment_id, body)


@router.delete("/payments/{payment_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["payments"])
async def delete_payment(payment_id: uuid.UUID, conn: UserConn) -> Response:
    await payments.delete_payment(conn, payment_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
