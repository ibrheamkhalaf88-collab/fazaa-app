# Safety texts: pending professional review

Status: **NOT REVIEWED** by a domestic-violence / mental-health specialist. Written 2026-11-12 by the development
team from general safety-planning principles. Do not mark anything "reviewed" here until a qualified person has
signed it off (name, role, date).

| Item | File | What to review |
| --- | --- | --- |
| Immediate-danger reply | `src/ai/danger.js` `immediateReply` | Order of steps; "call if you can do it safely"; "do not confront, do not collect evidence if unsafe"; the note that the app cannot call anyone |
| Self-harm reply | `src/ai/danger.js` `selfHarmReply` | Wording; whether to ask "are you alone now?"; the mental-health line is shown only when a VERIFIED one exists |
| Indirect self-harm question | `src/ai/danger.js` `SELF_HARM_CHECK` | The direct question «هل عم تفكري تأذي حالك؟» and the follow-ups to «آه» / «لا» (`src/ai/answerer.js`) |
| Forced marriage (and the question for a minor whose marriage is arranged) | `src/ai/danger.js` | Advice for minors, who to suggest talking to |
| One safety question after past / unclear violence | `SAFETY_QUESTION` | Asked once per session; «لا» triggers the immediate-danger reply |
| Phrase lists (severe, violence, self-harm, indirect, negation, past, legal question, third person) | `src/ai/danger.js` | False negatives are the main risk: add the expressions women actually use (both regions) |
| Listening / understanding replies (offline) | `src/ai/conversation.js` `localTalk` | Tone, the one question chosen, options offered for "steps" |
| AI conversation prompt | `server/ai-proxy/worker.js` `TALK_PROMPT` | Rules for listening, no pressure, no promises, no diagnosis |
| Emergency numbers 100 / 101 / 102 | `src/data/contacts.js` | Confirm for each region and that they answer; numbers can be changed in the dashboard |

## Support numbers: what public sources say (2026-11-15)

From public sources only. A number is "confirmed" in the app only after someone on the team calls it and ticks
«مؤكد» in the dashboard (أرقام التواصل), which records the date. Nothing was changed in the live list.

| Entry | Number found | Source | Still to do |
| --- | --- | --- | --- |
| الشرطة / الإسعاف / الدفاع المدني | 100 / 101 / 102, routed to the nearest centre | [WAFA national information centre](https://info.wafa.ps/pages/details/33948), [Palestinian police](https://www.palpolice.ps/telephone-book/212183.html) | Call to confirm; in Gaza, ask whether they answer under current conditions |
| خط الدعم النفسي (Sawa, violence against women and children, 24/7) | **164** free on Palestinian networks (was 121); Jerusalem 1800500121; WhatsApp +972594040121 | [sawa.ps](https://sawa.ps/ar), Sawa's own Facebook page | Call 164 and the WhatsApp line; then enter them in the dashboard |
| مساعدة قانونية مجانية للنساء (WCLAC) | 1800807060 (free line on its Facebook page; not on wclac.org) | [WCLAC Facebook](https://www.facebook.com/WclacPalestine/) | Call to confirm it works from Palestinian networks, and ask for a Gaza number |
| وحدة الجرائم الإلكترونية بالشرطة | not found | — | Ask the police for a direct number, or keep 100 |

Known limits (by design, documented):
- Detection is phrase-based plus context rules, not a model: unusual wording can be missed. When in doubt the app
  asks one direct question rather than guessing.
- The app cannot contact anyone on her behalf and never claims to.
