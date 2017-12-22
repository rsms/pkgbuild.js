// you probably don't want to run this directly. Use build-self.sh instead.
require('source-map-support').install()
const readfile = require('util').promisify(require('fs').readFile)
const { Target, Logger, build, writefile } = require('../pkgbuild')
// const { Target, Logger, build, writefile } = require(
//   './pkgbuild.latest-build-broken.debug.js')

process.chdir(__dirname + '/..')
const dryrun = process.argv.includes('-dry')
const verbose = process.argv.includes('-verbose')

// "static linking" of dependencies
const libs = [
  { id: 'MOZ_SourceMap', file: 'lib/source-map.js' },
  { id: 'UglifyJS', file: 'lib/uglifyjs.js' },
]
const preamble = Promise.all(libs.map(
  f => readfile(f.file, 'utf8').then(s => (f.source = s, f))
)).then(files => files.map(f => {
    return (
      `/*!lib ${f.id}*/var ${f.id}={};` +
      `(function(){` +
        `var exports=${f.id},module={exports:exports};\n` +
        f.source +
        `\nif (module.exports!==${f.id}){${f.id}=module.exports;}` +
      `})();`
    )
  }).join('\n')
)

const globals = libs.map(f => f.id)

const config = {
  log: verbose ? Logger(Logger.ALL) : Logger.default,
  dest: [
    { file: dryrun ? null : 'pkgbuild.debug.js',
      preamble,
      target: new Target('nodejs', 'es2015', {
        optlevel: 0, debug: true, sourceMap: true, globals,
      })
    },
    { file: dryrun ? null : 'pkgbuild.js',
      preamble,
      target: new Target('nodejs', 'es2015', {
        optlevel: 3, debug: false, sourceMap: true, globals,
      })
    },
  ]
}

build('pkgbuild', config).catch(err => {
  if (err.name != 'SyntaxError' && err.name.indexOf('E_') == -1) {
    console.error(err.stack || ''+err)
  }
  process.exit(1)
}).then(r => {
  if (dryrun) { return }

  // create dependency graph file. Can be visualized with e.g. viz-js.com
  const dotcode = (
    'digraph G {\n' +
    // '  rankdir=LR;\n' +
    '  overlap=false;\n' +
    '  splines=true;\n' +
    '  node [shape=none, margin="0.15,0.1", color="#eeeeee",\n' +
    '        fontname="Inter UI", fontsize=13];\n' +
    '  edge [color="#222222"];\n' +
    r.filedepDotGraph() +
    '\n}'
  )

  return writefile('docs/pkgbuild.dot', dotcode, config.log)
})
