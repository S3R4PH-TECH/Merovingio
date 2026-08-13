"""
Tests for the profile endpoints: PATCH /me and POST /me/password.

Both act on whoever the presented token belongs to and take no user id, so the
questions worth asking are less about routing than about blast radius: does a
token alone let someone change the password, does an avatar value reach an
<img src> unchecked, and does GET /me report back what was written.

Same convention as the rest of the suite: real Postgres, never mocked.
"""
import pytest
from sqlalchemy import select

from app.auth import hash_password, verify_password
from app.models import User

PASSWORD = "Password123!"


async def _seed_user(db_session, email="op@example.com") -> User:
    user = User(email=email, name="Test Operator", password_hash=hash_password(PASSWORD))
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def _token(client, email="op@example.com", password=PASSWORD) -> str:
    resp = await client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


async def _auth(client, db_session) -> dict:
    await _seed_user(db_session)
    return {"Authorization": f"Bearer {await _token(client)}"}


# --- GET /me ---


async def test_me_reports_the_avatar(client, db_session):
    headers = await _auth(client, db_session)
    await client.patch("/me", json={"avatar_url": "https://cdn.example.org/a.png"}, headers=headers)

    resp = await client.get("/me", headers=headers)

    assert resp.status_code == 200
    assert resp.json()["avatar_url"] == "https://cdn.example.org/a.png"


async def test_me_reports_no_avatar_as_null(client, db_session):
    headers = await _auth(client, db_session)
    resp = await client.get("/me", headers=headers)
    assert resp.json()["avatar_url"] is None


# --- PATCH /me ---


async def test_patch_me_requires_a_token(client, db_session):
    await _seed_user(db_session)
    resp = await client.patch("/me", json={"name": "Impostor"})
    assert resp.status_code == 401


async def test_patch_me_renames_the_caller(client, db_session):
    headers = await _auth(client, db_session)

    resp = await client.patch("/me", json={"name": "Alex Morgan"}, headers=headers)

    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "Alex Morgan"

    result = await db_session.execute(select(User).where(User.email == "op@example.com"))
    assert result.scalar_one().name == "Alex Morgan"


async def test_patch_me_leaves_omitted_fields_alone(client, db_session):
    headers = await _auth(client, db_session)
    await client.patch("/me", json={"avatar_url": "https://cdn.example.org/a.png"}, headers=headers)

    resp = await client.patch("/me", json={"name": "Alex Morgan"}, headers=headers)

    body = resp.json()
    assert body["name"] == "Alex Morgan"
    assert body["avatar_url"] == "https://cdn.example.org/a.png"


async def test_patch_me_clears_the_avatar_with_an_empty_string(client, db_session):
    # PATCH cannot say "remove this" by omission — omission means unchanged.
    headers = await _auth(client, db_session)
    await client.patch("/me", json={"avatar_url": "https://cdn.example.org/a.png"}, headers=headers)

    resp = await client.patch("/me", json={"avatar_url": ""}, headers=headers)

    assert resp.status_code == 200
    assert resp.json()["avatar_url"] is None


async def test_patch_me_accepts_an_inline_data_uri(client, db_session):
    # How picking a file from disk works without an upload endpoint.
    headers = await _auth(client, db_session)
    data_uri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=="

    resp = await client.patch("/me", json={"avatar_url": data_uri}, headers=headers)

    assert resp.status_code == 200, resp.text
    assert resp.json()["avatar_url"] == data_uri


@pytest.mark.parametrize(
    "hostile",
    [
        "javascript:alert(1)",
        "vbscript:msgbox(1)",
        "data:text/html;base64,PHNjcmlwdD4=",
        "  javascript:alert(1)  ",
    ],
)
async def test_patch_me_rejects_a_url_that_is_not_an_image(client, db_session, hostile):
    # This value is rendered as an <img src> in the SPA.
    headers = await _auth(client, db_session)
    resp = await client.patch("/me", json={"avatar_url": hostile}, headers=headers)
    assert resp.status_code == 422


