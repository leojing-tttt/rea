/**
 * Parse mock (or future real) raw platform answers into structured facts.
 * Mentions / citations / sentiment are stub heuristics — not ML.
 */

const POSITIVE_WORDS = ['口碑不错', '推荐', '值得', '品质稳定', '较好', '热销', '推荐指数较高'];
const NEGATIVE_WORDS = ['不足', '售后响应慢', '性价比一般', '问题', '差评', '避雷'];
const NEUTRAL_WORDS = ['均衡', '综合', '参考', '可参考'];

/** Known site → coarse type (SRC-04 style) */
const SITE_TYPE_MAP = {
  知乎: 'community',
  小红书: 'community',
  微博: 'portal',
  微信: 'portal',
  今日头条: 'portal',
  京东: 'ecommerce',
  天猫: 'ecommerce',
  淘宝: 'ecommerce',
  什么值得买: 'ecommerce',
  官网: 'official',
  品牌官网: 'official',
  百度百科: 'official',
  抖音: 'video',
  哔哩哔哩: 'video',
};

const SITE_TYPE_LABEL = {
  official: '官网/独立站/行业垂直',
  portal: '门户/自媒体/资讯',
  video: '视频平台',
  ecommerce: '电商平台',
  community: '社区/论坛/问答',
  other: '其他',
};

/**
 * Canonical brand + aliases used for mention matching.
 * Rules (documented):
 * - Ranked list lines set primary rank
 * - Inline alias hits increment count (same dialog)
 * - Best (lowest) rank wins when duplicates
 * - Noise tokens / prompt fragments ignored
 */
const DEFAULT_BRAND_ALIASES = {
  君乐宝: ['君乐宝', '优萃', '优萃宝爱'],
  飞鹤: ['飞鹤', '星飞帆'],
  伊利: ['伊利', '金领冠'],
  雀巢: ['雀巢', '能恩'],
  好奇: ['好奇', '小森林'],
  帮宝适: ['帮宝适'],
  妙而舒: ['妙而舒'],
};

const NOISE_BRAND = /^(针对|综合|参考|以下|品牌|排序|公开信息|可参考|暂无|明确)/;

function resolveSiteType(site) {
  const key = SITE_TYPE_MAP[site] || 'other';
  return { site_type_key: key, site_type: SITE_TYPE_LABEL[key] || SITE_TYPE_LABEL.other };
}

function hostFromUrl(url) {
  try {
    const u = new URL(url);
    return { host: u.host, path: u.pathname };
  } catch (_) {
    return { host: '', path: '' };
  }
}

/**
 * Extract ranked brands from lines like "1. 君乐宝" / "2、飞鹤" / "3) 伊利"
 */
function parseRankedMentions(rawText) {
  const mentions = [];
  const re = /(?:^|\n)\s*(\d+)\s*[.、．)\]]\s*([^\n\r,，。；;（(]+)/g;
  let m;
  while ((m = re.exec(rawText))) {
    const rank = Number(m[1]);
    let brand = String(m[2]).trim().replace(/\s+/g, '');
    brand = brand.replace(/[。．.]+$/, '');
    if (!brand || brand.length > 20) continue;
    if (NOISE_BRAND.test(brand)) continue;
    mentions.push({ brand, rank, count: 1, source: 'ranked_list' });
  }
  return mentions;
}

/**
 * Count alias hits in free text (excluding ranked-list lines already counted once).
 */
function parseInlineMentions(rawText, brandAliases = DEFAULT_BRAND_ALIASES) {
  const lines = String(rawText || '').split(/\n/);
  const body = lines
    .filter((line) => !/^\s*\d+\s*[.、．)\]]/.test(line))
    .join('\n');
  const hits = [];
  for (const [canonical, aliases] of Object.entries(brandAliases)) {
    let count = 0;
    for (const alias of aliases) {
      if (!alias) continue;
      const re = new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const found = body.match(re);
      if (found) count += found.length;
    }
    if (count > 0) hits.push({ brand: canonical, rank: null, count, source: 'inline' });
  }
  return hits;
}

/**
 * Merge ranked + inline with brand mention rules.
 * @param {string} rawText
 * @param {{ brandAliases?: object, focusBrand?: string }} [opts]
 */
