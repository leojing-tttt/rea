/**
 * Shared mock raw-text builders (no I/O).
 * Extracted so MockAdapter + batch helper share one implementation.
 */

const COMPETITOR_POOL = ['飞鹤', '伊利', '雀巢', '帮宝适', '妙而舒', '安踏', '优衣库', '骆驼'];

const CITE_TEMPLATES = [
  { site: '知乎', title: '品类选购经验分享', path: '/zhihu' },
  { site: '小红书', title: '真实使用体验合集', path: '/xhs' },
  { site: '京东', title: '热销商品参数对比', path: '/jd' },
  { site: '官网', title: '品牌官方产品介绍', path: '/official' },
  { site: '什么值得买', title: '值友口碑汇总', path: '/smzdm' },
  { site: '百度百科', title: '品牌词条摘要', path: '/baike' },
];

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function buildBrandRanking({ brand, seed, platformIndex }) {
  const mentionFocus = Boolean(brand) && seed % 10 !== 0 && seed % 10 !== 3;
  const rivals = COMPETITOR_POOL.filter((b) => b !== brand).slice(0, 3);
  const ranked = [];
  if (mentionFocus) {
    const focusRank = [1, 1, 2, 2, 3][(seed + platformIndex) % 5];
    const others = rivals.map((name, i) => ({
      brand: name,
      rank: i + 1 === focusRank ? focusRank + 1 : i + 1,
    }));
    ranked.push({ brand, rank: focusRank });
    for (const o of others) {
      if (!ranked.some((r) => r.brand === o.brand)) ranked.push(o);
    }
    ranked.sort((a, b) => a.rank - b.rank);
    ranked.forEach((r, i) => {
      r.rank = i + 1;
    });
  } else {
    rivals.slice(0, 3).forEach((name, i) => ranked.push({ brand: name, rank: i + 1 }));
  }
  return { mentionFocus, ranked };
}

function sentimentTone(seed) {
  const bucket = seed % 10;
  if (bucket <= 5) return 'positive';
  if (bucket <= 7) return 'neutral';
  return 'negative';
}

function buildRawText({ prompt, brand, platformName, mode, seed, platformIndex }) {
  const { mentionFocus, ranked } = buildBrandRanking({ brand, seed, platformIndex });
  const tone = sentimentTone(seed + platformIndex);
  const cites = CITE_TEMPLATES.slice(0, 2 + (seed % 3)).map((c, i) => ({
    ...c,
    url: `https://example.com${c.path}?q=${encodeURIComponent(prompt.slice(0, 20))}&i=${i}`,
  }));

  const rankingLines = ranked.map((r) => `${r.rank}. ${r.brand}`).join('\n');
  const citeLines = cites
    .map((c, i) =>
      i === 0 && seed % 2 === 0
        ? `- [${c.title}](${c.url})`
        : `- 【${c.site}】${c.title} (${c.url})`
    )
    .join('\n');

  let toneSentence = '整体评价较为均衡。';
  const aliasHint = brand === '君乐宝' && mentionFocus ? '（优萃系列也常被提及）' : '';
  if (tone === 'positive') {
    toneSentence = mentionFocus
      ? `${brand}${aliasHint} 口碑不错，推荐指数较高，品质稳定值得考虑。`
      : '该品类头部品牌口碑普遍较好。';
  } else if (tone === 'negative') {
    toneSentence = mentionFocus
      ? `也有用户反馈 ${brand} 存在售后响应慢、性价比一般等不足。`
      : '需注意部分品牌售后与一致性问题。';
  }

  const raw_text = [
    `【${platformName} · ${mode}】针对问题「${prompt}」的回答（mock 原文，非真实模型输出）：`,
    '',
    '综合公开信息，可参考以下品牌排序：',
    rankingLines || '（暂无明确品牌排序）',
    '',
    toneSentence,
    '',
    '参考来源：',
    citeLines,
  ].join('\n');

  return {
    platform: platformName,
    platform_id: undefined,
    mode,
    fetched_at: new Date().toISOString(),
    adapter: 'mock',
    raw_text,
    _seed: { mentionFocus, ranked, tone, cites },
  };
}

module.exports = {
  COMPETITOR_POOL,
  CITE_TEMPLATES,
  hashSeed,
  buildBrandRanking,
  buildRawText,
};
