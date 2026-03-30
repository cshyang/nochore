// Empty stub for server-only modules that leak into client bundles.
// Vite resolves all imports at module scope even for TanStack Start
// server functions, pulling native Node.js packages into the browser.
// This stub provides safe no-ops so the client bundle doesn't crash.
export default {};
export const drizzle = () => ({});
export const resolve = (...args: string[]) => args.join("/");
export const join = (...args: string[]) => args.join("/");
export const dirname = (p: string) => p;
export const basename = (p: string) => p;
export const extname = (_p: string) => "";
export const existsSync = () => false;
export const readFileSync = () => "";
export const readdirSync = () => [];
export const mkdirSync = () => {};
export const rmSync = () => {};
export const writeFileSync = () => {};
