/**
 * `tools/lib/engines.mjs` 的类型声明：vite.config.ts（TypeScript）会 import 它来检查引擎可用性，
 * 而评测脚本本身是零依赖的 .mjs，所以类型只在这里声明一次。
 */
export declare const KNOWN_ENGINES: Record<string, string>;
export declare const ATHEN_HOST: string;
export declare function whichBin(bin: string): string | null;
export declare function configuredEngine(evalConfig: string): string;
export declare function configuredModel(evalConfig: string): string;
export declare function availableEngines(): string[];
export declare function engineStatus(
  evalConfig: string,
  override?: string,
): { name: string; bin: string; path: string | null; available: string[] };
export declare function engineAuth(name: string): { ok: boolean; detail: string };
export declare function engineInventory(): { name: string; ok: boolean; detail: string }[];
export declare function athenModel(): string;
export declare function athenHost(): string;
export declare function athenKey(): string | null;
export declare function athenKeySource(): string;
export declare function engineEnv(name: string): Record<string, string> | null;
export declare function openAiCompatEnv(): Record<string, string> | null;
