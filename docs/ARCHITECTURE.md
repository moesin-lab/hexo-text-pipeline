**English** | [简体中文](ARCHITECTURE.zh-CN.md)

# Architecture

In one sentence: a small kernel (engine) dispatches N mutually independent converters by Hexo render stage, one directory per Obsidian syntax.

## Data flow

```
hexo generate
  └─ before_generate            engine: invalidate post-index cache
  └─ before_post_render         markdown in ── wikilink ──> markdown
  └─ (hexo-renderer-marked renders markdown → HTML)
  └─ after_post_render          HTML in ── callout ──> ── mdlink ──> HTML
```

## Converter interface (the only contract)

```js
module.exports = {
  name: 'callout',            // config key: obsidian_compiler.converters.<name>
  stage: 'after_post_render', // 'before_post_render' (markdown) | 'after_post_render' (HTML)
  css: '...',                 // optional: default styles, injected into head_end when inject_css is on
  test(content) {},           // cheap pre-check; false skips convert entirely
  convert(content, ctx) {},   // pure function: returns new content, no side effects
};
```

`ctx = { hexo, post, config, pluginConfig, log }`:

- `config`: this converter's sub-config (`converters.<name>`)
- `pluginConfig`: the normalized global config (including `domainPrefix`, etc.)
- `log.debug / log.warn`: logger prefixed with the converter name

## Responsibility boundaries

The engine (`lib/core/engine.js`) owns every cross-cutting concern so converters never have to:

- registers one filter per stage, with registry order as execution order within a stage
- enable switches (global + per converter)
- error isolation: a throwing converter is warned about and skipped without failing the build
- CSS injection and post-index cache invalidation

Core provides two shared services that converters use as needed:

- `markdown-guard`: skips fenced/inline code when doing inline replacement in the before stage
- `post-index`: multi-key post index (title/slug/source path) → permalink.
  `abbrlink` (frontmatter field) takes priority; falls back to the Hexo-generated `post.path` when missing; rewrites nothing when neither exists

## Design decision record

| Decision | Rationale |
|----------|-----------|
| Process callouts in `after_post_render` (HTML stage) | Inline code, bold, etc. inside the body have already been rendered by then; a markdown-stage approach would have to recursively invoke the renderer itself (marked does not render markdown inside block-level HTML) — the biggest pitfall |
| Explicit registry instead of directory scanning | Execution order is visible and controllable; grep `registry.js` to see every syntax; diffs stay predictable when AI adds or changes a syntax |
| `convert` is a pure function, hexo dependencies injected via ctx | Unit tests don't need to mock the filter machinery; AI can reason about a single converter in isolation |
| Zero runtime dependencies | Consistent with the predecessor hexo-obsidian-link-converter; HTML processing uses index scanning instead of pulling in a parser library, keeping the footprint small |
| `abbrlink` first, `post.path` fallback | `abbrlink` comes from a frontmatter field (the user's existing workflow); posts without it fall back to the path Hexo generates from the permalink config, so they remain linkable |
| Default CSS injected via injector, one-switch opt-out | The plugin works out of the box; `inject_css: false` yields entirely to themes that ship their own callout styles |

## Constraints (the discipline that keeps the architecture narrow and deep)

1. Converters never require each other; shared logic sinks into `lib/core/`
2. `convert` must be side-effect free — unit tests need no mock of the hexo filter machinery
3. The registry is an explicit array (`lib/converters/registry.js`), no directory scanning
4. The kernel does not grow with the number of syntaxes; a new syntax's diff should be confined to one new directory plus one registry line
