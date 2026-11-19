/**
 * Parse mock (or future real) raw platform answers into structured facts.
 * Mentions / citations / sentiment are stub heuristics — not ML.
 *
 * Brand mention rules (documented):
 * - ranked_list lines ("1. Brand") set rank (required for avg_rank / SOV pool)
 * - aliases normalize to canonical brand
 * - inline body hits increment count; inline-only brands have rank=null
 * - ranked line tokens are excluded from inline body to avoid double-count of the list itself
 * - noise / prompt fragments ignored
 *
 * Unknowns (do not invent):
 * - sentiment_score model weights (dictionary U-02) — keyword stub only
 * - Top1/Top3 denominators (U-01) — left to metrics.computeOverview provisional
 */

const POSITIVE_WORDS = ['口碑不错', '推荐', '值得', '品质稳定', '较好', '热销', '推荐指数较高', '推荐指数'];
const NEGATIVE_WORDS = ['不足', '售后响应慢', '性价比一般', '问题', '差评', '避雷', '一致性问题'];
const NEUTRAL_WORDS = ['均衡', '综合', '参考', '可参考', '整体评价'];

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

/** Path/host hints → display site for markdown/bare URLs */
const PATH_SITE_HINTS = [
  { re: /zhihu/i, site: '知乎' },
  { re: /xhs|xiaohongshu/i, site: '小红书' },
  { re: /\/jd\b|jingdong/i, site: '京东' },
  { re: /smzdm/i, site: '什么值得买' },
  { re: /baike/i, site: '百度百科' },
  { re: /official|brand/i, site: '官网' },
  { re: /weibo/i, site: '微博' },
  { re: /douyin|tiktok/i, site: '抖音' },
];

const SITE_TYPE_LABEL = {
  official: '官网/独立站/行业垂直',
  portal: '门户/自媒体/资讯',
  video: '视频平台',
  ecommerce: '电商平台',
  community: '社区/论坛/问答',
  other: '其他',
};

const DEFAULT_BRAND_ALIASES = {
  君乐宝: ['君乐宝', '优萃', '优萃宝爱'],
  飞鹤: ['飞鹤', '星飞帆'],
  伊利: ['伊利', '金领冠'],
  雀巢: ['雀巢', '能恩'],
  好奇: ['好奇', '小森林'],
  帮宝适: ['帮宝适'],
  妙而舒: ['妙而舒'],
};

const NOISE_BRAND = /^(针对|综合|参考|以下|品牌|排序|公开信息|可参考|暂无|明确|回答|mock)/;

const PARSE_UNKNOWNS = {
  sentiment_score: 'keyword stub only — model unknown (U-02)',
  top1_top3: 'not computed here; metrics layer provisional (U-01)',
  cite_rate_denominator: 'log_count stub=1 per cite; share denom is local rollup (SRC-05 partial)',
};

function resolveSiteType(site) {
  const key = SITE_TYPE_MAP[site] || 'other';
  return { site_type_key: key, site_type: SITE_TYPE_LABEL[key] || SITE_TYPE_LABEL.other };
}

function hostFromUrl(url) {
  try {
    const u = new URL(url);
    return { host: u.host, path: u.pathname, domain: u.hostname.replace(/^www\./, '') };
  } catch (_) {
    return { host: '', path: '', domain: '' };
  }
}

function inferSiteFromUrl(url, fallbackTitle) {
  const { host, path, domain } = hostFromUrl(url);
  const hay = `${host}${path}`;
  for (const h of PATH_SITE_HINTS) {
    if (h.re.test(hay)) return { site: h.site, host, path, domain };
  }
  if (domain && domain !== 'example.com') {
    return { site: domain, host, path, domain };
  }
  if (fallbackTitle && /官网/.test(fallbackTitle)) {
    return { site: '官网', host, path, domain };
  }
  return { site: domain || 'web', host, path, domain };
}

