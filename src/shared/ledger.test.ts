import { describe, expect, it } from 'vitest';
import { getAppData } from './data';

const { capabilities, taxonomy } = getAppData();
import type { Capability, Trial } from './types';

/**
 * 台账数据的守卫用例：这些不是"页面好不好看"，而是"记录是否说得清、说得准"。
 * 起因是两次真实的返工——行上出现过空白的"一句话说明"，也出现过由评测者归纳（而非取自能力自身描述字段）的说明。
 */

// ready = 机器判定达标、等人给结论（2026-09-11 起机器不再直接给 adopt）
const DECISIONS = ['adopt', 'ready', 'hold', 'reject', 'retry', 'available', 'unavailable'];
const KINDS = ['controlled', 'mock', 'live'];

const allTrials: { cap: Capability; trial: Trial }[] = capabilities.flatMap((cap) =>
  cap.trials.map((trial) => ({ cap, trial })),
);

describe('能力登记', () => {
  it('每个能力都有 id / type / status', () => {
    for (const cap of capabilities) {
      expect(cap.id.trim(), `${cap.id} 缺 id`).toBeTruthy();
      expect(['skill', 'agent', 'mcp'], `${cap.id} 的 type 不合法`).toContain(cap.type);
      expect(['candidate', 'trialing', 'adopted', 'rejected'], `${cap.id} 的 status 不合法`).toContain(cap.status);
    }
  });

  it('每个能力都有「一句话说明」，且说明里不夹带结论', () => {
    for (const cap of capabilities) {
      const description = (cap.description ?? '').trim();
      expect(description, `${cap.id} 没有一句话说明（台账行会只剩名字）`).not.toBe('');
      // 说明讲"这是什么"，结论讲"值不值得用"，两者不许混
      expect(description, `${cap.id} 的说明里写了结论词`).not.toMatch(/值得用|待观察|暂不采纳|建议采纳|已采纳|挂起/);
      expect(description, `${cap.id} 的说明等于结论`).not.toBe(cap.summary);
    }
  });

  it('每个能力的「说明来源」写清了这句话是从哪来的', () => {
    for (const cap of capabilities) {
      const source = (cap.descriptionSource ?? '').trim();
      expect(source, `${cap.id} 没标注说明来源`).not.toBe('');
      const thirdParty = Boolean(cap.source?.repo);
      expect(source, `${cap.id} 是第三方能力，来源应写明"上游…直译"`).toMatch(thirdParty ? /上游|直译/ : /本仓库|自研|原文/);
    }
  });

  it('第三方能力的说明是中文（直译，不是把上游英文原文照贴）', () => {
    // 2026-09-11 踩过：自动兜底只把 SKILL.md 的 description 原样填进来，台账行上出现整段英文；
    // 规则是"第三方能力直译上游描述字段"，所以来源写了"直译"却一个汉字都没有的，一定是没译。
    for (const cap of capabilities) {
      if (!cap.source?.repo) continue;
      const description = (cap.description ?? '').trim();
      expect(/[\u4e00-\u9fa5]/.test(description), `${cap.id} 的说明没有中文（是不是把上游英文原文照贴了？）`).toBe(true);
      expect((cap.descriptionSource ?? '').trim(), `${cap.id} 的来源不该写着"未翻译"`).not.toMatch(/未翻译|原文照贴/);
    }
  });

  it('人的结论与能力状态必须对得上（采纳 / 不采纳只能由人给）', () => {
    for (const cap of capabilities) {
      const d = cap.humanDecision ?? null;
      if (!d) continue;
      expect(['adopt', 'reject'], `${cap.id} 的 humanDecision.verdict 不合法`).toContain(d.verdict);
      expect(cap.status, `${cap.id} 的结论说"${d.verdict}"，状态却是 ${cap.status}`).toBe(
        d.verdict === 'adopt' ? 'adopted' : 'rejected',
      );
      expect((d.reason ?? '').length, `${cap.id} 的结论理由太长`).toBeLessThanOrEqual(300);
    }
  });

  it('每个能力都有「一句话结论」', () => {
    for (const cap of capabilities) {
      expect((cap.summary ?? '').trim(), `${cap.id} 没有一句话结论`).not.toBe('');
    }
  });

  it('能力级结论里不许出现"评测本身报错"这类环境问题', () => {
    // 踩过：一次引擎没装的 retry 把能力级结论覆盖成了"暂不采纳：这次评测本身报错了"
    const envTrouble = /这次评测本身报错|跑前检查|环境未就绪|命令.*(找不到|未安装)|未安装的引擎/;
    for (const cap of capabilities) {
      expect(cap.summary ?? '', `${cap.id} 的结论写的是环境问题，不是对能力的判断`).not.toMatch(envTrouble);
    }
  });

  it('标签取值都在标签表里登记过', () => {
    for (const cap of capabilities) {
      const tags = (cap.tags ?? {}) as Record<string, string | string[] | undefined>;
      for (const [dimension, value] of Object.entries(tags)) {
        const registered = taxonomy.dimensions[dimension]?.values ?? {};
        const values = Array.isArray(value) ? value : [value];
        for (const v of values) {
          expect(Object.keys(registered), `${cap.id} 的标签 ${dimension}=${v} 未登记（要在 evals/tags.json 里先确认）`).toContain(v);
        }
      }
    }
  });
});

