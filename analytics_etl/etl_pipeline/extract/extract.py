"""
EXTRACT
Fetches raw candle data per symbol from the API, using a local JSON cache
so repeated runs within CACHE_TTL_SECONDS don't re-hit the API.
"""

import json
import time
import requests

from config import API_URL, API_KEY, CACHE_DIR, CACHE_TTL_SECONDS, SYMBOLS

# Endpoint: GET /candles/{symbol}
ENDPOINT_PATH = "/candles/{symbol}"
DEFAULT_PARAMS = {"interval": "1d"}

MAX_RETRIES = 3       # for connection errors / timeouts only
BACKOFF_BASE = 2       # seconds; grows as 2, 4, 8...


class RateLimitExceeded(Exception):
    """429 received. The whole batch run should stop — not retry, not sleep it off."""


class SymbolExtractError(Exception):
    """This one symbol failed (4xx, exhausted retries, etc). Skip it, keep going with the rest."""


def _cache_path(symbol: str):
    return CACHE_DIR / f"{symbol.replace('.', '_')}.json"


def _read_cache(symbol: str):
    path = _cache_path(symbol)
    if not path.exists():
        return None
    age = time.time() - path.stat().st_mtime
    if age > CACHE_TTL_SECONDS:
        return None  # stale
    with open(path, "r") as f:
        return json.load(f)


def _write_cache(symbol: str, payload: dict):
    CACHE_DIR.mkdir(exist_ok=True)
    with open(_cache_path(symbol), "w") as f:
        json.dump(payload, f)


def _request_with_retry(symbol: str, url: str) -> requests.Response:
    """
    Handles connection errors / timeouts only, with growing backoff.
    Gives up after MAX_RETRIES and raises SymbolExtractError — it does NOT
    retry on 4xx/429, those are decided by the caller.
    """
    last_exc = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return requests.get(
                url,
                params=DEFAULT_PARAMS,
                headers={"x-api-key": API_KEY},
                timeout=15,
            )
        except (requests.ConnectionError, requests.Timeout) as e:
            last_exc = e
            if attempt == MAX_RETRIES:
                break
            wait = BACKOFF_BASE ** attempt
            print(f"[extract] {symbol}: {type(e).__name__}, retrying in {wait}s "
                  f"(attempt {attempt}/{MAX_RETRIES})")
            time.sleep(wait)

    raise SymbolExtractError(f"{symbol}: connection failed after {MAX_RETRIES} attempts ({last_exc})")


def fetch_symbol(symbol: str) -> dict:
    """Return the raw API payload for one symbol (from cache if fresh)."""
    cached = _read_cache(symbol)
    if cached is not None:
        print(f"[extract] {symbol}: using cached data")
        return cached

    print(f"[extract] {symbol}: calling API")
    url = f"{API_URL}{ENDPOINT_PATH.format(symbol=symbol)}"

    resp = _request_with_retry(symbol, url)

    # --- 200: success, but the body itself might still be bad ---
    if resp.status_code == 200:
        try:
            payload = resp.json()
        except ValueError as e:
            # Don't decide here whether to drop/quarantine/raise — that's transform's call.
            # Pass a marked payload through so it fails schema validation downstream.
            print(f"[extract] {symbol}: 200 OK but body isn't valid JSON — passing through as-is")
            payload = {"_extract_error": f"invalid JSON: {e}", "_raw_text": resp.text[:500], "symbol": symbol}
        _write_cache(symbol, payload)
        return payload

    # --- 429: stop the whole run, plainly, using Retry-After ---
    if resp.status_code == 429:
        retry_after = resp.headers.get("Retry-After", "not provided")
        raise RateLimitExceeded(
            f"429 rate limited on {symbol}. Retry-After: {retry_after}. Stopping the run — not sleeping it off."
        )

    # --- other 4xx (401, 403, 404, ...): fail this symbol only, don't retry ---
    if 400 <= resp.status_code < 500:
        raise SymbolExtractError(f"{symbol}: {resp.status_code} {resp.reason} — {resp.text[:200]}")

    # --- anything else unexpected (5xx etc): same treatment, fail this symbol and move on ---
    raise SymbolExtractError(f"{symbol}: unexpected status {resp.status_code} — {resp.text[:200]}")


def extract_all(symbols: list[str] = SYMBOLS) -> list[dict]:
    """
    Fetch raw payloads for all symbols.
    - On 429: stops immediately (propagates RateLimitExceeded) — caller decides what to do.
    - On any other per-symbol failure: skips that symbol, keeps the error message, continues.
    """
    payloads = []
    failed = {}

    for symbol in symbols:
        try:
            payloads.append(fetch_symbol(symbol))
        except RateLimitExceeded:
            raise  # halt the whole batch, no silent retry-until-midnight
        except SymbolExtractError as e:
            print(f"[extract] SKIPPING {symbol}: {e}")
            failed[symbol] = str(e)
            continue

    if failed:
        print(f"[extract] completed with {len(failed)} symbol(s) failed: {list(failed.keys())}")

    return payloads


if __name__ == "__main__":
    payloads = extract_all()
    for p in payloads:
        n = len(p.get("data", {}).get("candles", []))
        print(f"{p.get('data', {}).get('symbol')}: {n} candles")