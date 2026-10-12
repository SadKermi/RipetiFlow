"""Google Calendar integration (D-31)."""

from __future__ import annotations

from fastapi import APIRouter, Request, Response, status

from app.api.deps import CurrentUserDep, UserConn, problem_responses
from app.calendar.sync import CalendarSync
from app.schemas import CalendarConnect, CalendarQueued, CalendarResync, CalendarStatus

router = APIRouter(
    prefix="/integrations/google-calendar", tags=["calendar"], responses=problem_responses(502, 503)
)


def _sync(request: Request) -> CalendarSync:
    sync: CalendarSync = request.app.state.calendar
    return sync


@router.get("", response_model=CalendarStatus)
async def get_status(request: Request, conn: UserConn) -> CalendarStatus:
    return await _sync(request).status(conn)


@router.post("/connect", response_model=CalendarStatus)
async def connect(request: Request, body: CalendarConnect, user: CurrentUserDep) -> CalendarStatus:
    # provider_token (short-lived access token) is accepted for compatibility but not stored:
    # a fresh one is always derived from the refresh token.
    return await _sync(request).connect(user, body.provider_refresh_token)


@router.post("/resync", response_model=CalendarQueued, status_code=status.HTTP_202_ACCEPTED)
async def resync(request: Request, body: CalendarResync, user: CurrentUserDep) -> CalendarQueued:
    return CalendarQueued(queued=await _sync(request).resync(user, body.scope))


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect(request: Request, user: CurrentUserDep, remove_calendar: bool = False) -> Response:
    await _sync(request).disconnect(user, remove_calendar)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
