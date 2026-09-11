// 配置解析的回归测试（就是这个 bug 让"从链接拉技能"卡在跑前检查：
// 模板里 `name: claude_code   # 换成…` 带了行内注释，旧正则匹配不到，把 model.name 读成了引擎名）
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { configuredEngine, configuredModel } from './engines.mjs';

const dir = mkdtempSync(join(tmpdir(), 'engines-test-'));
const write = (name, text) => {
  const file = join(dir, name);
  writeFileSync(file, text, 'utf8');
  return file;
};

const TEMPLATE = [
  'name: demo',
  'engine:',
  '  name: claude_code         # 换成你本机装了的引擎：claude_code / codex / qodercli / qwen_code',
  '  model:',
  '    name: auto          # auto = 用引擎默认；走 Athen 时由桥接换成网关上的模型名',
  'cases:',
  '  files:',
  '    - cases/demo.yaml',
  '',
].join('\n');

describe('eval.yaml 的引擎配置', () => {
  it('值后面带行内注释也要读对（脚手架模板就是这个形状）', () => {
    const file = write('template.yaml', TEMPLATE);
    expect(configuredEngine(file)).toBe('claude_code');
    expect(configuredModel(file)).toBe('auto');
  });

  it('不带注释、带引号都读得出来', () => {
    const plain = write('plain.yaml', 'engine:\n  name: codex\n  model:\n    name: gpt-5\n');
    expect(configuredEngine(plain)).toBe('codex');
    expect(configuredModel(plain)).toBe('gpt-5');

    const quoted = write('quoted.yaml', 'engine:\n  name: "qwen_code"\n  model:\n    name: \'qwen3-max\'\n');
    expect(configuredEngine(quoted)).toBe('qwen_code');
    expect(configuredModel(quoted)).toBe('qwen3-max');
  });

  it('只认 engine 块：别处（judge.model）的 model 不算引擎模型', () => {
    const file = write(
      'ask.yaml',
      ['engine:', '  name: claude_code', 'judge:', '  kind: agent_judge', '  model:', '    name: deepseek-v4-flash', ''].join('\n'),
    );
    expect(configuredEngine(file)).toBe('claude_code');
    expect(configuredModel(file)).toBe('');
  });

  it('engine 块后面的顶格键（cases:）不会被误读成引擎', () => {
    const file = write('after.yaml', 'engine:\n  name: claude_code\ncases:\n  files: []\nmodel:\n  name: nope\n');
    expect(configuredEngine(file)).toBe('claude_code');
    expect(configuredModel(file)).toBe('');
  });

  it('文件不存在或没写 engine 时给空串（调用方走默认）', () => {
    expect(configuredEngine(join(dir, 'nope.yaml'))).toBe('');
    expect(configuredModel(undefined)).toBe('');
    const none = write('none.yaml', 'name: demo\ncases:\n  files: []\n');
    expect(configuredEngine(none)).toBe('');
    expect(configuredModel(none)).toBe('');
  });
});
