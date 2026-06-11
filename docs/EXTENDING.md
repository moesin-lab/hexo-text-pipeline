**English** | [简体中文](EXTENDING.zh-CN.md)

# Extending the pipeline

Three escalation levels. Start at the top; only move down when the level above genuinely doesn't fit.

## Level 1: a single-file plugin in your site (the default answer)

Site-specific transform → no code in this repo, no `_config.yml` edits — drop a file into `text-pipeline/` at your site root:

```js
// text-pipeline/arrow.js
module.exports = {
  replace: [[/-->/g, '→']]   // or convert: (text, ctx) => text
};
```

Save, re-render, done (`replace` on the markdown stage skips code blocks automatically; with a handwritten convert use `ctx.utils.replaceOutsideCode(text, fn)`). Full contract — name inference, config overrides, hot-reload boundaries: [PLUGINS.md](PLUGINS.md).

### Level 1.5: hooks (function shape / non-JS logic)

Want to export a plain function with placement living in YAML → a `hooks:` `script:` entry; non-JS logic → `command:` (stdin → stdout, any language). Stage inputs, `ctx` fields, env vars, debugging workflow: [HOOKS-API.md](HOOKS-API.md).

## Level 2: a node in an existing preset

For syntax that every user of the preset wants (e.g. a new Obsidian syntax in the `obsidian` preset):

1. **Write acceptance cases first**: input → expected pairs in `test/<name>.test.js` (markdown or HTML input depends on the stage).
2. **Copy the template**: `cp -r lib/presets/obsidian/converters/_template lib/presets/obsidian/converters/<name>`, set `name`.
3. **Pick a stage** (full table in `lib/core/stages.js`):
   - result is still markdown (e.g. `==highlight==` → `<mark>`) → `before_post_render`; wrap inline replacement with `markdown-guard`'s `replaceOutsideCode`
   - depends on rendered HTML structure (e.g. callout builds on `<blockquote>`) → `after_post_render`
4. **Implement**: parsing in `parse.js`, output in `render.js` (simple syntax can stay in `index.js`). A pure regex transform can use a `replace` rule list instead of `convert` (semantics in [PLUGINS.md](PLUGINS.md); preset nodes accept it too). Default styles via the `css` field, frontend loader via `js`. If most renderers already handle it, ship `enabledByDefault: false`.
5. **Register**: add one line to the preset's `nodes` array (`lib/presets/obsidian/index.js`) — array order is the tie-break order within a priority.
6. **Verify**: `npm test` green; `hexo pipeline` shows the node where you expect it.
7. **Document**: update the preset's node table in both READMEs.

## Level 3: a new preset

A reusable node set with its own theme (e.g. a `typography` preset):

```js
// lib/presets/<name>/index.js — or a standalone npm package, same shape
module.exports = {
  name: 'typography',
  nodes: [require('./nodes/smart-quotes'), require('./nodes/widows')],
  init(hexo) {}   // optional one-time side effects (extra filters, caches)
};
```

Users load it by built-in name, npm package name, or local path:

```yaml
presets:
  - typography                  # built-in (lib/presets/) or npm package
  - ./pipeline/my-preset        # site-local directory
  - name: typography            # with config
    config:
      smart-quotes: { enable: false, priority: 15 }
```

Per-node config arrives as `ctx.config` (the `config.<nodeName>` section); preset-wide config as `ctx.presetConfig`.

## Obsidian syntax roadmap

| Syntax | Form | Status | Suggested stage |
|--------|------|--------|-----------------|
| Internal links | `[[Link]]`, `[[#heading]]` | ✅ wikilink | before |
| Comments | `%%Text%%` (inline & multi-line) | ✅ comment | before |
| Mermaid diagrams | ` ```mermaid ` block | ✅ mermaid | before |
| Callouts | `> [!note]` | ✅ callout (off by default) | after |
| Leftover .md links | `[x](a.md)` / `href="a.md"` | ✅ mdlink | after |
| Highlight | `==Text==` | ✅ highlight | before |
| File/note embeds | `![[img.png\|300]]`, `![[Note]]` | ✅ embed (images + note→link; pdf/audio untouched) | before |
| Block references | `[[Link#^id]]` | ✅ wikilink (anchor degrades to the post link) | before |
| Block definitions | `^id` | ✅ blockid (stripped) | before |
| Footnotes | `[^id]` | ⬜ (renderer config may already cover this) | — |
| Strikethrough / task lists / tables | `~~ ~~` / `- [ ]` | Nothing to do (marked supports these natively) | — |
