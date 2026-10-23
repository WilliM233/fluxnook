import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The plan scaffolds with --no-agents-md; without this, next dev writes AGENTS.md anyway.
  agentRules: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
