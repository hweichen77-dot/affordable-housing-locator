
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../src/App.css', import.meta.url);
const WARM = 75;
const AMBER = 70;

let css = readFileSync(FILE, 'utf8');
let neutralShifts = 0, greenShifts = 0;

const RE = /oklch\(\s*([\d.]+%)\s+([\d.]+)\s+([\d.]+)(\s*\/\s*[\d.]+)?\s*\)/g;

css = css.replace(RE, (full, L, C, H, A) => {
  const chroma = parseFloat(C);
  const hue = parseFloat(H);
  const alpha = A || '';

  if (hue >= 190 && hue <= 260 && chroma < 0.03) {
    neutralShifts++;
    return `oklch(${L} ${C} ${WARM}${alpha})`;
  }

  if (hue >= 135 && hue <= 160) {
    greenShifts++;
    return `oklch(${L} ${C} ${AMBER}${alpha})`;
  }

  return full;
});

writeFileSync(FILE, css);
console.log(`neutral->warm: ${neutralShifts}, green->amber: ${greenShifts}`);
