import React, { useState, useEffect, useMemo, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import {
  LayoutGrid, FolderKanban, PlusCircle, Compass, Palette, Calculator, FileSignature,
  HardHat, Users, MessageSquare, CalendarDays, ListChecks, FileText, Settings as SettingsIcon,
  ChevronDown, ChevronUp, ChevronRight, Bell, StickyNote, ArrowRight, ArrowLeft, TrendingUp, Check, X,
  MapPin, Camera, Ruler, Droplets, Sparkles, PackageSearch, ClipboardCheck, Plus, Trash2,
  Wand2, Send, FileDown, Eye, EyeOff, ShieldCheck, CheckCircle2, Circle, Download, Phone, Mail,
  Image as ImageIcon, CreditCard, Clock, Star, Share2, Copy, Pencil, Search, Wallet, Boxes, Layers, LogOut, UserPlus
} from "lucide-react";
import { useAuth } from "./lib/AuthProvider";
import * as Projects from "./lib/data/projects";
import * as Leads from "./lib/data/leads";
import * as Events from "./lib/data/events";
import * as Team from "./lib/data/team";
import * as Portfolio from "./lib/data/portfolio";
import * as Settings from "./lib/data/settings";
import * as PricingToolData from "./lib/data/pricingTool";
import { uploadPhoto, deletePhoto, getSignedPhotoUrl, PROJECT_PHOTOS_BUCKET } from "./lib/data/storage";
import PhotoImg from "./components/PhotoImg";

// ============================================================
// BRAND TOKENS
// ============================================================
const FOREST = "#0f2a20";
const FOREST_DEEP = "#0a1f18";
const GOLD = "#c8952f";
const PARCHMENT = "#f6f3ec";
const INK = "#20241f";
// A real UUID, not a short random string — emptyDraft() uses this for a new
// project's id, and that id gets sent straight to Postgres as the
// projects.id primary key (uuid column) the first time the project saves.
// A non-UUID string there fails outright ("invalid input syntax for type
// uuid"), so every id generated locally has to be genuinely UUID-shaped,
// not just any string that happens to look unique.
const uid = () => crypto.randomUUID();
const gbp = (n) => `£${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// proposal.durationWeeks used to be a free-text string ("4 – 6 Weeks");
// projects saved before that changed to a plain number still have the old
// string sitting in their data, so every read site falls back to a sane
// default rather than propagating NaN into a client-facing document.
const projectDurationWeeks = (p) => {
  const n = Number(p?.durationWeeks);
  return n > 0 ? n : 2;
};
// Formats a fractional week count as whichever unit reads naturally —
// days for anything under a week, half-weeks otherwise — used to turn a
// stage's proportional share of the total duration into display text.
const formatStageDuration = (weeks) => {
  if (weeks < 1) {
    const days = Math.max(1, Math.round(weeks * 7));
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  const rounded = Math.round(weeks * 2) / 2;
  return `${rounded % 1 === 0 ? rounded : rounded.toFixed(1)} week${rounded === 1 ? "" : "s"}`;
};
const generateReferralCode = (proj) => {
  const namePart = (proj.client || "CLIENT").split(" ")[0].toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6) || "CLIENT";
  const num = Math.floor(1000 + Math.random() * 9000);
  return `NORTH-${namePart}${num}`;
};
const inputStyle = { padding: "8px 10px", border: "1px solid #ddd8ca", borderRadius: 6, fontSize: 12.5, fontFamily: "inherit", background: "#fff" };

const REQUIRED_PHOTOS = ["Front of Property", "Rear Garden", "Left Side", "Right Side", "Driveway Access", "Drainage / Gully", "Electric Supply", "Water Supply"];
const SERVICE_OPTIONS = ["Driveways", "Electric Gates", "Patios & Paving", "Fencing", "Landscaping", "Lighting", "Garden Rooms", "Retaining Walls", "Pergolas", "Drainage", "Outdoor Kitchens", "Other"];
const SURVEY_STEPS = [
  { key: "info", label: "Site Information", icon: MapPin },
  { key: "measure", label: "Measurements", icon: Ruler },
  { key: "photos", label: "Site Photos", icon: Camera },
  { key: "services", label: "Services & Drainage", icon: Droplets },
  { key: "vision", label: "Client Vision", icon: Sparkles },
  { key: "review", label: "Review & Generate Estimate", icon: ClipboardCheck },
];
const PAYMENT_STAGES = ["Deposit on Acceptance", "Materials Ordered", "Substantial Completion", "Final Payment & Handover"];
const LEAD_STATUSES = ["New", "Contacted", "Survey Booked", "Quoted", "Won", "Lost"];
const LOST_REASONS = ["Price too high", "Went with another company", "Client went quiet", "Project postponed", "Changed their mind", "Other"];
const LEAD_SOURCES = ["Phone Call", "Website", "Referral", "Google Ads", "Social Media", "Walk-in", "Other"];
const EVENT_TYPES = ["Site Visit", "Site Survey", "Client Meeting", "Phone Call", "Team Meeting", "Delivery", "Other"];
const TEAM_ROLES = ["Project Manager", "Site Supervisor", "Groundworker", "Landscaper", "Electrician", "Subcontractor", "Admin", "Owner / Director"];
const TEAM_COLORS = ["#1f5b3f", "#3a5a8a", "#a06a12", "#7a4a9c", "#c0392b", "#b85427", "#0f2a20", "#8a887f"];
const EVENT_TYPE_COLOR = { "Site Visit": "#1f5b3f", "Site Survey": "#3a5a8a", "Client Meeting": "#a06a12", "Phone Call": "#7a4a9c", "Team Meeting": "#0f2a20", "Delivery": "#b85427", "Other": "#8a887f" };

const PLAYBOOK_SECTIONS = [
  {
    id: "pricing", title: "Pricing", icon: Calculator,
    points: [
      "Price from your real rate database — materials, labour, plant — not gut feel. Every job should trace back to the numbers in your Estimate, not a round figure that felt about right.",
      "Markup and margin aren't the same thing. If a job costs you £1,000 and you want a 30% margin, the sell price is £1,000 ÷ (1 − 0.30) = £1,429 — not £1,000 × 1.30 (£1,300). Mixing the two quietly under-prices every job you do.",
      "Build in contingency on every job, not just the tricky ones. Ground conditions, drainage, and access issues are the norm in outdoor work, not the exception.",
      "Revisit your rates twice a year. Material and labour costs move constantly — stale rates erode margin without you noticing.",
    ],
  },
  {
    id: "margins", title: "Profit Margins", icon: TrendingUp,
    points: [
      "Sell price = direct costs (materials, labour, plant) + overheads (van, insurance, admin, software, this app) + profit. Overheads have to be recovered on every job — they're not 'whatever's left.'",
      "For design & build landscaping, a healthy gross margin typically sits between 25–35%. Below 20% leaves almost no room for the unexpected.",
      "Track margin per job, not just revenue. A £40k job at 15% margin nets £6k. A £15k job at 35% margin nets £5.25k — often better for your business once you weigh in the risk, time, and cash tied up.",
      "Big jobs feel good to win but can quietly be your worst margin performers. Check the percentage, not just the total.",
    ],
  },
  {
    id: "cashflow", title: "Cash Flow", icon: Wallet,
    points: [
      "Staged payments protect you: deposit on acceptance, materials ordered, mid-project, completion. Never fund someone else's job from your own pocket.",
      "Chase overdue payments the day they're due, not weeks later. The longer an invoice sits unpaid, the less likely it gets paid in full.",
      "Keep 1–2 months of overheads as a buffer. Landscaping is seasonal — winter cash flow catches out businesses that spent every summer pound as it landed.",
      "Referral rewards, materials, and subcontractor payments are real cash going out. Factor them into what a job actually nets you, not just what it bills.",
    ],
  },
  {
    id: "growth", title: "Growth", icon: Users,
    points: [
      "Grow margin before you grow volume. More jobs at thin margins usually just means more risk and more admin for similar money.",
      "Reinvest profit deliberately — better tools, training, your first hire — rather than letting it sit as 'spare' cash with no purpose.",
      "Referrals are the cheapest way to grow: a happy client costs nothing to acquire and converts at a far higher rate than a cold lead. That's exactly what your in-app referral reward is designed to encourage.",
      "Watch your lead-to-won conversion rate over time in Reports. If it drops, the usual causes are pricing, slow response time, or a weak proposal — rarely 'the market.'",
    ],
  },
];
const CAT_COLORS = ["#0f2a20", "#c8952f", "#3a5a8a", "#a06a12", "#7a4a9c", "#1f5b3f", "#b85427", "#8a887f"];
const TIMELINE_STAGES = [
  { key: "prep", label: "Site Preparation" }, { key: "ground", label: "Groundworks" },
  { key: "landscaping", label: "Landscaping" }, { key: "structures", label: "Structures" },
  { key: "finishing", label: "Finishing" }, { key: "handover", label: "Handover" },
];

// ============================================================
// DETAILED JOB PRICING TOOL — labour/plant/materials/surfacing/etc,
// with tiered & ranged rates, supplier tagging, and POA categories.
// ============================================================
const PRICING_CATEGORIES = [
  { id: "labour", name: "Labour", items: [
    { id: "ryan", label: "Ryan / Lead operative", type: "fixed", rate: 300, cost: 180, unit: "day" },
    { id: "skilled", label: "Main skilled worker", type: "fixed", rate: 300, cost: 180, unit: "day" },
    { id: "labourer", label: "General labourer", type: "fixed", rate: 150, cost: 90, unit: "day" },
  ]},
  { id: "plant", name: "Plant", items: [
    { id: "digger", label: "Mini/Midi digger", type: "range", min: 80, max: 200, cost: 70, unit: "day" },
    { id: "dumper", label: "Dumper", type: "range", min: 80, max: 200, cost: 65, unit: "day" },
    { id: "grab", label: "Grab wagon", type: "fixed", rate: 250, cost: 170, unit: "load" },
  ]},
  { id: "materials", name: "Materials", items: [
    { id: "mot1", label: "MOT Type 1", type: "fixed", rate: 60, cost: 35, unit: "tonne", logistic: "Grab wagon brings & takes away" },
    { id: "rec1", label: "Recycled Type 1", type: "fixed", rate: 40, cost: 22, unit: "tonne", logistic: "Grab wagon brings & takes away" },
    { id: "sand", label: "Sharp sand", type: "fixed", rate: 60, cost: 32, unit: "tonne", logistic: "Grab wagon brings & takes away" },
    { id: "topsoil", label: "Topsoil", type: "fixed", rate: 70, cost: 38, unit: "tonne", logistic: "Grab wagon brings & takes away" },
    { id: "cement", label: "Cement", type: "fixed", rate: 7, cost: 4, unit: "bag", supplier: "jewson" },
    { id: "aco", label: "ACO drain", type: "fixed", rate: 20, cost: 11, unit: "each", supplier: "jewson" },
    { id: "manhole", label: "Manhole cover", type: "fixed", rate: 80, cost: 45, unit: "each", supplier: "jewson" },
    { id: "draininstall", label: "Drainage installation", type: "fixed", rate: 100, cost: 55, unit: "m", supplier: "jewson" },
    { id: "grano", label: "Grano dust", type: "fixed", rate: 100, cost: 55, unit: "tonne", logistic: "Grab wagon brings & takes away" },
    { id: "concretesupply", label: "Concrete (supplied)", type: "fixed", rate: 180, cost: 100, unit: "m³" },
  ]},
  { id: "surfacing", name: "Surfacing", items: [
    { id: "blockpaving", label: "Block paving (Tobermore)", type: "tier", tiers: { Bronze: 100, Signature: 145, Prestige: 190 }, costs: { Bronze: 55, Signature: 82, Prestige: 112 }, unit: "m²", supplier: "tobermore" },
    { id: "blockpaving_ta", label: "Block paving (Thomas Armstrong)", type: "tier", tiers: { Bronze: 95, Signature: 138, Prestige: 180 }, costs: { Bronze: 50, Signature: 76, Prestige: 105 }, unit: "m²", supplier: "thomasarmstrong" },
    { id: "porcelain", label: "Porcelain paving", type: "tier", tiers: { Bronze: 120, Signature: 180, Prestige: 250 }, costs: { Bronze: 65, Signature: 100, Prestige: 145 }, unit: "m²", supplier: "nustone" },
    { id: "sandstone", label: "Indian sandstone", type: "tier", tiers: { Bronze: 120, Signature: 160, Prestige: 200 }, costs: { Bronze: 65, Signature: 88, Prestige: 115 }, unit: "m²", estimated: true, supplier: "nustone" },
    { id: "resin", label: "Resin-bound surfacing", type: "fixed", rate: 140, cost: 78, unit: "m²", fromPrice: true, supplier: "durabound" },
    { id: "tarmac", label: "Tarmac", type: "fixed", rate: 150, cost: 85, unit: "m²", fromPrice: true },
    { id: "gravel", label: "Gravel driveway", type: "fixed", rate: 80, cost: 42, unit: "m²", fromPrice: true },
  ]},
  { id: "groundworks", name: "Groundworks", items: [
    { id: "machineexc", label: "Machine excavation", type: "range", min: 90, max: 125, cost: 60, unit: "m³" },
    { id: "handexc", label: "Hand excavation", type: "range", min: 100, max: 135, cost: 65, unit: "m³" },
    { id: "foundexc", label: "Foundation excavation", type: "range", min: 90, max: 130, cost: 60, unit: "m³" },
    { id: "concretegw", label: "Concrete", type: "fixed", rate: 130, cost: 75, unit: "m³" },
    { id: "surfacedrain", label: "Surface water drainage", type: "range", min: 30, max: 100, cost: 25, unit: "m" },
    { id: "fouldrain", label: "Foul drainage", type: "range", min: 40, max: 90, cost: 28, unit: "m" },
  ]},
  { id: "kerbs", name: "Kerbs", items: [
    { id: "concretekerb", label: "Concrete kerbs", type: "fixed", rate: 20, cost: 11, unit: "m", supplier: "marshalls" },
    { id: "blockkerb", label: "Block paving kerbs", type: "range", min: 16, max: 22, cost: 10, unit: "m", supplier: "tobermore" },
    { id: "granitekerb", label: "Granite/natural stone kerbs", type: "fixed", rate: 30, cost: 17, unit: "m" },
  ]},
  { id: "landscaping", name: "Landscaping", items: [
    { id: "turf", label: "Turf supplied & laid", type: "fixed", rate: 100, cost: 55, unit: "m²", flagged: "Check whether this is meant per m² or per 100m² before using commercially." },
    { id: "artgrass", label: "Artificial grass", type: "tier", tiers: { Bronze: 100, Signature: 150, Prestige: 200 }, costs: { Bronze: 55, Signature: 85, Prestige: 115 }, unit: "m²", estimated: true, supplier: "tuda" },
    { id: "fencing2", label: "Composite fencing", type: "range", min: 90, max: 200, cost: 55, unit: "m" },
    { id: "sleepers", label: "Sleepers", type: "fixed", rate: 45, cost: 25, unit: "m" },
    { id: "retainingwalls", label: "Retaining walls", type: "range", min: 120, max: 400, cost: 75, unit: "m²" },
  ]},
  { id: "outdoorliving", name: "Outdoor Living", items: [
    { id: "pergola", label: "Pergola (aluminium, supplied & installed)", type: "range", min: 150, max: 500, cost: 180, unit: "m²", estimated: true },
    { id: "gardenroom", label: "Garden Room / Studio", type: "fixed", rate: 18000, cost: 12000, unit: "item", estimated: true, flagged: "Highly bespoke — edit to match the actual spec quoted." },
    { id: "outdoorkitchen", label: "Outdoor Kitchen", type: "fixed", rate: 8000, cost: 5000, unit: "item", estimated: true, flagged: "Highly bespoke — edit to match the actual spec quoted." },
    { id: "outdoorbar", label: "Outdoor Bar", type: "fixed", rate: 3000, cost: 1800, unit: "item", estimated: true },
    { id: "firepit", label: "Built-in Fire Pit", type: "fixed", rate: 1200, cost: 700, unit: "item", estimated: true },
    { id: "seatingarea", label: "Built-in Seating", type: "fixed", rate: 250, cost: 140, unit: "m", estimated: true },
    { id: "compositedeck", label: "Composite Decking", type: "fixed", rate: 165, cost: 100, unit: "m²", estimated: true },
    { id: "timberdeck", label: "Timber Decking", type: "fixed", rate: 120, cost: 70, unit: "m²", estimated: true },
  ]},
  { id: "gates2", name: "Electric Gates & Automation", items: [
    { id: "swinggates", label: "Swing Gates (supply & install)", type: "fixed", rate: 4500, cost: 2800, unit: "item", estimated: true, flagged: "Price varies a lot by size/material — edit to match the spec quoted." },
    { id: "slidinggates", label: "Sliding Gates (supply & install)", type: "fixed", rate: 7500, cost: 4800, unit: "item", estimated: true, flagged: "Price varies a lot by size/material — edit to match the spec quoted." },
    { id: "bifoldgates", label: "Bi-fold Gates (supply & install)", type: "fixed", rate: 10000, cost: 6500, unit: "item", estimated: true, flagged: "Price varies a lot by size/material — edit to match the spec quoted." },
    { id: "intercom", label: "Video Intercom System", type: "fixed", rate: 800, cost: 450, unit: "item", estimated: true },
    { id: "gsmaccess", label: "GSM Access Control", type: "fixed", rate: 450, cost: 250, unit: "item", estimated: true },
    { id: "keypad", label: "Keypad Access", type: "fixed", rate: 350, cost: 180, unit: "item", estimated: true },
    { id: "bollards", label: "Automatic Bollards", type: "fixed", rate: 2500, cost: 1600, unit: "each", estimated: true },
    { id: "gateservice", label: "Servicing & Maintenance", type: "fixed", rate: 150, cost: 80, unit: "visit", estimated: true },
  ]},
];
const POA_CATEGORIES = [];
const PRICING_SUPPLIERS = [
  { id: "nustone", name: "Nustone", products: "Porcelain, natural stone, paving" },
  { id: "stoneporcelain", name: "Stone & Porcelain Ltd", products: "Premium porcelain & paving" },
  { id: "jewson", name: "Jewson", products: "Groundworks materials, drainage, cement, aggregates" },
  { id: "marshalls", name: "Marshalls", products: "Premium paving, kerbs, drainage" },
  { id: "durabound", name: "Durabound Resin Supplies", products: "Resin-bound systems and aggregates" },
  { id: "tuda", name: "Tuda Grass", products: "Artificial grass" },
  { id: "tobermore", name: "Tobermore", products: "Block paving, kerbs, paving products" },
  { id: "thomasarmstrong", name: "Thomas Armstrong", products: "Block paving, flags, kerbs" },
];
function pricingSupplierName(id) { const s = PRICING_SUPPLIERS.find(x => x.id === id); return s ? s.name : null; }
function defaultPricingItemState(item) {
  if (item.type === "tier") return { included: false, qty: 0, tier: "Bronze", rate: item.tiers.Bronze, cost: item.costs ? item.costs.Bronze : 0, productName: "" };
  if (item.type === "range") return { included: false, qty: 0, rate: item.min, cost: item.cost || 0, productName: "" };
  return { included: false, qty: 0, rate: item.rate, cost: item.cost || 0, productName: "" };
}
const FLAT_PRICING_ITEMS = PRICING_CATEGORIES.flatMap(cat => cat.items.map(it => ({ ...it, categoryId: cat.id, categoryName: cat.name })));
const findPricingItem = (id) => FLAT_PRICING_ITEMS.find(it => it.id === id);
function defaultAllPricingState() {
  const s = {};
  PRICING_CATEGORIES.forEach(cat => cat.items.forEach(it => { s[it.id] = defaultPricingItemState(it); }));
  return s;
}
function defaultAllPoaState() {
  const s = {};
  POA_CATEGORIES.forEach(cat => { s[cat.id] = {}; cat.items.forEach(label => { s[cat.id][label] = false; }); });
  return s;
}

// Shared rendering for the detailed pricing categories — used by both the
// standalone Job Pricing Tool (drafts) and a project's Estimate screen.
function PricingCategoriesUI({ itemState, updateItem, poaState, togglePoa, collapsed, toggleCollapse }) {
  const catSubtotal = (cat) => cat.items.reduce((sum, it) => {
    const st = itemState[it.id];
    return sum + (st.included ? (Number(st.qty) || 0) * (Number(st.rate) || 0) : 0);
  }, 0);
  return (
    <>
      {PRICING_CATEGORIES.map(cat => {
        const isCollapsed = collapsed[cat.id];
        return (
          <div key={cat.id} style={{ background: "#fff", border: "1px solid #eae6db", borderRadius: 10, marginBottom: 14, overflow: "hidden" }}>
            <div className="cat-head" onClick={() => toggleCollapse(cat.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#f6f4ee", cursor: "pointer" }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{cat.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 700, color: "#1f5b3f" }}>{gbp(catSubtotal(cat))}</span>
                {isCollapsed ? <ChevronRight size={15} color="#9a978c" /> : <ChevronDown size={15} color="#9a978c" />}
              </div>
            </div>
            {!isCollapsed && (
              <div style={{ padding: "4px 16px 12px" }}>
                {cat.items.map(item => {
                  const st = itemState[item.id];
                  const qtyNum = Number(st.qty) || 0;
                  const rateNum = Number(st.rate) || 0;
                  const costNum = Number(st.cost) || 0;
                  const lineProfit = qtyNum * (rateNum - costNum);
                  return (
                    <div key={item.id} style={{ padding: "10px 0", borderBottom: "1px solid #f3f1e9", opacity: st.included ? 1 : 0.55 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <Checkbox checked={st.included} onClick={() => updateItem(item.id, { included: !st.included })} />
                        <div style={{ flex: "1 1 200px", minWidth: 160 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{item.label}</div>
                          {item.flagged && <div style={{ fontSize: 11, color: "#a06a12", marginTop: 2 }}>⚠ {item.flagged}</div>}
                          {item.estimated && <div style={{ fontSize: 11, color: "#a06a12", marginTop: 2 }}>Tier prices estimated — edit rate if needed</div>}
                          {item.supplier && <div style={{ fontSize: 11, color: "#8a887f", marginTop: 2 }}>Supplier: {pricingSupplierName(item.supplier)}</div>}
                          {item.logistic && <div style={{ fontSize: 11, color: "#8a887f", marginTop: 2 }}>{item.logistic}</div>}
                        </div>
                        {item.type === "tier" && (
                          <div style={{ display: "flex", gap: 4 }}>
                            {["Bronze", "Signature", "Prestige"].map(tier => (
                              <button key={tier} className="tier-btn" onClick={() => updateItem(item.id, { tier, rate: item.tiers[tier], cost: item.costs ? item.costs[tier] : st.cost })} style={{ fontSize: 12, padding: "6px 9px", background: st.tier === tier ? FOREST : PARCHMENT, color: st.tier === tier ? "#fff" : INK, border: `1px solid ${st.tier === tier ? FOREST : "#ddd8ca"}`, borderRadius: 6 }}>
                                {tier} £{item.tiers[tier]}
                              </button>
                            ))}
                          </div>
                        )}
                        {item.type === "range" && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input type="range" min={item.min} max={item.max} value={Number(st.rate) || item.min} onChange={e => updateItem(item.id, { rate: Number(e.target.value) })} style={{ width: 100, accentColor: GOLD }} />
                            <input type="number" inputMode="decimal" min={item.min} max={item.max} value={st.rate} onChange={e => updateItem(item.id, { rate: e.target.value })} style={{ ...inputStyle, width: 65 }} />
                          </div>
                        )}
                        {item.type === "fixed" && (
                          <input type="number" inputMode="decimal" value={st.rate} onChange={e => updateItem(item.id, { rate: e.target.value })} style={{ ...inputStyle, width: 65 }} />
                        )}
                        <span style={{ fontSize: 11.5, color: "#9a978c", width: 34 }}>/{item.unit}</span>
                        <input type="number" inputMode="decimal" min="0" value={st.qty} onChange={e => updateItem(item.id, { qty: e.target.value, included: Number(e.target.value) > 0 ? true : st.included })} placeholder={item.unit} style={{ ...inputStyle, width: 68 }} />
                        <div style={{ width: 85, textAlign: "right", fontWeight: 700, fontSize: 13.5 }}>{gbp(st.included ? qtyNum * rateNum : 0)}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, marginLeft: 29, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, color: "#9a978c" }}>Your cost</span>
                        <span style={{ fontSize: 11, color: "#9a978c" }}>£</span>
                        <input type="number" inputMode="decimal" min="0" value={st.cost} onChange={e => updateItem(item.id, { cost: e.target.value })} style={{ ...inputStyle, width: 65, padding: "5px 8px", fontSize: 12 }} placeholder="0.00" />
                        <span style={{ fontSize: 11, color: "#9a978c" }}>/{item.unit} from supplier</span>
                        {st.included && qtyNum > 0 && (
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: lineProfit >= 0 ? "#1f5b3f" : "#c0392b", marginLeft: "auto" }}>
                            Profit: {gbp(lineProfit)}
                          </span>
                        )}
                      </div>
                      {item.supplier && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, marginLeft: 29, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, color: "#9a978c" }}>Product</span>
                          <input value={st.productName || ""} onChange={e => updateItem(item.id, { productName: e.target.value })} placeholder={`e.g. ${pricingSupplierName(item.supplier)} — exact product name`} style={{ ...inputStyle, flex: "1 1 200px", padding: "5px 8px", fontSize: 12 }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {POA_CATEGORIES.map(cat => {
        const isCollapsed = collapsed[cat.id];
        return (
          <div key={cat.id} style={{ background: "#fff", border: "1px solid #eae6db", borderRadius: 10, marginBottom: 14, overflow: "hidden" }}>
            <div className="cat-head" onClick={() => toggleCollapse(cat.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#f6f4ee", cursor: "pointer" }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{cat.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>POA</span>
                {isCollapsed ? <ChevronRight size={15} color="#9a978c" /> : <ChevronDown size={15} color="#9a978c" />}
              </div>
            </div>
            {!isCollapsed && (
              <div style={{ padding: "4px 16px 12px" }}>
                {cat.items.map(label => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f3f1e9" }}>
                    <Checkbox checked={!!poaState[cat.id][label]} onClick={() => togglePoa(cat.id, label)} />
                    <span style={{ fontSize: 13, flex: 1 }}>{label}</span>
                    <span style={{ fontSize: 10.5, background: GOLD, color: "#fff", padding: "2px 8px", borderRadius: 10 }}>Price on application</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}


function emptyDraft() {
  return {
    id: uid(), ref: "", name: "", client: "", email: "", phone: "",
    address: "", town: "", county: "", postcode: "", projectType: "Residential",
    services: {}, goals: "",
    survey: {
      info: { access: "Driveway (Good Access)", surface: "Tarmac", notes: "" },
      measurements: [
        { id: uid(), name: "Patio / Paving Area (m²)", value: "" },
        { id: uid(), name: "Driveway Area (m²)", value: "" },
        { id: uid(), name: "Fencing Length (m)", value: "" },
        { id: uid(), name: "Rear Garden (Turf) Area (m²)", value: "" },
      ],
      photos: {}, services: { drainage: "Good", electricity: "Available", water: "Available", issues: "" },
      vision: { style: [], notes: "" },
    },
    pricing: { itemState: defaultAllPricingState(), poaState: defaultAllPoaState(), collapsed: {}, customItems: [] },
    designVisuals: { plans2d: [], renders3d: [] },
    proposal: {
      welcomeMessage: "Thank you for the opportunity to propose our design and build solution for your outdoor space. We are excited to bring your vision to life with exceptional craftsmanship and attention to detail.",
      highlights: ["Bespoke design tailored to your lifestyle", "Premium materials and expert craftsmanship", "Functional, beautiful outdoor living spaces", "Built to last with our 5-year guarantee"],
      validityDays: 30, warrantyYears: 5, durationWeeks: 2,
    },
    signature: { clientName: "", date: "", agreed: false, signed: false, typedSignature: "" },
    status: "Draft",
    timeline: { prep: 0, ground: 0, landscaping: 0, structures: 0, finishing: 0, handover: 0 },
    updates: [],
    variations: [],
    review: null,
    referrals: [],
    referralCode: null,
    referredByProjectId: null,
    referralEntryId: null,
    messages: [],
    payments: {},
    portalWelcomed: false,
    supportTickets: [],
    assignedTeam: [],
    createdAt: new Date().toISOString(),
  };
}
const defaultSettings = { vatPct: 20, referralRewardAmount: 250, targetMarginPct: 30 };

// ============================================================
// SMALL SHARED COMPONENTS
// ============================================================
function Field({ label, children }) { return <div style={{ marginBottom: 14 }}><div style={{ fontSize: 12, color: "#8a887f", marginBottom: 6, fontWeight: 500 }}>{label}</div>{children}</div>; }
function Checkbox({ checked, onClick }) {
  return <div onClick={onClick} style={{ width: 17, height: 17, borderRadius: 4, border: `1.5px solid ${checked ? "#1f5b3f" : "#c8c4b6"}`, background: checked ? "#1f5b3f" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }}>{checked && <Check size={12} color="#fff" />}</div>;
}
function SectionTitle({ children }) { return <div style={{ fontSize: 11, letterSpacing: 1, color: GOLD, fontWeight: 700, marginBottom: 12, marginTop: 4 }}>{String(children).toUpperCase()}</div>; }

function EditProjectDetailsModal({ project, onSave, onClose }) {
  const [form, setForm] = useState({
    name: project.name || "", client: project.client || "", email: project.email || "", phone: project.phone || "",
    address: project.address || "", town: project.town || "", postcode: project.postcode || "", goals: project.goals || "",
  });
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,20,15,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, maxWidth: 440, width: "100%", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Playfair Display', serif" }}>Edit Project Details</div>
          <X size={18} style={{ cursor: "pointer", color: "#8a887f" }} onClick={onClose} />
        </div>
        <Field label="Project Name"><input style={{ ...inputStyle, width: "100%" }} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Client Name"><input style={{ ...inputStyle, width: "100%" }} value={form.client} onChange={e => setForm({ ...form, client: e.target.value })} /></Field>
        <Field label="Email"><input style={{ ...inputStyle, width: "100%" }} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="client@email.com" /></Field>
        <Field label="Phone"><input style={{ ...inputStyle, width: "100%" }} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="07500 123456" /></Field>
        <Field label="Address"><input style={{ ...inputStyle, width: "100%" }} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></Field>
        <div style={{ display: "flex", gap: 10 }}>
          <Field label="Town / City"><input style={{ ...inputStyle, width: "100%" }} value={form.town} onChange={e => setForm({ ...form, town: e.target.value })} /></Field>
          <Field label="Postcode"><input style={{ ...inputStyle, width: "100%" }} value={form.postcode} onChange={e => setForm({ ...form, postcode: e.target.value })} /></Field>
        </div>
        <Field label="Goals / Notes"><textarea style={{ ...inputStyle, width: "100%", minHeight: 60 }} value={form.goals} onChange={e => setForm({ ...form, goals: e.target.value })} /></Field>
        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <button onClick={() => onSave(form)} style={{ flex: 1, padding: 12, background: FOREST, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13 }}>Save Changes</button>
          <button onClick={onClose} style={{ padding: "12px 18px", background: "#fff", color: "#8a887f", border: "1px solid #ddd8ca", borderRadius: 8, fontSize: 13 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({ confirm, onCancel }) {
  if (!confirm) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,20,15,0.6)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, maxWidth: 380, width: "100%" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{confirm.title || "Are you sure?"}</div>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 20, lineHeight: 1.5 }}>{confirm.message || "This can't be undone."}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => { confirm.onConfirm(); onCancel(); }} style={{ flex: 1, padding: 11, background: "#c0392b", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13 }}>Delete</button>
          <button onClick={onCancel} style={{ flex: 1, padding: 11, background: "#fff", color: "#8a887f", border: "1px solid #ddd8ca", borderRadius: 8, fontSize: 13 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function MarkLostModal({ project, onConfirm, onClose }) {
  const [reason, setReason] = useState(LOST_REASONS[0]);
  const [notes, setNotes] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,20,15,0.6)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, maxWidth: 400, width: "100%" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, fontFamily: "'Playfair Display', serif" }}>Mark as Lost</div>
        <div style={{ fontSize: 13, color: "#8a887f", marginBottom: 18 }}>{project.name} · {project.client}</div>
        <Field label="Reason">
          <select value={reason} onChange={e => setReason(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
            {LOST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Notes (optional)"><textarea value={notes} onChange={e => setNotes(e.target.value)} style={{ ...inputStyle, width: "100%", minHeight: 60 }} placeholder="Anything worth remembering for next time…" /></Field>
        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <button onClick={() => onConfirm(reason, notes)} style={{ flex: 1, padding: 12, background: "#c0392b", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13 }}>Mark as Lost</button>
          <button onClick={onClose} style={{ padding: "12px 18px", background: "#fff", color: "#8a887f", border: "1px solid #ddd8ca", borderRadius: 8, fontSize: 13 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function PortalWelcomeModal({ project, rewardAmount, onDismiss }) {
  const items = [
    { icon: Clock, text: "Track real-time progress on your project" },
    { icon: ImageIcon, text: "See site photos as work happens" },
    { icon: MessageSquare, text: "Message your project team directly" },
    { icon: FileSignature, text: "Review and approve any change orders" },
    { icon: CreditCard, text: "See your payment schedule and pay securely" },
    { icon: Share2, text: `Refer a friend and earn ${gbp(rewardAmount)} when they sign up` },
  ];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,20,15,0.7)", zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 0, maxWidth: 440, width: "100%", overflow: "hidden" }}>
        <div style={{ background: FOREST, padding: "32px 28px", textAlign: "center" }}>
          <div style={{ width: 54, height: 54, borderRadius: "50%", border: `1.5px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 22, color: GOLD }}>N</div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: "#fff" }}>Welcome, {project.client?.split(" ")[0] || "there"}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 6 }}>This is your personal portal for {project.name}</div>
        </div>
        <div style={{ padding: "24px 28px" }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#f6f4ee", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <it.icon size={15} color={GOLD} />
              </div>
              <div style={{ fontSize: 13.5, color: "#333" }}>{it.text}</div>
            </div>
          ))}
          <button onClick={onDismiss} style={{ width: "100%", padding: 13, background: FOREST, color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, fontSize: 14, marginTop: 10 }}>View My Proposal</button>
          <div style={{ fontSize: 11, color: "#9a978c", textAlign: "center", marginTop: 10 }}>You can always find it again under Documents</div>
        </div>
      </div>
    </div>
  );
}

