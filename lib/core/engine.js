'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { normalizeConfig } = require('./config');
const { STAGES, LATE_FILTER_PRIORITY } = require('./stages');
const { createRegistry, createPublicApi } = require('./api');
const { loadPresets } = require('./loaders/preset');
const { loadHooks } = require('./loaders/hooks');
const { loadPluginDir } = require('./loaders/plugin-dir');
const { checkPluginConfig, checkNodes } = require('./checker/static');
const { createRuntimeGuard } = require('./checker/runtime');
const { createTap } = require('./tap');
const { registerDoctorCommand } = require('./console/pipeline');

const registeredHexoInstances = new WeakSet();

function makeLogger(hexo, debug, name) {
  const prefix = '[text-pipeline' + (name ? ':' + name : '') + '] ';
  const hexoLog = hexo.log || {};
  return {
    debug(message) {
      if (!debug || typeof hexoLog.info !== 'function') return;
      hexoLog.info(prefix + message);
    },
    warn(message) {
      if (typeof hexoLog.warn === 'function') {
        hexoLog.warn(prefix + message);
      }
    }
  };
}

/**
 * 唯一调度者。注册流程（兜底链路）：
 *   1. 静态检查配置（checker/static）—— strict 下 error 直接让构建失败
 *   2. 加载 presets（插件的插件）、hooks（用户脚本/命令）与单文件插件目录
 *      （plugin-dir，零配置自动发现）为统一 node
 *   3. node 级静态检查（stage、重名、priority、脚本可达性、顺序歧义）
 *   4. 为 stage 表里每个 stage 注册一个 hexo filter，执行时懒查注册表
 *      （所以 hexo.textPipeline.register 在任何时刻注册都生效）
 *   5. 执行期每个 node 过 runtime guard：异常隔离、熔断、输出异常告警
 *
 * 同 stage 内顺序：priority 小者先跑，同级按注册顺序
 * （加载顺序 preset → hook → plugin）。
 */
