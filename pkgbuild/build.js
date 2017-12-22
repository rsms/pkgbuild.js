// interface BuildConfig {
//   dest         :Destination[]
//   log?         :Logger
//   incremental? :boolean  // watch sources and rebuild as they change
// }

// interface Destination {
//   target    :Target
//   preamble? :string|Promise<string>
//   file?     :string  // written to disk if provided
//   pkgname?  :string  // used for global export. defaults to pkg.name
// }

// interface Product {
//   dest     :Destination
//   jsfile?  :string
//   jsdata   :string
//   mapfile? :string
//   mapdata? :string
// }

// interface BuildResult {
//   pkg      :Pkg
//   products :Product[]  // order is same as destinations
//   
//   filedepDotGraph() :string
//     // generate a GraphViz-compatible text representation of the source-file
//     // dependency graph.
// }

// build takes care of building a package
//
// build(pkgOrDir :Pkg|string, config :BuildConfig)
//   :Promise<BuildResult>
export function build(pkgOrDir, config) {
  const log = config.log || Logger.default
  
  let pkg
  if (pkgOrDir instanceof Pkg) {
    pkg = pkgOrDir
  } else {
    pkg = new Pkg(pkgOrDir)
    for (const fn of fs.readdirSync(pkg.dir)) {
      if (fn.lastIndexOf('.js') == fn.length-3) {
        pkg.addFile(Path.join(pkg.dir, fn))
      }
    }
  }

  let parsemode = ParseModeDefault

  if (config.incremental) {
    // turn on incremental parse support on srcfiles
    parsemode |= ParseModeIncremental
    for (const f of pkg.files) {
      f.enableIncrementalParsing()
    }
  }

  const p = new PkgParser(config.dest.map(d => d.target), log, parsemode)

  return buildparse(pkg, p, config, log).then(result => {
    if (!config.incremental) {
      return result
    }

    log.info(`watching source of ${pkg} for changes`)

    // begin incremental compilation in response to source file changes
    new fsdirWatcher([pkg.dir], (changedFilesHint, w) => {
      log.info('source changed:', changedFilesHint)
      w.pause()

      // TODO: handle addition and removal of source files

      buildparse(pkg, p, config, log).then(() => {
        w.resume()
      }).catch(err => {
        if (err.name.indexOf('E_') == -1) {
          log.err(err.stack || ''+err)
        }
        w.resume()
      })
    }).open()

    return new Promise(() => {}) // never resolves
  })
}


function buildparse(pkg, p, config, log) {
  log.debug(`parse ${pkg}`)
  return p.parse(pkg.files).then(didChange => {
    if (!didChange) {
      // incremental compilation attempt without any effect
      assert(config.incremental)
      return
    }

    pkg.files = p.files
    pkg.exports = p.exports

    // log some details
    if (log.level >= Logger.DEBUG) {
      log.debug(pkg, 'intrinsics used:',
        p.intrinsicsUsed ? strls(p.intrinsicsUsed) : '(none)'
      )
      log.debug(pkg, 'exported names:\n  ' +
        Array.from(pkg.exports).join('\n  ')
      )
    }

    if (p.errors) {
      p.errorReport(log.err)
      return Promise.reject(p.errors[0])
    }

    if (p.diagnostics && log.level >= Logger.WARNING) {
      p.diagnosticsReport(log.warn)
    }

    return Promise.all(
      config.dest.map((d, i) => {
        const mutatePkgAst = !config.incremental && i == config.dest.length-1
        return gendest(d, p, pkg, mutatePkgAst, log)
      })
    ).then(products => {
      // ref to minimize closure refs
      const filedeps = p.filedeps
      return { // BuildResult
        pkg,
        products,
        filedepDotGraph() {
          return filedepDotGraph(filedeps, pkg.files, pkg.dir)
        },
      }
    })
  })
}


function gendest(dest, p, pkg, mutatePkgAst, log) { // :Promise<BuildResult>
  const target = dest.target

  // Step 1: Assemble
  let { factory, ast } = assemble(
    pkg,
    dest.pkgname || pkg.name,
    p.intrinsicsUsed,
    target,
    mutatePkgAst
  )

  let definitions = p.definitions

  if (!mutatePkgAst) {
    ast.figure_out_scope({})
    const srcfiles = new Map(pkg.files.map(f => [f.filename, f]))
    definitions = buildDefinitionsMap(factory, null, srcfiles)
  }


  // Step 2: Optimize
  if (target.optlevel > 0) {
    log.debug(pkg, 'optimize', target.toString.bind(target))
    const r = optimize(ast, Array.from(pkg.exports), target)

    if (r.error) {
      log.err(`failed to build ${pkg}`)
      throw uglifyerr(r.error)
    }

    ast = r.ast
    
    r.report(log, definitions)
  }

  // Await any preamble
  const preamble = (
    dest.preamble ?
      dest.preamble instanceof Promise ? dest.preamble :
      Promise.resolve(dest.preamble) :
    Promise.resolve(null)
  )

  return preamble.then(preamble => {
    // Step 3: Codegen
    log.debug(pkg, 'codegen', target.toString.bind(target))
    const out = codegen(ast, preamble, target, dest.file)


    // Step 4: Write output
    const res = {
      pkg,
      dest,
      jsfile: dest.file,
      jsdata: out.code,
      mapfile: undefined,
      mapdata: undefined,
    }

    const p = []  // promises

    if (res.jsfile) {
      p.push(writefile(res.jsfile, res.jsdata, log))
    }

    if (out.map) {
      res.mapdata = out.map
      if (res.jsfile) {
        res.mapfile = res.jsfile + '.map'
        p.push(writefile(res.mapfile, res.mapdata, log))
      }
    }

    return Promise.all(p).then(() => res)
  })
}
