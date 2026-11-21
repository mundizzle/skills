# skills

Reusable skills for Claude Code. Each folder is one skill, with a `SKILL.md` that says when to use
it and how.

| Skill | What it does |
| ----- | ------------ |
| [`md-to-html`](md-to-html) | Renders a Markdown file to one self-contained HTML page in GitHub's style, with Mermaid diagrams drawn by [Pele](https://pele.run). |
| [`mdview`](mdview) | Shows a Markdown file, or the current folder's notes, in a terminal pane as rendered images. Uses `md-to-html`. |

## Install

Clone the repository, then link each skill into `~/.claude/skills` so an edit here is live:

```sh
git clone https://github.com/mundizzle/skills.git ~/Projects/skills
ln -s ~/Projects/skills/md-to-html ~/.claude/skills/md-to-html
ln -s ~/Projects/skills/mdview ~/.claude/skills/mdview
(cd ~/Projects/skills/md-to-html && pnpm install)
```
