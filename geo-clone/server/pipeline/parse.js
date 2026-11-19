/**
 * Parse mock (or future real) raw platform answers into structured facts.
 * Mentions / citations / sentiment are stub heuristics — not ML.
 */

const POSITIVE_WORDS = ['口碑不错', '推荐', '值得', '品质稳定', '较好', '热销'];
const NEGATIVE_WORDS = ['不足', '售后响应慢', '性价比一般', '问题', '差评'];
const NEUTRAL_WORDS = ['均衡', '综合', '参考'];

/**
 * Extract ranked brands from lines like "1. 君乐宝" / "2、飞鹤" / "3) 伊利"
 */
function parseMentions(rawText) {
  const mentions = [];
  const re = /(?:^|\n)\s*(\d+)\s*[.、．)\]]\s*([^\n\r,，。；;（(]+)/g;
  let m;
  while ((m = re.exec(rawText))) {
    const rank = Number(m[1]);
    const brand = String(m[2]).trim().replace(/\s+/g, '');
    if (!brand || brand.length > 20) continue;
    if (/^针对|^综合|^参考|^【/.test(brand)) continue;
    mentions.push({ brand, rank, count: 1 });
  }
  // de-dupe by brand keeping best (lowest) rank
  const byBrand = new Map();
  for (const hit of mentions) {
    const prev = byBrand.get(hit.brand);
    if (!prev || hit.rank < prev.rank) byBrand.set(hit.brand, hit);
  }
  return [...byBrand.values()].sort((a, b) => a.rank - b.rank);
}

/**
 * Extract citations: `- 【知乎】title (url)` or markdown-ish
 */
function parseCitations(rawText) {
  const citations = [];
  const re = /【([^】]+)】\s*([^\n(（]+?)\s*[\(（]\s*(https?:\/\/[^\s)）]+)\s*[\)）]/g;
  let m;
  while ((m = re.exec(rawText))) {
    citations.push({
      site: m[1].trim(),
      title: m[2].trim(),
      url: m[3].trim(),
    });
  }
  return citations;
}

function parseSentiment(rawText) {
  let pos = 0;
  let neg = 0;
  let neu = 0;
  for (const w of POSITIVE_WORDS) if (rawText.includes(w)) pos += 1;
  for (const w of NEGATIVE_WORDS) if (rawText.includes(w)) neg += 1;
  for (const w of NEUTRAL_WORDS) if (rawText.includes(w)) neu += 1;
  let label = 'neutral';
  if (pos > neg && pos >= neu) label = 'positive';
  else if (neg > pos) label = 'negative';
  // stub score 0–100
  const score = Math.max(0, Math.min(100, 55 + pos * 12 - neg * 15 + neu * 2));
  return {
    label,
    score,
    positive_word_hits: pos,
    negative_word_hits: neg,
    _stub: true,
  };
}

/**
 * @param {object} rawItem - from mock-adapters
 * @param {{ prompt: string, brand?: string, brand_plan_id?: string, task_id: string, date?: string }} ctx
 */
function parseRawItem(rawItem, ctx) {
  const text = rawItem.raw_text || '';
  const mentions = parseMentions(text);
  const citations = parseCitations(text);
  const sentiment = parseSentiment(text);
  const focus = ctx.brand || '';
  const focusHits = mentions.filter((m) => m.brand === focus);
  const mention_rank = focusHits.length ? Math.min(...focusHits.map((m) => m.rank)) : null;

  return {
    id: `parsed_${ctx.task_id}_${rawItem.platform_id || rawItem.platform}`,
    task_id: ctx.task_id,
    brand_plan_id: ctx.brand_plan_id || null,
    platform: rawItem.platform,
    platform_id: rawItem.platform_id,
    mode: rawItem.mode,
    question: ctx.prompt,
    prompt: ctx.prompt,
    date: ctx.date || new Date().toISOString().slice(0, 10),
    mentions,
    citations,
    sentiment,
    mentioned: Boolean(focus && focusHits.length),
    mention_rank,
    answer_excerpt: text.split('\n').slice(0, 6).join('\n'),
    source: 'pipeline_parse',
  };
}

function parseRawList(rawList, ctx) {
  return (rawList || []).map((item) => parseRawItem(item, ctx));
}

module.exports = {
  parseMentions,
  parseCitations,
  parseSentiment,
  parseRawItem,
  parseRawList,
};