function Toast({ msg }) { return <div style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", background: FOREST_DEEP, color: "#fff", padding: "11px 20px", borderRadius: 30, fontSize: 13, boxShadow: "0 6px 20px rgba(0,0,0,0.25)", zIndex: 60 }}>{msg}</div>; }
function RowS({ label, value, bold, tint }) { return <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 9 }}><span style={{ color: "#6b6a63" }}>{label}</span><span style={{ fontWeight: bold ? 700 : 600, color: tint || INK }}>{value}</span></div>; }
function StatusPill({ status }) {
  const map = {
    "Completed": { bg: "#0f2a20", fg: "#fff" },
    "In Construction": { bg: "#fbf1de", fg: "#a06a12" },
    "Signed": { bg: "#e7f0ea", fg: "#1f5b3f" },
    "Proposal Sent": { bg: "#fbf1de", fg: "#a06a12" },
    "Survey Booked": { bg: "#e9eef5", fg: "#3a5a8a" },
    "Draft": { bg: "#f1efe7", fg: "#8a887f" },
    "Lost": { bg: "#fdf1ef", fg: "#c0392b" },
  };
  const c = map[status] || { bg: "#eee", fg: "#555" };
  return <span style={{ background: c.bg, color: c.fg, fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 20 }}>{status}</span>;
}
function StatCard({ label, value, tint }) {
  return (
    <div style={{ background: FOREST, borderRadius: 10, padding: "16px 18px", flex: 1, minWidth: 130 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: tint || GOLD, marginBottom: 10 }} />
      <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display', serif" }}>{value}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>{label}</div>
    </div>
  );
}
const TEAM_NAV = [
  { key: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { key: "leads", label: "Leads", icon: Users },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "team", label: "Team", icon: HardHat },
  { key: "reports", label: "Reports", icon: TrendingUp },
  { key: "finance", label: "Finance Playbook", icon: Wallet },
  { key: "pricingTool", label: "Job Pricing Tool", icon: Calculator },
  { key: "settings", label: "Settings", icon: SettingsIcon },
];

function Shell({ title, subtitle, children, right, screen, setScreen, onNewProject, onNavClick }) {
  const { profile, signOut } = useAuth();
  return (
    <div className="shell-outer" style={{ display: "flex", minHeight: "100vh", background: PARCHMENT, fontFamily: "'Inter', system-ui, sans-serif", color: INK }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; } button { font-family: inherit; cursor: pointer; }
        input:focus, textarea:focus, select:focus { outline: 2px solid ${GOLD}44; border-color: ${GOLD}; }
        .row:hover { background: #fafaf5; } .top-btn:hover { background: rgba(0,0,0,0.04); }
        .nav-item:hover { background: rgba(255,255,255,0.08); } .proj-row:hover { background: #fbfaf7; }
        .responsive-flex { display: flex; gap: 20px; }
        @media (max-width: 780px) {
          .responsive-flex { flex-direction: column; }
          .responsive-flex > * { width: 100% !important; min-width: 0 !important; flex: none !important; }
          .shell-content { padding: 16px !important; }
          .shell-outer { flex-direction: column; }
          .shell-sidebar { width: 100% !important; flex-direction: row !important; overflow-x: auto; padding: 10px 12px !important; align-items: center; gap: 4px; }
          .shell-brand-block { display: none !important; }
          .shell-newproj-btn { display: none !important; }
          .shell-sidebar .nav-item { flex-direction: column; white-space: nowrap; padding: 7px 12px !important; font-size: 10px !important; gap: 3px !important; margin-bottom: 0 !important; flex-shrink: 0; }
        }
      `}</style>
      <div className="shell-sidebar" style={{ width: 210, background: FOREST_DEEP, color: "#fff", padding: "22px 16px", flexShrink: 0 }}>
        <div className="shell-brand-block" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", border: `1.5px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, fontFamily: "'Playfair Display', serif", fontWeight: 700, flexShrink: 0 }}>N</div>
          <div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 14, letterSpacing: 0.5 }}>NORTHSTONE</div>
            <div style={{ fontSize: 9, letterSpacing: 1.5, color: GOLD }}>DESIGN & BUILD</div>
          </div>
        </div>
        {(onNewProject || setScreen) && (
          <button className="shell-newproj-btn" onClick={() => onNewProject ? onNewProject() : setScreen("newProject")} style={{ width: "100%", padding: "10px 12px", background: GOLD, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12.5, marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <PlusCircle size={14} /> New Project
          </button>
        )}
        {TEAM_NAV.map(n => (
          <div key={n.key} className="nav-item" onClick={() => { setScreen && setScreen(n.key); onNavClick && onNavClick(); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 7, fontSize: 13, marginBottom: 4, cursor: "pointer", background: screen === n.key ? "rgba(200,149,47,0.18)" : "transparent", color: screen === n.key ? GOLD : "rgba(255,255,255,0.82)", fontWeight: screen === n.key ? 700 : 400 }}>
            <n.icon size={15} /> {n.label}
          </div>
        ))}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {profile?.full_name || profile?.email}
          </div>
          <div className="nav-item" onClick={signOut} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 7, fontSize: 13, cursor: "pointer", color: "rgba(255,255,255,0.82)" }}>
            <LogOut size={15} /> Sign out
          </div>
        </div>
      </div>
      <div className="shell-content" style={{ flex: 1, minWidth: 0, padding: "26px 34px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 13, color: "#6b6a63" }}>{subtitle}</div>}
          </div>
          {right}
        </div>
        {children}
      </div>
    </div>
  );
}

// ============================================================
// REAL DOCUMENT GENERATION — Warranty Certificate, Proposal,
// Terms & Conditions, Material Schedule, Payment Schedule.
// Generated client-side as styled, printable HTML files (open in
// browser, then "Print > Save as PDF" for a PDF copy) — no server needed.
// ============================================================
function flatIncludedItems(proj) {
  if (!proj.pricing) return [];
  const catalogLines = FLAT_PRICING_ITEMS.filter(it => proj.pricing.itemState[it.id]?.included).map(it => {
    const st = proj.pricing.itemState[it.id];
    const qty = Number(st.qty) || 0;
    const rate = Number(st.rate) || 0;
    const cost = Number(st.cost) || 0;
    const label = st.productName ? `${it.label} — ${st.productName}` : it.label;
    return { category: it.categoryName, label, unit: it.unit, supplier: it.supplier ? pricingSupplierName(it.supplier) : null, qty, rate, cost, total: qty * rate, costTotal: qty * cost, profit: qty * (rate - cost) };
  });
  const customLines = (proj.pricing.customItems || []).filter(c => c.label && Number(c.qty) > 0).map(c => {
    const qty = Number(c.qty) || 0;
    const rate = Number(c.rate) || 0;
    const cost = Number(c.cost) || 0;
    return { category: "Other / Custom Materials", label: c.label, unit: c.unit || "item", supplier: null, qty, rate, cost, total: qty * rate, costTotal: qty * cost, profit: qty * (rate - cost) };
  });
  return [...catalogLines, ...customLines];
}
function poaSelectedFor(proj) {
  const list = [];
  if (!proj.pricing) return list;
  POA_CATEGORIES.forEach(cat => Object.entries(proj.pricing.poaState?.[cat.id] || {}).forEach(([label, v]) => { if (v) list.push(label); }));
  return list;
}
const DOC_STYLE = `
    .doc-sheet { max-width: 720px; margin: 0 auto; background: #fff; font-family: 'Inter', sans-serif; color: #20241f; }
    .doc-sheet .head { background: #0f2a20; color: #fff; padding: 34px 40px; }
    .doc-sheet .brand { font-family: 'Playfair Display', serif; font-weight: 700; font-size: 20px; letter-spacing: 1px; }
    .doc-sheet .sub { color: #c8952f; font-size: 11px; letter-spacing: 2px; margin-top: 4px; text-transform: uppercase; }
    .doc-sheet .doctitle { font-family: 'Playfair Display', serif; font-size: 30px; font-weight: 700; margin-top: 22px; }
    .doc-sheet .body { padding: 34px 40px; }
    .doc-sheet h2 { font-family: 'Playfair Display', serif; font-size: 16px; border-bottom: 1px solid #eae6db; padding-bottom: 8px; margin-top: 30px; }
    .doc-sheet table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px; }
    .doc-sheet th { text-align: left; font-size: 10.5px; letter-spacing: 0.5px; color: #8a887f; text-transform: uppercase; padding: 6px 4px; border-bottom: 1px solid #eae6db; }
    .doc-sheet td { padding: 8px 4px; border-bottom: 1px solid #f3f1e9; }
    .doc-sheet .right { text-align: right; }
    .doc-sheet .total-row td { font-weight: 700; border-top: 2px solid #0f2a20; border-bottom: none; }
    .doc-sheet .footer { padding: 24px 40px; background: #f6f4ee; font-size: 11px; color: #8a887f; text-align: center; }
    .doc-sheet .cert-border { border: 3px solid #c8952f; border-radius: 12px; padding: 40px; text-align: center; margin: 10px 0; }
    .doc-sheet .cert-seal { width: 70px; height: 70px; border-radius: 50%; border: 2px solid #c8952f; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-family: 'Playfair Display', serif; font-size: 28px; font-weight: 700; color: #c8952f; }

    /* ---- multi-page proposal ---- */
    .doc-sheet.wide { max-width: 860px; }
    .prop-page { padding: 56px 50px; page-break-after: always; box-sizing: border-box; position: relative; }
    .prop-page:last-child { page-break-after: auto; }
    .prop-page.dark { background: #0f2a20; color: #fff; }
    .prop-page.cream { background: #f6f3ec; color: #20241f; }
    .prop-page.white { background: #fff; color: #20241f; }
    .prop-eyebrow { color: #c8952f; font-size: 11px; letter-spacing: 2.5px; text-transform: uppercase; margin-bottom: 10px; font-weight: 600; }
    .prop-title { font-family: 'Playfair Display', serif; font-size: 32px; font-weight: 700; margin: 0 0 6px; letter-spacing: 0.3px; }
    .prop-script { font-family: 'Playfair Display', serif; font-style: italic; color: #c8952f; }
    .prop-divider { width: 60px; height: 2px; background: #c8952f; margin: 18px 0; }
    .prop-lede { font-size: 13.5px; line-height: 1.7; max-width: 560px; }
    .prop-page.dark .prop-lede { color: rgba(255,255,255,0.8); }
    .prop-page.cream .prop-lede, .prop-page.white .prop-lede { color: #444; }
    .prop-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 26px; margin-top: 28px; }
    .prop-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-top: 22px; }
    .prop-icon-circle { width: 46px; height: 46px; border-radius: 50%; border: 1.5px solid #c8952f; display: flex; align-items: center; justify-content: center; color: #c8952f; font-size: 17px; font-weight: 700; margin-bottom: 12px; font-family: 'Playfair Display', serif; }
    .prop-item-title { font-weight: 700; font-size: 13px; margin-bottom: 5px; letter-spacing: 0.2px; }
    .prop-item-text { font-size: 11.5px; line-height: 1.55; }
    .prop-page.dark .prop-item-text { color: rgba(255,255,255,0.65); }
    .prop-page.cream .prop-item-text, .prop-page.white .prop-item-text { color: #8a887f; }
    .prop-quote { border-left: 3px solid #c8952f; padding-left: 16px; font-style: italic; font-size: 13.5px; margin: 24px 0; }
    .prop-footer-strip { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding: 18px 50px; background: #0f2a20; color: rgba(255,255,255,0.7); font-size: 10.5px; letter-spacing: 0.4px; }
    .prop-table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12.5px; }
    .prop-table th { background: #0f2a20; color: #fff; text-align: left; padding: 9px 12px; font-size: 10.5px; letter-spacing: 0.5px; text-transform: uppercase; }
    .prop-table th.right, .prop-table td.right { text-align: right; }
    .prop-table td { padding: 9px 12px; border-bottom: 1px solid #e5e0d3; }
    .prop-table tr.total td { font-weight: 700; background: #0f2a20; color: #fff; font-size: 14px; }
    .prop-stage-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 20px; text-align: center; }
    .prop-stage { border: 1px solid #e5e0d3; border-radius: 8px; padding: 14px 8px; }
    .prop-stage .pct { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 700; color: #c8952f; }
    .prop-stage .lbl { font-size: 10.5px; color: #8a887f; margin-top: 4px; line-height: 1.4; }
    .prop-steps { margin-top: 24px; }
    .prop-step { display: flex; gap: 16px; padding: 16px 0; border-bottom: 1px solid rgba(255,255,255,0.12); }
    .prop-page.cream .prop-step, .prop-page.white .prop-step { border-bottom: 1px solid #eae6db; }
    .prop-step .num { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 700; color: #c8952f; width: 34px; flex-shrink: 0; }
`;

function docHeader(eyebrow, title) {
  return `<div class="head">
    <div class="brand">NORTHSTONE DESIGN &amp; BUILD</div>
    <div class="sub">${eyebrow}</div>
    <div class="doctitle">${title}</div>
  </div>`;
}
function docFooter() {
  return `<div class="footer">Northstone Design &amp; Build · 07503 677201 · info@northstonedesignandbuild.com · www.northstonedesignandbuild.com</div>`;
}

const WHY_CHOOSE_ITEMS = [
  { icon: "17+", title: "17+ Years Experience", text: "A proven track record delivering high quality outdoor projects." },
  { icon: "✎", title: "Design & Build Specialists", text: "From initial concept to completion — one team, one seamless process." },
  { icon: "⌂", title: "Luxury Outdoor Living", text: "Beautiful, functional spaces designed around the way you live." },
  { icon: "✓", title: "Fully Insured", text: "Complete peace of mind with comprehensive insurance cover." },
  { icon: "◆", title: "Premium Materials", text: "We use only the finest materials for long lasting quality and finish." },
  { icon: "☺", title: "Professional Service", text: "Clear communication, reliable timelines and attention to detail." },
];
const WARRANTY_CATEGORIES = [
  { title: "Workmanship", years: null }, // uses proj.proposal.warrantyYears
  { title: "Structural", years: 10 },
  { title: "Paving", years: 10 },
  { title: "Electrical", years: 3 },
  { title: "Planting", years: 1 },
];
const AFTERCARE_ITEMS = [
  { title: "Project Handover", text: "Full walkthrough and guidance on care & maintenance." },
  { title: "Care Guide Provided", text: "Bespoke care & maintenance guide for your new space." },
  { title: "6 Month Review", text: "Optional review to ensure everything is perfect." },
  { title: "Ongoing Support", text: "We're always on hand for advice and assistance." },
];
const NEXT_STEPS = [
  { title: "Review Your Proposal", text: "Take time to review every detail. If you have any questions, we're here to help." },
  { title: "Accept Your Proposal", text: "Confirm you're happy to proceed and we'll get you booked in." },
  { title: "Receive Your Welcome Pack", text: "You'll receive everything you need to know about your project." },
  { title: "We Schedule Your Project", text: "We'll confirm your start date and guide you through what's next." },
];

function generateProposalDoc(proj, totals, portfolioPhotos) {
  const items = flatIncludedItems(proj);
  const poa = poaSelectedFor(proj);
  const byCat = {};
  items.forEach(it => { if (!byCat[it.category]) byCat[it.category] = []; byCat[it.category].push(it); });
  const p = proj.proposal || {};
  const warrantyYears = p.warrantyYears || 5;
  const stagePct = [10, 30, 30, 30];
  const vatPctDisplay = totals.sell > 0 ? Math.round((totals.vat / totals.sell) * 100) : 20;

  const coverPage = `
    <div class="prop-page dark" style="text-align:center;">
      <div style="width:60px;height:60px;border:2px solid #c8952f;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;font-family:'Playfair Display',serif;font-size:26px;font-weight:700;color:#c8952f;">N</div>
      <div class="brand" style="font-size:26px;">NORTHSTONE</div>
      <div class="prop-eyebrow" style="margin-top:2px;">Outdoor Living · Design · Build</div>
      <div style="height:80px;"></div>
      <div class="prop-title" style="font-size:40px;">${proj.name || "Your Project"}</div>
      <div class="prop-eyebrow" style="margin-top:10px;">Design &amp; Build Proposal</div>
      <div class="prop-divider" style="margin:22px auto;"></div>
      <div style="height:120px;"></div>
    </div>`;

  const welcomePage = `
    <div class="prop-page white">
      <div class="prop-eyebrow">Welcome</div>
      <div class="prop-title">Thank you for considering Northstone.</div>
      <div class="prop-divider"></div>
      <div class="prop-lede">
        <p>We are excited about the opportunity to work with you and create an exceptional outdoor space that enhances your lifestyle and adds lasting value to your home.</p>
        <p>This proposal has been prepared for <b>${proj.client || "you"}</b> following our initial consultation and site survey. Within these pages you'll find our approach, scope of works, timeline and investment for your project, <b>${proj.name || "your project"}</b>.</p>
        <p>${p.welcomeMessage || "We pride ourselves on delivering a seamless experience from concept to completion, with attention to detail, outstanding craftsmanship and clear communication at every stage."}</p>
        <p>We look forward to bringing your vision to life.</p>
      </div>
      <div style="margin-top:30px;">
        <div class="prop-script" style="font-size:22px;">Ryan Jennings</div>
        <div class="prop-eyebrow" style="margin-top:2px;">Founder &amp; Director</div>
      </div>
    </div>`;

  const ourStoryPage = `
    <div class="prop-page dark">
      <div class="prop-eyebrow">Our Story</div>
      <div class="prop-title" style="font-size:27px; line-height:1.25;">Built on Experience.<br/>Driven by Passion.</div>
      <div class="prop-divider"></div>
      <p class="prop-lede">Northstone was founded on the belief that outdoor spaces should be more than just an afterthought — they should be an extension of your home and lifestyle.</p>
      <p class="prop-lede">With over 17 years of experience in groundworks and landscaping, we bring together expert design, quality materials and exceptional craftsmanship to deliver outdoor environments that stand the test of time.</p>
      <p class="prop-lede">From the initial idea to the final handover, our mission is simple — to exceed your expectations and create a space you'll love for years to come.</p>
    </div>`;

  const whyChoosePage = `
    <div class="prop-page cream">
      <div class="prop-eyebrow">Why Choose Northstone?</div>
      <div class="prop-title" style="font-size:26px;">A Team You Can Trust</div>
      <div class="prop-divider"></div>
      <div class="prop-grid-3">
        ${WHY_CHOOSE_ITEMS.map(it => `<div><div class="prop-icon-circle">${it.icon}</div><div class="prop-item-title">${it.title}</div><div class="prop-item-text">${it.text}</div></div>`).join("")}
      </div>
    </div>`;

  const scopeItemsHtml = items.length ? Object.entries(byCat).map(([cat, its]) => `
    <div style="margin-bottom:14px;">
      <div class="prop-item-title" style="color:#c8952f;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">${cat}</div>
      ${its.map(it => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.1);font-size:12.5px;"><span>${it.label} (${it.qty} ${it.unit}${it.supplier ? ` · ${it.supplier}` : ""})</span><span style="color:#c8952f;font-weight:600;">${gbp(it.total)}</span></div>`).join("")}
    </div>`).join("") : `<p class="prop-lede">Scope of works to be confirmed.</p>`;

  const scopePage = `
    <div class="prop-page dark">
      <div class="prop-eyebrow">Scope of Works</div>
      <div class="prop-title" style="font-size:26px;">What's Included</div>
      <div class="prop-divider"></div>
      <p class="prop-lede">Our comprehensive service covers every aspect of your outdoor transformation. From initial design to final planting, we manage every detail.</p>
      <div style="margin-top:24px;">${scopeItemsHtml}</div>
      ${poa.length ? `<div class="prop-lede" style="margin-top:16px;"><b style="color:#c8952f;">Quoted separately:</b> ${poa.join(", ")}</div>` : ""}
    </div>`;

  const inspirationPhotos = (portfolioPhotos || []).slice(0, 6);
  const inspirationPage = inspirationPhotos.length ? `
    <div class="prop-page cream">
      <div class="prop-eyebrow">Design Inspiration</div>
      <div class="prop-title" style="font-size:26px;">Craftsmanship From Recent Projects</div>
      <div class="prop-divider"></div>
      <p class="prop-lede">A glimpse of the quality and attention to detail you can expect, drawn from our recent completed work.</p>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:20px;">
        ${inspirationPhotos.map(ph => `
          <div style="border-radius:8px;overflow:hidden;">
            <img src="${ph.url}" style="width:100%;height:130px;object-fit:cover;display:block;" />
            ${ph.caption ? `<div style="font-size:10.5px;color:#8a887f;margin-top:4px;">${ph.caption}</div>` : ""}
          </div>`).join("")}
      </div>
    </div>` : "";

  const investmentPage = `
    <div class="prop-page white">
      <div class="prop-eyebrow">Investment</div>
      <div class="prop-title" style="font-size:26px;">Your Outdoor Transformation</div>
      <div class="prop-divider"></div>
      <p class="prop-lede">We believe in transparency, quality and delivering exceptional value. Below is a breakdown of the investment for your project.</p>
      <table class="prop-table">
        <thead><tr><th>Description</th><th class="right">Investment (ex VAT)</th></tr></thead>
        <tbody>
          ${Object.entries(byCat).map(([cat, its]) => `<tr><td>${cat}</td><td class="right">${gbp(its.reduce((s, i) => s + i.total, 0))}</td></tr>`).join("") || `<tr><td colspan="2">No items specified yet.</td></tr>`}
          <tr><td>VAT (${vatPctDisplay}%)</td><td class="right">${gbp(totals.vat)}</td></tr>
          <tr class="total"><td>TOTAL INVESTMENT</td><td class="right">${gbp(totals.total)}</td></tr>
        </tbody>
      </table>
      <div class="prop-item-text" style="margin-top:8px;">This investment is valid for ${p.validityDays || 30} days from the date of this proposal. Any additional works will be discussed and approved in writing as a Change Order before proceeding.</div>

      <div class="prop-eyebrow" style="margin-top:34px;">Payment Schedule</div>
      <div class="prop-stage-row">
        ${PAYMENT_STAGES.map((label, i) => `<div class="prop-stage"><div class="pct">${stagePct[i]}%</div><div class="lbl">${label}</div></div>`).join("")}
      </div>
    </div>`;

  // Which stages apply is still driven by what's actually in scope; what
  // changed is that each stage now gets a relative *weight* rather than a
  // fixed duration, and those weights get split proportionally across the
  // client-facing estimated duration. Fixed durations stacked up to far
  // more than small jobs actually take — a driveway-only job would still
  // show 6+ weeks of stages regardless of how long the job really was.
  const buildProgrammeStages = (byCatObj, totalWeeks) => {
    const cats = Object.keys(byCatObj);
    const has = (names) => names.some(n => cats.includes(n));
    const stages = [{ label: "Design & Planning", desc: "Finalising design, technical drawings, material selections and project documentation.", weight: 1 }];
    if (has(["Groundworks", "Materials"])) stages.push({ label: "Site Preparation & Groundworks", desc: "Site clearance, excavation and drainage installation to ensure long-term performance.", weight: 1 });
    if (has(["Surfacing", "Kerbs"])) stages.push({ label: "Hard Landscaping", desc: "Installation of paving, kerbs, steps and structural features.", weight: 2.5 });
    if (has(["Outdoor Living", "Electric Gates & Automation"])) stages.push({ label: "Structures & Features", desc: "Erection of pergolas, gates, outdoor kitchens and bespoke features.", weight: 1.5 });
    const hasLighting = Object.values(byCatObj).flat().some(it => /light/i.test(it.label));
    if (hasLighting) stages.push({ label: "Lighting & Electrical", desc: "Installation of all lighting, electrical connections and integrated systems.", weight: 1 });
    if (has(["Landscaping"])) stages.push({ label: "Planting & Softscaping", desc: "Installation of plants, turf, decorative stone and soft landscaping.", weight: 1 });
    stages.push({ label: "Final Finish & Handover", desc: "Final clean, quality inspection and handover of your completed outdoor space.", weight: 0.5 });
    const totalWeight = stages.reduce((s, st) => s + st.weight, 0);
    return stages.map(st => ({ ...st, duration: formatStageDuration((st.weight / totalWeight) * totalWeeks) }));
  };
  const programmeStages = buildProgrammeStages(byCat, projectDurationWeeks(p));
  const programmePage = `
    <div class="prop-page cream">
      <div class="prop-eyebrow">Project Timeline</div>
      <div class="prop-title" style="font-size:26px;">Our Proposed Programme of Works</div>
      <div class="prop-divider"></div>
      <p class="prop-lede">The timeline below outlines each stage of your project from initial preparation to final handover. We'll keep you informed every step of the way.</p>
      <table class="prop-table" style="margin-top:20px;">
        <thead><tr><th>Stage</th><th>Description</th><th class="right">Duration</th></tr></thead>
        <tbody>
          ${programmeStages.map((s, i) => `<tr><td><b>${i + 1}. ${s.label}</b></td><td style="font-size:11.5px;color:#8a887f;">${s.desc}</td><td class="right">${s.duration}</td></tr>`).join("")}
        </tbody>
      </table>
      <div class="prop-item-text" style="margin-top:14px;">Estimated duration is approximate and subject to site conditions and weather. A detailed programme will be confirmed at project commencement.</div>
    </div>`;

  const warrantyPage = `
    <div class="prop-page dark">
      <div class="prop-eyebrow">Aftercare &amp; Warranty</div>
      <div class="prop-title" style="font-size:26px;">Our Promise To You</div>
      <div class="prop-divider"></div>
      <p class="prop-lede">Our commitment doesn't end when the project is complete. We provide comprehensive aftercare and warranty for complete peace of mind.</p>
      <div class="prop-grid-3" style="margin-top:22px;">
        ${WARRANTY_CATEGORIES.map(w => `<div><div class="prop-icon-circle">${w.years || warrantyYears}yr</div><div class="prop-item-title">${w.title}</div></div>`).join("")}
      </div>
      <div class="prop-eyebrow" style="margin-top:30px;">Our Aftercare Service</div>
      <div class="prop-grid-2">
        ${AFTERCARE_ITEMS.map(a => `<div><div class="prop-item-title">${a.title}</div><div class="prop-item-text">${a.text}</div></div>`).join("")}
      </div>
      <div class="prop-quote">"We don't just build outdoor spaces, we create places where memories are made for years to come." — The Northstone Team</div>
    </div>`;

  const nextStepsPage = `
    <div class="prop-page white">
      <div class="prop-eyebrow">Your Next Steps</div>
      <div class="prop-title" style="font-size:26px;">Let's Bring Your Vision to Life</div>
      <div class="prop-divider"></div>
      <div class="prop-steps">
        ${NEXT_STEPS.map((s, i) => `<div class="prop-step"><div class="num">0${i + 1}</div><div><div class="prop-item-title">${s.title}</div><div class="prop-item-text">${s.text}</div></div></div>`).join("")}
      </div>
      <p class="prop-lede" style="margin-top:24px;">Thank you for considering Northstone Design &amp; Build for your project. We look forward to creating something truly exceptional together.</p>
    </div>
    <div class="prop-footer-strip">
      <span>${proj.ref || "—"} · ${proj.client || "—"}</span>
      <span>07503 677201 · info@northstonedesignandbuild.com · www.northstonedesignandbuild.com</span>
    </div>`;

  const body = [coverPage, welcomePage, ourStoryPage, whyChoosePage, scopePage, inspirationPage, investmentPage, programmePage, warrantyPage, nextStepsPage].join("");
  return { filename: `Proposal - ${proj.name || "Project"}.html`, body, wide: true };
}

function buildProposalEmailText(proj, totals) {
  const items = flatIncludedItems(proj);
  const poa = poaSelectedFor(proj);
  const byCat = {};
  items.forEach(it => { if (!byCat[it.category]) byCat[it.category] = []; byCat[it.category].push(it); });
  const p = proj.proposal || {};
  let t = `Dear ${proj.client || "there"},\n\n`;
  t += `${p.welcomeMessage || "Thank you for the opportunity to propose our design and build solution for your outdoor space."}\n\n`;
  t += `PROJECT: ${proj.name || "—"}\nREFERENCE: ${proj.ref || "—"}\n\n`;
  if ((p.highlights || []).length) {
    t += `HIGHLIGHTS\n`;
    p.highlights.forEach(h => { t += `• ${h}\n`; });
    t += `\n`;
  }
  t += `SCOPE OF WORKS\n`;
  Object.entries(byCat).forEach(([cat, its]) => {
    t += `\n${cat}\n`;
    its.forEach(it => { t += `  - ${it.label} (${it.qty} ${it.unit}) — ${gbp(it.total)}\n`; });
  });
  if (poa.length) t += `\nQuoted separately: ${poa.join(", ")}\n`;
  t += `\nINVESTMENT SUMMARY\nSubtotal (ex VAT): ${gbp(totals.sell)}\nVAT: ${gbp(totals.vat)}\nTOTAL: ${gbp(totals.total)}\n\n`;
  t += `Estimated Duration: ${projectDurationWeeks(p)} weeks\nWarranty: ${p.warrantyYears || 5} year guarantee\nValid for: ${p.validityDays || 30} days\n\n`;
  t += `You'll also receive a separate invite to your own Northstone project portal, where you can review and accept this proposal, track progress once work begins, and message us directly. If you have any questions before then, just reply to this email or give us a call.\n\n`;
  t += `Kind regards,\nNorthstone Design & Build\n07503 677201\ninfo@northstonedesignandbuild.com\nwww.northstonedesignandbuild.com`;
  return t;
}

