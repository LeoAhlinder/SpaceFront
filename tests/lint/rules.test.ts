/**
 * Guards the lint rules themselves: if someone weakens eslint.config.js, the
 * determinism bans and import boundaries from CODING_STANDARDS.md must still hold.
 */
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({
  cwd: process.cwd(),
  // Virtual files are not in the TS project, so lint them without type info.
  overrideConfig: tseslint.configs.disableTypeChecked,
});

async function ruleIds(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? `fatal: ${m.message}`);
}

describe("core determinism bans", () => {
  const file = "src/core/example.ts";

  it.each([
    ["Math.random", "export const x = Math.random();", "no-restricted-properties"],
    ["Math.sin", "export const x = Math.sin(1);", "no-restricted-properties"],
    ["Math.pow", "export const x = Math.pow(2, 3);", "no-restricted-properties"],
    ["Date", "export const x = Date.now();", "no-restricted-globals"],
    ["performance", "export const x = performance.now();", "no-restricted-globals"],
    ["setTimeout", "setTimeout(() => {}, 1);", "no-restricted-globals"],
    ["for…in", "const o = {}; for (const k in o) { void k; }", "no-restricted-syntax"],
    ["async", "export async function f(): Promise<void> {}", "no-restricted-syntax"],
  ])("bans %s", async (_name, code, rule) => {
    expect(await ruleIds(file, code)).toContain(rule);
  });

  it("allows deterministic Math helpers", async () => {
    const code = "export const x = Math.floor(Math.sqrt(9)) + Math.abs(-1) + Math.imul(2, 3);";
    expect(await ruleIds(file, code)).toEqual([]);
  });
});

describe("import boundaries", () => {
  const RESTRICTED = "@typescript-eslint/no-restricted-imports";

  it("core cannot import the client, worker, shared or UI libs", async () => {
    for (const path of ["../client/x", "../worker/x", "../shared/x", "pixi.js", "preact"]) {
      const code = `import { a } from "${path}";\nexport const b = a;`;
      expect(await ruleIds("src/core/example.ts", code)).toContain(RESTRICTED);
    }
  });

  it("client can import types but not values from core", async () => {
    const typeOnly = `import type { A } from "../core";\nexport type B = A;`;
    const value = `import { TICK_MS } from "../core";\nexport const b = TICK_MS;`;
    expect(await ruleIds("src/client/example.ts", typeOnly)).toEqual([]);
    expect(await ruleIds("src/client/example.ts", value)).toContain(RESTRICTED);
  });

  it("worker may import core", async () => {
    const code = `import { TICK_MS } from "../core";\nexport const b = TICK_MS;`;
    expect(await ruleIds("src/worker/example.ts", code)).toEqual([]);
  });

  it("bans default exports in src", async () => {
    expect(await ruleIds("src/client/example.ts", "export default 1;")).toContain(
      "no-restricted-syntax",
    );
  });
});
