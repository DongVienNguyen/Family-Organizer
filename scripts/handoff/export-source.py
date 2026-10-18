#!/usr/bin/env python3
"""Cloud-side source handoff utility; no Python required on the receiving PC.

Reads committed blobs only. Does not delete files or alter the source checkout.
The output directory must be new and outside the repository.
"""

import argparse
import hashlib
import json
import pathlib
import re
import subprocess
import zipfile


ROOT_FILES = {
    ".env.example", ".gitattributes", ".gitignore", ".node-version",
    "README.md", "CLAUDE.md", "DESIGN.md", "CHANGELOG.md", "metadata.json",
    "package.json", "package-lock.json", "server.ts", "index.html",
    "tsconfig.json", "vite.config.ts",
}
SCRIPTS = {
    "scripts/clean.mjs", "scripts/migrate-data.mjs",
    "scripts/release-disabled.mjs", "scripts/release-notes.mjs",
    "scripts/lib/native-paths.mjs",
}


def selected(name):
    parts = pathlib.PurePosixPath(name).parts
    if any(part in {"tests", "__tests__", "fixtures", "__fixtures__", "node_modules"} for part in parts):
        return False
    if re.search(r"\.(test|spec)\.", name, flags=re.IGNORECASE):
        return False
    if name in ROOT_FILES or name in SCRIPTS:
        return True
    if name.startswith(("src/", "server/", "public/")):
        return True
    if name.startswith("scripts/windows/licenses/"):
        return True
    if name.startswith("docs/engineering/evidence/"):
        return False
    if name.startswith(("docs/superpowers/", "docs/engineering/", "docs/handoff/", "docs/productivity/", "docs/wallet/")):
        return name.endswith(".md") or name == "docs/engineering/windows-toolchain.json"
    return False


