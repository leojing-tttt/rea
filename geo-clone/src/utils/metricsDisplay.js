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
    avgRank: api.avg_rank || 0,
    sentimentScore: api.sentiment_score || 0,
  };
}

export const METRIC_TIPS = {
  referRate: '品牌提及率 = 提及品牌对话 ÷ 对话次数 × 100%（产品 tip，observed）',
  mentionCount: '品牌提及次数 = 所有对话中提及本品牌次数之和；同一次对话可计多次',
  sov: 'SOV = 提及品牌对话 ÷ 所有品牌提及对话总和 × 100%；同一对话内同一品牌只计 1 次',
  avgRank: '平均提及排名 = 本品牌在各 AI 对话中的排名之和 ÷ 提及品牌对话',
  top1ReferRate: 'Top1 公式未在产品 tip 明示；本 MVP 暂用「排名=1 的对话数 ÷ 对话次数」（provisional）',
  top3ReferRate: 'Top3 公式未在产品 tip 明示；本 MVP 暂用「排名≤3 的对话数 ÷ 对话次数」（provisional）',
  sentimentScore: '好感度为综合打分（百分制）；算法细节未在前端暴露，当前为 mock',
  aiCount: '监测期内纳入统计的 AI 对话条数（入池规则 unknown）',
  validRankCount: '至少提及本品牌一次、且可参与排名统计的对话数',
};
