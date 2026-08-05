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
