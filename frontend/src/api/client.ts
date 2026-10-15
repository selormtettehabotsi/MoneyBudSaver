/**
 * Robust API Client with Cookie Authentication, Automatic CSRF Token Injection,
 * and Cold-Start Detection with Exponential Backoff Retries.
 */

let onServerColdStartChange: ((isWarming: boolean, retryCount: number, error?: string | null) => void) | null = null;

export function registerServerStatusListener(listener: (isWarming: boolean, retryCount: number, error?: string | null) => void) {
  onServerColdStartChange = listener;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  if (match) return match[2];
  return null;
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {},
  maxRetries: number = 3
): Promise<T> {
  const headers = new Headers(options.headers || {});
  
  // Set Content-Type if body is JSON
  if (options.body && typeof options.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Double-Submit CSRF Token on mutation requests
  const method = (options.method || "GET").toUpperCase();
  if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    let csrfToken = getCookie("mc_csrf");
    if (!csrfToken && !endpoint.includes("/auth/login") && !endpoint.includes("/auth/register") && !endpoint.includes("/auth/csrf")) {
      try {
        const csrfRes = await fetch("/api/v1/auth/csrf", { credentials: "include" });
        if (csrfRes.ok) {
          const csrfData = await csrfRes.json();
          if (csrfData?.csrf_token) {
            csrfToken = csrfData.csrf_token;
          }
        }
      } catch {}
      if (!csrfToken) {
        csrfToken = getCookie("mc_csrf");
      }
    }
    if (csrfToken && !headers.has("X-CSRF-Token")) {
      headers.set("X-CSRF-Token", csrfToken);
    }
  }

  const fetchOptions: RequestInit = {
    ...options,
    headers,
    credentials: "include", // Send SameSite=Lax HttpOnly cookies
  };

  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const response = await fetch(endpoint, fetchOptions);

      // Server is awake and responding
      if (onServerColdStartChange) {
        onServerColdStartChange(false, 0, null);
      }

      if (response.status === 204) {
        return null as unknown as T;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Request failed" }));
        const errorMessage = errorData.detail || errorData.message || `HTTP ${response.status} Error`;

        // If CSRF expired or missing on mutation request, refresh token once and retry
        if (response.status === 403 && typeof errorMessage === "string" && errorMessage.toLowerCase().includes("csrf") && attempt === 0) {
          try {
            const csrfRes = await fetch("/api/v1/auth/csrf", { credentials: "include" });
            if (csrfRes.ok) {
              const csrfData = await csrfRes.json();
              const freshToken = csrfData?.csrf_token || getCookie("mc_csrf");
              if (freshToken) {
                headers.set("X-CSRF-Token", freshToken);
                attempt++;
                continue;
              }
            }
          } catch {}
        }

        const err: any = new Error(errorMessage);
        err.status = response.status;
        err.requestId = errorData.request_id;
        throw err;
      }

      return (await response.json()) as T;
    } catch (err: any) {
      // Don't retry client errors (400, 401, 403, 404, 422) except potential cold start or 5xx/network errors
      if (err.status && err.status >= 400 && err.status < 500 && err.status !== 408) {
        throw err;
      }

      // If network error, 502/503/504, or cold start
      attempt++;
      if (attempt <= maxRetries) {
        if (onServerColdStartChange) {
          onServerColdStartChange(true, attempt, null);
        }
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 6000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        if (onServerColdStartChange) {
          onServerColdStartChange(false, 0, err?.message || "Server connection failed");
        }
        throw err;
      }
    }
  }

  throw new Error("Unable to reach server after retries.");
}

