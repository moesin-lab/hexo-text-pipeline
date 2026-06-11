**English** | [简体中文](PLUGINS.zh-CN.md)

# Single-file plugins

Writing a plugin = writing one file. Create a `text-pipeline/` directory at your Hexo site root; every `.js` file in it is auto-mounted as a pipeline plugin, zero config:

```js
// <hexo-site>/text-pipeline/arrow.js — this is a complete plugin
module.exports = {
  replace: [[/-->/g, '→']]
};
```

It runs on the next `hexo generate`. No `_config.yml` edits, no packaging, no restarts (logic edits apply on the next render — see the boundaries at the end).

For when to choose a single-file plugin vs hooks vs a preset, see [EXTENDING.md](EXTENDING.md); stage inputs, `ctx` fields and the debugging workflow (tap / dry-run) are fully shared with hooks, see [HOOKS-API.md](HOOKS-API.md).

## The full contract

A plugin file exports **one node object** (same shape as the unified contract), or an **array of nodes**:

```js
module.exports = {
  name: 'ruby',                  // optional; defaults to the filename (ruby.js → ruby)
  stage: 'before_post_render',   // optional; default before_post_render
  slot: 'late',                  // optional; default late (sees the stage's final text)
  priority: 10,                  // optional; lower runs first within the slot
  match: '\\{ruby',              // optional; regex pre-check, skipped on miss (or a test(text) function)
  convert(text, ctx) {           // exactly one of convert / replace
    return text;
  },
  css: '.ruby { … }',            // optional; injected into head_end when inject_css is on
  js: '…',                       // optional; injected into body_end when inject_js is on
  enabledByDefault: true         // optional; the user's enable always wins
};
```

- **Array exports must name every element explicitly**; only single-object exports get filename inference.
- Files prefixed with `_` are skipped — put shared helper modules there (`require('./_shared')` from a plugin file; hot reload tracks them too).
- **Bare function exports are rejected**: the `module.exports = (text, ctx) => text` shape belongs to a hooks `script:` entry (placement lives in YAML). The plugin directory keeps one mental model: declarative nodes.
- Multiple files register in filename order; the origin label in logs / tap / `hexo pipeline` is `plugin:<filename>`.
- Names get no prefix (you picked them yourself); they can't collide with presets (`obsidian:` prefix) or hooks (`hook:` prefix), and plugin-vs-plugin collisions warn at startup.

## `replace`: the declarative form of convert

The common "regex replacement" case needs no convert:

```js
module.exports = {
  replace: [
    [/-->/g, '→'],                          // [RegExp, string replacement ($1 works)]
    [/\bv(\d+)\b/g, (m, n) => 'v' + n]      // or [RegExp, function]
  ]
};
```

- Patterns **must be RegExp literals** (no strings — a plugin file is JS, literals are free and skip the escaping ambiguity).
- A missing `g` flag is **added automatically**: a replace list means "replace throughout"; "first occurrence only" is convert territory.
- When the node sits on `before_post_render` (markdown input), the compiled convert is **wrapped in markdown-guard automatically**: fenced blocks and inline code are never touched. Other stages replace across the full text. There is no switch to disable the guard — if you need to touch code blocks, write a convert (`ctx.utils` has the tools).
- `replace` works on every registration path: preset nodes and `hexo.textPipeline.register` accept it too.

Deliberately not provided: `prepend` / `append` / `wrap` (a one-line convert; the DSL would save nothing), HTML selector operations (no DOM, and we won't pull in a parser for one), conditional/composition fields (that's inventing a programming language inside an object literal).

## Config overrides (`_config.yml`)

The file declares defaults; config overrides by plugin name:

```yaml
text_pipeline:
  plugins_dir: text-pipeline   # optional: rename the directory; false disables discovery
  plugins:
    arrow:
      enable: false            # enable / slot / priority override the file's declaration
    ruby:
      slot: early
      priority: 5
      css: ./ruby.css          # replaces the plugin's default `css` with your own file(s)
      dict: ./ruby.json        # remaining keys reach the plugin as ctx.config
```

- enable resolution: `plugins.<name>.enable` > the file's `enabledByDefault` > on by default.
- `stage` cannot be overridden — the stage is part of the plugin's semantics and belongs to the file (same rule as preset sub-config).
- An entry under `plugins` that matches no discovered plugin warns (with a did-you-mean suggestion).

## Hot-reload boundaries

**Edit-and-use** (save under `hexo s`, next render applies): logic changes to `convert` / `replace` / `test` / `match`, and any local helper modules the plugin requires (`./_shared`, not node_modules). Note that hexo only watches `source/` and themes — saving the plugin file itself does not trigger a re-render; you need one to happen to see the effect (re-save the target post, or verify directly with `hexo pipeline --dry-run`).

**Restart hexo** in three cases (each maps to the fact that hexo filters can't be unregistered and injection is one-shot):

1. Changes to `stage` / `slot` / `priority` / `name` / `css` / `js` / `enabledByDefault` — mounting and injection are fixed at registration;
2. **Adding or removing** files in the directory — discovery runs once at startup;
3. A file with a syntax error at startup — it isn't mounted (error issue; blocks the build under strict), restart after fixing.

## Safety nets (identical to every other registration path)

Once in the registry, plugin nodes get the full safety net: throw / non-string return → skipped with a warning, the original text flows on; 3 consecutive failures → circuit-broken for the rest of the run, auto-reset next cycle; `hexo pipeline` reports and `--dry-run` per-node diffs include plugin nodes; tap snapshots them too. A broken plugin never fails your build (unless `strict: true`).
