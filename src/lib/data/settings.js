import { supabase } from "../supabaseClient";

function must(error) {
  if (error) throw error;
}

const mapSettings = (s) => ({
  vatPct: Number(s.vat_pct),
  referralRewardAmount: Number(s.referral_reward_amount),
  targetMarginPct: Number(s.target_margin_pct),
});

export async function fetchSettings() {
  const { data, error } = await supabase.from("company_settings").select("*").single();
  must(error);
  return mapSettings(data);
}

export async function saveSettings({ vatPct, referralRewardAmount, targetMarginPct }) {
  const { error } = await supabase
    .from("company_settings")
    .update({ vat_pct: vatPct, referral_reward_amount: referralRewardAmount, target_margin_pct: targetMarginPct })
    .eq("id", true);
  must(error);
}
