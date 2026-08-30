#!/usr/bin/env bash
# GitHub Actions only. The workflow file cannot install the SDK (no
# permission to edit workflows), so npm postinstall does it instead.
set -euo pipefail

if [ "${GITHUB_ACTIONS:-}" != "true" ]; then
  exit 0
fi

SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/android-sdk}}"
export ANDROID_HOME="$SDK_ROOT"
export ANDROID_SDK_ROOT="$SDK_ROOT"
mkdir -p "$SDK_ROOT"

CMDLINE="$SDK_ROOT/cmdline-tools/latest"
if [ ! -x "$CMDLINE/bin/sdkmanager" ]; then
  echo "Downloading Android command-line tools…"
  curl -fsSL -o /tmp/cmdtools.zip \
    https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
  rm -rf /tmp/cmdtools
  mkdir -p /tmp/cmdtools
  unzip -q /tmp/cmdtools.zip -d /tmp/cmdtools
  rm -rf "$CMDLINE"
  mkdir -p "$SDK_ROOT/cmdline-tools"
  mv /tmp/cmdtools/cmdline-tools "$CMDLINE"
fi

mkdir -p "$SDK_ROOT/licenses"
printf '24333f8a63b6825ea9c5514f83c2829b004d1fee\n' > "$SDK_ROOT/licenses/android-sdk-license"
printf '84831b9409646161da1d4ff4eb8c3b5852f4\n' > "$SDK_ROOT/licenses/android-sdk-preview-license"
printf 'd975f751698a77b662f1254ddbeed3901e976f5a\n' > "$SDK_ROOT/licenses/intel-android-extra-license"

echo "Installing Android platforms…"
"$CMDLINE/bin/sdkmanager" --sdk_root="$SDK_ROOT" --install \
  "platform-tools" \
  "platforms;android-35" \
  "platforms;android-34" \
  "build-tools;35.0.0" \
  "build-tools;34.0.0"

if [ -n "${GITHUB_ENV:-}" ]; then
  echo "ANDROID_HOME=$SDK_ROOT" >> "$GITHUB_ENV"
  echo "ANDROID_SDK_ROOT=$SDK_ROOT" >> "$GITHUB_ENV"
fi
if [ -n "${GITHUB_PATH:-}" ]; then
  echo "$CMDLINE/bin" >> "$GITHUB_PATH"
  echo "$SDK_ROOT/platform-tools" >> "$GITHUB_PATH"
  echo "$SDK_ROOT/emulator" >> "$GITHUB_PATH"
fi

if [ -d android ]; then
  echo "sdk.dir=$SDK_ROOT" > android/local.properties
fi

echo "Android SDK ready at $SDK_ROOT"
