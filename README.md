**English** | [简体中文](README.zh-CN.md)

# hexo-obsidian-compiler

A text-transform bus for Hexo's render pipeline, shipped with built-in converters for Obsidian Flavored Markdown.

Two things in one plugin:

1. **Built-in converters** that compile Obsidian syntax (wiki links, comments, mermaid, callouts, …) into Hexo-friendly output.
2. **User hooks** that expose every text-in/text-out point of Hexo's render pipeline to your own scripts — declare a shell command or a local JS file in `_config.yml` and take over any stage. Edit the script, re-render, done: no plugin to write, no restart needed.

The design goal: most of what a small Hexo plugin does is "transform some text at some point of the pipeline". You shouldn't need to publish a plugin for that — a script plus one line of config should be enough.

This is the evolution of [hexo-obsidian-link-converter](https://github.com/Sentixxx/hexo-obsidian-link-converter); wiki link conversion is merged in as a converter.

## Built-in converters

| Converter | Syntax | Default | Behavior |
|-----------|--------|---------|----------|
| `comment` | `%%inline%%` and multi-line `%% … %%` | on | Stripped before markdown rendering (literal inside code) |
| `wikilink` | `[[target#anchor\|alias]]` | on | Rewritten as a markdown link pointing to the post's permalink |
| `mdlink` | Leftover `.md` links after rendering | on | Fallback rewrite to the post's permalink |
| `mermaid` | ` ```mermaid ` fenced blocks | on | Replaced with `<pre class="mermaid">` so syntax highlighters don't eat the diagram; a loader script (CDN, lazy) is injected unless disabled |
| `callout` | `> [!type] Title` + quoted body | **off** | Rendered as `<div class="callout callout-type">`; most modern renderers/themes already support callouts, so this stays off unless you enable it |

Link target resolution matches by title / slug / source path. The `abbrlink` frontmatter field takes priority (→ `/posts/<abbrlink>`); posts without `abbrlink` fall back to the Hexo-generated `post.path`. Unresolvable links are left untouched.

## Installation

```bash
npm install hexo-obsidian-compiler --save
```

## Configuration (`_config.yml`, everything optional)

```yaml
obsidian_compiler:
  enable: true          # master switch
  debug: false          # verbose logging
  inject_css: true      # inject default callout styles
  inject_js: true       # inject the mermaid loader script
  domain_prefix: ''     # link prefix, e.g. https://example.com/blog
  converters:
    callout:
      enable: true      # callout is off by default; opt in here
    mermaid:
      theme: default    # mermaid theme passed to mermaid.initialize
      script_src: ''    # override the CDN URL; inject_script: false to bring your own
  hooks:                # take over the pipeline with your own scripts ↓
    - command: python scripts/furigana.py
      stage: before_post_render
    - script: scripts/lazy-img.js
      stage: after_post_render
```

## User hooks: take over any stage

Every text-carrying point of Hexo's render pipeline is exposed as a stage:

| Stage | Text flowing through |
|-------|----------------------|
| `before_post_render` | per-post **markdown**, before rendering |
| `after_post_render` | per-post **HTML fragment**, after rendering |
| `after_render:html` | **full page HTML**, after template rendering |
| `after_render:css` / `after_render:js` | generated assets |

Two hook flavors, both strictly text in, text out:

```yaml
hooks:
  # External command: content arrives on stdin, transformed content leaves on stdout.
  # Any language. Context via env vars: HOC_STAGE / HOC_POST_SOURCE / HOC_POST_PATH / HOC_POST_TITLE.
  - command: python scripts/furigana.py
    stage: before_post_render   # default stage
    name: furigana              # optional, for logs
    timeout: 10000              # optional, ms

  # Local JS: module.exports = (text, ctx) => text
  # Resolved against the Hexo root, reloaded on every run — edit and re-render, no restart.
  - script: scripts/minify.js
    stage: after_render:html
```

Semantics:

- Within a stage, built-in converters run first (registry order), then hooks (config order).
- A hook that fails (non-zero exit, exception, non-string return) is skipped with a warning; the original text continues down the chain. Your build never breaks because of a hook.
- `ctx` for script hooks is `{ hexo, post, stage, config, pluginConfig, log }`.

## Callout output structure (when enabled)

```html
<div class="callout callout-diary" data-callout="diary">
  <div class="callout-title">2026-05-30 Saturday</div>
  <div class="callout-content"><p>…</p></div>
</div>
```

Fold markers `[!type]-` / `[!type]+` render as `<details>/<summary>`. Disable `inject_css` to hand styling to your theme.

## Development

Zero runtime dependencies, Node >= 16.

```bash
npm test   # node --test
```

- Architecture, stage table, and the converter/hook contract: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Adding a built-in converter, plus the syntax roadmap: [docs/ADDING-A-CONVERTER.md](docs/ADDING-A-CONVERTER.md)

## License

MIT
