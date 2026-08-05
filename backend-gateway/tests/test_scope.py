"""
Tests for app/scope.py — in particular that it reuses scope_guard's real
suffix-match algorithm (not a reimplementation that could drift), plus the
new CIDR-matching logic that doesn't exist in scope_guard.py itself.
"""
import uuid

from app.models import Target
from app.scope import domain_in_scope, ip_in_scope, value_in_target_scope


def test_domain_in_scope_exact_match():
    assert domain_in_scope("example.com", ["example.com"]) is True


def test_domain_in_scope_subdomain_match():
    assert domain_in_scope("api.example.com", ["example.com"]) is True


def test_domain_in_scope_rejects_unrelated_domain():
    assert domain_in_scope("evil.com", ["example.com"]) is False


def test_domain_in_scope_uses_real_scope_guard_module():
    """Confirms this module imports the actual Pentesters-Team scope_guard,
    not a local reimplementation — the whole point of the sys.path bridge."""
    from app import scope as scope_module

    assert scope_module.scope_guard.__name__ == "scope_guard"
    assert "Pentesters-Team/mcp_servers/scope_guard.py" in scope_module.scope_guard.__file__.replace(
        "\\", "/"
    )


def test_ip_in_scope_inside_cidr():
    assert ip_in_scope("10.0.0.5", ["10.0.0.0/24"]) is True


def test_ip_in_scope_outside_cidr():
    assert ip_in_scope("10.0.1.5", ["10.0.0.0/24"]) is False


def test_ip_in_scope_ignores_malformed_cidr_instead_of_raising():
    assert ip_in_scope("10.0.0.5", ["not-a-cidr", "10.0.0.0/24"]) is True


def test_ip_in_scope_rejects_malformed_ip():
    assert ip_in_scope("not-an-ip", ["10.0.0.0/24"]) is False


def _target(**overrides) -> Target:
    defaults = dict(
        id=uuid.uuid4(),
        program_id=uuid.uuid4(),
        name="t",
        root_domains=["example.com"],
        cidrs=["10.0.0.0/24"],
        out_of_scope=[],
        created_by=uuid.uuid4(),
    )
    defaults.update(overrides)
    return Target(**defaults)


def test_value_in_target_scope_accepts_root_domain():
    assert value_in_target_scope(_target(), "api.example.com") is True


def test_value_in_target_scope_accepts_cidr_ip():
    assert value_in_target_scope(_target(), "10.0.0.42") is True


def test_value_in_target_scope_rejects_unrelated_value():
    assert value_in_target_scope(_target(), "evil.com") is False


def test_value_in_target_scope_out_of_scope_wins_over_root_domains():
    """A domain listed in both root_domains and out_of_scope must be
    excluded — out_of_scope is a hard veto, not just a filter hint."""
    target = _target(root_domains=["example.com"], out_of_scope=["internal.example.com"])
    assert value_in_target_scope(target, "internal.example.com") is False


def test_value_in_target_scope_out_of_scope_excludes_subdomains_too():
    target = _target(root_domains=["example.com"], out_of_scope=["internal.example.com"])
    assert value_in_target_scope(target, "db.internal.example.com") is False
