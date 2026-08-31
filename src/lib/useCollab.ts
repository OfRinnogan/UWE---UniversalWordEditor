import { useCallback, useEffect, useRef, useState } from "react";
import { getStoredToken } from "@/lib/tokenStorage";

export interface PresenceUser {
  user_id: string;
  name: string;
}

interface RemoteContentUpdate {
  content_html: string | null;
  title: string | null;
  from_user_name: string;
}

interface UseCollabOptions {
  documentId: string | undefined;
  enabled: boolean;
  currentUserId: string | undefined;
  // Called with a remote update ONLY once it's safe to apply (see the focus check
  // inside the hook) — the caller just needs to splice it into the DOM/state.
  onRemoteContent: (update: RemoteContentUpdate) => void;
  // Whether the local editor currently has focus / an active selection — checked at
  // the moment a remote update arrives, so it's read fresh via a ref, not a stale
  // closure value.
  isLocalEditorActive: () => boolean;
}

type ConnectionState = "connecting" | "connected" | "disconnected";

export function useCollab({
  documentId,
  enabled,
  currentUserId,
  onRemoteContent,
  isLocalEditorActive,
}: UseCollabOptions) {
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const pendingRemoteRef = useRef<RemoteContentUpdate | null>(null);
  const onRemoteContentRef = useRef(onRemoteContent);
  const isLocalEditorActiveRef = useRef(isLocalEditorActive);
  onRemoteContentRef.current = onRemoteContent;
  isLocalEditorActiveRef.current = isLocalEditorActive;

  useEffect(() => {
    if (!documentId || !enabled) return;

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let socket: WebSocket | null = null;

    function tryApplyPending() {
      if (pendingRemoteRef.current && !isLocalEditorActiveRef.current()) {
        onRemoteContentRef.current(pendingRemoteRef.current);
        pendingRemoteRef.current = null;
      }
    }

    // If a remote update arrived while the person was actively typing, keep
    // checking (on a light interval) until they pause/blur, then apply it —
    // rather than dropping it or risking overwriting their in-progress edit.
    const pendingCheckInterval = setInterval(tryApplyPending, 800);

    function connect() {
      if (cancelled) return;
      setConnectionState("connecting");

      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${location.host}/ws/documents/${documentId}`);
      socket = ws;
      wsRef.current = ws;

      ws.onopen = () => {
        const token = getStoredToken();
        ws.send(JSON.stringify({ type: "auth", token }));
      };

      ws.onmessage = (event) => {
        let msg: any;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        if (msg.type === "connected") {
          setConnectionState("connected");
        } else if (msg.type === "presence") {
          setPresence(
            (msg.users as PresenceUser[]).filter((u) => u.user_id !== currentUserId)
          );
        } else if (msg.type === "content") {
          if (msg.from_user_id === currentUserId) return; // don't re-apply our own echo (e.g. from a restore)
          const update: RemoteContentUpdate = {
            content_html: msg.content_html ?? null,
            title: msg.title ?? null,
            from_user_name: msg.from_user_name ?? "Alguém",
          };
          pendingRemoteRef.current = update;
          tryApplyPending();
        }
        // {"type": "error", ...} — a rejected content send (e.g. role changed to
        // viewer mid-session); nothing to reconcile client-side beyond ignoring it.
      };

      ws.onclose = (event) => {
        wsRef.current = null;
        if (cancelled) return;
        setConnectionState("disconnected");
        // 4001/4003/4004 are auth/permission/not-found — the server has already
        // rejected us for a reason a reconnect won't fix (e.g. access revoked).
        if (event.code >= 4001 && event.code <= 4004) return;
        reconnectTimer = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      cancelled = true;
      clearInterval(pendingCheckInterval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, enabled, currentUserId]);

  const sendContent = useCallback((content_html: string, title: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "content", content_html, title }));
  }, []);

  return { presence, connectionState, sendContent };
}
