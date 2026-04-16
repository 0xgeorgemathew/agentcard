import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Vitest runs the NFC/logic unit tests in Node. The React Native NFC stack
// (react-native-nfc-manager, @arx-research/libhalo) is replaced here with
// controllable fakes so the session lifecycle, dismissal contract, error
// mapping, and validation can be exercised deterministically. The `@` alias
// mirrors tsconfig.json.
export default defineConfig({
  resolve: {
    alias: {
      'react-native-nfc-manager': resolve(__dirname, 'src/test/nfc-manager-mock.ts'),
      '@arx-research/libhalo/api/react-native': resolve(__dirname, 'src/test/libhalo-mock.ts'),
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    globals: true,
    clearMocks: true,
  },
});
