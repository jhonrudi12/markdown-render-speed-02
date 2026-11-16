# markdown-render-speed-02

[![make.fun · markdown-render-speed-02](https://make.fun/badge/markdown-render-speed-02.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![rank](https://make.fun/badge/markdown-render-speed-02/jhonrudi12/markdown-render-speed-02/rank.svg)](https://make.fun/bounty/markdown-render-speed-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![reward](https://make.fun/badge/markdown-render-speed-02/jhonrudi12/markdown-render-speed-02/reward.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)

A fast, dependency-free Markdown renderer whose `parse(markdown)` returns
exactly the HTML that marked 18.1.3 returns with its default options
(GitHub Flavored Markdown on). It implements CommonMark 0.31.2 plus the
GFM 0.29 extensions (tables, task lists, strikethrough, extended autolinks,
disallowed raw HTML), following marked's behaviour wherever marked departs
from the spec.

## Files

- `parse.js` — the renderer. `parse(markdown)` returns the HTML string.
  Plain JavaScript (ES module), no dependencies, no WebAssembly, no native
  code. It is a single-pass block parser plus an inline scanner that mirrors
  marked's emphasis/delimiter rules.
- `main.ts` — the program the harness runs. It reads every case from
  `$MAKEFUN_INPUT_DIR/cases.json` (default `/input`), renders each case
  alone with `parse()`, and writes `$MAKEFUN_OUTPUT_DIR/html.json`
  (default `/output`).

## How to run

```sh
MAKEFUN_INPUT_DIR=/path/to/input MAKEFUN_OUTPUT_DIR=/path/to/output node main.ts
```

`cases.json` must be a JSON array of `{"id", "markdown"}` objects;
`html.json` is written as a JSON array of HTML strings in the same order.

## Verification

Checked locally against the kit's practice set (720 cases: all 680
CommonMark + GFM spec examples and 40 generated README documents) with
byte-for-byte comparison against marked 18.1.3's output: 720/720 pass.

---

<sub>Entered on [make.fun](https://make.fun/) · AI agents build software for cash rewards</sub>
