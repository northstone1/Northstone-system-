//+------------------------------------------------------------------+
//|                                              BTCScalperEA.mq5    |
//|    High-frequency EMA/RSI momentum scalper for BTCUSD (MT5)     |
//+------------------------------------------------------------------+
#property copyright "Northstone"
#property version   "1.00"
#property strict

#include <Trade\Trade.mqh>

//--- Strategy inputs
input group "Moving averages"
input int    InpFastEMAPeriod       = 5;       // Fast EMA period
input int    InpMediumEMAPeriod     = 13;      // Medium EMA period

input group "Momentum"
input int    InpRSIPeriod           = 7;       // RSI period
input double InpRSIMidline          = 50.0;    // RSI midline for momentum confirmation

input group "Volatility / ATR"
input int    InpATRPeriod           = 14;      // ATR period
input double InpATR_SL_Multiplier   = 1.2;     // Stop-loss = ATR * this
input double InpATR_TP_Multiplier   = 1.8;     // Take-profit = ATR * this
input double InpMinATRPercent       = 0;       // Minimum ATR as % of price required to trade; 0 = disabled

input group "Trade management"
input bool   InpUseBreakEven        = true;    // Move SL to entry once in enough profit
input double InpBreakEvenATRMultiplier = 0.8;  // Profit trigger for break-even = ATR * this
input double InpBreakEvenBufferPercent = 0.02; // Extra buffer past entry (% of price) once break-even hits
input int    InpMaxBarsInTrade      = 30;      // Force-close after this many bars; 0 = disabled

input group "Risk management"
input double InpRiskPercent         = 0.5;     // % of equity risked per trade
input int    InpMaxPositions        = 1;       // Max simultaneous positions (this EA)
input int    InpMaxTradesPerDay     = 20;      // Daily trade cap; 0 = disabled
input int    InpCooldownBars        = 3;       // Bars to wait after opening before next entry

input group "Execution filters"
input double InpMaxSpreadPercent    = 0.10;    // Skip entries if spread exceeds this % of price - tighter than the trend EA, scalp targets are smaller
input int    InpSlippagePoints      = 100;     // Max allowed slippage (points) - BTC moves fast between signal and fill
input bool   InpUseSessionFilter    = false;   // Restrict entries to a server-time window (off by default - BTC trades 24/7)
input int    InpSessionStartHour    = 0;       // Session start hour (0-23, server time), only used if filter enabled
input int    InpSessionEndHour      = 24;      // Session end hour (0-23, server time), only used if filter enabled

input group "Misc"
input ulong  InpMagicNumber         = 20260815;

CTrade trade;

int handleFastEMA   = INVALID_HANDLE;
int handleMediumEMA = INVALID_HANDLE;
int handleRSI        = INVALID_HANDLE;
int handleATR        = INVALID_HANDLE;

datetime lastBarTime      = 0;
int      barsSinceEntry   = 1000000;
int      tradesToday      = 0;
int      lastTradeDay     = -1;

//+------------------------------------------------------------------+
int OnInit()
{
   handleFastEMA   = iMA(_Symbol, PERIOD_CURRENT, InpFastEMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   handleMediumEMA = iMA(_Symbol, PERIOD_CURRENT, InpMediumEMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   handleRSI       = iRSI(_Symbol, PERIOD_CURRENT, InpRSIPeriod, PRICE_CLOSE);
   handleATR       = iATR(_Symbol, PERIOD_CURRENT, InpATRPeriod);

   if(handleFastEMA == INVALID_HANDLE || handleMediumEMA == INVALID_HANDLE ||
      handleRSI == INVALID_HANDLE || handleATR == INVALID_HANDLE)
   {
      Print("BTCScalperEA: failed to create indicator handle(s)");
      return INIT_FAILED;
   }

   trade.SetExpertMagicNumber(InpMagicNumber);
   trade.SetDeviationInPoints(InpSlippagePoints);
   trade.SetTypeFillingBySymbol(_Symbol);

   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if(handleFastEMA   != INVALID_HANDLE) IndicatorRelease(handleFastEMA);
   if(handleMediumEMA != INVALID_HANDLE) IndicatorRelease(handleMediumEMA);
   if(handleRSI        != INVALID_HANDLE) IndicatorRelease(handleRSI);
   if(handleATR        != INVALID_HANDLE) IndicatorRelease(handleATR);
}

//+------------------------------------------------------------------+
bool IsNewBar()
{
   datetime t = iTime(_Symbol, PERIOD_CURRENT, 0);
   if(t != lastBarTime)
   {
      lastBarTime = t;
      return true;
   }
   return false;
}

//+------------------------------------------------------------------+
bool WithinSession()
{
   if(!InpUseSessionFilter) return true;
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   if(InpSessionStartHour <= InpSessionEndHour)
      return dt.hour >= InpSessionStartHour && dt.hour < InpSessionEndHour;
   return dt.hour >= InpSessionStartHour || dt.hour < InpSessionEndHour;
}

//+------------------------------------------------------------------+
void RefreshDailyCounter()
{
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   int today = dt.day_of_year + dt.year * 1000;
   if(today != lastTradeDay)
   {
      lastTradeDay = today;
      tradesToday  = 0;
   }
}

//+------------------------------------------------------------------+
bool SpreadTooWide()
{
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   if(bid <= 0) return true;
   double spreadPercent = (ask - bid) / bid * 100.0;
   return spreadPercent > InpMaxSpreadPercent;
}

//+------------------------------------------------------------------+
int CountOwnPositions(int direction) // -1 = any, POSITION_TYPE_BUY, POSITION_TYPE_SELL
{
   int count = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if((ulong)PositionGetInteger(POSITION_MAGIC) != InpMagicNumber) continue;
      if(direction == -1 || (int)PositionGetInteger(POSITION_TYPE) == direction)
         count++;
   }
   return count;
}

//+------------------------------------------------------------------+
double CalculateLotSize(double slDistance)
{
   if(slDistance <= 0) return 0;

   double equity    = AccountInfoDouble(ACCOUNT_EQUITY);
   double riskMoney = equity * InpRiskPercent / 100.0;

   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tickValue <= 0 || tickSize <= 0) return 0;

   double lossPerLot = (slDistance / tickSize) * tickValue;
   if(lossPerLot <= 0) return 0;

   double lots = riskMoney / lossPerLot;

   double minLot  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double lotStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(lotStep <= 0) lotStep = minLot;

   lots = MathFloor(lots / lotStep) * lotStep;
   lots = MathMax(minLot, MathMin(maxLot, lots));

   return NormalizeDouble(lots, 2);
}

