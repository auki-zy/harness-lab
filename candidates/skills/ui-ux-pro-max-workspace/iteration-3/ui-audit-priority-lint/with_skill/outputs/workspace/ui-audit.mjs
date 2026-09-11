import { readFileSync } from 'node:fs';

function srgbToLinear(channel) {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex) {
  const h = String(hex).trim().replace(/^#/, '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrastRatio(fg, bg) {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
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

function audit(spec) {
  const lines = [];

  for (const item of spec.colors || []) {
    if (contrastRatio(item.fg, item.bg) < 4.5) {
      lines.push(`contrast ${item.name}`);
    }
  }

  if (spec.fontPx < 16) {
    lines.push(`font ${spec.fontPx}`);
  }

  if (spec.touchPx < 44) {
    lines.push(`touch ${spec.touchPx}`);
  }

  for (const icon of spec.icons || []) {
    if (hasEmoji(icon)) {
      lines.push(`emoji ${icon}`);
    }
  }

  return lines.length ? lines.join('\n') + '\n' : 'PASS\n';
}

try {
  const path = process.argv[2];
  if (!path) throw new Error('missing input path');

  const raw = readFileSync(path, 'utf8');
  const spec = JSON.parse(raw);

  process.stdout.write(audit(spec));
} catch (err) {
  process.stderr.write(String((err && err.message) || err) + '\n');
  process.exitCode = 1;
}
