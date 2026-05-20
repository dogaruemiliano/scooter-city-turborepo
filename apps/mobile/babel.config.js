module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "react-native-unistyles/plugin",
        {
          root: "src",
          // Process source files inside the workspace ui package so unistyles
          // can rewrite StyleSheet.create / useUnistyles usages there too
          // (pnpm symlinks them into node_modules/@repo/ui-native/src).
          autoProcessPaths: ["@repo/ui-native/src"],
        },
      ],
    ],
  };
};
