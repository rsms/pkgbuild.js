#!/usr/bin/env node
//require('source-map-support').install() // enable source origin in stacktrace
const { Target, Logger, build } = require('../pkgbuild')

process.chdir(__dirname)
const argv = process.argv

// Allow user to provide -dry on the CLI to disable writing of output files
const dryrun = argv.includes('-dry')
const verbose = process.argv.includes('-verbose')

// Any custom global names that your code relies on
const globals = []

// Build configuration
const config = {
  log: verbose ? Logger(Logger.ALL) : Logger.default,
  incremental: argv.includes('-w') || argv.includes('--watch'),
  dest: [
    { file: dryrun ? null : 'hello.debug.js',
      target: new Target('nodejs,browser', 'es2015', {
        optlevel: 0, debug: true, sourceMap: true, globals,
      })
    },
    { file: dryrun ? null : 'hello.js',
      target: new Target('nodejs,browser', 'es2015', {
        optlevel: 3, debug: false, sourceMap: true, globals,
      })
    },
  ]
}

// Build the package.
// We can repeat this call many times to build multiple packages concurrently.
build('hello', config).catch(err => {
  // Handle errors, logging those not handled by pkgbuild
  if (err.name.indexOf('E_') == -1) { console.error(err.stack || ''+err) }
  process.exit(1)
}).then(r => {
  // Optionally do something with r, which is a BuildResult object
})


// Overview of types:
//
// interface BuildConfig {
//   dest :Destination[]
//   log? :Logger
// }
//
// interface Destination {
//   target    :Target
//   preamble? :string|Promise<string>
//   file?     :string  // written to disk if provided
//   pkgname?  :string  // used for global export. defaults to pkg.name
// }
//
// interface Product {
//   dest     :Destination
//   jsfile?  :string
//   jsdata   :string
//   mapfile? :string
//   mapdata? :string
// }
//
// interface BuildResult {
//   pkg      :Pkg
//   products :Product[]  // order is same as destinations
//   
//   filedepDotGraph() :string
//     // generate a GraphViz-compatible text representation of the source-file
//     // dependency graph.
// }
