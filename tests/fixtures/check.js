/**
 * Shared checker for the assistant evaluation set (tests and scripts/assistant-eval.mjs).
 * Returns a list of problems ([] = the reply meets every expectation).
 */
export function checkAnswer(a, exp = {}, memory = null) {
  const problems = [];
  const text = (v) => (Array.isArray(v) ? v.join(" | ") : v || "");
  if (exp.none) {
    if (a !== null) problems.push("expected the not-covered screen");
    return problems;
  }
  if (!a) return ["no reply (not-covered screen)"];
  const ask = [a.ask, a.safetyAsk].filter(Boolean).join(" ");
  if (exp.kind && a.kind !== exp.kind) problems.push(`kind ${a.kind} != ${exp.kind}`);
  if (exp.sos !== undefined && Boolean(a.sos) !== exp.sos)
    problems.push(`sos ${Boolean(a.sos)} != ${exp.sos}`);
  if (exp.lead && !exp.lead.test(a.lead)) problems.push(`lead ${exp.lead} ✗ «${a.lead}»`);
  if (exp.notLead && exp.notLead.test(a.lead))
    problems.push(`lead must not match ${exp.notLead}: «${a.lead}»`);
  if (exp.ask && !exp.ask.test(ask)) problems.push(`ask ${exp.ask} ✗ «${ask}»`);
  if (exp.notAsk && exp.notAsk.test(ask)) problems.push(`ask must not match ${exp.notAsk}: «${ask}»`);
  const opts = text(a.options || a.steps);
  if (exp.options && !exp.options.test(opts)) problems.push(`options ${exp.options} ✗ «${opts}»`);
  if (exp.notOptions && exp.notOptions.test(opts))
    problems.push(`options must not match ${exp.notOptions}: «${opts}»`);
  if (exp.noOptions && (a.options || []).length) problems.push(`expected no options, got «${opts}»`);
  const scope = text(a.scope);
  if (exp.scope && !exp.scope.test(scope)) problems.push(`scope ${exp.scope} ✗ «${scope}»`);
  for (const id of exp.cites || [])
    if (!(a.cites || []).includes(id)) problems.push(`missing cite ${id} (got ${text(a.cites)})`);
  for (const id of exp.notCites || [])
    if ((a.cites || []).includes(id) || (a.related || []).includes(id)) problems.push(`must not cite ${id}`);
  for (const id of exp.related || [])
    if (!(a.related || []).includes(id) && !(a.cites || []).includes(id))
      problems.push(`missing text ${id} (related ${text(a.related)})`);
  if (exp.mem && memory) {
    const r = exp.mem(memory);
    if (r !== true) problems.push(`memory: ${r}`);
  }
  return problems;
}

/** Sentences of a reply, to measure repetition across a conversation. */
export const sentences = (a) =>
  a
    ? `${a.lead || ""}`
        .split(/(?<=[.؟!])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 8)
    : [];