function parseMentions(rawText, opts = {}) {
  const aliases = opts.brandAliases || DEFAULT_BRAND_ALIASES;
  const ranked = parseRankedMentions(rawText);
  const inline = parseInlineMentions(rawText, aliases);

  // Normalize ranked brands via alias map → canonical
  const aliasToCanonical = new Map();
  for (const [canonical, list] of Object.entries(aliases)) {
    for (const a of list) aliasToCanonical.set(a, canonical);
  }
  const normalize = (name) => aliasToCanonical.get(name) || name;

  const byBrand = new Map();
  for (const hit of ranked) {
    const brand = normalize(hit.brand);
    const prev = byBrand.get(brand);
    if (!prev) {
      byBrand.set(brand, { brand, rank: hit.rank, count: hit.count, sources: [hit.source] });
    } else {
      prev.rank = Math.min(prev.rank, hit.rank);
      prev.count += hit.count;
      if (!prev.sources.includes(hit.source)) prev.sources.push(hit.source);
    }
  }
  for (const hit of inline) {
    const brand = hit.brand;
    const prev = byBrand.get(brand);
    if (!prev) {
      // inline-only: no rank from list → leave rank null (does not enter avg_rank until ranked)
      byBrand.set(brand, {
        brand,
        rank: null,
        count: hit.count,
        sources: [hit.source],
      });
    } else {
      prev.count += hit.count;
      if (!prev.sources.includes(hit.source)) prev.sources.push(hit.source);
    }
  }

  const list = [...byBrand.values()].map((m) => ({
    brand: m.brand,
    rank: m.rank,
    count: m.count,
    sources: m.sources,
  }));

  // Sort: ranked first by rank, then inline-only
  list.sort((a, b) => {
    if (a.rank == null && b.rank == null) return b.count - a.count;
    if (a.rank == null) return 1;
    if (b.rank == null) return -1;
    return a.rank - b.rank;
  });
  return list;
}

/**
 * Citations with structure: site, site_type, title, url, host, log_count stub
 */
function parseCitations(rawText) {
  const citations = [];
  const seen = new Set();

  // Pattern A: 【site】title (url)
  const reA = /【([^】]+)】\s*([^\n(（]+?)\s*[\(（]\s*(https?:\/\/[^\s)）]+)\s*[\)）]/g;
  let m;
  while ((m = reA.exec(rawText))) {
    const site = m[1].trim();
    const title = m[2].trim();
    const url = m[3].trim();
    const key = `${site}|${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { host, path } = hostFromUrl(url);
    const types = resolveSiteType(site);
    citations.push({
      site,
      title,
      url,
      host,
      path,
      log_count: 1,
      ...types,
      source: 'bracket_cite',
    });
  }

  // Pattern B: markdown [title](url)
  const reB = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  while ((m = reB.exec(rawText))) {
    const title = m[1].trim();
    const url = m[2].trim();
    const { host, path } = hostFromUrl(url);
    const site = host.replace(/^www\./, '') || 'web';
    const key = `${site}|${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const types = resolveSiteType(site);
    citations.push({
      site,
      title,
      url,
      host,
      path,
      log_count: 1,
      ...types,
      source: 'markdown_link',
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
  const score = Math.max(0, Math.min(100, 55 + pos * 12 - neg * 15 + neu * 2));
  return {
    label,
    score,
    positive_word_hits: pos,
    negative_word_hits: neg,
    neutral_word_hits: neu,
    _stub: true,
  };
}

/**
 * Mentions usable by computeOverview: only those with a numeric rank
 * (ranked list). Inline-only brands keep count but do not invent rank.
 */
function overviewMentions(mentions) {
  return (mentions || [])
    .filter((m) => m.rank != null && m.rank > 0)
    .map((m) => ({ brand: m.brand, rank: m.rank, count: m.count || 1 }));
}

/**
 * @param {object} rawItem
 * @param {{ prompt: string, brand?: string, brand_plan_id?: string, task_id: string, date?: string, brandAliases?: object }} ctx
 */
function parseRawItem(rawItem, ctx) {
  const text = rawItem.raw_text || '';
  const aliases = ctx.brandAliases || DEFAULT_BRAND_ALIASES;
  const mentions = parseMentions(text, { brandAliases: aliases, focusBrand: ctx.brand });
  const citations = parseCitations(text);
  const sentiment = parseSentiment(text);
  const focus = ctx.brand || '';
  const focusHits = mentions.filter((m) => m.brand === focus && m.rank != null);
  const inlineFocus = mentions.filter((m) => m.brand === focus);
  const mention_rank = focusHits.length ? Math.min(...focusHits.map((m) => m.rank)) : null;
  const mentioned = Boolean(focus && (focusHits.length || inlineFocus.some((m) => m.count > 0)));

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
    mentions: overviewMentions(mentions),
    mentions_full: mentions,
    citations,
    sentiment,
    mentioned,
    mention_rank,
    answer_excerpt: text.split('\n').slice(0, 8).join('\n'),
    source: 'pipeline_parse',
    _parse_meta: {
      citation_count: citations.length,
      mention_rule: 'ranked_list sets rank; aliases normalize; inline increments count',
    },
  };
}

function parseRawList(rawList, ctx) {
  return (rawList || []).map((item) => parseRawItem(item, ctx));
}

module.exports = {
  parseMentions,
  parseRankedMentions,
  parseInlineMentions,
  parseCitations,
  parseSentiment,
  parseRawItem,
  parseRawList,
  overviewMentions,
  DEFAULT_BRAND_ALIASES,
  SITE_TYPE_MAP,
};
