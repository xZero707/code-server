#!/usr/bin/env bash
set -euo pipefail

main() {
  cd "$(dirname "$0")/../.."

  source ./ci/lib.sh

  echo 'Installing code-server test dependencies...'

  cd test
  yarn install
  cd ..

  echo 'Installing VS Code dependencies...'

  cd node_modules/vscode
  # Freeze when in CI
  yarn install --frozen-lockfile
}

main "$@"
