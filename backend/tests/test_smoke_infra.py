"""Infrastructure sanity: DB fixture, token verification, tenant isolation."""

from __future__ import annotations

from tests.conftest import create_student


async def test_health(client) -> None:
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["db"] == "ok"


async def test_profile_via_real_token(client, make_user) -> None:
    user = await make_user("Anna")
    response = await client.get("/api/v1/me", headers=user.headers)
    assert response.status_code == 200, response.text
    assert response.json()["full_name"] == "Anna"


async def test_tenants_are_isolated(client, make_user) -> None:
    anna, bruno = await make_user("Anna"), await make_user("Bruno")
    student = await create_student(client, anna)
    assert (await client.get(f"/api/v1/students/{student['id']}", headers=bruno.headers)).status_code == 404
    assert (await client.get("/api/v1/students", headers=bruno.headers)).json()["items"] == []
