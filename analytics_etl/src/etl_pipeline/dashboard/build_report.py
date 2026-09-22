"""
DASHBOARD
Builds report.html: three self-contained plotly charts, one per business
claim in claims.md. Reads only from the DuckDB store the pipeline already
loaded -- no network, no key. plotly's JS is inlined once, so the file opens
in a browser with no network and no build step.

Run from analytics_etl/:

    python -m etl_pipeline.dashboard.build_report
"""

import datetime as dt

import duckdb
import numpy as np
import plotly.graph_objects as go
import plotly.io as pio

from etl_pipeline.config import DB_PATH, TABLE_NAME, PROJECT_ROOT

REPORT_PATH = PROJECT_ROOT / "report.html"

BANKING = ["HDFCBANK.NS", "ICICIBANK.NS"]
IT = ["INFY.NS", "TCS.NS"]
VOLATILE_STOCK = "ADANIENT.NS"


def _connect():
    return duckdb.connect(DB_PATH, read_only=True)


def build_sync_chart(con):
    """Claim 1: how often HDFC Bank and ICICI Bank move the same direction."""
    df = con.sql(f"""
        WITH h AS (SELECT date, daily_return AS hdfc FROM {TABLE_NAME}
                   WHERE symbol = 'HDFCBANK.NS' AND daily_return IS NOT NULL),
             i AS (SELECT date, daily_return AS icici FROM {TABLE_NAME}
                   WHERE symbol = 'ICICIBANK.NS' AND daily_return IS NOT NULL)
        SELECT h.date AS date, hdfc, icici FROM h JOIN i ON h.date = i.date ORDER BY h.date
    """).df()

    # A flat (zero-return) day agrees with nothing -- it's its own category,
    # not a free pass to count as "same direction" as whatever the other
    # bank did. np.sign gives -1/0/1, so equality here is exact.
    same_dir = np.sign(df["hdfc"]) == np.sign(df["icici"])
    pct = round(float(100 * same_dir.mean()), 1)
    stats = {
        "pct": pct,
        "same_days": int(same_dir.sum()),
        "n": len(df),
        "first_day": df["date"].min().strftime("%Y-%m-%d"),
        "last_day": df["date"].max().strftime("%Y-%m-%d"),
    }

    colors = ["#2E7D32" if s else "#C62828" for s in same_dir]
    fig = go.Figure(go.Scatter(
        x=df["hdfc"] * 100,
        y=df["icici"] * 100,
        mode="markers",
        marker=dict(size=7, color=colors, opacity=0.75, line=dict(width=0)),
        text=[d.strftime("%Y-%m-%d") for d in df["date"]],
        hovertemplate="%{text}<br>HDFC Bank: %{x:.2f}%<br>ICICI Bank: %{y:.2f}%<extra></extra>",
        showlegend=False,
    ))
    fig.add_hline(y=0, line=dict(color="#999", width=1))
    fig.add_vline(x=0, line=dict(color="#999", width=1))
    fig.update_layout(
        title=(f"HDFC Bank and ICICI Bank closed in the same direction on {stats['pct']}% of trading days "
               f"({stats['same_days']} of {stats['n']}), {stats['first_day']} to {stats['last_day']}"),
        xaxis_title="HDFC Bank daily price change (%)",
        yaxis_title="ICICI Bank daily price change (%)",
        template="plotly_white",
        annotations=[dict(
            text="Each dot is one trading day. Green: both banks moved the same way that day. Red: they moved opposite ways.",
            xref="paper", yref="paper", x=0, y=-0.20, showarrow=False, align="left", font=dict(size=11, color="#555"),
        )],
        margin=dict(b=95),
        height=520,
    )
    return fig, stats


