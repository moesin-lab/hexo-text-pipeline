[English](ADDING-A-CONVERTER.md) | **简体中文**

# 新增一个语法 converter（SOP）

**第 0 步——先问要不要写 converter。** 如果这个变换只服务你自己的站点，别动这个仓库：在站点仓库里写个脚本，在 `_config.yml` 里声明为[用户 hook](../README.zh-CN.md#用户-hook接管任意阶段) 即可。只有当语法是通用的 Obsidian/Hexo 行为、本插件的每个用户都需要时，才值得做成内置 converter。

之后按序执行，全程不需要改 `lib/core/`。

1. **先写验收用例**：在 `test/<name>.test.js` 里添加 输入 → 期望输出 对（输入是 markdown 还是 HTML 取决于第 3 步选的 stage）。
2. **复制模板**：`cp -r lib/converters/_template lib/converters/<name>`，改 `name` 字段。
3. **选 stage**（完整表见 `lib/core/stages.js`）：
   - 重写结果仍是 markdown（如 `==高亮==` → `<mark>`）→ `before_post_render`；行内替换**必须**用 `core/markdown-guard` 的 `replaceOutsideCode` 包住，避免改写代码块。
   - 转换依赖渲染后的 HTML 结构（如 callout 基于 `<blockquote>`）→ `after_post_render`，不需要 guard。
   - 整页或资源级变换 → `after_render:html` / `after_render:css` / `after_render:js`（很少适合做内置，通常该是用户 hook）。
4. **实现**：解析放 `parse.js`，输出放 `render.js`（简单语法可全放 `index.js`）。需要文章索引用 `core/post-index`。默认样式放 `styles.js` 经 `css` 字段暴露；前端加载脚本走 `js` 字段（字符串，或子配置的函数）。如果多数用户的渲染器/主题已自带该行为，出厂带上 `enabledByDefault: false`。
5. **注册**：在 `lib/converters/registry.js` 加一行 `require('./<name>')`——数组顺序就是同 stage 内的执行顺序（如 `comment` 必须最先，被注释掉的语法要在其他节点看到之前消失）。
6. **验证**：`npm test` 全绿。
7. **写文档**：更新中英两份 README 的内置 converter 表。

## 语法路线图（按 Obsidian Flavored Markdown 官方列表）

| 语法 | 形式 | 状态 | 建议 stage |
|------|------|------|-----------|
| 内部链接 | `[[Link]]` | ✅ wikilink | before |
| 注释 | `%%Text%%`（行内与跨行） | ✅ comment | before |
| Mermaid 图表 | ` ```mermaid ` 块 | ✅ mermaid | before |
| Callout | `> [!note]` | ✅ callout（默认关闭） | after |
| 残留 .md 链接 | `[x](a.md)` / `href="a.md"` | ✅ mdlink | after |
| 高亮 | `==Text==` | ⬜ | before |
| 文件/笔记嵌入 | `![[Link]]` | ⬜ | before |
| 块引用 | `![[Link#^id]]` | ⬜ | before |
| 块定义 | `^id` | ⬜ | before |
| 脚注 | `[^id]` | ⬜（渲染器配置可能已覆盖） | — |
| 删除线 / 任务列表 / 表格 | `~~ ~~` / `- [ ]` | 无需处理（marked 原生支持） | — |
