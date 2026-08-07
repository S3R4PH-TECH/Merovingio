#!/usr/bin/env node
/**
 * WCAG 2.1 contrast verifier for the Request Tracker palette.
 *
 * Every ratio quoted in docs/request-tracker/ACCESSIBILITY_REPORT.md comes from
 * this script. Run `npm run check:contrast` after touching any colour token; it
 * exits non-zero if a combination that must pass no longer does.
 */

function relativeLuminance(hex) {
  const channels = hex
    .replace('#', '')
    .match(/../g)
    .map(part => {
      const srgb = parseInt(part, 16) / 255;
      return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const [lighter, darker] = [
    relativeLuminance(foreground),
    relativeLuminance(background),
  ].sort((a, b) => b - a);

  return (lighter + 0.05) / (darker + 0.05);
}

/** [description, foreground, background, minimum ratio that must hold] */
const CHECKS = [
  // dark theme
  ['dark · body text on page', '#ffffff', '#0a0a0a', 4.5],
  ['dark · body text on card', '#ffffff', '#141414', 4.5],
  ['dark · muted text on page', '#9ca3af', '#0a0a0a', 4.5],
  ['dark · muted text on card', '#9ca3af', '#141414', 4.5],
  ['dark · accent text on card', '#34d399', '#141414', 4.5],
  ['dark · warnings amber on card', '#f59e0b', '#141414', 4.5],
  ['dark · running blue on card', '#3b82f6', '#141414', 4.5],
  ['dark · failed red on card', '#ef4444', '#141414', 4.5],
  ['dark · PRIMARY BUTTON label on accent', '#0a0a0a', '#10b981', 4.5],
  ['dark · primary button label on hover accent', '#0a0a0a', '#34d399', 4.5],
  ['dark · queued grey on card', '#9ca3af', '#141414', 4.5],
  ['dark · focus ring against page', '#10b981', '#0a0a0a', 3.0],
  ['dark · focus ring against card', '#10b981', '#141414', 3.0],

  // light theme
  ['light · body text on card', '#0a0a0a', '#ffffff', 4.5],
  ['light · muted text on card', '#52525b', '#ffffff', 4.5],
  ['light · muted text on subtle surface', '#52525b', '#f4f4f5', 4.5],
  ['light · accent text on card', '#047857', '#ffffff', 4.5],
  ['light · PRIMARY BUTTON label on accent', '#ffffff', '#047857', 4.5],
  ['light · warnings amber on card', '#b45309', '#ffffff', 4.5],
  ['light · running blue on card', '#1d4ed8', '#ffffff', 4.5],
  ['light · failed red on card', '#b91c1c', '#ffffff', 4.5],

  /*
   * Login / register — the frosted card over the Toxic Sentinel backdrop.
   *
   * The card has no fixed background: it is rgba(14,22,19,.82)…rgba(4,9,7,.9)
   * blurred over whatever the artwork puts behind it. #1a221f is the brightest
   * composite the stack can produce — the artwork's brightest pixel inside the
   * card's footprint, measured at rgb(234,253,243) (the glow around the eyes),
   * through the art's own opacity, then the scrim's centre (rgba(2,6,5,.66)),
   * then the card's most transparent stop. Backdrop blur only averages it
   * darker, so checking against #1a221f is the conservative case. These tokens
   * are pinned on .rt-login in recon-tracker.css and apply in both themes.
   *
   * Re-measure if the artwork changes: the figure is a property of the image,
   * not of the CSS.
   */
  ['login glass · body text', '#ffffff', '#1a221f', 4.5],
  ['login glass · labels and muted copy', '#c2ccc7', '#1a221f', 4.5],
  ['login glass · dim hint copy', '#a8b3ad', '#1a221f', 4.5],
  ['login glass · accent link', '#6ee7b7', '#1a221f', 4.5],
  ['login glass · error text', '#fca5a5', '#1a221f', 4.5],
  ['login glass · PRIMARY BUTTON label on accent', '#04120d', '#10b981', 4.5],
  ['login glass · primary button label on hover accent', '#04120d', '#34d399', 4.5],
  ['login glass · focus ring against card', '#10b981', '#1a221f', 3.0],
];

/**
 * The combination the reference mockup used. It is checked as a REGRESSION
 * GUARD: if someone "restores" white-on-emerald, this fails loudly.
 */
const MUST_FAIL = [['white on emerald (mockup default)', '#ffffff', '#10b981', 4.5]];

let failures = 0;

console.log('WCAG 2.1 contrast — Request Tracker\n');

for (const [name, fg, bg, minimum] of CHECKS) {
  const ratio = contrastRatio(fg, bg);
  const pass = ratio >= minimum;
  const grade = ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA-UI' : '--';

  if (!pass) failures += 1;
  console.log(
    `${pass ? 'PASS' : 'FAIL'}  ${ratio.toFixed(2).padStart(6)}:1  ` +
      `${grade.padEnd(6)} (min ${minimum})  ${name}`,
  );
}

console.log('');

for (const [name, fg, bg, minimum] of MUST_FAIL) {
  const ratio = contrastRatio(fg, bg);
  const stillFails = ratio < minimum;

  if (!stillFails) failures += 1;
  console.log(
    `${stillFails ? 'GUARD' : 'FAIL '} ${ratio.toFixed(2).padStart(6)}:1  ` +
      `rejected by design  ${name}`,
  );
}

console.log(
  failures === 0
    ? `\nAll ${CHECKS.length} combinations pass, and the rejected pairing is still rejected.`
    : `\n${failures} check(s) failed.`,
);

process.exit(failures === 0 ? 0 : 1);
