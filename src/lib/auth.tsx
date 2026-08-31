import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { getStoredToken, setStoredToken, clearStoredToken } from "@/lib/tokenStorage";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

interface AuthResponse {
  token: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  // Set when the initial session check fails for a reason OTHER than an invalid/
  // expired token (network error, backend briefly down, unrelated 500) — the token
  // is kept in this case, since we simply couldn't confirm it one way or the other.
  connectionError: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUser() {
      if (!token) {
        setUser(null);
        setConnectionError(false);
        setIsLoading(false);
        return;
      }

      setConnectionError(false);
      try {
        // Goes through the shared api.ts layer (not a raw fetch) so it attaches the
        // Authorization header the same consistent way every other request does.
        const currentUser = await apiGet<AuthUser>("/auth/me");
        if (!cancelled) setUser(currentUser);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          // Token is genuinely invalid/expired — this is a real logout.
          clearStoredToken();
          setToken(null);
          setUser(null);
        } else {
          // Couldn't reach the backend or got an unrelated server error — this does
          // NOT mean the session is invalid, so the token is left alone. Wiping it
          // here would silently log someone out just because of a network blip.
          setConnectionError(true);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadCurrentUser();
    return () => {
      cancelled = true;
    };
  }, [token, retryCount]);

  async function login(email: string, password: string) {
    const data = await apiPost<AuthResponse>("/auth/login", { email, password });
    setStoredToken(data.token);
    setToken(data.token);
    setUser(data.user);
  }

  async function register(email: string, password: string, name: string) {
    const data = await apiPost<AuthResponse>("/auth/register", { email, password, name });
    setStoredToken(data.token);
    setToken(data.token);
    setUser(data.user);
  }

  function logout() {
    clearStoredToken();
    setToken(null);
    setUser(null);
  }

  function retry() {
    setIsLoading(true);
    setRetryCount((c) => c + 1);
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, connectionError, login, register, logout, retry }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
