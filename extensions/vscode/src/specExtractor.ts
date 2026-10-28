import { access, cp, mkdir } from "node:fs/promises";
import path from "node:path";
import * as vscode from "vscode";

export async function provisionSpecExtractor(
  extensionUri: vscode.Uri,
  globalStorageUri: vscode.Uri
): Promise<void> {
  const source = path.join(extensionUri.fsPath, "out", "resources", "spec-extract");
  const destination = path.join(globalStorageUri.fsPath, "tools", "spec-extract");

  try {
    await access(path.join(source, "pyproject.toml"));
    await access(path.join(source, "src", "spec_extract"));
  } catch (error) {
    throw new Error("The extension package does not contain its specification extractor runtime.", { cause: error });
  }

  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
}
