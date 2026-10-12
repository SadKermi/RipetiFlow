"""Demo routes (D-30). Mounted only with APP_ENV=development, DEV_AUTH=1 and a local database."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import DatabaseDep, SettingsDep
from app.core.auth import issue_dev_token
from app.core.settings import DEV_DEMO_EMAIL, DEV_DEMO_USER_ID
from app.dev.seed import ensure_demo_user, seed_demo
from app.schemas import DevLogin, DevSeedResult, DevUser

router = APIRouter(prefix="/dev", tags=["dev"])


@router.post("/login", response_model=DevLogin)
async def dev_login(settings: SettingsDep, db: DatabaseDep) -> DevLogin:
    """Token for the demo tutor (created on first use, data untouched)."""
    await ensure_demo_user(db)
    return DevLogin(
        access_token=issue_dev_token(settings, DEV_DEMO_EMAIL),
        user=DevUser(id=DEV_DEMO_USER_ID, email=DEV_DEMO_EMAIL),
    )


@router.post("/seed", response_model=DevSeedResult)
async def dev_seed(db: DatabaseDep) -> DevSeedResult:
    """Wipe and recreate the demo tutor's data."""
    return await seed_demo(db)
