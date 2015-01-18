/**
 * Created by Shaun on 5/1/14.
 *
 */

(function(id) {
  'use strict';

  var core, Util, Injector, types, gids = {}, allElements, previousOwner = undefined;
  var CONSOLE_ID = id;

  Util = {
    isDefined: function(value) { return (typeof value !== 'undefined'); },
    isBoolean: function(value) { return (typeof value === 'boolean'); },
    def: function(value, defaultValue) { return (typeof value === 'undefined') ? defaultValue : value; },
    error: function(message) { throw new Error(CONSOLE_ID + ': ' + message); },
    warn: function(message) { Util.log('Warning: ' + message); },
    log: function(message) { if(core.log) { console.log(CONSOLE_ID + ': ' + message); } },
    argsToArray: function(args) { return Array.prototype.slice.call(args); },
    getGID: function(prefix) {
      prefix = Util.def(prefix, '');
      gids[prefix] = Util.def(gids[prefix], 0);
      return prefix + (++gids[prefix]);
    },
    rand: function(max, min) {
      min = min || 0;
      if(min > max || max < min) { Util.error('rand: invalid range.'); }
      return Math.floor((Math.random() * (max - min + 1))) + (min);
    }
  };

  types = ['Array', 'Object', 'Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp', 'HTMLImageElement'];
  for(var i = 0; i < types.length; i++) {
    Util['is' + types[i]] = (function(type) { 
      return function(obj) {
        return Object.prototype.toString.call(obj) === '[object ' + type + ']';
      }; 
    })(types[i]);
  }

  function getInterceptor(interceptors, matchString) {
    var i, interceptor, matches;
    for(i = 0; i < interceptors.length; i++) {
      interceptor = interceptors[i];
      if(matches = matchString.match(interceptor.pattern)) {
        return {key: matches[1], cb: interceptor.cb};
      }
    }
    return null;
  }

  function intercept(module, interceptorFunc) {
    if(interceptorFunc) {
      return interceptorFunc(module);
    }
    return module;
  }

  Injector = {
    unresolved: {},
    modules: {},
    interceptors: [],
    register: function(key, deps, func, scope) {
      this.unresolve(key);
      this.unresolved[key] = {deps: deps, func: func, scope: scope};
      return this;
    },
    unresolve: function(key) {
      if(this.modules[key]) {
        delete this.modules[key];
      }
      return this;
    },
    setModule: function(key, module) { // save a module without doing dependency resolution
      this.modules[key] = module;
      return this;
    },
    getDependency: function(key, cb) {
      var modules, module, interceptor, interceptorFunc;

      interceptor = getInterceptor(this.interceptors, key);
      if(interceptor) {
        interceptorFunc = interceptor.cb;
        key = interceptor.key;
      }
      modules = this.modules;
      module = modules[key];

      if(module) {
        module = intercept(module, interceptorFunc);
        cb(module);
        return;
      }

      if(key.indexOf('/') != -1) {
        this.modules.httpGet(key, cb);
        return;
      }

      module = this.unresolved[key];
      if(!module) {
        getElement(key, null, function(element) {
          if(element) {
            element = intercept(element, interceptorFunc);
            cb(element);
          } else {
            Util.warn('Module \'' + key + '\' not found');
          }
        });
        return;
      }

      Util.log('Resolving dependencies for \'' + key + '\'');
      this.resolveAndApply(module.deps, module.func, module.scope, function(module) {
        if(Util.isObject(module)) {
          module.getType = function() { return key; };
        }
        modules[key] = module;
        module = intercept(module, interceptorFunc);
        cb(module);
      });

      return;
    },
    resolve: function(deps, cb, index, results) {
      var that = this; // FIXME

      index = Util.def(index, 0);

      var depName = deps[index];
      if(!depName) {
        cb(results);
        return;
      }
      
      this.getDependency(depName, function(dep) {
        if(!results) {
          results = [];
        }
        if(dep) {
          results.push(dep);
        } else {
          Util.error('Can\'t resolve ' + depName);
        }

        that.resolve(deps, cb, index + 1, results);    
      });
    },
    apply: function(args, func, scope) {
      var result = func.apply(scope || core, args);
      return result;
    },
    resolveAndApply: function(deps, func, scope, cb) {
      var that = this;
      this.resolve(deps, function(args) {
        var result = that.apply(args, func, scope);
        if(cb && Util.isFunction(cb)) {
          cb(result);
        }
      });
    },
    addInterceptor: function(pattern, cb) {
      this.interceptors.push({pattern: pattern, cb: cb});
    },
    process: function(deps, cb) { // Can this go somewhere else?
      var i, numDeps, obj;
      if(Util.isArray(deps)) {
        for(i = 0, numDeps = deps.length; i < numDeps; i++) {
          obj = deps[i]; 
          if(Util.isString(obj)) {
            this.getDependency(obj, function(obj) {
              cb(obj);
            });
          } else {
            cb(obj);
          }
        }
      } else {
        if(Util.isString(deps)) {
          this.getDependency(deps, function(deps) {
            cb(deps);
          });
        } else {
          cb(deps);
        }
      }
    }
  };

  /** run onReady when document readyState is 'complete' */
  function onDocumentReady(onReady) {
    var readyStateCheckInterval;
    if(!onReady) return;
    if(document.readyState === 'complete') {
      onReady(document);
    } else {
      readyStateCheckInterval = setInterval(function () {
        if(document.readyState === 'complete') {
          onReady(document);
          clearInterval(readyStateCheckInterval);
        }
      }, 10);
    }
  }

  function registerDefinitionObject(result) {
    var key;
    if(Util.isObject(result)) {
      for(key in result) {
        if(result.hasOwnProperty(key)) {
          Injector.register(key, [], (
            function(func) {
              return function() { return func; };
            }
          )(result[key]));
        }
      }
    }
  }

  // TODO: performance
  function getElement(elementId, container, cb) {
    onDocumentReady(function(document) {
      var i, numElements, element, elements, bracketIndex, results = [];
      if(!container) {
        if(!allElements) {
          container = document.getElementsByTagName('body');
          if(!container || !container[0]) {
            return;
          }
          allElements = container[0].querySelectorAll('*');
        }
        elements = allElements;
      } else {
        elements = container.querySelectorAll('*');
      }

      bracketIndex = elementId.indexOf('[]');
      if(bracketIndex !== -1) {
        elementId = elementId.substring(0, bracketIndex);
      }
      for(i = 0, numElements = elements.length; i < numElements; i++) {
        element = elements[i];
        if(element.hasAttribute('data-' + elementId)) {
          results.push(element);
        }
      }
      if(bracketIndex === -1) {
        cb(results[0]);
      } else {
        cb(results);
      }
    }); 
  }

  function parseResponse(contentType, responseText) {
    switch(contentType) {
      case 'application/json':
      case 'application/json; charset=utf-8':
        return JSON.parse(responseText);
      default:
        return responseText;
    }
  }

  function httpGet(url, onComplete, onProgress, contentType) {
    var req = new XMLHttpRequest();

    if(onProgress) {
      req.addEventListener('progress', function(event) {
        onProgress(event.loaded, event.total);
      }, false);
    }

    req.onerror = function(event) {
      Util.error('Network error.');
    };

    req.onload = function() {
      var contentType = contentType || this.getResponseHeader('content-type');
      switch(this.status) {
        case 500:
        case 404:
          onComplete(this.statusText, this.status);
          break;
        case 304:
        default:
          onComplete(parseResponse(contentType, this.responseText), this.status);
      }
    };

    req.open('get', url, true);
    req.send();
  }

  function register(key, depsOrFunc, funcOrScope, scope) {
    // register a new module (with dependencies)
    if(Util.isArray(depsOrFunc) && Util.isFunction(funcOrScope)) {
      Injector.register(key, depsOrFunc, funcOrScope, scope);
    } 
     // register a new module (without dependencies)
    else if(Util.isFunction(depsOrFunc)) {
      Injector.register(key, [], depsOrFunc, funcOrScope);
    }
  }

  core = function() {};

  core.use = function(depsOrFunc, funcOrScope, scope, cb) {
    var result;
    // one dependency
    if(Util.isString(depsOrFunc)) {
      Injector.resolveAndApply([depsOrFunc], funcOrScope, scope, cb);
    }
    // multiple dependencies
    else if (Util.isArray(depsOrFunc)) {
      Injector.resolveAndApply(depsOrFunc, funcOrScope, scope, cb);
    } 
    // no dependencies
    else if(Util.isFunction(depsOrFunc)) {
      result = Injector.apply([], depsOrFunc, funcOrScope);
      if(cb) {
        cb(result);
      }
    }
  };

  core.use.defer = function(depsOrFunc, funcOrScope, scope) {
    return function(cb) {
      core.use(depsOrFunc, funcOrScope, scope, cb);
    };
  };

  core.use.run = function(dep, scope) {
    var cb, done, result;
    var func = function() {
      var args = arguments;

      core.use(dep, function(dep) {
        if(Util.isFunction(dep)) {
          result = dep.apply(null, args);
          if(cb) {
            cb(result);
          }
          done = true;
          return result;
        }
      }, scope);

      return { 
        on: function(_cb) {
          if(done) {
            _cb(result);
          } else {
            cb = _cb;
          }      
        }
      };
    };

    return func;
  };

  core.register = function(key, depsOrFunc, funcOrScope, scope) {
    if(Util.isFunction(depsOrFunc) || Util.isFunction(funcOrScope)) {
      return register(key, depsOrFunc, funcOrScope, scope);
    }
    return {
      depends: function() {
        depsOrFunc = Util.argsToArray(arguments);
        return this;
      },
      factory: function(func, scope) {
        register(key, depsOrFunc, func, scope)
      }
    };
  };

  core.unresolve = function(key) {
    Injector.unresolve(key);
  };

  core.noConflict = function() {
    window[id] = previousOwner;
    return core;
  };
  core.onDocumentReady = onDocumentReady;
  core.log = true;

  /** add these basic modules to the injector */
  Injector
    .setModule('Util', Util)
    .setModule('Injector', Injector)
    .setModule('element', getElement)
    .setModule('registerAll', registerDefinitionObject)
    .setModule('httpGet', httpGet);

  /** create references to core */
  if(typeof window !== 'undefined') {
    if(window[id]) {
      Util.warn('a preexisting value at namespace \'' + id + '\' has been overwritten.');
      previousOwner = window[id];
    }
    window[id] = core;
    if(!window.register) window.register = core.register;
    if(!window.use) window.use = core.use;
  }

  if(typeof exports !== 'undefined') {
    exports[id] = core; 
    exports['register'] = core.register;
    exports['use'] = core.use;   
  }

  return core;
})('kilo');