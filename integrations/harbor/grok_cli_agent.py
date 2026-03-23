from __future__ import annotations

import json
import os
import shlex
import shutil
import tempfile
from pathlib import Path
from typing import Any

from harbor.agents.installed.base import BaseInstalledAgent, ExecInput
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext
from harbor.models.trial.paths import EnvironmentPaths

EVENT_LOG_NAME = "grok-headless.jsonl"
SUMMARY_LOG_NAME = "grok-headless-summary.json"
REMOTE_SOURCE_DIR = "/opt/grok-cli-src"
REMOTE_EVENT_LOG_PATH = str(EnvironmentPaths.agent_dir / EVENT_LOG_NAME)
INSTALL_TEMPLATE_NAME = "install-grok-cli.sh.j2"
REQUIRED_SOURCE_PATHS = ("package.json", "bun.lock", "tsconfig.json", "src")
EMBEDDED_INSTALL_TEMPLATE = """#!/usr/bin/env bash
set -euo pipefail

ensure_basic_tools() {
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y ca-certificates curl unzip
    return
  fi

  if command -v apk >/dev/null 2>&1; then
    apk add --no-cache bash ca-certificates curl unzip
    return
  fi
}

ensure_bun() {
  if command -v bun >/dev/null 2>&1; then
    return
  fi

  ensure_basic_tools
  curl -fsSL https://bun.sh/install | bash
  export PATH="${HOME}/.bun/bin:${PATH}"
  ln -sf "${HOME}/.bun/bin/bun" /usr/local/bin/bun || true
}

mkdir -p /tmp/grok-home
ensure_bun

export PATH="${HOME}/.bun/bin:${PATH}"

cd "{{ source_dir }}"
bun install --frozen-lockfile
bun run build
"""


