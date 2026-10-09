#!/bin/zsh
# Pull the latest Sportsboard from GitHub, but keep it only if its tests pass on
# this Mac. Otherwise go straight back to the version that was running.
# Exit 0: up to date or updated. Exit 1: kept the current version.
{
cd "$(dirname "$0")" || exit 1
NODE="${SPORTSBOARD_NODE:-$(command -v node || ls /opt/homebrew/bin/node /usr/local/bin/node 2>/dev/null | head -1)}"
before=$(git rev-parse HEAD 2>/dev/null) || { echo "Not a git checkout; skipping update."; exit 1; }
if ! GIT_TERMINAL_PROMPT=0 git pull --ff-only -q 2>/dev/null; then
  echo "Couldn't reach GitHub (offline or not signed in); staying on $(git log -1 --format=%h)."
  exit 1
fi
after=$(git rev-parse HEAD)
if [ "$before" = "$after" ]; then echo "Up to date ($(git log -1 --format='%h %s'))."; exit 0; fi
if [ "$(cat .update-rejected 2>/dev/null)" = "$after" ]; then
  git reset -q --keep "$before" && echo "Skipping $after (it failed its tests before)." || echo "Couldn't switch back from $after; check the sportsboard folder."
  exit 1
fi
if [ ! -x "$NODE" ]; then
  # Can't test it here, so don't run it (and don't blame the commit either).
  if git reset -q --keep "$before"; then echo "Node.js wasn't found, so the update wasn't tested; staying on $(git log -1 --format=%h)."
  else echo "Node.js wasn't found and switching back failed; now on $(git log -1 --format=%h). Check the sportsboard folder."; fi
  exit 1
fi
if "$NODE" --test test/*.test.mjs > .update-test.log 2>&1; then
  rm -f .update-rejected
  echo "Updated to $(git log -1 --format='%h %s')."
  exit 0
fi
echo "$after" > .update-rejected
if git reset -q --keep "$before"; then
  echo "The new version failed its tests, so the Mini stayed on $(git log -1 --format=%h). Details: $PWD/.update-test.log"
else
  echo "The new version failed its tests and switching back failed; still on $(git log -1 --format=%h). Details: $PWD/.update-test.log"
fi
exit 1
}
