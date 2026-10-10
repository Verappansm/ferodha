from __future__ import annotations

import argparse
import uuid
from datetime import date, datetime, timezone

from etl import db, dimensions, facts, postgres
from etl.config import DuckDBConfig, PostgresConfig


def _open_duckdb():
    cfg = DuckDBConfig.from_env()
    con = db.connect(cfg)
    db.run_migrations(con)
    return con


def cmd_load_dims(args: argparse.Namespace) -> None:
    now = datetime.now(timezone.utc)
    duck_con = _open_duckdb()
    pg_cfg = PostgresConfig.from_env()

    written = dimensions.load_dim_date(duck_con, start_year=args.start_year, num_years=args.num_years)
    print(f"dim_date: {written} day-rows ensured ({args.start_year}-{args.start_year + args.num_years - 1})")

    with postgres.connect(pg_cfg) as pg_conn:
        instruments = postgres.fetch_instruments(pg_conn)
        n = dimensions.load_dim_instrument(duck_con, instruments, now)
        print(f"dim_instrument: {n} rows merged")

        accounts = postgres.fetch_accounts(pg_conn)
        n = dimensions.load_dim_account(duck_con, accounts, as_of=date.today(), now=now)
        print(f"dim_account: {n} new versions written")


def cmd_load_facts(args: argparse.Namespace) -> None:
    now = datetime.now(timezone.utc)
    batch_id = str(uuid.uuid4())
    duck_con = _open_duckdb()
    pg_cfg = PostgresConfig.from_env()

    with postgres.connect(pg_cfg) as pg_conn:
        result = facts.run_incremental_load(pg_conn, duck_con, batch_id, now)

    print(f"batch {batch_id}: loaded={result.rows_loaded} dead_lettered={result.rows_dead_lettered} "
          f"watermark->{result.watermark_advanced_to}")


def cmd_run_all(args: argparse.Namespace) -> None:
    cmd_load_dims(args)
    cmd_load_facts(args)


def main() -> None:
    parser = argparse.ArgumentParser(prog="etl")
    sub = parser.add_subparsers(dest="command", required=True)

    p_dims = sub.add_parser("load-dims", help="Load dim_date, dim_instrument, dim_account")
    p_dims.add_argument("--start-year", type=int, default=2020)
    p_dims.add_argument("--num-years", type=int, default=10)
    p_dims.set_defaults(func=cmd_load_dims)

    p_facts = sub.add_parser("load-facts", help="One incremental load into fact_trades")
    p_facts.set_defaults(func=cmd_load_facts)

    p_all = sub.add_parser("run-all", help="load-dims then load-facts")
    p_all.add_argument("--start-year", type=int, default=2020)
    p_all.add_argument("--num-years", type=int, default=10)
    p_all.set_defaults(func=cmd_run_all)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
