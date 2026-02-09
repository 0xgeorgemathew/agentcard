// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

// LibHaLo + ethers require a few Node/Browser polyfills that React Native
// does not ship by default. expo-crypto-polyfills wires them into extraNodeModules
// so imports like 'buffer', 'stream', 'crypto' resolve at bundle time.
const config = getDefaultConfig(__dirname);

config.resolver = {
  ...config.resolver,
  extraNodeModules: {
    ...config.resolver.extraNodeModules,
    ...require('expo-crypto-polyfills'),
  },
};

module.exports = config;
