**English** | [简体中文](ADDING-A-CONVERTER.zh-CN.md)

# Adding a syntax converter (SOP)

**Step 0 — do you even need a converter?** If the transform is site-specific (your blog only), don't touch this repo: write a script in your site repo and declare it as a [user hook](../README.md#user-hooks-take-over-any-stage) in `_config.yml`. A built-in converter is only justified when the syntax is general Obsidian/Hexo behavior that every user of this plugin wants.

Then follow the steps in order; nothing under `lib/core/` needs to change.

1. **Write acceptance cases first**: add input → expected pairs in `test/<name>.test.js` (whether input is markdown or HTML depends on the stage chosen in step 3).
2. **Copy the template**: `cp -r lib/converters/_template lib/converters/<name>`, change the `name` field.
3. **Pick a stage** (full table in `lib/core/stages.js`):
   - The rewrite result is still markdown (e.g. `==highlight==` → `<mark>`) → `before_post_render`; inline replacement MUST be wrapped with `replaceOutsideCode` from `core/markdown-guard` to avoid rewriting code blocks.
   - The conversion depends on rendered HTML structure (e.g. callout builds on `<blockquote>`) → `after_post_render`; no guard needed.
   - Whole-page or asset transforms → `after_render:html` / `after_render:css` / `after_render:js` (rarely right for a built-in; usually a user hook).
4. **Implement**: parsing goes in `parse.js`, output in `render.js` (a simple syntax can keep everything in `index.js`). Use `core/post-index` if you need the post index. Default styles go in `styles.js` exposed via the `css` field; a frontend loader goes in the `js` field (string, or function of the converter's sub-config). If most users get the behavior from their renderer/theme already, ship `enabledByDefault: false`.
5. **Register**: add one `require('./<name>')` line in `lib/converters/registry.js` — array order is execution order within a stage (e.g. `comment` stays first so commented-out syntax vanishes before anything else sees it).
6. **Verify**: `npm test` all green.
7. **Document**: update the built-in converter table in both READMEs (English and Chinese).

## Syntax roadmap (from the official Obsidian Flavored Markdown list)

| Syntax | Form | Status | Suggested stage |
|--------|------|--------|-----------------|
| Internal links | `[[Link]]` | ✅ wikilink | before |
| Comments | `%%Text%%` (inline & multi-line) | ✅ comment | before |
| Mermaid diagrams | ` ```mermaid ` block | ✅ mermaid | before |
| Callouts | `> [!note]` | ✅ callout (off by default) | after |
| Leftover .md links | `[x](a.md)` / `href="a.md"` | ✅ mdlink | after |
| Highlight | `==Text==` | ⬜ | before |
| File/note embeds | `![[Link]]` | ⬜ | before |
| Block references | `![[Link#^id]]` | ⬜ | before |
| Block definitions | `^id` | ⬜ | before |
| Footnotes | `[^id]` | ⬜ (renderer config may already cover this) | — |
| Strikethrough / task lists / tables | `~~ ~~` / `- [ ]` | Nothing to do (marked supports these natively) | — |
