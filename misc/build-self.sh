#!/bin/bash
#
# This script facilitates building pkgbuild using itself in a safe manner.
# It maintains the last working version at $STABLEFILE and whenever a new
# version is built, it is first checked by a repeat dry-build of itself. If
# that final dry-build fails, pkgbuild.js is reverted to $STABLEFILE.
#
# In other words, we can simply make changes and run this script — if our
# changes break pkgbuild, we still have an older version that is not broken.
#
set -e
cd "$(dirname "$0")/.."

mkdir -p tmp
STABLEFILE_RELEASE=tmp/pkgbuild.stable.js
STABLEFILE_DEBUG=tmp/pkgbuild.debug.stable.js

if [ ! -f $STABLEFILE_RELEASE ]; then
  echo "checking pkgbuild.js"
  node misc/build-self.js -dry "$@"  # exit if there's an error
  cp -va pkgbuild.js $STABLEFILE_RELEASE
  cp -va pkgbuild.js.map $STABLEFILE_RELEASE.map
  cp -va pkgbuild.debug.js $STABLEFILE_DEBUG
  cp -va pkgbuild.debug.js.map $STABLEFILE_DEBUG.map
else
  STABLESHA_RELEASE=$(shasum $STABLEFILE_RELEASE | cut -d ' ' -f 1)
  LATESTSHA_RELEASE=$(shasum pkgbuild.js | cut -d ' ' -f 1)
  STABLESHA_DEBUG=$(shasum $STABLEFILE_DEBUG | cut -d ' ' -f 1)
  LATESTSHA_DEBUG=$(shasum pkgbuild.debug.js | cut -d ' ' -f 1)
  if [ "$STABLESHA_RELEASE" != "$STABLESHA_RELEASE" ] || \
     [ "$STABLESHA_DEBUG" != "$LATESTSHA_DEBUG" ]; then
    echo "checking pkgbuild.js"
    if node misc/build-self.js -dry "$@"; then
      cp -va pkgbuild.js $STABLEFILE_RELEASE
      cp -va pkgbuild.js.map $STABLEFILE_RELEASE.map
      cp -va pkgbuild.debug.js $STABLEFILE_DEBUG
      cp -va pkgbuild.debug.js.map $STABLEFILE_DEBUG.map
    else
      echo "pkgbuild.js seems broken -- using older version"
      cp -vaf $STABLEFILE_RELEASE pkgbuild.js
      cp -vaf $STABLEFILE_DEBUG pkgbuild.debug.js
    fi
  fi
fi

echo "[1/2] build new version"
node misc/build-self.js "$@"

echo "[2/2] rebuild new version using new version"
if ! node misc/build-self.js -dry "$@" ; then
  echo "reverting to old version"
  
  mv -vf pkgbuild.js pkgbuild.latest-build-broken.js
  mv -vf pkgbuild.js.map pkgbuild.latest-build-broken.js.map
  mv -vf pkgbuild.debug.js pkgbuild.latest-build-broken.debug.js
  mv -vf pkgbuild.debug.js.map pkgbuild.latest-build-broken.debug.js.map

  cp -vaf $STABLEFILE_RELEASE pkgbuild.js
  cp -vaf $STABLEFILE_RELEASE.map pkgbuild.js.map
  cp -vaf $STABLEFILE_DEBUG pkgbuild.debug.js
  cp -vaf $STABLEFILE_DEBUG.map pkgbuild.debug.js.map
  exit 1
else
  rm -f pkgbuild.latest-build-broken.*
fi

echo "OK"
