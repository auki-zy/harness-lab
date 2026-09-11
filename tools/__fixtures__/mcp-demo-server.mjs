#!/usr/bin/env node
/**
 * 演示/自测用的最小 MCP server（stdio，newline-delimited JSON-RPC）。
 * 它存在的意义：让 `tools/mcp-probe.mjs` 有一条可以离线真跑的 MCP 链路，
 * 顺便当"一个 MCP server 最少要实现什么"的参考实现：initialize / tools/list / tools/call。
 */
import { createInterface } from 'node:readline';

const TOOLS = [
  {
    name: 'wc_stats',
    description: '统计一段文本的行数、词数、字符数',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: '要统计的文本' } },
      required: ['text'],
    },
  },
  {
    name: 'echo',
    description: '把输入原样返回（用来验证通道）',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  },
];

const stats = (text) => {
  const trimmed = text.trim();
  return {
    lines: text.split('\n').length - (text.endsWith('\n') ? 1 : 0),
    words: trimmed ? trimmed.split(/\s+/).length : 0,
    chars: text.length,
  };
};

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const replyError = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const raw = line.trim();
  if (!raw) return;
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  if (msg.method === 'initialize') {
    return reply(msg.id, {
      protocolVersion: msg.params?.protocolVersion ?? '2025-06-18',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'mcp-demo', version: '0.1.0' },
    });
  }
  if (msg.method === 'notifications/initialized') return;
  if (msg.method === 'tools/list') return reply(msg.id, { tools: TOOLS });
  if (msg.method === 'tools/call') {
    const { name, arguments: args = {} } = msg.params ?? {};
    if (name === 'wc_stats') {
      const text = String(args.text ?? '');
      return reply(msg.id, { content: [{ type: 'text', text: JSON.stringify(stats(text)) }] });
    }
    if (name === 'echo') {
      return reply(msg.id, { content: [{ type: 'text', text: String(args.text ?? '') }] });
    }
    return replyError(msg.id, -32602, `未知工具：${name}`);
  }
  if (msg.id !== undefined) return replyError(msg.id, -32601, `未实现的方法：${msg.method}`);
});
