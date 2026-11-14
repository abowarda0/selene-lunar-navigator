// Tests read the real year files from public/data. Declared here so the app needs no @types/node.
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
}
