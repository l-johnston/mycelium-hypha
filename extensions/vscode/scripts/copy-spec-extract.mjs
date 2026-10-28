import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(scriptDirectory, "../../../tools/spec-extract");
const destination = path.resolve(scriptDirectory, "../out/resources/spec-extract");

await mkdir(path.dirname(destination), { recursive: true });
await cp(source, destination, {
  recursive: true,
  filter: (sourcePath) => {
    const relative = path.relative(source, sourcePath);
    return relative === "" ||
      relative === "README.md" ||
      relative === "pyproject.toml" ||
      relative === "uv.lock" ||
      relative === "src" ||
      relative.startsWith(`src${path.sep}`);
  }
});
