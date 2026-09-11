// 离线 stub provider（给 promptfoo 的 exec provider 用）：
// 按 prompt 里有没有带子代理规格，返回"合规 JSON"或"散文"两种结果。
// ⚠️ 它不调用模型：只用来自检「promptfoo → 台账」这条链路，别当真实评测结论。
let input = process.argv.slice(2).join(' ');
if (!input.trim()) {
  input = await new Promise((resolve) => {
    let buf = '';
    process.stdin.on('data', (c) => (buf += c));
    process.stdin.on('end', () => resolve(buf));
  });
}

// 只认明确的规格标记：promptfoo 会把 prompt 的文件路径一起传进来，
// 那里面也有能力名，不能拿名字当判据，否则 A 侧会被误判成"带了规格"。
const hasSpec = /AGENT SPEC/.test(input);
const compliant = JSON.stringify({
  files: ['src/example.ts'],
  entrypoints: ['npm run dev → /example'],
  risks: ['示例模块与路由共享隐式状态'],
  plan: ['先钉范围', '再加守卫', '最后补用例'],
  verify: ['npm run typecheck', 'npm test'],
});

process.stdout.write(hasSpec ? compliant : '我看了一下，大概改 src/example.ts 就行，具体边写边看。');
