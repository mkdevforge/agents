#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
source_dir=$(CDPATH= cd -- "$script_dir/../plugins/session-handoff/codex-skills/resume-claude-session" && pwd)
skills_root=${CODEX_HOME:-"$HOME/.codex"}/skills
target=$skills_root/resume-claude-session

mkdir -p "$skills_root"

if [ -L "$target" ]; then
  existing=$(readlink "$target")
  if [ "$existing" = "$source_dir" ]; then
    printf 'The $resume-claude-session skill already points to %s\n' "$source_dir"
    exit 0
  fi
  printf 'Refusing to replace the existing link: %s -> %s\n' "$target" "$existing" >&2
  exit 1
fi

if [ -e "$target" ]; then
  printf 'Refusing to replace the existing path: %s\n' "$target" >&2
  exit 1
fi

ln -s "$source_dir" "$target"
printf 'Installed $resume-claude-session from %s\n' "$source_dir"
