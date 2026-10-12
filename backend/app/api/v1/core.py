"""Public config, profile, subjects, dashboard."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.api.deps import SettingsDep, UserConn
from app.domain import dashboard, profile, subjects
from app.domain.common import tutor_clock
from app.schemas import (
    Dashboard,
    ItemsPage,
    Profile,
    ProfilePatch,
    PublicConfig,
    Subject,
    SubjectCreate,
    SubjectPatch,
)

public_router = APIRouter(tags=["public"])
router = APIRouter()


@public_router.get("/public/config", response_model=PublicConfig)
async def public_config(settings: SettingsDep) -> PublicConfig:
    return PublicConfig(
        supabase_url=settings.supabase_url,
        supabase_publishable_key=settings.supabase_publishable_key,
        google_login_enabled=settings.google_login_enabled,
        magic_link_enabled=settings.magic_link_enabled,
        dev_auth_enabled=settings.dev_auth_enabled,
        calendar_sync_available=settings.calendar_sync_available,
        assistant_available=settings.assistant_available,
    )


@router.get("/me", response_model=Profile, tags=["profile"])
async def get_me(conn: UserConn) -> Profile:
    return await profile.get_profile(conn)


@router.patch("/me", response_model=Profile, tags=["profile"])
async def patch_me(body: ProfilePatch, conn: UserConn) -> Profile:
    return await profile.update_profile(conn, body)


@router.get("/subjects", response_model=ItemsPage[Subject], tags=["subjects"])
async def list_subjects(conn: UserConn, include_archived: bool = False) -> ItemsPage[Subject]:
    return ItemsPage(items=await subjects.list_subjects(conn, include_archived))


@router.post("/subjects", response_model=Subject, status_code=status.HTTP_201_CREATED, tags=["subjects"])
async def create_subject(body: SubjectCreate, conn: UserConn) -> Subject:
    return await subjects.create_subject(conn, body)


@router.patch("/subjects/{subject_id}", response_model=Subject, tags=["subjects"])
async def patch_subject(subject_id: uuid.UUID, body: SubjectPatch, conn: UserConn) -> Subject:
    return await subjects.update_subject(conn, subject_id, body)


@router.delete("/subjects/{subject_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["subjects"])
async def delete_subject(subject_id: uuid.UUID, conn: UserConn) -> Response:
    await subjects.delete_subject(conn, subject_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/dashboard", response_model=Dashboard, tags=["dashboard"])
async def get_dashboard(conn: UserConn, days: Annotated[int, Query(ge=1, le=31)] = 7) -> Dashboard:
    return await dashboard.build_dashboard(conn, await tutor_clock(conn), days)
