"""
TRANSFORM
Flattens the nested API payloads (one per symbol, each with a list of candles)
into a single flat table, then applies four cleaning passes and one deriving
pass:

  1. Schema/type check       -> drop candles missing required fields, with the
                                 wrong type, or with a non-ISO date. A date
                                 string that isn't YYYY-MM-DD is a defect, not
                                 something to hand to a date parser and hope it
                                 guesses right.
  2. Data-quality filter      -> drop synthetic (interpolated/fake) candles,
                                 rows with a null volume, and rows with a
                                 negative volume.
  3. Duplicate resolution     -> when the same (symbol, date) appears more than
                                 once with conflicting values, quarantine
                                 (drop) every row in that group -- there is no
                                 way to know which one is real. Exact repeats
                                 (identical in every column) are safe to
                                 collapse to one row.
  4. OHLC sanity + dedupe     -> drop candles where high/low/open/close are
                                 logically inconsistent, and drop any
                                 remaining duplicate (symbol, date) rows.
  5. Derive                   -> add daily_return (close-to-close, per symbol)
                                 and trade_value (close * volume, a turnover
                                 proxy) for downstream analysis.
"""

import re

import pandas as pd

REQUIRED_FIELDS = {
    "date": str,
    "open": (int, float),
    "high": (int, float),
    "low": (int, float),
    "close": (int, float),
    "adjclose": (int, float),
}

ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

OUTPUT_COLUMNS = [
    "symbol", "date", "open", "high", "low", "close", "adjclose",
    "volume", "currency", "interval", "daily_return", "trade_value",
]


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
    """1. Keep only rows with required fields present, correctly typed, and
    an ISO (YYYY-MM-DD) date. bool is a subclass of int in Python, so an
    explicit bool check keeps a stray `"open": true` from passing as a price.
    """
    clean = []
    for r in rows:
        ok = all(
            field in r
            and r[field] is not None
            and isinstance(r[field], expected_type)
            and not isinstance(r[field], bool)
            for field, expected_type in REQUIRED_FIELDS.items()
        )
        if ok and not ISO_DATE_RE.match(r["date"]):
            ok = False
            print(f"[transform] dropping row with non-ISO date: "
                  f"{r.get('symbol')} {r.get('date')!r}")
        if ok:
            clean.append(r)
        else:
            print(f"[transform] dropping row with bad/missing schema: {r.get('symbol')} {r.get('date')}")
    return clean


def filter_quality(df: pd.DataFrame) -> pd.DataFrame:
    """2. Drop synthetic (non-real) candles, null-volume rows, and rows
    reporting a negative volume. Zero volume is kept -- it happens on real
    thinly-traded sessions and is not by itself a sign of bad data.
    """
    before = len(df)

    if "synthetic" in df.columns:
        df = df[df["synthetic"] != True]  # noqa: E712 (explicit bool check on purpose)

    df = df.dropna(subset=["volume"])
    df = df[df["volume"] >= 0]

    if len(df) < before:
        print(f"[transform] dropped {before - len(df)} rows (synthetic, null volume, or negative volume)")
    return df


def resolve_duplicate_dates(df: pd.DataFrame) -> pd.DataFrame:
    """3. Quarantine (drop) every row in a (symbol, date) group whose values
    disagree -- e.g. the same day reported with two different closes. There
    is no signal in the row itself that says which value is right, so
    keeping either one silently would be a guess dressed up as data. An
    exact repeat (every column identical) is left in place; step 4's
    drop_duplicates collapses it to one row.
    """
    dupe_mask = df.duplicated(subset=["symbol", "date"], keep=False)
    if not dupe_mask.any():
        return df

    conflicting_index = []
    for key, group in df[dupe_mask].groupby(["symbol", "date"]):
        other_cols = group.drop(columns=["symbol", "date"])
        if other_cols.nunique(dropna=False).gt(1).any():
            print(f"[transform] quarantining {len(group)} conflicting duplicate rows for {key[0]} {key[1]}")
            conflicting_index.extend(group.index)

    if conflicting_index:
        df = df.drop(index=conflicting_index)
    return df


def validate_ohlc_and_dedupe(df: pd.DataFrame) -> pd.DataFrame:
    """4. Drop logically inconsistent candles and collapse exact duplicate
    (symbol, date) rows.
    """
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


def derive(df: pd.DataFrame) -> pd.DataFrame:
    """5. Add per-symbol daily return and trade value (turnover proxy).
    daily_return is NaN on each symbol's first row -- there is no prior
    close to compare against, and that is a fact about the series, not a
    defect to hide.
    """
    df = df.sort_values(["symbol", "date"]).reset_index(drop=True)
    df["daily_return"] = df.groupby("symbol")["close"].pct_change()
    df["trade_value"] = df["close"] * df["volume"]
    return df


def transform(payloads: list[dict]) -> pd.DataFrame:
    rows = flatten(payloads)
    rows = validate_schema(rows)

    df = pd.DataFrame(rows)
    if df.empty:
        return pd.DataFrame(columns=OUTPUT_COLUMNS)

    df = filter_quality(df)
    df = resolve_duplicate_dates(df)
    df = validate_ohlc_and_dedupe(df)
    if df.empty:
        return pd.DataFrame(columns=OUTPUT_COLUMNS)

    df["date"] = pd.to_datetime(df["date"], format="%Y-%m-%d").dt.date
    df["volume"] = df["volume"].astype("int64")
    df = derive(df)

    return df[OUTPUT_COLUMNS].sort_values(["symbol", "date"]).reset_index(drop=True)
