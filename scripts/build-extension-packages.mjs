import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { build } from "vite";

const distDir = "dist";
const chromiumDir = join(distDir, "chromium");
const firefoxDir = join(distDir, "firefox");

await build();

const baseDir = mkdtempSync(join(tmpdir(), "ylang-extension-build-"));
try {
  copyPackageEntries(distDir, baseDir);
  recreatePackage(baseDir, chromiumDir);
  recreatePackage(baseDir, firefoxDir);
  writeFirefoxManifest(firefoxDir);
} finally {
  rmSync(baseDir, { recursive: true, force: true });
}

console.log(`Packaged Chromium extension at ${chromiumDir}`);
console.log(`Packaged Firefox extension at ${firefoxDir}`);

function copyPackageEntries(sourceDir, targetDir) {
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir)) {
    if (entry === "chromium" || entry === "firefox") {
      continue;
    }
    cpSync(join(sourceDir, entry), join(targetDir, entry), { recursive: true });
  }
}

function recreatePackage(sourceDir, targetDir) {
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });
  copyPackageEntries(sourceDir, targetDir);
}

function writeFirefoxManifest(packageDir) {
  const manifestPath = join(packageDir, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.permissions = (manifest.permissions ?? []).filter((permission) => permission !== "system.display");
  manifest.background = {
    scripts: [manifest.background?.service_worker ?? "assets/background.js"]
  };
  manifest.browser_specific_settings = {
    gecko: {
      id: "ylang@local-first.dev",
      strict_min_version: "109.0"
    }
  };

  manifest.content_scripts = (manifest.content_scripts ?? []).map((script) => {
    const next = { ...script };
    delete next.match_origin_as_fallback;
    return next;
  });

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const backgroundScript = manifest.background.scripts[0];
  if (!existsSync(join(packageDir, backgroundScript))) {
    throw new Error(`Firefox background script is missing: ${backgroundScript}`);
  }

  console.log(`Wrote Firefox manifest: ${basename(manifestPath)}`);
}
