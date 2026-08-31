import type { PresenceUser } from "@/lib/useCollab";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-red-500", "bg-orange-500", "bg-amber-500", "bg-emerald-500",
  "bg-teal-500", "bg-blue-500", "bg-indigo-500", "bg-purple-500", "bg-pink-500",
];

function colorFor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

interface PresenceAvatarsProps {
  users: PresenceUser[];
  connectionState: "connecting" | "connected" | "disconnected";
}

export function PresenceAvatars({ users, connectionState }: PresenceAvatarsProps) {
  if (users.length === 0 && connectionState === "connected") return null;

  return (
    <div className="flex items-center gap-1.5" data-testid="presence-indicator">
      <span
        className={`size-1.5 rounded-full ${
          connectionState === "connected"
            ? "bg-emerald-500"
            : connectionState === "connecting"
              ? "bg-amber-500"
              : "bg-muted-foreground"
        }`}
        title={
          connectionState === "connected"
            ? "Colaboração ao vivo ativa"
            : connectionState === "connecting"
              ? "Conectando à colaboração ao vivo..."
              : "Colaboração ao vivo desconectada — tentando reconectar"
        }
      />
      {users.length > 0 && (
        <div className="flex -space-x-1.5" data-testid="presence-avatars">
          {users.slice(0, 4).map((u) => (
            <div
              key={u.user_id}
              data-testid={`presence-avatar-${u.user_id}`}
              title={u.name}
              className={`flex size-6 items-center justify-center rounded-full border-2 border-card text-[10px] font-semibold text-white ${colorFor(u.user_id)}`}
            >
              {initials(u.name)}
            </div>
          ))}
          {users.length > 4 && (
            <div className="flex size-6 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-semibold text-muted-foreground">
              +{users.length - 4}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
