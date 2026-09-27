#!/bin/bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
build_dir="$(mktemp -d "${TMPDIR:-/tmp}/sportsboard-build.XXXXXX")"
trap 'rm -rf "$build_dir"' EXIT
app_dir="$build_dir/Sportsboard.app"
mkdir -p "$app_dir/Contents/MacOS" "$app_dir/Contents/Resources/sportsboard" "$project_dir/dist"
cp "$project_dir/macos/Info.plist" "$app_dir/Contents/Info.plist"
cp "$(command -v node)" "$app_dir/Contents/Resources/node"
cp "$project_dir/server.mjs" "$app_dir/Contents/Resources/sportsboard/"
cp -R "$project_dir/public" "$app_dir/Contents/Resources/sportsboard/"
swiftc "$project_dir/macos/SportsboardLauncher.swift" -o "$app_dir/Contents/MacOS/Sportsboard" -module-cache-path "$build_dir/swift-cache"
xattr -cr "$app_dir"
codesign --force --deep --sign - "$app_dir"
codesign --verify --deep --strict "$app_dir"
ditto -c -k --sequesterRsrc --keepParent "$app_dir" "$project_dir/dist/Sportsboard.zip"
echo "Created $project_dir/dist/Sportsboard.zip"
