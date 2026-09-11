import { Button, Table } from 'antd';
import type { TableProps } from 'antd';
import { memo, useMemo } from 'react';
import { decisionView, humanReviewGlyph, humanReviewLine, trialDateShort, trialKindView, trialTask } from '../shared/findings';
import type { Trial } from '../shared/types';
import { VerdictStamp } from './verdict-stamp';

interface Props {
  trials: Trial[];
  onOpen: (trialId: string) => void;
}

/** 一次显示几条（多于这个数就翻页；试用是会攒到几十条的） */
export const TRIALS_PER_PAGE = 5;

/**
 * 试用记录：紧凑表格 + 分页，点「详情」进二级抽屉。
 *
 * 每一列都只放**一眼能扫的东西**（2026-09-11 按反馈收过一轮）：
 *   结论（印章，够宽放得下三字结论）· 日期（只留月-日）· 任务（定宽 + 省略，完整值在 hover）
 *   · 方式（对比 / 模拟 / 实跑 / 探针，全称在 hover）· 人评（只有 👍 / 👎 / —）· 详情。
 * 任务 id 是给人核对用的，不是给人读的，所以定宽省略、不抢地方。
 *
 * `memo` + `useMemo(columns)` 是为了让"打开某次试用详情"时不必把整张表重算一遍。
 */
export const TrialList = memo(function TrialList({ trials, onOpen }: Props) {
  const columns = useMemo<TableProps<Trial>['columns']>(
    () => [
      {
        title: '结论',
        key: 'verdict',
        width: 96,
        render: (_, t) => <VerdictStamp decision={decisionView(t.verdict?.decision)} />,
      },
      {
        title: '日期',
        key: 'date',
        width: 60,
        render: (_, t) => <span className="mono trials__date">{trialDateShort(t)}</span>,
      },
      {
        title: '任务',
        key: 'task',
        width: 150,
        render: (_, t) => {
          const task = trialTask(t);
          return (
            <span className="mono trials__task" title={task}>
              {task}
            </span>
          );
        },
      },
      {
        title: '方式',
        key: 'kind',
        width: 56,
        render: (_, t) => {
          const kind = trialKindView(t);
          return (
            <span className="trials__kind" title={`${kind.label}：${kind.detail}`}>
              {kind.short}
            </span>
          );
        },
      },
      {
        title: '人评',
        key: 'review',
        width: 52,
        render: (_, t) => (
          <span className="trials__review" title={humanReviewLine(t)}>
            {humanReviewGlyph(t)}
          </span>
        ),
      },
      {
        title: '',
        key: 'open',
        width: 56,
        render: (_, t) => (
          <Button type="link" size="small" onClick={() => onOpen(t.trialId)}>
            详情
          </Button>
        ),
      },
    ],
    [onOpen],
  );

  return (
    <Table<Trial>
      className="trials"
      size="small"
      rowKey="trialId"
      columns={columns}
      dataSource={trials}
      pagination={{
        pageSize: TRIALS_PER_PAGE,
        size: 'small',
        showSizeChanger: false,
        hideOnSinglePage: true,
        showTotal: (total) => `共 ${total} 次试用`,
      }}
    />
  );
});
