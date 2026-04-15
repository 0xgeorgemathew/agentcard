// App entry. Polyfills must install BEFORE expo-router loads the route tree,
// because _layout.tsx -> readCard.ts -> @arx-research/libhalo accesses Buffer /
// process / crypto at module-evaluation time. Importing here (the bundle entry)
// guarantees that ordering regardless of which route renders first.
import './src/global';

// Hand off to Expo Router's entry. require() (not import) so the polyfill
// import above is guaranteed to run first in module-evaluation order.
require('expo-router/entry');
