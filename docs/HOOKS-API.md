**English** | [简体中文](HOOKS-API.zh-CN.md)

# Hooks API reference

Everything you need to develop a custom hook. For when to choose a hook vs a preset node, see [EXTENDING.md](EXTENDING.md).

## The development workflow

```
1. declare the hook in _config.yml          (stage + script/command)
2. turn on tap, render once                 → see exactly what your hook receives
3. write the transform against that input
4. hexo pipeline --dry-run <file>           → check the diff without generating
5. iterate — script edits apply on the next render, no restart
```

## Stages: what your hook receives

| Stage | Input text | Runs | `post` / `data` you get |
|-------|-----------|------|--------------------------|
| `before_post_render` | The post's **raw markdown**, frontmatter already stripped. Wiki links, `%%comments%%`, fenced blocks are intact — this plugin's stage filters run at priority 5, ahead of Hexo's internal code-block handling | once per post/page | full post object: `title`, `source` (`_posts/x.md`), `path`, `slug`, frontmatter fields |
| `after_post_render` | The post's **rendered HTML fragment** (no layout). Code blocks are already `<figure class="highlight">…` | once per post/page | same post object |
| `after_render:html` | The **complete page HTML** including layout, `<head>`, injected assets | once per generated page (posts, index, archives, …) | `{ path }` of the output file |
| `after_render:css` / `:js` | the generated asset's full text | once per asset | `{ path }` |

Sample `before_post_render` input (captured with tap):

```markdown
Link to [[Other Post]] and *quiet* words. %%hidden note%% PIPE here.

> [!note] Heads up
> callout body

```mermaid
graph TD
A --> B
```
```

Sample `after_post_render` input for the same post:

```html
<p>Link to <a href="/posts/xyz789">Other Post</a> and <em>quiet</em> words.  BUS here.</p>
<blockquote><p>[!note] Heads up<br>callout body</p></blockquote>
…
```

Don't guess — run tap once and read the `00-input.txt` for your stage (below).

## Script hooks

```yaml
hooks:
  - script: scripts/my-hook.js   # resolved against the Hexo root
    stage: after_post_render
```

```js
// scripts/my-hook.js
module.exports = function (text, ctx) {
  // text: the full input text of this stage (after earlier nodes ran)
  // MUST return a string — anything else is rejected and the input passes through
  return text.replace(/\bfoo\b/g, 'bar');
};
```

### `ctx` fields

| Field | Content |
|-------|---------|
| `ctx.post` | the post object (`post` stages) or `{ path }` (`string` stages) — read `ctx.post.title`, `ctx.post.source`, frontmatter fields |
| `ctx.stage` | the current stage name (one hook file can serve several stages) |
| `ctx.hexo` | the live Hexo instance (`ctx.hexo.config`, `ctx.hexo.locals.get('posts')`, …) |
| `ctx.config` | your hook has no sub-config section; always `{}` (preset nodes get theirs here) |
| `ctx.pluginConfig` | the normalized `text_pipeline` config |
| `ctx.utils` | helpers, see below |
| `ctx.log` | `ctx.log.warn(msg)` / `ctx.log.debug(msg)`, prefixed with your hook's name |

### `ctx.utils`

| Helper | Use |
|--------|-----|
| `replaceOutsideCode(text, segment => newSegment)` | apply a replacement to markdown while **skipping fenced and inline code** — mandatory hygiene for `before_post_render` inline rewrites |
| `replaceOutsideInlineCode(line, fn)` | same, single line, inline code only |
| `segmentInlineCode(line)` | split a line into `{ isCode, text }` segments |

```js
module.exports = (text, ctx) =>
  ctx.utils.replaceOutsideCode(text, (seg) => seg.replace(/==([^=]+)==/g, '<mark>$1</mark>'));
```

### Reload semantics (edit-and-use)

The script file **and any local modules it requires** (`./helper`, not `node_modules`) are re-loaded on every execution. Under `hexo s`, save the file and the next render uses the new code. Keep module-level state out of scripts — it does not survive between runs.

## Command hooks

```yaml
hooks:
  - command: python scripts/furigana.py    # run through the shell
    stage: before_post_render
    timeout: 10000                          # ms, default 10000
    match: '\\{ruby'                        # optional: skip (and save the spawn) unless the text matches
```

Protocol — pure text in, text out:

- **stdin**: the stage's current text (UTF-8)
- **stdout**: the transformed text (UTF-8). Whatever you print *is* the new text, byte for byte
- **exit 0** = success; any other exit code = failure (stderr's first 500 chars land in the warning)

Context via environment variables:

| Variable | Content |
|----------|---------|
| `HTP_STAGE` | stage name |
| `HTP_POST_SOURCE` | e.g. `_posts/my-post.md` (empty on `string` stages) |
| `HTP_POST_PATH` | the post/page output path |
| `HTP_POST_TITLE` | the post title |

```python
#!/usr/bin/env python3
import sys, os
text = sys.stdin.read()
if os.environ["HTP_STAGE"] == "before_post_render":
    text = text.replace("TODO", "✅")
sys.stdout.write(text)
```

The command is spawned **once per post per render** — keep it fast, and use `match` to skip posts that don't need it.

## Hook entry: all fields

| Field | Required | Default | Meaning |
|-------|----------|---------|---------|
| `script` / `command` | one of the two | — | what to run |
| `stage` | no | `before_post_render` | where to run |
| `priority` | no | `10` | lower runs first; ties by declaration order (preset nodes load before hooks) |
| `name` | no | `hook-<index>` | log / tap / doctor label |
| `match` | no | — | regex; the hook is skipped when the input doesn't match |
| `timeout` | no | `10000` | ms, command only |
| `enable` | no | `true` | quick toggle |

## Failure semantics

- Throwing, exiting non-zero, or returning a non-string → the hook is **skipped with a warning**; the input text continues unchanged down the chain. Your build never fails because of a hook (unless `strict: true`).
- 3 consecutive failures → the hook is **circuit-broken for the rest of the render cycle** (one notice instead of one warning per post). The breaker resets on the next cycle, so a fixed script comes back on its own.
- Empty output from non-empty input, or a 20x size explosion → warning, but the output is accepted.

## Debugging

**tap** — dump what actually flows through each stage during a real render:

```yaml
text_pipeline:
  tap: { enable: true, match: my-post }
```

```
.text-pipeline-tap/_posts_my-post.md/<stage>/
├── 00-input.txt          ← what your hook receives (after earlier nodes)
├── 01-<node>.txt         ← after each node that changed the text
└── …                     ← last file = the stage's final output
```

**`hexo pipeline`** — the resolved execution order (is my hook where I think it is?).

**`hexo pipeline --dry-run source/_posts/x.md`** — run the `before_post_render` chain on one file and print each node's line diff, including your hook's, without generating the site.
