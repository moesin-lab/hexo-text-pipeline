[English](PLUGINS.md) | **简体中文**

# 单文件插件

写插件 = 写一个文件。站点根目录建一个 `text-pipeline/` 目录，里面每个 `.js` 文件自动挂载为管线插件，零配置生效：

```js
// <hexo 站点根>/text-pipeline/arrow.js —— 这就是一个完整插件
module.exports = {
  replace: [[/-->/g, '→']]
};
```

下一次 `hexo generate` 它就在跑了。不用改 `_config.yml`，不用发包，不用重启（逻辑改动即改即用，见文末边界）。

何时选单文件插件、何时用 hooks 或 preset，见 [EXTENDING.zh-CN.md](EXTENDING.zh-CN.md)；stage 输入形态、`ctx` 字段、调试工作流（tap / dry-run）与 hooks 完全共享，见 [HOOKS-API.zh-CN.md](HOOKS-API.zh-CN.md)。

## 完整契约

一个插件文件导出**一个 node 对象**（与统一契约同形），或 **node 数组**：

```js
module.exports = {
  name: 'ruby',                  // 可选；缺省取文件名（ruby.js → ruby）
  stage: 'before_post_render',   // 可选；默认 before_post_render
  slot: 'late',                  // 可选；默认 late（看到该 stage 的最终文本）
  priority: 10,                  // 可选；同挂点内小者先跑
  match: '\\{ruby',              // 可选；正则预判，不命中直接跳过（也可写 test(text) 函数）
  convert(text, ctx) {           // convert 与 replace 恰有其一
    return text;
  },
  css: '.ruby { … }',            // 可选；inject_css 开启时注入 head_end
  js: '…',                       // 可选；inject_js 开启时注入 body_end
  enabledByDefault: true         // 可选；用户配置的 enable 永远优先
};
```

- **数组导出必须给每个元素显式 `name`**；只有单对象导出才享受文件名推导。
- `_` 前缀的文件被跳过——放共享辅助模块（插件文件里 `require('./_shared')`，热重载会一并跟踪）。
- **不收裸函数导出**：`module.exports = (text, ctx) => text` 的函数形态由 hooks 的 `script:` 条目承载（placement 写在 YAML 里）。插件目录保持"声明式 node"一种心智。
- 多文件按文件名排序注册；日志 / tap / `hexo pipeline` 报告里的来源标识为 `plugin:<文件名>`。
- name 不加前缀（这是你自己起的名字）；与 preset（`obsidian:` 前缀）、hook（`hook:` 前缀）天然不冲突，插件之间撞名会在启动时收到告警。

## `replace`：convert 的声明式写法

常见的"正则替换"场景不用写 convert：

```js
module.exports = {
  replace: [
    [/-->/g, '→'],                          // [RegExp, 字符串替换（支持 $1）]
    [/\bv(\d+)\b/g, (m, n) => 'v' + n]      // 或 [RegExp, 函数]
  ]
};
```

- pattern **必须是 RegExp 字面量**（不收字符串——插件文件就是 JS，写字面量零成本，还省掉转义歧义）。
- 缺 `g` 标志**自动补全**：replace 列表的语义就是全文替换；"只换第一个"请写 convert。
- node 落在 `before_post_render`（输入是 markdown）时**自动套 markdown-guard**：围栏代码块和行内代码绝不会被误伤。其余 stage 直接全文替换。没有关闭 guard 的开关——需要碰代码块就写 convert（`ctx.utils` 里工具齐全）。
- `replace` 在所有注册路径都可用：preset node、`hexo.textPipeline.register` 同样接受。

刻意不做的：`prepend` / `append` / `wrap`（一行 convert 即可，DSL 不省心智）、HTML 选择器操作（零依赖下没有 DOM）、条件组合字段（那是在对象字面量里发明编程语言）。

## 配置覆盖（`_config.yml`）

文件里声明默认值，配置按插件名覆盖：

```yaml
text_pipeline:
  plugins_dir: text-pipeline   # 可选：改目录名；false 关闭自动发现
  plugins:
    arrow:
      enable: false            # enable / slot / priority 覆盖文件声明
    ruby:
      slot: early
      priority: 5
      dict: ./ruby.json        # 其余键随整个子对象进 ctx.config
```

- enable 解析顺序：`plugins.<name>.enable` > 文件里的 `enabledByDefault` > 默认开。
- `stage` 不可覆盖——stage 是插件语义的一部分，属于文件（与 preset 子配置同一规则）。
- `plugins` 下写了不存在的名字会收到 warn（带 did-you-mean 建议）。

## 热重载边界

**即改即用**（`hexo s` 下保存文件，下一次渲染生效）：`convert` / `replace` / `test` / `match` 的逻辑改动，以及插件 `require` 的本地辅助模块（`./_shared`，不含 node_modules）。

**需要重启 hexo** 的三种情况（与"hexo filter 注册后不可反注册、注入一次性"的事实对应）：

1. `stage` / `slot` / `priority` / `name` / `css` / `js` / `enabledByDefault` 的改动——挂载位置和注入在注册期固化；
2. 目录里**新增或删除**文件——发现只在启动时做一次；
3. 启动时文件就有语法错误——该文件不挂载（error issue，strict 下挡构建），修好后重启。

## 兜底（与其他注册路径完全一致）

插件 node 进入注册表后自动获得全部兜底：抛错 / 返回非字符串 → 跳过并告警，原文继续；连续失败 3 次 → 整轮熔断，下一轮自动复位；`hexo pipeline` 报告与 `--dry-run` 逐 node diff 都包含插件 node；tap 快照同样落盘。构建永远不会因为一个坏插件失败（除非 `strict: true`）。
