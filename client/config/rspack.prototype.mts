import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "path";

import { rspack } from "@rspack/core";
import type { Compiler, Configuration } from "@rspack/core";
import HtmlWebpackPlugin from "html-webpack-plugin";
import { merge } from "rspack-merge";

import { brandingStrings } from "@konveyor-ui/common";

import { brandingPath } from "./rspack.common.mjs";
import productionConfiguration from "./rspack.prod.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const pathTo = (relativePath: string) => path.resolve(__dirname, relativePath);
const faviconPath = path.resolve(brandingPath, "favicon.ico");

/**
 * Static hosting (for example GitHub Pages): `STATIC_HTML=true` renders
 * index.html and 404.html at build time instead of leaving index.html.ejs for
 * the Node server, and `BASE_PATH` (default `/`) sets the path the site is
 * served under.
 */
const isStaticHtml = process.env.STATIC_HTML === "true";

/** Normalize a base path to a leading and trailing slash: `a/b` gives `/a/b/`. */
const normalizeBasePath = (basePath = "") =>
  `/${basePath}/`.replace(/\/{2,}/g, "/");

/**
 * The `window._env` the Node server injects for the hosted demo, computed by
 * the server's own serializer in a child process (it reads `process.env` at
 * import), with the environment of `Dockerfile.prototype`.
 */
const serializePrototypeClientEnv = () =>
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `import { serializeClientConfig } from ${JSON.stringify(
        pathToFileURL(pathTo("../../server/src/serverConfig.js")).href
      )};
      process.stdout.write(serializeClientConfig());`,
    ],
    {
      encoding: "utf-8",
      env: {
        ...process.env,
        NODE_ENV: "production",
        MOCK: "stub",
        AUTH_REQUIRED: "false",
      },
    }
  ).trim();

/** Emits an empty `.nojekyll` so GitHub Pages never runs Jekyll on the output. */
class NoJekyllPlugin {
  apply(compiler: Compiler) {
    compiler.hooks.thisCompilation.tap("NoJekyllPlugin", (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: "NoJekyllPlugin",
          stage: compiler.rspack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
        },
        () => {
          compilation.emitAsset(
            ".nojekyll",
            new compiler.rspack.sources.RawSource("")
          );
        }
      );
    });
  }
}

const staticHtmlPlugins = () => {
  const templateParameters = {
    _env: serializePrototypeClientEnv(),
    branding: brandingStrings,
    basePath: normalizeBasePath(process.env.BASE_PATH),
  };
  return [
    // 404.html is the same page: static hosts serve it for unknown paths, so
    // deep links load the app.
    ...["index.html", "404.html"].map(
      (filename) =>
        new HtmlWebpackPlugin({
          filename,
          template: pathTo("../public/index.html.ejs"),
          templateParameters,
          favicon: faviconPath,
          minify: {
            collapseWhitespace: false,
            keepClosingSlash: true,
            minifyJS: true,
            removeEmptyAttributes: true,
            removeRedundantAttributes: true,
          },
        })
    ),
    new NoJekyllPlugin(),
  ];
};

// Hosted demo build: an optimized production bundle that keeps the MSW mock
// data and the prototype persona/scenario controls. The normal production
// build (rspack.prod.mts) excludes both.
const config = merge(productionConfiguration, {
  optimization: { nodeEnv: "development" },
  plugins: [
    new rspack.CopyRspackPlugin({
      patterns: [
        { from: pathTo("../public/mockServiceWorker.js") },
        // Visitor guide, linked from the prototype switcher.
        {
          from: pathTo("../public/prototype-guide"),
          to: "prototype-guide",
        },
      ],
    }),
    ...(isStaticHtml ? staticHtmlPlugins() : []),
  ],
} as Configuration);

if (isStaticHtml) {
  // No server renders the template, so do not publish it as a raw file.
  config.plugins = config.plugins?.filter(
    (plugin) =>
      !(
        plugin instanceof HtmlWebpackPlugin &&
        plugin.userOptions.filename === "index.html.ejs"
      )
  );
}

export default config;
