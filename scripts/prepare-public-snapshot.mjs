import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const targetArg = process.argv[2];

if (!targetArg) {
  console.error("Usage: npm run public:snapshot -- <target-directory>");
  process.exit(1);
}

const targetDir = resolve(targetArg);

if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
  console.error(`Target directory is not empty: ${targetDir}`);
  console.error("Choose a new empty directory so private history or local files cannot be mixed into the public snapshot.");
  process.exit(1);
}

const includePaths = [
  ".github/ISSUE_TEMPLATE",
  ".gitignore",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "LICENSE.md",
  "README.md",
  "ROADMAP.md",
  "docs",
  "package-lock.json",
  "package.json",
  "public",
  "scripts",
  "src",
  "tsconfig.json",
  "vite.config.ts"
];

mkdirSync(targetDir, { recursive: true });

for (const relativePath of includePaths) {
  if (!existsSync(relativePath)) {
    console.warn(`WARN skipped missing path: ${relativePath}`);
    continue;
  }

  const destination = join(targetDir, relativePath);
  const stats = statSync(relativePath);
  cpSync(relativePath, destination, {
    recursive: stats.isDirectory(),
    errorOnExist: false
  });
}

console.log(`Prepared public snapshot at ${targetDir}`);
console.log("Next: cd into the snapshot, run npm install, then run typecheck/build/release/public checks before initializing git.");
