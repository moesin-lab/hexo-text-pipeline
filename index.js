'use strict';

const engine = require('./lib/core/engine');
const registry = require('./lib/converters/registry');

function register(hexo) {
  engine.register(hexo, registry);
}

const runtimeHexo =
  (typeof globalThis !== 'undefined' && globalThis.hexo) ||
  (typeof hexo !== 'undefined' ? hexo : undefined);
if (runtimeHexo) {
  register(runtimeHexo);
}

module.exports = register;
