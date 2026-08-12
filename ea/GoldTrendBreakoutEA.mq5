//+------------------------------------------------------------------+
//|                                        GoldTrendBreakoutEA.mq5   |
//|      Trend-filtered Donchian breakout EA for XAUUSD (MT5)       |
//+------------------------------------------------------------------+
#property copyright "Northstone"
#property version   "1.00"
#property strict

#include <Trade\Trade.mqh>

//--- Strategy inputs
input group "Moving averages"
input int    InpFastMAPeriod        = 20;      // Fast EMA period
input int    InpSlowMAPeriod        = 50;      // Slow EMA period
input int    InpTrendMAPeriod       = 200;     // Trend filter EMA period

input group "Breakout"
input int    InpBreakoutBars        = 20;      // Donchian channel lookback (bars)

input group "Volatility / ATR"
input int    InpATRPeriod           = 14;      // ATR period
input double InpATR_SL_Multiplier   = 2.0;     // Stop-loss = ATR * this
input double InpATR_TP_Multiplier   = 3.0;     // Take-profit = ATR * this
input bool   InpUseTrailingStop     = true;    // Trail stop as trade moves into profit
input double InpATR_Trail_Multiplier= 1.5;     // Trailing distance = ATR * this

input group "Risk management"
input double InpRiskPercent         = 1.0;     // % of equity risked per trade
input int    InpMaxPositions        = 1;       // Max simultaneous positions (this EA)
input bool   InpCloseOnOppositeSignal = true;  // Flatten on opposite crossover

input group "Execution filters"
input int    InpMaxSpreadPoints     = 500;     // Skip entries above this spread (points)
input int    InpSlippagePoints      = 30;      // Max allowed slippage (points)
input bool   InpUseSessionFilter    = false;   // Restrict entries to a server-time window
input int    InpSessionStartHour    = 7;       // Session start hour (0-23, server time)
input int    InpSessionEndHour      = 20;      // Session end hour (0-23, server time)

input group "Misc"
input ulong  InpMagicNumber         = 20260812;

CTrade trade;

int handleFastMA  = INVALID_HANDLE;
int handleSlowMA  = INVALID_HANDLE;
int handleTrendMA = INVALID_HANDLE;
int handleATR     = INVALID_HANDLE;

datetime lastBarTime = 0;

