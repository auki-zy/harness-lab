import { Button, Empty } from 'antd';
import { useEffect, useState } from 'react';
import { evidenceBodyKind, type EvidenceGroup, type EvidenceView } from '../shared/findings';
import { useMediaQuery } from '../shared/viewport';

/** 一次最多渲染这么多字符：证据里动辄几万行的转录，整段塞进 DOM 只会把抽屉拖垮 */
const MAX_CHARS = 40_000;

interface Props {
  groups: EvidenceGroup[];
}

interface Body {
  status: 'idle' | 'loading' | 'ready' | 'error';
  text: string;
  truncated: boolean;
  bytes: number | null;
  error: string | null;
}

const EMPTY: Body = { status: 'idle', text: '', truncated: false, bytes: null, error: null };

/**
 * 「原始文件」视图：左边文件（按"证明什么"分组）、右边内容。
 * 这是最后一档——想核对原文时才来；A/B 差在哪、凭什么判过，前两个视图已经答了。
 *
 * 两个刻意的做法：
 *   1. 技能自带的那组**默认折叠**（一次十几个文件，和这次跑出来的东西无关）；
 *   2. 切文件时**内容区高度不塌**（旧的"读取中…"只有一行、代码块十几行，来回切就一闪一闪的）：
 *      内容框预留固定高度，加载中也占着那块地方，加载完原地替换。
 */
export function EvidenceFiles({ groups }: Props) {
  const narrow = useMediaQuery('(max-width: 820px)');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const flat: EvidenceView[] = groups.flatMap((g) => g.items);
  const [active, setActive] = useState(0);
  const current = flat[Math.min(active, Math.max(flat.length - 1, 0))];
  const url = current?.url ?? '';
  const kind = current ? evidenceBodyKind(current.path) : 'other';
  const [body, setBody] = useState<Body>(EMPTY);

  useEffect(() => {
    if (!url || kind !== 'text') {
      setBody(EMPTY);
      return;
    }
    let stale = false;
    // 只翻牌不改布局：正文先留着，状态切到 loading（渲染上仍是同一块高度）
    setBody((prev) => ({ ...prev, status: 'loading', error: null }));
    // 用 Promise.resolve().then 起头：fetch 对不合法的 URL 会"同步抛"，包成链才能统一落到 catch
    Promise.resolve()
      .then(() => fetch(url))
      .then(async (res) => {
        if (!res.ok) throw new Error(`读取失败（HTTP ${res.status}）`);
        const text = await res.text();
        const length = Number(res.headers.get('content-length'));
        return {
          text: text.slice(0, MAX_CHARS),
          truncated: text.length > MAX_CHARS,
          bytes: Number.isFinite(length) && length > 0 ? length : null,
        };
      })
      .then(({ text, truncated, bytes }) => {
        if (!stale) setBody({ status: 'ready', text, truncated, bytes, error: null });
      })
      .catch((e: Error) => {
        if (!stale) setBody({ ...EMPTY, status: 'error', error: e.message });
      });
    return () => {
      stale = true;
    };
  }, [url, kind]);

  if (!current) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="这次没有留下可复核的证据文件" />;

  const sizeText = body.bytes === null ? '' : formatBytes(body.bytes);

  return (
    <div className="ev" data-narrow={narrow ? 'true' : 'false'}>
      <ul className="ev__files" aria-label="证据文件">
        {groups.map((group) => {
          // 技能自带的那组默认收起来：它和"这次跑出了什么"无关
          const collapsed = group.key === 'skill' && !expanded[group.key];
          return (
            <li key={group.key} className="ev__group" data-side={group.key}>
              <p className="ev__group-head">
                <span className="ev__group-title">{group.title}</span>
                <span className="ev__group-count">{group.items.length}</span>
                {group.key === 'skill' ? (
                  <button
                    type="button"
                    className="ev__group-toggle"
                    onClick={() => setExpanded((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
                  >
                    {collapsed ? '展开' : '收起'}
                  </button>
                ) : null}
              </p>
              <p className="ev__group-hint">{group.hint}</p>
              {collapsed ? null : (
                <ul className="ev__group-files">
                  {group.items.map((file) => {
                    const index = flat.indexOf(file);
                    return (
                      <li key={file.path}>
                        <button
                          type="button"
                          className="ev__file"
                          aria-current={index === active}
                          title={file.path}
                          onClick={() => setActive(index)}
                        >
                          <span className="ev__name mono">{file.name}</span>
                          <span className="ev__kind">{file.kind}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <div className="ev__body">
        <div className="ev__bar">
          <span className="ev__path mono" title={current.path}>
            {current.path}
          </span>
          <Button size="small" href={current.url} target="_blank" rel="noreferrer">
            新窗口打开
          </Button>
        </div>

        {kind === 'image' ? (
          <img className="ev__image" src={current.url} alt={current.name} />
        ) : kind === 'text' ? (
          <>
            <pre className="ev__code" aria-label={`${current.name} 的内容`} aria-busy={body.status === 'loading'}>
              <code>{body.status === 'ready' ? body.text : ''}</code>
            </pre>
            <p className="ev__note">
              {body.status === 'loading' ? '读取中…' : null}
              {body.status === 'error' ? `内容读不出来（${body.error}）——用「新窗口打开」看原文。` : null}
              {body.status === 'ready'
                ? body.truncated
                  ? `只显示前 ${MAX_CHARS.toLocaleString('en-US')} 字${sizeText ? `（原文 ${sizeText}）` : ''}——全文用「新窗口打开」。`
                  : sizeText
                    ? `全文 ${sizeText}。`
                    : '全文已显示。'
                : null}
            </p>
          </>
        ) : (
          <p className="ev__note">这个文件不是文本（{current.kind}）——用「新窗口打开」查看。</p>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
