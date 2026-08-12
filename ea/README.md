# Gold trading EAs (MT5)

Two standalone MetaTrader 5 Expert Advisors for gold (XAUUSD). Both are
unrelated to the rest of this repository (the Northstone landscaping app) —
they're kept in their own `ea/` folder.

- **`GoldTrendBreakoutEA.mq5`** — swing/trend-following, fewer and larger
  trades, meant for H1+ timeframes.
- **`GoldScalperEA.mq5`** — high-frequency momentum scalping, many small
  trades, meant for M1/M5 timeframes.

Pick one (or run both on separate charts with different magic numbers —
they already use different defaults).

---

## GoldTrendBreakoutEA

Combines a trend filter with a Donchian-channel breakout trigger, ATR-based
stops/targets, and equity-percentage position sizing.

### Strategy

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

### Inputs

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

---

## GoldScalperEA

A high-frequency momentum scalper: fast EMA crossover confirmed by RSI,
tight ATR-based stops/targets, and several overtrading safeguards, meant
for low timeframes (M1/M5) where trade count is much higher than the
trend-following EA.

### Strategy

Runs once per new bar on the chart's timeframe (default suggestion: XAUUSD, M1 or M5):

1. **Signal** — a fast/medium EMA crossover (`InpFastEMAPeriod`/
   `InpMediumEMAPeriod`, default 5/13) confirmed by RSI momentum
   (`InpRSIPeriod`, default 7): RSI above `InpRSIMidline` for longs, below
   for shorts.
2. **Volatility floor** (optional) — `InpMinATRPoints` skips entries when
   ATR is too low, avoiding dead/quiet periods where spread alone would
   erase any edge.
3. **Stops/targets** — tighter ATR multiples than the swing EA: stop-loss =
   `ATR * InpATR_SL_Multiplier` (default 1.2), take-profit =
   `ATR * InpATR_TP_Multiplier` (default 1.8).
4. **Break-even** (optional, on by default) — once a trade is up
   `ATR * InpBreakEvenATRMultiplier`, the stop moves to entry plus a small
   buffer (`InpBreakEvenBufferPoints`), locking in a scratch-or-better.
5. **Time-based force exit** (`InpMaxBarsInTrade`, default 30 bars) — closes
   a trade that's overstayed instead of letting a scalp drift into a
   multi-hour hold.
6. **Position sizing** — same equity-percentage-of-risk model as the swing
   EA, defaulting to a smaller `InpRiskPercent` (0.5%) since trade count is
   much higher.

### Overtrading safeguards

Scalping amplifies the cost of spread and bad signals if left unchecked, so
this EA adds:

- **`InpMaxSpreadPoints`** (default 150, tighter than the swing EA's 500) —
  spread eats a much larger share of a small scalp target.
- **`InpMaxTradesPerDay`** (default 20) — hard daily cap.
- **`InpCooldownBars`** (default 3) — minimum bars between entries, so one
  signal can't immediately re-trigger another.
- **`InpUseSessionFilter`** (default **true**, unlike the swing EA) — scalping
  needs liquid conditions; the default window (8-17 server time) approximates
  the London/NY overlap, but check what your broker's server time actually
  corresponds to and adjust.

### Inputs

| Group | Input | Default | Meaning |
|---|---|---|---|
| Moving averages | `InpFastEMAPeriod` | 5 | Fast EMA period |
| | `InpMediumEMAPeriod` | 13 | Medium EMA period |
| Momentum | `InpRSIPeriod` | 7 | RSI period |
| | `InpRSIMidline` | 50.0 | RSI midline for momentum confirmation |
| ATR | `InpATRPeriod` | 14 | ATR period |
| | `InpATR_SL_Multiplier` | 1.2 | Stop-loss distance = ATR × this |
| | `InpATR_TP_Multiplier` | 1.8 | Take-profit distance = ATR × this |
| | `InpMinATRPoints` | 0 | Minimum ATR (points) required to trade; 0 = disabled |
| Trade mgmt | `InpUseBreakEven` | true | Move SL to entry+buffer once in enough profit |
| | `InpBreakEvenATRMultiplier` | 0.8 | Profit trigger for break-even = ATR × this |
| | `InpBreakEvenBufferPoints` | 20 | Buffer past entry (points) once break-even hits |
| | `InpMaxBarsInTrade` | 30 | Force-close after this many bars; 0 = disabled |
| Risk | `InpRiskPercent` | 0.5 | % of equity risked per trade |
| | `InpMaxPositions` | 1 | Max simultaneous positions from this EA |
| | `InpMaxTradesPerDay` | 20 | Daily trade cap; 0 = disabled |
| | `InpCooldownBars` | 3 | Bars to wait after opening before next entry |
| Execution | `InpMaxSpreadPoints` | 150 | Skip entries above this spread (points) |
| | `InpSlippagePoints` | 15 | Max allowed slippage |
| | `InpUseSessionFilter` | true | Restrict entries to a server-time window |
| | `InpSessionStartHour` / `InpSessionEndHour` | 8 / 17 | Session window (server time, 0-23) |
| Misc | `InpMagicNumber` | 20260813 | Identifies this EA's own trades |

---

## Installation (either EA)

1. Open MetaTrader 5 → **File → Open Data Folder** → `MQL5/Experts/`.
2. Copy the `.mq5` file into that folder (a subfolder is fine).
3. In MetaEditor (F4 from MT5), open the file and **Compile** (F7). Fix any
   compiler warnings specific to your MT5 build if they appear.
4. In MT5, open an XAUUSD chart at the intended timeframe (H1 for the
   trend EA, M1/M5 for the scalper), drag the EA from the Navigator onto
   the chart, and enable **Algo Trading**.

## Before trading live

- **Backtest first.** Use the Strategy Tester (View → Strategy Tester, or
  Ctrl+R) on XAUUSD with real tick data over several years, across different
  volatility regimes (2020 crash, 2022 rate-hike trend, chop periods). For
  the scalper specifically, use **"Every tick based on real ticks"** modeling
  — anything coarser won't represent spread/fill behavior realistically
  enough for a strategy this sensitive to execution cost.
- **Check your broker's XAUUSD contract specs** — digits, tick size, tick
  value, and minimum stop distance vary by broker and affect both the lot
  sizing math and whether ATR-based stops clear the broker's minimum
  distance. Both EAs read these live via `SymbolInfoDouble`/
  `SymbolInfoInteger`, but you should still sanity-check the resulting lot
  sizes and stop distances in the tester journal before going live.
- **Gold spreads widen sharply around news** (NFP, FOMC, CPI). The
  `InpMaxSpreadPoints` filter helps but isn't a substitute for knowing your
  broker's typical spread behavior around high-impact events — this matters
  even more for the scalper, where spread is a bigger fraction of the
  target.
- **Test on a demo account** for a meaningful stretch before committing real
  capital, and only risk capital you can afford to lose. Past backtest
  performance does not guarantee future results. These EAs are provided as
  a starting point, not financial advice.
