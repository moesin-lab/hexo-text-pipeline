'use strict';

const engine = require('./lib/core/engine');

function register(hexo) {
  engine.register(hexo);
}

const runtimeHexo =
  (typeof globalThis !== 'undefined' && globalThis.hexo) ||
  (typeof hexo !== 'undefined' ? hexo : undefined);
if (runtimeHexo) {
  register(runtimeHexo);
}

module.exports = register;
