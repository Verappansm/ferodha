package com.trade.signal;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * The one methodology this module uses, on daily closes, oldest first (Sprint 10 stretch:
 * trade advice and signals). Plain statistics, nothing learned:
 *
 * <ul>
 *   <li>Trend: the 20-day simple moving average against the 50-day one. Above is an uptrend,
 *       below a downtrend.</li>
 *   <li>Filter: the 14-day RSI (Wilder). An uptrend that is already overbought (RSI 70 or more)
 *       is not a buy, and a downtrend already oversold (30 or less) is not a sell: both read as
 *       hold, because the move may be stretched.</li>
 *   <li>Strength: how far apart the two averages are, as a share of the slower one: under 1% weak,
 *       under 3% moderate, otherwise strong.</li>
 * </ul>
 * Fewer than 50 closes is HOLD with that reason, never a guess.
 */
public final class SignalCalculator {

    public static final int FAST = 20;
    public static final int SLOW = 50;
    public static final int RSI_PERIOD = 14;
    static final BigDecimal OVERBOUGHT = BigDecimal.valueOf(70);
    static final BigDecimal OVERSOLD = BigDecimal.valueOf(30);

    private SignalCalculator() {
    }

    public enum Direction { BUY, SELL, HOLD }

    public enum Strength { WEAK, MODERATE, STRONG }

    public record Result(Direction direction, Strength strength, String reason,
                         BigDecimal smaFast, BigDecimal smaSlow, BigDecimal rsi, BigDecimal lastClose,
                         int closesUsed) {
    }

    public static Result evaluate(List<BigDecimal> closes) {
        int n = closes.size();
        if (n < SLOW) {
            return new Result(Direction.HOLD, Strength.WEAK,
                    "Not enough history yet: " + n + " daily closes, " + SLOW + " are needed.",
                    null, null, null, n == 0 ? null : closes.get(n - 1), n);
        }
        BigDecimal fast = sma(closes, FAST);
        BigDecimal slow = sma(closes, SLOW);
        BigDecimal rsi = rsi(closes, RSI_PERIOD);
        BigDecimal last = closes.get(n - 1);

        BigDecimal gapPercent = fast.subtract(slow).abs()
                .multiply(BigDecimal.valueOf(100))
                .divide(slow, 2, RoundingMode.HALF_UP);
        Strength strength = gapPercent.compareTo(BigDecimal.ONE) < 0 ? Strength.WEAK
                : gapPercent.compareTo(BigDecimal.valueOf(3)) < 0 ? Strength.MODERATE : Strength.STRONG;

        int trend = fast.compareTo(slow);
        String averages = "the 20-day average (" + plain(fast) + ") is "
                + (trend > 0 ? "above" : trend < 0 ? "below" : "level with")
                + " the 50-day average (" + plain(slow) + ")";
        Direction direction;
        String reason;
        if (trend > 0 && rsi.compareTo(OVERBOUGHT) < 0) {
            direction = Direction.BUY;
            reason = "Uptrend: " + averages + ", and the 14-day RSI of " + plain(rsi) + " is not overbought.";
        } else if (trend < 0 && rsi.compareTo(OVERSOLD) > 0) {
            direction = Direction.SELL;
            reason = "Downtrend: " + averages + ", and the 14-day RSI of " + plain(rsi) + " is not oversold.";
        } else if (trend > 0) {
            direction = Direction.HOLD;
            reason = "Uptrend, but stretched: " + averages + ", and the 14-day RSI of " + plain(rsi)
                    + " is overbought (70 or more).";
        } else if (trend < 0) {
            direction = Direction.HOLD;
            reason = "Downtrend, but stretched: " + averages + ", and the 14-day RSI of " + plain(rsi)
                    + " is oversold (30 or less).";
        } else {
            direction = Direction.HOLD;
            reason = "No trend: " + averages + ".";
        }
        return new Result(direction, direction == Direction.HOLD ? Strength.WEAK : strength, reason,
                fast, slow, rsi, last, n);
    }

    /** The mean of the last {@code period} closes. */
    static BigDecimal sma(List<BigDecimal> closes, int period) {
        BigDecimal sum = BigDecimal.ZERO;
        for (int i = closes.size() - period; i < closes.size(); i++) {
            sum = sum.add(closes.get(i));
        }
        return sum.divide(BigDecimal.valueOf(period), 4, RoundingMode.HALF_UP);
    }

    /** Wilder's RSI over the whole series, smoothed with the given period. */
    static BigDecimal rsi(List<BigDecimal> closes, int period) {
        double avgGain = 0;
        double avgLoss = 0;
        for (int i = 1; i <= period; i++) {
            double change = closes.get(i).subtract(closes.get(i - 1)).doubleValue();
            avgGain += Math.max(change, 0);
            avgLoss += Math.max(-change, 0);
        }
        avgGain /= period;
        avgLoss /= period;
        for (int i = period + 1; i < closes.size(); i++) {
            double change = closes.get(i).subtract(closes.get(i - 1)).doubleValue();
            avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
            avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
        }
        if (avgLoss == 0) {
            return avgGain == 0 ? BigDecimal.valueOf(50) : BigDecimal.valueOf(100);
        }
        double rs = avgGain / avgLoss;
        return BigDecimal.valueOf(100 - 100 / (1 + rs)).setScale(2, RoundingMode.HALF_UP);
    }

    private static String plain(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP).toPlainString();
    }
}
