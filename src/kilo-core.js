/**
 * Created by Shaun on 5/1/14.
 */

var kilo = (function(id) {
  'use strict';

  var core, Util, Injector, appConfig = {}, gids = {}, allElements, previousOwner = undefined;
  var CONSOLE_ID = id;

  Util = {
    isDefined: function(value) { return (typeof value !== 'undefined'); },
    //isObject: function(value) { return (value !== null && typeof value === 'object'); },
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

  ['Array', 'Object', 'Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp', 'HTMLImageElement'].
    forEach(function(name) {
      Util['is' + name] = function(obj) {
        return Object.prototype.toString.call(obj) === '[object ' + name + ']';
      };
    });

  Injector = {
    unresolved: {},
    modules: {},
    register: function(key, deps, func, scope) {
      this.unresolved[key] = {deps: deps, func: func, scope: scope};
      return this;
    },
    setModule: function(key, module) { // save a module without doing dependency resolution
      this.modules[key] = module;
      return this;
    },
    getDependency: function(key) {
      var module = this.modules[key];
      if(module) {
        return module;
      }

      module = this.unresolved[key];
      if(!module) {
        Util.warn('Module \'' + key + '\' not found');
        return null;
      }

      Util.log('Resolving dependencies for \'' + key + '\'');
      module = this.modules[key] = this.resolveAndApply(module.deps, module.func, module.scope);
      if(Util.isObject(module)) {
        module.getType = function() { return key; };
      }
      delete this.unresolved[key];
      return module;
    },
    resolve: function(deps, func, scope) {
      var dep, depName, args = [], i;
      for(i = 0; i < deps.length; i++) {
        depName = deps[i];
        dep = this.getDependency(depName);
        if(dep) {
          args.push(dep);
        } else {
          Util.warn('Can\'t resolve ' + depName);
        }
      }
      return args;
    },
    apply: function(args, func, scope) {
      return func.apply(scope || core, args);
    },
    resolveAndApply: function(deps, func, scope) {
      return this.apply(this.resolve(deps), func, scope);
    }
  };

  /** add these basic modules to the injector */
  Injector
    .setModule('helper', Util).setModule('Helper', Util).setModule('Util', Util)
    .setModule('injector', Injector).setModule('Injector', Injector)
    .setModule('appConfig', appConfig);

  /** run onReady when document readyState is 'complete' */
  function onDocumentReady(onReady) {
    var readyStateCheckInterval;
    if (document.readyState === 'complete') {
      onReady();
    } else {
      readyStateCheckInterval = setInterval(function () {
        if (document.readyState === 'complete') {
          onReady();
          clearInterval(readyStateCheckInterval);
        }
      }, 10);
    }
  }

  /** the main interface */
  core = function(keyOrDeps, depsOrFunc, funcOrScope, scope) {
    // get dependencies
    if(Util.isArray(keyOrDeps)) {
      Injector.resolveAndApply(keyOrDeps, depsOrFunc, funcOrScope);

    // register a new module (with dependencies)
    } else if(Util.isArray(depsOrFunc) && Util.isFunction(funcOrScope)) {
      Injector.register(keyOrDeps, depsOrFunc, funcOrScope, scope);

    // register a new module (without dependencies)
    } else if(Util.isFunction(depsOrFunc)) {
      Injector.register(keyOrDeps, [], depsOrFunc, funcOrScope);

    // get a module
    } else if(keyOrDeps && !Util.isDefined(depsOrFunc)) {
      return Injector.getDependency(keyOrDeps);
    }

    return null;
  };

  core.noConflict = function() {
    window[id] = previousOwner;
    return core;
  };
  core.element = function(elementId, funcOrDeps, func) {
    var deps;

    if(Util.isFunction(funcOrDeps)) {
      func = funcOrDeps;
    } else if(Util.isArray(funcOrDeps)) {
      deps = funcOrDeps;
    } else {
      Util.error('element: second argument should be function or dependency array.');
    }

    onDocumentReady(function() {
      var i, body, numElements, selectedElement;

      if(!allElements) {
        body = document.getElementsByTagName('body');
        if(!body || !body[0]) {
          return;
        }
        allElements = body[0].querySelectorAll('*');
      }

      for(i = 0, numElements = allElements.length; i < numElements; i++) {
        selectedElement = allElements[i];
        if(selectedElement.hasAttribute('data-' + elementId) || selectedElement.hasAttribute(elementId)){
          if(deps) {
            func.apply(selectedElement, Injector.resolve(deps));
          } else {
            func.call(selectedElement);
          }
        }
      }
    });

    return this;
  };
  core.onDocumentReady = core.ready = onDocumentReady;
  core.log = true;

  /** create global reference to core */
  if(window[id]) {
    Util.warn('a preexisting value at namespace \'' + id + '\' has been overwritten.');
    previousOwner = window[id];
  }
  window[id] = core;
  return core;
})('kilo');