function buildAliasIndex(brandAliases) {
  const aliasToCanonical = new Map();
  for (const [canonical, list] of Object.entries(brandAliases || {})) {
    for (const a of list) aliasToCanonical.set(a, canonical);
    aliasToCanonical.set(canonical, canonical);
  }
  return aliasToCanonical;
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
    // strip trailing parenthetical aliases on ranked line: 君乐宝（优萃）
    brand = brand.replace(/（[^）]*）$/, '').replace(/\([^)]*\)$/, '');
    if (!brand || brand.length > 20) continue;
    if (NOISE_BRAND.test(brand)) continue;
    mentions.push({ brand, rank, count: 1, source: 'ranked_list' });
  }
  return mentions;
}

/**
 * Count alias hits in free text (excluding ranked-list lines).
 */
function parseInlineMentions(rawText, brandAliases = DEFAULT_BRAND_ALIASES) {
  const lines = String(rawText || '').split(/\n/);
  const body = lines
    .filter((line) => !/^\s*\d+\s*[.、．)\]]/.test(line))
    .join('\n');
  const hits = [];
  // Longer aliases first to avoid partial double-count (优萃宝爱 before 优萃)
  for (const [canonical, aliases] of Object.entries(brandAliases)) {
    const sorted = [...aliases].filter(Boolean).sort((a, b) => b.length - a.length);
    let count = 0;
    let remaining = body;
    for (const alias of sorted) {
      const re = new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const found = remaining.match(re);
      if (found) {
        count += found.length;
        remaining = remaining.replace(re, ' ');
      }
    }
    if (count > 0) hits.push({ brand: canonical, rank: null, count, source: 'inline' });
  }
  return hits;
}

/**
 * Merge ranked + inline with brand mention rules.
 * @returns {Array<{brand, rank, count, sources, mention_kind}>}
 */
function parseMentions(rawText, opts = {}) {
  const aliases = opts.brandAliases || DEFAULT_BRAND_ALIASES;
  const ranked = parseRankedMentions(rawText);
  const inline = parseInlineMentions(rawText, aliases);
  const aliasToCanonical = buildAliasIndex(aliases);
  const normalize = (name) => aliasToCanonical.get(name) || name;

  const byBrand = new Map();
  for (const hit of ranked) {
    const brand = normalize(hit.brand);
    const prev = byBrand.get(brand);
    if (!prev) {
      byBrand.set(brand, {
        brand,
        rank: hit.rank,
        count: hit.count,
        sources: [hit.source],
        ranked_count: hit.count,
        inline_count: 0,
      });
    } else {
      prev.rank = Math.min(prev.rank, hit.rank);
      prev.count += hit.count;
      prev.ranked_count += hit.count;
      if (!prev.sources.includes(hit.source)) prev.sources.push(hit.source);
    }
  }
  for (const hit of inline) {
    const brand = hit.brand;
    const prev = byBrand.get(brand);
    if (!prev) {
      byBrand.set(brand, {
        brand,
        rank: null,
        count: hit.count,
        sources: [hit.source],
        ranked_count: 0,
        inline_count: hit.count,
      });
    } else {
      prev.count += hit.count;
      prev.inline_count += hit.count;
      if (!prev.sources.includes(hit.source)) prev.sources.push(hit.source);
    }
  }

  const list = [...byBrand.values()].map((m) => ({
    brand: m.brand,
    rank: m.rank,
    count: m.count,
    ranked_count: m.ranked_count,
    inline_count: m.inline_count,
    sources: m.sources,
    mention_kind: m.rank != null ? 'ranked' : 'inline_only',
  }));

  list.sort((a, b) => {
    if (a.rank == null && b.rank == null) return b.count - a.count;
    if (a.rank == null) return 1;
    if (b.rank == null) return -1;
    return a.rank - b.rank;
  });
  return list;
}

/**
 * Citations with structure: site, site_type, title, url, host, domain, log_count
 */
