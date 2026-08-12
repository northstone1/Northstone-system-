# GoldTrendBreakoutEA (MT5)

A MetaTrader 5 Expert Advisor for gold (XAUUSD), combining a trend filter with
a Donchian-channel breakout trigger, ATR-based stops/targets, and
equity-percentage position sizing.

This is a standalone MQL5 tool, unrelated to the rest of this repository (the
Northstone landscaping app) — it's kept in its own `ea/` folder.

## Strategy

Runs once per new bar on the chart's timeframe (default suggestion: XAUUSD, H1):

1. **Trend filter** — price must be above (long) or below (short) a slow EMA
   (`InpTrendMAPeriod`, default 200) to only trade with the dominant trend.
2. **Signal** — a fast/slow EMA crossover (`InpFastMAPeriod`/`InpSlowMAPeriod`,
   default 20/50) that also breaks out of the prior `InpBreakoutBars`-bar
   Donchian channel (highest high / lowest low), confirming momentum rather
   than a whipsaw crossover in a flat range.
3. **Stops/targets** — both set from ATR (`InpATRPeriod`, default 14):
   stop-loss = `ATR * InpATR_SL_Multiplier`, take-profit =
   `ATR * InpATR_TP_Multiplier` (defaults 2.0 / 3.0, i.e. ~1:1.5 reward:risk).
4. **Trailing stop** (optional, on by default) — once in profit, the stop
   trails price by `ATR * InpATR_Trail_Multiplier`, only ever tightening.
5. **Position sizing** — lot size is derived from `InpRiskPercent` of current
   account equity divided by the stop-loss distance, so risk per trade stays
   constant in money terms regardless of ATR/volatility at entry time.
6. **Exit on opposite signal** (optional, on by default) — an opposite
   crossover+breakout flattens any open position in the other direction
   before evaluating a new entry.

## Inputs

| Group | Input | Default | Meaning |
|---|---|---|---|
| Moving averages | `InpFastMAPeriod` | 20 | Fast EMA period |
| | `InpSlowMAPeriod` | 50 | Slow EMA period |
| | `InpTrendMAPeriod` | 200 | Trend-filter EMA period |
| Breakout | `InpBreakoutBars` | 20 | Donchian channel lookback |
| ATR | `InpATRPeriod` | 14 | ATR period |
| | `InpATR_SL_Multiplier` | 2.0 | Stop-loss distance = ATR × this |
| | `InpATR_TP_Multiplier` | 3.0 | Take-profit distance = ATR × this |
| | `InpUseTrailingStop` | true | Enable ATR trailing stop |
| | `InpATR_Trail_Multiplier` | 1.5 | Trailing distance = ATR × this |
| Risk | `InpRiskPercent` | 1.0 | % of equity risked per trade |
| | `InpMaxPositions` | 1 | Max simultaneous positions from this EA |
| | `InpCloseOnOppositeSignal` | true | Flatten on opposite signal |
| Execution | `InpMaxSpreadPoints` | 500 | Skip entries if spread exceeds this |
| | `InpSlippagePoints` | 30 | Max allowed slippage |
| | `InpUseSessionFilter` | false | Restrict entries to a server-time window |
| | `InpSessionStartHour` / `InpSessionEndHour` | 7 / 20 | Session window (server time, 0-23) |
| Misc | `InpMagicNumber` | 20260812 | Identifies this EA's own trades |

## Installation

1. Open MetaTrader 5 → **File → Open Data Folder** → `MQL5/Experts/`.
2. Copy `GoldTrendBreakoutEA.mq5` into that folder (a subfolder is fine).
3. In MetaEditor (F4 from MT5), open the file and **Compile** (F7). Fix any
   compiler warnings specific to your MT5 build if they appear.
4. In MT5, open an XAUUSD chart, drag the EA from the Navigator onto the
   chart, and enable **Algo Trading**.

## Before trading live

- **Backtest first.** Use the Strategy Tester (View → Strategy Tester, or
  Ctrl+R) on XAUUSD with real tick data over several years, across different
  volatility regimes (2020 crash, 2022 rate-hike trend, chop periods).
- **Check your broker's XAUUSD contract specs** — digits, tick size, tick
  value, and minimum stop distance vary by broker and affect both the lot
  sizing math and whether ATR-based stops clear the broker's minimum
  distance. The EA reads these live via `SymbolInfoDouble`/`SymbolInfoInteger`,
  but you should still sanity-check the resulting lot sizes and stop
  distances in the tester journal before going live.
- **Gold spreads widen sharply around news** (NFP, FOMC, CPI). The
  `InpMaxSpreadPoints` filter helps but isn't a substitute for knowing your
  broker's typical spread behavior around high-impact events.
- **Test on a demo account** for a meaningful stretch before committing real
  capital, and only risk capital you can afford to lose. Past backtest
  performance does not guarantee future results. This EA is provided as a
  starting point, not financial advice.
