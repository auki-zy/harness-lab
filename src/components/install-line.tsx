import { useState } from 'react';

interface Props {
  command: string;
  label?: string;
}

/** 安装命令 + 复制：命令本身等宽显示，右侧一个明确的复制按钮（复制后短暂反馈） */
export function InstallLine({ command, label = '复制' }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard?.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <span className="install">
      <code className="install__cmd mono" title={command}>
        {command}
      </code>
      <button type="button" className="install__copy" onClick={copy} aria-label="复制安装命令">
        {copied ? '已复制' : label}
      </button>
    </span>
  );
}
