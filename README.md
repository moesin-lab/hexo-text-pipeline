# hexo-obsidian-compiler

把 Obsidian Flavored Markdown 编译成 Hexo 可用输出的插件。可插拔 converter 架构，逐步覆盖 Obsidian 特色语法。

是 [hexo-obsidian-link-converter](https://github.com/Sentixxx/hexo-obsidian-link-converter) 的演进版：wiki link 转换已作为 converter 并入本插件。

## 已支持语法

| Converter | 语法 | 行为 |
|-----------|------|------|
| `wikilink` | `[[目标#锚点\|别名]]` | 改写为指向文章永久链接的 markdown 链接 |
| `callout` | `> [!type] 标题` + 引用正文 | 渲染为 `<div class="callout callout-type">`，支持折叠 `[!type]-` / `[!type]+`（输出 `<details>`）、嵌套、任意自定义 type（如 `[!diary]`） |
| `mdlink` | 渲染后残留的 `.md` 链接 | 兜底改写为文章永久链接 |

链接目标解析：按 title / slug / source 路径多键匹配；frontmatter 里的 `abbrlink` 标签优先（→ `/posts/<abbrlink>`），没有 `abbrlink` 时兜底用 Hexo 按 permalink 配置生成的 `post.path`，两者都没有则保持原样。

## 安装

```bash
npm install hexo-obsidian-compiler --save
```

## 配置（`_config.yml`，全部可省略）

```yaml
obsidian_compiler:
  enable: true          # 总开关
  debug: false          # 输出调试日志
  inject_css: true      # 注入 callout 默认样式；主题自带样式时设为 false
  domain_prefix: ''     # 链接前缀，如 https://example.com/blog
  converters:
    wikilink:
      enable: true
    callout:
      enable: true
    mdlink:
      enable: true
```

### 从 hexo-obsidian-link-converter 迁移

卸载旧插件，配置键从 `obsidian_link_converter` 改名为 `obsidian_compiler`（`domain_prefix` 含义不变），行为兼容。

## Callout 输出结构

```html
<div class="callout callout-diary" data-callout="diary">
  <div class="callout-title">2026-05-30 星期六</div>
  <div class="callout-content"><p>…</p></div>
</div>
```

折叠语法输出 `<details>/<summary>`（`+` 默认展开）。默认样式按 `data-callout` 类型配色（note/tip/warning/danger/diary 等），关闭 `inject_css` 后可完全由主题接管。

## 开发

零运行时依赖，Node >= 16。

```bash
npm test   # node --test
```

- 架构与 converter 接口契约：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 新增语法的操作步骤与路线图：[docs/ADDING-A-CONVERTER.md](docs/ADDING-A-CONVERTER.md)

## License

MIT
