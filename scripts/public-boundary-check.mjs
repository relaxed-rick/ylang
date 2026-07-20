import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";

const failures = [];
const warnings = [];
const blockedPaths = new Set([
  ".agents",
  ".codex"
]);
const ignoredWorkingTreePaths = new Set([
  "node_modules",
  "dist"
]);
const allowedPrivatePaths = new Set([".git"]);
const blockedFilePatterns = [
  /\.env(?:\.|$)/u,
  /\.apkg$/u,
  /\.(webm|wav|mp3|m4a|ogg|mp4)$/iu,
  /\.(vtt|srt)$/iu,
  /storage-dump/iu,
  /learning-backup/iu,
  /ylang-learning-backup/iu,
  /llm-debug/iu,
  /transcript-export/iu,
  /translation-export/iu
];
const suspiciousContentPatterns = [
  /Ocp-Apim-Subscription-Key["'\s:=]+[A-Za-z0-9+/=_-]{20,}/u,
  /sk-[A-Za-z0-9]{20,}/u,
  /Bearer\s+[A-Za-z0-9._-]{20,}/u
];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function listFiles(root = ".", prefix = "") {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? posix.join(prefix, entry.name) : entry.name;
    if (allowedPrivatePaths.has(relative)) {
      return [];
    }
    if (blockedPaths.has(relative)) {
      fail(`Private/generated path must not be copied to the public repo: ${relative}`);
      return [];
    }
    if (ignoredWorkingTreePaths.has(relative)) {
      return [];
    }

    const absolute = join(root, entry.name);
    if (entry.isDirectory()) {
      return listFiles(absolute, relative);
    }
    return [relative];
  });
}

function isTextFile(path) {
  return /\.(c?js|mjs|json|md|html|css|ts|tsx|svg|txt|yml|yaml|toml|lock)$/iu.test(path);
}

for (const requiredPath of [
  "README.md",
  "ROADMAP.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "LICENSE.md",
  "package.json",
  "package-lock.json",
  "public",
  "src",
  "docs",
  ".github/ISSUE_TEMPLATE"
]) {
  if (!existsSync(requiredPath)) {
    fail(`Expected public source path is missing: ${requiredPath}`);
  }
}

const files = listFiles();
for (const file of files) {
  if (blockedFilePatterns.some((pattern) => pattern.test(file))) {
    fail(`Private/user-data-like file should not be copied publicly: ${file}`);
  }

  if (!isTextFile(file) || !existsSync(file) || statSync(file).size > 1_000_000) {
    continue;
  }

  const content = readFileSync(file, "utf8");
  if (suspiciousContentPatterns.some((pattern) => pattern.test(content))) {
    fail(`Possible secret found in ${file}`);
  }
  if (/AI chat context|agent transcript|scratch prompt/iu.test(content) && !file.startsWith("docs/") && file !== "scripts/public-boundary-check.mjs") {
    warn(`AI/private-process wording found outside docs: ${file}`);
  }
}

warnings.forEach((message) => console.warn(`WARN ${message}`));

if (failures.length) {
  failures.forEach((message) => console.error(`FAIL ${message}`));
  process.exit(1);
}

console.log(`Public boundary check passed with ${warnings.length} warning${warnings.length === 1 ? "" : "s"}.`);
