module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "react-native-unistyles/plugin",
        {
          root: "src",
          // Match every entry point of @repo/theme-native that workspace
          // packages may import — exact string match, no prefix.
          autoProcessImports: [
            "@repo/theme-native",
            "@repo/theme-native/styles",
            "@repo/theme-native/configure",
          ],
          // Process source files inside the workspace ui package
          // (pnpm symlinks them into node_modules/@repo/ui-native/src).
          autoProcessPaths: ["@repo/ui-native/src"],
          // Log every file the plugin transforms — useful to verify the
          // workspace components are being processed. Disable in CI.
          debug: true,
        },
      ],
    ],
  };
};
