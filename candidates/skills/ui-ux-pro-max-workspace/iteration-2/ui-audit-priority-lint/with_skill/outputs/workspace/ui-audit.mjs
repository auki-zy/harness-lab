import { readFileSync } from 'node:fs';

function fail() {
  process.exit(1);
}

function srgbToLinear(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex) {
  const h = String(hex).trim().replace(/^#/, '');
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrastRatio(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}

function hasEmoji(str) {
  for (const ch of String(str)) {
    if (ch.codePointAt(0) >= 0x1f000) return true;
  }
  return false;
}

const file = process.argv[2];
if (!file) fail();

let data;
try {
  data = JSON.parse(readFileSync(file, 'utf8'));
} catch {
  fail();
}

if (data === null || typeof data !== 'object') fail();

const lines = [];

const colors = Array.isArray(data.colors) ? data.colors : [];
for (const color of colors) {
  if (contrastRatio(color.fg, color.bg) < 4.5) {
    lines.push('contrast ' + color.name);
  }
}

if (data.fontPx < 16) lines.push('font ' + data.fontPx);
if (data.touchPx < 44) lines.push('touch ' + data.touchPx);

const icons = Array.isArray(data.icons) ? data.icons : [];
for (const icon of icons) {
  if (hasEmoji(icon)) lines.push('emoji ' + icon);
}

process.stdout.write((lines.length ? lines.join('\n') : 'PASS') + '\n');
