**English** | [简体中文](README.zh-CN.md)

# hexo-text-pipeline

A general-purpose hooks bus for Hexo's render pipeline.

Every text-in/text-out point of Hexo's rendering process is exposed as a stage. You hang things on stages — your own scripts, shell commands, or packaged presets — through plain declarative config. A checker system backstops everything: misconfiguration is caught before the first post renders, and a failing node is skipped, never your build.

The design goal: most of what a small Hexo plugin does is "transform some text at some point of the pipeline". That shouldn't require publishing a package, or even config — **writing a plugin is writing one file**. Create `text-pipeline/` at your site root and drop this in:

```js
// text-pipeline/arrow.js — this is a complete plugin
module.exports = {
  replace: [[/-->/g, '→']]
};
```

It runs on the next `hexo generate`: zero-config discovery, code blocks automatically protected in the markdown stage, logic edits apply on the next render, and a broken plugin is skipped — never your build. Full contract: [docs/PLUGINS.md](docs/PLUGINS.md).

## Stages

| Stage | Text flowing through |
|-------|----------------------|
| `before_post_render` | per-post **markdown**, before rendering |
| `after_post_render` | per-post **HTML fragment**, after rendering |
| `after_render:html` | **full page HTML**, after template rendering |
| `after_render:css` / `after_render:js` | generated assets |

