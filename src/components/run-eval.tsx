import { Alert, Button, Form, Input, Modal, Select, Space } from 'antd';
import { useEffect, useState } from 'react';
import { isEntryOpen } from '../shared/entries';
import { evalAuto, evalStart, evalStatus, draftPrompt, searchMarket, type EvalRunInfo, type EvalStatus, type MarketSkill } from '../shared/trial-api';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 提交成功后立刻把这次运行交给列表（页面「正在评测」那一块），弹窗随即关闭 */
  onStarted?: (run: EvalRunInfo) => void;
}

interface FormValues {
  /** 能力名，或 owner/repo 链接 */
  capability: string;
  /** 可选的"自己出的题"：填了就按它跑 A/B */
  task?: string;
  /** 重复跑次数（同一条用例跑几遍）：默认 1；跑 3 次就能看出"结果稳不稳" */
  repeat?: number;
}

const TYPE_LABEL: Record<string, string> = { skill: '技能', agent: '子代理', mcp: 'MCP' };

/** 搜索结果里那行来源太长：只留 owner/repo 与技能目录最后一段 */
function shortSource(source: string): string {
  const m = source.match(/github\.com\/([^/]+)\/([^/]+)\/(?:tree|blob)\/[^/]+\/(.+?)\/?$/);
  if (!m) return source;
  const dir = m[3].split('/').filter(Boolean).pop() ?? m[3];
  return `${m[1]}/${m[2]}:${dir}`;
}

function formatStars(stars: number): string {
  return stars >= 1000 ? `${(stars / 1000).toFixed(stars >= 10000 ? 0 : 1)}k` : String(stars);
}

/**
 * 发起评测：**一个表单 + 一颗「提交」**。
 *   - 能力填候选/已采纳里的名字 → 直接用它的评测配置跑；填 owner/repo 或链接 → 拉取进候选池，
 *     按 SKILL.md 自动设计针对性用例，再跑；
 *   - 提示词可选：填了就按它跑 A/B（A 只给提示词 / B 再附技能正文，由 LLM 裁判判）；
 *   - 引擎内置走内部网关（Athen），用途标签由自动设计判定，都不用选。
 * 评测引擎是开源工具（skill-up / promptfoo / MCP 探针），这里只负责发起与展示日志。
 *
 * **提交后弹窗立刻关闭**：评测是后台任务（跑一次十几分钟），用户不该被关在一个只能等的窗口里。
 * 这次运行会挂进首页「正在评测」那一块，进度随时点开看（见 RunningRuns / RunProgress）。
 *
 * 表单下方**不再挂常驻提示**：只在"跑不了"的时候给一条阻断原因（入口没开 / 没有可用引擎 / 名字对不上）。
 */
