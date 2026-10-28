import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, chmod, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import * as vscode from "vscode";
import yauzl from "yauzl";

import { findChecksum } from "./releaseCheck";

export const cliVersion = "1.4.0";
const repository = "mycelium-cmbse/mycelium-hypha";
const maxArchiveBytes = 300 * 1024 * 1024;
const maxExtractedBytes = 600 * 1024 * 1024;

export function cliRid(): string {
  if (process.platform === "win32" && process.arch === "x64") {
    return "win-x64";
  }
  if (process.platform === "linux" && process.arch === "x64") {
    return "linux-x64";
  }
  if (process.platform === "darwin" && process.arch === "x64") {
    return "osx-x64";
  }
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "osx-arm64";
  }

  throw new Error(`Hypha does not currently provide a CLI for ${process.platform}-${process.arch}.`);
}

export async function ensureCli(
  storagePath: string,
  output: vscode.OutputChannel,
  token: vscode.CancellationToken
): Promise<string> {
  if (token.isCancellationRequested) {
    throw new Error("The Hypha CLI download was cancelled before it started.");
  }

  const rid = cliRid();
  const directory = path.join(storagePath, "bin", cliVersion, rid);
  const executable = path.join(directory, process.platform === "win32" ? "hypha.exe" : "hypha");
  const marker = path.join(directory, ".ok");

  try {
    await Promise.all([access(executable), access(marker)]);
    return executable;
  } catch {
    output.appendLine(`Provisioning Hypha CLI ${cliVersion} for ${rid}.`);
  }

  const controller = new AbortController();
  const cancellation = token.onCancellationRequested(() => controller.abort());
  const assetName = `hypha-${cliVersion}-${rid}.zip`;
  const archivePath = path.join(directory, `${assetName}.download`);

  try {
    const releaseResponse = await fetch(
      `https://api.github.com/repos/${repository}/releases/tags/tools-v${cliVersion}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "mycelium-hypha-vscode"
        },
        signal: controller.signal
      }
    );

    if (!releaseResponse.ok) {
      throw new Error(`GitHub release lookup failed (${releaseResponse.status} ${releaseResponse.statusText}).`);
    }

    const release: unknown = await releaseResponse.json();
    if (!isRecord(release) || !Array.isArray(release.assets) || typeof release.body !== "string") {
      throw new Error("GitHub returned an unexpected release response.");
    }

    const asset = release.assets.find(
      (candidate: unknown) =>
        isRecord(candidate) &&
        candidate.name === assetName &&
        typeof candidate.browser_download_url === "string"
    );
    if (!isRecord(asset) || typeof asset.browser_download_url !== "string") {
      throw new Error(`The tools-v${cliVersion} release does not contain ${assetName}.`);
    }

    const expectedHash = findChecksum(release.body, assetName);
    if (expectedHash === null) {
      throw new Error(`The tools-v${cliVersion} release notes do not contain a SHA256 checksum for ${assetName}.`);
    }

    const downloadUrl = new URL(asset.browser_download_url);
    if (downloadUrl.protocol !== "https:" || downloadUrl.hostname !== "github.com") {
      throw new Error("The CLI download URL is not a trusted GitHub HTTPS URL.");
    }

    const archiveResponse = await fetch(downloadUrl, { signal: controller.signal });
    if (!archiveResponse.ok) {
      throw new Error(`CLI archive download failed (${archiveResponse.status} ${archiveResponse.statusText}).`);
    }

    const archive = Buffer.from(await archiveResponse.arrayBuffer());
    if (archive.length > maxArchiveBytes) {
      throw new Error(`The CLI archive exceeds the ${maxArchiveBytes} byte safety limit.`);
    }

    const actualHash = createHash("sha256").update(archive).digest("hex");
    if (actualHash !== expectedHash) {
      throw new Error(`The downloaded CLI archive failed SHA256 verification for ${assetName}.`);
    }

    await mkdir(directory, { recursive: true });
    await writeFile(archivePath, archive);
    await rm(executable, { force: true });
    await extractArchive(archivePath, directory);

    if (process.platform !== "win32") {
      await chmod(executable, 0o755);
    }

    await access(executable);
    await writeFile(marker, `${expectedHash}\n`, "utf8");
    output.appendLine(`Verified and installed Hypha CLI ${cliVersion} at ${executable}.`);
    return executable;
  } catch (error) {
    await rm(archivePath, { force: true });
    await rm(marker, { force: true });
    throw error;
  } finally {
    cancellation.dispose();
    controller.abort();
    await rm(archivePath, { force: true });
  }
}

export async function runCli(
  executable: string,
  storagePath: string,
  args: string[],
  output: vscode.OutputChannel,
  token: vscode.CancellationToken
): Promise<string> {
  if (token.isCancellationRequested) {
    throw new Error("The Hypha CLI operation was cancelled before it started.");
  }

  return new Promise<string>((resolve, reject) => {
    const child = spawn(
      executable,
      [...args, "--repository-root", storagePath, "--no-logo"],
      { cwd: storagePath, windowsHide: true }
    );
    let stdout = "";
    let settled = false;

    const cancellation = token.onCancellationRequested(() => {
      child.kill();
    });

    const fail = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      cancellation.dispose();
      reject(error);
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output.append(chunk);
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => output.append(chunk));
    child.on("error", (error) => fail(new Error(`Could not start the Hypha CLI: ${error.message}`, { cause: error })));
    child.on("close", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      cancellation.dispose();

      if (token.isCancellationRequested) {
        reject(new Error("The Hypha CLI operation was cancelled. Any downloaded inputs remain local and can be reused on retry."));
      } else if (code !== 0) {
        reject(new Error(`The Hypha CLI exited with code ${code ?? `after signal ${signal ?? "unknown"}`}. See the Hypha output channel for details.`));
      } else {
        resolve(stdout);
      }
    });
  });
}

async function extractArchive(archivePath: string, destination: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    yauzl.open(
      archivePath,
      { lazyEntries: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: true },
      (error, zipFile) => {
        if (error || !zipFile) {
          reject(new Error(`Could not open the verified CLI archive: ${error?.message ?? "unknown error"}`, { cause: error }));
          return;
        }

        let extractedBytes = 0;
        let settled = false;
        const fail = (cause: Error) => {
          if (!settled) {
            settled = true;
            zipFile.close();
            reject(cause);
          }
        };

        zipFile.on("error", fail);
        zipFile.on("end", () => {
          if (!settled) {
            settled = true;
            resolve();
          }
        });
        zipFile.on("entry", (entry) => {
          void (async () => {
            if (entry.fileName.includes("\\") || path.posix.isAbsolute(entry.fileName)) {
              throw new Error(`The CLI archive contains an unsafe path: ${entry.fileName}`);
            }

            const parts = String(entry.fileName).split("/");
            if (parts.some((part) => part === ".." || part === ".")) {
              throw new Error(`The CLI archive contains an unsafe path: ${entry.fileName}`);
            }

            const destinationPath = path.resolve(destination, ...parts);
            const relativePath = path.relative(destination, destinationPath);
            if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
              throw new Error(`The CLI archive contains an unsafe path: ${entry.fileName}`);
            }

            const unixMode = entry.externalFileAttributes >>> 16;
            if ((unixMode & 0o170000) === 0o120000) {
              throw new Error(`The CLI archive contains an unexpected symbolic link: ${entry.fileName}`);
            }

            if (entry.fileName.endsWith("/")) {
              await mkdir(destinationPath, { recursive: true });
              zipFile.readEntry();
              return;
            }

            extractedBytes += entry.uncompressedSize;
            if (extractedBytes > maxExtractedBytes) {
              throw new Error(`The CLI archive exceeds the ${maxExtractedBytes} byte extraction safety limit.`);
            }

            await mkdir(path.dirname(destinationPath), { recursive: true });
            await new Promise<void>((streamResolve, streamReject) => {
              zipFile.openReadStream(entry, (streamError, readStream) => {
                if (streamError || !readStream) {
                  streamReject(new Error(`Could not read ${entry.fileName} from the CLI archive.`, { cause: streamError }));
                  return;
                }

                void pipeline(readStream, createWriteStream(destinationPath))
                  .then(streamResolve)
                  .catch(streamReject);
              });
            });
            zipFile.readEntry();
          })().catch((cause: unknown) => {
            fail(cause instanceof Error ? cause : new Error(String(cause)));
          });
        });
        zipFile.readEntry();
      }
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
