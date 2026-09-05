import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";

const distDir = process.argv[2] ?? "dist";
const manifestPath = join(distDir, "manifest.json");
const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`Could not read ${path}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function assertDistFile(relativePath, label) {
  const filePath = join(distDir, relativePath);
  if (!existsSync(filePath)) {
    fail(`${label} is missing: ${relativePath}`);
  }
}

function listFiles(root, prefix = "") {
  if (!existsSync(root)) {
    return [];
  }

  return readdirSync(root).flatMap((entry) => {
    const absolute = join(root, entry);
    const relative = prefix ? posix.join(prefix, entry) : entry;
    return statSync(absolute).isDirectory()
      ? listFiles(absolute, relative)
      : [relative];
  });
}

function hasTopLevelModuleSyntax(source) {
  return /(^|\n)\s*(import|export)\s/u.test(source);
}

if (!existsSync(distDir)) {
  fail("dist/ does not exist. Run npm run build first.");
}

const manifest = existsSync(manifestPath) ? readJson(manifestPath) : undefined;
if (!manifest) {
  fail("dist/manifest.json is missing.");
} else {
  if (manifest.manifest_version !== 3) {
    fail("Manifest must use manifest_version 3.");
  }

  if (!manifest.name || !manifest.version || !manifest.description) {
    fail("Manifest must include name, version, and description.");
  }

  Object.values(manifest.icons ?? {}).forEach((iconPath) => assertDistFile(iconPath, "Manifest icon"));
  Object.values(manifest.action?.default_icon ?? {}).forEach((iconPath) => assertDistFile(iconPath, "Action icon"));

  if (manifest.action?.default_popup) {
    assertDistFile(manifest.action.default_popup, "Popup page");
  }
  if (manifest.options_page) {
    assertDistFile(manifest.options_page, "Options page");
  }
  if (manifest.background?.service_worker) {
    assertDistFile(manifest.background.service_worker, "Background service worker");
  }
  for (const backgroundScript of manifest.background?.scripts ?? []) {
    assertDistFile(backgroundScript, "Background script");
  }

  for (const script of manifest.content_scripts ?? []) {
    for (const jsPath of script.js ?? []) {
      assertDistFile(jsPath, "Content script");
      const fullPath = join(distDir, jsPath);
      if (existsSync(fullPath) && hasTopLevelModuleSyntax(readFileSync(fullPath, "utf8"))) {
        fail(`Content script contains top-level import/export and may fail in MV3: ${jsPath}`);
      }
    }
  }

  for (const resourceGroup of manifest.web_accessible_resources ?? []) {
    for (const resourcePath of resourceGroup.resources ?? []) {
      assertDistFile(resourcePath, "Web accessible resource");
    }
  }

  const broadReadingScript = (manifest.content_scripts ?? []).find((script) =>
    (script.matches ?? []).some((match) => match === "http://*/*" || match === "https://*/*")
  );
  if (broadReadingScript) {
    warn("Reading mode still uses broad http/https content-script matches. This is a known store-review risk.");
  }
}

for (const privatePath of [".git", ".agents", ".codex", "node_modules"]) {
  if (existsSync(join(distDir, privatePath))) {
    fail(`Private/dev artifact must not be packaged: ${distDir}/${privatePath}`);
  }
}

const distFiles = listFiles(distDir);
for (const file of distFiles) {
  if (/\.(map|ts|tsx)$/u.test(file)) {
    warn(`Source-like file found in ${distDir}: ${file}`);
  }
}

warnings.forEach((message) => console.warn(`WARN ${message}`));

if (failures.length) {
  failures.forEach((message) => console.error(`FAIL ${message}`));
  process.exit(1);
}

console.log(`Release check passed with ${warnings.length} warning${warnings.length === 1 ? "" : "s"}.`);
