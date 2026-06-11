'use strict';

function normalizeBase(base) {
  const raw = String(base || '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
}

/**
 * 归一化 hexo.config.text_pipeline。
 * 顶层开关 + 全局选项 + presets（插件的插件）+ hooks（用户脚本/命令）。
 * 字段合法性由 checker/static 负责，这里只做形状归一，未知字段不丢（raw 保留给 checker）。
 */
const DEFAULT_PLUGINS_DIR = 'text-pipeline';

function normalizeConfig(hexoConfig) {
  const raw = (hexoConfig && hexoConfig.text_pipeline) || {};
  return {
    enable: raw.enable !== false,
    debug: Boolean(raw.debug),
    strict: Boolean(raw.strict),
    injectCss: raw.inject_css !== false,
    injectJs: raw.inject_js !== false,
    presets: Array.isArray(raw.presets) ? raw.presets : [],
    hooks: Array.isArray(raw.hooks) ? raw.hooks : [],
    // 单文件插件目录：false 关闭自动发现，字符串改目录名，缺省用约定值
    pluginsDir:
      raw.plugins_dir === false
        ? false
        : typeof raw.plugins_dir === 'string' && raw.plugins_dir.trim()
          ? raw.plugins_dir.trim()
          : DEFAULT_PLUGINS_DIR,
    plugins: raw.plugins && typeof raw.plugins === 'object' && !Array.isArray(raw.plugins) ? raw.plugins : {},
    tap: raw.tap && typeof raw.tap === 'object' ? raw.tap : { enable: false },
    raw
  };
}

/**
 * presets 条目两种写法：'obsidian' 或 { name: 'obsidian', config: {...} }。
 */
function normalizePresetEntry(entry) {
  if (typeof entry === 'string') {
    return { name: entry.trim(), config: {} };
  }
  if (entry && typeof entry === 'object' && typeof entry.name === 'string') {
    return {
      name: entry.name.trim(),
      config: entry.config && typeof entry.config === 'object' ? entry.config : {}
    };
  }
  return null;
}

/** preset config 里某个 node 的子配置（presets[].config.<shortName>）。 */
function nodeConfig(presetConfig, shortName) {
  const sub = presetConfig && presetConfig[shortName];
  return sub && typeof sub === 'object' ? sub : {};
}

/** node 的 enable 解析顺序：用户子配置 > node.enabledByDefault > 默认开。preset 与单文件插件共用。 */
function isNodeEnabled(node, sub) {
  if (typeof sub.enable === 'boolean') return sub.enable;
  return node.enabledByDefault !== false;
}

module.exports = {
  normalizeBase,
  normalizeConfig,
  normalizePresetEntry,
  nodeConfig,
  isNodeEnabled,
  DEFAULT_PLUGINS_DIR
};
