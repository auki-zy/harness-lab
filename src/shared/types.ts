/** 评测数据的类型定义：与 evals/schema.md、tools/aggregate.mjs 输出保持一致 */

export interface TagDimension {
  label: string;
  values: Record<string, string>;
}

export interface Taxonomy {
  version: number;
  policy?: { note?: string; pendingFile?: string };
  dimensions: Record<string, TagDimension>;
}

export interface CapabilityTags {
  type?: string;
  purpose?: string[];
  stage?: string;
  source?: string;
  risk?: string[];
  [dim: string]: string | string[] | undefined;
}

export interface TrialCondition {
  name: string;
  withCapability: boolean;
  artifact?: string;
}

export interface HumanReview {
  mode: 'quick' | 'detailed';
  better?: string;
  verdict?: 'up' | 'down';
  reason?: string;
  scores?: Record<string, number> | null;
  /** 人评记录时间（ISO）：页面上的人评入口提交时写入 */
  reviewedAt?: string;
}

export interface Trial {
  trialId: string;
  capability: { id: string; type?: string };
  /**
   * 试用方式：
   * - controlled：同一任务跑两遍（A 不加载能力 / B 加载能力），产物留在仓库
   * - mock：固定任务与输入都 mock 在仓库里，看结果（默认做法）
   * - live：在真实项目里用一次；项目常在本仓库之外，不要求留产物
   * 不填时按条件推断：有 ≥2 个条件算 controlled，否则算 live。
   */
  kind?: 'controlled' | 'mock' | 'live';
  task?: { id: string; fixture?: string; description?: string };
  conditions?: TrialCondition[];
  measures?: {
    correctness?: Record<string, number>;
    sizeKB?: Record<string, number>;
    staticChecks?: Record<string, string>;
    // ── 成本与效率维度（都是"按条件名"给的数字，缺哪项就不显示哪行）──
    /** 输入 token（不含缓存命中） */
    tokensIn?: Record<string, number>;
    /** 输出 token */
    tokensOut?: Record<string, number>;
    /** 总 token（输入 + 输出 + 缓存） */
    tokensTotal?: Record<string, number>;
    /** 缓存命中的输入 token：越高说明上下文复用越好、越省 */
    tokensCached?: Record<string, number>;
    /** 单条用例的墙上时间（秒） */
    durationSec?: Record<string, number>;
    /** 交互轮次（agent 与引擎来回几次） */
    steps?: Record<string, number>;
    /** 工具调用次数 */
    toolCalls?: Record<string, number>;
    /** 工具调用构成，例："Bash 3 / Read 1 / Write 1" */
    toolMix?: Record<string, string>;
    /** 花费（美元）；走内网网关时没有价格，就只记 token */
    costUsd?: Record<string, number>;
    notes?: string;
    [k: string]: unknown;
  };
  judge?: string[];
  humanReview?: HumanReview | null;
  verdict?: { decision?: string; confidence?: string; reason?: string };
  evidence?: string[];
  model?: string;
  date?: string;
  /** 这条记录是哪个工具跑出来的（skill-up / promptfoo / mcp-probe）与原始报告位置 */
  source?: { tool?: string; report?: string };
  /** 记录时间（ISO）；同一天记多条 trial 时用来决定"最近一次" */
  recordedAt?: string;
  /**
   * 离线自检：用 stub 引擎 / 仓库内夹具跑出来的记录。
   * 它证明评测链路通，**不**证明能力有效，所以不计入采纳计数（`previousPasses()` 会跳过）。
   */
  selfCheck?: boolean;
  /**
   * 只做了可用性检查的记录（MCP 协议探针）：能证明"起得来、工具列得出、调得通"，
   * 证明不了"值得装进项目"——同样不计入采纳计数，判定只能停在 hold。
   */
  probeOnly?: boolean;
}

/** **人的结论**：采纳与否只能由人给（机器跑到证据够了只会停在 `ready`） */
export interface HumanDecision {
  verdict: 'adopt' | 'reject';
  reason?: string;
  reviewedAt?: string;
}

export interface Capability {
  id: string;
  type?: string;
  status?: string;
  /** 一句话说明：这个能力是干什么的（台账行显示它） */
  description?: string | null;
  /** 这句话是哪来的：第三方＝上游哪个字段的直译，自研＝哪份规格文件（详情「来源与标签」显示） */
  descriptionSource?: string | null;
  /** 一句话结论：值不值得用、依据是什么（详情结论区显示它） */
  summary?: string | null;
  /** 人对这个能力的最终结论（采纳 / 不采纳） */
  humanDecision?: HumanDecision | null;
  howToUse?: string | null;
  source?: { repo?: string; path?: string; license?: string; commit?: string } | null;
  localPath?: string | null;
  tags?: CapabilityTags | null;
  trials: Trial[];
  latestTrial: Trial | null;
}

export interface PendingTag {
  capability: string;
  dimension: string;
  value: string;
}

export interface AppData {
  generatedAt: string;
  taxonomy: Taxonomy;
  pendingTags: PendingTag[];
  capabilities: Capability[];
}
