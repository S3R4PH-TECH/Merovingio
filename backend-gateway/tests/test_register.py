"""
Tests for POST /auth/register.

The platform deliberately shipped without a signup endpoint (see app/auth.py
and scripts/seed_user.py): users were seeded out of band. Adding one changes
the security posture of a platform that can launch offensive tooling, so the
endpoint is gated behind GATEWAY_ALLOW_REGISTRATION and carries the password
composition rules — neither of which the login path needed. The minimum
length is deliberately not among those rules any more.

Same convention as the rest of the suite: real Postgres, never mocked.
"""
import pytest
from sqlalchemy import select

from app.models import User

GOOD_PASSWORD = "CorrectHorse42!"


@pytest.fixture(autouse=True)
def _allow_registration(monkeypatch):
    monkeypatch.setenv("GATEWAY_ALLOW_REGISTRATION", "true")


async def _register(client, **overrides):
    payload = {
        "email": "new@example.com",
        "password": GOOD_PASSWORD,
        "name": "New Operator",
    }
    payload.update(overrides)
    return await client.post("/auth/register", json=payload)


async def test_register_creates_a_user(client, db_session):
    resp = await _register(client)

    assert resp.status_code == 201, resp.text

    result = await db_session.execute(select(User).where(User.email == "new@example.com"))
    user = result.scalar_one_or_none()
    assert user is not None
    assert user.name == "New Operator"


async def test_register_never_stores_the_password_in_clear(client, db_session):
    await _register(client)

    result = await db_session.execute(select(User).where(User.email == "new@example.com"))
    user = result.scalar_one()

    assert GOOD_PASSWORD not in user.password_hash
    assert user.password_hash.startswith("$2")


async def test_register_returns_a_usable_token(client, db_session):
    resp = await _register(client)
    token = resp.json()["access_token"]

    me = await client.get("/me", headers={"Authorization": f"Bearer {token}"})

    assert me.status_code == 200
    assert me.json()["email"] == "new@example.com"


async def test_registered_user_can_log_in(client, db_session):
    await _register(client)

    resp = await client.post(
        "/auth/login", json={"email": "new@example.com", "password": GOOD_PASSWORD}
    )

    assert resp.status_code == 200
    assert "access_token" in resp.json()


async def test_register_rejects_a_duplicate_email(client, db_session):
    await _register(client)

    resp = await _register(client, name="Impostor")

    assert resp.status_code == 409
    assert resp.json()["detail"] == "email_already_registered"


async def test_duplicate_check_is_case_insensitive(client, db_session):
    await _register(client, email="Person@Example.com")

    resp = await _register(client, email="person@example.com")

    # Postgres compares the stored string exactly, so without normalisation the
    # same human would get two accounts and only one of them would ever log in.
    assert resp.status_code == 409


async def test_register_rejects_a_malformed_email(client, db_session):
    resp = await _register(client, email="not-an-email")
    assert resp.status_code == 422


async def test_register_accepts_a_short_password(client, db_session):
    # The 12-character floor was removed on request; only the composition rules
    # and the bcrypt ceiling still gate a signup.
    resp = await _register(client, password="Short1!")
    assert resp.status_code == 201, resp.text


async def test_register_rejects_an_empty_password(client, db_session):
    resp = await _register(client, password="")
    assert resp.status_code == 422


async def test_register_rejects_a_password_with_no_digit(client, db_session):
    resp = await _register(client, password="nodigitsatallhere")
    assert resp.status_code == 422


async def test_register_rejects_a_password_with_no_letter(client, db_session):
    resp = await _register(client, password="1234567890123456")
    assert resp.status_code == 422


async def test_register_rejects_a_password_over_the_bcrypt_limit(client, db_session):
    # bcrypt silently truncates past 72 bytes; accepting a longer password would
    # mean the extra characters contribute nothing while the user believes they do.
    resp = await _register(client, password="A1" + "x" * 100)
    assert resp.status_code == 422


async def test_register_rejects_a_blank_name(client, db_session):
    resp = await _register(client, name="   ")
    assert resp.status_code == 422


async def test_register_trims_the_name(client, db_session):
    await _register(client, name="  Padded Operator  ")

    result = await db_session.execute(select(User).where(User.email == "new@example.com"))
    assert result.scalar_one().name == "Padded Operator"


async def test_register_is_disabled_when_the_flag_is_off(client, db_session, monkeypatch):
    monkeypatch.setenv("GATEWAY_ALLOW_REGISTRATION", "false")

    resp = await _register(client)

    assert resp.status_code == 403
    assert resp.json()["detail"] == "registration_disabled"


async def test_register_is_disabled_by_an_unset_flag_being_explicit(client, db_session, monkeypatch):
    monkeypatch.setenv("GATEWAY_ALLOW_REGISTRATION", "0")

    resp = await _register(client)

    assert resp.status_code == 403


async def test_register_is_rate_limited(client, db_session):
    """Registration is unauthenticated and writes a row, so an open endpoint is
    a free way to fill the users table. It shares the login limiter."""
    last = None
    for index in range(30):
        last = await _register(client, email=f"flood{index}@example.com")
        if last.status_code == 429:
            break

    assert last is not None
    assert last.status_code == 429


async def test_register_does_not_grant_any_membership(client, db_session):
    """A fresh account must land with no workspace and no program. Everything
    tenanted stays invisible until somebody grants access."""
    resp = await _register(client)
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    assert (await client.get("/workspaces", headers=headers)).json() == []
    assert (await client.get("/programs", headers=headers)).json() == []
    assert (await client.get("/findings", headers=headers)).json() == []


async def test_login_still_works_for_a_user_seeded_with_mixed_case(client, db_session):
    """Rows seeded before email normalisation existed keep their original case.
    Lowering only the incoming address would lock those accounts out."""
    from app.auth import hash_password

    db_session.add(
        User(
            email="Legacy@Example.com",
            name="Legacy",
            password_hash=hash_password(GOOD_PASSWORD),
        )
    )
    await db_session.commit()

    resp = await client.post(
        "/auth/login", json={"email": "legacy@example.com", "password": GOOD_PASSWORD}
    )

    assert resp.status_code == 200
