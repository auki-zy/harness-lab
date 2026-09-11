#!/usr/bin/env node
// 聚合：capabilities.json + tags.json + trials/*.json → evals/results/app-data.json
// 零依赖。app-data.json 供台账页面（Vite + React + AntD）读取。
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evalsDir = path.join(root, 'evals');
const trialsDir = path.join(evalsDir, 'trials');
const resultsDir = path.join(evalsDir, 'results');

// 手工编辑过的 JSON 常带 UTF-8 BOM（记事本 / PowerShell 默认就这么存），剥掉再解析
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));

const capsDoc = readJson(path.join(evalsDir, 'capabilities.json'));
const caps = Array.isArray(capsDoc.capabilities) ? capsDoc.capabilities : [];
const tagsDoc = existsSync(path.join(evalsDir, 'tags.json'))
  ? readJson(path.join(evalsDir, 'tags.json'))
  : { version: 1, dimensions: {} };

const trials = (existsSync(trialsDir) ? readdirSync(trialsDir).filter((f) => f.endsWith('.json')) : [])
  .map((f) => readJson(path.join(trialsDir, f)));

/** 标签校验：未登记的取值 → 待确认（新类型首次必须由用户确认） */
function validateTags(cap) {
  const pending = [];
  const t = cap.tags ?? {};
  const dims = tagsDoc.dimensions ?? {};
  for (const [dim, def] of Object.entries(dims)) {
    const value = t[dim];
    if (value == null) continue;
    const list = Array.isArray(value) ? value : [value];
    for (const v of list) {
      if (!def.values || !Object.prototype.hasOwnProperty.call(def.values, v)) {
        pending.push({ capability: cap.id, dimension: dim, value: v });
      }
    }
  }
  return pending;
}

const pendingTags = caps.flatMap(validateTags);

// 试用排序：先按业务日期，再按 recordedAt（同一天记多条时用），最后用 trialId 兜底保证稳定
const trialsOf = (id) =>
  trials
    .filter((t) => t?.capability?.id === id)
    .sort(
      (a, b) =>
        String(a.date ?? '').localeCompare(String(b.date ?? '')) ||
        String(a.recordedAt ?? '').localeCompare(String(b.recordedAt ?? '')) ||
        String(a.trialId ?? '').localeCompare(String(b.trialId ?? '')),
    );

const capabilities = caps.map((c) => {
  const list = trialsOf(c.id);
  const latest = list.length ? list[list.length - 1] : null;
  return {
    id: c.id,
    type: c.type,
    status: c.status,
    summary: c.summary ?? null,
    description: c.description ?? null,
    descriptionSource: c.descriptionSource ?? null,
    howToUse: c.howToUse ?? null,
    humanDecision: c.humanDecision ?? null,
    source: c.source ?? null,
    localPath: c.localPath ?? null,
    tags: c.tags ?? null,
    trials: list,
    latestTrial: latest,
  };
});

const data = {
  generatedAt: new Date().toISOString(),
  taxonomy: tagsDoc,
  pendingTags,
  capabilities,
};

mkdirSync(resultsDir, { recursive: true });
writeFileSync(path.join(resultsDir, 'app-data.json'), JSON.stringify(data, null, 2) + '\n', 'utf8');

console.log(`已生成 evals/results/app-data.json（能力 ${capabilities.length} / 试用 ${trials.length} / 待确认标签 ${pendingTags.length}）`);
if (pendingTags.length) {
  for (const p of pendingTags) console.log(`  ⚠ 待确认标签：${p.capability} · ${p.dimension}=${p.value}`);
}
