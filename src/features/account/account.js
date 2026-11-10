/**
 * The woman's account (alias + 6-digit PIN), created only when she asks for a lawyer.
 * The session token lives in this device's store; "wipe" and quick-exit remove it.
 * Every call goes to the same-origin staff API (see server/api/worker.js).
 *
 * @param {{
 *   base: string,                                   // "/api" ("" = no API: demo mode)
 *   store: ReturnType<import("../../core/store.js").createStore>,
 *   fetchImpl?: typeof fetch,
 * }} deps
 */
export function createAccount({ base, store, fetchImpl = globalThis.fetch?.bind(globalThis) }) {
  const KEY = "session";

  async function call(method, path, body, { auth = true } = {}) {
    const session = store.get(KEY, null);
    const headers = { "content-type": "application/json" };
    if (auth && session?.token) headers.authorization = `Bearer ${session.token}`;
    let res;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
    } catch {
      return { ok: false, status: 0, error: "network" };
    }
    if (res.status === 401 && auth && session) store.set(KEY, null); // expired or revoked
    let data = null;
    try {
      data = res.status === 204 ? null : await res.json();
    } catch {
      /* empty body */
    }
    return { ok: res.ok, status: res.status, error: data?.error, data };
  }

  function remember(res) {
    if (res.ok && res.data?.token) store.set(KEY, { token: res.data.token, username: res.data.username });
    return res;
  }

  return {
    enabled: base !== "",
    signedIn: () => !!store.get(KEY, null)?.token,
    username: () => store.get(KEY, null)?.username || "",
    signup: async (form) => remember(await call("POST", "/v1/users", form, { auth: false })),
    login: async (form) => remember(await call("POST", "/v1/login", form, { auth: false })),
    async logout() {
      await call("POST", "/v1/logout");
      store.set(KEY, null);
    },
    /** Delete the account and every case attached to it, then forget the session. */
    async deleteAccount() {
      const res = await call("DELETE", "/v1/me");
      if (res.ok) store.set(KEY, null);
      return res;
    },
    me: () => call("GET", "/v1/me"),
    openCase: (topic, message) => call("POST", "/v1/cases", { topic, message }),
    messages: (caseId, after = 0) => call("GET", `/v1/cases/${caseId}/messages?after=${after}`),
    send: (caseId, text) => call("POST", `/v1/cases/${caseId}/messages`, { text }),
  };
}
