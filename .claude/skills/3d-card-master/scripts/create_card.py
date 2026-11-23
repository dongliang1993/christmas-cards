#!/usr/bin/env python3
"""Create a new 3D paper-cut greeting card from the skill's packaged template.

Usage:
    python3 create_card.py OUTPUT [--title T] [--greeting G]
                               [--message M] [--signature S]

Creates OUTPUT (a new directory) with the template copied into it and an
editable UTF-8 ``card.json`` holding the four personalization keys
(``title``, ``greeting``, ``message``, ``signature``).

Safety contract:
  * Refuses to touch an OUTPUT that exists and is non-empty (never clobbers).
  * Refuses OUTPUT inside the template, or a template inside OUTPUT (never
    copies the source into itself recursively).
  * Never writes anything under the skill/template tree.
"""

from __future__ import annotations

import argparse
import json
import shlex
import shutil
import sys
from pathlib import Path

CARD_KEYS = ("title", "greeting", "message", "signature")
# No-args sample copy: a real card without any personal name in it.
# Explicit flags (including empty strings) always win over these.
DEFAULT_CARD = {
    "title": "冬夜月光",
    "greeting": "亲爱的朋友，",
    "message": "愿这个冬天的月光落在你窗前，\n也愿来年有你喜欢的花开。",
    "signature": "",
}


class CardError(Exception):
    """A user-facing error with a clear message."""


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="create_card.py",
        description="Create a new 3D paper-cut greeting card directory "
        "from the packaged winter-moonlight template.",
    )
    parser.add_argument(
        "output",
        help="output directory to create (must not exist or be empty)",
    )
    parser.add_argument(
        "--title",
        default=None,
        help="preview title (default: a sample title)",
    )
    parser.add_argument(
        "--greeting",
        default=None,
        help="opening salutation (default: a sample greeting)",
    )
    parser.add_argument(
        "--message",
        default=None,
        help="body text; \\n allowed (default: a sample message)",
    )
    parser.add_argument(
        "--signature",
        default=None,
        help="closing signature (default: empty)",
    )
    return parser.parse_args(argv)


def resolve_output(raw: str, template: Path) -> Path:
    """Resolve OUTPUT against the CWD and validate it against the template."""
    output = Path(raw).expanduser()
    output = output if output.is_absolute() else Path.cwd() / output
    output = output.resolve(strict=False)
    if output == template or template in output.parents:
        raise CardError(
            f"refusing: output {output} is inside the template {template}; "
            "choose a directory in your own workspace"
        )
    if output in template.parents:
        raise CardError(
            f"refusing: output {output} contains the template; copying the "
            "template into its own ancestor would recurse forever"
        )
    if output.exists():
        if output.is_dir():
            if any(output.iterdir()):
                raise CardError(
                    f"refusing: output directory {output} exists and is not "
                    "empty; move it aside or pick a new name (existing "
                    "content is never clobbered)"
                )
        else:
            raise CardError(
                f"refusing: output path {output} exists and is not a directory"
            )
    return output


def copy_template(template: Path, output: Path) -> None:
    """Copy the packaged template into a fresh OUTPUT directory."""
    try:
        output.mkdir(parents=True, exist_ok=True)
        shutil.copytree(template, output, dirs_exist_ok=True)
    except OSError as err:
        raise CardError(f"could not create output {output}: {err}") from err


def write_card_json(output: Path, values: dict[str, str]) -> None:
    """Write the editable UTF-8 card.json with the four personalization keys."""
    card = {key: values.get(key, "") for key in CARD_KEYS}
    path = output / "card.json"
    try:
        path.write_text(
            json.dumps(card, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    except OSError as err:
        raise CardError(f"could not write {path}: {err}") from err


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    template = Path(__file__).resolve().parents[1] / "assets" / "template"
    if not template.is_dir():
        print(
            f"error: packaged template missing at {template}; reinstall the "
            "3d-card-master skill",
            file=sys.stderr,
        )
        return 2
    try:
        output = resolve_output(args.output, template)
        copy_template(template, output)
        values = {}
        for key in CARD_KEYS:
            given = getattr(args, key)
            values[key] = DEFAULT_CARD[key] if given is None else given
        values["message"] = values["message"].replace("\\n", "\n")
        write_card_json(output, values)
    except CardError as err:
        print(f"error: {err}", file=sys.stderr)
        return 2
    print(f"Created card at {output}")
    print(f"Edit {output / 'card.json'} (UTF-8): title, greeting, message, signature.")
    print(
        "Preview: python3 -m http.server 8000 --bind 127.0.0.1 --directory "
        + shlex.quote(str(output))
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
