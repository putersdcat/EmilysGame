import { renderSvgPreview } from './renderSvg.js';

const sampleSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="4" y="4" width="56" height="56" rx="10" fill="#1f6feb"/>
  <circle cx="32" cy="26" r="10" fill="#ffffff"/>
  <rect x="20" y="40" width="24" height="8" rx="4" fill="#ffffff"/>
</svg>
`;

const result = renderSvgPreview(sampleSvg, { size: 96 });

if (!result.pngBase64 || result.pngBase64.length < 100) {
  throw new Error('Smoke test failed: PNG base64 output is unexpectedly small.');
}

if (result.width <= 0 || result.height <= 0) {
  throw new Error('Smoke test failed: invalid output dimensions.');
}

process.stdout.write(
  JSON.stringify({
    ok: true,
    width: result.width,
    height: result.height,
    bytes: result.bytes
  }) + '\n'
);
