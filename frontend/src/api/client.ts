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
    const csrfToken = getCookie("mc_csrf");
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
        throw new Error(errorMessage);
      }

      return (await response.json()) as T;
    } catch (err: any) {
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

