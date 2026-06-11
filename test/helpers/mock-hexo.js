'use strict';

function createHexoMock(options = {}) {
  const posts = options.posts || [];
  const config = options.config || {};

  let postsGetCount = 0;
  const handlers = new Map();
  const injected = [];
  const consoleCommands = new Map();
  const warnings = [];

  const hexo = {
    config,
    base_dir: options.baseDir,
    locals: {
      get(name) {
        if (name === 'posts') {
          postsGetCount += 1;
          return {
            toArray() {
              return posts;
            }
          };
        }
        return null;
      }
    },
    extend: {
      filter: {
        register(name, fn) {
          handlers.set(name, fn);
        }
      },
      injector: {
        register(entry, value) {
          injected.push({ entry, value });
        }
      },
      console: {
        register(name, desc, opts, fn) {
          consoleCommands.set(name, fn);
        }
      }
    },
    log: {
      info() {},
      warn(message) {
        warnings.push(message);
      }
    }
  };

  return {
    hexo,
    handlers,
    injected,
    consoleCommands,
    warnings,
    getPostsGetCount() {
      return postsGetCount;
    }
  };
}

module.exports = { createHexoMock };