def build_sector_chart(con):
    """Claim 2: banking turnover vs IT turnover, same symbols, same period."""
    labels = {
        "Banking": "Banking<br>(HDFC Bank + ICICI Bank)",
        "IT": "IT<br>(Infosys + TCS)",
    }
    df = con.sql(f"""
        SELECT CASE WHEN symbol IN ('HDFCBANK.NS','ICICIBANK.NS') THEN 'Banking' ELSE 'IT' END AS sector,
               SUM(trade_value) AS turnover,
               MIN(date) AS first_day, MAX(date) AS last_day
        FROM {TABLE_NAME}
        WHERE symbol IN ('HDFCBANK.NS','ICICIBANK.NS','INFY.NS','TCS.NS')
        GROUP BY 1
    """).df().set_index("sector")

    banking = float(df.loc["Banking", "turnover"] / 1e12)
    it = float(df.loc["IT", "turnover"] / 1e12)
    pct_more = round((banking - it) / it * 100)
    first_day = df["first_day"].min().strftime("%Y-%m-%d")
    last_day = df["last_day"].max().strftime("%Y-%m-%d")

    stats = {
        "banking_trillion": round(banking, 2),
        "it_trillion": round(it, 2),
        "pct_more": pct_more,
        "first_day": first_day,
        "last_day": last_day,
    }

    fig = go.Figure(go.Bar(
        x=[labels["Banking"], labels["IT"]],
        y=[banking, it],
        text=[f"₹{banking:.2f} trillion", f"₹{it:.2f} trillion"],
        textposition="outside",
        marker_color=["#1565C0", "#EF6C00"],
        showlegend=False,
    ))
    fig.update_layout(
        title=f"Banking turnover was {pct_more}% higher than IT turnover, {first_day} to {last_day}",
        yaxis_title="Total traded value: price × shares traded (₹ trillion)",
        xaxis_title="Sector (two symbols combined each)",
        template="plotly_white",
        height=480,
    )
    return fig, stats


def build_trade_size_chart(con):
    """Claim 3: average daily trade size for a volatile stock, before vs during a volatile stretch."""
    df = con.sql(f"""
        SELECT CASE WHEN date < DATE '2026-01-01' THEN 'Aug–Dec 2025' ELSE 'Jan–Jun 2026' END AS period,
               AVG(trade_value) AS avg_turnover,
               STDDEV(daily_return) * 100 AS daily_vol_pct,
               COUNT(*) AS n
        FROM {TABLE_NAME}
        WHERE symbol = '{VOLATILE_STOCK}' AND date BETWEEN DATE '2025-08-28' AND DATE '2026-06-30'
        GROUP BY 1
    """).df().set_index("period")

    before = df.loc["Aug–Dec 2025"]
    after = df.loc["Jan–Jun 2026"]
    pct_change = round(float((after["avg_turnover"] - before["avg_turnover"]) / before["avg_turnover"] * 100))

    stats = {
        "before_crore": round(float(before["avg_turnover"] / 1e7), 1),
        "after_crore": round(float(after["avg_turnover"] / 1e7), 1),
        "pct_change": pct_change,
        "before_vol": round(float(before["daily_vol_pct"]), 2),
        "after_vol": round(float(after["daily_vol_pct"]), 2),
    }

    periods = ["Aug–Dec 2025", "Jan–Jun 2026"]
    values_cr = [before["avg_turnover"] / 1e7, after["avg_turnover"] / 1e7]
    fig = go.Figure(go.Bar(
        x=periods,
        y=values_cr,
        text=[f"₹{v:.1f} crore/day" for v in values_cr],
        textposition="outside",
        marker_color=["#616161", "#AD1457"],
        showlegend=False,
    ))
    fig.update_layout(
        title=(f"Adani Enterprises' average daily trade size rose {stats['pct_change']}% as volatility rose "
               f"({stats['before_vol']}% → {stats['after_vol']}% average daily price swing)"),
        yaxis_title="Average daily traded value per session (₹ crore)",
        xaxis_title="Period",
        template="plotly_white",
        height=480,
    )
    return fig, stats


PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Sprint 4 market data claims</title>
<style>
  body {{ font-family: -apple-system, "Segoe UI", Arial, sans-serif; max-width: 980px;
          margin: 40px auto; padding: 0 24px; color: #1a1a1a; line-height: 1.5; }}
  h1 {{ font-size: 1.6em; margin-bottom: 4px; }}
  .meta {{ color: #666; font-size: 0.9em; margin-top: 0; }}
  section {{ margin: 48px 0; padding-bottom: 32px; border-bottom: 1px solid #ddd; }}
  section:last-of-type {{ border-bottom: none; }}
  h2 {{ font-size: 1.25em; }}
  .claim {{ background: #f4f6f8; border-left: 4px solid #1565C0; padding: 12px 18px;
            font-size: 1.05em; margin: 14px 0 22px; }}
  .claim b {{ color: #1565C0; }}
</style>
</head>
<body>
<h1>Sprint 4 &mdash; market data analytics: three claims</h1>
<p class="meta">Source: Fauxnance end-of-day candles for {universe}, cached locally, cleaned and loaded
by this package's ETL pipeline. Generated {generated}. See claims.md for the full claim table and notes
on scope and rejected rows.</p>

<section id="hdfc-icici-sync">
<h2>1. HDFC Bank and ICICI Bank move together most days</h2>
<p class="claim"><b>Claim.</b> HDFC Bank and ICICI Bank closed in the same direction (both up or both
down) on {sync[pct]}% of trading days ({sync[same_days]} of {sync[n]}) between {sync[first_day]} and
{sync[last_day]}.</p>
{sync_chart}
</section>

<section id="sector-turnover">
<h2>2. Banking turnover dwarfs IT turnover in this universe</h2>
<p class="claim"><b>Claim.</b> Combined traded value in HDFC Bank and ICICI Bank (₹{sector[banking_trillion]}
trillion) exceeded combined traded value in Infosys and TCS (₹{sector[it_trillion]} trillion) by
{sector[pct_more]}% between {sector[first_day]} and {sector[last_day]}.</p>
{sector_chart}
</section>

<section id="adanient-trade-size">
<h2>3. Adani Enterprises trades bigger as it gets more volatile</h2>
<p class="claim"><b>Claim.</b> Adani Enterprises' average daily traded value rose {trade_size[pct_change]}%,
from ₹{trade_size[before_crore]} crore/day (Aug&ndash;Dec 2025) to ₹{trade_size[after_crore]} crore/day
(Jan&ndash;Jun 2026), alongside a rise in realized daily volatility from {trade_size[before_vol]}% to
{trade_size[after_vol]}%.</p>
{trade_size_chart}
</section>

</body>
</html>
"""


def build_report():
    con = _connect()
    try:
        sync_fig, sync_stats = build_sync_chart(con)
        sector_fig, sector_stats = build_sector_chart(con)
        trade_size_fig, trade_size_stats = build_trade_size_chart(con)
    finally:
        con.close()

    universe = "HDFCBANK.NS, ICICIBANK.NS, INFY.NS, TCS.NS, ADANIENT.NS, RELIANCE.NS, TATASTEEL.BO"

    html = PAGE_TEMPLATE.format(
        universe=universe,
        generated=dt.date.today().isoformat(),
        sync=sync_stats,
        sector=sector_stats,
        trade_size=trade_size_stats,
        sync_chart=pio.to_html(sync_fig, include_plotlyjs="inline", full_html=False, div_id="sync-chart"),
        sector_chart=pio.to_html(sector_fig, include_plotlyjs=False, full_html=False, div_id="sector-chart"),
        trade_size_chart=pio.to_html(trade_size_fig, include_plotlyjs=False, full_html=False, div_id="trade-size-chart"),
    )

    REPORT_PATH.write_text(html, encoding="utf-8")
    print(f"[dashboard] wrote {REPORT_PATH}")
    print(f"[dashboard] claim 1: {sync_stats}")
    print(f"[dashboard] claim 2: {sector_stats}")
    print(f"[dashboard] claim 3: {trade_size_stats}")
    return sync_stats, sector_stats, trade_size_stats


def main():
    build_report()


if __name__ == "__main__":
    main()
