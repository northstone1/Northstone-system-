import { supabase } from "../supabaseClient";
import { uploadPhoto, deletePhoto, getPublicPhotoUrl, PORTFOLIO_PHOTOS_BUCKET } from "./storage";

function must(error) {
  if (error) throw error;
}

// portfolio-photos is a public bucket, so the URL is resolvable
// synchronously right away — no signed-URL round trip needed for these.
const mapPhoto = (p) => ({ id: p.id, path: p.storage_path, url: getPublicPhotoUrl(p.storage_path), caption: p.caption || "" });

export async function fetchPortfolioPhotos() {
  const { data, error } = await supabase.from("portfolio_photos").select("*").order("created_at", { ascending: false });
  must(error);
  return data.map(mapPhoto);
}

export async function addPortfolioPhotos(files) {
  const uploaded = [];
  for (const file of Array.from(files || [])) {
    const path = await uploadPhoto(PORTFOLIO_PHOTOS_BUCKET, "", file);
    const { data, error } = await supabase.from("portfolio_photos").insert({ storage_path: path, caption: "" }).select().single();
    must(error);
    uploaded.push(mapPhoto(data));
  }
  return uploaded;
}

export async function updatePortfolioCaption(id, caption) {
  const { error } = await supabase.from("portfolio_photos").update({ caption }).eq("id", id);
  must(error);
}

export async function removePortfolioPhoto(id, path) {
  const { error } = await supabase.from("portfolio_photos").delete().eq("id", id);
  must(error);
  if (path) await deletePhoto(PORTFOLIO_PHOTOS_BUCKET, path);
}
