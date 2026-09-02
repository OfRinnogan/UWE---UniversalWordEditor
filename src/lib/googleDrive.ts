import { apiPost } from "@/lib/api";

export async function startGoogleConnect(): Promise<void> {
  const { ticket } = await apiPost<{ ticket: string }>("/integrations/google/start");
  // Full navigation, not a fetch — the browser needs to actually leave the SPA and
  // follow Google's redirect chain, which a background XHR/fetch can't do.
  window.location.href = `/api/integrations/google/connect?ticket=${encodeURIComponent(ticket)}`;
}