async def test_patch_me_rejects_a_blank_name(client, db_session):
    headers = await _auth(client, db_session)
    resp = await client.patch("/me", json={"name": "   "}, headers=headers)
    assert resp.status_code == 422


async def test_patch_me_cannot_change_the_email(client, db_session):
    # Email is the login identity, so it is not part of the profile payload.
    headers = await _auth(client, db_session)
    await client.patch("/me", json={"email": "someone.else@example.com"}, headers=headers)

    resp = await client.get("/me", headers=headers)
    assert resp.json()["email"] == "op@example.com"


async def test_patch_me_cannot_reach_another_account(client, db_session):
    other = User(
        email="victim@example.com",
        name="Victim",
        password_hash=hash_password(PASSWORD),
    )
    db_session.add(other)
    await db_session.commit()

    headers = await _auth(client, db_session)
    await client.patch("/me", json={"name": "Renamed"}, headers=headers)

    result = await db_session.execute(select(User).where(User.email == "victim@example.com"))
    assert result.scalar_one().name == "Victim"


# --- POST /me/password ---


async def test_change_password_requires_a_token(client, db_session):
    await _seed_user(db_session)
    resp = await client.post(
        "/me/password",
        json={"current_password": PASSWORD, "new_password": "Brandnew1"},
    )
    assert resp.status_code == 401


async def test_change_password_rewrites_the_hash(client, db_session):
    headers = await _auth(client, db_session)

    resp = await client.post(
        "/me/password",
        json={"current_password": PASSWORD, "new_password": "Brandnew1"},
        headers=headers,
    )

    assert resp.status_code == 204, resp.text

    result = await db_session.execute(select(User).where(User.email == "op@example.com"))
    user = result.scalar_one()
    assert verify_password("Brandnew1", user.password_hash)
    assert not verify_password(PASSWORD, user.password_hash)


async def test_the_new_password_is_the_one_that_logs_in(client, db_session):
    headers = await _auth(client, db_session)
    await client.post(
        "/me/password",
        json={"current_password": PASSWORD, "new_password": "Brandnew1"},
        headers=headers,
    )

    assert (
        await client.post("/auth/login", json={"email": "op@example.com", "password": PASSWORD})
    ).status_code == 401
    assert (
        await client.post(
            "/auth/login", json={"email": "op@example.com", "password": "Brandnew1"}
        )
    ).status_code == 200


async def test_change_password_rejects_a_wrong_current_password(client, db_session):
    # A stolen token must not be enough to lock the owner out of their account.
    headers = await _auth(client, db_session)

    resp = await client.post(
        "/me/password",
        json={"current_password": "not-it", "new_password": "Brandnew1"},
        headers=headers,
    )

    assert resp.status_code == 401

    result = await db_session.execute(select(User).where(User.email == "op@example.com"))
    assert verify_password(PASSWORD, result.scalar_one().password_hash)


async def test_change_password_accepts_a_short_new_password(client, db_session):
    # Same rules as signup, which no longer imposes a minimum length.
    headers = await _auth(client, db_session)
    resp = await client.post(
        "/me/password",
        json={"current_password": PASSWORD, "new_password": "Ab1"},
        headers=headers,
    )
    assert resp.status_code == 204, resp.text


@pytest.mark.parametrize("weak", ["nodigitsatall", "1234567890", "A1" + "x" * 100, ""])
async def test_change_password_enforces_the_signup_rules(client, db_session, weak):
    headers = await _auth(client, db_session)
    resp = await client.post(
        "/me/password",
        json={"current_password": PASSWORD, "new_password": weak},
        headers=headers,
    )
    assert resp.status_code == 422


async def test_change_password_is_rate_limited(client, db_session):
    # It verifies a password, so an unmetered endpoint is an oracle for it.
    headers = await _auth(client, db_session)

    for _ in range(10):
        await client.post(
            "/me/password",
            json={"current_password": "wrong", "new_password": "Brandnew1"},
            headers=headers,
        )

    resp = await client.post(
        "/me/password",
        json={"current_password": PASSWORD, "new_password": "Brandnew1"},
        headers=headers,
    )
    assert resp.status_code == 429
