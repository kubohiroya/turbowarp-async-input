import {AsyncInputExtension} from './extension.js';

if (!Scratch.extensions.unsandboxed) {
  throw new Error('Async Input must run unsandboxed.');
}

Scratch.extensions.register(new AsyncInputExtension());
