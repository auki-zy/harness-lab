#!/usr/bin/env node
'use strict';

import fs from 'node:fs';

const CONTRAST_MIN = 4.5;
const FONT_MIN = 16;
const TOUCH_MIN = 44;
const EMOJI_MIN = 0x1f000;

function hexToRgb(value) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(value).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

// sRGB channel -> linear light
function linearize(channel) {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb) {
  return (
    0.2126 * linearize(rgb[0]) +
    0.7152 * linearize(rgb[1]) +
    0.0722 * linearize(rgb[2])
  );
}

function contrastRatio(fg, bg) {
  const a = hexToRgb(fg);
  const b = hexToRgb(bg);
  if (!a || !b) return NaN;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

function hasPictographic(text) {
  for (const ch of String(text)) {
    if (ch.codePointAt(0) >= EMOJI_MIN) return true;
  }
  return false;
}

function audit(data) {
  const lines = [];

  const colors = Array.isArray(data.colors) ? data.colors : [];
  for (const item of colors) {
    if (!item) continue;
    if (contrastRatio(item.fg, item.bg) < CONTRAST_MIN) {
      lines.push(`contrast ${item.name}`);
    }
  }

  if (data.fontPx < FONT_MIN) {
    lines.push(`font ${data.fontPx}`);
  }

  if (data.touchPx < TOUCH_MIN) {
    lines.push(`touch ${data.touchPx}`);
  }

  const icons = Array.isArray(data.icons) ? data.icons : [];
  for (const icon of icons) {
    if (hasPictographic(icon)) {
      lines.push(`emoji ${icon}`);
    }
  }

  return lines.length > 0 ? lines : ['PASS'];
}

function main() {
  const file = process.argv[2];
  if (!file) process.exit(1);

  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(raw.replace(/^﻿/, ''));
  } catch {
    process.exit(1);
  }

  let lines;
  try {
    lines = audit(data);
  } catch {
    process.exit(1);
  }

  process.stdout.write(lines.join('\n') + '\n');
}

main();
