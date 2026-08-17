import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { extname, join } from "node:path";

const projectRoot = process.cwd();
const outputRoot = join(projectRoot, "public", "practice");
const rootExtensions = new Set([".html", ".json", ".md"]);
const excludedRootFiles = new Set([
  "package-lock.json",
  "package.json",
  "tsconfig.json",
]);

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

for (const entry of await readdir(projectRoot, { withFileTypes: true })) {
  if (
    entry.isFile() &&
    rootExtensions.has(extname(entry.name)) &&
    !excludedRootFiles.has(entry.name)
  ) {
    await cp(join(projectRoot, entry.name), join(outputRoot, entry.name));
  }
}

await cp(join(projectRoot, "reading_qb"), join(outputRoot, "reading_qb"), {
  recursive: true,
});
