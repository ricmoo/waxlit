"use strict";

import resolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
import _globals from "rollup-plugin-node-globals";

import { terser } from "rollup-plugin-terser";

function getConfig(minify) {
  const suffix = ["esm"];

  const plugins = [
    resolve({
      mainFields: ["browser", "module", "main"],
      preferBuiltins: false,
    }),
    commonjs(),
    _globals(),
  ];

  if (minify) {
    suffix.push("min");
    plugins.push(terser());
  }

  return {
    input: `lib/index.js`,
    output: {
      file: `./dist/index.${suffix.join(".")}.js`,
      format: "esm",
      name: "waxlit",
      exports: "named",
    },
    context: "window",
    treeshake: false,
    plugins: plugins,
  };
}

export default [getConfig(false), getConfig(true)];
