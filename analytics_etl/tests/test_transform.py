"""
Tests for the transform step. No network, no key, no DuckDB -- these run
against in-memory payloads and the canned fixtures in tests/fixtures/.

Two kinds of test live here:
  - one per documented defect in fixtures/README.md, built from a minimal
    hand-written payload so the assertion is unambiguous about which rule
    fired;
  - a handful of integration tests against the real candles-*.json fixtures,
    which exercise flatten() + all the cleaning passes together the way a
    real API response would.
"""

import json
import math
from pathlib import Path

import pandas as pd
import pytest

from etl_pipeline.transform.transform import transform

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES_DIR / name).read_text())


def make_payload(symbol: str, candles: list[dict], currency: str = "INR", interval: str = "1d") -> dict:
    return {"data": {"symbol": symbol, "currency": currency, "interval": interval, "candles": candles}}


def base_candle(**overrides) -> dict:
    candle = {
        "date": "2026-07-01",
        "open": 100.0,
        "high": 105.0,
        "low": 99.0,
        "close": 102.0,
        "adjclose": 102.0,
        "volume": 1000,
        "synthetic": False,
    }
    candle.update(overrides)
    return candle


# ---------------------------------------------------------------------------
# One test per documented defect (fixtures/README.md "Six defects")
# ---------------------------------------------------------------------------

def test_rejects_a_high_below_a_low():
    payload = make_payload("TEST.NS", [base_candle(high=90.0, low=95.0)])
    df = transform([payload])
    assert df.empty


def test_rejects_negative_volume():
    payload = make_payload("TEST.NS", [base_candle(volume=-1)])
    df = transform([payload])
    assert df.empty


def test_rejects_non_iso_date():
    payload = make_payload("TEST.NS", [base_candle(date="09/07/2026")])
    df = transform([payload])
    assert df.empty


def test_rejects_non_numeric_price_string():
    payload = make_payload("TEST.NS", [base_candle(open="n/a")])
    df = transform([payload])
    assert df.empty


def test_rejects_row_missing_close():
    candle = base_candle()
    del candle["close"]
    payload = make_payload("TEST.NS", [candle])
    df = transform([payload])
    assert df.empty


def test_quarantines_duplicate_date_with_conflicting_close():
    conflicting = [
        base_candle(date="2026-07-01", close=169.5),
        base_candle(date="2026-07-01", close=168.95),
    ]
    clean_day = base_candle(date="2026-07-02", close=103.0)
    payload = make_payload("TEST.NS", conflicting + [clean_day])

    df = transform([payload])

    assert len(df) == 1
    assert df.iloc[0]["date"].isoformat() == "2026-07-02"


# ---------------------------------------------------------------------------
# Extra defensive cases beyond the six, still worth asserting explicitly
# ---------------------------------------------------------------------------

def test_keeps_exact_duplicate_row_once():
    """A byte-for-byte repeated row (e.g. a retried request landing twice in
    the same payload) is not a conflict -- it collapses to one row rather
    than being quarantined."""
    candle = base_candle()
    payload = make_payload("TEST.NS", [candle, dict(candle)])

    df = transform([payload])

    assert len(df) == 1


def test_rejects_boolean_disguised_as_price():
    """bool is a subclass of int in Python -- `"open": true` must not slip
    through the numeric-type check as if it were a price."""
    payload = make_payload("TEST.NS", [base_candle(open=True)])
    df = transform([payload])
    assert df.empty


def test_transform_returns_empty_dataframe_for_no_payloads():
    df = transform([])
    assert df.empty
    assert list(df.columns) == [
        "symbol", "date", "open", "high", "low", "close", "adjclose",
        "volume", "currency", "interval", "daily_return", "trade_value",
    ]


def test_derives_daily_return_and_trade_value():
    payload = make_payload("TEST.NS", [
        base_candle(date="2026-07-01", close=100.0, volume=1000),
        base_candle(date="2026-07-02", close=110.0, high=112.0, volume=2000),
    ])

    df = transform([payload])

    assert df.iloc[0]["trade_value"] == pytest.approx(100.0 * 1000)
    assert math.isnan(df.iloc[0]["daily_return"])
    assert df.iloc[1]["daily_return"] == pytest.approx((110.0 - 100.0) / 100.0)
    assert df.iloc[1]["trade_value"] == pytest.approx(110.0 * 2000)


# ---------------------------------------------------------------------------
# Integration tests against the real fixtures
# ---------------------------------------------------------------------------

def test_reliance_fixture_preserves_calendar_gap():
    """Nine trading days with one weekday absent (exchange closed). The
    transform must not invent the missing day -- it just isn't there."""
    payload = load_fixture("candles-reliance-ns-2026-07.json")

    df = transform([payload])

    assert len(df) == 9
    dates = {d.isoformat() for d in df["date"]}
    assert "2026-07-08" not in dates
    assert (df["symbol"] == "RELIANCE.NS").all()


def test_infy_fixture_drops_null_volume_and_synthetic_rows():
    """Eight candles; one has a null volume, one is flagged synthetic. Both
    must be dropped, leaving the six real, complete rows."""
    payload = load_fixture("candles-infy-ns-2026-07.json")

    df = transform([payload])

    assert len(df) == 6
    dates = {d.isoformat() for d in df["date"]}
    assert "2026-07-06" not in dates  # null volume
    assert "2026-07-08" not in dates  # synthetic


def test_malformed_fixture_yields_no_valid_rows():
    """Every one of the six defects in this fixture lands on a different
    one of its seven candles, so nothing survives -- and, critically,
    transform must not raise or load a bad row along the way."""
    payload = load_fixture("candles-malformed.json")

    df = transform([payload])

    assert df.empty


def test_multiple_symbols_together_stay_independent():
    """flatten() and derive() must key everything by symbol -- a clean
    fixture and the fully-malformed one in the same batch shouldn't let one
    contaminate the other."""
    reliance = load_fixture("candles-reliance-ns-2026-07.json")
    malformed = load_fixture("candles-malformed.json")

    df = transform([reliance, malformed])

    assert len(df) == 9
    assert set(df["symbol"]) == {"RELIANCE.NS"}
