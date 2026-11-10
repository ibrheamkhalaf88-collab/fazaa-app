/**
 * Gatekeeper for answers that come from OUTSIDE the app (a language model).
 * The model's output is untrusted: this function rebuilds a clean Answer from it
 * and rejects anything that breaks the rules below. The UI renders only the
 * result, never the raw payload.
 *
 * Rules:
 *  - every cited article id must exist in the local law corpus (no invented citations);
 *  - length limits on every field (a runaway or hijacked reply cannot flood the chat);
 *  - plain text only (the UI uses textContent, but we strip markup characters anyway);
 *  - at least one step.
 */

const LIMITS = { lead: 300, step: 240, note: 600, steps: 5, cites: 4, topic: 40 };

const clean = (v, max) =>
  typeof v === "string"
    ? v
        .replace(/[\u0000-\u001F\u007F<>]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";

/**
 * @param {unknown} raw
 * @param {{articleIds: string[]}} opts  ids the answer is allowed to cite
 * @returns {import("./types.js").Answer}
 * @throws {Error} with a short machine-readable reason
 */
export function validateAnswer(raw, { articleIds }) {
  if (!raw || typeof raw !== "object") throw new Error("not-an-object");
  const a = /** @type {Record<string, unknown>} */ (raw);

  const lead = clean(a.lead, LIMITS.lead);
  if (!lead) throw new Error("missing-lead");

  const steps = (Array.isArray(a.steps) ? a.steps : [])
    .map((s) => clean(s, LIMITS.step))
    .filter(Boolean)
    .slice(0, LIMITS.steps);
  if (steps.length === 0) throw new Error("missing-steps");

  const cites = [...new Set(Array.isArray(a.cites) ? a.cites.map(String) : [])];
  if (cites.length > LIMITS.cites) throw new Error("too-many-cites");
  const unknown = cites.find((id) => !articleIds.includes(id));
  if (unknown) throw new Error(`unknown-article:${unknown}`);

  return {
    lead,
    steps,
    note: clean(a.note, LIMITS.note),
    cites,
    sos: a.sos === true,
    ...(typeof a.topic === "string" && a.topic ? { topic: clean(a.topic, LIMITS.topic) } : {}),
    source: "ai",
  };
}
