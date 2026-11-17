// ESLint flat config. Enforces the rules from docs/CODING_STANDARDS.md:
// - import boundaries between core / worker / client / data / shared
// - banned non-deterministic APIs inside the simulation (core + data)
// - no default exports, no console, no any
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Matches an import path that points into the given top-level src folder. */
const folder = (name) => `(^|/)${name}(/|$)`;

const restrict = (...entries) => [
  "error",
  {
    paths: entries.filter((e) => typeof e === "string").map((name) => ({ name })),
    patterns: entries.filter((e) => typeof e !== "string"),
  },
];

const ban = (name, message) => ({ regex: folder(name), message });
const banTypeOk = (name, message) => ({ regex: folder(name), message, allowTypeImports: true });
const banPkg = (regex, message) => ({ regex, message });

const UI_LIBS = banPkg("^(pixi\\.js|preact|@preact/)", "Rendering/UI libraries are client-only.");

/** Syntax banned everywhere in src. */
const SRC_SYNTAX = [{ selector: "ExportDefaultDeclaration", message: "Use named exports only." }];

/** Syntax banned in the deterministic simulation. */
const SIM_SYNTAX = [
  ...SRC_SYNTAX,
  { selector: "ForInStatement", message: "for…in is banned in core: iterate arrays in id order." },
  { selector: "AwaitExpression", message: "The simulation is fully synchronous." },
  { selector: ":function[async=true]", message: "The simulation is fully synchronous." },
];

const MATH_BANNED = [
  "random",
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "atan2",
  "sinh",
  "cosh",
  "tanh",
  "asinh",
  "acosh",
  "atanh",
  "exp",
  "expm1",
  "log",
  "log2",
  "log10",
  "log1p",
  "pow",
  "cbrt",
  "hypot",
].map((property) => ({
  object: "Math",
  property,
  message:
    property === "random"
      ? "Use the world RNG (core/math/rng)."
      : "Not bit-exact across engines. Use core/math (lookup tables / fixed-point).",
}));

const SIM_GLOBALS = [
  "Date",
  "performance",
  "setTimeout",
  "setInterval",
  "clearTimeout",
  "clearInterval",
  "requestAnimationFrame",
  "queueMicrotask",
  "window",
  "document",
  "self",
  "crypto",
  "fetch",
].map((name) => ({ name, message: `${name} is not allowed in the deterministic simulation.` }));

export default tseslint.config(
  { ignores: ["dist/", "coverage/", "node_modules/", "desktop/web/", "desktop/release/"] },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": "allow-with-description", "ts-ignore": true },
      ],
      eqeqeq: ["error", "always"],
      "no-console": "error",
    },
  },

  // Plain JS files (configs, the Electron wrapper in desktop/) are not part of the TS project.
  {
    files: ["**/*.js", "**/*.cjs", "**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: globals.node,
    },
  },

  // ---- src: shared rules ------------------------------------------------------
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: { "no-restricted-syntax": ["error", ...SRC_SYNTAX] },
  },

  // ---- core + data: deterministic simulation ----------------------------------
  {
    files: ["src/core/**/*.ts", "src/data/**/*.ts"],
    languageOptions: { globals: {} },
    rules: {
      "no-restricted-syntax": ["error", ...SIM_SYNTAX],
      "no-restricted-properties": ["error", ...MATH_BANNED],
      "no-restricted-globals": ["error", ...SIM_GLOBALS],
    },
  },
  {
    files: ["src/core/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": restrict(
        ban("client", "core must not depend on the client."),
        ban("worker", "core must not depend on the worker."),
        ban("shared", "core must not depend on shared (worker/client messages)."),
        UI_LIBS,
      ),
    },
  },
  {
    files: ["src/data/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": restrict(
        banTypeOk("core", "data may only import types from core."),
        ban("client", "data must not depend on the client."),
        ban("worker", "data must not depend on the worker."),
        ban("shared", "data must not depend on shared."),
        UI_LIBS,
      ),
    },
  },
  // Tests of core may compare against Math.sin etc. (they are not simulation code),
  // but must stay reproducible, so Math.random remains banned.
  {
    files: ["src/core/**/*.test.ts", "src/data/**/*.test.ts"],
    rules: {
      "no-restricted-properties": ["error", ...MATH_BANNED.filter((r) => r.property === "random")],
    },
  },

  // ---- worker -----------------------------------------------------------------
  {
    files: ["src/worker/**/*.ts"],
    languageOptions: { globals: globals.worker },
    rules: {
      "@typescript-eslint/no-restricted-imports": restrict(
        ban("client", "worker must not depend on the client."),
        UI_LIBS,
      ),
    },
  },

  // ---- client -----------------------------------------------------------------
  {
    files: ["src/client/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    rules: {
      "@typescript-eslint/no-restricted-imports": restrict(
        banTypeOk("core", "client may only import types from core; talk to the sim via SimBridge."),
        ban("worker", "client talks to the worker only through client/bridge messages."),
      ),
    },
  },

  // ---- shared: message types only ---------------------------------------------
  {
    files: ["src/shared/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": restrict(
        banTypeOk("core", "shared may only import types from core."),
        ban("client", "shared must not depend on the client."),
        ban("worker", "shared must not depend on the worker."),
        UI_LIBS,
      ),
    },
  },

  // ---- tools & tests: node scripts, console allowed -----------------------------
  {
    files: ["tools/**/*.ts", "tests/**/*.ts", "e2e/**/*.ts", "**/*.test.ts", "*.config.ts"],
    languageOptions: { globals: globals.node },
    rules: { "no-console": "off" },
  },

  // The Electron main process and preload are CommonJS (Electron loads them with require).
  {
    files: ["desktop/**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "no-console": "off",
    },
  },
  {
    files: ["desktop/scripts/**/*.mjs"],
    rules: { "no-console": "off" },
  },

  prettier,
);
