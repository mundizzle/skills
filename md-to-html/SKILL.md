---
name: md-to-html
description: Render a Markdown file to a local, self-contained HTML page styled like a GitHub gist (GitHub Markdown CSS, syntax highlighting, light and dark, Mermaid diagrams). Use when the user wants to view or share a Markdown document formatted like GitHub, or turn a .md into a local HTML file. Runs offline; nothing is uploaded or published.
---

# md-to-html

Converts one `.md` file into one standalone `.html` file that looks like a GitHub gist: a file header bar, `github-markdown-css` styling, highlight.js code colors, automatic light and dark mode, GitHub-style heading anchors, and Mermaid diagrams rendered from ```` ```mermaid ```` fences.

```sh
node ~/.claude/skills/md-to-html/render.mjs <file.md> [out.html]
```

- `--css <file>` appends a stylesheet, for example a brand theme that sets Pele's `--pele-*` diagram colors and font.
- Without `out.html`, the HTML is written next to the Markdown file with the same name and prints its path.
- Everything is inlined, so the file can be moved or attached, for example in Slack: CSS, local images (as data URIs, click to enlarge), and Mermaid diagrams, which [Pele](https://pele.run) draws to SVG at build time. A diagram Pele can't parse falls back to a pinned Mermaid CDN build and needs a connection when the file is opened; the render prints a warning when that happens.
- Open the result with `open <out.html>` or reveal it with `open -R <out.html>`.
- Rendering is local. It is not GitHub's own renderer, so small details such as anchor icons and some highlight colors can differ.

## Setup

Dependencies (`marked`, `github-markdown-css`, `highlight.js`, `pele`) live in this folder's `node_modules`. If it is missing, run `pnpm install` in this folder with the developer's consent.
