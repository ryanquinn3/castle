#!/usr/bin/env -S uv run --no-project --quiet --script
# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""PreToolUse(Bash) guard.

Designed for a `Bash(*)` allow world: permissions let everything through, and
THIS hook is the safety net. It returns one of three verdicts per command:

  deny  -> hard block, command never runs (things that are never legitimate here)
  ask   -> fall back to a confirmation prompt (legit but consequential)
  allow -> stay silent, normal permission flow runs it (everything else)

Verdicts are decided by RULES, evaluated top to bottom; the FIRST match wins, so
deny rules are listed before ask rules. To add a rule: drop a (decision, name,
check_fn, reason) tuple into RULES at the right precedence. `check_fn(cmds, raw)`
gets the parsed command (see parse()) plus the raw string and returns True to fire.

Parsing model: `cmds` is a list of top-level commands (split on && || ; newline);
each is a pipeline (split on |); each stage is a list of shell tokens with leading
env-assignments / `sudo`-style wrappers already stripped by leading_cmd().
Stage 0 of a pipeline is NOT pipe-fed; later stages consume piped output (so
`cmd | grep x` is fine but a leading `grep x file` is a file search).
"""

from __future__ import annotations

import json
import os
import re
import shlex
import sys

# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

_PREFIXES = {"command", "nice", "nohup", "time", "env", "builtin", "exec", "xargs"}
_ENV_ASSIGN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")


def leading_cmd(stage: list[str]) -> tuple[str, list[str]]:
    """(executable, args) for a stage, skipping env-assignments and wrappers."""
    i = 0
    while i < len(stage) and (_ENV_ASSIGN.match(stage[i]) or stage[i] in _PREFIXES):
        i += 1
    if i >= len(stage):
        return "", []
    return stage[i], stage[i + 1 :]


def has_file_arg(args: list[str]) -> bool:
    for a in args:
        if a.startswith("-") or a in (">", ">>", "<", "|"):
            continue
        if re.fullmatch(r"\+?\d+", a):  # `tail -20` numeric
            continue
        return True
    return False


def parse(command: str) -> list[list[list[str]]]:
    head = command.split("<<", 1)[0] if "<<" in command else command
    commands: list[list[list[str]]] = []
    for chunk in re.split(r"&&|\|\||;|\n", head):
        chunk = chunk.strip()
        if not chunk:
            continue
        stages: list[list[str]] = []
        for stage in chunk.split("|"):
            stage = stage.strip()
            if not stage:
                continue
            try:
                stages.append(shlex.split(stage))
            except ValueError:
                stages.append(stage.split())
        if stages:
            commands.append(stages)
    return commands


def leading_stages(cmds):
    """Leading (non-pipe-fed) stage of each top-level command."""
    for pipeline in cmds:
        if pipeline:
            yield pipeline[0]


def all_stages(cmds):
    for pipeline in cmds:
        yield from pipeline


def git_invocations(cmds):
    """Yield (subcommand, args) for every git stage. args excludes the subcommand."""
    for stage in all_stages(cmds):
        exe, rest = leading_cmd(stage)
        if exe != "git":
            continue
        sub = ""
        sub_args = rest
        for idx, tok in enumerate(rest):
            if not tok.startswith("-"):
                sub = tok
                sub_args = rest[idx + 1 :]
                break
        yield sub, sub_args


# ---------------------------------------------------------------------------
# Shared data
# ---------------------------------------------------------------------------

_SHELLS = r"(?:ba|z|da|fi|a)?sh"
_DATA_ACCESS = {"cat", "head", "tail", "less", "more", "grep", "egrep", "fgrep",
                "rg", "cp", "scp", "rsync", "curl", "wget", "tee", "strings",
                "xxd", "od", "base64", "openssl", "dd"}
_NET = {"curl", "wget", "nc", "ncat", "netcat", "telnet", "ssh", "scp", "sftp", "rsync"}
_INSTALLERS = {
    "npm": {"install", "i", "ci", "add"},
    "pnpm": {"install", "i", "add"},
    "yarn": {"add", "install"},
    "bun": {"add", "install", "i"},
    "pip": {"install"},
    "pip3": {"install"},
    "uv": {"add", "pip"},
    "cargo": {"install"},
    "gem": {"install"},
    "go": {"install"},
    "brew": {"install"},
    "apt": {"install"},
    "apt-get": {"install"},
}

_SENSITIVE_PATH = [
    re.compile(r"\.ssh/(id_|identity)", re.I),
    re.compile(r"\.aws/credentials", re.I),
    re.compile(r"(^|/)\.netrc\b", re.I),
    re.compile(r"\.config/gh/hosts\.yml", re.I),
    re.compile(r"(^|/)\.env(\.|$|\b)(?!example|sample)", re.I),
    re.compile(r"/Cookies(\b|$)|cookies\.sqlite|Login Data", re.I),
    re.compile(r"\.kube/config|\.docker/config\.json|\.npmrc|\.pypirc", re.I),
]
_DANGEROUS_RM_TARGETS = {"/", "/*", "~", "~/", "$HOME", "${HOME}", "/.", "/*/"}

# ---------------------------------------------------------------------------
# DENY checks (never legitimate here)
# ---------------------------------------------------------------------------


def remote_exec(cmds, raw) -> bool:
    pats = [
        rf"\b(curl|wget|fetch)\b[^|]*\|\s*(sudo\s+)?{_SHELLS}\b",   # curl ... | sh
        rf"\b{_SHELLS}\b\s+-c\b[^\n]*\$\(\s*(curl|wget)",            # sh -c "$(curl ...)"
        r"\beval\b[^\n]*(\$\(|`)",                                    # eval "$(...)" / `...`
        rf"\b(source|\.)\s+<\([^)]*\b(curl|wget)",                   # source <(curl ...)
        rf"\bbase64\b[^|]*(-d|--decode)[^|]*\|\s*{_SHELLS}\b",       # base64 -d | sh
        rf"\|\s*(sudo\s+)?{_SHELLS}\s+-s\b",                          # ... | sh -s
    ]
    return any(re.search(p, raw, re.I) for p in pats)


def catastrophic(cmds, raw) -> bool:
    if re.search(r"\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:", raw):  # fork bomb
        return True
    if re.search(r"\bdd\b[^\n]*\bof=/dev/", raw, re.I):
        return True
    if re.search(r"\bmkfs(\.\w+)?\b", raw, re.I):
        return True
    if re.search(r">\s*/dev/(sd|disk|nvme|hd|rdisk)", raw, re.I):
        return True
    for stage in leading_stages(cmds):
        exe, args = leading_cmd(stage)
        if exe != "rm":
            continue
        flags = "".join(a for a in args if a.startswith("-"))
        targets = [a for a in args if not a.startswith("-")]
        recursive = "r" in flags or "--recursive" in args
        if "--no-preserve-root" in args:
            return True
        if recursive and any(t in _DANGEROUS_RM_TARGETS for t in targets):
            return True
    return False


def secret_read(cmds, raw) -> bool:
    if re.search(r"\bsecurity\s+(find-(generic|internet)-password|dump-keychain)", raw, re.I):
        return True
    for stage in all_stages(cmds):
        exe, args = leading_cmd(stage)
        if exe not in _DATA_ACCESS:
            continue
        for a in args:
            if any(p.search(a) for p in _SENSITIVE_PATH):
                return True
    return False


def guard_tamper(cmds, raw) -> bool:
    if not re.search(r"\.claude/(settings|hooks)", raw):
        return False
    # mutating the guard via shell (redirect, or a mutator command touching it)
    if re.search(r">>?\s*[^\s|]*\.claude/(settings|hooks)", raw):
        return True
    mutators = {"rm", "mv", "cp", "sed", "chmod", "chown", "truncate", "tee", "dd", "ln"}
    for stage in all_stages(cmds):
        exe, args = leading_cmd(stage)
        if exe in mutators and any(".claude/settings" in a or ".claude/hooks" in a for a in args):
            return True
    return False


def git_force_protected(cmds, raw) -> bool:
    for sub, args in git_invocations(cmds):
        if sub != "push":
            continue
        forced = any(a in ("-f", "--force") or a.startswith("--force-with-lease") for a in args)
        protected = any(a in ("main", "master") for a in args)
        if forced and protected:
            return True
    return False


# ---------------------------------------------------------------------------
# Tool-steering DENY checks (use the dedicated tool instead)
# ---------------------------------------------------------------------------


def heredoc_write(cmds, raw) -> bool:
    return bool(re.search(r"<<-?\s*'?[A-Za-z_]", raw)) and re.search(r">>?", raw) is not None


def cat_write(cmds, raw) -> bool:
    for pipeline in cmds:
        exe, args = leading_cmd(pipeline[0])
        if exe in ("cat", "tee") and re.search(r">>?", raw):
            return True
        if exe == "tee" and has_file_arg(args):
            return True
    return False


def file_read(cmds, raw) -> bool:
    if re.search(r">>?", raw):
        return False
    for pipeline in cmds:
        exe, args = leading_cmd(pipeline[0])
        if exe in ("cat", "head", "tail", "less", "more") and has_file_arg(args):
            return True
    return False


def file_grep(cmds, raw) -> bool:
    for pipeline in cmds:
        exe, _ = leading_cmd(pipeline[0])
        if exe in ("grep", "egrep", "fgrep", "rg", "ripgrep"):
            return True
    return False


def find_files(cmds, raw) -> bool:
    return any(leading_cmd(p[0])[0] == "find" for p in cmds)


def sed_inplace(cmds, raw) -> bool:
    for stage in all_stages(cmds):
        exe, args = leading_cmd(stage)
        if exe == "sed" and any(a == "-i" or a.startswith("-i") for a in args):
            return True
    return False


def npx(cmds, raw) -> bool:
    return any(leading_cmd(s)[0] in ("npx", "pnpx", "bunx") for s in all_stages(cmds))


# ---------------------------------------------------------------------------
# ASK checks (legitimate but consequential -> confirm)
# ---------------------------------------------------------------------------


def _project_root() -> str:
    return os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()


_DELETABLE_DIRS = ("src", ".tmp")


def _within_deletable_dir(target: str) -> bool:
    """True if `target` resolves strictly inside an allowed dir (src/ or .tmp/)."""
    if not target or target.startswith("-"):
        return False
    root = _project_root()
    resolved = os.path.realpath(os.path.join(root, os.path.expanduser(target)))
    for d in _DELETABLE_DIRS:
        base = os.path.realpath(os.path.join(root, d))
        if resolved.startswith(base + os.sep):
            return True
    return False


def _deletion_confined_to_source(args: list[str]) -> bool:
    """True when a delete has targets and every one lives inside an allowed dir.

    Deleting an allowed dir itself (or anything outside src/ or .tmp/) still asks;
    only edits strictly within those dirs are waved through silently.
    """
    targets = []
    for a in args:
        if a.startswith("-"):
            continue
        if re.fullmatch(r"\+?\d+[kKmMgG]?", a):  # size/count args (e.g. `truncate -s 0`)
            continue
        targets.append(a)
    return bool(targets) and all(_within_deletable_dir(t) for t in targets)


def destructive_fs(cmds, raw) -> bool:
    for stage in leading_stages(cmds):
        exe, args = leading_cmd(stage)
        if exe in ("rm", "rmdir", "shred", "truncate"):
            if _deletion_confined_to_source(args):
                continue  # deletions inside src/ or .tmp/ are allowed without confirmation
            return True
        if exe == "find" and "-delete" in args:
            return True
    return False


def git_destructive(cmds, raw) -> bool:
    for sub, args in git_invocations(cmds):
        if sub == "reset" and "--hard" in args:
            return True
        if sub == "clean" and any("f" in a for a in args if a.startswith("-")):
            return True
        if sub in ("checkout", "restore") and ("." in args or "--" in args or "-f" in args):
            return True
        if sub == "branch" and any(a in ("-D", "-d") for a in args):
            branches = [a for a in args if not a.startswith("-")]
            if branches and all(b.startswith("feat/") for b in branches):
                continue
            return True
        if sub == "rebase":
            return True
    return False


def git_push(cmds, raw) -> bool:
    return any(sub == "push" for sub, _ in git_invocations(cmds))


def package_install(cmds, raw) -> bool:
    for stage in all_stages(cmds):
        exe, args = leading_cmd(stage)
        subs = _INSTALLERS.get(exe)
        if not subs:
            continue
        first = next((a for a in args if not a.startswith("-")), "")
        if first in subs:
            # `uv pip install` needs the install verb too; `npm i`/`npm add` are direct
            if exe == "uv" and first == "pip":
                return "install" in args
            return True
        if any(a in ("-g", "--global") for a in args) and exe in ("npm", "pnpm", "yarn"):
            return True
    return False


def network(cmds, raw) -> bool:
    return any(leading_cmd(s)[0] in _NET for s in all_stages(cmds))


def privileged(cmds, raw) -> bool:
    if re.search(r"(^|[\s;|&])sudo\b", raw):
        return True
    sys_cmds = {"chmod", "chown", "kill", "pkill", "killall", "launchctl",
                "systemctl", "mount", "umount", "diskutil"}
    return any(leading_cmd(s)[0] in sys_cmds for s in all_stages(cmds))


def publish_deploy(cmds, raw) -> bool:
    if re.search(r"\bnpm\b[^\n]*\bpublish\b", raw):
        return True
    if re.search(r"\bgh\b[^\n]*\b(release\s+create|pr\s+(merge|create))\b", raw):
        return True
    if re.search(r"\b(vercel|netlify)\b[^\n]*\b(deploy|--prod)\b", raw, re.I):
        return True
    if re.search(r"\bdocker\b[^\n]*\bpush\b", raw):
        return True
    return False


# ---------------------------------------------------------------------------
# Rule registry — first match wins; deny before ask.
# ---------------------------------------------------------------------------

_UPLOAD_FLAGS = re.compile(r"(--data\b|--data-binary|-d\b|-F\b|--form|-T\b|--upload-file|@\S)")

RULES = [
    # --- security DENY (never legitimate) ---
    ("deny", "remote-exec", remote_exec,
     "Blocked: piping downloads into a shell / remote code execution is not allowed."),
    ("deny", "catastrophic", catastrophic,
     "Blocked: catastrophic or irreversible system destruction."),
    ("deny", "secret-read", secret_read,
     "Blocked: reading credentials/secrets (ssh keys, .env, .aws, cookies, keychain) is not allowed."),
    ("deny", "guard-tamper", guard_tamper,
     "Blocked: do not modify .claude/settings* or the hook script from bash. Use the Edit tool."),
    ("deny", "git-force-protected", git_force_protected,
     "Blocked: force-pushing to main/master. Push to a feature branch or open a PR."),

    # --- tool-steering DENY (use the dedicated tool) ---
    ("deny", "heredoc-write", heredoc_write,
     "Use the Write tool to author files, not a shell heredoc/redirect."),
    ("deny", "cat-write", cat_write,
     "Use the Write tool to create/overwrite files instead of `cat`/`tee` redirects."),
    ("deny", "file-read", file_read,
     "Use the Read tool to read a file instead of cat/head/tail/less. (Piping output through tail/head is fine.)"),
    ("deny", "file-grep", file_grep,
     "Use the Grep tool to search file contents instead of grep/rg. (Filtering piped output `cmd | grep x` is fine.)"),
    ("deny", "find", find_files,
     "Use the Glob tool to find files by name/pattern instead of `find`."),
    ("deny", "sed-inplace", sed_inplace,
     "Use the Edit tool for in-place file edits instead of `sed -i`."),
    ("deny", "npx", npx,
     "Blocked: don't use npx. Run the project's scripts via `node --run <script>` instead."),

    # --- ASK (legit but consequential) ---
    ("ask", "destructive-fs", destructive_fs,
     "Confirm: this permanently deletes/truncates files."),
    ("ask", "git-destructive", git_destructive,
     "Confirm: this discards commits or working-tree changes (reset/clean/checkout/restore/branch -D/rebase)."),
    ("ask", "git-push", git_push,
     "Confirm: pushing commits to the remote."),
    ("ask", "package-install", package_install,
     "Confirm: installs packages / modifies dependencies."),
    ("ask", "network", network,
     "Confirm: outbound network connection."),
    ("ask", "privileged", privileged,
     "Confirm: privileged or system-level operation (sudo/chmod/chown/kill/launchctl/...)."),
    ("ask", "publish-deploy", publish_deploy,
     "Confirm: publish/deploy or outward action (npm publish / gh release|pr merge / deploy)."),
]


def decide(command: str):
    cmds = parse(command)
    for decision, _name, check, reason in RULES:
        try:
            hit = check(cmds, command)
        except Exception:
            hit = False
        if hit:
            if decision == "ask" and _name == "network" and _UPLOAD_FLAGS.search(command):
                reason = "Confirm: this looks like it uploads local data to a remote host."
            return decision, reason
    return None, None


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0
    if payload.get("tool_name") != "Bash":
        return 0
    command = (payload.get("tool_input") or {}).get("command", "")
    if not command.strip():
        return 0

    decision, reason = decide(command)
    if decision in ("deny", "ask"):
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": decision,
                "permissionDecisionReason": reason,
            }
        }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
