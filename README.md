**English** | [简体中文](README.zh-CN.md)

# hexo-obsidian-compiler

A Hexo plugin that compiles Obsidian Flavored Markdown into Hexo-friendly output, built on a pluggable converter architecture that grows to cover more Obsidian syntax over time.

This is the evolution of [hexo-obsidian-link-converter](https://github.com/Sentixxx/hexo-obsidian-link-converter): wiki link conversion has been merged into this plugin as a converter.

## Supported syntax

| Converter | Syntax | Behavior |
|-----------|--------|----------|
| `wikilink` | `[[target#anchor\|alias]]` | Rewritten as a markdown link pointing to the post's permalink |
| `callout` | `> [!type] Title` + quoted body | Rendered as `<div class="callout callout-type">`; supports fold markers `[!type]-` / `[!type]+` (rendered as `<details>`), nesting, and arbitrary custom types (e.g. `[!diary]`) |
| `mdlink` | Leftover `.md` links after rendering | Fallback rewrite to the post's permalink |

Link target resolution matches by title / slug / source path. The `abbrlink` frontmatter field takes priority (→ `/posts/<abbrlink>`); posts without `abbrlink` fall back to the `post.path` Hexo generates from your permalink config. Links that resolve to neither are left untouched.

## Installation

```bash
npm install hexo-obsidian-compiler --save
```

## Configuration (`_config.yml`, everything optional)

```yaml
obsidian_compiler:
  enable: true          # master switch
  debug: false          # verbose logging
  inject_css: true      # inject default callout styles; set false if your theme ships its own
  domain_prefix: ''     # link prefix, e.g. https://example.com/blog
  converters:
    wikilink:
      enable: true
    callout:
      enable: true
    mdlink:
      enable: true
```

### Migrating from hexo-obsidian-link-converter

Uninstall the old plugin and rename the config key from `obsidian_link_converter` to `obsidian_compiler` (`domain_prefix` keeps its meaning). Behavior is compatible.

## Callout output structure

```html
<div class="callout callout-diary" data-callout="diary">
  <div class="callout-title">2026-05-30 Saturday</div>
  <div class="callout-content"><p>…</p></div>
</div>
```

Fold markers render as `<details>/<summary>` (`+` means open by default). The default stylesheet colors callouts by `data-callout` type (note/tip/warning/danger/diary, etc.); disable `inject_css` to hand styling over to your theme entirely.

## Development

Zero runtime dependencies, Node >= 16.

```bash
npm test   # node --test
```

- Architecture and converter interface contract: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- How to add a new syntax converter, plus the roadmap: [docs/ADDING-A-CONVERTER.md](docs/ADDING-A-CONVERTER.md)

## License

MIT
