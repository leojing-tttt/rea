/**
 * FE display mapping mirrored from live monitor chunk:
 * referRate:(100*m).toFixed(0), etc.
 */
export function mapOverviewToStats(api = {}) {
  return {
    aiCount: api.ai_count || 0,
    validRankCount: api.valid_rank_count || 0,
    referRate: (100 * (api.refer_rate || 0)).toFixed(0),
    mentionCount: api.mention_count || 0,
    sov: (100 * (api.sov || 0)).toFixed(0),
    top1ReferRate: (100 * (api.top1_refer_rate || 0)).toFixed(0),
    top3ReferRate: (100 * (api.top3_refer_rate || 0)).toFixed(0),
    top1MentionCount: api.top1_mention_count || 0,
    top3MentionCount: api.top3_mention_count || 0,
    avgRank: api.avg_rank || 0,
    sentimentScore: api.sentiment_score == null ? null : api.sentiment_score,
  };
}

export const METRIC_TIPS = {
  referRate: '品牌提及率 = 提及品牌对话 ÷ 对话次数 × 100%（产品 tip，observed）',
  mentionCount: '品牌提及次数 = 所有对话中提及本品牌次数之和；同一次对话可计多次',
  sov: 'SOV = 提及品牌对话 ÷ 所有品牌提及对话总和 × 100%；同一对话内同一品牌只计 1 次',
  avgRank: '平均提及排名 = 本品牌在各 AI 对话中的排名之和 ÷ 提及品牌对话',
  top1ReferRate:
    'Top1(首位)提及次数 = 排名为 1 的提及对话数（文案口径）。提及率分母未在产品 tip 闭合，卡片百分数仍是 provisional：次数 ÷ 对话次数。',
  top3ReferRate:
    'Top3(首屏)提及次数 = 排名 ≤ 3 的提及对话数（首屏文案 + Top10 并列筛选项；不用电商「排名第三」tip）。提及率分母未闭合，百分数为 provisional。',
  sentimentScore:
    '好感度是百分制综合分（产品 tip）。打分模型未在前端暴露，本页不生成分数；有上游 score_origin 时才展示。',
  polarityRate: '正面/中性/负面情感 = 对应对话数 ÷ 情感对话数（线上 calcSentimentRate）',
  wordHits: '正/负面词次数来自本地词表或种子标注，不是线上词模型',
  aiCount: '监测期内纳入统计的 AI 对话条数（入池规则 unknown）',
  validRankCount: '至少提及本品牌一次、且可参与排名统计的对话数',
  brandScore:
    '品牌得分 = 提及率×0.75 + 提及次数得分×0.1 + 平均排名项×0.1 + 情感项×0.05；提及次数得分=1+99×x/(x+10)。排名/情感归一 provisional（字典 U-03）',
  resourceCount: '引用文章数 = resource_count（线上 /geo/resource/statistics）',
  totalLogCount: '引用次数 = total_log_count（引用事件发生次数）',
  siteCount: '引用站点数 = site_count（去重站点）',
  sentimentCount: '情感对话数 = sentiment_count（纳入舆情统计的对话数）',
  polarityCounts: '正/中/负计数对齐 positive_count / neutral_count / negative_count',
  negativeMentionRate: '负面提及率分母未钉死；本页 provisional：negative_count ÷ valid_rank_count（字典 SE-05）',
};
