import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * The palette is measured, not eyeballed. Colours are read straight out of
 * src/index.css, converted from OKLCH to the sRGB the browser actually paints,
 * and every pair of colours that end up on top of each other has to clear the
 * WCAG AA bar of 4.5:1 for body text. Change a token and this test either
 * agrees or names the ratio it got.
 */

const CSS_PATH = resolve(process.cwd(), 'src/index.css');
const AA = 4.5;

/** A colour as sRGB channels in 0..1, after the browser's own clipping. */
type Rgb = readonly [number, number, number];

function channel(value: number): number {
  const gamma = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
  // A colour outside the sRGB gamut is shown clipped, so measure it clipped.
  return Math.min(1, Math.max(0, gamma));
}

function oklchToRgb(l: number, c: number, hueDegrees: number): Rgb {
  const hue = (hueDegrees * Math.PI) / 180;
  const a = c * Math.cos(hue);
  const b = c * Math.sin(hue);
  const lCube = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mCube = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sCube = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    channel(4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube),
    channel(-1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube),
    channel(-0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube),
  ];
}

function linearize(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgb: Rgb): number {
  return 0.2126 * linearize(rgb[0]) + 0.7152 * linearize(rgb[1]) + 0.0722 * linearize(rgb[2]);
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return ((lighter as number) + 0.05) / ((darker as number) + 0.05);
}

/** Every solid OKLCH token in a block of CSS, by token name. */
function tokensIn(source: string): Map<string, Rgb> {
  const tokens = new Map<string, Rgb>();
  for (const match of source.matchAll(/--([a-z0-9-]+):\s*oklch\(([^)]+)\)/g)) {
    const name = match[1] as string;
    const parts = (match[2] as string).trim().split(/[\s/]+/);
    if (parts.length !== 3) continue; // a colour with alpha is a surface, not text
    const [l, c, hue] = parts.map(Number) as [number, number, number];
    tokens.set(name, oklchToRgb(l, c, hue));
  }
  return tokens;
}

const css = readFileSync(CSS_PATH, 'utf8');
const darkMarker = "[data-theme='dark']";
const darkIndex = css.indexOf(darkMarker);
if (darkIndex < 0) throw new Error(`${CSS_PATH} has no ${darkMarker} block`);

const light = tokensIn(css.slice(0, darkIndex));
const dark = tokensIn(css.slice(darkIndex));

/** Every pair that ends up drawn on top of each other somewhere in the interface. */
const PAIRS: readonly (readonly [string, string])[] = [
  ['text', 'bg'],
  ['text', 'panel'],
  ['text', 'panel-2'],
  ['text-muted', 'bg'],
  ['text-muted', 'panel'],
  ['text-muted', 'panel-2'],
  ['accent', 'bg'],
  ['accent', 'panel'],
  ['accent', 'accent-soft'],
  ['on-accent', 'accent'],
  ['ok', 'bg'],
  ['bad', 'bg'],
  ['warn', 'bg'],
  ['ok', 'panel'],
  ['bad', 'panel'],
  ['warn', 'panel'],
  ['k-pc', 'panel'],
  ['k-hub', 'panel'],
  ['k-switch', 'panel'],
  ['k-router', 'panel'],
  ['k-firewall', 'panel'],
  ['k-cloud', 'panel'],
  ['k-arp', 'panel'],
  ['k-ping', 'panel'],
];

const THEMES: readonly (readonly [string, Map<string, Rgb>])[] = [
  ['light', light],
  ['dark', dark],
];

describe('palette', () => {
  for (const [theme, tokens] of THEMES) {
    it(`defines the same tokens in ${theme} as in light`, () => {
      expect([...light.keys()].filter((name) => !tokens.has(name))).toEqual([]);
    });

    for (const [foreground, background] of PAIRS) {
      it(`${theme}: ${foreground} on ${background} clears AA`, () => {
        const fg = tokens.get(foreground);
        const bg = tokens.get(background);
        if (fg === undefined || bg === undefined) {
          throw new Error(`missing token: ${fg === undefined ? foreground : background}`);
        }
        const ratio = contrastRatio(fg, bg);
        expect(
          ratio,
          `${foreground} on ${background} measured ${ratio.toFixed(2)}:1, needs ${AA}:1`,
        ).toBeGreaterThanOrEqual(AA);
      });
    }
  }
});

describe('colour discipline', () => {
  it('names no colour outside index.css', () => {
    const offenders: string[] = [];
    const names: string[] = readdirSync(resolve(process.cwd(), 'src'), {
      recursive: true,
      encoding: 'utf8',
    });
    for (const name of names) {
      if (!name.endsWith('.css') || name === 'index.css') continue;
      const text = readFileSync(resolve(process.cwd(), 'src', name), 'utf8');
      for (const match of text.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|lab|lch)\(/g)) {
        offenders.push(`${name}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
