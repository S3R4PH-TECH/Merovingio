"""Tests for POST /auth/login, GET /me and GET /healthz."""
from app.auth import hash_password
from app.models import User


async def _seed_user(db_session, email="test@example.com", password="Password123!") -> User:
    user = User(email=email, name="Test User", password_hash=hash_password(password))
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def test_healthz_requires_no_auth(client):
    resp = await client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


async def test_login_with_valid_credentials_returns_token(client, db_session):
    await _seed_user(db_session)
    resp = await client.post("/auth/login", json={"email": "test@example.com", "password": "Password123!"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]


async def test_login_with_wrong_password_returns_401(client, db_session):
    await _seed_user(db_session)
    resp = await client.post("/auth/login", json={"email": "test@example.com", "password": "wrong"})
    assert resp.status_code == 401


async def test_login_with_unknown_email_returns_401(client):
    resp = await client.post("/auth/login", json={"email": "nobody@example.com", "password": "x"})
    assert resp.status_code == 401


async def test_me_without_token_returns_401(client):
    resp = await client.get("/me")
    assert resp.status_code == 401


async def test_me_with_valid_token_returns_current_user(client, db_session):
    await _seed_user(db_session)
    login_resp = await client.post(
        "/auth/login", json={"email": "test@example.com", "password": "Password123!"}
    )
    token = login_resp.json()["access_token"]

    resp = await client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "test@example.com"


async def test_me_with_garbage_token_returns_401(client):
    resp = await client.get("/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert resp.status_code == 401


async def test_repeated_failed_logins_are_rate_limited(client, db_session):
    await _seed_user(db_session)
    body = {"email": "test@example.com", "password": "wrong"}

    for _ in range(10):
        assert (await client.post("/auth/login", json=body)).status_code == 401

    resp = await client.post("/auth/login", json=body)
    assert resp.status_code == 429
    assert resp.json()["detail"] == "too_many_attempts"


async def test_successful_login_clears_the_counter(client, db_session):
    """A user who mistypes a few times must not stay throttled after getting
    it right."""
    await _seed_user(db_session)

    for _ in range(5):
        await client.post("/auth/login", json={"email": "test@example.com", "password": "wrong"})

    ok = await client.post("/auth/login", json={"email": "test@example.com", "password": "Password123!"})
    assert ok.status_code == 200

    for _ in range(10):
        assert (
            await client.post("/auth/login", json={"email": "test@example.com", "password": "wrong"})
        ).status_code == 401


async def test_unknown_email_still_burns_a_verification(client):
    """Guards the timing fix: the unknown-email path must go through
    verify_dummy_password rather than returning before any bcrypt work. Asserted
    structurally (the call happens) rather than by wall-clock, which would be
    flaky in CI."""
    from unittest.mock import patch

    with patch("app.routers.auth.verify_dummy_password") as dummy:
        resp = await client.post("/auth/login", json={"email": "nobody@example.com", "password": "x"})

    assert resp.status_code == 401
    dummy.assert_called_once_with("x")