describe('试用记录', () => {
  it('每条试用都挂在已登记的能力上', () => {
    for (const { cap, trial } of allTrials) {
      expect(trial.capability?.id, `${trial.trialId} 没有能力 id`).toBe(cap.id);
      expect(capabilities.map((c) => c.id)).toContain(trial.capability.id);
    }
  });

  it('每条试用都有结论、方式和记录时间', () => {
    for (const { trial } of allTrials) {
      expect(DECISIONS, `${trial.trialId} 的结论不合法`).toContain(trial.verdict?.decision);
      expect(KINDS, `${trial.trialId} 的 kind 不合法`).toContain(trial.kind);
      expect((trial.verdict?.reason ?? '').trim(), `${trial.trialId} 没有结论理由`).not.toBe('');
      // 同一天记多条时靠它决定"最近一次"
      expect(trial.recordedAt, `${trial.trialId} 缺 recordedAt`).toBeTruthy();
    }
  });

  it('只做可用性检查的（MCP 探针）必须标 probeOnly，结论只能是可用 / 不可用', () => {
    for (const { trial } of allTrials) {
      if (trial.source?.tool === 'mcp-probe') {
        expect(trial.probeOnly, `${trial.trialId} 是协议探针跑的，必须标 probeOnly`).toBe(true);
      }
      if (trial.probeOnly) {
        expect(['available', 'unavailable', 'retry'], `${trial.trialId} 可用性检查的结论只能是 可用 / 不可用 / 重试`).toContain(
          trial.verdict?.decision,
        );
      }
    }
  });

  it('可用性检查记录必须留下功能清单（tools/list）', () => {
    for (const { trial } of allTrials) {
      if (!trial.probeOnly || trial.verdict?.decision === 'retry') continue;
      expect(trial.measures?.toolList, `${trial.trialId} 缺功能清单`).toBeTruthy();
    }
  });

  it('用 stub / 夹具跑出来的试用必须标 selfCheck（否则会拿假数据当采纳依据）', () => {
    for (const { trial } of allTrials) {
      const text = `${trial.model ?? ''} ${JSON.stringify(trial.measures?.notes ?? '')}`;
      const looksFake = /stub|__fixtures__|脚本扮演/.test(text);
      if (looksFake) {
        expect(trial.selfCheck, `${trial.trialId} 明显是离线自检（${text.trim().slice(0, 40)}…）却没标 selfCheck`).toBe(true);
      }
    }
  });

  it('可复核试用（controlled / mock）必须留下"带能力那侧"的结果', () => {
    for (const { trial } of allTrials) {
      if (trial.kind === 'live') continue;
      const b = trial.measures?.correctness?.B;
      expect(typeof b, `${trial.trialId} 缺 B 侧通过率——判定规则要用它`).toBe('number');
    }
  });
});
