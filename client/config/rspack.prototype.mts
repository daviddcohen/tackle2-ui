import { fileURLToPath } from "node:url";
import path from "path";

import { rspack } from "@rspack/core";
import type { Configuration } from "@rspack/core";
import { merge } from "rspack-merge";

import productionConfiguration from "./rspack.prod.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const pathTo = (relativePath: string) => path.resolve(__dirname, relativePath);

// Hosted demo build: an optimized production bundle that keeps the MSW mock
// data and the prototype persona/scenario controls. The normal production
// build (rspack.prod.mts) excludes both.
export default merge(productionConfiguration, {
  optimization: { nodeEnv: "development" },
  plugins: [
    new rspack.CopyRspackPlugin({
      patterns: [{ from: pathTo("../public/mockServiceWorker.js") }],
    }),
  ],
} as Configuration);
