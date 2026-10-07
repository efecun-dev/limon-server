export interface ApiLogItem {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  ip: string;
  status: number;
  durationMs: number;
  userAgent: string;
  authType: string;
  error?: string;
}

// In-memory ring buffer (keeps last 500 API logs in memory)
const MAX_LOGS = 500;

interface GlobalWithLogs {
  apiLogs?: ApiLogItem[];
}

const globalStore = global as unknown as GlobalWithLogs;
if (!globalStore.apiLogs) {
  globalStore.apiLogs = [];
}

export function addApiLog(log: Omit<ApiLogItem, "id" | "timestamp"> & { id?: string; timestamp?: string }): ApiLogItem {
  const item: ApiLogItem = {
    id: log.id || Math.random().toString(36).substring(2, 10) + Date.now().toString(36),
    timestamp: log.timestamp || new Date().toISOString(),
    method: log.method.toUpperCase(),
    path: log.path,
    ip: log.ip || "127.0.0.1",
    status: log.status || 200,
    durationMs: Math.max(1, Math.round(log.durationMs || 1)),
    userAgent: log.userAgent || "Unknown",
    authType: log.authType || "Açık",
    error: log.error,
  };

  if (!globalStore.apiLogs) {
    globalStore.apiLogs = [];
  }

  // Prepend to list (newest first)
  globalStore.apiLogs.unshift(item);

  // Trim to MAX_LOGS
  if (globalStore.apiLogs.length > MAX_LOGS) {
    globalStore.apiLogs.length = MAX_LOGS;
  }

  return item;
}

export function getApiLogs(options?: {
  limit?: number;
  method?: string;
  status?: string;
  search?: string;
}): ApiLogItem[] {
  let logs = globalStore.apiLogs || [];

  if (options?.method && options.method !== "ALL") {
    logs = logs.filter((l) => l.method === options.method);
  }

  if (options?.status && options.status !== "ALL") {
    if (options.status === "2xx") {
      logs = logs.filter((l) => l.status >= 200 && l.status < 300);
    } else if (options.status === "4xx") {
      logs = logs.filter((l) => l.status >= 400 && l.status < 500);
    } else if (options.status === "5xx") {
      logs = logs.filter((l) => l.status >= 500);
    }
  }

  if (options?.search) {
    const q = options.search.toLowerCase();
    logs = logs.filter(
      (l) =>
        l.path.toLowerCase().includes(q) ||
        l.ip.toLowerCase().includes(q) ||
        l.userAgent.toLowerCase().includes(q) ||
        l.method.toLowerCase().includes(q)
    );
  }

  const limit = options?.limit || 100;
  return logs.slice(0, limit);
}

export function clearApiLogs(): void {
  globalStore.apiLogs = [];
}

export function extractClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0].trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const cfConnectingIp = headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp.trim();

  return "127.0.0.1";
}