function parseCitations(rawText) {
  const citations = [];
  const seenUrl = new Set();

  function pushCite(partial) {
    const url = partial.url;
    if (!url || seenUrl.has(url)) return;
    seenUrl.add(url);
    const inferred = partial.site
      ? { site: partial.site, ...hostFromUrl(url) }
      : inferSiteFromUrl(url, partial.title);
    const site = partial.site || inferred.site;
    const types = resolveSiteType(site);
    citations.push({
      site,
      title: partial.title || site,
      url,
      host: inferred.host || '',
      path: inferred.path || '',
      domain: inferred.domain || '',
      log_count: 1,
      ...types,
      source: partial.source,
    });
  }

  // Pattern A: 【site】title (url)
  const reA = /【([^】]+)】\s*([^\n(（]+?)\s*[\(（]\s*(https?:\/\/[^\s)）]+)\s*[\)）]/g;
  let m;
  while ((m = reA.exec(rawText))) {
    pushCite({ site: m[1].trim(), title: m[2].trim(), url: m[3].trim(), source: 'bracket_cite' });
  }

  // Pattern B: markdown [title](url)
  const reB = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  while ((m = reB.exec(rawText))) {
    pushCite({ title: m[1].trim(), url: m[2].trim(), source: 'markdown_link' });
  }

  // Pattern C: bare URLs not already captured
  const reC = /https?:\/\/[^\s)）\]>]+/g;
  while ((m = reC.exec(rawText))) {
    const url = m[0].replace(/[.,;。]+$/, '');
    pushCite({ title: '未标注标题', url, source: 'bare_url' });
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
    _unknown: PARSE_UNKNOWNS.sentiment_score,
  };
}

/** Mentions usable by computeOverview: ranked only */
function overviewMentions(mentions) {
  return (mentions || [])
    .filter((m) => m.rank != null && m.rank > 0)
    .map((m) => ({ brand: m.brand, rank: m.rank, count: m.count || 1 }));
}

function focusMentionMode(mentions, focus) {
  if (!focus) return 'none';
  const hit = (mentions || []).find((m) => m.brand === focus);
  if (!hit) return 'none';
  return hit.mention_kind === 'ranked' ? 'ranked' : 'inline_only';
}

/**
 * @param {object} rawItem
 * @param {{ prompt: string, brand?: string, brand_plan_id?: string, task_id: string, date?: string, brandAliases?: object }} ctx
 */
function parseRawItem(rawItem, ctx) {
  const text = rawItem.raw_text || '';
  const aliases = ctx.brandAliases || DEFAULT_BRAND_ALIASES;
  // Ensure focus brand has at least itself as alias
  if (ctx.brand && !aliases[ctx.brand]) {
    aliases[ctx.brand] = [ctx.brand];
  }
  const mentions = parseMentions(text, { brandAliases: aliases, focusBrand: ctx.brand });
  const citations = parseCitations(text);
  const sentiment = parseSentiment(text);
  const focus = ctx.brand || '';
  const focusHits = mentions.filter((m) => m.brand === focus && m.rank != null);
  const inlineFocus = mentions.filter((m) => m.brand === focus);
  const mention_rank = focusHits.length ? Math.min(...focusHits.map((m) => m.rank)) : null;
  const mention_mode = focusMentionMode(mentions, focus);
  const mentioned = mention_mode !== 'none';

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
    mention_mode,
    answer_excerpt: text.split('\n').slice(0, 8).join('\n'),
    source: 'pipeline_parse',
    _parse_meta: {
      citation_count: citations.length,
      ranked_brands: mentions.filter((m) => m.mention_kind === 'ranked').map((m) => m.brand),
      inline_only_brands: mentions.filter((m) => m.mention_kind === 'inline_only').map((m) => m.brand),
      mention_rule: 'ranked_list sets rank; aliases normalize; inline increments count; inline_only rank=null',
      unknowns: PARSE_UNKNOWNS,
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
  focusMentionMode,
  inferSiteFromUrl,
  DEFAULT_BRAND_ALIASES,
  SITE_TYPE_MAP,
  PARSE_UNKNOWNS,
};
