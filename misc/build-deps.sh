#!/bin/sh
set -e

mkdir -p lib

if [ ! -d lib/uglifyjs ]; then
  git clone -b harmony --single-branch \
    https://github.com/mishoo/UglifyJS2.git lib/uglifyjs
else
  git -C lib/uglifyjs pull
fi

pushd lib/uglifyjs >/dev/null
yarn
echo "build lib/uglifyjs.js"
bin/uglifyjs --self -c -m -o ../../lib/uglifyjs.js &
# bin/uglifyjs --self -b -o ../../lib/uglifyjs.js &
popd >/dev/null


SOURCEMAPURL=https://raw.githubusercontent.com/mozilla/source-map/master/dist/source-map.min.js
echo "fetch $SOURCEMAPURL -> lib/source-map.js"
curl '-#' -o lib/source-map.js "$SOURCEMAPURL"

wait

echo >> lib/uglifyjs.js
echo "/*git:$(git -C lib/uglifyjs rev-parse HEAD)*/" >> lib/uglifyjs.js
