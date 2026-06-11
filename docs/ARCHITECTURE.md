**English** | [简体中文](ARCHITECTURE.zh-CN.md)

# Architecture

In one sentence: a small kernel (engine) runs one text-transform pipeline per exposed render stage; built-in converters and user-configured hooks are the same kind of node on that pipeline.

## Data flow

```
hexo generate
  └─ before_generate            engine: invalidate post-index cache
  └─ before_post_render         markdown ── comment ── wikilink ── mermaid ── [hooks…] ──> markdown
  └─ (markdown renderer: markdown → HTML)
  └─ after_post_render          HTML ── mdlink ── callout* ── [hooks…] ──> HTML        (*off by default)
  └─ (template rendering: HTML fragment → full page)
  └─ after_render:html          page HTML ── [hooks…] ──> page HTML
  └─ after_render:css / :js     assets ── [hooks…] ──> assets
```

## The stage table (`lib/core/stages.js`)

The single source of truth for which Hexo filter points are exposed. Only text-in/text-out points qualify — that is the plugin's boundary. Non-text filters (`template_locals`, `server_middleware`, …) are deliberately not exposed; register a Hexo filter directly for those.

Each stage declares a `kind` that tells the engine how to adapt the Hexo filter signature:

- `post`: the filter receives a post object; text lives in `data.content` (per post)
- `string`: the filter receives `(text, data)` and returns the new text (whole page / asset)

Adding a new stage = one entry in this table; the engine needs no change.

## Pipeline node interface (the only contract)

```js
module.exports = {
  name: 'callout',            // config key: obsidian_compiler.converters.<name>
  stage: 'after_post_render', // any key of the stage table
  enabledByDefault: false,    // optional: ship disabled; user's converters.<name>.enable wins
  css: '...',                 // optional: styles injected into head_end (inject_css)
  js: (config) => '...',      // optional: script injected into body_end (inject_js); string or function of sub-config
  test(content) {},           // cheap pre-check; false skips convert entirely
  convert(content, ctx) {},   // pure function: returns the new text, no side effects
};
```

`ctx = { hexo, post, stage, config, pluginConfig, log }`:

- `post`: the post object (`post` stages) or the `data` metadata (`string` stages, e.g. `{ path }`)
- `config`: this node's sub-config (`converters.<name>`)
- `pluginConfig`: the normalized global config
- `log.debug / log.warn`: logger prefixed with the node name

User hooks (`lib/core/user-hooks.js`) are wrapped into this exact shape at registration time, so the engine schedules built-ins and hooks identically:

- `command` hooks: content on stdin → transformed content on stdout; context via `HOC_*` env vars; any language
- `script` hooks: a local JS file exporting `(text, ctx) => text`, resolved against the Hexo root and re-required on every run (edit → next render picks it up, no restart)

## Responsibility boundaries

The engine (`lib/core/engine.js`) owns every cross-cutting concern so pipeline nodes never have to:

- groups active nodes by stage and registers one Hexo filter per stage, adapting per the stage's `kind`
- ordering: built-in converters (registry order) then hooks (config order)
- enable switches (global, per converter incl. `enabledByDefault`, per hook)
- error isolation: a node that throws or returns a non-string is warned about and skipped; the original text flows on and the build never fails
- CSS/JS injection and post-index cache invalidation
- validation: unknown stages and malformed hook entries are warned about and skipped

Core provides two shared services that nodes use as needed:

- `markdown-guard`: fence/inline-code awareness for the markdown stage (`replaceOutsideCode`, `segmentInlineCode`)
- `post-index`: multi-key post index (title/slug/source path) → permalink; `abbrlink` first, `post.path` fallback

## Design decision record

| Decision | Rationale |
|----------|-----------|
| User hooks as a first-class mechanism (command + script, text in/text out) | Most small Hexo plugins are "transform text at some pipeline point"; a script plus one config line replaces publishing a plugin. Unix philosophy: the bus does scheduling, the script does the work |
| `script` hooks re-required on every run | Edit-and-use: under `hexo server`, editing the script takes effect on the next render with no restart — the feedback loop that makes "take over with a script" practical |
| Hook failure skips the hook, never the build | Users iterate on scripts freely; a broken experiment costs one warning, not a failed deploy |
| Only text-in/text-out filter points are exposed | Keeps the contract uniform (every node is `(text, ctx) => text`); non-text filters have nothing to gain from this bus |
| `callout` ships `enabledByDefault: false` | Modern renderers/themes already render callouts; double-processing would corrupt them. Explicit `enable: true` opts in |
| `mermaid` converts in the markdown stage to `<pre class="mermaid">` | Syntax highlighters consume fenced blocks during rendering; swapping the fence for raw block HTML before that is the only reliable bypass. Content is HTML-escaped; browsers restore it via `textContent` for mermaid.js |
| Mermaid loader injected lazily | The injected snippet loads the CDN script only when the page actually contains a diagram |
| `comment` runs first in the markdown stage | Commented-out syntax (e.g. a wiki link inside `%% %%`) must vanish before other converters can see it |
| Process callouts in `after_post_render` (HTML stage) | Inline markdown inside the body is already rendered by then; a markdown-stage approach would have to recursively invoke the renderer |
| Explicit registry instead of directory scanning | Execution order is visible and controllable; grep `registry.js` to see every syntax |
| `convert` is a pure function, hexo dependencies injected via ctx | Unit tests don't need to mock the filter machinery; AI can reason about a single node in isolation |
| Zero runtime dependencies | HTML processing uses index scanning instead of a parser library |
| `abbrlink` first, `post.path` fallback | `abbrlink` comes from the user's existing workflow; posts without it remain linkable |

## Constraints (the discipline that keeps the architecture narrow and deep)

1. Pipeline nodes never require each other; shared logic sinks into `lib/core/`
2. `convert` must be side-effect free — unit tests need no mock of the hexo filter machinery
3. The registry is an explicit array (`lib/converters/registry.js`), no directory scanning
4. The kernel does not grow with the number of syntaxes; a new syntax's diff is one directory plus one registry line — and before writing a converter at all, ask whether a user hook in the site's own repo is enough
5. New stages go through the stage table only; the engine stays generic