These map 1:1 to [Hexo's filter API](https://hexo.io/api/filter). Non-text filters (`template_locals`, `server_middleware`, …) are deliberately out of scope.

## Four ways to hang a node

**1. Single-file plugin (the default answer)** — every `.js` file in the `text-pipeline/` directory mounts automatically. Export a node object in the unified contract shape (`name` defaults to the filename); a `replace` rule list is the declarative form of `convert`; `_config.yml` can override `enable` / `slot` / `priority` per plugin name, remaining sub-config reaches the plugin as `ctx.config`. Details: [docs/PLUGINS.md](docs/PLUGINS.md).

```js
// text-pipeline/ruby.js
module.exports = {
  stage: 'before_post_render',
  match: '\\{ruby',
  convert: (text, ctx) => text.replace(/\{ruby (.+?)\}/g, '<ruby>$1</ruby>')
};
```

**2. Local script (hook)** — `module.exports = (text, ctx) => text`, resolved against the Hexo root, re-required on every run. Edit the file, the next render picks it up. Use it when you want the plain-function shape with placement living in YAML.

```yaml
hooks:
  - script: scripts/minify.js
    stage: after_render:html
```

**3. External command** — content on stdin, transformed content on stdout. Any language. Context via env vars: `HTP_STAGE` / `HTP_SLOT` always; `HTP_POST_SOURCE` / `HTP_POST_PATH` / `HTP_POST_TITLE` on post stages, `HTP_FILE_PATH` on string stages.

```yaml
hooks:
  - command: python scripts/furigana.py
    stage: before_post_render   # default stage
    name: furigana              # optional, for logs
    priority: 20                # optional, default 10, lower runs first
    timeout: 10000              # optional, ms
    match: '\\{furigana'        # optional regex: skip the hook (and the spawn) when the text doesn't match
    slot: late                  # optional: late (default, sees the stage's final text) | early (raw text)
```

**4. Programmatic** — other plugins (or a script in your site's `scripts/` dir) can register nodes directly:

```js
hexo.textPipeline.register({
  name: 'exclaim',
  stage: 'before_post_render',
  priority: 5,
  convert: (text, ctx) => text + '!'
});
```

Registration shares the same defaults and validation as hooks (slot defaults to `late`, `match` regex pre-checks work too). `ctx` is `{ hexo, stage, pluginConfig, utils, log }`, plus `ctx.post` on post stages / `ctx.file` on string stages; `ctx.utils` ships `replaceOutsideCode` / `segmentInlineCode` for safely skipping code blocks in the markdown stage.

### Execution order: two slots per stage

Each stage has two mounting slots, registered around Hexo's own filters:

```
[5]   early slot — preset nodes by default (they need the raw text, e.g. mermaid
      must see fenced blocks before the highlighter eats them)
[10]  hexo internals (code highlighting, …) and other plugins
[100] late slot — your hooks by default (they see the final text of the stage)
```

Override with `slot: early` on a hook (run before everything) or `slot: late` on a preset node. Within a slot, nodes run by ascending `priority` (default 10), ties by declaration order. `hexo pipeline` prints the exact resolved order so you never have to guess.

## The checker system (the safety net)

1. **Static checks at registration** — before any post is touched: unknown config keys (with did-you-mean suggestions), invalid stages, duplicate node names, non-numeric priorities, missing script files, and order-ambiguity warnings when nodes from different sources share a priority.
2. **Runtime guards on every execution** — a node that throws or returns a non-string is skipped with a warning and the original text flows on; a node that fails 3 times in a row is circuit-broken for the rest of the run; suspicious output (non-empty input wiped to empty, or 20x size explosion) is flagged but accepted.
3. **`hexo pipeline`** — prints every stage's resolved node order (priority + source) plus all check results, so conflicts are visible before you deploy.

Default policy is warn-and-skip: your build never breaks because of one bad hook. Set `strict: true` (for CI) to turn config errors and node failures into build failures.

## Developing hooks (debug mode)

Two tools answer "what does my hook actually receive at this stage?":

**`hexo pipeline --dry-run source/_posts/x.md`** — runs the `before_post_render` chain on one file, printing each node's effect as a line diff (skipped / no change / changed / FAILED), without generating anything.

**tap** — during a real `hexo generate` / `hexo s`, dumps the text flowing through every stage to snapshot files:

```yaml
text_pipeline:
  tap:
    enable: true
    match: my-post        # strongly recommended: only capture matching sources/paths
    dir: .text-pipeline-tap
```

```
.text-pipeline-tap/_posts_my-post.md/after_post_render.late/
├── 00-input.txt              ← exactly what a (late-slot) hook on this stage receives
├── 01-hook_my-hook.txt       ← text after each node that changed it
└── …                         ← the last file is the slot's final output
```

One snapshot directory per stage and slot (`<stage>.early` / `<stage>.late`).

Each render cycle replaces the previous snapshot. Add the tap dir to `.gitignore` and turn `enable` off for normal builds.

## Built-in preset: `obsidian`

Compiles Obsidian Flavored Markdown for Hexo. Enable with `presets: [obsidian]` under the `text_pipeline:` key — full walkthrough in [docs/USING-PRESETS.md](docs/USING-PRESETS.md).

| Node | Syntax | Default | Behavior |
|------|--------|---------|----------|
| `comment` | `%%inline%%`, multi-line `%% … %%` | on | Stripped before rendering (literal inside code) |
| `embed` | `![[image.png\|300]]`, `![[Note]]` | on | Images → markdown image / `<img width>` (`asset_prefix` config); resolvable note embeds → link; others untouched |
| `wikilink` | `[[target#anchor\|alias]]`, `[[#heading]]` | on | Rewritten to the post's permalink (`abbrlink` first, `post.path` fallback); same-page headings → `#anchor`; block-ref anchors (`#^id`) degrade to the post link |
| `highlight` | `==text==` | on | `<mark>text</mark>` |
| `blockid` | trailing `^block-id` | on | Stripped (invisible in Obsidian reading view too) |
| `mdlink` | Leftover `.md` links in HTML | on | Fallback rewrite to the post's permalink |
| `mermaid` | ` ```mermaid ` fenced blocks | on | Swapped to `<pre class="mermaid">` so highlighters don't eat the diagram; lazy CDN loader injected |
| `callout` | `> [!type] Title` | **off** | `<div class="callout callout-type">`; off because most renderers/themes already support callouts |

```yaml
text_pipeline:
  presets:
    - name: obsidian
      config:
        domain_prefix: ''                  # link prefix for wikilink/mdlink/embed
        callout: { enable: true }          # opt in
        embed: { asset_prefix: /images }   # prepended to embedded image paths
        mermaid: { theme: dark, priority: 15 }   # any node: sub-config + priority override
```

## Installation

```bash
npm install hexo-text-pipeline --save
```

## Full configuration reference

```yaml
text_pipeline:
  enable: true       # master switch
  debug: false       # verbose logging
  strict: false      # config errors / node failures fail the build (CI)
  inject_css: true   # nodes' default styles (e.g. callout)
  inject_js: true    # nodes' frontend scripts (e.g. mermaid loader)
  presets: []        # built-in name | npm package | ./local/path | { name, config }
  hooks: []          # { script | command, stage, slot, priority, name, timeout, match, enable }
  plugins_dir: text-pipeline   # single-file plugin directory; false disables discovery
  plugins: {}        # per-plugin overrides: { <name>: { enable, slot, priority, ...rest lands in ctx.config } }
  tap:               # debug mode: dump per-stage text snapshots (see "Developing hooks")
    enable: false
    match: ''
    dir: .text-pipeline-tap
```

## Development

The only runtime dependency is `hexo-util` (ships with Hexo itself; npm dedupes to the copy your site already has, zero extra install cost). Node >= 16.

```bash
npm test   # node --test
```

- **Single-file plugins (start here to write a plugin)**: [docs/PLUGINS.md](docs/PLUGINS.md)
- Using presets (enabling, config layers, debugging): [docs/USING-PRESETS.md](docs/USING-PRESETS.md)
- Hooks API reference (stage inputs, ctx fields, debugging workflow): [docs/HOOKS-API.md](docs/HOOKS-API.md)
- Architecture, stage table, node contract: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Extending: hook vs preset node vs new preset: [docs/EXTENDING.md](docs/EXTENDING.md)

## License

MIT
