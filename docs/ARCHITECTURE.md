**English** | [简体中文](ARCHITECTURE.zh-CN.md)

# Architecture

In one sentence: a small kernel runs one text-transform pipeline per exposed render stage; preset nodes, user hooks, and API-registered nodes are all the same kind of node, scheduled by priority, with a checker system as the safety net.

## Data flow

```
hexo generate
  └─ before_post_render         markdown ──[nodes by priority]──> markdown
  └─ (markdown renderer: markdown → HTML)
  └─ after_post_render          HTML ──[nodes]──> HTML
  └─ (template rendering: HTML fragment → full page)
  └─ after_render:html          page HTML ──[nodes]──> page HTML
  └─ after_render:css / :js     assets ──[nodes]──> assets
```

## Module map

```
lib/core/
├─ stages.js          # stage table — the single source of truth for what is exposed
├─ engine.js          # the only scheduler: check → load → register filters → guarded execution
├─ config.js          # declarative config normalization (text_pipeline.*)
├─ api.js             # central node registry + hexo.textPipeline public API
├─ markdown-guard.js  # shared util: fence/inline-code aware replacement
├─ loaders/
│  ├─ hooks.js        # hooks: [] config entries → nodes (dispatches to script/command)
│  ├─ script.js       # local JS file, re-required per run (edit-and-use)
│  ├─ command.js      # external command, stdin → stdout
│  └─ preset.js       # built-in name / npm package / local path → a set of nodes
├─ checker/
│  ├─ static.js       # registration-time checks (schema, stages, dupes, order ambiguity)
│  └─ runtime.js      # per-execution guard (isolation, circuit breaker, output anomaly)
└─ console/
   └─ pipeline.js     # `hexo pipeline` doctor command
lib/presets/
└─ obsidian/          # built-in preset: 5 nodes + post-index service
```

## The stage table (`stages.js`)

Only text-in/text-out Hexo filter points qualify — that is the bus's boundary. Each stage declares a `kind` that tells the engine how to adapt the filter signature:

- `post`: the filter receives a post object; text lives in `data.content` (per post)
- `string`: the filter receives `(text, data)` and returns the new text (whole page / asset)

Each stage is mounted **twice** on the Hexo filter, sandwiching Hexo internals and other plugins:

```
[5]   early slot   ← preset nodes by default (need raw text; e.g. mermaid must
                     see fenced blocks before backtick_code_block swallows them)
[10]  hexo internal filters, other plugins
[100] late slot    ← user hooks by default (see the stage's final text)
```

Nodes move between slots with `slot: 'early' | 'late'`.

Adding a stage = one table entry; engine, checker, and doctor pick it up automatically.

## Node: the single contract

```js
{
  name: 'callout',            // unique id; preset nodes get a '<preset>:' prefix automatically
  stage: 'after_post_render', // any key of the stage table, default before_post_render
  slot: 'early',              // 'early' (default for presets) | 'late' (default for hooks / api)
  priority: 10,               // lower runs first within the slot; ties broken by registration order
  enabledByDefault: false,    // optional; the user's enable always wins
  test(text) {},              // optional cheap pre-check; a match regex is its declarative form
  convert(text, ctx) {},      // pure function: text in, text out
  css: '...',                 // optional: injected into head_end (inject_css)
  js: (config) => '...',      // optional: injected into body_end (inject_js)
}
```

`ctx = { hexo, stage, pluginConfig, utils, log }`, plus: `post`-kind stages get `ctx.post`, `string`-kind stages get `ctx.file` (`{ path }`); `config` / `presetConfig` appear only when the node carries them (i.e. preset nodes — a hook's ctx has neither).

All three mounting mechanisms produce this exact shape, and the placement fields (stage / slot / priority / match) share a single source of defaults and validation in `node-contract.js`:

- **preset loader**: namespaces names (`obsidian:callout`), resolves per-node config/enable/slot/priority from the preset's config section, collects `init(hexo)` side-effect hooks
- **hook loaders**: wrap a script path or command string into a `convert`
- **public API**: `hexo.textPipeline.register(node)` validates and adds at any time (duplicate names warn here too) — the engine looks the registry up lazily at execution, so late registration just works

## The checker system (three lines of defense)

1. **Static (registration time, `checker/static.js`)** — unknown config keys with edit-distance suggestions, invalid stages, duplicate names, non-numeric priorities, missing script files (advisory only — the file may be created later), and order-ambiguity warnings when nodes from *different sources* share a stage+priority (same-source sharing is normal declared order).
2. **Runtime (every execution, `checker/runtime.js`)** — exception / non-string return → node skipped, original text flows on; 3 consecutive failures → circuit breaker disables the node for the rest of the run (no log spam per post); non-empty input wiped to empty or 20x size explosion → flagged but accepted (both can be legitimate).
3. **Doctor (`hexo pipeline`)** — prints each stage's resolved node order with priorities and sources, plus all static check results.

`strict: true` escalates: static errors and runtime failures throw instead of warn — for CI, where you want a broken hook to break the build.

## Design decision record

| Decision | Rationale |
|----------|-----------|
| Generic hooks bus as the product; Obsidian as a preset | Most small Hexo plugins are "transform text at a pipeline point"; the bus makes that a script + one config line. The Obsidian compiler is just the first packaged node set |
| One contract for preset nodes / hooks / API nodes | The engine schedules one thing; checkers check one thing; docs document one thing. No privileged path |
| Single normalization point for placement fields (`node-contract.js`) | The three registration paths used to normalize stage/slot/priority/match independently, so the same field behaved differently per entry point (e.g. inconsistent slot defaults); with one shared rule set, the only remaining difference is the per-role slot default, visible in one table |
| Priority numbers + registration order for ties | Matches Hexo's own filter priority model; explicit when it matters, unobtrusive when it doesn't. Doctor shows the resolved order so it's never a guess |
| Dual slots: presets early, hooks late | Presets need raw text (verified on a real site: hexo's `backtick_code_block` at priority 10 otherwise swallows fenced blocks before mermaid sees them); hooks want the final text and must not corrupt code accidentally. Sandwiching hexo internals serves both defaults, `slot` overrides either |
| Script hooks re-required on every run | Edit-and-use: under `hexo server`, editing the script takes effect on the next render. The feedback loop that makes "take over with a script" practical |
| Warn-and-skip by default, `strict` opt-in | Users iterate on scripts freely — a broken experiment costs a warning, not a failed deploy. CI flips to strict |
| Circuit breaker after 3 consecutive failures | A hook broken at post #1 of 500 would otherwise emit 500 identical warnings and 500 wasted spawns |
| Output anomaly checks warn but accept | Wiping (comment stripping) and inflation (asset inlining) are sometimes intended; the checker's job is visibility, not vetoing |
| Lazy registry lookup at filter execution | Registration can happen at any time (config, preset, another plugin's `textPipeline.register`) without re-wiring filters |
| Only text filter points exposed | Keeps every node `(text, ctx) => text`; non-text filters gain nothing from this bus |
| Zero runtime dependencies | Edit-distance, HTML scanning, etc. are implemented inline; the bus must stay lighter than what it replaces |

## Constraints (the discipline that keeps the architecture narrow and deep)

1. Nodes never require each other; shared logic sinks into `lib/core/` (or the preset's own dir)
2. `convert` must be side-effect free — unit tests need no mock of the hexo filter machinery
3. Preset node lists are explicit arrays, no directory scanning
4. The kernel does not grow with the number of presets or nodes; a new stage is a table entry, a new preset is a directory
5. Before writing a preset node, ask whether a user hook in the site repo is enough
