**English** | [简体中文](USING-PRESETS.zh-CN.md)

# Using presets

A preset is a packaged set of pipeline nodes — "a plugin of plugins". One config entry mounts the whole set; this doc covers enabling, configuring, and verifying one. (Writing your own preset is [EXTENDING.md, level 3](EXTENDING.md).)

Everything below lives under the `text_pipeline:` key of your site's `_config.yml` (the Hexo root one, not the theme's).

## Quick start

```bash
npm install hexo-text-pipeline --save
```

```yaml
# _config.yml
text_pipeline:
  presets:
    - obsidian
```

That's it — `hexo clean && hexo generate` and the preset's nodes run. Verify with:

```bash
hexo pipeline
```

which prints every stage's resolved node order; preset nodes appear namespaced, e.g. `obsidian:wikilink`.

> A bare `presets:` at the top level of `_config.yml` does nothing — it must be nested under `text_pipeline:`.

## Where a preset can come from

| Entry | Resolves to |
|-------|-------------|
| `obsidian` | built-in preset shipped with this package (`lib/presets/<name>`) |
| `some-npm-package` | an npm package installed in your site |
| `./pipeline/my-preset` | site-local directory or file, relative to the Hexo root |

Bare names try built-ins first, then npm. A preset that fails to load is reported by the checker and skipped (or fails the build with `strict: true`) — your other nodes still run.

## Configuring a preset

The full entry form is `{ name, config }`. Inside `config`, keys are split by meaning:

- **A key matching a node's short name** (`callout`, `mermaid`, …) is that node's sub-config. Four keys are interpreted by the engine — `enable`, `slot`, `priority` for placement, and `css` (a stylesheet path or list, relative to the Hexo root) which **replaces** the node's default styles — everything else reaches the node as `ctx.config`.
- **Every other key** is preset-wide config, reaching all nodes as `ctx.presetConfig` (e.g. `domain_prefix` in the obsidian preset).

```yaml
text_pipeline:
  presets:
    - name: obsidian
      config:
        domain_prefix: ''                        # preset-wide → ctx.presetConfig
        callout:
          enable: true                           # node-level: opt in
          css: ./source/css/my-callout.css       # replaces the built-in callout styles
        embed: { asset_prefix: /images }         # node-level sub-config → ctx.config
        mermaid: { theme: dark, priority: 15 }   # sub-config + placement override
```

Per-node enable resolution: **your config > the node's `enabledByDefault` > on**. So obsidian's `callout` (shipped `enabledByDefault: false`) needs the explicit `enable: true` above, while disabling any default-on node is `<node>: { enable: false }`.

Note: the top-level `plugins:` section configures single-file plugins from `text-pipeline/` only. Preset nodes are always configured through `presets[].config.<node>` as shown above.

## Placement and order

Preset nodes mount on each stage's **early slot** by default (they want the raw text, before Hexo's own filters), with `priority: 10`; override per node via `slot` / `priority` in its sub-config. Listing multiple presets registers them in list order, which is also the tie-break order at equal stage/slot/priority. Details: [ARCHITECTURE.md](ARCHITECTURE.md).

## Debugging

- `hexo pipeline` — resolved node order per stage + all checker results.
- `hexo pipeline --dry-run source/_posts/x.md` — run the markdown chain on one file, showing each node's diff.
- `tap` config — snapshot the text flowing through every stage during a real render. See "Developing hooks" in the [README](../README.md).

## The built-in `obsidian` preset

Compiles Obsidian Flavored Markdown for Hexo: wikilinks, embeds, comments, highlights, block ids, mermaid, callouts, leftover `.md` links. The full node table and per-node config live in the [README](../README.md#built-in-preset-obsidian).