function generateTermsDoc(proj) {
  const body = `
    ${docHeader("Terms & Conditions", "Terms & Conditions")}
    <div class="body">
      <p>These terms apply to the project agreement between Northstone Design &amp; Build and <b>${proj.client || "the client"}</b> for <b>${proj.name || "the project"}</b> (${proj.ref || "—"}).</p>
      <h2>Payment</h2>
      <p>Payment is due in four stages as set out in the Payment Schedule: deposit on acceptance, on ordering of materials, on substantial completion, and on final handover.</p>
      <h2>Variations</h2>
      <p>Any changes to the agreed scope of works will be quoted separately and confirmed in writing before work proceeds.</p>
      <h2>Warranty</h2>
      <p>Workmanship is guaranteed for ${proj.proposal?.warrantyYears || 5} years from the date of handover, per the Warranty Certificate issued on completion.</p>
      <h2>Cancellation</h2>
      <p>Cancellation after acceptance may incur costs already committed for materials and labour booked to the project.</p>
      <h2>Access</h2>
      <p>The client agrees to provide reasonable site access for the duration of the works as set out during the site survey.</p>
    </div>
    ${docFooter()}`;
  return { filename: `Terms and Conditions - ${proj.name || "Project"}.html`, body };
}

function generateMaterialScheduleDoc(proj) {
  const items = flatIncludedItems(proj);
  const rows = items.map(it => `<tr><td>${it.category}</td><td>${it.label}</td><td>${it.supplier || "—"}</td><td>${it.qty} ${it.unit}</td><td class="right">${gbp(it.rate)}</td><td class="right">${gbp(it.total)}</td></tr>`).join("");
  const body = `
    ${docHeader("Material Schedule", proj.name || "Untitled Project")}
    <div class="body">
      <p>Project ${proj.ref || "—"} · ${proj.client || "—"}</p>
      <table><thead><tr><th>Category</th><th>Item</th><th>Supplier</th><th>Qty</th><th class="right">Rate</th><th class="right">Total</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="6">No items specified yet.</td></tr>`}</tbody></table>
    </div>
    ${docFooter()}`;
  return { filename: `Material Schedule - ${proj.name || "Project"}.html`, body };
}

function generatePaymentScheduleDoc(proj, totals) {
  const stageAmount = totals.total / 4;
  const paid = proj.payments || {};
  const rows = PAYMENT_STAGES.map((label, i) => `<tr><td>${label}</td><td>${paid[i] ? "Paid" : "Outstanding"}</td><td class="right">${gbp(stageAmount)}</td></tr>`).join("");
  const body = `
    ${docHeader("Payment Schedule", proj.name || "Untitled Project")}
    <div class="body">
      <p>Project ${proj.ref || "—"} · ${proj.client || "—"} · Total investment <b>${gbp(totals.total)}</b></p>
      <table><thead><tr><th>Stage</th><th>Status</th><th class="right">Amount</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </div>
    ${docFooter()}`;
  return { filename: `Payment Schedule - ${proj.name || "Project"}.html`, body };
}

function generateWarrantyDoc(proj) {
  const years = proj.proposal?.warrantyYears || 5;
  const issueDate = proj.signature?.date || new Date().toISOString().slice(0, 10);
  const body = `
    ${docHeader("Certificate of Warranty", "Warranty Certificate")}
    <div class="body">
      <div class="cert-border">
        <div class="cert-seal">N</div>
        <p style="font-size:11px;letter-spacing:2px;color:#8a887f;text-transform:uppercase;">This certifies that</p>
        <p style="font-family:'Playfair Display',serif;font-size:24px;font-weight:700;margin:6px 0;">${proj.client || "Client Name"}</p>
        <p style="font-size:13px;color:#555;">is covered by a</p>
        <p style="font-family:'Playfair Display',serif;font-size:22px;font-weight:700;color:#c8952f;margin:6px 0;">${years}-Year Workmanship Guarantee</p>
        <p style="font-size:13px;color:#555;">for the project</p>
        <p style="font-family:'Playfair Display',serif;font-size:18px;font-weight:700;margin:6px 0;">${proj.name || "Untitled Project"}</p>
        <p style="font-size:12px;color:#8a887f;">${proj.address || ""}</p>
        <p style="font-size:12px;color:#8a887f;margin-top:18px;">Project ID: ${proj.ref || "—"} &nbsp;·&nbsp; Issued: ${issueDate}</p>
        <p style="font-size:12px;color:#8a887f;">Guarantee valid until: ${(() => { const d = new Date(issueDate); d.setFullYear(d.getFullYear() + years); return d.toISOString().slice(0, 10); })()}</p>
      </div>
      <p style="font-size:12.5px;color:#555;margin-top:20px;">This warranty covers defects in workmanship carried out by Northstone Design &amp; Build under the above project. It does not cover damage caused by third parties, extreme weather events, or lack of routine maintenance. To make a claim, contact your project team with your Project ID.</p>
    </div>
    ${docFooter()}`;
  return { filename: `Warranty Certificate - ${proj.name || "Project"}.html`, body };
}

function resizeImageFile(file, maxWidth = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function downloadDocFile(filename, htmlBody, wide) {
  const full = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${filename}</title>
  <style>@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&display=swap'); * { box-sizing: border-box; } body { margin: 0; padding: 40px; background: #f6f3ec; } ${DOC_STYLE} .doc-sheet { border: 1px solid #eae6db; border-radius: 10px; overflow: hidden; } @media print { body { background: #fff; padding: 0; } .doc-sheet { border: none; } }</style>
  </head><body><div class="doc-sheet${wide ? " wide" : ""}">${htmlBody}</div></body></html>`;
  try {
    const blob = new Blob([full], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) { /* sandboxed environments may block this — preview modal is the reliable path */ }
}

