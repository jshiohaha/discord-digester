import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

export default {
    input: "src/index.ts", // Entry point of your application
    output: {
        dir: "dist", // Output directory for the bundle
        format: "es", // Output format (ES modules - ideal for Node.js and modern bundles)
        sourcemap: true,
        chunkFileNames: "chunks/[name]-[hash].js", // Optional: Customize chunk file names if needed
    },
    plugins: [
        resolve({
            extensions: [".ts", ".js", ".json"], // Resolve these file types
        }),
        json(), // Add json plugin here, before commonjs
        commonjs(), // Convert CommonJS modules to ES modules
        typescript({
            tsconfig: "./tsconfig.json", // Path to your tsconfig.json
        }),
    ],
    external: [
        "discord.js",
        "@discordjs/rest",
        "discord-api-types",
        "fastify",
        "pino-pretty",
    ],
};
