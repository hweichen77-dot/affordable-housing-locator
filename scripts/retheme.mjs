// Warm-shift retheme: cold slate neutrals -> warm near-black, green accent -> muted amber.
// Categorical tier hues (ELI red ~20, VLI orange ~50, MOD blue ~220) are kept distinct for data legibility.
// Run: node scripts/retheme.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../src/App.css', import.meta.url);
const WARM = 75;   // warm near-black / amber-leaning neutral hue
const AMBER = 70;  // primary accent hue

let css = readFileSync(FILE, 'utf8');
let neutralShifts = 0, greenShifts = 0;

// Match oklch(L% C H [/ A]) — capture the four parts.
const RE = /oklch\(\s*([\d.]+%)\s+([\d.]+)\s+([\d.]+)(\s*\/\s*[\d.]+)?\s*\)/g;

css = css.replace(RE, (full, L, C, H, A) => {
  const chroma = parseFloat(C);
  const hue = parseFloat(H);
  const alpha = A || '';

  // Neutral backgrounds/borders/text: cold blue-slate, low chroma -> warm.
  if (hue >= 190 && hue <= 260 && chroma < 0.03) {
    neutralShifts++;
    return `oklch(${L} ${C} ${WARM}${alpha})`;
  }
  // Green accent family -> muted amber.
  if (hue >= 135 && hue <= 160) {
    greenShifts++;
    return `oklch(${L} ${C} ${AMBER}${alpha})`;
  }
  // Everything else (red/orange/blue categorical + neutral pure black/white) untouched.
  return full;
});

writeFileSync(FILE, css);
console.log(`neutral->warm: ${neutralShifts}, green->amber: ${greenShifts}`);
