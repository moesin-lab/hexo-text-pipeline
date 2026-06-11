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
    domainPrefix: normalizeBase(raw.domain_prefix),
    converters: raw.converters && typeof raw.converters === 'object' ? raw.converters : {}
  };
}

function converterConfig(pluginConfig, name) {
  const sub = pluginConfig.converters[name];
  return sub && typeof sub === 'object' ? sub : {};
}

function isConverterEnabled(pluginConfig, name) {
  return converterConfig(pluginConfig, name).enable !== false;
}

module.exports = {
  normalizeBase,
  normalizeConfig,
  converterConfig,
  isConverterEnabled
};
