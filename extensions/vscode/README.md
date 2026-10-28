# Hypha VS Code extension feasibility spike

This prototype tests whether one VS Code Marketplace extension can contribute a Copilot
language-model tool, provision the self-contained Hypha CLI, and fetch/generate a release in
extension-global storage. Release management is an early slice; switching and removing releases are
not yet exposed as extension commands.

The CLI download currently supports Windows x64, Linux x64, and macOS x64/arm64. Web VS Code and
other extension-host architectures are not supported by this prototype.

The extension reads:

```text
<ExtensionContext.globalStorageUri>/knowledge/versions.json
```

The storage root belongs to this extension installation on the current VS Code extension host. It is
shared by workspaces in that host, but is not synchronized to other machines or hosts. The Hypha CLI
uses this storage root as its `--repository-root`. The CLI is pinned at `1.4.0`, downloaded
from the project's GitHub release, and verified against the SHA256 in the release notes before being
run. The extension also packages the Apache-2.0 specification extraction code (not the OMG PDFs) so
the CLI can extract locally fetched specification PDFs from this global data root.

## Run the prototype

1. Install Node.js and npm, then run `npm install` in this directory.
2. Run `npm test` to type-check the extension and test release-manifest parsing.
3. Open this directory in VS Code and press **F5** to launch an Extension Development Host.
4. Run **Hypha: Show Installed Releases** from the Command Palette. The Hypha output channel displays
   the global storage URI.
5. In that storage directory, create `knowledge/versions.json` with a local-only test manifest, for
   example:

   ```json
   {
     "schemaVersion": "1.0.0",
     "default": "2026-09",
     "versions": [{ "tag": "2026-09" }]
   }
   ```

6. Run **Hypha: Show Installed Releases** again, then ask Copilot to check which Hypha release is
   recorded as installed. Enable **Hypha Release Status** in the Chat tools picker if it is not
   already enabled. The tool reads the same manifest without consulting the open workspace.
7. Run **Hypha: Check Available Releases** to check installed releases and read-only GitHub tag
   catalogs. This check does not provision the CLI or write release data.
8. Run **Hypha: Install a SysML v2 Release**, choose a release, and confirm the fetch/generate
   operation. Inputs and generated output are written under extension-global storage, not the
   modeling workspace. The command displays progress and summarizes which core knowledge artifacts
   and normative specification text are present afterward.

The synthetic manifest in step 5 is only for testing status; it does not represent a complete
installation. The extension does not include copyrighted specification text or source artifacts.
The CLI fetches those materials locally after the user confirms installation. The CLI itself is
packaged as a verified release download and not embedded in the extension.
