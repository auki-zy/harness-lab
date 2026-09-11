import { useState } from 'react';
import type { EvidenceGroup } from '../shared/findings';
import type { Trial } from '../shared/types';
import { EvidenceFiles } from './evidence-files';
import { EvidenceVerdict } from './evidence-verdict';

interface Props {
  trial: Trial;
  groups: EvidenceGroup[];
}

/**
 * 证据区：**先给结论怎么来的，原始文件收起来**。
 *
 *   怎么判的   —— 逐条判据 × A / B 过没过（默认就这一段，撑死几行）
 *   原始记录   —— 一行折叠入口，展开才是分组文件列表 + 原文
 *
 * 之前是"三档视图 + A/B 对照"，其中 A/B 对照与详情顶部的对照板重复（那边已经能直接打开产物），
 * 用户的原话是"不需要这么多证据链"。所以这里只留"凭什么这么判"，其余按需展开。
 */
export function EvidenceViewer({ trial, groups }: Props) {
  const total = groups.reduce((sum, g) => sum + g.items.length, 0);
  const [open, setOpen] = useState(false);

  return (
    <div className="evwrap">
      <EvidenceVerdict trial={trial} />

      <div className="evwrap__raw">
        <button type="button" className="evwrap__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? '收起原始记录' : `原始记录（${total} 个文件）`}
        </button>
        {open ? <EvidenceFiles groups={groups} /> : null}
      </div>
    </div>
  );
}
