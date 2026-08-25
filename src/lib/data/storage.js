import { supabase } from "../supabaseClient";

export const PROJECT_PHOTOS_BUCKET = "project-photos"; // private: survey/site-update/design-visual photos
export const PORTFOLIO_PHOTOS_BUCKET = "portfolio-photos"; // public read: proposal "design inspiration" gallery

function resizeImageFile(file, maxWidth = 1400, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not process that image"))), "image/jpeg", quality);
      };
      img.onerror = () => reject(new Error("Could not read that image"));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.readAsDataURL(file);
  });
}

// Resizes/compresses client-side, then uploads to Storage. Returns the
// storage path to save on the owning row (never the file itself).
export async function uploadPhoto(bucket, folder, file, { maxWidth, quality } = {}) {
  const blob = await resizeImageFile(file, maxWidth, quality);
  const path = `${folder ? folder + "/" : ""}${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  return path;
}

export async function deletePhoto(bucket, path) {
  if (!path) return;
  await supabase.storage.from(bucket).remove([path]);
}

// Recursively removes every object under a folder. Storage's list() only
// returns one level at a time, so this walks subfolders itself — used to
// clean up a project's survey/visuals/update photos (all stored under
// "<projectId>/...") when the project itself is permanently deleted, since
// nothing in the DB schema cascades into Storage.
export async function deleteFolder(bucket, folder) {
  const { data, error } = await supabase.storage.from(bucket).list(folder);
  if (error || !data?.length) return;
  const filePaths = [];
  for (const entry of data) {
    const path = `${folder}/${entry.name}`;
    if (entry.id) filePaths.push(path);
    else await deleteFolder(bucket, path);
  }
  if (filePaths.length) await supabase.storage.from(bucket).remove(filePaths);
}

// project-photos is private — every display needs a signed URL. Cached
// in-memory (per path) so re-rendering the same photo doesn't refetch.
const signedUrlCache = new Map();

export async function getSignedPhotoUrl(bucket, path, expiresIn = 3600) {
  if (!path) return null;
  const key = `${bucket}:${path}`;
  const cached = signedUrlCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.url;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw error;
  signedUrlCache.set(key, { url: data.signedUrl, expiresAt: Date.now() + expiresIn * 1000 });
  return data.signedUrl;
}

// portfolio-photos is public — no signing needed, this is just string
// construction (no network call).
export function getPublicPhotoUrl(path) {
  if (!path) return null;
  return supabase.storage.from(PORTFOLIO_PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl;
}
