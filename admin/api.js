const BASE = "/api/v1/staff";

/** Fetch JSON from the staff API. Throws an Error with `.status` on any non-2xx. */
export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "same-origin",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok)
    throw Object.assign(new Error(`HTTP ${res.status}`), {
      status: res.status,
      body: () => res.json().catch(() => ({})),
    });
  return res.status === 204 ? null : res.json();
}

/** A calm, specific message for each failure. */
export function errorText(err) {
  if (err.status === 401) return "انتهت جلستك. حدّثي الصفحة لتسجيل الدخول من جديد.";
  if (err.status === 403) return "ما عندك صلاحية لهاد الإجراء.";
  if (err.status === 409) return "هاي الحالة صارت مع محامية ثانية أو انغلقت.";
  if (err.status === 429) return "طلبات كتيرة بوقت قصير. استني شوي.";
  return "في مشكلة بالاتصال. بنحاول من جديد تلقائياً.";
}