//+------------------------------------------------------------------+
int OnInit()
{
   handleFastMA  = iMA(_Symbol, PERIOD_CURRENT, InpFastMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   handleSlowMA  = iMA(_Symbol, PERIOD_CURRENT, InpSlowMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   handleTrendMA = iMA(_Symbol, PERIOD_CURRENT, InpTrendMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   handleATR     = iATR(_Symbol, PERIOD_CURRENT, InpATRPeriod);

   if(handleFastMA == INVALID_HANDLE || handleSlowMA == INVALID_HANDLE ||
      handleTrendMA == INVALID_HANDLE || handleATR == INVALID_HANDLE)
   {
      Print("GoldTrendBreakoutEA: failed to create indicator handle(s)");
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
   if(handleFastMA  != INVALID_HANDLE) IndicatorRelease(handleFastMA);
   if(handleSlowMA  != INVALID_HANDLE) IndicatorRelease(handleSlowMA);
   if(handleTrendMA != INVALID_HANDLE) IndicatorRelease(handleTrendMA);
   if(handleATR     != INVALID_HANDLE) IndicatorRelease(handleATR);
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
   // window wraps past midnight
   return dt.hour >= InpSessionStartHour || dt.hour < InpSessionEndHour;
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
void CloseOwnPositions(int direction) // POSITION_TYPE_BUY or POSITION_TYPE_SELL
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if((ulong)PositionGetInteger(POSITION_MAGIC) != InpMagicNumber) continue;
      if((int)PositionGetInteger(POSITION_TYPE) == direction)
         trade.PositionClose(ticket);
   }
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
void ManageTrailingStop()
{
   if(!InpUseTrailingStop) return;

   double atr[];
   ArraySetAsSeries(atr, true);
   if(CopyBuffer(handleATR, 0, 0, 2, atr) < 2) return;
   double trailDistance = atr[1] * InpATR_Trail_Multiplier;
   if(trailDistance <= 0) return;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if((ulong)PositionGetInteger(POSITION_MAGIC) != InpMagicNumber) continue;

      long   type    = PositionGetInteger(POSITION_TYPE);
      double openPx  = PositionGetDouble(POSITION_PRICE_OPEN);
      double curSL   = PositionGetDouble(POSITION_SL);
      double curTP   = PositionGetDouble(POSITION_TP);

      if(type == POSITION_TYPE_BUY)
      {
         double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
         double newSL = NormalizeDouble(bid - trailDistance, _Digits);
         if(newSL > openPx && (curSL == 0 || newSL > curSL))
            trade.PositionModify(ticket, newSL, curTP);
      }
      else if(type == POSITION_TYPE_SELL)
      {
         double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
         double newSL = NormalizeDouble(ask + trailDistance, _Digits);
         if(newSL < openPx && (curSL == 0 || newSL < curSL))
            trade.PositionModify(ticket, newSL, curTP);
      }
   }
}

//+------------------------------------------------------------------+
void OnTick()
{
   ManageTrailingStop();

   if(!IsNewBar()) return;
   if(!WithinSession()) return;

   long spreadPoints = SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
   if(spreadPoints > InpMaxSpreadPoints) return;

   double fastMA[], slowMA[], trendMA[], atr[], closeArr[], highArr[], lowArr[];
   ArraySetAsSeries(fastMA, true);
   ArraySetAsSeries(slowMA, true);
   ArraySetAsSeries(trendMA, true);
   ArraySetAsSeries(atr, true);
   ArraySetAsSeries(closeArr, true);
   ArraySetAsSeries(highArr, true);
   ArraySetAsSeries(lowArr, true);

   int need = InpBreakoutBars + 2;
   if(CopyBuffer(handleFastMA, 0, 0, 3, fastMA) < 3) return;
   if(CopyBuffer(handleSlowMA, 0, 0, 3, slowMA) < 3) return;
   if(CopyBuffer(handleTrendMA, 0, 0, 2, trendMA) < 2) return;
   if(CopyBuffer(handleATR, 0, 0, 2, atr) < 2) return;
   if(CopyClose(_Symbol, PERIOD_CURRENT, 0, need, closeArr) < need) return;
   if(CopyHigh(_Symbol, PERIOD_CURRENT, 0, need, highArr) < need) return;
   if(CopyLow(_Symbol, PERIOD_CURRENT, 0, need, lowArr) < need) return;

   // Donchian channel over the N bars preceding the last closed bar (indices 2..N+1)
   double donchianHigh = highArr[2];
   double donchianLow  = lowArr[2];
   for(int i = 3; i <= InpBreakoutBars + 1; i++)
   {
      if(highArr[i] > donchianHigh) donchianHigh = highArr[i];
      if(lowArr[i]  < donchianLow)  donchianLow  = lowArr[i];
   }

   double lastClose = closeArr[1];
   double atrValue   = atr[1];

   bool fastCrossedUp   = fastMA[2] <= slowMA[2] && fastMA[1] > slowMA[1];
   bool fastCrossedDown = fastMA[2] >= slowMA[2] && fastMA[1] < slowMA[1];

   bool buySignal  = fastCrossedUp   && lastClose > trendMA[1] && lastClose > donchianHigh;
   bool sellSignal = fastCrossedDown && lastClose < trendMA[1] && lastClose < donchianLow;

   if(InpCloseOnOppositeSignal)
   {
      if(buySignal)  CloseOwnPositions(POSITION_TYPE_SELL);
      if(sellSignal) CloseOwnPositions(POSITION_TYPE_BUY);
   }

   if(atrValue <= 0) return;

   double minStopDistance = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
   double slDistance = MathMax(atrValue * InpATR_SL_Multiplier, minStopDistance);
   double tpDistance = atrValue * InpATR_TP_Multiplier;

   if(buySignal && CountOwnPositions(POSITION_TYPE_BUY) < InpMaxPositions)
   {
      double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      double sl  = NormalizeDouble(ask - slDistance, _Digits);
      double tp  = NormalizeDouble(ask + tpDistance, _Digits);
      double lots = CalculateLotSize(slDistance);
      if(lots > 0)
         trade.Buy(lots, _Symbol, ask, sl, tp, "GoldTrendBreakout buy");
   }
   else if(sellSignal && CountOwnPositions(POSITION_TYPE_SELL) < InpMaxPositions)
   {
      double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      double sl  = NormalizeDouble(bid + slDistance, _Digits);
      double tp  = NormalizeDouble(bid - tpDistance, _Digits);
      double lots = CalculateLotSize(slDistance);
      if(lots > 0)
         trade.Sell(lots, _Symbol, bid, sl, tp, "GoldTrendBreakout sell");
   }
}
//+------------------------------------------------------------------+