// In-app preview modal for documents — this is the reliable way to view them
// inside the sandboxed artifact, since silent downloads can be blocked there.
function DocPreviewModal({ doc, onClose }) {
  if (!doc) return null;
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%", background: "rgba(10,20,15,0.6)", zIndex: 9999, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "30px 16px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
        ${DOC_STYLE}
        #doc-print-area { background: #fff; border-radius: 10px; overflow: hidden; }
        @media print {
          body * { visibility: hidden; }
          #doc-print-area, #doc-print-area * { visibility: visible; }
          #doc-print-area { position: absolute; top: 0; left: 0; width: 100%; }
          .doc-modal-bar { display: none !important; }
        }
      `}</style>
      <div style={{ maxWidth: doc.wide ? 900 : 760, width: "100%" }}>
        <div className="doc-modal-bar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{doc.filename ? doc.filename.replace(".html", "") : "Document"}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => window.print()} style={{ padding: "8px 14px", background: "#c8952f", color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><Download size={13}/> Print / Save as PDF</button>
            <button onClick={() => downloadDocFile(doc.filename, doc.body, doc.wide)} style={{ padding: "8px 14px", background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 7, fontSize: 12.5 }}>Download HTML</button>
            <button onClick={onClose} style={{ padding: "8px 14px", background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 7, fontSize: 12.5 }}>Close</button>
          </div>
        </div>
        <div id="doc-print-area" className={`doc-sheet${doc.wide ? " wide" : ""}`} dangerouslySetInnerHTML={{ __html: doc.body || "<p style='padding:20px'>No content.</p>" }} />
      </div>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function NorthstoneSystem() {
  const { profile, role, user, signOut } = useAuth();
  const [mode, setMode] = useState(role === "client" ? "portal" : "team"); // team | portal
  const [screen, setScreen] = useState("dashboard"); // dashboard | newProject | survey | estimate | proposal
  const [projects, setProjects] = useState([]);
  const [draft, setDraft] = useState(emptyDraft());
  const [leads, setLeads] = useState([]);
  const [leadFilter, setLeadFilter] = useState("All");
  const [newLead, setNewLead] = useState({ name: "", phone: "", email: "", source: "Phone Call", notes: "" });
  const [events, setEvents] = useState([]);
  const [team, setTeam] = useState([]);
  const [portfolioPhotos, setPortfolioPhotos] = useState([]);
  const [newTeamMember, setNewTeamMember] = useState({ name: "", role: TEAM_ROLES[0], phone: "", email: "", color: TEAM_COLORS[0] });
  const [newEvent, setNewEvent] = useState({ title: "", type: "Site Visit", date: "", time: "", projectId: "", leadId: "", notes: "" });
  const [newVariation, setNewVariation] = useState({ title: "", description: "", amount: "" });
  const [reviewForm, setReviewForm] = useState({ rating: 5, text: "" });
  const [backupPreview, setBackupPreview] = useState(null);
  const [pendingImport, setPendingImport] = useState(null);
  const [editDetailsFor, setEditDetailsFor] = useState(null);
  const [teamMsgDraft, setTeamMsgDraft] = useState("");
  const [invitingClient, setInvitingClient] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [leadSearch, setLeadSearch] = useState("");
  const [financeTab, setFinanceTab] = useState("dashboard");
  const [confirmAction, setConfirmAction] = useState(null);
  const askConfirm = (message, onConfirm, title) => setConfirmAction({ message, onConfirm, title });
  const [markLostFor, setMarkLostFor] = useState(null);
  const [expandedPlaybook, setExpandedPlaybook] = useState("pricing");
  const [referralForm, setReferralForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const [ticketForm, setTicketForm] = useState({ subject: "", description: "" });
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [step, setStep] = useState(0);
  const [settings, setSettings] = useState(defaultSettings);
  const [view, setView] = useState("internal");
  const [showSettings, setShowSettings] = useState(false);
  const [portalProjectId, setPortalProjectId] = useState(null);
  const [portalTab, setPortalTab] = useState("dashboard");
  const [visualLightbox, setVisualLightbox] = useState(null);
  const [portalDraft, setPortalDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState(null);
  const [docPreview, setDocPreview] = useState(null);
  const [newUpdate, setNewUpdate] = useState({ caption: "", stage: "", photo: null, uploading: false });
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2400); };
  const openDoc = (docData) => {
    try {
      if (!docData || !docData.body) { flash("Could not build that document — try again"); return; }
      setDocPreview(docData);
    } catch (e) {
      flash("Something went wrong opening that document");
    }
  };
  const safeOpenDoc = (genFn) => {
    try {
      const docData = genFn();
      openDoc(docData);
    } catch (e) {
      flash("Couldn't build that document — check the project has details filled in");
    }
  };

  // ---------- initial load: pull everything from Supabase ----------
  // RLS scopes this automatically per signed-in user — staff get
  // everything, a client's fetchAllProjects() only ever returns their own
  // project(s), leads/events/team come back empty for them rather than
  // erroring. There's no bulk "save everything" effect anymore: each
  // mutation below writes straight to the table/RPC it affects.
  useEffect(() => {
    (async () => {
      try {
        const [fetchedProjects, fetchedLeads, fetchedEvents, fetchedTeam, fetchedPhotos, fetchedSettings] = await Promise.all([
          Projects.fetchAllProjects(),
          Leads.fetchLeads(),
          Events.fetchEvents(),
          Team.fetchTeamMembers(),
          Portfolio.fetchPortfolioPhotos(),
          Settings.fetchSettings(),
        ]);
        setProjects(fetchedProjects);
        setLeads(fetchedLeads);
        setEvents(fetchedEvents);
        setTeam(fetchedTeam);
        setPortfolioPhotos(fetchedPhotos);
        setSettings(fetchedSettings);
        if (role === "client" && fetchedProjects.length) setPortalProjectId(fetchedProjects[0].id);
      } catch (e) {
        flash("Couldn't load your data — check your connection and try reloading");
      }
      setLoaded(true);
    })();
  }, []);

  // Settings fields autosave on change with no explicit "Save" button, so
  // debounce the write instead of firing one per keystroke. Skips the
  // write that would otherwise fire the instant the fetched settings land.
  const settingsLoadedRef = useRef(false);
  useEffect(() => {
    if (!loaded) return;
    if (!settingsLoadedRef.current) { settingsLoadedRef.current = true; return; }
    const t = setTimeout(() => {
      Settings.saveSettings(settings).catch(() => flash("Couldn't save settings — check your connection"));
    }, 600);
    return () => clearTimeout(t);
  }, [settings, loaded]);

  // upsert current draft into the projects roster
  // The one checkpoint every "save the draft" action goes through. Updates
  // local state immediately (so the UI never waits on the network), then
  // writes the project's core columns to Supabase in the background — same
  // upsert semantics whether this is the first save (creates the row) or
  // the hundredth (updates it). Child-table data (messages, variations,
  // updates, tickets, referrals, visuals, assigned team) is NOT part of
  // this — those are written directly by their own dedicated functions
  // the moment they happen, not batched into this checkpoint.
  const syncDraft = (updated) => {
    const isNew = !projects.some(p => p.id === updated.id);
    setDraft(updated);
    setProjects(ps => {
      const exists = ps.some(p => p.id === updated.id);
      return exists ? ps.map(p => p.id === updated.id ? updated : p) : [updated, ...ps];
    });
    Projects.saveProjectCore(updated, isNew ? { createdBy: user?.id } : undefined).catch(() =>
      flash("Couldn't save that change — check your connection")
    );
  };

  // ---------- derived pricing for the active draft, from the DETAILED pricing tool ----------
  const pricing = draft.pricing || { itemState: defaultAllPricingState(), poaState: defaultAllPoaState(), collapsed: {}, customItems: [] };
  const computed = useMemo(() => {
    const catalogLines = FLAT_PRICING_ITEMS.filter(it => pricing.itemState[it.id]?.included).map(it => {
      const st = pricing.itemState[it.id];
      const qty = Number(st.qty) || 0;
      const rate = Number(st.rate) || 0;
      const cost = Number(st.cost) || 0;
      const total = qty * rate;
      const costTotal = qty * cost;
      const displayLabel = st.productName ? `${it.label} — ${st.productName}` : it.label;
      return { id: it.id, rate: { category: it.categoryName, item: displayLabel, unit: it.unit }, qty, sellTotal: total, directTotal: costTotal, profit: total - costTotal };
    });
    const customLines = (pricing.customItems || []).filter(c => c.label && Number(c.qty) > 0).map(c => {
      const qty = Number(c.qty) || 0;
      const rate = Number(c.rate) || 0;
      const cost = Number(c.cost) || 0;
      const total = qty * rate;
      const costTotal = qty * cost;
      return { id: c.id, rate: { category: "Other / Custom Materials", item: c.label, unit: c.unit || "item" }, qty, sellTotal: total, directTotal: costTotal, profit: total - costTotal };
    });
    return [...catalogLines, ...customLines];
  }, [pricing.itemState, pricing.customItems]);
  const poaSelectedList = useMemo(() => {
    const list = [];
    POA_CATEGORIES.forEach(cat => Object.entries(pricing.poaState[cat.id] || {}).forEach(([label, v]) => { if (v) list.push(label); }));
    return list;
  }, [pricing.poaState]);
  const sellTotal = computed.reduce((s, l) => s + l.sellTotal, 0);
  const directCostTotal = computed.reduce((s, l) => s + l.directTotal, 0);
  const profitTotal = sellTotal - directCostTotal;
  const vat = sellTotal * (settings.vatPct / 100);
  const clientTotal = sellTotal + vat;
  const groupedByCategory = useMemo(() => {
    const map = {};
    computed.forEach(l => { const cat = l.rate.category; if (!map[cat]) map[cat] = []; map[cat].push(l); });
    return map;
  }, [computed]);

  const updatePricingItem = (id, patch) => setDraft(d => ({ ...d, pricing: { ...d.pricing, itemState: { ...d.pricing.itemState, [id]: { ...d.pricing.itemState[id], ...patch } } } }));
  const togglePricingPoa = (catId, label) => setDraft(d => ({ ...d, pricing: { ...d.pricing, poaState: { ...d.pricing.poaState, [catId]: { ...d.pricing.poaState[catId], [label]: !d.pricing.poaState[catId][label] } } } }));
  const togglePricingCollapse = (catId) => setDraft(d => ({ ...d, pricing: { ...d.pricing, collapsed: { ...d.pricing.collapsed, [catId]: !d.pricing.collapsed[catId] } } }));
  const addCustomItem = () => setDraft(d => ({ ...d, pricing: { ...d.pricing, customItems: [...(d.pricing.customItems || []), { id: uid(), label: "", unit: "item", qty: 1, rate: "", cost: "" }] } }));
  const updateCustomItem = (id, patch) => setDraft(d => ({ ...d, pricing: { ...d.pricing, customItems: (d.pricing.customItems || []).map(c => c.id === id ? { ...c, ...patch } : c) } }));
  const removeCustomItem = (id) => setDraft(d => ({ ...d, pricing: { ...d.pricing, customItems: (d.pricing.customItems || []).filter(c => c.id !== id) } }));

  // helper: totals for ANY project object (used on dashboard + portal + reports)
  const totalsFor = (proj) => {
    const items = proj.pricing ? FLAT_PRICING_ITEMS.filter(it => proj.pricing.itemState[it.id]?.included) : [];
    let baseCost = 0;
    let baseSell = items.reduce((s, it) => {
      const st = proj.pricing.itemState[it.id];
      const qty = Number(st.qty) || 0;
      baseCost += qty * (Number(st.cost) || 0);
      return s + qty * (Number(st.rate) || 0);
    }, 0);
    (proj.pricing?.customItems || []).filter(c => c.label && Number(c.qty) > 0).forEach(c => {
      const qty = Number(c.qty) || 0;
      baseSell += qty * (Number(c.rate) || 0);
      baseCost += qty * (Number(c.cost) || 0);
    });
    const variationsSell = (proj.variations || []).filter(v => v.status === "Approved").reduce((s, v) => s + (Number(v.amount) || 0), 0);
    const sell = baseSell + variationsSell;
    const vatAmt = sell * (settings.vatPct / 100);
    const cost = baseCost; // variations have no separate cost tracked, treated as pure margin for now
    return { sell, vat: vatAmt, total: sell + vatAmt, baseSell, variationsSell, cost, profit: sell - cost };
  };

  // ============================================================
  // DASHBOARD ACTIONS
  // ============================================================
  // Staff-only — this is also reachable from the shared "no project yet"
  // placeholder a client with no linked project sees, so it must no-op for
  // them rather than dropping them into the team-side wizard.
  const startNewProject = () => {
    if (role !== "staff") return;
    const fresh = emptyDraft();
    setDraft(fresh);
    setStep(0);
    setScreen("newProject");
    setMode("team");
  };
  const openProject = (proj) => {
    setDraft(proj);
    setStep(0);
    if (proj.status === "Draft") setScreen("newProject");
    else if (proj.status === "Signed" || proj.status === "In Construction" || proj.status === "Completed") setScreen("construction");
    else if (proj.status === "Survey Booked") setScreen("survey");
    else setScreen("estimate");
  };
  const viewPortal = (proj) => { setPortalProjectId(proj.id); setMode("portal"); setPortalTab("dashboard"); };
  const openEditDetails = (proj) => setEditDetailsFor(proj);
  const saveProjectDetails = (form) => {
    if (!editDetailsFor) return;
    const updated = { ...editDetailsFor, ...form };
    setProjects(ps => ps.map(p => p.id === updated.id ? updated : p));
    if (draft.id === updated.id) setDraft(updated);
    setEditDetailsFor(null);
    flash("Project details updated");
    Projects.saveProjectCore(updated).catch(() => flash("Couldn't save those details — check your connection"));
  };
  // Real welcome email: creates (or reuses) the client's account and
  // emails them a link to set a password and access this project's
  // portal. Unlike the "Email Proposal" mailto link, this actually sends
  // — via the invite-client Edge Function, since creating/inviting an
  // auth user needs the service-role key.
  const inviteClientToPortal = async (proj) => {
    if (!proj.email) { flash("Add the client's email in project details first"); return; }
    setInvitingClient(true);
    try {
      const result = await Projects.inviteClient(proj.id, proj.email, proj.client);
      const updated = { ...proj, clientUserId: result.userId || proj.clientUserId };
      setProjects(ps => ps.map(p => p.id === proj.id ? updated : p));
      if (draft.id === proj.id) setDraft(updated);
      flash(result.invited ? `Invite sent to ${proj.email}` : `${proj.email} already has an account — linked to this project`);
    } catch (e) {
      flash(e.message || "Couldn't invite the client — check your connection");
    }
    setInvitingClient(false);
  };
  const markProjectLost = (proj, reason, notes) => {
    const updated = { ...proj, previousStatus: proj.status, status: "Lost", lostReason: reason, lostNotes: notes, lostAt: new Date().toISOString().slice(0, 10) };
    setProjects(ps => ps.map(p => p.id === proj.id ? updated : p));
    if (draft.id === proj.id) setDraft(updated);
    setMarkLostFor(null);
    flash(`${proj.name} marked as lost`);
    Projects.saveProjectCore(updated).catch(() => flash("Couldn't save that change — check your connection"));
  };
  const reactivateProject = (proj) => {
    const updated = { ...proj, status: proj.previousStatus || "Proposal Sent", previousStatus: null, lostReason: null, lostNotes: null, lostAt: null };
    setProjects(ps => ps.map(p => p.id === proj.id ? updated : p));
    if (draft.id === proj.id) setDraft(updated);
    flash(`${proj.name} reactivated`);
    Projects.saveProjectCore(updated).catch(() => flash("Couldn't save that change — check your connection"));
  };
  const sendTeamMessage = (projId, text) => {
    if (!text.trim()) return;
    const msg = { id: uid(), from: "team", text: text.trim(), when: "Just now" };
    setProjects(ps => ps.map(p => p.id === projId ? { ...p, messages: [...(p.messages || []), msg] } : p));
    if (draft.id === projId) setDraft(d => ({ ...d, messages: [...(d.messages || []), msg] }));
    setTeamMsgDraft("");
    Projects.insertMessageStaff(projId, msg.text, user?.id).catch(() => flash("Couldn't send that message — check your connection"));
  };
  const resolveSupportTicket = (projId, ticketId) => {
    setProjects(ps => ps.map(p => p.id !== projId ? p : { ...p, supportTickets: (p.supportTickets || []).map(t => t.id === ticketId ? { ...t, status: "Resolved", resolvedAt: new Date().toISOString().slice(0, 10) } : t) }));
    if (draft.id === projId) setDraft(d => ({ ...d, supportTickets: (d.supportTickets || []).map(t => t.id === ticketId ? { ...t, status: "Resolved", resolvedAt: new Date().toISOString().slice(0, 10) } : t) }));
    Projects.resolveSupportTicket(ticketId).catch(() => flash("Couldn't save that — check your connection"));
  };

  // ---------- construction progress: stage %, photo updates ----------
  const setStagePct = (key, pct) => {
    const timeline = { ...draft.timeline, [key]: pct };
    const avg = Object.values(timeline).reduce((s, v) => s + v, 0) / TIMELINE_STAGES.length;
    const allDone = TIMELINE_STAGES.every(t => timeline[t.key] === 100);
    let status = draft.status;
    if (allDone) status = "Completed";
    else if (avg > 0) status = "In Construction";
    syncDraft({ ...draft, timeline, status });
  };
  const handlePhotoPick = async (file) => {
    if (!file) return;
    setNewUpdate(u => ({ ...u, uploading: true }));
    try {
      const dataUrl = await resizeImageFile(file);
      setNewUpdate(u => ({ ...u, photo: dataUrl, photoFile: file, uploading: false }));
    } catch (e) {
      setNewUpdate(u => ({ ...u, uploading: false }));
      flash("Couldn't read that photo — try a different file");
    }
  };
  const postSiteUpdate = async () => {
    if (!newUpdate.caption.trim() && !newUpdate.photo) { flash("Add a photo or a caption first"); return; }
    try {
      const path = newUpdate.photoFile ? await uploadPhoto(PROJECT_PHOTOS_BUCKET, `${draft.id}/updates`, newUpdate.photoFile) : null;
      const entry = await Projects.insertSiteUpdate(draft.id, { stage: newUpdate.stage, caption: newUpdate.caption.trim(), path }, user?.id);
      setDraft(d => ({ ...d, updates: [entry, ...(d.updates || [])] }));
      setProjects(ps => ps.map(p => p.id === draft.id ? { ...p, updates: [entry, ...(p.updates || [])] } : p));
      setNewUpdate({ caption: "", stage: "", photo: null, photoFile: null, uploading: false });
      flash("Update posted — visible in the Client Portal now");
    } catch (e) {
      flash("Couldn't post that update — check your connection");
    }
  };
  const removeSiteUpdate = (id) => {
    const target = (draft.updates || []).find(u => u.id === id);
    setDraft(d => ({ ...d, updates: (d.updates || []).filter(u => u.id !== id) }));
    setProjects(ps => ps.map(p => p.id === draft.id ? { ...p, updates: (p.updates || []).filter(u => u.id !== id) } : p));
    Projects.deleteSiteUpdate(id, target?.photo).catch(() => flash("Couldn't delete that update — check your connection"));
  };

  // ---------- design visuals: 2D plans & 3D renders shown in the Client Portal ----------
  const addDesignVisuals = async (kind, files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    try {
      const dv = draft.designVisuals || { plans2d: [], renders3d: [] };
      const startPos = (dv[kind] || []).length;
      const inserted = [];
      for (let i = 0; i < list.length; i++) {
        const path = await uploadPhoto(PROJECT_PHOTOS_BUCKET, `${draft.id}/visuals`, list[i]);
        inserted.push(await Projects.insertVisual(draft.id, kind, path, startPos + i));
      }
      const updatedDv = { ...dv, [kind]: [...(dv[kind] || []), ...inserted] };
      setDraft(d => ({ ...d, designVisuals: updatedDv }));
      setProjects(ps => ps.map(p => p.id === draft.id ? { ...p, designVisuals: updatedDv } : p));
      flash("Visual uploaded — visible in the Client Portal now");
    } catch (e) {
      flash("Couldn't upload that visual — check your connection");
    }
  };
  const updateDesignVisualCaption = (kind, id, caption) => {
    const dv = draft.designVisuals || { plans2d: [], renders3d: [] };
    const updatedDv = { ...dv, [kind]: (dv[kind] || []).map(v => v.id === id ? { ...v, caption } : v) };
    setDraft(d => ({ ...d, designVisuals: updatedDv }));
    setProjects(ps => ps.map(p => p.id === draft.id ? { ...p, designVisuals: updatedDv } : p));
    Projects.updateVisualCaption(id, caption).catch(() => flash("Couldn't save that caption — check your connection"));
  };
  const removeDesignVisual = (kind, id) => {
    const dv = draft.designVisuals || { plans2d: [], renders3d: [] };
    const target = (dv[kind] || []).find(v => v.id === id);
    const updatedDv = { ...dv, [kind]: (dv[kind] || []).filter(v => v.id !== id) };
    setDraft(d => ({ ...d, designVisuals: updatedDv }));
    setProjects(ps => ps.map(p => p.id === draft.id ? { ...p, designVisuals: updatedDv } : p));
    Projects.deleteVisual(id, target?.path).catch(() => flash("Couldn't delete that visual — check your connection"));
  };

  // ---------- change orders / variations ----------
  const addVariation = async () => {
    if (!newVariation.title.trim() || !newVariation.amount) { flash("Add a title and amount first"); return; }
    try {
      const v = await Projects.insertVariation(draft.id, { title: newVariation.title.trim(), description: newVariation.description.trim(), amount: Number(newVariation.amount) || 0 });
      setDraft(d => ({ ...d, variations: [v, ...(d.variations || [])] }));
      setProjects(ps => ps.map(p => p.id === draft.id ? { ...p, variations: [v, ...(p.variations || [])] } : p));
      setNewVariation({ title: "", description: "", amount: "" });
      flash("Variation sent — client can approve it in their portal");
    } catch (e) {
      flash("Couldn't send that variation — check your connection");
    }
  };
  const deleteVariation = (id) => {
    setDraft(d => ({ ...d, variations: (d.variations || []).filter(v => v.id !== id) }));
    setProjects(ps => ps.map(p => p.id === draft.id ? { ...p, variations: (p.variations || []).filter(v => v.id !== id) } : p));
    Projects.deleteVariation(id).catch(() => flash("Couldn't delete that variation — check your connection"));
  };
  const respondVariation = (projId, variationId, status) => {
    setProjects(ps => ps.map(p => p.id !== projId ? p : { ...p, variations: (p.variations || []).map(v => v.id === variationId ? { ...v, status, respondedAt: new Date().toISOString().slice(0, 10) } : v) }));
    if (draft.id === projId) {
      setDraft(d => ({ ...d, variations: (d.variations || []).map(v => v.id === variationId ? { ...v, status, respondedAt: new Date().toISOString().slice(0, 10) } : v) }));
    }
    const write = role === "staff" ? Projects.respondToVariationStaff(variationId, status) : Projects.respondToVariationAsClient(variationId, status);
    write.catch(() => flash("Couldn't save that response — check your connection"));
  };

  // ---------- reviews & referrals ----------
  const submitReview = (projId, rating, text) => {
    const review = { rating, text, submittedAt: new Date().toISOString().slice(0, 10) };
    setProjects(ps => ps.map(p => p.id === projId ? { ...p, review } : p));
    if (draft.id === projId) setDraft(d => ({ ...d, review }));
    const write = role === "staff"
      ? Projects.saveProjectCore({ ...(projects.find(p => p.id === projId) || draft), review })
      : Projects.submitReviewAsClient(projId, rating, text);
    write.catch(() => flash("Couldn't save that review — check your connection"));
  };
  const submitReferral = async (projId, referral) => {
    try {
      if (role === "staff") {
        const { referral: entry, lead } = await Projects.insertReferralStaff(projId, referral, (projects.find(p => p.id === projId) || draft).client);
        setProjects(ps => ps.map(p => p.id === projId ? { ...p, referrals: [...(p.referrals || []), entry] } : p));
        if (draft.id === projId) setDraft(d => ({ ...d, referrals: [...(d.referrals || []), entry] }));
        setLeads(ls => [lead, ...ls]);
      } else {
        const entry = await Projects.submitReferralAsClient(projId, referral);
        setProjects(ps => ps.map(p => p.id === projId ? { ...p, referrals: [...(p.referrals || []), entry] } : p));
        if (draft.id === projId) setDraft(d => ({ ...d, referrals: [...(d.referrals || []), entry] }));
      }
    } catch (e) {
      flash("Couldn't submit that referral — check your connection");
    }
  };

  // ---------- backup & restore ----------
  const buildBackupJson = () => JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    projects, leads, events, team, settings, portfolioPhotos,
  }, null, 2);
  const exportBackup = () => setBackupPreview(buildBackupJson());
  const downloadBackupFile = () => {
    try {
      const json = buildBackupJson();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `northstone-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) { flash("Download blocked — use Copy to Clipboard instead"); }
  };
  const copyBackupToClipboard = async () => {
    try { await navigator.clipboard.writeText(buildBackupJson()); flash("Backup copied — paste it somewhere safe"); }
    catch (e) { flash("Couldn't copy automatically — select the text manually"); }
  };
  const handleBackupFilePick = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed || typeof parsed !== "object") throw new Error("bad format");
        setPendingImport(parsed);
      } catch (err) {
        flash("That file doesn't look like a valid Northstone backup");
      }
    };
    reader.onerror = () => flash("Couldn't read that file");
    reader.readAsText(file);
  };
  // Restores projects (core columns), leads, events, team, and settings,
  // preserving original ids so cross-references (event -> project, lead ->
  // referring project) still resolve. Two things a backup can't bring
  // back through this path: child-table data that didn't exist when the
  // backup was taken (messages, variations, site updates, support
  // tickets, referrals, design visuals) and portfolio photos (old backups
  // hold them as base64, incompatible with the Storage-path model those
  // now use) — both are skipped rather than imported broken.
  const confirmImport = async () => {
    if (!pendingImport) return;
    try {
      if (pendingImport.projects) {
        for (const proj of pendingImport.projects) {
          await Projects.saveProjectCore({ ...proj, referredByProjectId: null, referralEntryId: null }, { createdBy: user?.id });
        }
      }
      if (pendingImport.leads) await Leads.restoreLeads(pendingImport.leads);
      if (pendingImport.events) await Events.restoreEvents(pendingImport.events);
      if (pendingImport.team) await Team.restoreTeamMembers(pendingImport.team);
      if (pendingImport.settings) await Settings.saveSettings(pendingImport.settings);

      const [fetchedProjects, fetchedLeads, fetchedEvents, fetchedTeam, fetchedSettings] = await Promise.all([
        Projects.fetchAllProjects(),
        Leads.fetchLeads(),
        Events.fetchEvents(),
        Team.fetchTeamMembers(),
        Settings.fetchSettings(),
      ]);
      setProjects(fetchedProjects);
      setLeads(fetchedLeads);
      setEvents(fetchedEvents);
      setTeam(fetchedTeam);
      setSettings(fetchedSettings);
      setPendingImport(null);
      flash("Backup restored — photos, messages, and change orders from the backup were not re-imported");
    } catch (e) {
      flash("Couldn't restore that backup — check your connection");
    }
  };

  // ---------- portfolio photo library (feeds Design Inspiration in proposals) ----------
  const addPortfolioPhotos = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    try {
      const uploaded = await Portfolio.addPortfolioPhotos(list);
      setPortfolioPhotos(pp => [...pp, ...uploaded]);
    } catch (e) {
      flash("Couldn't upload those photos — check your connection");
    }
  };
  const updatePortfolioCaption = (id, caption) => {
    setPortfolioPhotos(pp => pp.map(p => p.id === id ? { ...p, caption } : p));
    Portfolio.updatePortfolioCaption(id, caption).catch(() => flash("Couldn't save that caption — check your connection"));
  };
  const removePortfolioPhoto = (id) => {
    const target = portfolioPhotos.find(p => p.id === id);
    setPortfolioPhotos(pp => pp.filter(p => p.id !== id));
    Portfolio.removePortfolioPhoto(id, target?.path).catch(() => flash("Couldn't delete that photo — check your connection"));
  };

  // ---------- leads / enquiries ----------
  const addLead = async () => {
    if (!newLead.name.trim()) { flash("Enter a name to add this lead"); return; }
    try {
      const lead = await Leads.insertLead({ ...newLead, name: newLead.name.trim() }, user?.id);
      setLeads(ls => [lead, ...ls]);
      setNewLead({ name: "", phone: "", email: "", source: "Phone Call", notes: "" });
      flash(`${lead.name} added to leads`);
    } catch (e) {
      flash("Couldn't add that lead — check your connection");
    }
  };
  const updateLeadStatus = (id, status) => {
    setLeads(ls => ls.map(l => l.id === id ? { ...l, status } : l));
    Leads.updateLeadStatus(id, status).catch(() => flash("Couldn't save that change — check your connection"));
  };
  const deleteLead = (id) => {
    setLeads(ls => ls.filter(l => l.id !== id));
    Leads.deleteLead(id).catch(() => flash("Couldn't delete that lead — check your connection"));
  };
  const convertLead = (lead) => {
    const fresh = emptyDraft();
    fresh.client = lead.name;
    fresh.email = lead.email || "";
    fresh.phone = lead.phone || "";
    fresh.goals = lead.notes || "";
    fresh.referredByProjectId = lead.referredByProjectId || null;
    fresh.referralEntryId = lead.referralEntryId || null;
    setDraft(fresh);
    setStep(0);
    setScreen("newProject");
    updateLeadStatus(lead.id, "Won");
    flash(`Starting a project for ${lead.name}`);
  };

  // ---------- calendar / scheduling ----------
  const addEvent = async () => {
    if (!newEvent.title.trim() || !newEvent.date) { flash("Add a title and date first"); return; }
    try {
      const ev = await Events.insertEvent({ ...newEvent, title: newEvent.title.trim() }, user?.id);
      setEvents(es => [...es, ev]);
      if ((ev.type === "Site Survey" || ev.type === "Site Visit") && ev.leadId) {
        updateLeadStatus(ev.leadId, "Survey Booked");
      }
      setNewEvent({ title: "", type: "Site Visit", date: "", time: "", projectId: "", leadId: "", notes: "" });
      flash("Event added to calendar");
    } catch (e) {
      flash("Couldn't add that event — check your connection");
    }
  };
  const deleteEvent = (id) => {
    setEvents(es => es.filter(e => e.id !== id));
    Events.deleteEvent(id).catch(() => flash("Couldn't delete that event — check your connection"));
  };
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const sortedEvents = (list) => [...list].sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));

  // ---------- team ----------
  const addTeamMember = async () => {
    if (!newTeamMember.name.trim()) { flash("Enter a name first"); return; }
    const usedColors = team.map(t => t.color);
    const nextColor = TEAM_COLORS.find(c => !usedColors.includes(c)) || TEAM_COLORS[team.length % TEAM_COLORS.length];
    try {
      const member = await Team.insertTeamMember({ ...newTeamMember, color: nextColor });
      setTeam(ts => [...ts, member]);
      setNewTeamMember({ name: "", role: TEAM_ROLES[0], phone: "", email: "", color: TEAM_COLORS[0] });
      flash("Team member added");
    } catch (e) {
      flash("Couldn't add that team member — check your connection");
    }
  };
  const removeTeamMember = (id) => {
    setTeam(ts => ts.filter(t => t.id !== id));
    setProjects(ps => ps.map(p => ({ ...p, assignedTeam: (p.assignedTeam || []).filter(tid => tid !== id) })));
    Team.deleteTeamMember(id).catch(() => flash("Couldn't delete that team member — check your connection"));
  };
  // assignedTeam lives in its own join table, not a project core column —
  // don't route this through syncDraft, write the single row that changed.
  const toggleAssignedTeam = (memberId) => {
    const assignedTeam = draft.assignedTeam || [];
    const isAssigning = !assignedTeam.includes(memberId);
    const updated = isAssigning ? [...assignedTeam, memberId] : assignedTeam.filter(id => id !== memberId);
    setDraft(d => ({ ...d, assignedTeam: updated }));
    setProjects(ps => ps.map(p => p.id === draft.id ? { ...p, assignedTeam: updated } : p));
    const write = isAssigning ? Projects.addProjectTeamMember(draft.id, memberId) : Projects.removeProjectTeamMember(draft.id, memberId);
    write.catch(() => flash("Couldn't update team assignment — check your connection"));
  };

  // ============================================================
  // NEW PROJECT
  // ============================================================
  const toggleService = (s) => setDraft(d => ({ ...d, services: { ...d.services, [s]: !d.services[s] } }));
  const startSurvey = () => {
    if (!draft.name.trim() || !draft.client.trim()) { flash("Project name & client are required"); return; }
    const ref = draft.ref || `NS-26-${String(projects.length + 1).padStart(3, "0")}`;
    const updated = { ...draft, ref, status: "Survey Booked" };
    syncDraft(updated);
    setScreen("survey"); setStep(0);
    flash(`${updated.name} created`);
  };

  // ============================================================
  // SURVEY
  // ============================================================
  const sectionComplete = (key) => {
    const s = draft.survey;
    if (key === "info") return !!s.info.notes || !!s.info.access;
    if (key === "measure") return s.measurements.some(m => m.value);
    if (key === "photos") return Object.values(s.photos).filter(Boolean).length >= REQUIRED_PHOTOS.length;
    if (key === "services") return !!s.services.drainage;
    if (key === "vision") return s.vision.style.length > 0;
    return false;
  };
  const completedCount = SURVEY_STEPS.slice(0, 5).filter(s => sectionComplete(s.key)).length;
  const overallPct = Math.round((completedCount / 5) * 100);

  const updateSurveyField = (path, value) => {
    setDraft(d => {
      const survey = { ...d.survey };
      path[0](survey, value);
      return { ...d, survey };
    });
  };
  // Survey photos upload to Storage immediately (so the file is safe even
  // if the browser closes before the survey step is submitted), but the
  // `survey` jsonb itself only reaches Supabase at the next syncDraft
  // checkpoint (goToEstimate) — same timing as every other survey field.
  const setSurveyPhoto = async (name, file) => {
    if (!file) return;
    try {
      const path = await uploadPhoto(PROJECT_PHOTOS_BUCKET, `${draft.id}/survey`, file);
      setDraft(d => ({ ...d, survey: { ...d.survey, photos: { ...d.survey.photos, [name]: path } } }));
    } catch (e) {
      flash("Couldn't upload that photo — check your connection");
    }
  };
  const markSurveyPhotoChecked = (name) => setDraft(d => ({ ...d, survey: { ...d.survey, photos: { ...d.survey.photos, [name]: "checked" } } }));
  const removeSurveyPhoto = (name) => setDraft(d => {
    const photos = { ...d.survey.photos };
    const existing = photos[name];
    delete photos[name];
    if (existing && existing !== "checked") deletePhoto(PROJECT_PHOTOS_BUCKET, existing).catch(() => {});
    return { ...d, survey: { ...d.survey, photos } };
  });
  const toggleStyle = (st) => setDraft(d => ({ ...d, survey: { ...d.survey, vision: { ...d.survey.vision, style: d.survey.vision.style.includes(st) ? d.survey.vision.style.filter(x => x !== st) : [...d.survey.vision.style, st] } } }));
  const updateMeasurement = (id, field, value) => setDraft(d => ({ ...d, survey: { ...d.survey, measurements: d.survey.measurements.map(m => m.id === id ? { ...m, [field]: value } : m) } }));
  const addMeasurement = () => setDraft(d => ({ ...d, survey: { ...d.survey, measurements: [...d.survey.measurements, { id: uid(), name: "New Measurement", value: "" }] } }));
  const removeMeasurement = (id) => setDraft(d => ({ ...d, survey: { ...d.survey, measurements: d.survey.measurements.filter(m => m.id !== id) } }));

  const goToEstimate = () => {
    const updated = { ...draft, status: "Proposal Sent" };
    syncDraft(updated);
    setScreen("estimate");
  };

  // ============================================================
  // PROPOSAL
  // ============================================================
  const addHighlight = () => setDraft(d => ({ ...d, proposal: { ...d.proposal, highlights: [...d.proposal.highlights, "New highlight"] } }));
  const updateHighlight = (i, v) => setDraft(d => ({ ...d, proposal: { ...d.proposal, highlights: d.proposal.highlights.map((h, idx) => idx === i ? v : h) } }));
  const removeHighlight = (i) => setDraft(d => ({ ...d, proposal: { ...d.proposal, highlights: d.proposal.highlights.filter((_, idx) => idx !== i) } }));
  // Only reachable from the staff-side proposal wizard (capturing a
  // signature in person/on a call) — there's no remote client-signing flow
  // in this app today, so this is always a staff action.
  const signProposal = () => {
    const code = draft.referralCode || generateReferralCode(draft);
    const updated = { ...draft, signature: { ...draft.signature, signed: true, date: draft.signature.date || new Date().toISOString().slice(0, 10) }, status: "Signed", referralCode: code };
    syncDraft(updated);
    if (draft.referredByProjectId && draft.referralEntryId) {
      const rewardDate = new Date().toISOString().slice(0, 10);
      setProjects(ps => ps.map(p => p.id !== draft.referredByProjectId ? p : {
        ...p,
        referrals: (p.referrals || []).map(r => r.id === draft.referralEntryId ? { ...r, status: "Rewarded", rewardAmount: settings.referralRewardAmount, rewardedAt: rewardDate } : r),
      }));
      flash(`Signed! £${settings.referralRewardAmount} referral reward credited to ${projects.find(p => p.id === draft.referredByProjectId)?.client || "the referrer"}`);
      Projects.rewardReferral(draft.referralEntryId, settings.referralRewardAmount).catch(() => flash("Signed, but couldn't record the referral reward — check your connection"));
    }
  };

  // ============================================================
  // CLIENT PORTAL data
  // ============================================================
  const portalProject = projects.find(p => p.id === portalProjectId) || draft;
  const portalTotals = totalsFor(portalProject);
  // The portal UI below is reached by two different people: a real client
  // (own project only, via the submit_*/respond_to_variation RPCs — see
  // supabase/migrations) and staff previewing via the Client Portal toggle
  // (full access, direct table writes). Every action here branches on
  // `role` for that reason.
  const sendPortalMessage = () => {
    if (!portalDraft.trim()) return;
    const text = portalDraft.trim();
    const updated = { ...portalProject, messages: [...(portalProject.messages || []), { id: uid(), from: "client", text, when: "Just now" }] };
    setProjects(ps => ps.map(p => p.id === updated.id ? updated : p));
    if (draft.id === updated.id) setDraft(updated);
    setPortalDraft("");
    const write = role === "staff" ? Projects.insertMessageStaff(portalProject.id, text, user?.id) : Projects.sendMessageAsClient(portalProject.id, text);
    write.catch(() => flash("Couldn't send that message — check your connection"));
  };
  const markPaid = (idx) => {
    if (role !== "staff") {
      flash("Online payment isn't connected yet — contact Northstone to arrange payment");
      return;
    }
    const updated = { ...portalProject, payments: { ...(portalProject.payments || {}), [idx]: true } };
    setProjects(ps => ps.map(p => p.id === updated.id ? updated : p));
    if (draft.id === updated.id) setDraft(updated);
    Projects.saveProjectCore(updated).catch(() => flash("Couldn't save that change — check your connection"));
  };
  const dismissPortalWelcome = () => {
    const updated = { ...portalProject, portalWelcomed: true };
    setProjects(ps => ps.map(p => p.id === updated.id ? updated : p));
    if (draft.id === updated.id) setDraft(updated);
    const write = role === "staff" ? Projects.saveProjectCore(updated) : Projects.dismissPortalWelcomeAsClient(portalProject.id);
    write.catch(() => {});
  };
  const submitSupportTicket = async (subject, description) => {
    try {
      const ticket = role === "staff"
        ? await Projects.insertSupportTicketStaff(portalProject.id, subject, description)
        : await Projects.submitSupportTicketAsClient(portalProject.id, subject, description);
      const updated = { ...portalProject, supportTickets: [ticket, ...(portalProject.supportTickets || [])] };
      setProjects(ps => ps.map(p => p.id === updated.id ? updated : p));
      if (draft.id === updated.id) setDraft(updated);
    } catch (e) {
      flash("Couldn't submit that ticket — check your connection");
    }
  };
  const overallProgress = Math.round(Object.values(portalProject.timeline || {}).reduce((s, v) => s + v, 0) / TIMELINE_STAGES.length) || 0;

  // ============================================================
  // TOP MODE SWITCHER (shown everywhere)
  // ============================================================
  // Clients never get a "Team View" toggle — they only ever see their own
  // portal. (Real data isolation comes from RLS once projects live in
  // Supabase; this is the UI-level counterpart.)
  const ModeSwitch = role === "client" ? null : (
    <div style={{ display: "flex", background: "#fff", border: "1px solid #ddd8ca", borderRadius: 30, padding: 3 }}>
      <button onClick={() => setMode("team")} style={{ padding: "7px 16px", borderRadius: 24, border: "none", background: mode === "team" ? FOREST : "transparent", color: mode === "team" ? "#fff" : INK, fontSize: 12.5, fontWeight: 700 }}>Team View</button>
      <button onClick={() => { if (!portalProjectId && projects.length) setPortalProjectId(projects[0].id); setMode("portal"); }} style={{ padding: "7px 16px", borderRadius: 24, border: "none", background: mode === "portal" ? FOREST : "transparent", color: mode === "portal" ? "#fff" : INK, fontSize: 12.5, fontWeight: 700 }}>Client Portal</button>
    </div>
  );

  if (!loaded) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: PARCHMENT, color: INK, fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  // ============================================================
  // ================= CLIENT PORTAL MODE ======================
  // ============================================================
  if (mode === "portal") {
    if (!portalProject || !portalProject.name) {
      return (
        <Shell title="Client Portal" subtitle="No project yet" right={ModeSwitch} screen={screen} setScreen={setScreen} onNewProject={startNewProject} onNavClick={role === "staff" ? () => setMode("team") : undefined}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 30, border: "1px solid #eae6db", textAlign: "center" }}>
            Create a project in Team View first, and it'll appear here for your client.
          </div>
        </Shell>
      );
    }
    const NAV = [
      { key: "dashboard", label: "Dashboard", icon: LayoutGrid }, { key: "timeline", label: "Timeline", icon: Clock },
      { key: "photos", label: "Photos", icon: ImageIcon },
      { key: "visuals", label: "Design Visuals", icon: Boxes },
      { key: "variations", label: "Change Orders", icon: FileSignature },
      { key: "payments", label: "Payments", icon: CreditCard }, { key: "documents", label: "Documents", icon: FileText },
      { key: "messages", label: "Messages", icon: MessageSquare }, { key: "warranty", label: "Warranty & Support", icon: ShieldCheck },
      { key: "review", label: "Review & Refer", icon: Star },
    ];
    const pendingVariations = (portalProject.variations || []).filter(v => v.status === "Pending");
    const stagePayments = PAYMENT_STAGES.map((label, i) => ({ label, amount: portalTotals.total / 4, paid: !!(portalProject.payments || {})[i], idx: i }));

    return (
      <div className="portal-outer" style={{ display: "flex", minHeight: "100vh", background: PARCHMENT, fontFamily: "'Inter', system-ui, sans-serif", color: INK }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
          * { box-sizing: border-box; } button { font-family: inherit; cursor: pointer; }
          .nav-item:hover { background: rgba(255,255,255,0.08); }
          .responsive-flex { display: flex; gap: 20px; }
          @media (max-width: 780px) {
            .portal-outer { flex-direction: column; }
            .portal-sidebar { width: 100% !important; }
            .responsive-flex { flex-direction: column; }
            .responsive-flex > * { width: 100% !important; min-width: 0 !important; flex: none !important; }
          }
        `}</style>
        {!portalProject.portalWelcomed && <PortalWelcomeModal project={portalProject} rewardAmount={settings.referralRewardAmount} onDismiss={() => { dismissPortalWelcome(); safeOpenDoc(() => generateProposalDoc(portalProject, portalTotals, portfolioPhotos)); }} />}
        <div className="portal-sidebar" style={{ width: 210, background: FOREST_DEEP, color: "#fff", padding: "22px 16px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 26 }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", border: `1.5px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, fontFamily: "'Playfair Display', serif", fontWeight: 700 }}>N</div>
            <div><div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 13 }}>NORTHSTONE</div><div style={{ fontSize: 8, letterSpacing: 1.5, color: GOLD }}>CLIENT PORTAL</div></div>
          </div>
          {projects.length > 1 && (
            <select value={portalProjectId || ""} onChange={e => setPortalProjectId(e.target.value)} style={{ width: "100%", marginBottom: 16, padding: 8, borderRadius: 6, fontSize: 11.5, background: "#16352a", color: "#fff", border: "1px solid rgba(255,255,255,0.15)" }}>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          {NAV.map(n => (
            <div key={n.key} className="nav-item" onClick={() => setPortalTab(n.key)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 7, fontSize: 13, marginBottom: 4, cursor: "pointer", background: portalTab === n.key ? "rgba(200,149,47,0.18)" : "transparent", color: portalTab === n.key ? GOLD : "rgba(255,255,255,0.82)", fontWeight: portalTab === n.key ? 700 : 400 }}>
              <n.icon size={15} /> {n.label}
              {n.key === "variations" && pendingVariations.length > 0 && <span style={{ marginLeft: "auto", background: "#c0392b", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "1px 6px" }}>{pendingVariations.length}</span>}
            </div>
          ))}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {profile?.full_name || profile?.email}
            </div>
            <div className="nav-item" onClick={signOut} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 7, fontSize: 13, cursor: "pointer", color: "rgba(255,255,255,0.82)" }}>
              <LogOut size={15} /> Sign out
            </div>
          </div>
        </div>

        <div style={{ flex: 1, padding: "26px 34px", maxWidth: 1100 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700 }}>Good morning, {portalProject.client?.split(" ").slice(-2).join(" ") || "there"}</div>
              <div style={{ fontSize: 13, color: "#6b6a63" }}>{portalProject.name} · {portalProject.ref}</div>
            </div>
            {ModeSwitch}
          </div>

          {portalTab === "dashboard" && (
            <div className="responsive-flex">
              <div style={{ flex: 1.4 }}>
                <div style={{ background: "linear-gradient(135deg,#1c3a2c,#0d2117)", borderRadius: 14, height: 200, marginBottom: 18, display: "flex", alignItems: "flex-end", padding: 20 }}>
                  <div style={{ color: "#fff" }}>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700 }}>{portalProject.name}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}><MapPin size={12}/> {portalProject.address || "Site address on file"}</div>
                  </div>
                </div>
                <div style={{ background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #eae6db" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>Project Progress</div>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: FOREST }}>{overallProgress}%</div>
                  </div>
                  {TIMELINE_STAGES.map(t => {
                    const pct = (portalProject.timeline || {})[t.key] || 0;
                    return (
                      <div key={t.key} style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}><span>{t.label}</span><span style={{ color: "#8a887f" }}>{pct}%</span></div>
                        <div style={{ height: 6, background: "#eee", borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "#1f5b3f" : FOREST }} /></div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ background: "#fff", borderRadius: 12, padding: 18, border: "1px solid #eae6db", marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Latest Photos</div>
                  {(portalProject.updates || []).filter(u => u.photo).length === 0 ? (
                    <div style={{ fontSize: 12, color: "#9a978c" }}>No site photos posted yet.</div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {(portalProject.updates || []).filter(u => u.photo).slice(0, 4).map(u => (
                        <img key={u.id} src={u.photo} alt={u.caption || "Site photo"} style={{ width: "100%", height: 70, objectFit: "cover", borderRadius: 8 }} />
                      ))}
                    </div>
                  )}
                  <div onClick={() => setPortalTab("photos")} style={{ fontSize: 12, color: GOLD, marginTop: 10, cursor: "pointer" }}>View all photos →</div>
                </div>
                <div style={{ background: "#fff", borderRadius: 12, padding: 18, border: "1px solid #eae6db", marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Investment</div>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: FOREST }}>{gbp(portalTotals.total)}</div>
                  <div style={{ fontSize: 12, color: "#8a887f" }}>{stagePayments.filter(s => s.paid).length}/4 payments made</div>
                  <div onClick={() => setPortalTab("payments")} style={{ fontSize: 12, color: GOLD, marginTop: 8, cursor: "pointer" }}>View payment schedule →</div>
                </div>
                {(() => {
                  const next = sortedEvents(events.filter(e => e.projectId === portalProject.id && e.date >= todayStr()))[0];
                  return next ? (
                    <div style={{ background: "#fff", borderRadius: 12, padding: 18, border: `1.5px solid ${GOLD}`, marginBottom: 16 }}>
                      <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Upcoming Appointment</div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{next.title}</div>
                      <div style={{ fontSize: 12, color: "#8a887f", marginTop: 2 }}>{next.type} · {next.date}{next.time ? ` at ${next.time}` : ""}</div>
                    </div>
                  ) : null;
                })()}
                <div style={{ background: FOREST, borderRadius: 12, padding: 18, color: "#fff" }}>
                  <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.7)", marginBottom: 8 }}>Your Project Manager</div>
                  {(() => {
                    const assignedIds = portalProject.assignedTeam || [];
                    const assignedMembers = team.filter(m => assignedIds.includes(m.id));
                    const pm = assignedMembers.find(m => m.role === "Project Manager") || assignedMembers[0];
                    return <div style={{ fontWeight: 700, marginBottom: 4 }}>{pm ? pm.name : "Ryan Jennings"}</div>;
                  })()}
                  <div style={{ display: "flex", gap: 14, fontSize: 12, marginTop: 6 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Phone size={13}/> Call</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Mail size={13}/> Email</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {portalTab === "photos" && (
            <div>
              {(portalProject.updates || []).filter(u => u.photo).length === 0 ? (
                <div style={{ background: "#fff", borderRadius: 12, padding: 30, border: "1px solid #eae6db", textAlign: "center", fontSize: 13, color: "#9a978c" }}>No site photos posted yet — your project team will share updates here as work progresses.</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
                  {(portalProject.updates || []).filter(u => u.photo).map(u => (
                    <div key={u.id} style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: "1px solid #eae6db" }}>
                      <PhotoImg path={u.photo} alt={u.caption || "Site photo"} style={{ width: "100%", height: 160, objectFit: "cover" }} />
                      <div style={{ padding: 12 }}>
                        {u.stage && <div style={{ fontSize: 10.5, color: GOLD, fontWeight: 700 }}>{u.stage}</div>}
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{u.caption || "Site update"}</div>
                        <div style={{ fontSize: 11, color: "#8a887f" }}>{u.date}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {portalTab === "visuals" && (
            <div style={{ maxWidth: 900 }}>
              {["plans2d", "renders3d"].map(kind => {
                const label = kind === "plans2d" ? "2D Plans" : "3D Renders";
                const items = (portalProject.designVisuals || {})[kind] || [];
                return (
                  <div key={kind} style={{ marginBottom: 28 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      {kind === "plans2d" ? <Layers size={16} color={FOREST} /> : <Boxes size={16} color={FOREST} />}
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{label}</div>
                    </div>
                    {items.length === 0 ? (
                      <div style={{ background: "#fff", borderRadius: 12, padding: 26, border: "1px solid #eae6db", textAlign: "center", fontSize: 12.5, color: "#9a978c" }}>
                        No {label.toLowerCase()} uploaded yet — your project team will share these here.
                      </div>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                        {items.map(v => (
                          <div key={v.id} onClick={() => setVisualLightbox({ ...v, label })} style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: "1px solid #eae6db", cursor: "pointer" }}>
                            <PhotoImg path={v.path} alt={v.caption || label} style={{ width: "100%", height: 150, objectFit: "cover" }} />
                            {v.caption && <div style={{ padding: 10, fontSize: 12, fontWeight: 600 }}>{v.caption}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <div style={{ fontSize: 11.5, color: "#9a978c", background: "#fff", border: "1px solid #eae6db", borderRadius: 10, padding: "12px 14px" }}>
                An interactive 3D walkthrough is coming to the portal in a future update — for now your team will share rendered views here as the design develops.
              </div>
            </div>
          )}

          {visualLightbox && (
            <div onClick={() => setVisualLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(10,20,15,0.88)", zIndex: 9999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out" }}>
              <div onClick={e => e.stopPropagation()} style={{ maxWidth: "min(90vw, 1000px)", maxHeight: "85vh", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <PhotoImg path={visualLightbox.path} alt={visualLightbox.caption || visualLightbox.label} style={{ maxWidth: "100%", maxHeight: "78vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 10px 40px rgba(0,0,0,0.4)" }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginTop: 14 }}>
                  <div style={{ color: "#fff" }}>
                    <div style={{ fontSize: 10.5, color: GOLD, letterSpacing: 0.5, textTransform: "uppercase" }}>{visualLightbox.label}</div>
                    {visualLightbox.caption && <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 2 }}>{visualLightbox.caption}</div>}
                  </div>
                  <button onClick={() => setVisualLightbox(null)} style={{ padding: "8px 16px", background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 8, fontSize: 12.5 }}>Close</button>
                </div>
              </div>
            </div>
          )}

          {portalTab === "variations" && (
            <div style={{ maxWidth: 600 }}>
              {(portalProject.variations || []).length === 0 && (
                <div style={{ background: "#fff", borderRadius: 12, padding: 30, border: "1px solid #eae6db", textAlign: "center", fontSize: 13, color: "#9a978c" }}>No change orders yet — anything outside the original scope will appear here for your approval.</div>
              )}
              {pendingVariations.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "#a06a12" }}>Awaiting Your Approval</div>
                  {pendingVariations.map(v => (
                    <div key={v.id} style={{ background: "#fff", borderRadius: 12, padding: 18, border: `1.5px solid ${GOLD}`, marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 14.5, fontWeight: 700 }}>{v.title}</div>
                          {v.description && <div style={{ fontSize: 12.5, color: "#555", marginTop: 4 }}>{v.description}</div>}
                          <div style={{ fontSize: 11, color: "#9a978c", marginTop: 4 }}>Requested {v.date}</div>
                        </div>
                        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, color: FOREST, flexShrink: 0 }}>{gbp(v.amount)}</div>
                      </div>
                      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                        <button onClick={() => respondVariation(portalProject.id, v.id, "Approved")} style={{ flex: 1, padding: 10, background: FOREST, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 700 }}>Approve</button>
                        <button onClick={() => respondVariation(portalProject.id, v.id, "Rejected")} style={{ flex: 1, padding: 10, background: "#fff", color: "#c0392b", border: "1px solid #c0392b", borderRadius: 7, fontSize: 12.5, fontWeight: 700 }}>Decline</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {(portalProject.variations || []).filter(v => v.status !== "Pending").length > 0 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "#8a887f" }}>History</div>
                  {(portalProject.variations || []).filter(v => v.status !== "Pending").map(v => (
                    <div key={v.id} style={{ background: "#fff", borderRadius: 10, padding: 14, border: "1px solid #eae6db", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{v.title}</div>
                        <div style={{ fontSize: 11, color: "#9a978c" }}>{v.respondedAt || v.date}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{gbp(v.amount)}</div>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: v.status === "Approved" ? "#1f5b3f" : "#c0392b" }}>{v.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {portalTab === "timeline" && (
            <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "1px solid #eae6db", maxWidth: 600 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 18 }}>Project Timeline</div>
              {TIMELINE_STAGES.map((t, i) => {
                const pct = (portalProject.timeline || {})[t.key] || 0;
                return (
                  <div key={t.key} style={{ display: "flex", gap: 14, marginBottom: 18 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      {pct === 100 ? <CheckCircle2 size={20} color="#1f5b3f" /> : <Circle size={20} color={pct > 0 ? GOLD : "#ccc"} />}
                      {i < TIMELINE_STAGES.length - 1 && <div style={{ width: 2, flex: 1, background: "#e5e2d8", marginTop: 4 }} />}
                    </div>
                    <div style={{ paddingBottom: 8 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t.label}</div>
                      <div style={{ fontSize: 12, color: "#8a887f" }}>{pct === 100 ? "Completed" : pct > 0 ? `${pct}% in progress` : "Not started"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {portalTab === "payments" && (
            <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "1px solid #eae6db", maxWidth: 600 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Payment Schedule</div>
              <div style={{ fontSize: 12.5, color: "#8a887f", marginBottom: 18 }}>Total investment: <b style={{ color: INK }}>{gbp(portalTotals.total)}</b></div>
              {stagePayments.map(s => (
                <div key={s.idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f3f1e9" }}>
                  <div><div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.label}</div><div style={{ fontSize: 12, color: s.paid ? "#1f5b3f" : "#8a887f" }}>{s.paid ? "Paid" : "Outstanding"}</div></div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{gbp(s.amount)}</div>
                    {!s.paid && <button onClick={() => markPaid(s.idx)} style={{ padding: "6px 14px", background: FOREST, color: "#fff", border: "none", borderRadius: 6, fontSize: 11.5, fontWeight: 700 }}>Pay Now</button>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {portalTab === "documents" && (
            <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "1px solid #eae6db", maxWidth: 600 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Documents</div>
              <div style={{ fontSize: 12, color: "#8a887f", marginBottom: 16 }}>Generated from your live project — opens as a formatted page you can print or save as PDF.</div>
              {[
                { name: "Proposal Document", action: () => safeOpenDoc(() => generateProposalDoc(portalProject, portalTotals, portfolioPhotos)) },
                { name: "Terms & Conditions", action: () => safeOpenDoc(() => generateTermsDoc(portalProject)) },
                { name: "Material Schedule", action: () => safeOpenDoc(() => generateMaterialScheduleDoc(portalProject)) },
                { name: "Payment Schedule", action: () => safeOpenDoc(() => generatePaymentScheduleDoc(portalProject, portalTotals)) },
                { name: "Warranty Certificate", action: () => safeOpenDoc(() => generateWarrantyDoc(portalProject)) },
              ].map(doc => (
                <div key={doc.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f3f1e9" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}><FileText size={16} color={GOLD} /><div style={{ fontSize: 13 }}>{doc.name}</div></div>
                  <Download size={16} style={{ cursor: "pointer", color: "#8a887f" }} onClick={doc.action} />
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}><FileText size={16} color="#c8c4b6" /><div style={{ fontSize: 13, color: "#9a978c" }}>Project Drawings</div></div>
                <span style={{ fontSize: 11, color: "#9a978c" }}>Ask your Project Manager</span>
              </div>
            </div>
          )}

          {portalTab === "messages" && (
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #eae6db", maxWidth: 600, display: "flex", flexDirection: "column", height: 460 }}>
              <div style={{ padding: 16, borderBottom: "1px solid #eae6db", fontSize: 14, fontWeight: 700 }}>Messages with Northstone Team</div>
              <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
                {(portalProject.messages || []).length === 0 && <div style={{ fontSize: 12.5, color: "#9a978c" }}>No messages yet — say hello!</div>}
                {(portalProject.messages || []).map(m => (
                  <div key={m.id} style={{ display: "flex", justifyContent: m.from === "client" ? "flex-end" : "flex-start", marginBottom: 10 }}>
                    <div style={{ maxWidth: "70%", background: m.from === "client" ? FOREST : "#f1efe7", color: m.from === "client" ? "#fff" : INK, padding: "9px 12px", borderRadius: 12, fontSize: 13 }}>{m.text}<div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>{m.when}</div></div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, padding: 14, borderTop: "1px solid #eae6db" }}>
                <input value={portalDraft} onChange={e => setPortalDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && sendPortalMessage()} placeholder="Type a message…" style={{ flex: 1, padding: "9px 12px", border: "1px solid #ddd8ca", borderRadius: 8, fontSize: 13 }} />
                <button onClick={sendPortalMessage} style={{ background: FOREST, color: "#fff", border: "none", borderRadius: 8, padding: "0 14px" }}><Send size={15} /></button>
              </div>
            </div>
          )}

          {portalTab === "warranty" && (
            <div style={{ maxWidth: 600 }}>
              <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "1px solid #eae6db", marginBottom: 18 }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Warranty & Support</div>
                <div style={{ fontSize: 13, color: "#555", marginBottom: 18, lineHeight: 1.6 }}>Your project is covered by Northstone's {portalProject.proposal?.warrantyYears || 5}-year workmanship guarantee from the date of handover.</div>
                <div style={{ display: "flex", gap: 12 }}>
                  <button onClick={() => safeOpenDoc(() => generateWarrantyDoc(portalProject))} style={{ flex: 1, padding: 12, border: "1px solid #ddd8ca", borderRadius: 8, background: "#fff", fontSize: 13 }}>Download Warranty Certificate</button>
                  <button onClick={() => setShowTicketForm(s => !s)} style={{ flex: 1, padding: 12, background: FOREST, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700 }}>Raise a Support Request</button>
                </div>
              </div>

              {showTicketForm && (
                <div style={{ background: "#fff", borderRadius: 12, padding: 20, border: `1.5px solid ${GOLD}`, marginBottom: 18 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>New Support Request</div>
                  <Field label="What's it about?"><input value={ticketForm.subject} onChange={e => setTicketForm({ ...ticketForm, subject: e.target.value })} placeholder="e.g. Loose paving slab" style={{ ...inputStyle, width: "100%" }} /></Field>
                  <Field label="Details"><textarea value={ticketForm.description} onChange={e => setTicketForm({ ...ticketForm, description: e.target.value })} style={{ ...inputStyle, width: "100%", minHeight: 70 }} placeholder="Tell us what's happening…" /></Field>
                  <button onClick={() => {
                    if (!ticketForm.subject.trim()) { flash("Add a subject first"); return; }
                    submitSupportTicket(ticketForm.subject.trim(), ticketForm.description.trim());
                    setTicketForm({ subject: "", description: "" });
                    setShowTicketForm(false);
                    flash("Support request sent — your team will be in touch");
                  }} style={{ padding: "10px 18px", background: FOREST, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13 }}>Submit Request</button>
                </div>
              )}

              {(portalProject.supportTickets || []).length > 0 && (
                <div style={{ background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #eae6db" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Your Requests</div>
                  {portalProject.supportTickets.map(t => (
                    <div key={t.id} style={{ padding: "10px 0", borderBottom: "1px solid #f1efe7" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t.subject}</div>
                          {t.description && <div style={{ fontSize: 12.5, color: "#555", marginTop: 3 }}>{t.description}</div>}
                          <div style={{ fontSize: 11, color: "#9a978c", marginTop: 3 }}>{t.createdAt}</div>
                        </div>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, flexShrink: 0, background: t.status === "Resolved" ? "#e7f0ea" : "#fbf1de", color: t.status === "Resolved" ? "#1f5b3f" : "#a06a12" }}>{t.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {portalTab === "review" && (
            <div style={{ maxWidth: 600 }}>
              <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "1px solid #eae6db", marginBottom: 18 }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Leave a Review</div>
                {portalProject.status !== "Completed" ? (
                  <div style={{ fontSize: 13, color: "#8a887f" }}>You'll be able to leave a review once your project is marked complete — we'd love to hear from you then!</div>
                ) : portalProject.review ? (
                  <div>
                    <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                      {[1, 2, 3, 4, 5].map(n => <Star key={n} size={20} fill={n <= portalProject.review.rating ? GOLD : "none"} color={GOLD} />)}
                    </div>
                    <div style={{ fontSize: 13, color: "#555" }}>{portalProject.review.text}</div>
                    <div style={{ fontSize: 11, color: "#9a978c", marginTop: 8 }}>Submitted {portalProject.review.submittedAt} · Thank you!</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 13, color: "#555", marginBottom: 14 }}>How was your experience with Northstone Design & Build?</div>
                    <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <Star key={n} size={28} fill={n <= reviewForm.rating ? GOLD : "none"} color={GOLD} style={{ cursor: "pointer" }} onClick={() => setReviewForm({ ...reviewForm, rating: n })} />
                      ))}
                    </div>
                    <textarea value={reviewForm.text} onChange={e => setReviewForm({ ...reviewForm, text: e.target.value })} placeholder="Tell us how it went…" style={{ ...inputStyle, width: "100%", minHeight: 80, marginBottom: 12 }} />
                    <button onClick={() => submitReview(portalProject.id, reviewForm.rating, reviewForm.text)} style={{ padding: "10px 18px", background: FOREST, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13 }}>Submit Review</button>
                  </div>
                )}
              </div>

              <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "1px solid #eae6db" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Share2 size={16} color={GOLD} />
                  <div style={{ fontSize: 15, fontWeight: 700 }}>Refer a Friend, Earn {gbp(settings.referralRewardAmount)}</div>
                </div>
                <div style={{ fontSize: 13, color: "#555", marginBottom: 16 }}>Know someone who'd love their outdoor space transformed? Pass on your code — when they sign up and mention it, you get {gbp(settings.referralRewardAmount)} cash.</div>

                {portalProject.referralCode ? (
                  <div style={{ background: FOREST, borderRadius: 10, padding: "16px 18px", marginBottom: 18, textAlign: "center" }}>
                    <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.65)", textTransform: "uppercase", letterSpacing: 1 }}>Your Referral Code</div>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 700, color: GOLD, letterSpacing: 1, marginTop: 4, marginBottom: 14 }}>{portalProject.referralCode}</div>
                    {(() => {
                      const msg = `I've been really happy with Northstone Design & Build! Use my code ${portalProject.referralCode} when you get in touch and I'll earn a referral reward. Call 07503 677201 or visit northstonedesignandbuild.com`;
                      const waLink = `https://wa.me/?text=${encodeURIComponent(msg)}`;
                      const smsLink = `sms:?body=${encodeURIComponent(msg)}`;
                      const mailLink = `mailto:?subject=${encodeURIComponent("Check out Northstone Design & Build")}&body=${encodeURIComponent(msg)}`;
                      const doShare = async () => {
                        try {
                          if (navigator.share) { await navigator.share({ title: "Northstone Design & Build", text: msg }); return; }
                          throw new Error("no share api");
                        } catch (e) {
                          try { await navigator.clipboard.writeText(msg); flash("Message copied — paste it anywhere to share"); }
                          catch (e2) { flash("Couldn't share automatically — copy your code manually: " + portalProject.referralCode); }
                        }
                      };
                      return (
                        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                          <button onClick={doShare} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: GOLD, color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 700 }}><Share2 size={13}/> Share</button>
                          <a href={waLink} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 7, fontSize: 12, textDecoration: "none" }}>WhatsApp</a>
                          <a href={smsLink} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 7, fontSize: 12, textDecoration: "none" }}>Text</a>
                          <a href={mailLink} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 7, fontSize: 12, textDecoration: "none" }}><Mail size={13}/> Email</a>
                          <button onClick={async () => { try { await navigator.clipboard.writeText(portalProject.referralCode); flash("Code copied!"); } catch (e) { flash("Your code: " + portalProject.referralCode); } }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 7, fontSize: 12 }}><Copy size={13}/> Copy Code</button>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "#9a978c", marginBottom: 16 }}>Your unique referral code will appear here once your project is signed.</div>
                )}

                <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                  <input style={{ ...inputStyle, flex: 1 }} value={referralForm.name} onChange={e => setReferralForm({ ...referralForm, name: e.target.value })} placeholder="Their name" />
                  <input style={{ ...inputStyle, flex: 1 }} value={referralForm.phone} onChange={e => setReferralForm({ ...referralForm, phone: e.target.value })} placeholder="Phone (optional)" />
                </div>
                <input style={{ ...inputStyle, width: "100%", marginBottom: 10 }} value={referralForm.email} onChange={e => setReferralForm({ ...referralForm, email: e.target.value })} placeholder="Email (optional)" />
                <textarea style={{ ...inputStyle, width: "100%", minHeight: 56, marginBottom: 12 }} value={referralForm.notes} onChange={e => setReferralForm({ ...referralForm, notes: e.target.value })} placeholder="Anything we should know?" />
                <button onClick={() => {
                  if (!referralForm.name.trim()) { flash("Add their name first"); return; }
                  submitReferral(portalProject.id, referralForm);
                  setReferralForm({ name: "", phone: "", email: "", notes: "" });
                  flash("Thank you! We'll be in touch with them soon.");
                }} style={{ padding: "10px 18px", background: GOLD, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13 }}>Send Referral</button>

                {(portalProject.referrals || []).length > 0 && (
                  <div style={{ marginTop: 18, borderTop: "1px solid #f3f1e9", paddingTop: 14 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>
                      Your Referrals · Earned {gbp((portalProject.referrals || []).filter(r => r.status === "Rewarded").reduce((s, r) => s + (r.rewardAmount || 0), 0))}
                    </div>
                    {portalProject.referrals.map(r => (
                      <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
                        <div style={{ fontSize: 12.5 }}>{r.name}</div>
                        {r.status === "Rewarded" ? (
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#1f5b3f" }}>{gbp(r.rewardAmount)} earned</span>
                        ) : (
                          <span style={{ fontSize: 11, color: "#a06a12" }}>Pending</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {toast && <Toast msg={toast} />}
        <DocPreviewModal doc={docPreview} onClose={() => setDocPreview(null)} />
      </div>
    );
  }

  // ============================================================
  // ============================================================
  // ================= TEAM MODE: JOB PRICING TOOL ================
  // ============================================================
  if (screen === "pricingTool") {
    return <PricingToolScreen ModeSwitch={ModeSwitch} onBack={() => setScreen("dashboard")} />;
  }

  // ============================================================
  // ================= TEAM MODE: DASHBOARD =====================
  // ============================================================
  if (screen === "dashboard") {
    const jobsOnSite = projects.filter(p => p.status === "In Construction").length;
    const surveysBooked = projects.filter(p => p.status === "Survey Booked").length;
    const proposalsSent = projects.filter(p => p.status === "Proposal Sent").length;
    const completed = projects.filter(p => p.status === "Completed").length;
    const newLeadsCount = leads.filter(l => l.status === "New" || l.status === "Contacted").length;
    const revenue = projects.reduce((s, p) => s + (["Signed", "In Construction", "Completed"].includes(p.status) ? totalsFor(p).total : 0), 0);
    const avgProgress = (p) => Math.round(Object.values(p.timeline || {}).reduce((s, v) => s + v, 0) / TIMELINE_STAGES.length);

    const attentionLeads = leads.filter(l => l.status === "New" || l.status === "Contacted")
      .map(l => ({ key: `lead-${l.id}`, kind: "lead", title: l.name, subtitle: `${l.source} · New Lead`, onClick: () => setScreen("leads") }));
    const attentionMessages = projects.filter(p => (p.messages || []).length > 0 && p.messages[p.messages.length - 1].from === "client")
      .map(p => ({ key: `msg-${p.id}`, kind: "message", title: p.client, subtitle: `${p.name} · New message`, onClick: () => { setDraft(p); setScreen("construction"); } }));
    const attentionVariations = projects.flatMap(p => (p.variations || []).filter(v => v.status === "Pending")
      .map(v => ({ key: `var-${v.id}`, kind: "variation", title: p.client, subtitle: `${v.title} · Awaiting client response`, onClick: () => { setDraft(p); setScreen("construction"); } })));
    const attentionTickets = projects.flatMap(p => (p.supportTickets || []).filter(t => t.status === "Open")
      .map(t => ({ key: `ticket-${t.id}`, kind: "ticket", title: p.client, subtitle: `${t.subject} · Support request`, onClick: () => { setDraft(p); setScreen("construction"); } })));
    const attentionItems = [...attentionMessages, ...attentionTickets, ...attentionLeads, ...attentionVariations];
    const attentionIcon = { lead: Users, message: MessageSquare, variation: FileSignature, ticket: ShieldCheck };
    const attentionColor = { lead: "#e07a3f", message: "#3a5a8a", variation: "#a06a12", ticket: "#c0392b" };

    return (
      <Shell title="Dashboard" subtitle="Your complete overview. Everything in one place." right={ModeSwitch} screen={screen} setScreen={setScreen} onNewProject={startNewProject}>
        <div style={{ display: "flex", gap: 14, marginBottom: 22, flexWrap: "wrap" }}>
          <StatCard label="New Leads" value={newLeadsCount} tint="#e07a3f" />
          <StatCard label="Surveys Booked" value={surveysBooked} />
          <StatCard label="Proposals Sent" value={proposalsSent} />
          <StatCard label="Jobs on Site" value={jobsOnSite} />
          <StatCard label="Completed" value={completed} tint="#7fbf9e" />
          <StatCard label="Revenue Won" value={gbp(revenue)} tint="#7fbf9e" />
        </div>

        <div style={{ background: "#fff", borderRadius: 12, padding: 20, marginBottom: 20, border: "1px solid #eae6db" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Today's Schedule</div>
            <div onClick={() => setScreen("calendar")} style={{ fontSize: 12.5, color: GOLD, cursor: "pointer" }}>Full calendar →</div>
          </div>
          {sortedEvents(events.filter(e => e.date === todayStr())).length === 0 && <div style={{ fontSize: 12.5, color: "#9a978c" }}>Nothing booked for today.</div>}
          {sortedEvents(events.filter(e => e.date === todayStr())).map(ev => (
            <div key={ev.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f1efe7" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: EVENT_TYPE_COLOR[ev.type] || GOLD, flexShrink: 0 }} />
              <div style={{ fontSize: 12, color: "#8a887f", width: 56, flexShrink: 0 }}>{ev.time || "—"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{ev.title}</div>
                <div style={{ fontSize: 11, color: "#9a978c" }}>{ev.type}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: "#fff", borderRadius: 12, padding: 20, marginBottom: 20, border: `1.5px solid ${attentionItems.length > 0 ? "#e07a3f" : "#eae6db"}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              Needs Your Attention
              {attentionItems.length > 0 && <span style={{ background: "#c0392b", color: "#fff", fontSize: 11, fontWeight: 700, borderRadius: 10, padding: "1px 8px" }}>{attentionItems.length}</span>}
            </div>
          </div>
          {attentionItems.length === 0 && <div style={{ fontSize: 12.5, color: "#9a978c" }}>You're all caught up — nothing waiting on you.</div>}
          {attentionItems.map(item => {
            const Icon = attentionIcon[item.kind];
            return (
              <div key={item.key} onClick={item.onClick} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f1efe7", cursor: "pointer" }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: `${attentionColor[item.kind]}1a`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={14} color={attentionColor[item.kind]} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{item.title}</div>
                  <div style={{ fontSize: 11.5, color: "#9a978c" }}>{item.subtitle}</div>
                </div>
                <ChevronRight size={16} color="#c8c4b6" />
              </div>
            );
          })}
        </div>

        <div style={{ background: "#fff", borderRadius: 12, padding: 20, marginBottom: 20, border: "1px solid #eae6db" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Recent Projects</div>
            {projects.length > 0 && (
              <div style={{ position: "relative", flex: "0 1 220px" }}>
                <Search size={14} color="#9a978c" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
                <input value={projectSearch} onChange={e => setProjectSearch(e.target.value)} placeholder="Search projects…" style={{ ...inputStyle, width: "100%", paddingLeft: 30 }} />
              </div>
            )}
          </div>
          {projects.length === 0 && <div style={{ fontSize: 13, color: "#9a978c", padding: "20px 0" }}>No projects yet — create your first one below.</div>}
          {projects.length > 0 && (() => {
            const q = projectSearch.trim().toLowerCase();
            const filtered = q ? projects.filter(p => [p.name, p.client, p.ref, p.address].some(v => (v || "").toLowerCase().includes(q))) : projects;
            if (filtered.length === 0) return <div style={{ fontSize: 13, color: "#9a978c", padding: "20px 0" }}>No projects match "{projectSearch}".</div>;
            return filtered.map(p => {
            const t = totalsFor(p);
            const onSite = ["In Construction", "Completed"].includes(p.status);
            return (
              <div key={p.id} className="proj-row" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 6px", borderRadius: 8, borderBottom: "1px solid #f1efe7", cursor: "pointer", flexWrap: "wrap" }} onClick={() => openProject(p)}>
                <div style={{ width: 54, height: 44, borderRadius: 7, background: "linear-gradient(135deg,#1c3a2c,#0d2117)", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 11, color: "#9a978c" }}>{p.ref}</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                    <StatusPill status={p.status} />
                    {onSite && <span style={{ fontSize: 11, color: "#8a887f" }}>{avgProgress(p)}% complete</span>}
                  </div>
                </div>
                <div style={{ textAlign: "right", width: 90 }}><div style={{ fontSize: 13.5, fontWeight: 700 }}>{gbp(t.total)}</div></div>
                <Pencil size={15} color="#8a887f" style={{ cursor: "pointer", flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); openEditDetails(p); }} />
                {["Signed", "In Construction", "Completed"].includes(p.status) && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={(e) => { e.stopPropagation(); setDraft(p); setScreen("construction"); }} style={{ padding: "7px 12px", border: `1px solid ${GOLD}`, background: "#fff", color: "#a06a12", borderRadius: 7, fontSize: 11.5, fontWeight: 700 }}>Update Progress</button>
                    <button onClick={(e) => { e.stopPropagation(); viewPortal(p); }} style={{ padding: "7px 12px", border: `1px solid ${FOREST}`, background: "#fff", color: FOREST, borderRadius: 7, fontSize: 11.5, fontWeight: 700 }}>View Portal</button>
                  </div>
                )}
                {["Survey Booked", "Proposal Sent"].includes(p.status) && (
                  <button onClick={(e) => { e.stopPropagation(); setMarkLostFor(p); }} style={{ padding: "7px 12px", border: "1px solid #ddd8ca", background: "#fff", color: "#8a887f", borderRadius: 7, fontSize: 11.5, fontWeight: 700 }}>Mark Lost</button>
                )}
                {p.status === "Lost" && (
                  <button onClick={(e) => { e.stopPropagation(); reactivateProject(p); }} style={{ padding: "7px 12px", border: `1px solid ${FOREST}`, background: "#fff", color: FOREST, borderRadius: 7, fontSize: 11.5, fontWeight: 700 }}>Reactivate</button>
                )}
              </div>
            );
          });
          })()}
        </div>
        {toast && <Toast msg={toast} />}
        <DocPreviewModal doc={docPreview} onClose={() => setDocPreview(null)} />
        {editDetailsFor && <EditProjectDetailsModal project={editDetailsFor} onSave={saveProjectDetails} onClose={() => setEditDetailsFor(null)} />}
        {markLostFor && <MarkLostModal project={markLostFor} onConfirm={(reason, notes) => markProjectLost(markLostFor, reason, notes)} onClose={() => setMarkLostFor(null)} />}
      </Shell>
    );
  }

  // ============================================================
  // ================= TEAM MODE: SETTINGS ========================
  // ============================================================
  if (screen === "settings") {
    return (
      <Shell title="Business Settings" subtitle="Pricing rules and rewards that apply across the whole business." right={ModeSwitch} screen={screen} setScreen={setScreen} onNewProject={startNewProject}>
        <button className="top-btn" onClick={() => setScreen("dashboard")} style={{ marginBottom: 16, padding: "9px 14px", border: "1px solid #ddd8ca", borderRadius: 8, background: "#fff", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}><ArrowLeft size={14}/> Dashboard</button>

        <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "1px solid #eae6db", maxWidth: 480 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Referral Reward</div>
          <div style={{ fontSize: 12, color: "#8a887f", marginBottom: 10 }}>Cash reward credited to a client when someone they refer signs a project. Applies to every referral going forward.</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 22 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: FOREST }}>£</span>
            <input type="number" min="0" value={settings.referralRewardAmount} onChange={e => setSettings({ ...settings, referralRewardAmount: Number(e.target.value) || 0 })} style={{ ...inputStyle, width: 120, fontSize: 18, fontWeight: 700 }} />
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>VAT Rate</div>
          <div style={{ fontSize: 12, color: "#8a887f", marginBottom: 10 }}>Applied to every estimate and proposal total.</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <input type="number" min="0" max="100" value={settings.vatPct} onChange={e => setSettings({ ...settings, vatPct: Number(e.target.value) || 0 })} style={{ ...inputStyle, width: 80, fontSize: 18, fontWeight: 700 }} />
            <span style={{ fontSize: 20, fontWeight: 700, color: FOREST }}>%</span>
          </div>
        </div>

        <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "1px solid #eae6db", maxWidth: 480, marginTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Portfolio Photos</div>
          <div style={{ fontSize: 12, color: "#8a887f", marginBottom: 16, lineHeight: 1.5 }}>Upload photos from completed jobs once, and they'll automatically populate the Design Inspiration section of every new proposal you send.</div>
          <label style={{ display: "block", width: "100%", padding: 12, background: FOREST, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, textAlign: "center", cursor: "pointer", marginBottom: 16 }}>
            Upload Photos
            <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => addPortfolioPhotos(e.target.files)} />
          </label>
          {portfolioPhotos.length === 0 ? (
            <div style={{ fontSize: 12, color: "#b5b2a5", textAlign: "center", padding: "18px 0" }}>No portfolio photos yet.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {portfolioPhotos.map(p => (
                <div key={p.id} style={{ border: "1px solid #eae6db", borderRadius: 8, overflow: "hidden", background: "#fafaf7" }}>
                  <img src={p.url} alt="" style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }} />
                  <input value={p.caption} onChange={e => updatePortfolioCaption(p.id, e.target.value)} placeholder="Caption (optional)" style={{ width: "100%", border: "none", borderTop: "1px solid #eae6db", padding: "6px 8px", fontSize: 10.5, fontFamily: "inherit", boxSizing: "border-box" }} />
                  <div onClick={() => removePortfolioPhoto(p.id)} style={{ fontSize: 10, color: "#a33", textAlign: "center", padding: "4px 0", cursor: "pointer", borderTop: "1px solid #eae6db" }}>Remove</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "1px solid #eae6db", maxWidth: 480, marginTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Backup & Restore</div>
          <div style={{ fontSize: 12, color: "#8a887f", marginBottom: 16, lineHeight: 1.5 }}>Everything in this app — every lead, project, client, and photo — lives only here. Export a backup regularly and keep it somewhere safe.</div>
          <div style={{ fontSize: 12, color: "#555", marginBottom: 14 }}>{projects.length} project{projects.length === 1 ? "" : "s"} · {leads.length} lead{leads.length === 1 ? "" : "s"} · {events.length} event{events.length === 1 ? "" : "s"}</div>
          <button onClick={exportBackup} style={{ width: "100%", padding: 12, background: FOREST, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Export Backup</button>
          <label style={{ display: "block", width: "100%", padding: 12, background: "#fff", color: FOREST, border: `1px solid ${FOREST}`, borderRadius: 8, fontWeight: 700, fontSize: 13, textAlign: "center", cursor: "pointer" }}>
            Restore From Backup
            <input type="file" accept=".json,application/json" style={{ display: "none" }} onChange={e => handleBackupFilePick(e.target.files[0])} />
          </label>
        </div>

        {backupPreview && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(10,20,15,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ background: "#fff", borderRadius: 12, padding: 22, maxWidth: 560, width: "100%", maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Your Backup</div>
              <div style={{ fontSize: 12, color: "#8a887f", marginBottom: 12 }}>Download this file or copy it and save it somewhere safe (Notes app, email to yourself, Google Drive).</div>
              <textarea readOnly value={backupPreview} onFocus={e => e.target.select()} style={{ flex: 1, minHeight: 220, fontFamily: "monospace", fontSize: 10.5, padding: 10, border: "1px solid #ddd8ca", borderRadius: 8, marginBottom: 14, resize: "vertical" }} />
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={downloadBackupFile} style={{ flex: 1, padding: 11, background: FOREST, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13 }}>Download File</button>
                <button onClick={copyBackupToClipboard} style={{ flex: 1, padding: 11, background: "#fff", color: FOREST, border: `1px solid ${FOREST}`, borderRadius: 8, fontWeight: 700, fontSize: 13 }}>Copy to Clipboard</button>
                <button onClick={() => setBackupPreview(null)} style={{ padding: "11px 16px", background: "#fff", color: "#8a887f", border: "1px solid #ddd8ca", borderRadius: 8, fontSize: 13 }}>Close</button>
              </div>
            </div>
          </div>
        )}

        {pendingImport && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(10,20,15,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ background: "#fff", borderRadius: 12, padding: 24, maxWidth: 420, width: "100%" }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Restore this backup?</div>
              <div style={{ fontSize: 13, color: "#555", marginBottom: 10 }}>
                {pendingImport.exportedAt ? `Exported ${new Date(pendingImport.exportedAt).toLocaleDateString("en-GB")}` : "Backup file"}
              </div>
              <div style={{ fontSize: 13, color: "#555", marginBottom: 18 }}>
                Contains {(pendingImport.projects || []).length} project{(pendingImport.projects || []).length === 1 ? "" : "s"}, {(pendingImport.leads || []).length} lead{(pendingImport.leads || []).length === 1 ? "" : "s"}, {(pendingImport.events || []).length} event{(pendingImport.events || []).length === 1 ? "" : "s"}.
              </div>
              <div style={{ fontSize: 12.5, color: "#c0392b", marginBottom: 18, background: "#fdf1ef", padding: "10px 12px", borderRadius: 7 }}>This replaces everything currently in the app. This can't be undone.</div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={confirmImport} style={{ flex: 1, padding: 11, background: "#c0392b", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13 }}>Replace & Restore</button>
                <button onClick={() => setPendingImport(null)} style={{ flex: 1, padding: 11, background: "#fff", color: "#8a887f", border: "1px solid #ddd8ca", borderRadius: 8, fontSize: 13 }}>Cancel</button>
              </div>
            </div>
          </div>
        )}
        {toast && <Toast msg={toast} />}
        <DocPreviewModal doc={docPreview} onClose={() => setDocPreview(null)} />
      </Shell>
    );
  }

  // ============================================================
  // ================= TEAM MODE: FINANCE PLAYBOOK ================
  // ============================================================
  if (screen === "finance") {
    const wonStatuses = ["Signed", "In Construction", "Completed"];
    const wonProjects = projects.filter(p => wonStatuses.includes(p.status));
    const revenueWon = wonProjects.reduce((s, p) => s + totalsFor(p).total, 0);
    const pipelineValue = projects.filter(p => ["Survey Booked", "Proposal Sent"].includes(p.status)).reduce((s, p) => s + totalsFor(p).total, 0);
    let cashCollected = 0;
    const upcomingCash = [];
    wonProjects.forEach(p => {
      const t = totalsFor(p);
      const stageAmt = t.total / 4;
      PAYMENT_STAGES.forEach((label, i) => {
        if ((p.payments || {})[i]) cashCollected += stageAmt;
        else upcomingCash.push({ project: p.name, client: p.client, label, amount: stageAmt, key: `${p.id}-${i}` });
      });
    });
    const cashOutstanding = revenueWon - cashCollected;
    const referralPayout = projects.reduce((s, p) => s + (p.referrals || []).filter(r => r.status === "Rewarded").reduce((s2, r) => s2 + (r.rewardAmount || 0), 0), 0);
    const totalCost = wonProjects.reduce((s, p) => s + totalsFor(p).cost, 0);
    const totalProfit = revenueWon - totalCost;
    const marginPct = revenueWon > 0 ? (totalProfit / revenueWon) * 100 : 0;
    const netAfterReferrals = totalProfit - referralPayout;

    const monthKey = (d) => { const dt = new Date(d); return `${dt.toLocaleString("en-GB", { month: "short" })} ${dt.getFullYear()}`; };
    const now = new Date();
    const last6 = Array.from({ length: 6 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1); return monthKey(d); });
    const profitByMonth = last6.map(mk => ({
      month: mk,
      profit: wonProjects.filter(p => monthKey(p.signature?.date || p.createdAt) === mk).reduce((s, p) => s + totalsFor(p).profit, 0),
    }));
    const thisYear = now.getFullYear();
    const profitThisYear = wonProjects.filter(p => new Date(p.signature?.date || p.createdAt).getFullYear() === thisYear).reduce((s, p) => s + totalsFor(p).profit, 0);

    return (
      <Shell title="Finance Playbook" subtitle="Pricing, margins, cash flow and growth — for your business, with your numbers." right={ModeSwitch} screen={screen} setScreen={setScreen} onNewProject={startNewProject}>
        <button className="top-btn" onClick={() => setScreen("dashboard")} style={{ marginBottom: 16, padding: "9px 14px", border: "1px solid #ddd8ca", borderRadius: 8, background: "#fff", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}><ArrowLeft size={14}/> Dashboard</button>

        <div style={{ display: "flex", background: "#fff", border: "1px solid #ddd8ca", borderRadius: 30, padding: 3, marginBottom: 20, width: "fit-content" }}>
          <button onClick={() => setFinanceTab("dashboard")} style={{ padding: "8px 18px", borderRadius: 24, border: "none", background: financeTab === "dashboard" ? "#1f5b3f" : "transparent", color: financeTab === "dashboard" ? "#fff" : INK, fontSize: 12.5, fontWeight: 700 }}>Dashboard</button>
          <button onClick={() => setFinanceTab("playbook")} style={{ padding: "8px 18px", borderRadius: 24, border: "none", background: financeTab === "playbook" ? "#1f5b3f" : "transparent", color: financeTab === "playbook" ? "#fff" : INK, fontSize: 12.5, fontWeight: 700 }}>Playbook</button>
        </div>

        {financeTab === "dashboard" ? (
          <>
            <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
              <StatCard label="Revenue Won" value={gbp(revenueWon)} tint="#7fbf9e" />
              <StatCard label="Gross Profit" value={gbp(totalProfit)} tint="#7fbf9e" />
              <StatCard label="Cash Collected" value={gbp(cashCollected)} />
              <StatCard label="Cash Outstanding" value={gbp(cashOutstanding)} />
              <StatCard label="Pipeline Value" value={gbp(pipelineValue)} />
            </div>

            <div className="responsive-flex" style={{ marginBottom: 20 }}>
              <div style={{ flex: 1, minWidth: 0, background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #eae6db" }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Profit — Real Numbers</div>
                <div style={{ fontSize: 12, color: "#8a887f", marginBottom: 16, lineHeight: 1.5 }}>Calculated from the supplier cost you've entered against every ticked item in each Estimate, versus what you charged the client.</div>
                <RowS label="Total Revenue" value={gbp(revenueWon)} />
                <RowS label="Total Cost (materials, labour, plant)" value={gbp(totalCost)} />
                <div style={{ borderTop: "1px solid #eae6db", margin: "10px 0" }} />
                <RowS label="Gross Profit" value={gbp(totalProfit)} bold tint={totalProfit >= 0 ? "#1f5b3f" : "#c0392b"} />
                <RowS label="Margin" value={`${marginPct.toFixed(1)}%`} tint={totalProfit >= 0 ? "#1f5b3f" : "#c0392b"} />
                <RowS label="Referral Rewards Paid" value={`- ${gbp(referralPayout)}`} tint="#c0392b" />
                <div style={{ borderTop: "1px solid #eae6db", margin: "10px 0" }} />
                <RowS label="Net After Referrals" value={gbp(netAfterReferrals)} bold />
                <RowS label="Profit This Year" value={gbp(profitThisYear)} />
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
                  <div style={{ fontSize: 12, color: "#555" }}>Target margin</div>
                  <input type="number" min="0" max="100" value={settings.targetMarginPct} onChange={e => setSettings({ ...settings, targetMarginPct: Number(e.target.value) || 0 })} style={{ ...inputStyle, width: 65 }} />
                  <span style={{ fontSize: 13 }}>%</span>
                  <span style={{ fontSize: 11.5, color: marginPct >= settings.targetMarginPct ? "#1f5b3f" : "#c0392b", fontWeight: 700, marginLeft: "auto" }}>
                    {marginPct >= settings.targetMarginPct ? "On target" : `${(settings.targetMarginPct - marginPct).toFixed(1)}pt below target`}
                  </span>
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 0, background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #eae6db" }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Upcoming Cash</div>
                <div style={{ fontSize: 12, color: "#8a887f", marginBottom: 14 }}>Payment stages not yet marked paid, across all live projects.</div>
                {upcomingCash.length === 0 && <div style={{ fontSize: 12.5, color: "#9a978c" }}>Nothing outstanding — everything's collected.</div>}
                {upcomingCash.slice(0, 8).map(u => (
                  <div key={u.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f1efe7" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{u.project}</div>
                      <div style={{ fontSize: 11, color: "#9a978c" }}>{u.client} · {u.label}</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{gbp(u.amount)}</div>
                  </div>
                ))}
                {upcomingCash.length > 8 && <div style={{ fontSize: 11.5, color: "#9a978c", marginTop: 8 }}>+ {upcomingCash.length - 8} more</div>}
              </div>
            </div>

            <div style={{ background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #eae6db" }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Gross Profit — Last 6 Months</div>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={profitByMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `£${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`} />
                    <Tooltip formatter={(v) => gbp(v)} />
                    <Bar dataKey="profit" fill="#1f5b3f" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        ) : (
          <div style={{ maxWidth: 720 }}>
            {PLAYBOOK_SECTIONS.map(sec => {
              const open = expandedPlaybook === sec.id;
              return (
                <div key={sec.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #eae6db", marginBottom: 12, overflow: "hidden" }}>
                  <div onClick={() => setExpandedPlaybook(open ? null : sec.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", cursor: "pointer", background: "#f6f4ee" }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#1f5b3f", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <sec.icon size={16} color="#fff" />
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>{sec.title}</div>
                    {open ? <ChevronUp size={16} color="#9a978c" /> : <ChevronDown size={16} color="#9a978c" />}
                  </div>
                  {open && (
                    <div style={{ padding: "18px 20px" }}>
                      {sec.points.map((pt, i) => (
                        <div key={i} style={{ display: "flex", gap: 10, marginBottom: 12, fontSize: 13, lineHeight: 1.6, color: "#444" }}>
                          <span style={{ color: GOLD, fontWeight: 700, flexShrink: 0 }}>•</span>
                          <span>{pt}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {toast && <Toast msg={toast} />}
        <DocPreviewModal doc={docPreview} onClose={() => setDocPreview(null)} />
      </Shell>
    );
  }

  // ============================================================
  // ================= TEAM MODE: LEADS / ENQUIRIES ================
  // ============================================================
  if (screen === "leads") {
    const q = leadSearch.trim().toLowerCase();
    const statusFiltered = leadFilter === "All" ? leads : leads.filter(l => l.status === leadFilter);
    const filtered = q ? statusFiltered.filter(l => [l.name, l.phone, l.email, l.notes, l.source].some(v => (v || "").toLowerCase().includes(q))) : statusFiltered;
    const statusColor = (s) => ({
      "New": { bg: "#fbe8de", fg: "#b85427" }, "Contacted": { bg: "#fbf1de", fg: "#a06a12" },
      "Survey Booked": { bg: "#e9eef5", fg: "#3a5a8a" }, "Quoted": { bg: "#f1eaf7", fg: "#7a4a9c" },
      "Won": { bg: "#e7f0ea", fg: "#1f5b3f" }, "Lost": { bg: "#f1efe7", fg: "#8a887f" },
    }[s] || { bg: "#eee", fg: "#555" });

    return (
      <Shell title="Leads & Enquiries" subtitle="Every enquiry, tracked from first contact to won." right={ModeSwitch} screen={screen} setScreen={setScreen} onNewProject={startNewProject}>
        <button className="top-btn" onClick={() => setScreen("dashboard")} style={{ marginBottom: 16, padding: "9px 14px", border: "1px solid #ddd8ca", borderRadius: 8, background: "#fff", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}><ArrowLeft size={14}/> Dashboard</button>

        <div className="responsive-flex">
          <div style={{ flex: 1.4, minWidth: 0 }}>
            <div style={{ position: "relative", marginBottom: 14 }}>
              <Search size={14} color="#9a978c" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
              <input value={leadSearch} onChange={e => setLeadSearch(e.target.value)} placeholder="Search leads by name, phone, email…" style={{ ...inputStyle, width: "100%", paddingLeft: 34 }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {["All", ...LEAD_STATUSES].map(s => (
                <button key={s} onClick={() => setLeadFilter(s)} style={{ padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1px solid ${leadFilter === s ? FOREST : "#ddd8ca"}`, background: leadFilter === s ? FOREST : "#fff", color: leadFilter === s ? "#fff" : INK }}>
                  {s} {s !== "All" ? `(${leads.filter(l => l.status === s).length})` : `(${leads.length})`}
                </button>
              ))}
            </div>

            {filtered.length === 0 && <div style={{ background: "#fff", borderRadius: 12, padding: 30, textAlign: "center", border: "1px solid #eae6db", fontSize: 13, color: "#9a978c" }}>{q ? `No leads match "${leadSearch}".` : "No leads here yet."}</div>}
            {filtered.map(l => (
              <div key={l.id} style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #eae6db", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{l.name}</div>
                    <div style={{ fontSize: 12, color: "#8a887f", marginTop: 2 }}>{l.source}{l.phone ? ` · ${l.phone}` : ""}{l.email ? ` · ${l.email}` : ""}</div>
                    {l.notes && <div style={{ fontSize: 12.5, color: "#555", marginTop: 6 }}>{l.notes}</div>}
                  </div>
                  <span style={{ background: statusColor(l.status).bg, color: statusColor(l.status).fg, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, flexShrink: 0 }}>{l.status}</span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
                  <select value={l.status} onChange={e => updateLeadStatus(l.id, e.target.value)} style={{ ...inputStyle, fontSize: 12 }}>
                    {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={() => convertLead(l)} style={{ padding: "8px 14px", background: FOREST, color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 700 }}>Convert to Project</button>
                  <Trash2 size={15} color="#c0392b" style={{ cursor: "pointer", marginLeft: "auto" }} onClick={() => askConfirm(`Delete ${l.name}? This can't be undone.`, () => deleteLead(l.id))} />
                </div>
              </div>
            ))}
          </div>

          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ background: "#fff", borderRadius: 12, padding: 18, border: "1px solid #eae6db" }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>New Lead</div>
              <Field label="Name *"><input style={{ ...inputStyle, width: "100%" }} value={newLead.name} onChange={e => setNewLead({ ...newLead, name: e.target.value })} placeholder="e.g. Sarah Thompson" /></Field>
              <Field label="Phone"><input style={{ ...inputStyle, width: "100%" }} value={newLead.phone} onChange={e => setNewLead({ ...newLead, phone: e.target.value })} placeholder="07500 123456" /></Field>
              <Field label="Email"><input style={{ ...inputStyle, width: "100%" }} value={newLead.email} onChange={e => setNewLead({ ...newLead, email: e.target.value })} placeholder="sarah@email.com" /></Field>
              <Field label="Source">
                <select style={{ ...inputStyle, width: "100%" }} value={newLead.source} onChange={e => setNewLead({ ...newLead, source: e.target.value })}>
                  {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Notes"><textarea style={{ ...inputStyle, width: "100%", minHeight: 60 }} value={newLead.notes} onChange={e => setNewLead({ ...newLead, notes: e.target.value })} placeholder="What are they after?" /></Field>
              <button onClick={addLead} style={{ width: "100%", padding: 12, background: "#e07a3f", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13 }}>Add Lead</button>
            </div>
          </div>
        </div>
        {toast && <Toast msg={toast} />}
        <DocPreviewModal doc={docPreview} onClose={() => setDocPreview(null)} />
        <ConfirmDialog confirm={confirmAction} onCancel={() => setConfirmAction(null)} />
      </Shell>
    );
  }

  // ============================================================
  // ================= TEAM MODE: TEAM ============================
  // ============================================================
  if (screen === "team") {
    const projectCountFor = (memberId) => projects.filter(p => (p.assignedTeam || []).includes(memberId) && ["Signed", "In Construction"].includes(p.status)).length;
    return (
      <Shell title="Team" subtitle="Your people, and what they're assigned to." right={ModeSwitch} screen={screen} setScreen={setScreen} onNewProject={startNewProject}>
        <div className="responsive-flex">
          <div style={{ flex: 1.4, minWidth: 0 }}>
            {team.length === 0 && <div style={{ background: "#fff", borderRadius: 12, padding: 30, textAlign: "center", border: "1px solid #eae6db", fontSize: 13, color: "#9a978c" }}>No team members added yet.</div>}
            {team.map(m => (
              <div key={m.id} style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #eae6db", marginBottom: 12, display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 42, height: 42, borderRadius: "50%", background: m.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
                  {m.name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: "#8a887f" }}>{m.role}{m.phone ? ` · ${m.phone}` : ""}{m.email ? ` · ${m.email}` : ""}</div>
                  <div style={{ fontSize: 11.5, color: GOLD, marginTop: 3, fontWeight: 600 }}>{projectCountFor(m.id)} active project{projectCountFor(m.id) === 1 ? "" : "s"}</div>
                </div>
                <Trash2 size={15} color="#c0392b" style={{ cursor: "pointer", flexShrink: 0 }} onClick={() => askConfirm(`Remove ${m.name} from the team? This can't be undone.`, () => removeTeamMember(m.id))} />
              </div>
            ))}
          </div>

          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ background: "#fff", borderRadius: 12, padding: 18, border: "1px solid #eae6db" }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Add Team Member</div>
              <Field label="Name *"><input style={{ ...inputStyle, width: "100%" }} value={newTeamMember.name} onChange={e => setNewTeamMember({ ...newTeamMember, name: e.target.value })} placeholder="e.g. James Whitaker" /></Field>
              <Field label="Role">
                <select style={{ ...inputStyle, width: "100%" }} value={newTeamMember.role} onChange={e => setNewTeamMember({ ...newTeamMember, role: e.target.value })}>
                  {TEAM_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Phone"><input style={{ ...inputStyle, width: "100%" }} value={newTeamMember.phone} onChange={e => setNewTeamMember({ ...newTeamMember, phone: e.target.value })} placeholder="07500 123456" /></Field>
              <Field label="Email"><input style={{ ...inputStyle, width: "100%" }} value={newTeamMember.email} onChange={e => setNewTeamMember({ ...newTeamMember, email: e.target.value })} placeholder="james@northstone.com" /></Field>
              <button onClick={addTeamMember} style={{ width: "100%", padding: 12, background: FOREST, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13 }}>Add to Team</button>
            </div>
          </div>
        </div>
        {toast && <Toast msg={toast} />}
        <ConfirmDialog confirm={confirmAction} onCancel={() => setConfirmAction(null)} />
      </Shell>
    );
  }

  // ============================================================
  // ================= TEAM MODE: CALENDAR =======================
  // ============================================================
  if (screen === "calendar") {
    const upcoming = sortedEvents(events.filter(e => e.date >= todayStr()));
    const past = sortedEvents(events.filter(e => e.date < todayStr())).reverse();
    const grouped = {};
    upcoming.forEach(ev => { if (!grouped[ev.date]) grouped[ev.date] = []; grouped[ev.date].push(ev); });
    const fmtDate = (d) => {
      const today = todayStr();
      const tmrw = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      if (d === today) return "Today";
      if (d === tmrw) return "Tomorrow";
      return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    };

    return (
      <Shell title="Calendar" subtitle="Site visits, surveys, meetings — everything booked in." right={ModeSwitch} screen={screen} setScreen={setScreen} onNewProject={startNewProject}>
        <button className="top-btn" onClick={() => setScreen("dashboard")} style={{ marginBottom: 16, padding: "9px 14px", border: "1px solid #ddd8ca", borderRadius: 8, background: "#fff", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}><ArrowLeft size={14}/> Dashboard</button>

        <div className="responsive-flex">
          <div style={{ flex: 1.4, minWidth: 0 }}>
            {Object.keys(grouped).length === 0 && <div style={{ background: "#fff", borderRadius: 12, padding: 30, textAlign: "center", border: "1px solid #eae6db", fontSize: 13, color: "#9a978c" }}>Nothing booked yet — add your first event.</div>}
            {Object.entries(grouped).map(([date, evs]) => (
              <div key={date} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: GOLD, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>{fmtDate(date)}</div>
                {evs.map(ev => {
                  const proj = projects.find(p => p.id === ev.projectId);
                  const lead = leads.find(l => l.id === ev.leadId);
                  return (
                    <div key={ev.id} style={{ background: "#fff", borderRadius: 10, padding: 14, border: "1px solid #eae6db", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: EVENT_TYPE_COLOR[ev.type] || GOLD, flexShrink: 0 }} />
                      <div style={{ width: 56, flexShrink: 0, fontSize: 13, fontWeight: 700, color: "#8a887f" }}>{ev.time || "—"}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{ev.title}</div>
                        <div style={{ fontSize: 11.5, color: "#9a978c" }}>{ev.type}{proj ? ` · ${proj.name}` : ""}{lead ? ` · ${lead.name} (lead)` : ""}</div>
                        {ev.notes && <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>{ev.notes}</div>}
                      </div>
                      <Trash2 size={15} color="#c0392b" style={{ cursor: "pointer", flexShrink: 0 }} onClick={() => askConfirm(`Delete "${ev.title}"? This can't be undone.`, () => deleteEvent(ev.id))} />
                    </div>
                  );
                })}
              </div>
            ))}

            {past.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "#9a978c", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Past</div>
                {past.slice(0, 8).map(ev => (
                  <div key={ev.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f1efe7", opacity: 0.65 }}>
                    <div style={{ width: 70, fontSize: 11.5, color: "#9a978c", flexShrink: 0 }}>{ev.date}</div>
                    <div style={{ flex: 1, fontSize: 13 }}>{ev.title}</div>
                    <span style={{ fontSize: 11, color: "#9a978c" }}>{ev.type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ background: "#fff", borderRadius: 12, padding: 18, border: "1px solid #eae6db" }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>New Event</div>
              <Field label="Title *"><input style={{ ...inputStyle, width: "100%" }} value={newEvent.title} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })} placeholder="e.g. Site survey — Harris Residence" /></Field>
              <Field label="Type">
                <select style={{ ...inputStyle, width: "100%" }} value={newEvent.type} onChange={e => setNewEvent({ ...newEvent, type: e.target.value })}>
                  {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <div style={{ display: "flex", gap: 10 }}>
                <Field label="Date *"><input type="date" style={{ ...inputStyle, width: "100%" }} value={newEvent.date} onChange={e => setNewEvent({ ...newEvent, date: e.target.value })} /></Field>
                <Field label="Time"><input type="time" style={{ ...inputStyle, width: "100%" }} value={newEvent.time} onChange={e => setNewEvent({ ...newEvent, time: e.target.value })} /></Field>
              </div>
              <Field label="Related Project (optional)">
                <select style={{ ...inputStyle, width: "100%" }} value={newEvent.projectId} onChange={e => setNewEvent({ ...newEvent, projectId: e.target.value })}>
                  <option value="">None</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="Related Lead (optional)">
                <select style={{ ...inputStyle, width: "100%" }} value={newEvent.leadId} onChange={e => setNewEvent({ ...newEvent, leadId: e.target.value })}>
                  <option value="">None</option>
                  {leads.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
              <Field label="Notes"><textarea style={{ ...inputStyle, width: "100%", minHeight: 56 }} value={newEvent.notes} onChange={e => setNewEvent({ ...newEvent, notes: e.target.value })} /></Field>
              <button onClick={addEvent} style={{ width: "100%", padding: 12, background: "#3a5a8a", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13 }}>Add Event</button>
              <div style={{ fontSize: 11, color: "#9a978c", marginTop: 8 }}>Tip: linking a Site Survey/Visit to a lead moves it to "Survey Booked" automatically.</div>
            </div>
          </div>
        </div>
        {toast && <Toast msg={toast} />}
        <DocPreviewModal doc={docPreview} onClose={() => setDocPreview(null)} />
        <ConfirmDialog confirm={confirmAction} onCancel={() => setConfirmAction(null)} />
      </Shell>
    );
  }

  // ============================================================
  // ================= TEAM MODE: REPORTS =========================
  // ============================================================
  if (screen === "reports") {
    const wonStatuses = ["Signed", "In Construction", "Completed"];
    const wonProjects = projects.filter(p => wonStatuses.includes(p.status));
    const totalRevenueWon = wonProjects.reduce((s, p) => s + totalsFor(p).total, 0);
    const pipelineProjects = projects.filter(p => ["Survey Booked", "Proposal Sent"].includes(p.status));
    const pipelineValue = pipelineProjects.reduce((s, p) => s + totalsFor(p).total, 0);
    const avgProjectValue = wonProjects.length ? totalRevenueWon / wonProjects.length : 0;
    const lostProjects = projects.filter(p => p.status === "Lost");
    const lostValue = lostProjects.reduce((s, p) => s + totalsFor(p).total, 0);
    const projectWinRate = (wonProjects.length + lostProjects.length) > 0 ? (wonProjects.length / (wonProjects.length + lostProjects.length)) * 100 : null;
    const lostReasonCounts = {};
    lostProjects.forEach(p => { const r = p.lostReason || "Other"; lostReasonCounts[r] = (lostReasonCounts[r] || 0) + 1; });
    const winRate = leads.length ? (leads.filter(l => l.status === "Won").length / leads.filter(l => l.status === "Won" || l.status === "Lost").length) * 100 : null;

    // revenue by month (last 6 months), based on signature date / createdAt
    const monthKey = (d) => { const dt = new Date(d); return `${dt.toLocaleString("en-GB", { month: "short" })} ${dt.getFullYear()}`; };
    const now = new Date();
    const last6 = Array.from({ length: 6 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1); return monthKey(d); });
    const revenueByMonth = last6.map(mk => ({
      month: mk,
      revenue: wonProjects.filter(p => monthKey(p.signature?.date || p.createdAt) === mk).reduce((s, p) => s + totalsFor(p).total, 0),
    }));

    // lead source breakdown
    const sourceCounts = {};
    leads.forEach(l => { sourceCounts[l.source] = (sourceCounts[l.source] || 0) + 1; });
    const sourceData = Object.entries(sourceCounts).map(([name, value], i) => ({ name, value, color: CAT_COLORS[i % CAT_COLORS.length] }));

    // pipeline funnel
    const funnel = [
      { label: "New Enquiries", count: leads.length },
      { label: "Survey Booked", count: leads.filter(l => l.status === "Survey Booked").length + projects.filter(p => p.status === "Survey Booked").length },
      { label: "Proposal Sent", count: leads.filter(l => l.status === "Quoted").length + projects.filter(p => p.status === "Proposal Sent").length },
      { label: "Won", count: wonProjects.length },
      { label: "Lost", count: lostProjects.length },
    ];
    const funnelMax = Math.max(1, ...funnel.map(f => f.count));

    const topProjects = [...projects].sort((a, b) => totalsFor(b).total - totalsFor(a).total).slice(0, 5);
    const reviewedProjects = projects.filter(p => p.review);
    const avgRating = reviewedProjects.length ? reviewedProjects.reduce((s, p) => s + p.review.rating, 0) / reviewedProjects.length : 0;
    const totalReferrals = projects.reduce((s, p) => s + (p.referrals || []).length, 0);
    const totalReferralPayout = projects.reduce((s, p) => s + (p.referrals || []).filter(r => r.status === "Rewarded").reduce((s2, r) => s2 + (r.rewardAmount || 0), 0), 0);
    const rewardedReferralsCount = projects.reduce((s, p) => s + (p.referrals || []).filter(r => r.status === "Rewarded").length, 0);

    return (
      <Shell title="Business Reports" subtitle="How the business is actually doing, at a glance." right={ModeSwitch} screen={screen} setScreen={setScreen} onNewProject={startNewProject}>
        <button className="top-btn" onClick={() => setScreen("dashboard")} style={{ marginBottom: 16, padding: "9px 14px", border: "1px solid #ddd8ca", borderRadius: 8, background: "#fff", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}><ArrowLeft size={14}/> Dashboard</button>

        <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
          <StatCard label="Revenue Won" value={gbp(totalRevenueWon)} tint="#7fbf9e" />
          <StatCard label="Pipeline Value" value={gbp(pipelineValue)} />
          <StatCard label="Avg Project Value" value={gbp(avgProjectValue)} />
          <StatCard label="Proposal Win Rate" value={projectWinRate === null ? "—" : `${projectWinRate.toFixed(0)}%`} tint="#7fbf9e" />
          <StatCard label="Lost Value" value={gbp(lostValue)} />
        </div>

        {lostProjects.length > 0 && (
          <div style={{ background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #eae6db", marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Why Proposals Are Lost</div>
            {Object.entries(lostReasonCounts).sort((a, b) => b[1] - a[1]).map(([reason, count]) => (
              <div key={reason} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid #f1efe7" }}>
                <span>{reason}</span><span style={{ fontWeight: 700 }}>{count}</span>
              </div>
            ))}
          </div>
        )}

        <div className="responsive-flex" style={{ marginBottom: 20 }}>
          <div style={{ flex: 1.4, minWidth: 0, background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #eae6db" }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Revenue Won — Last 6 Months</div>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueByMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `£${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`} />
                  <Tooltip formatter={(v) => gbp(v)} />
                  <Bar dataKey="revenue" fill={FOREST} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 260, background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #eae6db" }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Leads by Source</div>
            {sourceData.length === 0 ? <div style={{ fontSize: 12.5, color: "#9a978c" }}>No leads logged yet.</div> : (
              <>
                <div style={{ height: 170 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={sourceData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={1}>
                        {sourceData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {sourceData.map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, marginBottom: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>{d.name}</div>
                    <div style={{ fontWeight: 600 }}>{d.value}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <div className="responsive-flex">
          <div style={{ flex: 1, minWidth: 0, background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #eae6db" }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Pipeline</div>
            {funnel.map(f => (
              <div key={f.label} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                  <span>{f.label}</span><span style={{ fontWeight: 700 }}>{f.count}</span>
                </div>
                <div style={{ height: 8, background: "#f1efe7", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${(f.count / funnelMax) * 100}%`, height: "100%", background: GOLD }} />
                </div>
              </div>
            ))}
          </div>

          <div style={{ flex: 1, minWidth: 0, background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #eae6db" }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Top Projects by Value</div>
            {topProjects.length === 0 && <div style={{ fontSize: 12.5, color: "#9a978c" }}>No projects yet.</div>}
            {topProjects.map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f1efe7" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "#9a978c" }}>{p.client}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{gbp(totalsFor(p).total)}</div>
                  <StatusPill status={p.status} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #eae6db", marginTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Reviews & Referrals</div>
            {reviewedProjects.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {[1, 2, 3, 4, 5].map(n => <Star key={n} size={15} fill={n <= Math.round(avgRating) ? GOLD : "none"} color={GOLD} />)}
                <span style={{ fontSize: 12.5, color: "#8a887f", marginLeft: 4 }}>{avgRating.toFixed(1)} avg · {reviewedProjects.length} review{reviewedProjects.length === 1 ? "" : "s"}</span>
              </div>
            )}
          </div>
          <div style={{ fontSize: 12, color: "#8a887f", marginBottom: 14 }}>{totalReferrals} referral{totalReferrals === 1 ? "" : "s"} submitted · {rewardedReferralsCount} converted to paying customers · {gbp(totalReferralPayout)} paid out in rewards</div>
          {reviewedProjects.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "#9a978c" }}>No reviews yet — they'll appear here once clients complete their projects and leave feedback.</div>
          ) : (
            reviewedProjects.map(p => (
              <div key={p.id} style={{ padding: "10px 0", borderBottom: "1px solid #f1efe7" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name} · {p.client}</div>
                  <div style={{ display: "flex", gap: 2 }}>{[1, 2, 3, 4, 5].map(n => <Star key={n} size={13} fill={n <= p.review.rating ? GOLD : "none"} color={GOLD} />)}</div>
                </div>
                {p.review.text && <div style={{ fontSize: 12.5, color: "#555", marginTop: 4 }}>{p.review.text}</div>}
              </div>
            ))
          )}
        </div>
        {toast && <Toast msg={toast} />}
        <DocPreviewModal doc={docPreview} onClose={() => setDocPreview(null)} />
      </Shell>
    );
  }

  // ============================================================
  // ================= TEAM MODE: CONSTRUCTION PROGRESS ==========
  // ============================================================
  if (screen === "construction") {
    const avg = Math.round(Object.values(draft.timeline).reduce((s, v) => s + v, 0) / TIMELINE_STAGES.length);
    return (
      <Shell title="Construction Progress" subtitle={`${draft.name} · ${draft.client} · updates here show live in the Client Portal`} right={ModeSwitch} screen={screen} setScreen={setScreen} onNewProject={startNewProject}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <button className="top-btn" onClick={() => setScreen("dashboard")} style={{ padding: "9px 14px", border: "1px solid #ddd8ca", borderRadius: 8, background: "#fff", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}><ArrowLeft size={14}/> Dashboard</button>
          <button className="top-btn" onClick={() => openEditDetails(draft)} style={{ padding: "9px 14px", border: "1px solid #ddd8ca", borderRadius: 8, background: "#fff", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}><Pencil size={13}/> Edit Details</button>
        </div>
        <div className="responsive-flex">
          <div style={{ flex: 1.2, minWidth: 0 }}>
            <div style={{ background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #eae6db", marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Stage Progress</div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: FOREST }}>{avg}%</div>
              </div>
              {TIMELINE_STAGES.map(t => (
                <div key={t.key} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600 }}>{t.label}</span>
                    <span style={{ color: "#8a887f" }}>{draft.timeline[t.key]}%</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input type="range" min="0" max="100" step="5" value={draft.timeline[t.key]} onChange={e => setStagePct(t.key, Number(e.target.value))} style={{ flex: 1, accentColor: GOLD }} />
                    <input type="number" min="0" max="100" value={draft.timeline[t.key]} onChange={e => setStagePct(t.key, Math.min(100, Math.max(0, Number(e.target.value) || 0)))} style={{ ...inputStyle, width: 55 }} />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #eae6db" }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Post a Site Update</div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
                <label style={{ width: 100, height: 100, borderRadius: 10, border: "1.5px dashed #ddd8ca", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, overflow: "hidden", background: "#fafaf7" }}>
                  {newUpdate.uploading ? <span style={{ fontSize: 11, color: "#8a887f" }}>Loading…</span> :
                    newUpdate.photo ? <img src={newUpdate.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> :
                    <Camera size={22} color="#b5b2a5" />}
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => handlePhotoPick(e.target.files[0])} />
                </label>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <select value={newUpdate.stage} onChange={e => setNewUpdate(u => ({ ...u, stage: e.target.value }))} style={{ ...inputStyle, width: "100%", marginBottom: 8 }}>
                    <option value="">No specific stage</option>
                    {TIMELINE_STAGES.map(t => <option key={t.key} value={t.label}>{t.label}</option>)}
                  </select>
                  <textarea value={newUpdate.caption} onChange={e => setNewUpdate(u => ({ ...u, caption: e.target.value }))} placeholder="What's happening on site today…" style={{ ...inputStyle, width: "100%", minHeight: 56 }} />
                </div>
              </div>
              <button onClick={postSiteUpdate} style={{ padding: "10px 18px", background: FOREST, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13 }}>Post Update</button>
            </div>

            <div style={{ background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #eae6db", marginTop: 18 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Design Visuals</div>
              <div style={{ fontSize: 12, color: "#8a887f", marginBottom: 16 }}>Upload 2D plans and 3D renders for this project — they'll appear in a dedicated section of the Client Portal.</div>
              {["plans2d", "renders3d"].map(kind => {
                const label = kind === "plans2d" ? "2D Plans" : "3D Renders";
                const items = (draft.designVisuals || {})[kind] || [];
                const inputId = `design-visual-${kind}`;
                return (
                  <div key={kind} style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8, color: FOREST }}>{label}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                      {items.map(v => (
                        <div key={v.id} style={{ width: 110, border: "1px solid #eae6db", borderRadius: 8, overflow: "hidden", background: "#fafaf7" }}>
                          <PhotoImg path={v.path} alt="" style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }} />
                          <input value={v.caption} onChange={e => updateDesignVisualCaption(kind, v.id, e.target.value)} placeholder="Caption" style={{ width: "100%", border: "none", borderTop: "1px solid #eae6db", padding: "5px 7px", fontSize: 10.5, fontFamily: "inherit", boxSizing: "border-box" }} />
                          <div onClick={() => removeDesignVisual(kind, v.id)} style={{ fontSize: 10, color: "#a33", textAlign: "center", padding: "4px 0", cursor: "pointer", borderTop: "1px solid #eae6db" }}>Remove</div>
                        </div>
                      ))}
                      <label htmlFor={inputId} style={{ width: 110, height: 80, borderRadius: 8, border: "1.5px dashed #ddd8ca", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", background: "#fafaf7", color: "#b5b2a5", fontSize: 10.5, gap: 4 }}>
                        {kind === "plans2d" ? <Layers size={18} /> : <Boxes size={18} />}
                        Upload
                      </label>
                      <input id={inputId} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => addDesignVisuals(kind, e.target.files)} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #eae6db", marginTop: 18 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Change Orders / Variations</div>
              <div style={{ fontSize: 12, color: "#8a887f", marginBottom: 14 }}>Extra work outside the original scope — client approves it from their portal, and approved amounts add to the project total.</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                <input style={{ ...inputStyle, flex: 2, minWidth: 160 }} value={newVariation.title} onChange={e => setNewVariation({ ...newVariation, title: e.target.value })} placeholder="e.g. Extend patio by 8m²" />
                <input style={{ ...inputStyle, width: 110 }} type="number" value={newVariation.amount} onChange={e => setNewVariation({ ...newVariation, amount: e.target.value })} placeholder="£ amount" />
              </div>
              <textarea style={{ ...inputStyle, width: "100%", minHeight: 50, marginBottom: 10 }} value={newVariation.description} onChange={e => setNewVariation({ ...newVariation, description: e.target.value })} placeholder="Details for the client (optional)" />
              <button onClick={addVariation} style={{ padding: "10px 18px", background: "#a06a12", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13 }}>Send to Client for Approval</button>

              {(draft.variations || []).length > 0 && (
                <div style={{ marginTop: 18 }}>
                  {(draft.variations || []).map(v => (
                    <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, padding: "10px 0", borderTop: "1px solid #f3f1e9" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{v.title}</div>
                        {v.description && <div style={{ fontSize: 12, color: "#8a887f", marginTop: 2 }}>{v.description}</div>}
                        <div style={{ fontSize: 11, color: "#9a978c", marginTop: 2 }}>{v.date}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{gbp(v.amount)}</div>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: v.status === "Approved" ? "#1f5b3f" : v.status === "Rejected" ? "#c0392b" : "#a06a12" }}>{v.status}</span>
                        <Trash2 size={13} color="#c0392b" style={{ cursor: "pointer", marginLeft: 8 }} onClick={() => askConfirm(`Delete the "${v.title}" change order? This can't be undone.`, () => deleteVariation(v.id))} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ background: "#fff", borderRadius: 12, padding: 18, border: "1px solid #eae6db", marginBottom: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Assigned Team</div>
              {team.length === 0 ? (
                <div style={{ fontSize: 12, color: "#9a978c" }}>No team members added yet — add some from the Team screen.</div>
              ) : (
                <>
                  <div style={{ fontSize: 11.5, color: "#8a887f", marginBottom: 10 }}>Tap to assign or unassign for this project.</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {team.map(m => {
                      const assigned = (draft.assignedTeam || []).includes(m.id);
                      return (
                        <div key={m.id} onClick={() => toggleAssignedTeam(m.id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px 6px 6px", borderRadius: 20, cursor: "pointer", background: assigned ? m.color : "#f1efe7", border: `1px solid ${assigned ? m.color : "#ddd8ca"}` }}>
                          <div style={{ width: 22, height: 22, borderRadius: "50%", background: assigned ? "rgba(255,255,255,0.25)" : m.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                            {m.name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()}
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: assigned ? "#fff" : "#555" }}>{m.name.split(" ")[0]}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <div style={{ background: "#fff", borderRadius: 12, padding: 18, border: "1px solid #eae6db" }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Recent Updates ({(draft.updates || []).length})</div>
              {(draft.updates || []).length === 0 && <div style={{ fontSize: 12.5, color: "#9a978c" }}>No updates posted yet.</div>}
              {(draft.updates || []).map(u => (
                <div key={u.id} style={{ display: "flex", gap: 10, marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #f3f1e9" }}>
                  {u.photo ? <PhotoImg path={u.photo} alt="" style={{ width: 54, height: 54, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} /> : <div style={{ width: 54, height: 54, borderRadius: 8, background: "#f1efe7", flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {u.stage && <div style={{ fontSize: 10.5, color: GOLD, fontWeight: 700 }}>{u.stage}</div>}
                    <div style={{ fontSize: 12.5 }}>{u.caption || <span style={{ color: "#9a978c" }}>Photo update</span>}</div>
                    <div style={{ fontSize: 10.5, color: "#9a978c", marginTop: 2 }}>{u.date}</div>
                  </div>
                  <Trash2 size={14} color="#c0392b" style={{ cursor: "pointer", flexShrink: 0 }} onClick={() => askConfirm("Delete this site update? This can't be undone.", () => removeSiteUpdate(u.id))} />
                </div>
              ))}
            </div>

            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #eae6db", marginTop: 18, display: "flex", flexDirection: "column", height: 360 }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #eae6db", fontSize: 14, fontWeight: 700 }}>Messages with {draft.client || "Client"}</div>
              <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
                {(draft.messages || []).length === 0 && <div style={{ fontSize: 12.5, color: "#9a978c" }}>No messages yet.</div>}
                {(draft.messages || []).map(m => (
                  <div key={m.id} style={{ display: "flex", justifyContent: m.from === "team" ? "flex-end" : "flex-start", marginBottom: 10 }}>
                    <div style={{ maxWidth: "75%", background: m.from === "team" ? FOREST : "#f1efe7", color: m.from === "team" ? "#fff" : INK, padding: "8px 12px", borderRadius: 12, fontSize: 12.5 }}>
                      {m.text}
                      <div style={{ fontSize: 10, opacity: 0.6, marginTop: 3 }}>{m.when}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #eae6db" }}>
                <input value={teamMsgDraft} onChange={e => setTeamMsgDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && sendTeamMessage(draft.id, teamMsgDraft)} placeholder="Reply to client…" style={{ flex: 1, padding: "9px 12px", border: "1px solid #ddd8ca", borderRadius: 8, fontSize: 13 }} />
                <button onClick={() => sendTeamMessage(draft.id, teamMsgDraft)} style={{ background: FOREST, color: "#fff", border: "none", borderRadius: 8, padding: "0 14px" }}><Send size={15} /></button>
              </div>
            </div>

            {(draft.supportTickets || []).length > 0 && (
              <div style={{ background: "#fff", borderRadius: 12, padding: 18, border: "1px solid #eae6db", marginTop: 18 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Support Requests</div>
                {draft.supportTickets.map(t => (
                  <div key={t.id} style={{ padding: "10px 0", borderBottom: "1px solid #f1efe7" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{t.subject}</div>
                        {t.description && <div style={{ fontSize: 12, color: "#555", marginTop: 3 }}>{t.description}</div>}
                        <div style={{ fontSize: 10.5, color: "#9a978c", marginTop: 3 }}>{t.createdAt}</div>
                      </div>
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, flexShrink: 0, background: t.status === "Resolved" ? "#e7f0ea" : "#fbf1de", color: t.status === "Resolved" ? "#1f5b3f" : "#a06a12" }}>{t.status}</span>
                    </div>
                    {t.status === "Open" && (
                      <button onClick={() => resolveSupportTicket(draft.id, t.id)} style={{ marginTop: 8, padding: "6px 12px", background: FOREST, color: "#fff", border: "none", borderRadius: 6, fontSize: 11.5, fontWeight: 700 }}>Mark Resolved</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {toast && <Toast msg={toast} />}
        <DocPreviewModal doc={docPreview} onClose={() => setDocPreview(null)} />
        <ConfirmDialog confirm={confirmAction} onCancel={() => setConfirmAction(null)} />
        {editDetailsFor && <EditProjectDetailsModal project={editDetailsFor} onSave={saveProjectDetails} onClose={() => setEditDetailsFor(null)} />}
      </Shell>
    );
  }

  // ============================================================
  // ================= TEAM MODE: NEW PROJECT ====================
  // ============================================================
  if (screen === "newProject") {
    return (
      <Shell title="New Project" subtitle="Let's create something exceptional." right={ModeSwitch} screen={screen} setScreen={setScreen} onNewProject={startNewProject}>
        <button className="top-btn" onClick={() => setScreen("dashboard")} style={{ marginBottom: 16, padding: "9px 14px", border: "1px solid #ddd8ca", borderRadius: 8, background: "#fff", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}><ArrowLeft size={14}/> Dashboard</button>
        <div className="responsive-flex">
          <div style={{ flex: 1, background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #eae6db" }}>
            <SectionTitle>Project Details</SectionTitle>
            <Field label="Project Name *"><input style={inputStyle} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. The Harrogate Garden" /></Field>
            <SectionTitle>Client Details</SectionTitle>
            <Field label="Client Name *"><input style={inputStyle} value={draft.client} onChange={e => setDraft({ ...draft, client: e.target.value })} placeholder="e.g. Mr & Mrs Harris" /></Field>
            <Field label="Email"><input style={inputStyle} value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} placeholder="client@email.com" /></Field>
            <SectionTitle>Property Address</SectionTitle>
            <Field label="Address"><input style={inputStyle} value={draft.address} onChange={e => setDraft({ ...draft, address: e.target.value })} placeholder="12 Oakridge Lane" /></Field>
            <div style={{ display: "flex", gap: 10 }}>
              <Field label="Town / City"><input style={inputStyle} value={draft.town} onChange={e => setDraft({ ...draft, town: e.target.value })} placeholder="Harrogate" /></Field>
              <Field label="Postcode"><input style={inputStyle} value={draft.postcode} onChange={e => setDraft({ ...draft, postcode: e.target.value })} placeholder="HG2 8AA" /></Field>
            </div>
          </div>
          <div style={{ flex: 1, background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #eae6db" }}>
            <SectionTitle>Services</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
              {SERVICE_OPTIONS.map(s => (
                <label key={s} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}><Checkbox checked={!!draft.services[s]} onClick={() => toggleService(s)} /> {s}</label>
              ))}
            </div>
            <SectionTitle>Project Goals</SectionTitle>
            <textarea style={{ ...inputStyle, minHeight: 80, width: "100%", resize: "vertical" }} value={draft.goals} onChange={e => setDraft({ ...draft, goals: e.target.value })} placeholder="What are the main goals for this project?" />
            <button onClick={startSurvey} style={{ marginTop: 20, width: "100%", padding: 13, background: FOREST, color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              Next Step: Site Survey <ArrowRight size={16} />
            </button>
          </div>
        </div>
        {toast && <Toast msg={toast} />}
        <DocPreviewModal doc={docPreview} onClose={() => setDocPreview(null)} />
      </Shell>
    );
  }

  // ============================================================
  // ================= TEAM MODE: SITE SURVEY ====================
  // ============================================================
  if (screen === "survey") {
    const current = SURVEY_STEPS[step];
    const s = draft.survey;
    return (
      <Shell title={`Site Survey · ${draft.name}`} subtitle="Tag each measurement and the estimate builds itself." right={ModeSwitch} screen={screen} setScreen={setScreen} onNewProject={startNewProject}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 22, flexWrap: "wrap", background: "#fff", padding: "14px 16px", borderRadius: 10, border: "1px solid #eae6db" }}>
          {SURVEY_STEPS.map((st, i) => {
            const done = i < 5 && sectionComplete(st.key);
            const active = i === step;
            return (
              <React.Fragment key={st.key}>
                <div onClick={() => setStep(i)} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", opacity: active ? 1 : 0.75 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: done ? "#1f5b3f" : active ? FOREST : "#eee", color: done || active ? "#fff" : "#999", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{done ? <Check size={13} /> : i + 1}</div>
                  <div style={{ fontSize: 11.5, fontWeight: active ? 700 : 500 }}>{st.label}</div>
                </div>
                {i < SURVEY_STEPS.length - 1 && <div style={{ width: 14, height: 1, background: "#ddd" }} />}
              </React.Fragment>
            );
          })}
          <div style={{ marginLeft: "auto", fontSize: 12, color: GOLD, fontWeight: 700 }}>{overallPct}% complete</div>
        </div>

        <div style={{ background: "#fff", borderRadius: 12, padding: 22, border: "1px solid #eae6db", minHeight: 340 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}><current.icon size={18} color={GOLD} /><div style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 700 }}>{current.label}</div></div>

          {current.key === "info" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="Access to Property">
                <select style={inputStyle} value={s.info.access} onChange={e => setDraft(d => ({ ...d, survey: { ...d.survey, info: { ...d.survey.info, access: e.target.value } } }))}>
                  <option>Driveway (Good Access)</option><option>Side Gate Only</option><option>Restricted Access</option>
                </select>
              </Field>
              <Field label="Site Surface Type">
                <select style={inputStyle} value={s.info.surface} onChange={e => setDraft(d => ({ ...d, survey: { ...d.survey, info: { ...d.survey.info, surface: e.target.value } } }))}>
                  <option>Tarmac</option><option>Grass</option><option>Gravel</option><option>Concrete</option>
                </select>
              </Field>
              <div style={{ gridColumn: "1 / -1" }}><Field label="Site Notes"><textarea style={{ ...inputStyle, minHeight: 70, width: "100%" }} value={s.info.notes} onChange={e => setDraft(d => ({ ...d, survey: { ...d.survey, info: { ...d.survey.info, notes: e.target.value } } }))} /></Field></div>
            </div>
          )}

          {current.key === "measure" && (
            <div>
              <div style={{ fontSize: 12, color: "#8a887f", marginBottom: 12, background: "#fbf6ea", padding: "8px 12px", borderRadius: 7, display: "flex", alignItems: "center", gap: 8 }}><Ruler size={14} color={GOLD} /> Record site dimensions here for reference. Pricing quantities (m², m, tonnes etc.) are entered directly in the Estimate step.</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 0.8fr 30px", gap: 8, fontSize: 10.5, color: "#9a978c", padding: "0 2px 6px", fontWeight: 700 }}><div>MEASUREMENT NAME</div><div>VALUE</div><div /></div>
              {s.measurements.map(m => {
                return (
                  <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1fr 0.8fr 30px", gap: 8, alignItems: "center", marginBottom: 8 }}>
                    <input style={inputStyle} value={m.name} onChange={e => updateMeasurement(m.id, "name", e.target.value)} />
                    <input style={{ ...inputStyle, width: 90 }} type="number" value={m.value} onChange={e => updateMeasurement(m.id, "value", e.target.value)} placeholder="e.g. 24.5" />
                    <Trash2 size={14} color="#c0392b" style={{ cursor: "pointer" }} onClick={() => removeMeasurement(m.id)} />
                  </div>
                );
              })}
              <button onClick={addMeasurement} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px dashed #ccc", borderRadius: 7, padding: "8px 12px", fontSize: 12.5, color: FOREST, marginTop: 6 }}><Plus size={14} /> Add Measurement</button>
            </div>
          )}

          {current.key === "photos" && (
            <div>
              <div style={{ fontSize: 12.5, color: "#8a887f", marginBottom: 14 }}>Upload a photo for each item captured on site, or mark it as checked if a photo isn't possible. {Object.values(s.photos).filter(Boolean).length}/{REQUIRED_PHOTOS.length} covered.</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {REQUIRED_PHOTOS.map(name => {
                  const got = s.photos[name];
                  const hasPhoto = got && got !== "checked";
                  const checkedOnly = got === "checked";
                  const inputId = `survey-photo-${name.replace(/[^a-z0-9]/gi, "")}`;
                  return (
                    <div key={name} style={{ border: `1.5px solid ${got ? "#1f5b3f" : "#eae6db"}`, borderRadius: 10, padding: got ? 8 : 14, textAlign: "center", background: got ? "#f2f8f4" : "#fafaf7", position: "relative" }}>
                      {hasPhoto ? (
                        <>
                          <PhotoImg path={got} alt={name} style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 6, marginBottom: 6 }} />
                          <div style={{ fontSize: 11, fontWeight: 600 }}>{name}</div>
                          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 6 }}>
                            <label htmlFor={inputId} style={{ fontSize: 10, color: "#1f5b3f", cursor: "pointer", textDecoration: "underline" }}>Replace</label>
                            <span style={{ fontSize: 10, color: "#a33", cursor: "pointer", textDecoration: "underline" }} onClick={() => removeSurveyPhoto(name)}>Remove</span>
                          </div>
                        </>
                      ) : checkedOnly ? (
                        <>
                          <CheckCircle2 size={20} color="#1f5b3f" style={{ marginBottom: 6 }} />
                          <div style={{ fontSize: 11, fontWeight: 600 }}>{name}</div>
                          <div style={{ fontSize: 10, color: "#1f5b3f", marginTop: 3 }}>Checked · no photo</div>
                          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 6 }}>
                            <label htmlFor={inputId} style={{ fontSize: 10, color: "#1f5b3f", cursor: "pointer", textDecoration: "underline" }}>Add photo</label>
                            <span style={{ fontSize: 10, color: "#a33", cursor: "pointer", textDecoration: "underline" }} onClick={() => removeSurveyPhoto(name)}>Remove</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <label htmlFor={inputId} style={{ cursor: "pointer", display: "block" }}>
                            <Camera size={20} color="#b5b2a5" style={{ marginBottom: 6 }} />
                            <div style={{ fontSize: 11.5, fontWeight: 600 }}>{name}</div>
                            <div style={{ fontSize: 10, color: "#b5b2a5", marginTop: 3 }}>Tap to upload</div>
                          </label>
                          <div style={{ fontSize: 9.5, color: "#b5b2a5", marginTop: 8, cursor: "pointer", textDecoration: "underline" }} onClick={() => markSurveyPhotoChecked(name)}>Can't photograph — mark as checked</div>
                        </>
                      )}
                      <input id={inputId} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => setSurveyPhoto(name, e.target.files[0])} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {current.key === "services" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="Drainage Condition">
                <select style={inputStyle} value={s.services.drainage} onChange={e => setDraft(d => ({ ...d, survey: { ...d.survey, services: { ...d.survey.services, drainage: e.target.value } } }))}>
                  <option>Good</option><option>Blocked / Poor</option><option>Not Present</option>
                </select>
              </Field>
              <Field label="Electricity Supply">
                <select style={inputStyle} value={s.services.electricity} onChange={e => setDraft(d => ({ ...d, survey: { ...d.survey, services: { ...d.survey.services, electricity: e.target.value } } }))}>
                  <option>Available</option><option>Not Available</option>
                </select>
              </Field>
              <div style={{ gridColumn: "1 / -1" }}><Field label="Known Issues"><textarea style={{ ...inputStyle, minHeight: 60, width: "100%" }} value={s.services.issues} onChange={e => setDraft(d => ({ ...d, survey: { ...d.survey, services: { ...d.survey.services, issues: e.target.value } } }))} /></Field></div>
            </div>
          )}

          {current.key === "vision" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                {["Entertaining", "Fire Pit", "Hot Tub", "Pet Friendly", "Garden Room", "Outdoor Dining", "Low Maintenance", "Modern Style", "Automated Gates"].map(st => (
                  <label key={st} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}><Checkbox checked={s.vision.style.includes(st)} onClick={() => toggleStyle(st)} /> {st}</label>
                ))}
              </div>
              <Field label="Anything else we should know?"><textarea style={{ ...inputStyle, minHeight: 60, width: "100%" }} value={s.vision.notes} onChange={e => setDraft(d => ({ ...d, survey: { ...d.survey, vision: { ...d.survey.vision, notes: e.target.value } } }))} /></Field>
            </div>
          )}

          {current.key === "review" && (
            <div>
              <div style={{ fontSize: 13, marginBottom: 14 }}><b>Project:</b> {draft.name} · <b>Client:</b> {draft.client}</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Site measurements on file:</div>
              {s.measurements.filter(m => m.value).map(m => (
                <div key={m.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "6px 0", borderBottom: "1px solid #f3f1e9" }}><span>{m.name}</span><span style={{ fontWeight: 600 }}>{m.value}</span></div>
              ))}
              {s.measurements.filter(m => m.value).length === 0 && <div style={{ fontSize: 12.5, color: "#9a978c", marginBottom: 10 }}>No measurements recorded — that's fine, you can price everything directly in the Estimate step.</div>}
              <button onClick={goToEstimate} style={{ marginTop: 18, width: "100%", padding: 13, background: FOREST, color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><ArrowRight size={16} /> Continue to Estimate</button>
            </div>
          )}
        </div>

        {current.key !== "review" && (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
            <button disabled={step === 0} onClick={() => setStep(x => Math.max(0, x - 1))} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", border: "1px solid #ddd", borderRadius: 8, background: "#fff", fontSize: 13, opacity: step === 0 ? 0.4 : 1 }}><ArrowLeft size={14} /> Back</button>
            <button onClick={() => setStep(x => Math.min(SURVEY_STEPS.length - 1, x + 1))} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", background: FOREST, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700 }}>Continue <ArrowRight size={14} /></button>
          </div>
        )}
        {toast && <Toast msg={toast} />}
        <DocPreviewModal doc={docPreview} onClose={() => setDocPreview(null)} />
        {editDetailsFor && <EditProjectDetailsModal project={editDetailsFor} onSave={saveProjectDetails} onClose={() => setEditDetailsFor(null)} />}
      </Shell>
    );
  }

  // ============================================================
  // ================= TEAM MODE: ESTIMATE =======================
  // ============================================================
  if (screen === "estimate") {
    return (
      <Shell title="Estimate" subtitle={`${draft.name} · ${draft.client} · priced with your real labour, plant & materials rates`} right={ModeSwitch} screen={screen} setScreen={setScreen} onNewProject={startNewProject}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <button className="top-btn" onClick={() => setScreen("dashboard")} style={{ padding: "9px 14px", border: "1px solid #ddd8ca", borderRadius: 8, background: "#fff", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}><ArrowLeft size={14}/> Dashboard</button>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="top-btn" onClick={() => openEditDetails(draft)} style={{ padding: "9px 14px", border: "1px solid #ddd8ca", borderRadius: 8, background: "#fff", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}><Pencil size={13}/> Edit Details</button>
            <button className="top-btn" onClick={() => setScreen("survey")} style={{ padding: "9px 14px", border: "1px solid #ddd8ca", borderRadius: 8, background: "#fff", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>Back to Survey</button>
            <button className="top-btn" onClick={() => setShowSettings(s => !s)} style={{ padding: "9px 14px", border: "1px solid #ddd8ca", borderRadius: 8, background: "#fff", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}><SettingsIcon size={14}/> Settings</button>
          </div>
        </div>

        {showSettings && (
          <div style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #eae6db", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Business Settings</div>
            <div style={{ display: "flex", gap: 24 }}>
              <div><div style={{ fontSize: 11, color: "#8a887f", marginBottom: 4 }}>VAT %</div><input type="number" value={settings.vatPct} onChange={e => setSettings({ ...settings, vatPct: Number(e.target.value) })} style={{ ...inputStyle, width: 70 }} /></div>
              <div><div style={{ fontSize: 11, color: "#8a887f", marginBottom: 4 }}>Target Margin %</div><input type="number" value={settings.targetMarginPct} onChange={e => setSettings({ ...settings, targetMarginPct: Number(e.target.value) })} style={{ ...inputStyle, width: 70 }} /></div>
              <div><div style={{ fontSize: 11, color: "#8a887f", marginBottom: 4 }}>Referral Reward £</div><input type="number" value={settings.referralRewardAmount} onChange={e => setSettings({ ...settings, referralRewardAmount: Number(e.target.value) })} style={{ ...inputStyle, width: 80 }} /></div>
            </div>
          </div>
        )}

        <div style={{ fontSize: 12, color: "#8a887f", marginBottom: 14, background: "#fff", border: "1px solid #eae6db", borderRadius: 8, padding: "10px 14px" }}>
          Tick everything this job needs and enter the real quantities — m², m, tonnes, days, whatever the item calls for. This is the only place pricing gets built; it all feeds the proposal and client total.
        </div>

        {sellTotal > 0 && (() => {
          const currentMarginPct = (profitTotal / sellTotal) * 100;
          const belowTarget = currentMarginPct < settings.targetMarginPct;
          return belowTarget ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#fdf1ef", border: "1.5px solid #c0392b", borderRadius: 8, padding: "12px 16px", marginBottom: 14 }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#c0392b", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>!</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#c0392b" }}>Margin is {currentMarginPct.toFixed(1)}% — below your {settings.targetMarginPct}% target</div>
                <div style={{ fontSize: 11.5, color: "#8a887f", marginTop: 2 }}>Gross profit on this job is currently {gbp(profitTotal)} on {gbp(sellTotal)} revenue. Check your sell rates or costs before sending this out.</div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#e7f0ea", border: "1px solid #1f5b3f44", borderRadius: 8, padding: "10px 16px", marginBottom: 14 }}>
              <CheckCircle2 size={18} color="#1f5b3f" />
              <div style={{ fontSize: 12.5, color: "#1f5b3f" }}>Margin is {currentMarginPct.toFixed(1)}% — on target ({settings.targetMarginPct}%+)</div>
            </div>
          );
        })()}

        <div className="responsive-flex">
          <div style={{ flex: 2, minWidth: 0 }}>
            <PricingCategoriesUI
              itemState={pricing.itemState}
              updateItem={updatePricingItem}
              poaState={pricing.poaState}
              togglePoa={togglePricingPoa}
              collapsed={pricing.collapsed}
              toggleCollapse={togglePricingCollapse}
            />

            <div style={{ background: "#fff", border: "1px solid #eae6db", borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Other / Custom Materials</div>
              <div style={{ fontSize: 12, color: "#8a887f", marginBottom: 14 }}>For when the customer picks their own product — fill in what you charge them and what it costs you, and it feeds into the total and profit just like everything else.</div>
              {(draft.pricing.customItems || []).map(c => {
                const qtyNum = Number(c.qty) || 0;
                const rateNum = Number(c.rate) || 0;
                const costNum = Number(c.cost) || 0;
                const lineProfit = qtyNum * (rateNum - costNum);
                return (
                  <div key={c.id} style={{ padding: "10px 0", borderBottom: "1px solid #f3f1e9" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <input value={c.label} onChange={e => updateCustomItem(c.id, { label: e.target.value })} placeholder="Product / description" style={{ ...inputStyle, flex: "1 1 180px" }} />
                      <input value={c.unit} onChange={e => updateCustomItem(c.id, { unit: e.target.value })} placeholder="unit" style={{ ...inputStyle, width: 60 }} />
                      <input type="number" inputMode="decimal" value={c.qty} onChange={e => updateCustomItem(c.id, { qty: e.target.value })} placeholder="qty" style={{ ...inputStyle, width: 60 }} />
                      <span style={{ fontSize: 11, color: "#9a978c" }}>£</span>
                      <input type="number" inputMode="decimal" value={c.rate} onChange={e => updateCustomItem(c.id, { rate: e.target.value })} placeholder="price" style={{ ...inputStyle, width: 70 }} />
                      <div style={{ width: 80, textAlign: "right", fontWeight: 700, fontSize: 13 }}>{gbp(qtyNum * rateNum)}</div>
                      <Trash2 size={14} color="#c0392b" style={{ cursor: "pointer" }} onClick={() => removeCustomItem(c.id)} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, color: "#9a978c" }}>Your cost £</span>
                      <input type="number" inputMode="decimal" value={c.cost} onChange={e => updateCustomItem(c.id, { cost: e.target.value })} placeholder="0.00" style={{ ...inputStyle, width: 65, padding: "5px 8px", fontSize: 12 }} />
                      <span style={{ fontSize: 11, color: "#9a978c" }}>/{c.unit || "item"} from supplier</span>
                      {qtyNum > 0 && c.label && (
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: lineProfit >= 0 ? "#1f5b3f" : "#c0392b", marginLeft: "auto" }}>Profit: {gbp(lineProfit)}</span>
                      )}
                    </div>
                  </div>
                );
              })}
              <button onClick={addCustomItem} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px dashed #ccc", borderRadius: 7, padding: "8px 12px", fontSize: 12.5, color: FOREST, marginTop: 10 }}><Plus size={14} /> Add Custom Material</button>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 300 }}>
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #eae6db", marginBottom: 16, overflow: "hidden" }}>
              <div style={{ display: "flex", borderBottom: "1px solid #eae6db" }}>
                <button onClick={() => setView("internal")} style={{ flex: 1, padding: 12, border: "none", background: view === "internal" ? FOREST : "#fff", color: view === "internal" ? "#fff" : INK, fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Eye size={14}/> Cost & Profit</button>
                <button onClick={() => setView("client")} style={{ flex: 1, padding: 12, border: "none", background: view === "client" ? FOREST : "#fff", color: view === "client" ? "#fff" : INK, fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><EyeOff size={14}/> Client Total</button>
              </div>
              {view === "internal" ? (
                <div style={{ padding: 20 }}>
                  {Object.entries(groupedByCategory).length === 0 && <div style={{ fontSize: 12.5, color: "#9a978c" }}>Tick items on the left to build the estimate.</div>}
                  {Object.entries(groupedByCategory).map(([cat, items]) => (
                    <RowS key={cat} label={cat} value={gbp(items.reduce((s, i) => s + i.sellTotal, 0))} />
                  ))}
                  {poaSelectedList.length > 0 && (
                    <div style={{ marginTop: 10, fontSize: 11.5, color: "#a06a12", background: "#fbf6ea", padding: "8px 10px", borderRadius: 6 }}>
                      Quote separately (POA): {poaSelectedList.join(", ")}
                    </div>
                  )}
                  <div style={{ borderTop: "1px solid #eae6db", margin: "10px 0" }} />
                  <RowS label="Selling Price (ex VAT)" value={gbp(sellTotal)} bold />
                  <RowS label="Your Cost (materials, labour, plant)" value={gbp(directCostTotal)} />
                  <div style={{ borderTop: "1px solid #eae6db", margin: "10px 0" }} />
                  <RowS label="Gross Profit" value={gbp(profitTotal)} bold tint={profitTotal >= 0 ? "#1f5b3f" : "#c0392b"} />
                  <RowS label="Margin" value={sellTotal > 0 ? `${((profitTotal / sellTotal) * 100).toFixed(1)}%` : "—"} tint={profitTotal >= 0 ? "#1f5b3f" : "#c0392b"} />
                </div>
              ) : (
                <div style={{ padding: 20 }}>
                  <RowS label="Subtotal (ex VAT)" value={gbp(sellTotal)} />
                  <RowS label={`VAT (${settings.vatPct}%)`} value={gbp(vat)} />
                  <div style={{ borderTop: "1px solid #eae6db", margin: "10px 0" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><div style={{ fontSize: 12.5, color: "#8a887f", fontWeight: 700 }}>TOTAL FOR CLIENT</div><div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: FOREST }}>{gbp(clientTotal)}</div></div>
                  {poaSelectedList.length > 0 && <div style={{ fontSize: 11, color: "#8a887f", marginTop: 10 }}>Plus items quoted separately: {poaSelectedList.join(", ")}</div>}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="top-btn" onClick={() => safeOpenDoc(() => generateMaterialScheduleDoc(draft))} style={{ flex: 1, padding: "11px", border: "1px solid #ddd8ca", borderRadius: 8, background: "#fff", fontSize: 12.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><FileDown size={14}/> Export PDF</button>
              <button onClick={() => { syncDraft(draft); setScreen("proposal"); }} style={{ flex: 1, padding: "11px", background: FOREST, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><FileSignature size={14}/> Create Proposal</button>
            </div>
          </div>
        </div>
        {toast && <Toast msg={toast} />}
        <DocPreviewModal doc={docPreview} onClose={() => setDocPreview(null)} />
        {editDetailsFor && <EditProjectDetailsModal project={editDetailsFor} onSave={saveProjectDetails} onClose={() => setEditDetailsFor(null)} />}
      </Shell>
    );
  }

  // ============================================================
  // ================= TEAM MODE: PROPOSAL =======================
  // ============================================================
  if (draft.signature.signed) {
    return (
      <Shell title="Proposal Accepted" subtitle="" right={ModeSwitch} screen={screen} setScreen={setScreen} onNewProject={startNewProject}>
        <div style={{ background: "#fff", borderRadius: 14, padding: 40, textAlign: "center", maxWidth: 480, margin: "40px auto", border: "1px solid #eae6db" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#e7f0ea", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}><CheckCircle2 size={32} color="#1f5b3f" /></div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Thank you, {draft.signature.clientName.split(" ")[0] || "there"}</div>
          <div style={{ fontSize: 13, color: "#8a887f", marginBottom: 14 }}>{draft.ref} · {draft.name}</div>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 18 }}>We look forward to building something exceptional together. The project is now live in your Client Portal.</div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: FOREST, marginBottom: 18 }}>{gbp(clientTotal)} <span style={{ fontSize: 12, color: "#8a887f", fontWeight: 400 }}>total investment</span></div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button onClick={() => setScreen("dashboard")} style={{ padding: "10px 20px", background: FOREST, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13 }}>Back to Dashboard</button>
            <button onClick={() => viewPortal(draft)} style={{ padding: "10px 20px", background: "#fff", color: FOREST, border: `1px solid ${FOREST}`, borderRadius: 8, fontWeight: 700, fontSize: 13 }}>View Client Portal</button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Proposal Builder" subtitle={`${draft.name} · ${draft.client} · built from your estimate`} right={ModeSwitch} screen={screen} setScreen={setScreen} onNewProject={startNewProject}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <button className="top-btn" onClick={() => setScreen("estimate")} style={{ padding: "9px 14px", border: "1px solid #ddd8ca", borderRadius: 8, background: "#fff", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}><ArrowLeft size={14}/> Back to Estimate</button>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="top-btn" onClick={() => openEditDetails(draft)} style={{ padding: "9px 14px", border: "1px solid #ddd8ca", borderRadius: 8, background: "#fff", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}><Pencil size={13}/> Edit Details</button>
          <button className="top-btn" onClick={() => safeOpenDoc(() => generateProposalDoc(draft, { sell: sellTotal, vat, total: clientTotal }, portfolioPhotos))} style={{ padding: "9px 16px", background: "#fff", color: FOREST, border: `1px solid ${FOREST}`, borderRadius: 8, fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
            <Eye size={14}/> Preview Full Proposal
          </button>
          <a
            href={draft.email ? `mailto:${encodeURIComponent(draft.email)}?subject=${encodeURIComponent(`Your Proposal from Northstone Design & Build — ${draft.name || "Your Project"}`)}&body=${encodeURIComponent(buildProposalEmailText(draft, { sell: sellTotal, vat, total: clientTotal }))}` : undefined}
            onClick={(e) => { if (!draft.email) { e.preventDefault(); flash("Add the client's email in the project details first"); } }}
            style={{ padding: "9px 16px", background: "#fff", color: FOREST, border: `1px solid ${FOREST}`, borderRadius: 8, fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}
          >
            <Mail size={14}/> Email Quote Summary (opens your Mail app)
          </a>
          <button
            className="top-btn"
            disabled={invitingClient}
            onClick={() => inviteClientToPortal(draft)}
            style={{ padding: "9px 16px", background: invitingClient ? "#ccc" : FOREST, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}
          >
            <UserPlus size={14}/> {invitingClient ? "Sending…" : draft.clientUserId ? "Resend Portal Invite" : "Invite Client to Portal"}
          </button>
        </div>
      </div>
      {sellTotal > 0 && profitTotal / sellTotal * 100 < settings.targetMarginPct && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#fdf1ef", border: "1.5px solid #c0392b", borderRadius: 8, padding: "10px 16px", marginBottom: 16 }}>
          <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#c0392b", color: "#fff", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>!</span>
          <div style={{ fontSize: 12.5, color: "#c0392b" }}>Margin on this job is {((profitTotal / sellTotal) * 100).toFixed(1)}% — below your {settings.targetMarginPct}% target. Worth a final look before this goes out.</div>
        </div>
      )}
      <div className="responsive-flex">
        <div style={{ flex: 1.3, minWidth: 0 }}>
          <div style={{ background: FOREST, borderRadius: 14, padding: 30, color: "#fff", marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", border: `1.5px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, fontFamily: "'Playfair Display', serif", fontWeight: 700 }}>N</div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 15, letterSpacing: 1 }}>NORTHSTONE DESIGN & BUILD</div>
            </div>
            <div style={{ fontSize: 11, letterSpacing: 2, color: GOLD, marginBottom: 8 }}>PROJECT PROPOSAL</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 700, marginBottom: 4 }}>{draft.name || "Untitled Project"}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 20 }}>Premium Outdoor Living Project</div>
            <div style={{ display: "flex", gap: 24, fontSize: 11.5, color: "rgba(255,255,255,0.65)" }}>
              <div>Project ID<br/><b style={{ color: "#fff" }}>{draft.ref}</b></div>
              <div>Prepared For<br/><b style={{ color: "#fff" }}>{draft.client}</b></div>
              <div>Valid Until<br/><b style={{ color: "#fff" }}>{draft.proposal.validityDays} days</b></div>
            </div>
          </div>
          <div style={{ background: "#fff", borderRadius: 12, padding: 22, border: "1px solid #eae6db", marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Welcome Message</div>
            <div style={{ fontSize: 13, color: "#555", lineHeight: 1.6 }}>{draft.proposal.welcomeMessage}</div>
            <div style={{ fontSize: 13, fontWeight: 700, margin: "18px 0 10px" }}>Project Highlights</div>
            {draft.proposal.highlights.map((h, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 6 }}><Check size={14} color="#1f5b3f" /> {h}</div>)}
          </div>
          <div style={{ background: "#fff", borderRadius: 12, padding: 22, border: "1px solid #eae6db", marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Scope of Works</div>
            {Object.entries(groupedByCategory).map(([cat, items]) => (
              <div key={cat} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>{cat}</div>
                {items.map(it => <div key={it.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "4px 0", color: "#555" }}><span>{it.rate.item} ({it.qty} {it.rate.unit})</span><span>{gbp(it.sellTotal)}</span></div>)}
              </div>
            ))}
          </div>
          <div style={{ background: "#fff", borderRadius: 12, padding: 22, border: "1px solid #eae6db" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Investment Summary</div>
            <RowS label="Subtotal (ex VAT)" value={gbp(sellTotal)} />
            <RowS label={`VAT (${settings.vatPct}%)`} value={gbp(vat)} />
            <div style={{ borderTop: "1px solid #eae6db", margin: "10px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}><div style={{ fontSize: 12.5, color: "#8a887f", fontWeight: 700 }}>TOTAL INVESTMENT</div><div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: FOREST }}>{gbp(clientTotal)}</div></div>
            <div style={{ fontSize: 12, color: "#8a887f", marginBottom: 8 }}>Estimated Duration: <b style={{ color: INK }}>{projectDurationWeeks(draft.proposal)} weeks</b> · Warranty: <b style={{ color: INK }}>{draft.proposal.warrantyYears} Year Guarantee</b></div>
            <div style={{ fontSize: 12, fontWeight: 700, marginTop: 12, marginBottom: 6 }}>Payment Schedule</div>
            {PAYMENT_STAGES.map(s => <div key={s} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "3px 0" }}><span>{s}</span><span style={{ fontWeight: 600 }}>{gbp(clientTotal / 4)}</span></div>)}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 300 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 18, border: "1px solid #eae6db", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Edit Proposal Content</div>
            <Field label="Welcome Message"><textarea style={{ ...inputStyle, minHeight: 70, width: "100%" }} value={draft.proposal.welcomeMessage} onChange={e => setDraft(d => ({ ...d, proposal: { ...d.proposal, welcomeMessage: e.target.value } }))} /></Field>
            <Field label="Estimated Project Duration (weeks)">
              <input
                type="number"
                min="1"
                step="0.5"
                style={{ ...inputStyle, width: 100 }}
                value={draft.proposal.durationWeeks}
                onChange={e => setDraft(d => ({ ...d, proposal: { ...d.proposal, durationWeeks: e.target.value === "" ? "" : Number(e.target.value) } }))}
              />
              <div style={{ fontSize: 11, color: "#9a978c", marginTop: 4 }}>Drives the Programme of Works page in the proposal document — each stage's duration is split proportionally from this total.</div>
            </Field>
            <Field label="Highlights">
              {draft.proposal.highlights.map((h, i) => (
                <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <input style={{ ...inputStyle, flex: 1 }} value={h} onChange={e => updateHighlight(i, e.target.value)} />
                  <X size={16} color="#c0392b" style={{ cursor: "pointer", alignSelf: "center" }} onClick={() => removeHighlight(i)} />
                </div>
              ))}
              <button onClick={addHighlight} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px dashed #ccc", borderRadius: 7, padding: "6px 10px", fontSize: 12, color: FOREST }}><Plus size={13} /> Add Highlight</button>
            </Field>
          </div>
          <div style={{ background: "#fff", borderRadius: 12, padding: 18, border: "1px solid #eae6db" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, marginBottom: 12 }}><FileSignature size={15} color={GOLD}/> Accept & Sign</div>
            <Field label="Client Name"><input style={{ ...inputStyle, width: "100%" }} value={draft.signature.clientName} onChange={e => setDraft(d => ({ ...d, signature: { ...d.signature, clientName: e.target.value } }))} placeholder="Type full name" /></Field>
            <Field label="Date"><input type="date" style={{ ...inputStyle, width: "100%" }} value={draft.signature.date} onChange={e => setDraft(d => ({ ...d, signature: { ...d.signature, date: e.target.value } }))} /></Field>
            <Field label="Signature (type name)"><input style={{ ...inputStyle, width: "100%", fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontSize: 18 }} value={draft.signature.typedSignature} onChange={e => setDraft(d => ({ ...d, signature: { ...d.signature, typedSignature: e.target.value } }))} placeholder="e.g. M. J. Harris" /></Field>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, margin: "10px 0", cursor: "pointer" }}>
              <Checkbox checked={draft.signature.agreed} onClick={() => setDraft(d => ({ ...d, signature: { ...d.signature, agreed: !d.signature.agreed } }))} /> I agree to the terms & conditions outlined in this proposal
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#8a887f", marginBottom: 12 }}><ShieldCheck size={13} /> Secure & legally binding acceptance</div>
            <button disabled={!draft.signature.clientName || !draft.signature.typedSignature || !draft.signature.agreed} onClick={signProposal} style={{ width: "100%", padding: 13, background: (!draft.signature.clientName || !draft.signature.typedSignature || !draft.signature.agreed) ? "#ccc" : FOREST, color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, fontSize: 14 }}>Accept Proposal & Sign</button>
          </div>
        </div>
      </div>
      {toast && <Toast msg={toast} />}
      <DocPreviewModal doc={docPreview} onClose={() => setDocPreview(null)} />
      {editDetailsFor && <EditProjectDetailsModal project={editDetailsFor} onSave={saveProjectDetails} onClose={() => setEditDetailsFor(null)} />}
    </Shell>
  );
}

// ============================================================
// JOB PRICING TOOL — detailed materials/labour/plant calculator
// with tiered rates, price ranges, suppliers & saved quotes.
// ============================================================
function PricingToolScreen({ ModeSwitch, onBack }) {
  const { user } = useAuth();
  const [tab, setTab] = useState("calc"); // calc | suppliers | saved
  const [itemState, setItemState] = useState(() => {
    const s = {};
    PRICING_CATEGORIES.forEach(cat => cat.items.forEach(it => { s[it.id] = defaultPricingItemState(it); }));
    return s;
  });
  const [poaState, setPoaState] = useState(() => {
    const s = {};
    POA_CATEGORIES.forEach(cat => { s[cat.id] = {}; cat.items.forEach(label => { s[cat.id][label] = false; }); });
    return s;
  });
  const [collapsed, setCollapsed] = useState({});
  const [contactInfo, setContactInfo] = useState({});
  const [quoteName, setQuoteName] = useState("");
  const [loadedTag, setLoadedTag] = useState("");
  const [savedKeys, setSavedKeys] = useState([]);
  const [toast, setToast] = useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2200); };

  useEffect(() => {
    (async () => {
      try {
        setContactInfo(await PricingToolData.fetchSupplierContacts());
      } catch (e) {}
    })();
  }, []);

  const updateItem = (id, patch) => setItemState(s => ({ ...s, [id]: { ...s[id], ...patch } }));
  const toggleCollapse = (catId) => setCollapsed(c => ({ ...c, [catId]: !c[catId] }));
  const toggleCheck = (id) => updateItem(id, { included: !itemState[id].included });

  const catSubtotal = (cat) => cat.items.reduce((sum, it) => {
    const st = itemState[it.id];
    return sum + (st.included ? (Number(st.qty) || 0) * (Number(st.rate) || 0) : 0);
  }, 0);
  const grandTotal = PRICING_CATEGORIES.reduce((s, c) => s + catSubtotal(c), 0);

  const poaSelected = useMemo(() => {
    const list = [];
    POA_CATEGORIES.forEach(cat => Object.entries(poaState[cat.id]).forEach(([label, v]) => { if (v) list.push(label); }));
    return list;
  }, [poaState]);

  const updateContact = async (supplierId, field, value) => {
    const updated = { ...contactInfo, [supplierId]: { ...(contactInfo[supplierId] || {}), [field]: value } };
    setContactInfo(updated);
    try { await PricingToolData.saveSupplierContact(supplierId, updated[supplierId]); flash("Contact saved"); } catch (e) { flash("Couldn't save that contact — check your connection"); }
  };

  const saveQuote = async () => {
    if (!quoteName.trim()) { flash("Enter a job/quote name first"); return; }
    try {
      await PricingToolData.saveQuote(quoteName.trim(), itemState, poaState, user?.id);
      setLoadedTag(`Loaded: ${quoteName.trim()}`);
      flash(`Quote saved: ${quoteName.trim()}`);
    } catch (e) { flash("Error saving quote"); }
  };
  const newQuote = () => {
    const s = {}; PRICING_CATEGORIES.forEach(cat => cat.items.forEach(it => { s[it.id] = defaultPricingItemState(it); }));
    setItemState(s);
    const p = {}; POA_CATEGORIES.forEach(cat => { p[cat.id] = {}; cat.items.forEach(label => { p[cat.id][label] = false; }); });
    setPoaState(p);
    setQuoteName(""); setLoadedTag("");
  };
  const loadSavedList = async () => {
    try {
      setSavedKeys(await PricingToolData.fetchSavedQuoteList());
    } catch (e) { setSavedKeys([]); }
  };
  const openQuote = async (id) => {
    try {
      const d = await PricingToolData.fetchSavedQuote(id);
      setItemState(d.itemState); setPoaState(d.poaState); setQuoteName(d.name); setLoadedTag(`Loaded: ${d.name}`);
      setTab("calc");
    } catch (e) { flash("Could not load quote"); }
  };
  const deleteQuote = async (id) => {
    try { await PricingToolData.deleteSavedQuote(id); loadSavedList(); } catch (e) { flash("Could not delete"); }
  };

  useEffect(() => { if (tab === "saved") loadSavedList(); }, [tab]);

  return (
    <div style={{ minHeight: "100vh", background: PARCHMENT, fontFamily: "'Inter', system-ui, sans-serif", color: INK, paddingBottom: 90 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; } button { font-family: inherit; cursor: pointer; }
        input:focus, select:focus { outline: 2px solid ${GOLD}44; border-color: ${GOLD}; }
        .cat-head:hover { background: #efe9da; } .tier-btn:hover { background: #efe9da; }
        .top-btn:hover { background: rgba(0,0,0,0.04); }
      `}</style>

      <div style={{ background: FOREST_DEEP, color: "#fff", padding: "22px 34px", borderBottom: `4px solid ${GOLD}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", border: `1.5px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, fontFamily: "'Playfair Display', serif", fontWeight: 700 }}>N</div>
            <div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700 }}>Job Pricing Tool</div>
              <div style={{ fontSize: 11, letterSpacing: 1.5, color: GOLD, textTransform: "uppercase" }}>Detailed labour, plant & materials calculator</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button className="top-btn" onClick={onBack} style={{ padding: "9px 14px", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 8, background: "transparent", color: "#fff", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}><ArrowLeft size={14}/> Dashboard</button>
            {ModeSwitch}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 2, background: "#16352a", padding: "0 34px" }}>
        {[["calc", "Calculator"], ["suppliers", "Suppliers"], ["saved", "Saved Quotes"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ background: "transparent", border: "none", color: tab === key ? "#fff" : "rgba(255,255,255,0.55)", fontSize: 14, letterSpacing: 0.3, padding: "12px 18px", borderBottom: tab === key ? `3px solid ${GOLD}` : "3px solid transparent", fontWeight: 700 }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: "22px 34px" }}>
        {tab === "calc" && (
          <>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: "#fff", border: "1px solid #eae6db", borderRadius: 8, padding: "12px 14px", marginBottom: 18 }}>
              <input value={quoteName} onChange={e => setQuoteName(e.target.value)} placeholder="Job / quote name (e.g. 14 Elm Street driveway)" style={{ ...inputStyle, flex: 1, minWidth: 200 }} />
              <button onClick={saveQuote} style={{ padding: "8px 14px", background: FOREST, color: "#fff", border: "none", borderRadius: 7, fontSize: 12.5, fontWeight: 700 }}>Save Quote</button>
              <button onClick={newQuote} style={{ padding: "8px 14px", background: "#fff", color: INK, border: "1px solid #ddd8ca", borderRadius: 7, fontSize: 12.5 }}>New / Clear</button>
              {loadedTag && <span style={{ fontSize: 12, color: "#8a887f" }}>{loadedTag}</span>}
            </div>

            {PRICING_CATEGORIES.map(cat => {
              const isCollapsed = collapsed[cat.id];
              return (
                <div key={cat.id} style={{ background: "#fff", border: "1px solid #eae6db", borderRadius: 10, marginBottom: 14, overflow: "hidden" }}>
                  <div className="cat-head" onClick={() => toggleCollapse(cat.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#f6f4ee", cursor: "pointer" }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{cat.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 700, color: "#1f5b3f" }}>{gbp(catSubtotal(cat))}</span>
                      {isCollapsed ? <ChevronRight size={15} color="#9a978c" /> : <ChevronDown size={15} color="#9a978c" />}
                    </div>
                  </div>
                  {!isCollapsed && (
                    <div style={{ padding: "4px 16px 12px" }}>
                      {cat.items.map(item => {
                        const st = itemState[item.id];
                        return (
                          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f3f1e9", flexWrap: "wrap", opacity: st.included ? 1 : 0.55 }}>
                            <Checkbox checked={st.included} onClick={() => toggleCheck(item.id)} />
                            <div style={{ flex: "1 1 200px", minWidth: 160 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{item.label}</div>
                              {item.flagged && <div style={{ fontSize: 11, color: "#a06a12", marginTop: 2 }}>⚠ {item.flagged}</div>}
                              {item.estimated && <div style={{ fontSize: 11, color: "#a06a12", marginTop: 2 }}>Tier prices estimated — edit rate if needed</div>}
                              {item.supplier && <div style={{ fontSize: 11, color: "#8a887f", marginTop: 2 }}>Supplier: {pricingSupplierName(item.supplier)}</div>}
                              {item.logistic && <div style={{ fontSize: 11, color: "#8a887f", marginTop: 2 }}>{item.logistic}</div>}
                            </div>

                            {/* rate control */}
                            {item.type === "tier" && (
                              <div style={{ display: "flex", gap: 4 }}>
                                {["Bronze", "Signature", "Prestige"].map(tier => (
                                  <button key={tier} className="tier-btn" onClick={() => updateItem(item.id, { tier, rate: item.tiers[tier] })} style={{ fontSize: 12, padding: "6px 9px", background: st.tier === tier ? FOREST : PARCHMENT, color: st.tier === tier ? "#fff" : INK, border: `1px solid ${st.tier === tier ? FOREST : "#ddd8ca"}`, borderRadius: 6 }}>
                                    {tier} £{item.tiers[tier]}
                                  </button>
                                ))}
                              </div>
                            )}
                            {item.type === "range" && (
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <input type="range" min={item.min} max={item.max} value={Number(st.rate) || item.min} onChange={e => updateItem(item.id, { rate: Number(e.target.value) })} style={{ width: 100, accentColor: GOLD }} />
                                <input type="number" inputMode="decimal" min={item.min} max={item.max} value={st.rate} onChange={e => updateItem(item.id, { rate: e.target.value })} style={{ ...inputStyle, width: 65 }} />
                              </div>
                            )}
                            {item.type === "fixed" && (
                              <input type="number" inputMode="decimal" value={st.rate} onChange={e => updateItem(item.id, { rate: e.target.value })} style={{ ...inputStyle, width: 65 }} />
                            )}
                            <span style={{ fontSize: 11.5, color: "#9a978c", width: 34 }}>/{item.unit}</span>

                            <input type="number" inputMode="decimal" min="0" value={st.qty} onChange={e => updateItem(item.id, { qty: e.target.value, included: Number(e.target.value) > 0 ? true : st.included })} placeholder={item.unit} style={{ ...inputStyle, width: 68 }} />
                            <div style={{ width: 85, textAlign: "right", fontWeight: 700, fontSize: 13.5 }}>{gbp(st.included ? (Number(st.qty) || 0) * (Number(st.rate) || 0) : 0)}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {POA_CATEGORIES.map(cat => {
              const isCollapsed = collapsed[cat.id];
              return (
                <div key={cat.id} style={{ background: "#fff", border: "1px solid #eae6db", borderRadius: 10, marginBottom: 14, overflow: "hidden" }}>
                  <div className="cat-head" onClick={() => toggleCollapse(cat.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#f6f4ee", cursor: "pointer" }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{cat.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>POA</span>
                      {isCollapsed ? <ChevronRight size={15} color="#9a978c" /> : <ChevronDown size={15} color="#9a978c" />}
                    </div>
                  </div>
                  {!isCollapsed && (
                    <div style={{ padding: "4px 16px 12px" }}>
                      {cat.items.map(label => (
                        <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f3f1e9" }}>
                          <Checkbox checked={!!poaState[cat.id][label]} onClick={() => setPoaState(p => ({ ...p, [cat.id]: { ...p[cat.id], [label]: !p[cat.id][label] } }))} />
                          <span style={{ fontSize: 13, flex: 1 }}>{label}</span>
                          <span style={{ fontSize: 10.5, background: GOLD, color: "#fff", padding: "2px 8px", borderRadius: 10 }}>Price on application</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {tab === "suppliers" && (
          <>
            <div style={{ fontSize: 13, color: "#8a887f", marginBottom: 16 }}>Approved material suppliers. Add phone/email once and they'll be remembered.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
              {PRICING_SUPPLIERS.map(s => {
                const c = contactInfo[s.id] || {};
                return (
                  <div key={s.id} style={{ background: "#fff", border: "1px solid #eae6db", borderRadius: 10, padding: 16 }}>
                    <span style={{ display: "inline-block", fontSize: 11, background: "#1f5b3f", color: "#fff", padding: "2px 8px", borderRadius: 10, marginBottom: 8 }}>✓ Approved</span>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 700 }}>{s.name}</div>
                    <div style={{ fontSize: 12.5, color: "#8a887f", marginBottom: 10 }}>{s.products}</div>
                    <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                      <label style={{ fontSize: 11, color: "#9a978c", width: 44 }}>Phone</label>
                      <input value={c.phone || ""} onChange={e => updateContact(s.id, "phone", e.target.value)} placeholder="07…" style={{ ...inputStyle, flex: 1, fontSize: 12.5 }} />
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <label style={{ fontSize: 11, color: "#9a978c", width: 44 }}>Email</label>
                      <input value={c.email || ""} onChange={e => updateContact(s.id, "email", e.target.value)} placeholder="name@company.com" style={{ ...inputStyle, flex: 1, fontSize: 12.5 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === "saved" && (
          <div>
            {savedKeys.length === 0 && <div style={{ fontSize: 13, color: "#9a978c" }}>No saved quotes yet — save one from the Calculator tab.</div>}
            {savedKeys.map(q => (
              <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #eae6db", borderRadius: 8, padding: "12px 14px", marginBottom: 8 }}>
                <div style={{ flex: 1, fontWeight: 600, fontSize: 13.5 }}>{q.name}</div>
                <button onClick={() => openQuote(q.id)} style={{ padding: "7px 14px", border: "1px solid #ddd8ca", background: "#fff", borderRadius: 7, fontSize: 12 }}>Open</button>
                <button onClick={() => deleteQuote(q.id)} style={{ padding: "7px 14px", border: "1px solid #c0392b", color: "#c0392b", background: "#fff", borderRadius: 7, fontSize: 12 }}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* sticky summary */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: FOREST_DEEP, color: "#fff", padding: "14px 34px", borderTop: `4px solid ${GOLD}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 0.5 }}>Job total (priced items)</div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 700 }}>{gbp(grandTotal)}</div>
        </div>
        {poaSelected.length > 0 && <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.75)", maxWidth: 420 }}>Quote separately (POA): {poaSelected.join(", ")}</div>}
      </div>
      {toast && <Toast msg={toast} />}
    </div>
  );
}
