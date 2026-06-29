import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";

// Locate an installed Chromium-based browser (Edge ships with Windows). We drive
// it headless to print HTML → PDF, which renders Arabic/RTL correctly with zero
// bundled dependencies (no Chromium download at install time).
function findBrowser(): string | null {
  const win = process.env;
  const candidates =
    process.platform === "win32"
      ? [
          win.LOCALAPPDATA && path.join(win.LOCALAPPDATA, "Microsoft/Edge/Application/msedge.exe"),
          "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
          "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
          "C:/Program Files/Google/Chrome/Application/chrome.exe",
          "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
          win.LOCALAPPDATA && path.join(win.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
          ]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/usr/bin/microsoft-edge",
          ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

export function browserAvailable(): boolean {
  return !!findBrowser();
}

/**
 * Render an HTML string to a PDF at outPath using the headless system browser.
 *
 * Modern Chrome/Edge headless does NOT reliably exit after --print-to-pdf, so we
 * don't wait for process exit. Instead we poll for the output file to appear and
 * stabilize, then kill the browser. Robust across browser versions and platforms.
 */
export function htmlToPdf(html: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const browser = findBrowser();
    if (!browser) return reject(new Error("لم يتم العثور على متصفح (Edge/Chrome) لإنشاء PDF"));

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    try { fs.unlinkSync(outPath); } catch {} // remove any stale file so we detect the fresh write
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    const tmpHtml = path.join(os.tmpdir(), `pos-doc-${stamp}.html`);
    const tmpProfile = path.join(os.tmpdir(), `pos-pdf-profile-${stamp}`);
    fs.writeFileSync(tmpHtml, html, "utf8");

    const args = [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--no-pdf-header-footer",
      `--user-data-dir=${tmpProfile}`,
      `--print-to-pdf=${outPath}`,
      // pathToFileURL yields a valid file:///C:/... URL on Windows (raw `file://` + a
      // backslash drive path is not a loadable URL) and encodes spaces/special chars.
      pathToFileURL(tmpHtml).href,
    ];

    const child = spawn(browser, args, { stdio: "ignore" });
    let settled = false;
    let lastSize = -1;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(deadline);
      try { child.kill("SIGKILL"); } catch {}
      try { fs.unlinkSync(tmpHtml); } catch {}
      try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch {}
      err ? reject(err) : resolve();
    };

    // Resolve once the PDF exists and its size is stable across two polls.
    const poll = setInterval(() => {
      try {
        const sz = fs.statSync(outPath).size;
        if (sz > 0 && sz === lastSize) return finish();
        lastSize = sz;
      } catch { /* not written yet */ }
    }, 250);

    const deadline = setTimeout(
      () => finish(fs.existsSync(outPath) ? undefined : new Error("انتهت مهلة إنشاء PDF")),
      30_000,
    );

    child.on("error", (err) => finish(err));
    child.on("close", () => { if (fs.existsSync(outPath)) finish(); });
  });
}