PC_AGENTS = """# Family-Organizer — PC source handoff

- This source-only snapshot was requested by the owner on 2026-10-18.
  Local Windows PC development supersedes earlier Cloud-only workflow instructions.
- Read START-HERE-PC.md, SOURCE-MANIFEST.json, CLAUDE.md, DESIGN.md and
  docs/superpowers/plans/2026-10-18-pc-continuation.md before editing.
- This is partial W15 work, not a fully accepted release. Full tests/reports and
  history remain on codex/feature-first-acceptance; source SHA is in the manifest.
- Do not fetch the entire test corpus/reports or browser binaries onto the PC.
  Do not claim missing tests passed. Preserve pinned package.json/package-lock.json;
  React/Vite build needs devDependencies. Use npm.cmd and immediate LASTEXITCODE checks.
- Use synthetic local storage and offline providers only. Keep I01 atomic writes,
  exact Money, idempotency/revisions, current ACL/media/SSE and original attribution.
- Prioritize feature completion and focused checks; full tests and exact-HEAD Windows
  qualification run on the full branch before integration. PC is not a CI runner.
- Never merge this filtered snapshot into main/full Cloud: apply selected source/docs
  diffs instead, preserving tests/workflows/evidence there. Do not push main directly.
- No release/tag, VPS access/deployment, Docker/WSL/GHCR runtime, public integration
  API/tokens/MCP/bank sync. Server2019 acceptance remains R02.
- The original Cloud instructions are retained in docs/handoff/original-cloud-AGENTS.md.
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--revision", default="HEAD")
    parser.add_argument("--output-directory", required=True)
    args = parser.parse_args()
    repo = pathlib.Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
    revision = subprocess.check_output(["git", "rev-parse", "--verify", args.revision + "^{commit}"], cwd=repo, text=True).strip()
    destination = pathlib.Path(args.output_directory).resolve()
    if destination == repo or repo in destination.parents:
        raise SystemExit("Output must be outside the repository")
    destination.mkdir(parents=True, exist_ok=False)
    staging = destination / "Family-Organizer-PC"
    staging.mkdir()
    listing = subprocess.check_output(["git", "ls-tree", "-r", "-z", revision], cwd=repo).split(b"\0")
    source = {}
    excluded_count = 0
    for line in listing:
        if not line:
            continue
        metadata, encoded_name = line.split(b"\t", 1)
        mode, kind, object_id = metadata.decode().split()
        name = encoded_name.decode("utf-8")
        if selected(name) or name == "AGENTS.md":
            if mode != "100644" and mode != "100755":
                raise SystemExit("Refusing non-regular source entry: " + name)
            source[name] = object_id
        else:
            excluded_count += 1
    files = {}
    batch = subprocess.Popen(["git", "cat-file", "--batch"], cwd=repo, stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    try:
        for name, object_id in sorted(source.items()):
            batch.stdin.write((object_id + "\n").encode())
            batch.stdin.flush()
            header = batch.stdout.readline().split()
            if len(header) != 3 or header[1] != b"blob":
                raise RuntimeError("Cannot read source blob: " + name)
            size = int(header[2])
            chunks = bytearray()
            while len(chunks) < size:
                block = batch.stdout.read(size - len(chunks))
                if not block:
                    raise RuntimeError("Truncated source blob: " + name)
                chunks.extend(block)
            if batch.stdout.read(1) != b"\n":
                raise RuntimeError("Malformed blob boundary")
            files[name] = bytes(chunks)
    finally:
        batch.stdin.close()
        batch.wait()
    if batch.returncode:
        raise SystemExit("git cat-file failed")
    files["docs/handoff/original-cloud-AGENTS.md"] = files["AGENTS.md"]
    files["AGENTS.md"] = PC_AGENTS.encode()
    files["START-HERE-PC.md"] = files["docs/handoff/START-HERE-PC.md"]
    prohibited = [name for name in files if not selected(name) and name not in {"AGENTS.md", "START-HERE-PC.md"}]
    if prohibited:
        raise SystemExit("Unexpected export entries: " + repr(prohibited))
    manifest = {
        "format": 1,
        "purpose": "Windows PC source-only development handoff; not a production release",
        "sourceRepository": "https://github.com/DongVienNguyen/Family-Organizer",
        "fullSourceBranch": "codex/feature-first-acceptance",
        "sourceCommit": revision,
        "sourceCommitUrl": "https://github.com/DongVienNguyen/Family-Organizer/commit/" + revision,
        "pcSnapshotBranch": "codex/pc-source-only-2026-10-18",
        "status": "W15 WIP; master plan, current-source Windows and Server2019 acceptance incomplete",
        "lastFullCloudSuiteSource": "29f7b30a8f61ec739938e63a922a5a882055ca23",
        "runtime": {"node": "24.21.0", "npm": "11.19.0", "better-sqlite3": "13.0.3", "architecture": "x64"},
        "excluded": ["tests and fixtures including colocated *.test.* / *.spec.*", "CI workflows and test configs/harnesses", "raw reports/screenshots/traces", ".git history", "node_modules and browser binaries", "build outputs", "runtime data/uploads/backups/secrets", "legacy Docker/Pi deployment files and README screenshots"],
        "transformations": ["AGENTS.md replaced with PC handoff instructions; full original retained at docs/handoff/original-cloud-AGENTS.md", "docs/handoff/START-HERE-PC.md also copied to root START-HERE-PC.md"],
        "excludedTrackedFileCount": excluded_count,
        "files": [{"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()} for name, data in sorted(files.items())],
        "manifestHashScope": "files includes every payload file except this manifest itself; ZIP SHA256 is in adjacent .sha256 file",
    }
    files["SOURCE-MANIFEST.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
    archive = destination / "Family-Organizer-PC-source.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zipped:
        for name, data in sorted(files.items()):
            target = staging / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            info = zipfile.ZipInfo("Family-Organizer-PC/" + name, date_time=(2026, 10, 18, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            zipped.writestr(info, data)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (destination / (archive.name + ".sha256")).write_text(digest + "  " + archive.name + "\n")
    print(json.dumps({"sourceCommit": revision, "files": len(files), "sourceBytes": sum(map(len, files.values())), "zipBytes": archive.stat().st_size, "zipSha256": digest, "zip": str(archive), "staging": str(staging)}, indent=2))


if __name__ == "__main__":
    main()
