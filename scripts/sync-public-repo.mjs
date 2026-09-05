import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const publicPaths = [
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

const scriptDir = dirname(fileURLToPath(import.meta.url));
const privateRoot = resolve(scriptDir, "..");
const options = parseArguments(process.argv.slice(2));

if (!options.publicRepoPath) {
  printUsage();
  process.exit(1);
}

const publicRoot = resolve(options.publicRepoPath);
assertDirectory(publicRoot, "Public repository");
assertSeparateRepository(privateRoot, publicRoot);
assertGitClean(publicRoot);

if (!options.skipPrivateChecks) {
  runPackageManager(privateRoot, ["run", "typecheck"]);
  runPackageManager(privateRoot, ["run", "build"]);
  runPackageManager(privateRoot, ["run", "release:check:all"]);
}

const snapshotParent = join(tmpdir(), "ylang-public-sync-");
const snapshotRoot = mkdtempSync(snapshotParent);

try {
  runPackageManager(privateRoot, ["run", "public:snapshot", "--", snapshotRoot]);
  copyAllowlistedSnapshot(snapshotRoot, publicRoot);
  runPackageManager(publicRoot, ["run", "public:check"]);

  if (options.runPublicBuildChecks) {
    runPackageManager(publicRoot, ["ci", "--cache", ".npm-cache"]);
    runPackageManager(publicRoot, ["run", "typecheck"]);
    runPackageManager(publicRoot, ["run", "build"]);
    runPackageManager(publicRoot, ["run", "release:check:all"]);
    runPackageManager(publicRoot, ["run", "public:check"]);
  }

  console.log("\nPublic repo synced. Review before committing:");
  run("git", ["-C", publicRoot, "status", "--short"], privateRoot);
} finally {
  if (options.keepSnapshot) {
    console.log(`Kept snapshot at ${snapshotRoot}`);
  } else {
    rmSync(snapshotRoot, { recursive: true, force: true });
  }
}

function parseArguments(args) {
  const parsed = {
    publicRepoPath: undefined,
    skipPrivateChecks: false,
    runPublicBuildChecks: false,
    keepSnapshot: false
  };

  for (const argument of args) {
    if (argument === "--skip-private-checks") {
      parsed.skipPrivateChecks = true;
    } else if (argument === "--run-public-build-checks") {
      parsed.runPublicBuildChecks = true;
    } else if (argument === "--keep-snapshot") {
      parsed.keepSnapshot = true;
    } else if (argument.startsWith("--")) {
      throw new Error(`Unknown option: ${argument}`);
    } else if (parsed.publicRepoPath) {
      throw new Error(`Unexpected argument: ${argument}`);
    } else {
      parsed.publicRepoPath = argument;
    }
  }

  return parsed;
}

function printUsage() {
  console.error(
    "Usage: npm run public:sync -- <public-repo-directory> " +
      "[--skip-private-checks] [--run-public-build-checks] [--keep-snapshot]"
  );
}

function assertDirectory(path, label) {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`${label} must be an existing directory: ${path}`);
  }
}

function assertSeparateRepository(sourceRoot, targetRoot) {
  const fromSource = relative(sourceRoot, targetRoot);
  if (!fromSource || isInside(fromSource)) {
    throw new Error("Public repo path must not be the private workspace or a directory inside it.");
  }
}

function isInside(relativePath) {
  return relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath);
}

function assertGitClean(repoPath) {
  run("git", ["-C", repoPath, "rev-parse", "--is-inside-work-tree"], privateRoot);
  const result = run("git", ["-C", repoPath, "status", "--porcelain=v1", "--untracked-files=normal"], privateRoot, {
    capture: true
  });
  if (result.stdout.trim()) {
    throw new Error(`Public repo has uncommitted changes. Commit, stash, or discard them before syncing.\n\n${result.stdout}`);
  }
}

function copyAllowlistedSnapshot(snapshotRoot, targetRoot) {
  for (const relativePath of publicPaths) {
    const sourcePath = safeChildPath(snapshotRoot, relativePath);
    const targetPath = safeChildPath(targetRoot, relativePath);
    if (!existsSync(sourcePath)) {
      console.warn(`WARN skipped missing snapshot path: ${relativePath}`);
      continue;
    }

    mkdirSync(dirname(targetPath), { recursive: true });
    rmSync(targetPath, { recursive: true, force: true });
    cpSync(sourcePath, targetPath, { recursive: statSync(sourcePath).isDirectory() });
  }
}

function safeChildPath(root, relativePath) {
  const child = resolve(root, relativePath);
  const fromRoot = relative(root, child);
  if (!isInside(fromRoot)) {
    throw new Error(`Refusing path outside root: ${relativePath}`);
  }
  return child;
}

function runPackageManager(workingDirectory, args) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    run(process.execPath, [npmExecPath, ...args], workingDirectory);
    return;
  }

  run(process.platform === "win32" ? "npm.cmd" : "npm", args, workingDirectory);
}

function run(command, args, workingDirectory, { capture = false } = {}) {
  console.log(`\n>> ${basename(command)} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: workingDirectory,
    encoding: "utf8",
    stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit"
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Command failed with exit code ${result.status}: ${command} ${args.join(" ")}`);
  }
  return result;
}