export function RunEval({ open, onClose, onStarted }: Props) {
  const [form] = Form.useForm<FormValues>();
  const [status, setStatus] = useState<EvalStatus | null>(null);
  const [log, setLog] = useState('');
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [marketQuery, setMarketQuery] = useState('');
  const [marketResults, setMarketResults] = useState<MarketSkill[] | null>(null);
  const [marketBusy, setMarketBusy] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 只订阅"能力"这一格：它决定按钮能不能点、以及该给哪种阻断原因（提示词只在提交时读）
  const input = Form.useWatch('capability', form) ?? '';
  const typed = input.trim();

  useEffect(() => {
    if (!open) return;
    evalStatus()
      .then(setStatus)
      .catch((e: Error) => setError(e.message));
  }, [open]);

  const known = status?.capabilities.find((c) => c.id === typed);
  const entryOpen = isEntryOpen(known?.type);
  const looksLikeSource = /^https?:\/\//.test(typed) || /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+/.test(typed);
  const skillTool = (known?.tool ?? 'skill-up') === 'skill-up';
  const engines = status?.engines ?? [];
  const noEngine = entryOpen && skillTool && engines.filter((e) => e.ok).length === 0;
  const engineTrouble =
    engines.length === 0
      ? '本机没有可用的评测引擎（claude / codex / qodercli / qwen 都没装）'
      : `引擎装了但都不可用：${engines.map((e) => `${e.name}（${e.detail}）`).join('；')}`;
  const canStart = Boolean(typed) && ((Boolean(known) && entryOpen) || (!known && looksLikeSource)) && !busy && !noEngine;

  /** 只在"点了也跑不了"时说明原因；一切正常时不占地方 */
  const blocker = (): { type: 'warning' | 'error'; title: string; description?: React.ReactNode } | null => {
    if (known && !entryOpen) {
      return {
        type: 'warning',
        title: `${TYPE_LABEL[known.type] ?? known.type} 的评测入口暂未开放（先只开放技能）`,
        description: '能力本身可以在台账里看；入口等口径定下来再放开。',
      };
    }
    if (noEngine) {
      return {
        type: 'warning',
        title: '技能评测需要一个能用的引擎（内部网关已内置）',
        description: (
          <>
            <p style={{ margin: '0 0 6px' }}>{engineTrouble}。</p>
            <p style={{ margin: 0 }}>
              skill-up 自己不做推理：它调用 claude / codex / qodercli / qwen 之一干活。没装就装一个，装了没登录就
              <span className="mono"> claude auth login </span>或<span className="mono"> codex login</span>
              （跑前检查只看本地状态，不花额度）。
            </p>
          </>
        ),
      };
    }
    if (typed && !known && !looksLikeSource) {
      return { type: 'error', title: `没找到「${typed}」，也不像 owner/repo 链接` };
    }
    return null;
  };
  const blocked = blocker();

  const append = (text: string): void => setLog((prev) => (prev ? `${prev}\n${text}` : text));

  /**
   * 根据能力起草提示词：只填进输入框，用户改完再提交（不直接开跑）。
   *   填的是**已在册的名字** → 直接读它的 SKILL.md；
   *   填的是**来源链接**（比如刚从技能市场选的那条）→ 先把它拉进候选池，再读它的 SKILL.md。
   * 以前只在"名字能对上已在册的能力"时可点，用户从市场选了链接过来，按钮永远是灰的。
   */
  const draftFromCapability = async (): Promise<void> => {
    if (!typed) return;
    setDrafting(true);
    setError(null);
    try {
      const { prompt, pulled } = await draftPrompt(known ? { name: known.id } : { input: typed });
      form.setFieldValue('task', prompt);
      if (pulled) append(`已把 ${pulled} 拉进候选池，并按它的 SKILL.md 起草了提示词。`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDrafting(false);
    }
  };

  /** 搜技能市场：只是"去哪找一个候选"的便利入口，搜不到照旧能手填 */
  const runMarketSearch = async (raw: string): Promise<void> => {
    const q = raw.trim();
    if (q.length < 2) {
      setMarketError('至少输入两个字，才好按名称 / 描述搜');
      setMarketResults([]);
      return;
    }
    setMarketBusy(true);
    setMarketError(null);
    try {
      const { skills } = await searchMarket(q);
      setMarketResults(skills);
    } catch (e) {
      setMarketError(e instanceof Error ? e.message : String(e));
      setMarketResults([]);
    } finally {
      setMarketBusy(false);
    }
  };

  /** 选中一条市场结果 → 填进「能力」那一格（市场给的就是我们认的 GitHub 来源写法） */
  const pickSkill = (skill: MarketSkill): void => {
    form.setFieldValue('capability', skill.source);
    setMarketError(null);
    setMarketResults(null);
    setMarketOpen(false);
  };

  /**
   * 提交：**发到后台就关窗**。
   *
   * 以前是「弹窗里轮询等它跑完」——一次评测十几分钟，窗口只能干等，关掉就看不见了。
   * 现在服务端立刻返回这次运行的信息（`run`），交给首页列表挂着，用户爱去哪去哪。
   */
  const start = (values: FormValues): void => {
    if (!canStart) return;
    const name = (values.capability ?? '').trim();
    const ask = (values.task ?? '').trim();
    const repeat = Number(values.repeat ?? 1) > 1 ? Number(values.repeat) : undefined;
    setBusy(true);
    setError(null);
    const launch =
      known && name !== '' && known.hasConfig && !ask
        ? evalStart({ tool: known.tool, name, repeat })
        : evalAuto({ input: name, task: ask || undefined, repeat });
    launch
      .then(({ run }) => {
        onStarted?.(run);
        onClose();
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={620}
      title="发起评测"
      footer={
        <Space>
          <Button onClick={onClose}>关闭</Button>
          <Button
            type="primary"
            onClick={() => form.submit()}
            loading={busy}
            disabled={!canStart}
            title={noEngine ? '本机没有可用的评测引擎：先装 claude / codex / qodercli / qwen 之一' : undefined}
          >
            提交
          </Button>
        </Space>
      }
    >
      <Form form={form} className="run-form" layout="vertical" onFinish={start} requiredMark={false}>
        <Form.Item
          name="capability"
          label={
            <span className="form-label">
              能力
              <Button
                type="link"
                size="small"
                className="form-label__action"
                onClick={() => setMarketOpen((v) => !v)}
                aria-expanded={marketOpen}
              >
                {marketOpen ? '收起技能市场' : '技能市场'}
              </Button>
            </span>
          }
        >
          <Input
            placeholder="能力名，或 owner/repo 链接"
            onPressEnter={() => canStart && form.submit()}
            aria-label="能力"
          />
        </Form.Item>

        {marketOpen ? (
          <div className="market">
            <Input.Search
              placeholder="搜技能名或描述（例如 ui、ppt、日志分析）"
              aria-label="搜索技能市场"
              enterButton="搜索"
              loading={marketBusy}
              value={marketQuery}
              onChange={(e) => setMarketQuery(e.target.value)}
              onSearch={(value) => void runMarketSearch(value)}
            />
            {marketError ? <Alert type="warning" showIcon title={marketError} /> : null}
            {marketResults === null ? (
              <p className="sheet__note">按名称或描述搜 skillsmp.com 上的技能，选中即填「能力」——也可以点「评测」直接开跑。</p>
            ) : marketResults.length === 0 ? (
              <p className="sheet__note">没搜到——换个词，或直接在上面填 owner/repo / GitHub 链接。</p>
            ) : (
              <ul className="market__list">
                {marketResults.map((skill) => (
                  <li className="market__item" key={skill.id || skill.source}>
                    <button type="button" className="market__pick" onClick={() => pickSkill(skill)}>
                      <span className="market__name">
                        {skill.name}
                        {skill.stars ? <span className="market__stars">★ {formatStars(skill.stars)}</span> : null}
                      </span>
                      <span className="market__desc">{skill.description || '（这个技能没写描述）'}</span>
                      <span className="market__src mono">{skill.author ? `${skill.author} · ` : ''}{shortSource(skill.source)}</span>
                    </button>
                    <Button
                      size="small"
                      type="primary"
                      onClick={() => {
                        pickSkill(skill);
                        form.submit();
                      }}
                    >
                      评测
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        <Form.Item
          name="task"
          label={
            <span className="form-label">
              提示词
              <Button
                type="link"
                size="small"
                className="form-label__action"
                loading={drafting}
                disabled={!typed}
                title={
                  known
                    ? '读这个能力的 SKILL.md，起草一条贴合它的任务（交付物形态跟着能力走）'
                    : typed
                      ? '先从来源把它拉进候选池，再起草一条贴合它的任务'
                      : '先填一个能力名或来源链接'
                }
                onClick={() => void draftFromCapability()}
              >
                根据能力生成
              </Button>
            </span>
          }
        >
          <Input.TextArea
            rows={4}
            maxLength={4000}
            showCount
            placeholder="（可选）你自己出的任务：填了就按它跑 A/B —— A 只给这段提示词，B 再附上技能正文，由 LLM 裁判判"
            aria-label="提示词"
          />
        </Form.Item>

        {/* 重复跑：同一条用例跑 N 遍，结论里给"全过几次"。默认 1 次不打扰；
            实测同一条用例两次跑，A 侧结果都会翻转，所以"想看清一个技能稳不稳"就得重复 */}
        <Form.Item name="repeat" label="重复跑" initialValue={1} className="run-form__repeat">
          <Select
            aria-label="重复跑次数"
            options={[
              { value: 1, label: '1 次（默认）' },
              { value: 2, label: '2 次' },
              { value: 3, label: '3 次（能看出稳不稳）' },
              { value: 5, label: '5 次（更硬的证据）' },
            ]}
          />
        </Form.Item>
      </Form>

      {blocked ? <Alert type={blocked.type} showIcon title={blocked.title} description={blocked.description} /> : null}
      {error ? <Alert type="error" showIcon title={error} /> : null}

      {log ? (
        <pre className="trial-log" aria-label="评测运行日志">
          {log}
        </pre>
      ) : null}
    </Modal>
  );
}
