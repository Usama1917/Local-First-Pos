import { execFile } from "child_process";

/**
 * Opens a NATIVE folder-picker dialog ON THE SERVER MACHINE and resolves to the
 * chosen absolute path (empty string if the user cancels). This works because the
 * app is local-first: the API server runs on the same shop PC as the browser, so
 * the dialog appears in front of the user. Returns "" (not an error) on cancel.
 */
export function pickFolder(): Promise<string> {
  return new Promise((resolve, reject) => {
    let cmd: string;
    let args: string[];

    if (process.platform === "win32") {
      cmd = "powershell";
      args = [
        "-NoProfile",
        "-STA",
        "-Command",
        "Add-Type -AssemblyName System.Windows.Forms | Out-Null; " +
          "$f = New-Object System.Windows.Forms.FolderBrowserDialog; " +
          "$f.Description = 'اختر المجلد'; " +
          "$f.ShowNewFolderButton = $true; " +
          "if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($f.SelectedPath) }",
      ];
    } else if (process.platform === "darwin") {
      cmd = "osascript";
      args = ["-e", 'POSIX path of (choose folder with prompt "اختر المجلد")'];
    } else {
      cmd = "zenity";
      args = ["--file-selection", "--directory", "--title=اختر المجلد"];
    }

    execFile(cmd, args, { timeout: 180000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      const out = (stdout || "").trim();
      // Cancel → tools exit non-zero with empty output; treat as a clean cancel.
      if (err && !out) return resolve("");
      // A genuine launch failure (e.g. command not found) with no output.
      if (err && (err as any).code === "ENOENT") return reject(new Error("تعذّر فتح نافذة التصفّح على هذا الجهاز"));
      resolve(out);
    });
  });
}
