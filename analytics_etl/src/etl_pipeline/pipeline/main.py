"""Runs the full pipeline: extract -> transform -> load."""

import sys

from etl_pipeline.extract.extract import extract_all , RateLimitExceeded
from etl_pipeline.transform.transform import transform
from etl_pipeline.load.load import load
from etl_pipeline.config import SYMBOLS



def main():
    try:
        payloads = extract_all(SYMBOLS)
    except RateLimitExceeded as e:
        print(f"[main] STOPPED: {e}")
        sys.exit(1)  # plain stop — no retry loop, no sleeping until midnight

    if not payloads:
        print("[main] no symbols succeeded — nothing to transform or load")
        return

    df = transform(payloads)
    print(f"[main] {len(df)} clean rows ready to load")
    load(df)


if __name__ == "__main__":
    main()
