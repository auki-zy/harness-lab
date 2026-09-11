import { readFileSync } from 'node:fs';

const MIN_CONTRAST = 4.5;
const MIN_FONT_PX = 16;
const MIN_TOUCH_PX = 44;
const EMOJI_BASE = 0x1f000;

function channelToLinear(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex) {
  const h = hex.replace(/^#/, '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (
    0.2126 * channelToLinear(r) +
    0.7152 * channelToLinear(g) +
    0.0722 * channelToLinear(b)
  );
}

function contrastRatio(fg, bg) {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

function hasEmoji(text) {
  for (const ch of text) {
    if (ch.codePointAt(0) >= EMOJI_BASE) return true;
  }
  return false;
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) return 1;

  let raw;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return 1;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return 1;
  }

  const lines = [];
  const colors = Array.isArray(data.colors) ? data.colors : [];
  const icons = Array.isArray(data.icons) ? data.icons : [];

  for (const color of colors) {
    if (contrastRatio(color.fg, color.bg) < MIN_CONTRAST) {
      lines.push(`contrast ${color.name}`);
    }
  }

  if (data.fontPx < MIN_FONT_PX) {
    lines.push(`font ${data.fontPx}`);
  }

  if (data.touchPx < MIN_TOUCH_PX) {
    lines.push(`touch ${data.touchPx}`);
  }

  for (const icon of icons) {
    if (hasEmoji(icon)) {
      lines.push(`emoji ${icon}`);
    }
  }

  process.stdout.write(lines.length ? lines.join('\n') + '\n' : 'PASS\n');
  return 0;
}

process.exitCode = main();
