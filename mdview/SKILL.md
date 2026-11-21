---
name: mdview
description: Show a Markdown file, or the current folder's notes file, in a Rex terminal pane, rendered like GitHub-flavored Markdown with Mermaid diagrams drawn by Pele. Use when the user wants to see a Markdown document or their notes rendered beside the session, or asks where their notes live for a folder or repository.
---

# mdview

Draws a Markdown file in a terminal pane as images (kitty graphics protocol), in the pane's normal
scrollback. It follows the terminal's light or dark background, and redraws when the file is saved
or the pane is resized. Keys in the pane: `r` redraws, `q` quits.

```sh
node ~/.claude/skills/mdview/mdview.mjs <file.md>
node ~/.claude/skills/mdview/mdview.mjs --notes          # this folder's notes file, created if missing
node ~/.claude/skills/mdview/mdview.mjs --notes --print  # only print the notes path
```

It must run inside the pane that shows the document, not in the Bash tool. In Rex, open a pane
beside the session, or reuse one labeled `md-preview`:

```sh
rex run --split=right --label md-preview --focus=false -c "$PWD" -- node ~/.claude/skills/mdview/mdview.mjs --notes
```

The viewer holds the terminal in raw mode, so `rex send` of Ctrl-C does not stop it; send `q`.
`sample.md` in this folder is a test page covering a diagram, a table, task lists, and code.

## Notes location

`--notes` picks the file from the folder it runs in:

- In a git repository: `.scratch/notes.md` in the primary checkout, so all worktrees share one file.
- Anywhere else: `~/notes.md`.

`~/.config/mdview/config.json` changes either default, or sets a location for a folder:

```json
{
  "notes": {
    "repo": ".scratch/notes.md",
    "other": "~/notes.md",
    "paths": { "~/Projects/example": "docs/notes.md" }
  }
}
```

The longest `paths` folder containing the repository (or the current folder) wins. A relative value
is resolved against the primary checkout, or the current folder outside a repository. Before using
`.scratch/` in a repository, check that it is git-ignored there.

To write a note for the user, run `--notes --print` and edit that file; an open viewer redraws.

## Requirements

- The `md-to-html` skill at `~/.claude/skills/md-to-html` (it converts the Markdown and runs Pele).
  `MDVIEW_RENDER` points at another `render.mjs`.
- Google Chrome, which takes the picture headlessly, and Node 22 or later.
- A terminal with the kitty graphics protocol that reports its cell size (Rex does).
