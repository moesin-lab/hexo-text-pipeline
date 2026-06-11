'use strict';

function normalizeBase(base) {
  const raw = String(base || '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
}

/**
 * 归一化 hexo.config.obsidian_compiler。
 * 顶层开关 + 全局选项 + 每个 converter 的子配置（converters.<name>）。
 */
function normalizeConfig(hexoConfig) {
  const raw = (hexoConfig && hexoConfig.obsidian_compiler) || {};
  return {
    enable: raw.enable !== false,
    debug: Boolean(raw.debug),
    injectCss: raw.inject_css !== false,
    injectJs: raw.inject_js !== false,
    domainPrefix: normalizeBase(raw.domain_prefix),
    converters: raw.converters && typeof raw.converters === 'object' ? raw.converters : {},
    hooks: Array.isArray(raw.hooks) ? raw.hooks : []
  };
}

function converterConfig(pluginConfig, name) {
  const sub = pluginConfig.converters[name];
  return sub && typeof sub === 'object' ? sub : {};
}

/**
 * converter 可声明 enabledByDefault: false（如 callout：多数渲染器已自带支持），
 * 用户配置 enable 永远优先于 converter 自身的默认值。
 */
function isConverterEnabled(pluginConfig, conv) {
  const name = typeof conv === 'string' ? conv : conv.name;
  const sub = converterConfig(pluginConfig, name);
  if (typeof sub.enable === 'boolean') return sub.enable;
  return typeof conv === 'string' || conv.enabledByDefault !== false;
}

module.exports = {
  normalizeBase,
  normalizeConfig,
  converterConfig,
  isConverterEnabled
};
