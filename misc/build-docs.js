#!/usr/bin/env node
require('source-map-support').install()
const { promisify } = require('util')
const { execFile } = require('child_process')
const { Logger, writefile } = require('../pkgbuild')
const readfile = promisify(require('fs').readFile)

process.chdir(__dirname + '/..')

const log = Logger.default


function main() {
  return Promise.all([

    // attempt to make PNG from dot file
    readfile('docs/pkgbuild.dot').then(
      data => dotToPNG(log, data, 'docs/pkgbuild.png')),

  ])
}

function dotToPNG(log, code, pngfile) {
  return exec(log, { input: code },
    'dot', '-Tpng', '-o' + pngfile, '-Gsize=2048,2048!', '-Gdpi=1'
  ).then(() => {
    return pngcrush(log, pngfile).then(r => {
      if (r.stderr) {
        // pngcrush writes info messages to stderr
        log.debug('pngcrush result:', r.stderr)
      }
      log.info(`${pngfile}: write`)
    })
  })
}


function pngcrush(log, pngfile) {
  return exec(log, { optional: true }, 'pngcrush', '-q', '-ow', pngfile)
}


// exec
//
// options: {
//   input?    :string|Buffer
//   optional? :bool -- when true, no error on ENOENT
// }
//
// () :Promise<{stdout :string, stderr :string}>
function exec(log, options, prog) {
  return new Promise((resolve, reject) => {
    const p = execFile(prog, [].slice.call(arguments, 3), {
      // options
    }, (err, stdout, stderr) => {
      if (err) {
        if (err.code == 'ENOENT' && options.optional) {
          log.warn(`${pngfile}: "pngcrush" not found in PATH; skipping`)
          return resolve(undefined)
        }
        if (stderr) {
          log.err(stderr)
        }
        return reject(err)
      }
      resolve({
        stdout: stdout ? stdout.replace(/[\r\n\s]+$/, '') : stdout,
        stderr: stderr ? stderr.replace(/[\r\n\s]+$/, '') : stderr
      })
    })
    if (options.input) {
      p.stdin.end(options.input, 'utf8')
    } else {
      p.stdin.end()
    }
  })
}


main().catch(err => {
  console.error(err.stack || ''+err)
  process.exit(1)
})
