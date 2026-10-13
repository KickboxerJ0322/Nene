import { GoogleAuth } from "google-auth-library";

export const DAILY_SESSION_LIMIT = 10;
export const SESSION_DURATION_MS = 3 * 60 * 1000;
const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/datastore"] });

export function japanDate(now = new Date()) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Atomically create one of ten shared slots. Firestore rejects duplicate IDs,
// including concurrent requests from different Cloud Run instances.
export async function reserveDailySlot({ now = new Date(), client, projectId } = {}) {
  projectId ||= process.env.GOOGLE_CLOUD_PROJECT || await auth.getProjectId();
  client ||= await auth.getClient();
  if (!projectId) throw new Error("Google Cloud project is not configured.");
  const date = japanDate(now);
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/nene_usage_slots`;
  for (let slot = 1; slot <= DAILY_SESSION_LIMIT; slot += 1) {
    try {
      await client.request({
        url,
        method: "POST",
        params: { documentId: `${date}-${slot}` },
        data: { fields: { reservedAt: { timestampValue: now.toISOString() } } },
        timeout: 10000,
        retry: false,
      });
      return { date, slot };
    } catch (error) {
      if (error.response?.status === 409) continue;
      throw error; // Fail closed if storage or authentication is unavailable.
    }
  }
  return null;
}
