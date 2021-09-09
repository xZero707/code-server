#!/usr/bin/env bash
set -euo pipefail

main() {
  cd "$(dirname "$0")/../.."

  if [ -z "$(ls -A lib/vscode)" ]; then
    git submodule init
  else
    git submodule update
  fi

  source ./ci/lib.sh

  # This installs the dependencies needed for testing
  cd test
  yarn
  cd ..

  cd lib/vscode
  yarn ${CI+--frozen-lockfile}

  symlink_asar
}

main "$@"
