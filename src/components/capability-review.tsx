import { Alert, Button, Input, Modal, Space, Typography } from 'antd';
import { useState } from 'react';
import { humanDecisionView, humanSummary } from '../shared/findings';
import { saveCapabilityDecision } from '../shared/trial-api';
import type { Capability } from '../shared/types';

interface Props {
  capability: Capability;
  /** 提交成功后重新加载页面数据（页面只读，写完要重新聚合） */
  onDone: () => void;
}

const REASON_MAX = 300;

/** 二次确认走 `Modal.confirm`（比 Popconfirm 更能装下"会写哪份文件、会改什么状态"这几句话） */
function confirmDecision(verdict: 'adopt' | 'reject', onOk: () => void): void {
  Modal.confirm({
    title: verdict === 'reject' ? '确认不采纳这个能力？' : '确认采纳这个能力？',
    content: (
      <span>
        会写进 <span className="mono">evals/capabilities.json</span> 的 <span className="mono">humanDecision</span>
        ，并同步能力状态（{verdict === 'reject' ? '已放弃' : '已采纳'}）。这是你对这个能力的最终结论。
      </span>
    ),
    okText: verdict === 'reject' ? '确认不采纳' : '确认采纳',
    cancelText: '再改改',
    onOk,
  });
}

/**
 * 「我的结论」：**采纳与否由人给**，机器只给到"证据够了"。
 *
 * 上面那块是汇总：这个能力到目前为止人怎么看（几条试用人评、赞踩各几、有没有人选过加载能力那版），
 * 以及机器现在建议什么。下面才是入口：采纳 / 不采纳 + 一句可选理由 + 二次确认。
 * 机器跑完评测**不会**自动采纳（`decide()` 给的是 `ready`），所以这个模块是终局按钮。
 */
export function CapabilityReview({ capability, onDone }: Props) {
  const summary = humanSummary(capability);
  const decision = humanDecisionView(capability);
  const [verdict, setVerdict] = useState<'adopt' | 'reject' | ''>(decision.verdict ?? '');
  const [reason, setReason] = useState(decision.reason ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (): void => {
    if (!verdict) return;
    setBusy(true);
    setError(null);
    saveCapabilityDecision({ capabilityId: capability.id, verdict, reason: reason.trim() || undefined })
      .then(() => onDone())
      .catch((e: Error) => {
        setError(e.message);
        setBusy(false);
      });
  };

  const changed = decision.verdict !== (verdict || null) || (decision.reason ?? '') !== reason.trim();

  return (
    <div className="myverdict">
      <p className="myverdict__summary">{summary.line}</p>
      {summary.latest ? (
        <p className="myverdict__latest">
          最近一条（{summary.latest.date}）：{summary.latest.verdictLabel} · {summary.latest.betterText}
          {summary.latest.reason ? ` ——「${summary.latest.reason}」` : ''}
        </p>
      ) : null}
      <p className="myverdict__machine">{decision.machineHint}</p>

      {decision.decided ? (
        <p className="myverdict__decided" data-tone={decision.verdict === 'adopt' ? 'adopt' : 'reject'}>
          {decision.label}
          {decision.reviewedAt ? ` · ${decision.reviewedAt}` : ''}
          {decision.reason ? ` ——「${decision.reason}」` : ''}
        </p>
      ) : null}

      <Space orientation="vertical" size={10} style={{ width: '100%' }}>
        <Space size={8}>
          <Button
            type={verdict === 'adopt' ? 'primary' : 'default'}
            aria-pressed={verdict === 'adopt'}
            onClick={() => setVerdict('adopt')}
          >
            采纳这个能力
          </Button>
          <Button
            danger={verdict === 'reject'}
            type={verdict === 'reject' ? 'primary' : 'default'}
            aria-pressed={verdict === 'reject'}
            onClick={() => setVerdict('reject')}
          >
            不采纳
          </Button>
        </Space>
        <Input.TextArea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="补一句理由（非必填）：为什么采纳 / 为什么不采纳"
          rows={2}
          maxLength={REASON_MAX}
          showCount
          aria-label="我的结论理由"
        />
        {error ? <Alert type="error" showIcon title={error} /> : null}
        <Space size={10} wrap>
          <Button
            type="primary"
            disabled={!verdict || busy || !changed}
            loading={busy}
            onClick={() => verdict && confirmDecision(verdict, submit)}
          >
            {decision.decided ? '更新我的结论' : '提交我的结论'}
          </Button>
          {verdict ? (
            <Typography.Text type="secondary">
              将记录：{verdict === 'adopt' ? '采纳' : '不采纳'}
              {reason.trim() ? `，理由「${reason.trim().slice(0, 24)}${reason.trim().length > 24 ? '…' : ''}」` : '，不写理由'}
            </Typography.Text>
          ) : (
            <Typography.Text type="secondary">机器不会替你采纳——先选一个，再提交</Typography.Text>
          )}
        </Space>
      </Space>
    </div>
  );
}
