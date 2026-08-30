const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

// SDK 54 + pnpm：交给 expo/metro-config 自动识别 workspace，勿设 EXPO_NO_METRO_WORKSPACE_ROOT
const config = getDefaultConfig(__dirname);

const existingBlockList = [].concat(config.resolver.blockList || []);
config.resolver.blockList = [
  ...existingBlockList,
  /.*\/\.expo\/.*/,
  /.*\/react-native\/ReactAndroid\/.*/,
  /.*\/react-native\/ReactCommon\/.*/,
  /.*\/@typescript-eslint\/eslint-plugin\/.*/,
  /.*\/caniuse-lite\/data\/.*/,
  /.*\/__tests__\/.*/,
  /.*\.git\/.*/,
  /.*node_modules\/\.pnpm\/.*_tmp_\d+.*/,
];

module.exports = withUniwindConfig(config, {
  cssEntryFile: './global.css',
  dtsFile: './uniwind-types.d.ts',
});
