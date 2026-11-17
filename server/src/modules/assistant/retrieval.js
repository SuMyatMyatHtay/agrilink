import { FARM_GUIDE } from "./knowledge.js";
const snippets = FARM_GUIDE.split(/\n\s*\n/).map((text, i) => ({ id: `GUIDE-${i + 1}`, title: text.trim().split("\n")[0].slice(0, 100), text: text.trim(), kind: "curated_prototype_guide" })).filter(x => x.text);
export function retrieve(question) {
  let query = String(question || "").toLowerCase();
  if (/पानी|सिंचाई|ਪਾਣੀ|ਸਿੰਚਾਈ|paani|pani/.test(query)) query += " irrigation water";
  if (/बारिश|मौसम|ਮੀਂਹ|ਮੌਸਮ|baarish|mausam/.test(query)) query += " weather rain";
  if (/कीमत|दाम|ਕੀਮਤ/.test(query)) query += " price offer";
  if (/बीमारी|कीट|ਰੋਗ/.test(query)) query += " pest disease doctor";
  const terms = [...new Set(query.match(/[\p{L}\p{N}]{3,}/gu) || [])].filter(x => !["the", "how", "what", "when", "should", "can", "for", "and", "this", "with"].includes(x));
  return snippets.map(s => ({ ...s, score: terms.reduce((sum, term) => sum + (s.text.toLowerCase().includes(term) ? 1 : 0), 0) }))
    .filter(s => s.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 3);
}
export const referenceText = sources => `\nRETRIEVED REFERENCE SNIPPETS (curated prototype guide, not independently certified agronomy):\n${sources.map(s => `[${s.id}] ${s.text}`).join("\n\n") || "No relevant guide passage found. Ask the farmer doctor if the farmer data does not answer the question."}`;
