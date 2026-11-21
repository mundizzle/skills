#!/usr/bin/env node
// Render a Markdown file to one self-contained HTML page styled like a GitHub gist.
// Usage: node render.mjs <file.md> [out.html]
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { marked } from 'marked';
import { render as renderDiagram } from 'pele';
import hljs from 'highlight.js';

const require = createRequire(import.meta.url);
const read = (spec) => readFileSync(require.resolve(spec), 'utf8');

// --css <file> appends a stylesheet, for example a brand theme for Pele diagrams (--pele-* variables).
const args = process.argv.slice(2);
const cssAt = args.indexOf('--css');
const extraCss = cssAt === -1 ? '' : readFileSync(resolve(args.splice(cssAt, 2)[1]), 'utf8');
const [input, output] = args;
if (!input) {
  console.error('Usage: node render.mjs <file.md> [out.html] [--css theme.css]');
  process.exit(1);
}
const src = resolve(input);
const src0 = src;
const out = output ? resolve(output) : src.replace(/\.(md|markdown)$/i, '') + '.html';
const name = basename(src);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
let hasMermaid = false;
let hasImage = false;
const seen = new Map();
const slug = (text) => {
  const base = text.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s/g, '-');
  const n = seen.get(base) ?? 0;
  seen.set(base, n + 1);
  return n ? `${base}-${n}` : base;
};

marked.use({
  gfm: true,
  renderer: {
    code({ text, lang }) {
      const language = (lang ?? '').trim().split(/\s+/)[0];
      if (language === 'mermaid') {
        // Pele draws the diagram to inline SVG at build time, so the page needs no script or network.
        try {
          return `<div class="diagram">${renderDiagram(text, { links: false, images: false }).svg}</div>\n`;
        } catch (e) {
          console.error(`Pele could not render a diagram (${e.message}); it loads Mermaid from the CDN instead.`);
          hasMermaid = true;
          return `<pre class="mermaid">${esc(text)}</pre>\n`;
        }
      }
      const body = language && hljs.getLanguage(language) ? hljs.highlight(text, { language }).value : esc(text);
      return `<div class="highlight"><pre><code class="hljs${language ? ` language-${esc(language)}` : ''}">${body}</code></pre></div>\n`;
    },
    // Local images are embedded as data URIs so the page stays one self-contained file.
    image({ href, title, text }) {
      let src = href;
      if (!/^(https?:|data:)/i.test(href)) {
        const type = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp' }[extname(href).toLowerCase()];
        if (type) src = `data:${type};base64,${readFileSync(resolve(dirname(src0), decodeURI(href))).toString('base64')}`;
      }
      hasImage = true;
      const alt = esc(text ?? '');
      return `<button type="button" class="zoom" aria-label="Enlarge${alt ? `: ${alt}` : ' image'}"><img src="${src}" alt="${alt}"${title ? ` title="${esc(title)}"` : ''}></button>`;
    },
    heading({ tokens, depth }) {
      const inner = this.parser.parseInline(tokens);
      const id = slug(inner);
      return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
    },
  },
});

// Numeric entities keep the file pure ASCII; Slack labels UTF-8 HTML uploads "Binary" but accepts ASCII ones as text.
const html = marked.parse(readFileSync(src, 'utf8')).replace(/[^\x00-\x7F]/gu, (c) => `&#${c.codePointAt(0)};`);
const light = read('highlight.js/styles/github.css');
const dark = read('highlight.js/styles/github-dark.css');
// Mermaid loads from a pinned CDN build so the file stays small enough for Slack; it needs a network connection to draw diagrams.
const MERMAID_SRC = 'https://cdn.jsdelivr.net/npm/mermaid@12.3.0/dist/mermaid.min.js';

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)}</title>
<style>
${read('github-markdown-css/github-markdown.css')}
${light}
@media (prefers-color-scheme: dark) {
${dark}
}
body { margin: 0; padding: 32px 16px; background: #fff; }
@media (prefers-color-scheme: dark) { body { background: #0d1117; } }
.file { max-width: 980px; margin: 0 auto; border: 1px solid #d0d7de; border-radius: 6px; overflow: hidden; }
.file-header { padding: 8px 16px; font: 600 12px/20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f8fa; border-bottom: 1px solid #d0d7de; color: #1f2328; }
.markdown-body { box-sizing: border-box; padding: 32px; }
.markdown-body .highlight pre { margin-bottom: 16px; }
.markdown-body pre code.hljs { background: transparent; padding: 0; }
.markdown-body pre.mermaid { background: transparent; text-align: center; }
.markdown-body .diagram { margin-bottom: 16px; text-align: center; overflow-x: auto; }
.markdown-body .diagram svg { max-width: 100%; height: auto; }
.markdown-body button.zoom { all: unset; cursor: zoom-in; display: inline-block; }
.markdown-body button.zoom:focus-visible { outline: 2px solid #0969da; outline-offset: 2px; }
.markdown-body td a { white-space: nowrap; }
.markdown-body td button.zoom img { max-width: 220px; border: 1px solid #d0d7de; border-radius: 4px; display: block; }
dialog.zoom { padding: 0; border: 0; max-width: 95vw; max-height: 95vh; overflow: auto; cursor: zoom-out; background: transparent; }
dialog.zoom::backdrop { background: rgba(0,0,0,.75); }
dialog.zoom img { display: block; max-width: 95vw; }
${extraCss}
@media (prefers-color-scheme: dark) {
  .file { border-color: #30363d; }
  .file-header { background: #161b22; border-color: #30363d; color: #e6edf3; }
}
@media (max-width: 600px) { body { padding: 0; } .file { border-radius: 0; border-width: 1px 0; } .markdown-body { padding: 16px; } }
</style>
</head>
<body>
<div class="file">
<div class="file-header">${esc(name)}</div>
<article class="markdown-body">
${html}
</article>
</div>
${hasMermaid ? `<script src="${MERMAID_SRC}"></script>
<script>mermaid.initialize({ startOnLoad: true, deterministicIds: true, theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default' });</script>` : ''}
${hasImage ? `<dialog class="zoom" aria-label="Enlarged image"><img alt=""></dialog>
<script>
const zoom = document.querySelector('dialog.zoom');
document.addEventListener('click', (e) => {
  const b = e.target.closest('button.zoom');
  if (b) { const i = b.querySelector('img'); zoom.firstElementChild.src = i.src; zoom.firstElementChild.alt = i.alt; zoom.showModal(); }
  else if (e.target.closest('dialog.zoom')) zoom.close();
});
</script>` : ''}
</body>
</html>
`;

// Slack labels the file "Plain Text" when the CSS spans many lines; one line per style block gets the "HTML" label (verified by upload).
writeFileSync(out, page.replace(/<style>[\s\S]*?<\/style>/, (s) => s.replace(/\s*\n\s*/g, ' ')));

console.log(out);
