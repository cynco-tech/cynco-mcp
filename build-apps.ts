/**
 * Build script for Cynco MCP Apps.
 * Runs Vite in single-file mode for each app, producing one .html per app in dist/apps/.
 */
import { execSync } from "node:child_process";
import { readdirSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = import.meta.dirname;
const APPS_DIR = join(ROOT, "apps");
const OUT_DIR = join(ROOT, "dist", "apps");
const TEMP_DIR = join(ROOT, ".vite-tmp");

// Ensure output directory exists
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

// Discover apps: each directory in apps/ with an app.html is an app
const apps = readdirSync(APPS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "shared")
  .filter((d) => existsSync(join(APPS_DIR, d.name, "app.html")))
  .map((d) => d.name);

if (apps.length === 0) {
  console.log("No apps found to build.");
  process.exit(0);
}

console.log(`Building ${apps.length} MCP Apps: ${apps.join(", ")}`);

for (const appName of apps) {
  const input = join(APPS_DIR, appName, "app.html");
  const tempOut = join(TEMP_DIR, appName);
  console.log(`  Building ${appName}...`);
  try {
    // Build to temp dir to avoid Vite's nested path structure
    execSync(
      `npx vite build --config vite.config.ts --outDir "${tempOut}" --emptyOutDir`,
      {
        cwd: ROOT,
        env: { ...process.env, INPUT: input },
        stdio: "pipe",
      },
    );
    // Move the built app.html to dist/apps/<name>.html
    const builtPath = join(tempOut, "apps", appName, "app.html");
    const altPath = join(tempOut, "app.html");
    const sourcePath = existsSync(builtPath) ? builtPath : altPath;

    if (!existsSync(sourcePath)) {
      // Search for any .html file in the temp dir
      const found = findHtml(tempOut);
      if (found) {
        renameSync(found, join(OUT_DIR, `${appName}.html`));
      } else {
        throw new Error(`No HTML output found in ${tempOut}`);
      }
    } else {
      renameSync(sourcePath, join(OUT_DIR, `${appName}.html`));
    }
    console.log(`  ok ${appName}`);
  } catch (err) {
    const msg = err instanceof Error && "stderr" in err ? (err as { stderr: Buffer }).stderr.toString() : String(err);
    console.error(`  FAIL ${appName}: ${msg}`);
    process.exit(1);
  }
}

// Clean up temp dir
try { rmSync(TEMP_DIR, { recursive: true, force: true }); } catch { /* ignore */ }

console.log(`\nAll ${apps.length} apps built to dist/apps/`);

/** Recursively find the first .html file in a directory */
function findHtml(dir: string): string | null {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isFile() && entry.name.endsWith(".html")) return fullPath;
    if (entry.isDirectory()) {
      const found = findHtml(fullPath);
      if (found) return found;
    }
  }
  return null;
}
