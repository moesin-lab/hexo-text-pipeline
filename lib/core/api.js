'use strict';

const { STAGES } = require('./stages');
const guard = require('./markdown-guard');

const DEFAULT_PRIORITY = 10;

/**
 * 中央 node 注册表。engine 在 filter 执行时懒查询，所以注册可以发生在任何时刻
 * （配置加载、preset 加载、其他插件经 hexo.textPipeline.register 程序化注册）。
 *
 * node 统一契约（唯一接口）：
 * {
 *   name,                       // 唯一标识；preset 的 node 自动带 '<preset>:' 前缀
 *   stage,                      // stages.js 表里的键
 *   priority: 10,               // 小者先跑，同级按注册顺序（与 Hexo filter 优先级模型一致）
 *   test(text),                 // 可选，廉价预判
 *   convert(text, ctx),         // 纯函数：文本进、文本出
 *   css, js,                    // 可选，默认样式/前端脚本
 *   origin,                     // 'preset:<name>' | 'hook:command' | 'hook:script' | 'api'
 * }
 */
function createRegistry() {
  const entries = [];
  let seq = 0;

  return {
    add(node) {
      entries.push({ node, seq: (seq += 1) });
    },
    forStage(stage) {
      return entries
        .filter((entry) => entry.node.stage === stage)
        .sort((a, b) => {
          const pa = Number.isFinite(a.node.priority) ? a.node.priority : DEFAULT_PRIORITY;
          const pb = Number.isFinite(b.node.priority) ? b.node.priority : DEFAULT_PRIORITY;
          return pa - pb || a.seq - b.seq;
        })
        .map((entry) => entry.node);
    },
    all() {
      return entries.map((entry) => entry.node);
    }
  };
}

/**
 * 暴露为 hexo.textPipeline 的程序化 API：其他插件/脚本也能往管线挂 node。
 * utils 给 script hook 用（如在 markdown 阶段跳过代码块）。
 */
function createPublicApi(registry, { onRegister } = {}) {
  return {
    stages: Object.keys(STAGES),
    utils: {
      replaceOutsideCode: guard.replaceOutsideCode,
      replaceOutsideInlineCode: guard.replaceOutsideInlineCode,
      segmentInlineCode: guard.segmentInlineCode
    },
    register(node) {
      if (!node || typeof node.convert !== 'function' || typeof node.name !== 'string' || !node.name) {
        throw new TypeError('textPipeline.register expects { name, stage, convert(text, ctx) }');
      }
      if (!STAGES[node.stage]) {
        throw new TypeError(
          'unknown stage "' + node.stage + '" (valid: ' + Object.keys(STAGES).join(', ') + ')'
        );
      }
      const wrapped = Object.assign({ origin: 'api', priority: DEFAULT_PRIORITY }, node);
      registry.add(wrapped);
      if (typeof onRegister === 'function') onRegister(wrapped);
      return wrapped;
    }
  };
}

module.exports = {
  createRegistry,
  createPublicApi,
  DEFAULT_PRIORITY
};
