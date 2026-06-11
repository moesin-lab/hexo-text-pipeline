**English** | [简体中文](README.zh-CN.md)

# hexo-text-pipeline

A general-purpose hooks bus for Hexo's render pipeline.

Every text-in/text-out point of Hexo's rendering process is exposed as a stage. You hang things on stages — your own scripts, shell commands, or packaged presets — through plain declarative config. A checker system backstops everything: misconfiguration is caught before the first post renders, and a failing node is skipped, never your build.

The design goal: most of what a small Hexo plugin does is "transform some text at some point of the pipeline". That shouldn't require writing and publishing a plugin — a script plus one line of config should be enough, and editing the script should take effect on the next render with no restart.

```yaml
text_pipeline:
  presets:
    - obsidian                       # packaged node sets ("plugins of the plugin")
  hooks:
    - script: scripts/lazy-img.js    # your JS: module.exports = (text, ctx) => text
      stage: after_post_render
    - command: python scripts/furigana.py   # any language: stdin in, stdout out
      stage: before_post_render
      priority: 20
```

## Stages

| Stage | Text flowing through |
|-------|----------------------|
| `before_post_render` | per-post **markdown**, before rendering |
| `after_post_render` | per-post **HTML fragment**, after rendering |
| `after_render:html` | **full page HTML**, after template rendering |
| `after_render:css` / `after_render:js` | generated assets |

These map 1:1 to [Hexo's filter API](https://hexo.io/api/filter). Non-text filters (`template_locals`, `server_middleware`, …) are deliberately out of scope.

## Hooks: three ways to hang a node

**1. Local script** — `module.exports = (text, ctx) => text`, resolved against the Hexo root, re-required on every run. Edit the file, the next render picks it up. No restart, no install.

```yaml
hooks:
  - script: scripts/minify.js
    stage: after_render:html
```

**2. External command** — content on stdin, transformed content on stdout. Any language. Context via env vars `HTP_STAGE` / `HTP_POST_SOURCE` / `HTP_POST_PATH` / `HTP_POST_TITLE`.

```yaml
hooks:
  - command: python scripts/furigana.py
    stage: before_post_render   # default stage
    name: furigana              # optional, for logs
    priority: 20                # optional, default 10, lower runs first
    timeout: 10000              # optional, ms
```

**3. Programmatic** — other plugins (or a script in your site's `scripts/` dir) can register nodes directly:

```js
hexo.textPipeline.register({
  name: 'exclaim',
  stage: 'before_post_render',
  priority: 5,
  convert: (text, ctx) => text + '!'
});
```

`ctx` is `{ hexo, post, stage, config, presetConfig, pluginConfig, utils, log }`; `ctx.utils` ships `replaceOutsideCode` / `segmentInlineCode` for safely skipping code blocks in the markdown stage.

### Execution order

Within a stage, nodes run by ascending `priority` (default 10), ties broken by registration order (presets load before hooks). `hexo pipeline` prints the exact resolved order so you never have to guess.

## The checker system (the safety net)

1. **Static checks at registration** — before any post is touched: unknown config keys (with did-you-mean suggestions), invalid stages, duplicate node names, non-numeric priorities, missing script files, and order-ambiguity warnings when nodes from different sources share a priority.
2. **Runtime guards on every execution** — a node that throws or returns a non-string is skipped with a warning and the original text flows on; a node that fails 3 times in a row is circuit-broken for the rest of the run; suspicious output (non-empty input wiped to empty, or 20x size explosion) is flagged but accepted.
3. **`hexo pipeline`** — prints every stage's resolved node order (priority + source) plus all check results, so conflicts are visible before you deploy.

Default policy is warn-and-skip: your build never breaks because of one bad hook. Set `strict: true` (for CI) to turn config errors and node failures into build failures.

## Built-in preset: `obsidian`

Compiles Obsidian Flavored Markdown for Hexo. Enable with `presets: [obsidian]`.

| Node | Syntax | Default | Behavior |
|------|--------|---------|----------|
| `comment` | `%%inline%%`, multi-line `%% … %%` | on | Stripped before rendering (literal inside code) |
| `wikilink` | `[[target#anchor\|alias]]` | on | Rewritten to the post's permalink (`abbrlink` first, `post.path` fallback) |
| `mdlink` | Leftover `.md` links in HTML | on | Fallback rewrite to the post's permalink |
| `mermaid` | ` ```mermaid ` fenced blocks | on | Swapped to `<pre class="mermaid">` so highlighters don't eat the diagram; lazy CDN loader injected |
| `callout` | `> [!type] Title` | **off** | `<div class="callout callout-type">`; off because most renderers/themes already support callouts |

```yaml
presets:
  - name: obsidian
    config:
      domain_prefix: ''                  # link prefix for wikilink/mdlink
      callout: { enable: true }          # opt in
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
  hooks: []          # { script | command, stage, priority, name, timeout, enable }
```

## Development

Zero runtime dependencies, Node >= 16.

```bash
npm test   # node --test
```

- Architecture, stage table, node contract: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Extending: hook vs preset node vs new preset: [docs/EXTENDING.md](docs/EXTENDING.md)

## License

MIT