function register(hexo) {
  if (!hexo || !hexo.extend || !hexo.extend.filter || typeof hexo.extend.filter.register !== 'function') {
    return;
  }
  if (registeredHexoInstances.has(hexo)) {
    return;
  }
  registeredHexoInstances.add(hexo);

  registerDoctorCommand(hexo); // 禁用时也注册，`hexo pipeline` 会提示插件未启用

  const pluginConfig = normalizeConfig(hexo.config);
  if (!pluginConfig.enable) {
    return;
  }

  const engineLog = makeLogger(hexo, pluginConfig.debug);
  const baseDir = hexo.base_dir;

  const issues = checkPluginConfig(pluginConfig.raw);
  const presetResult = loadPresets(pluginConfig.presets, baseDir);
  const hookResult = loadHooks(pluginConfig.hooks, baseDir);
  const pluginResult =
    pluginConfig.pluginsDir === false
      ? { nodes: [], issues: [] }
      : loadPluginDir(pluginConfig.pluginsDir, pluginConfig.plugins, baseDir);
  issues.push(...presetResult.issues, ...hookResult.issues, ...pluginResult.issues);

  const candidates = presetResult.nodes.concat(hookResult.nodes, pluginResult.nodes);
  issues.push(...checkNodes(candidates));

  if (pluginConfig.strict) {
    const errors = issues.filter((issue) => issue.level === 'error');
    if (errors.length) {
      throw new Error(
        '[text-pipeline] strict mode: config check failed\n  - ' + errors.map((e) => e.message).join('\n  - ')
      );
    }
  }
  for (const issue of issues) {
    if (issue.level === 'info') {
      engineLog.debug(issue.message); // 仅 debug / `hexo pipeline` 可见
    } else {
      engineLog.warn(issue.level + ': ' + issue.message);
    }
  }

  const registry = createRegistry();
  for (const node of candidates) {
    if (STAGES[node.stage]) registry.add(node);
  }

  const guard = createRuntimeGuard({ strict: pluginConfig.strict });
  hexo.extend.filter.register('before_generate', () => {
    guard.reset();
  });

  const tap = createTap(pluginConfig.tap, baseDir, engineLog);
  if (tap) {
    engineLog.warn('tap is ON — stage snapshots are written to ' + tap.root + ' (debug mode, disable for normal builds)');
  }

  const canInject = hexo.extend.injector && typeof hexo.extend.injector.register === 'function';
  const injectAssets = (node) => {
    if (!canInject) return;
    const sub = node.config || {};
    if (pluginConfig.injectCss) {
      // 用户样式文件（css: 路径 | 路径列表，相对 Hexo 根目录）直接替换 node 的默认样式
      const cssFiles = typeof sub.css === 'string' ? [sub.css] : Array.isArray(sub.css) ? sub.css : [];
      if (cssFiles.length) {
        for (const file of cssFiles) {
          try {
            const userCss = fs.readFileSync(path.resolve(baseDir || process.cwd(), String(file)), 'utf8');
            hexo.extend.injector.register('head_end', '<style>' + userCss + '</style>');
          } catch (err) {
            engineLog.warn('node "' + node.name + '" css file not readable: ' + file + ' (' + (err && err.message) + ')');
          }
        }
      } else if (node.css) {
        hexo.extend.injector.register('head_end', '<style>' + node.css + '</style>');
      }
    }
    if (pluginConfig.injectJs && node.js) {
      const js = typeof node.js === 'function' ? node.js(node.config || {}) : node.js;
      if (js) {
        hexo.extend.injector.register('body_end', '<script>' + js + '</script>');
      }
    }
  };

  const api = createPublicApi(registry, { onRegister: injectAssets, log: engineLog });
  hexo.textPipeline = api;
  // doctor 命令与测试读取的内部状态
  hexo._textPipeline = { registry, issues, pluginConfig, guard };

  // target：post 类 stage 是 post 数据对象，string 类是 { path } 等输出元信息。
  // ctx 上按 stage 类型分流成 post / file 两个名字，不再用 ctx.post 装非 post 的东西；
  // config / presetConfig 只在 node 自带时出现（hook 没有，ctx 上也不会有）。
  const runChain = (stageName, slot, text, target) => {
    let current = text;

    if (tap) tap.capture(stageName + '.' + slot, target, 'input', current);

    for (const node of registry.forStage(stageName, slot)) {
      if (typeof node.test === 'function' && !node.test(current)) continue;

      const log = makeLogger(hexo, pluginConfig.debug, node.name);
      const ctx = {
        hexo,
        stage: stageName,
        pluginConfig,
        utils: api.utils,
        log
      };
      if (STAGES[stageName].kind === 'post') {
        ctx.post = target;
      } else {
        ctx.file = target;
      }
      if (node.config !== undefined) ctx.config = node.config;
      if (node.presetConfig !== undefined) ctx.presetConfig = node.presetConfig;

      const next = guard.run(node, current, ctx);
      if (next !== current) {
        log.debug(stageName + ' applied source=' + ((target && (target.source || target.path)) || 'unknown'));
        if (tap) tap.capture(stageName + '.' + slot, target, node.name, next);
      }
      current = next;
    }

    return current;
  };

  // 每个 stage 两个挂点：early 抢在 hexo 内置/其他插件之前，late 在其全部跑完之后
  for (const stageName of Object.keys(STAGES)) {
    const slots = [
      ['early', STAGES[stageName].filterPriority],
      ['late', LATE_FILTER_PRIORITY]
    ];
    for (const [slot, filterPriority] of slots) {
      if (STAGES[stageName].kind === 'post') {
        hexo.extend.filter.register(stageName, (data) => {
          if (!data || typeof data.content !== 'string') {
            return data;
          }
          data.content = runChain(stageName, slot, data.content, data);
          return data;
        }, filterPriority);
      } else {
        hexo.extend.filter.register(stageName, (text, data) => {
          if (typeof text !== 'string') {
            return text;
          }
          return runChain(stageName, slot, text, data || {});
        }, filterPriority);
      }
    }
  }

  for (const node of registry.all()) {
    injectAssets(node);
  }

  for (const { name, init } of presetResult.inits) {
    try {
      init(hexo);
    } catch (err) {
      engineLog.warn('preset "' + name + '" init failed: ' + (err && err.message));
    }
  }
}

module.exports = {
  register,
  registeredHexoInstances,
  STAGES
};
