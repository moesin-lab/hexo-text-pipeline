'use strict';

function createHexoMock(options = {}) {
  const posts = options.posts || [];
  const config = options.config || {};

  let postsGetCount = 0;
  const handlers = new Map();
  const injected = [];

  const hexo = {
    config,
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
      }
    },
    log: {
      info() {},
      warn() {}
    }
  };

  return {
    hexo,
    handlers,
    injected,
    getPostsGetCount() {
      return postsGetCount;
    }
  };
}

module.exports = { createHexoMock };