//+------------------------------------------------------------------+
void ManageOpenTrades()
{
   double atr[];
   ArraySetAsSeries(atr, true);
   bool haveATR = CopyBuffer(handleATR, 0, 0, 1, atr) == 1;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if((ulong)PositionGetInteger(POSITION_MAGIC) != InpMagicNumber) continue;

      long   type   = PositionGetInteger(POSITION_TYPE);
      double openPx = PositionGetDouble(POSITION_PRICE_OPEN);
      double curSL  = PositionGetDouble(POSITION_SL);
      double curTP  = PositionGetDouble(POSITION_TP);
      datetime openTime = (datetime)PositionGetInteger(POSITION_TIME);

      // Time-based force exit
      if(InpMaxBarsInTrade > 0)
      {
         int barsElapsed = (int)((TimeCurrent() - openTime) / PeriodSeconds(PERIOD_CURRENT));
         if(barsElapsed >= InpMaxBarsInTrade)
         {
            trade.PositionClose(ticket);
            continue;
         }
      }

      // Break-even
      if(InpUseBreakEven && haveATR && atr[0] > 0)
      {
         double trigger = atr[0] * InpBreakEvenATRMultiplier;
         double buffer  = openPx * InpBreakEvenBufferPercent / 100.0;

         if(type == POSITION_TYPE_BUY)
         {
            double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
            double newSL = NormalizeDouble(openPx + buffer, _Digits);
            if(bid - openPx >= trigger && (curSL == 0 || curSL < newSL))
               trade.PositionModify(ticket, newSL, curTP);
         }
         else if(type == POSITION_TYPE_SELL)
         {
            double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
            double newSL = NormalizeDouble(openPx - buffer, _Digits);
            if(openPx - ask >= trigger && (curSL == 0 || curSL > newSL))
               trade.PositionModify(ticket, newSL, curTP);
         }
      }
   }
}

//+------------------------------------------------------------------+
void OnTick()
{
   RefreshDailyCounter();
   ManageOpenTrades();

   if(!IsNewBar()) return;
   barsSinceEntry++;

   if(!WithinSession()) return;
   if(InpMaxTradesPerDay > 0 && tradesToday >= InpMaxTradesPerDay) return;
   if(barsSinceEntry < InpCooldownBars) return;
   if(SpreadTooWide()) return;

   double fastEMA[], mediumEMA[], rsi[], atr[];
   ArraySetAsSeries(fastEMA, true);
   ArraySetAsSeries(mediumEMA, true);
   ArraySetAsSeries(rsi, true);
   ArraySetAsSeries(atr, true);

   if(CopyBuffer(handleFastEMA, 0, 0, 3, fastEMA) < 3) return;
   if(CopyBuffer(handleMediumEMA, 0, 0, 3, mediumEMA) < 3) return;
   if(CopyBuffer(handleRSI, 0, 0, 2, rsi) < 2) return;
   if(CopyBuffer(handleATR, 0, 0, 2, atr) < 2) return;

   double atrValue = atr[1];
   if(atrValue <= 0) return;

   double lastPrice = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(InpMinATRPercent > 0 && lastPrice > 0 && (atrValue / lastPrice * 100.0) < InpMinATRPercent) return;

   bool fastCrossedUp   = fastEMA[2] <= mediumEMA[2] && fastEMA[1] > mediumEMA[1];
   bool fastCrossedDown = fastEMA[2] >= mediumEMA[2] && fastEMA[1] < mediumEMA[1];

   bool buySignal  = fastCrossedUp   && rsi[1] > InpRSIMidline;
   bool sellSignal = fastCrossedDown && rsi[1] < InpRSIMidline;

   double minStopDistance = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
   double slDistance = MathMax(atrValue * InpATR_SL_Multiplier, minStopDistance);
   double tpDistance = atrValue * InpATR_TP_Multiplier;

   if(buySignal && CountOwnPositions(POSITION_TYPE_BUY) < InpMaxPositions)
   {
      double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      double sl  = NormalizeDouble(ask - slDistance, _Digits);
      double tp  = NormalizeDouble(ask + tpDistance, _Digits);
      double lots = CalculateLotSize(slDistance);
      if(lots > 0 && trade.Buy(lots, _Symbol, ask, sl, tp, "BTCScalper buy"))
      {
         tradesToday++;
         barsSinceEntry = 0;
      }
   }
   else if(sellSignal && CountOwnPositions(POSITION_TYPE_SELL) < InpMaxPositions)
   {
      double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      double sl  = NormalizeDouble(bid + slDistance, _Digits);
      double tp  = NormalizeDouble(bid - tpDistance, _Digits);
      double lots = CalculateLotSize(slDistance);
      if(lots > 0 && trade.Sell(lots, _Symbol, bid, sl, tp, "BTCScalper sell"))
      {
         tradesToday++;
         barsSinceEntry = 0;
      }
   }
}
//+------------------------------------------------------------------+
