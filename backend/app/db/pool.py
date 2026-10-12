"""asyncpg pool and the two kinds of transactions the backend uses (D-03)."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any, Literal

import asyncpg
from asyncpg.pool import PoolConnectionProxy

from app.core.auth import CurrentUser

type Conn = PoolConnectionProxy[asyncpg.Record]
type Source = Literal["app", "assistant", "import", "system"]


async def _init_connection(conn: asyncpg.Connection[Any]) -> None:
    for name in ("json", "jsonb"):
        await conn.set_type_codec(name, encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


async def create_pool(dsn: str, min_size: int = 1, max_size: int = 10) -> asyncpg.Pool[asyncpg.Record]:
    # statement_cache_size=0: compatible with the Supabase pooler (Supavisor/PgBouncer).
    return await asyncpg.create_pool(
        dsn,
        min_size=min_size,
        max_size=max_size,
        statement_cache_size=0,
        command_timeout=30,
        init=_init_connection,
    )


class Database:
    def __init__(self, pool: asyncpg.Pool[asyncpg.Record]) -> None:
        self.pool = pool

    @asynccontextmanager
    async def user_tx(
        self, user: CurrentUser, source: Source = "app", *, readonly: bool = False
    ) -> AsyncIterator[Conn]:
        """Run as role `authenticated` with the verified claims: RLS applies to every query.

        `readonly=True` makes Postgres itself reject any write (used for Matita's tools, D-42).
        """
        async with self.pool.acquire() as conn, conn.transaction(readonly=readonly):
            await conn.execute(
                "select set_config('role', 'authenticated', true),"
                " set_config('request.jwt.claims', $1, true),"
                " set_config('app.source', $2, true)",
                json.dumps(user.claims, default=str),
                source,
            )
            yield conn

    @asynccontextmanager
    async def privileged_tx(self, source: Source = "system") -> AsyncIterator[Conn]:
        """Owner role (bypasses RLS). Only for Google tokens, sync jobs and dev tooling (D-03)."""
        async with self.pool.acquire() as conn, conn.transaction():
            await conn.execute("select set_config('app.source', $1, true)", source)
            yield conn

    async def ping(self) -> bool:
        try:
            async with self.pool.acquire() as conn:
                return bool(await conn.fetchval("select 1"))
        except (OSError, asyncpg.PostgresError, TimeoutError):
            return False
