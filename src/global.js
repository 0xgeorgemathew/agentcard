// Polyfills required by @arx-research/libhalo (ethers, @noble/curves, buffer)
// under React Native + Hermes. These globals do not exist by default and the
// library accesses them at module-load time, so this file MUST run before any
// libhalo/ethers import. See the official guide:
// https://github.com/arx-research/libhalo/blob/master/docs/mobile-expo.md
import { Platform } from 'react-native';

// ethers and some @noble modules reference `self`.
if (typeof global.self === 'undefined') {
  global.self = global;
}

if (Platform.OS !== 'web') {
  // Crypto.getRandomValues() backed by the native secure RNG.
  require('react-native-get-random-values');
}

// base64
global.btoa = global.btoa || require('base-64').encode;
global.atob = global.atob || require('base-64').decode;

// Buffer — libhalo's nfc_manager driver calls Buffer.from(...) at module scope.
global.Buffer = global.Buffer || require('buffer').Buffer;

// Minimal process shim. ethers reads process.env.NODE_ENV and checks
// process.version (parsing it with .slice), so it must be a real-looking string.
global.process = global.process || require('process');
global.process.env = global.process.env || {};
global.process.env.NODE_ENV = __DEV__ ? 'development' : 'production';
global.process.version = global.process.version || 'v20.0.0';

// Note: do NOT polyfill `location` on native. The Hermes runtime locks it down
// (it's non-configurable), and any assignment throws "Cannot set location".
// libhalo/ethers don't need it on native — `location` is a web-only concept.
