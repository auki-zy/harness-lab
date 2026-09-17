// 仓库完整性的守卫用例：**证据得在、内容得没被换过、源码不带 BOM**。
//
// 三条都是真事换来的（2026-09-15）：
//   1. 那次重复跑把两条旧试用的 `iteration-1/2` **原地覆盖**了——路径还在、内容成了别人的数据。
//      只查"文件存不存在"发现不了，所以产物要记 sha256；
//   2. 同一天我三次被 PowerShell 的 `Set-Content -Encoding UTF8` 加上 BOM 坑到：`.mjs` 开头的
//      shebang 会直接坏掉、喂给 bash 的脚本也一样。
// 放在 tools/ 而不是 src/：这是仓库数据的事，不是页面的事（src 侧也没有 Node 类型）。
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const trialsDir = path.join(root, 'evals', 'trials');

const trials = () =>
  readdirSync(trialsDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ file: f, trial: JSON.parse(readFileSync(path.join(trialsDir, f), 'utf8')) }));

/** trial 里记的路径都是**相对仓库根**的 */
const abs = (rel) => path.join(root, rel);

describe('仓库完整性（守卫用例）', () => {
  it('每条试用的证据路径都存在', () => {
    const missing = [];
    for (const { file, trial } of trials()) {
      for (const p of trial.evidence ?? []) {
        if (!existsSync(abs(p))) missing.push(`${file} → ${p}`);
      }
    }
    expect(missing, `这些证据文件不见了：\n${missing.join('\n')}`).toEqual([]);
  });

  it('记了哈希的产物，内容必须对得上（防止同名目录被覆盖后悄悄指向别人的数据）', () => {
    const bad = [];
    let checked = 0;
    for (const { file, trial } of trials()) {
      for (const cond of trial.conditions ?? []) {
        if (!cond.artifact || !cond.artifactSha256) continue;
        if (!existsSync(abs(cond.artifact))) {
          bad.push(`${file} ${cond.name}：产物不见了 ${cond.artifact}`);
          continue;
        }
        checked += 1;
        const now = createHash('sha256').update(readFileSync(abs(cond.artifact))).digest('hex').slice(0, 16);
        if (now !== cond.artifactSha256) bad.push(`${file} ${cond.name}：产物内容被换过 ${cond.artifact}`);
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
    // 别让这条守卫悄悄退化成"什么都没检查"（历史记录已回填哈希）
    expect(checked).toBeGreaterThan(0);
  });

  it('第一方源码 / 文档不带 BOM（.mjs 的 shebang 会被 BOM 弄坏）', () => {
    const exts = /\.(mjs|cjs|js|ts|tsx|css|md|json|ya?ml)$/;
    const dirs = ['src', 'tools', 'scripts', 'evals', 'docs'];
    const offenders = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (exts.test(entry.name) && statSync(full).size >= 3) {
          const head = readFileSync(full).subarray(0, 3);
          if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) offenders.push(path.relative(root, full));
        }
      }
    };
    for (const d of dirs) if (existsSync(path.join(root, d))) walk(path.join(root, d));
    expect(offenders, `这些文件带了 BOM：${offenders.join('、')}`).toEqual([]);
  });
});
