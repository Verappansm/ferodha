"""
TRANSFORM
Flattens the nested API payloads (one per symbol, each with a list of candles)
into a single flat table, then applies three validations:

  1. Schema/type check      -> drop candles missing required fields or with wrong types
  2. Data-quality filter     -> drop synthetic (interpolated/fake) candles and
                                 rows with a null volume
  3. OHLC sanity + dedupe    -> drop candles where high/low/open/close are
                                 logically inconsistent, and drop duplicate
                                 (symbol, date) rows
"""

import pandas as pd

REQUIRED_FIELDS = {
    "date": str,
    "open": (int, float),
    "high": (int, float),
    "low": (int, float),
    "close": (int, float),
    "adjclose": (int, float),
}


def flatten(payloads: list[dict]) -> list[dict]:
    """Turn [{data: {symbol, currency, candles:[...]}}, ...] into flat rows."""
    rows = []
    for payload in payloads:
        data = payload.get("data", {})
        symbol = data.get("symbol")
        currency = data.get("currency")
        interval = data.get("interval")
        for candle in data.get("candles", []):
            row = dict(candle)
            row["symbol"] = symbol
            row["currency"] = currency
            row["interval"] = interval
            rows.append(row)
    return rows


def validate_schema(rows: list[dict]) -> list[dict]:
    """1. Keep only rows with required fields present and correctly typed."""
    clean = []
    for r in rows:
        ok = all(
            field in r and r[field] is not None and isinstance(r[field], expected_type)
            for field, expected_type in REQUIRED_FIELDS.items()
        )
        if ok:
            clean.append(r)
        else:
            print(f"[transform] dropping row with bad/missing schema: {r.get('symbol')} {r.get('date')}")
    return clean


def filter_quality(df: pd.DataFrame) -> pd.DataFrame:
    """2. Drop synthetic (non-real) candles and rows with a null volume."""
    before = len(df)

    if "synthetic" in df.columns:
        df = df[df["synthetic"] != True]  # noqa: E712 (explicit bool check on purpose)

    df = df.dropna(subset=["volume"])

    if len(df) < before:
        print(f"[transform] dropped {before - len(df)} rows (synthetic or null volume)")
    return df


def validate_ohlc_and_dedupe(df: pd.DataFrame) -> pd.DataFrame:
    """3. Drop logically inconsistent candles and duplicate (symbol, date) rows."""
    before = len(df)

    valid_ohlc = (
        (df["high"] >= df["low"])
        & (df["high"] >= df["open"])
        & (df["high"] >= df["close"])
        & (df["low"] <= df["open"])
        & (df["low"] <= df["close"])
        & (df["open"] > 0)
        & (df["close"] > 0)
    )
    df = df[valid_ohlc]
    df = df.drop_duplicates(subset=["symbol", "date"])

    if len(df) < before:
        print(f"[transform] dropped {before - len(df)} rows (bad OHLC / duplicates)")
    return df


def transform(payloads: list[dict]) -> pd.DataFrame:
    rows = flatten(payloads)
    rows = validate_schema(rows)

    df = pd.DataFrame(rows)
    if df.empty:
        return df

    df = filter_quality(df)
    df = validate_ohlc_and_dedupe(df)

    df["date"] = pd.to_datetime(df["date"]).dt.date
    df["volume"] = df["volume"].astype("int64")

    cols = ["symbol", "date", "open", "high", "low", "close", "adjclose",
            "volume", "currency", "interval"]
    return df[cols].sort_values(["symbol", "date"]).reset_index(drop=True)
