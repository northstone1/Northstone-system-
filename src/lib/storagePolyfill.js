// Temporary bridge so the prototype's `window.storage.*` calls keep working
// outside the claude.ai sandbox that originally provided that API.
// Backed by localStorage for now. This is scaffolding, not the final data
// layer — real persistence should move to Supabase (see src/lib/supabaseClient.js)
// as each feature (projects, leads, quotes, etc.) is migrated.
const PREFIX = "northstone:";

function makeLocalStorageBackend() {
  return {
    async get(key) {
      const raw = window.localStorage.getItem(PREFIX + key);
      return raw === null ? null : { value: raw };
    },
    async set(key, value) {
      window.localStorage.setItem(PREFIX + key, value);
    },
    async delete(key) {
      window.localStorage.removeItem(PREFIX + key);
    },
    async list(prefix) {
      const keys = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const fullKey = window.localStorage.key(i);
        if (fullKey && fullKey.startsWith(PREFIX + prefix)) {
          keys.push(fullKey.slice(PREFIX.length));
        }
      }
      return { keys };
    },
  };
}

if (typeof window !== "undefined" && !window.storage) {
  window.storage = makeLocalStorageBackend();
}
