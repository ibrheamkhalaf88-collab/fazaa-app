/**
 * Shared shapes for the answer pipeline. This file has no runtime code; it exists
 * so editors (and reviewers) get one definition of what an answer looks like.
 *
 * @typedef {Object} Answer
 * @property {string}   lead      One reassuring opening sentence.
 * @property {string[]} steps     2-4 safe, concrete actions.
 * @property {string}   note      Legal note or caveat (may be empty).
 * @property {string[]} cites     Article ids from src/data/law (never invented).
 * @property {boolean} [general]  True when this is a general explanation, not a statute citation.
 * @property {string}  [topic]    Topic label passed to the lawyer hand-off.
 * @property {boolean} [sos]      Show the "open safety plan" button.
 * @property {"rules"|"ai"} source  Where the answer came from; shown to the user.
 * @property {string}  [closing]  A short line of hope at the end.
 * @property {"chat"}  [kind]     A conversational reply (greeting etc.): no law / steps sections.
 * @property {[string, string][]} [chips]  Suggested topics [label, question] (chat replies).
 *
 * @typedef {Object} AskContext
 * @property {string} country     "ps-wb" | "ps-gaza"
 */
export {};
