import { Alert, Button, Input, Modal, Space, Typography } from 'antd';
import { useState } from 'react';
import { saveReview } from '../shared/trial-api';
import type { Trial } from '../shared/types';

interface Props {
  trial: Trial;
  /** 提交成功后的动作：重新加载页面数据（页面只读，写完要重新聚合） */
  onDone: () => void;
}

const REASON_MAX = 300;

/** 二次确认走 `Modal.confirm`：能把"会写哪份文件、判定会不会变"这几句话摆清楚 */
function confirmReview(existing: boolean, onOk: () => void): void {
  Modal.confirm({
    title: existing ? '确认更新这次人评？' : '确认提交这次人评？',
    content: (
      <span>
        会写进 <span className="mono">evals/trials/&lt;id&gt;.json</span> 的 <span className="mono">humanReview</span>
        ，并重新聚合台账。人评是附加信号，<strong>不改变</strong>这次的判定。
      </span>
    ),
    okText: '确认提交',
    cancelText: '再改改',
    onOk,
  });
}

/**
 * 人评入口：👍 / 👎 + 一句可选理由，**提交前二次确认**。
 * 写进 `evals/trials/<id>.json` 的 `humanReview`（`mode: "quick"`），并在 `judge` 里补上 `human`。
 * 纪律：只记评审人自己给的——没写理由就不替他写，判定也不因为人评而改（判定只看客观检查）。
 */
export function ReviewForm({ trial, onDone }: Props) {
  const existing = trial.humanReview ?? null;
  const [verdict, setVerdict] = useState<'up' | 'down' | ''>((existing?.verdict as 'up' | 'down') ?? '');
  const [reason, setReason] = useState(existing?.reason ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (): void => {
    if (!verdict) return;
    setBusy(true);
    setError(null);
    saveReview({ trialId: trial.trialId, verdict, reason: reason.trim() || undefined })
      .then(() => onDone())
      .catch((e: Error) => {
        setError(e.message);
        setBusy(false);
      });
  };

  const changed = !existing || existing.verdict !== verdict || (existing.reason ?? '') !== reason.trim();

  return (
    <div className="review-form">
      <Space orientation="vertical" size={10} style={{ width: '100%' }}>
        {/* 两个按钮而不是 Segmented：Segmented 在"还没选"时（value=undefined）会自己把第一项渲染成选中，
            看起来像已经选了 👍，实际上状态是空的——错的不是文案，是会误导人。 */}
        <Space size={8}>
          {(['up', 'down'] as const).map((v) => (
            <Button
              key={v}
              type={verdict === v ? 'primary' : 'default'}
              aria-pressed={verdict === v}
              onClick={() => setVerdict(v)}
            >
              {v === 'up' ? '👍 赞' : '👎 踩'}
            </Button>
          ))}
        </Space>
        <Input.TextArea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="补一句理由（非必填）：哪里好、哪里不对、下次还会不会用"
          rows={2}
          maxLength={REASON_MAX}
          showCount
          aria-label="人评理由"
        />
        {error ? <Alert type="error" showIcon message={error} /> : null}
        <Space size={10} wrap>
          <Button
            type="primary"
            disabled={!verdict || busy || !changed}
            loading={busy}
            onClick={() => verdict && confirmReview(Boolean(existing), submit)}
          >
            {existing ? '更新人评' : '提交人评'}
          </Button>
          {verdict ? (
            <Typography.Text type="secondary">
              将记录：{verdict === 'up' ? '👍 赞' : '👎 踩'}
              {reason.trim() ? `，理由「${reason.trim().slice(0, 24)}${reason.trim().length > 24 ? '…' : ''}」` : '，不写理由'}
            </Typography.Text>
          ) : (
            <Typography.Text type="secondary">先选 👍 或 👎，再提交（理由可留空）</Typography.Text>
          )}
        </Space>
      </Space>
    </div>
  );
}