class GrokCliInstalledAgent(BaseInstalledAgent):
    """Run the local grok-cli checkout inside a Harbor task container."""

    SUPPORTS_ATIF = False

    def __init__(self, logs_dir: Path, *args, max_tool_rounds: int | None = None, **kwargs):
        raw_max_tool_rounds = max_tool_rounds or os.environ.get("GROK_CLI_MAX_TOOL_ROUNDS", "400")
        self._max_tool_rounds = int(raw_max_tool_rounds)
        self._generated_install_template_path: Path | None = None
        super().__init__(logs_dir, *args, **kwargs)

    @staticmethod
    def name() -> str:
        return "grok-cli"

    @property
    def _install_agent_template_path(self) -> Path:
        packaged_template_path = Path(__file__).resolve().with_name(INSTALL_TEMPLATE_NAME)
        if packaged_template_path.exists():
            return packaged_template_path

        repo_template_path = self._repo_root / "integrations" / "harbor" / INSTALL_TEMPLATE_NAME
        if repo_template_path.exists():
            return repo_template_path

        return self._materialize_embedded_install_template()

    @property
    def _template_variables(self) -> dict[str, str]:
        base = super()._template_variables
        return {
            **base,
            "source_dir": REMOTE_SOURCE_DIR,
        }

    @property
    def _repo_root(self) -> Path:
        return Path(__file__).resolve().parents[2]

    def _materialize_embedded_install_template(self) -> Path:
        if self._generated_install_template_path and self._generated_install_template_path.exists():
            return self._generated_install_template_path

        template_dir = Path(tempfile.gettempdir()) / "grok-cli-harbor"
        template_dir.mkdir(parents=True, exist_ok=True)

        template_path = template_dir / INSTALL_TEMPLATE_NAME
        template_path.write_text(EMBEDDED_INSTALL_TEMPLATE)
        self._generated_install_template_path = template_path
        return template_path

    def _validate_source_bundle_inputs(self) -> None:
        missing_paths: list[str] = []
        invalid_paths: list[str] = []

        for relative_path in REQUIRED_SOURCE_PATHS:
            source = self._repo_root / relative_path
            if not source.exists():
                missing_paths.append(relative_path)
                continue
            if relative_path == "src" and not source.is_dir():
                invalid_paths.append("src (expected directory)")

        if not missing_paths and not invalid_paths:
            return

        details: list[str] = []
        if missing_paths:
            details.append(f"missing paths: {', '.join(missing_paths)}")
        if invalid_paths:
            details.append(f"invalid paths: {', '.join(invalid_paths)}")

        detail_text = "; ".join(details)
        raise FileNotFoundError(
            "grok-cli Harbor adapter could not prepare the source bundle from "
            f"{self._repo_root}: {detail_text}. Run Harbor from a full grok-cli checkout."
        )

    def _prepare_source_bundle(self) -> Path:
        self._validate_source_bundle_inputs()
        bundle_dir = Path(tempfile.mkdtemp(prefix="grok-cli-harbor-"))
        for relative_path in REQUIRED_SOURCE_PATHS:
            source = self._repo_root / relative_path
            target = bundle_dir / relative_path
            if source.is_dir():
                shutil.copytree(source, target, dirs_exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)
        return bundle_dir

    async def setup(self, environment: BaseEnvironment) -> None:
        source_bundle = self._prepare_source_bundle()
        try:
            await environment.exec(
                command=f"rm -rf {shlex.quote(REMOTE_SOURCE_DIR)} && mkdir -p {shlex.quote(REMOTE_SOURCE_DIR)}"
            )
            await environment.upload_dir(source_bundle, REMOTE_SOURCE_DIR)
            await super().setup(environment)
        finally:
            shutil.rmtree(source_bundle, ignore_errors=True)

    def _build_runtime_env(self) -> dict[str, str]:
        env: dict[str, str] = {
            "HOME": "/tmp/grok-home",
            "CI": "1",
            "NO_COLOR": "1",
            "GROK_BENCHMARK": "1",
            "GROK_DISABLE_SEARCH_TOOLS": "1",
        }

        for key in ("GROK_API_KEY", "GROK_BASE_URL", "GROK_MAX_TOKENS"):
            value = os.environ.get(key)
            if value:
                env[key] = value

        if self.model_name:
            env["GROK_MODEL"] = self.model_name

        return env

    def create_run_agent_commands(self, instruction: str) -> list[ExecInput]:
        parts = [
            "bun",
            shlex.quote(f"{REMOTE_SOURCE_DIR}/dist/index.js"),
            "--prompt",
            shlex.quote(instruction),
            "--format",
            "json",
            "--output-file",
            shlex.quote(REMOTE_EVENT_LOG_PATH),
            "--benchmark",
            "--max-tool-rounds",
            str(self._max_tool_rounds),
        ]

        if self.model_name:
            parts.extend(["--model", shlex.quote(self.model_name)])

        return [
            ExecInput(
                command=" ".join(parts),
                env=self._build_runtime_env(),
            )
        ]

    def populate_context_post_run(self, context: AgentContext) -> None:
        summary = self._build_summary()
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        (self.logs_dir / SUMMARY_LOG_NAME).write_text(json.dumps(summary, indent=2) + "\n")

        usage = summary.get("usage", {})
        input_tokens = usage.get("input_tokens")
        output_tokens = usage.get("output_tokens")
        if input_tokens is not None:
            context.n_input_tokens = int(input_tokens)
        if output_tokens is not None:
            context.n_output_tokens = int(output_tokens)

        context.metadata = {"grok_cli": summary}

    def _build_summary(self) -> dict[str, Any]:
        event_log_path = self.logs_dir / EVENT_LOG_NAME
        exit_code = self._read_command_exit_code()
        stdout_tail = self._read_text_file(self.logs_dir / "command-0" / "stdout.txt")
        stderr_tail = self._read_text_file(self.logs_dir / "command-0" / "stderr.txt")

        if not event_log_path.exists():
            return {
                "agent": self.name(),
                "model": self.model_name,
                "success": exit_code == 0 if exit_code is not None else False,
                "exit_code": exit_code,
                "error_count": 1,
                "errors": ["Missing headless event log."],
                "step_count": 0,
                "tool_call_count": 0,
                "last_step_number": -1,
                "usage": {
                    "input_tokens": None,
                    "output_tokens": None,
                    "total_tokens": None,
                },
                "stdout_tail": stdout_tail,
                "stderr_tail": stderr_tail,
                "event_log": EVENT_LOG_NAME,
            }

        events: list[dict[str, Any]] = []
        parse_errors: list[str] = []
        for line_number, raw_line in enumerate(event_log_path.read_text().splitlines(), start=1):
            line = raw_line.strip()
            if not line:
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError as exc:
                parse_errors.append(f"line {line_number}: {exc.msg}")
                continue
            if isinstance(payload, dict):
                events.append(payload)
            else:
                parse_errors.append(f"line {line_number}: expected object event")

        usage_totals = {
            "input_tokens": self._sum_usage_value(events, "inputTokens"),
            "output_tokens": self._sum_usage_value(events, "outputTokens"),
            "total_tokens": self._sum_usage_value(events, "totalTokens"),
        }
        run_finish = next((event for event in reversed(events) if event.get("type") == "run_finish"), None)
        errors = [str(event.get("message", "")) for event in events if event.get("type") == "error"]
        success = bool(run_finish.get("success")) if isinstance(run_finish, dict) else exit_code == 0 and not errors

        return {
            "agent": self.name(),
            "model": self.model_name,
            "session_id": self._first_non_empty(events, "sessionID"),
            "success": success,
            "exit_code": run_finish.get("exitCode") if isinstance(run_finish, dict) else exit_code,
            "error_count": len(errors),
            "errors": errors,
            "parse_errors": parse_errors,
            "step_count": sum(1 for event in events if event.get("type") == "step_finish"),
            "tool_call_count": sum(1 for event in events if event.get("type") == "tool_use"),
            "last_step_number": self._max_step_number(events),
            "usage": usage_totals,
            "event_count": len(events),
            "event_log": EVENT_LOG_NAME,
            "run_finish": run_finish,
            "stdout_tail": stdout_tail,
            "stderr_tail": stderr_tail,
        }

    @staticmethod
    def _read_text_file(path: Path) -> str | None:
        if not path.exists():
            return None
        text = path.read_text().strip()
        if not text:
            return None
        return text[-4000:]

    def _read_command_exit_code(self) -> int | None:
        path = self.logs_dir / "command-0" / "return-code.txt"
        if not path.exists():
            return None
        raw_value = path.read_text().strip()
        if not raw_value:
            return None
        try:
            return int(raw_value)
        except ValueError:
            return None

    @staticmethod
    def _sum_usage_value(events: list[dict[str, Any]], key: str) -> int | None:
        total = 0
        seen_value = False
        for event in events:
            usage = event.get("usage")
            if not isinstance(usage, dict):
                continue
            value = usage.get(key)
            if isinstance(value, int):
                total += value
                seen_value = True
        return total if seen_value else None

    @staticmethod
    def _first_non_empty(events: list[dict[str, Any]], key: str) -> str | None:
        for event in events:
            value = event.get(key)
            if isinstance(value, str) and value:
                return value
        return None

    @staticmethod
    def _max_step_number(events: list[dict[str, Any]]) -> int:
        max_step = -1
        for event in events:
            step_number = event.get("stepNumber")
            if isinstance(step_number, int):
                max_step = max(max_step, step_number)
        return max_step
