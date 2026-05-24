/**
 * minecraftColors.jsx
 * Parse Minecraft §-color-code sequences and return styled React spans.
 *
 * Color palette:
 *  §0 black   §1 dark_blue  §2 dark_green §3 dark_aqua
 *  §4 dark_red §5 dark_purple §6 gold     §7 gray
 *  §8 dark_gray §9 blue     §a green      §b aqua
 *  §c red      §d light_purple §e yellow  §f white
 *
 * Formatting:
 *  §l bold  §o italic  §n underline  §m strikethrough  §k obfuscated  §r reset
 */

import React from 'react';

const COLOR_MAP = {
  '0': '#000000', '1': '#0000AA', '2': '#00AA00', '3': '#00AAAA',
  '4': '#AA0000', '5': '#AA00AA', '6': '#FFAA00', '7': '#AAAAAA',
  '8': '#555555', '9': '#5555FF', 'a': '#55FF55', 'b': '#55FFFF',
  'c': '#FF5555', 'd': '#FF55FF', 'e': '#FFFF55', 'f': '#FFFFFF',
};

const FORMAT_MAP = {
  'l': 'bold',
  'o': 'italic',
  'n': 'underline',
  'm': 'line-through',
};

/**
 * Parse a string with §-codes into an array of {text, style} segments.
 */
export function parseMcString(str) {
  if (!str || !str.includes('§')) return [{ text: str || '', style: {} }];

  const segments = [];
  let current = { text: '', style: {} };

  for (let i = 0; i < str.length; i++) {
    if (str[i] === '§' && i + 1 < str.length) {
      const code = str[i + 1].toLowerCase();
      if (current.text) {
        segments.push({ ...current });
        current = { text: '', style: { ...current.style } };
      }
      if (code === 'r') {
        current.style = {};
      } else if (COLOR_MAP[code]) {
        current.style = { ...current.style, color: COLOR_MAP[code] };
      } else if (code === 'l') {
        current.style = { ...current.style, fontWeight: 'bold' };
      } else if (code === 'o') {
        current.style = { ...current.style, fontStyle: 'italic' };
      } else if (code === 'n') {
        const existing = current.style.textDecoration || '';
        current.style = { ...current.style, textDecoration: existing + ' underline' };
      } else if (code === 'm') {
        const existing = current.style.textDecoration || '';
        current.style = { ...current.style, textDecoration: existing + ' line-through' };
      }
      i++; // skip the code character
    } else {
      current.text += str[i];
    }
  }
  if (current.text) segments.push(current);
  return segments;
}

/**
 * Strip §-codes from a string (plain text).
 */
export function stripMcCodes(str) {
  if (!str) return '';
  return str.replace(/§[0-9a-fk-or]/gi, '');
}

/**
 * Render a Minecraft-colored string as React JSX.
 */
export function McText({ text, style = {}, className }) {
  if (!text) return null;
  const segments = parseMcString(text);
  if (segments.length === 1 && !Object.keys(segments[0].style).length) {
    return <span className={className} style={style}>{text}</span>;
  }
  return (
    <span className={className} style={style}>
      {segments.map((seg, i) => (
        <span key={i} style={seg.style}>{seg.text}</span>
      ))}
    </span>
  );
}
