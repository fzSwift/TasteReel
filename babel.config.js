// Metro transform workers may run with a different cwd; pin preset to this project root.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [require.resolve("babel-preset-expo", { paths: [__dirname] })],
  };
};
