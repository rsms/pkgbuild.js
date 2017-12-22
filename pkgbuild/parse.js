
const refTypeInit    = 1 // dereferenced at init-time
    , refTypeRuntime = 2 // dereferenced at run-time

// dependencyDotGraph generates a Graphviz-compatible text representation
// of the package-internal file dependency graph.
//
function filedepDotGraph(filedeps, files, basedir) {
  return filedeps.toDotString(
    files,
    (file1, file2, edgeType) => {
      if (file2) {
        // edge
        if (edgeType === refTypeRuntime) {
          // "soft" runtime dereferenced
          return `[arrowhead="empty", color="#00000022", constraint=false]`
        }
        return '' // no attrs for init-time edge
      } else {
        // node
        const filename = (
          basedir ? Path.relative(basedir, file1.filename) :
          file1.filename
        )
        return `[label="${filename.replace('"', '\\"')}"]`
      }
    }
  )
}


class DefOrigin {
  // file     :SrcFile
  // node     :AST_Node
  // loc      :SrcLoc
  // refcount :number
  // exported :bool

  constructor(file, node, refcount, exported) {
    this.file = file
    this.node = node
    this.loc = node.start
    this.refcount = refcount
    this.exported = exported
  }

  get name() {
    return this.node.name
  }
}


const ParseModeDefault = 0
    , ParseModeContinueOnError = 1  // don't stop for errors (e.g. for linting)
    , ParseModeIncremental = 2 // support incremental compilation


// interface Diagnostic extends SrcLoc {
//   name     :string
//   message  :string
//   details? :string | string[] | ()=>string | ()=>string[]
// }

class PkgParser {
  // targets        :Targets[]
  // log            :Logger
  // mode           :ParseMode
  // errors         :null | Diagnostic[]
  // diagnostics    :null | Diagnostic[]
  // intrinsicsUsed :null | Set<string>
  // filedeps       :DAG<SrcFile> -- inter-package file dependencies
  // definitions    :Map<string,DefOrigin>
  // exports        :Set<string> -- exported names
  // files          :SrcFile[] -- after parse, they are sorted in dep order

  constructor(targets, log, mode) {
    this.targets = targets; assert(targets.length > 0)
    this.log = log
    this.mode = mode || ParseModeDefault

    // state
    this.errors = null
    this.diagnostics = null
    this.filedeps = null
    this.intrinsicsUsed = null
    this.definitions = null
    this.exports = null
    this.files = null

    if (this.mode & ParseModeIncremental) {
      this._fileVersions = new Map // Map<SrcFile,string>
    }
  }

  // parse parses files and returns true when anything was parsed.
  // When mode is ParseModeIncremental, this function might return false to
  // indicate that nothing changed since the previous invocation.
  //
  parse(files /*Iterable<SrcFile>*/) { // :Promise<boolean>
    // initialize state
    this.errors = null
    this.diagnostics = null
    this.filedeps = new DAG()
    this.intrinsicsUsed = null
    this.definitions = new Map
    this.exports = new Set
    this.files = Array.from(files)

    const log = this.log
    const incr = !!(this.mode & ParseModeIncremental)
    let nchanges = 0
    let parsefile

    if (incr) {
      parsefile = f => {
        f.enableIncrementalParsing()
        return f.parse().then(f => {
          let pastversion = this._fileVersions.get(f)
          if (pastversion && pastversion == f.version) {
            // unchanged
            log.debug('parse', f, '-> unchanged')
            return
          } else {
            log.debug('parse', f, '->', pastversion ? 'changed' : 'added')
          }
          this._fileVersions.set(f, f.version)
          nchanges++
        })
      }
    } else {
      parsefile = f => f.parse()
      nchanges = this.files.length
    }

    return Promise.all(this.files.map(
      f => parsefile(f).catch(err => this._adderr(err))
    )).then(() => {
      if (incr) {
        // check for files that disappeared
        const gonefiles = []
        const currfiles = new Set(this.files)
        for (const [f, version] of this._fileVersions) {
          if (!currfiles.has(f)) {
            log.debug('parse', f, '-> removed')
            nchanges++
            gonefiles.push(f)
          }
        }
        gonefiles.forEach(f => this._fileVersions.delete(f))
      }

      if (nchanges && !this._shouldStop()) {
        this._bind()
      }

      return nchanges > 0
    })
  }

  _detailReport(msgwriter, e) {
    if (e.details) {
      const d = Array.isArray(e.details) ? e.details : [e.details]
      if (d.length) {
        const indent = '  '
        for (let m of d) {
          if (typeof m == 'function') {
            m = m()
          }
          msgwriter(indent + String(m).replace('\n', '\n' + indent))
        }
      }
    }
  }

  errorReport(msgwriter) {
    if (this.errors) {
      for (const e of this.errors) {
        if (isloc(e)) {
          msgwriter(`${fmtloc(e)}: ${e.message} (${e.name})`)
        } else if (e.file !== undefined) {
          msgwriter(`${e.message} (${e.name})`)
        } else {
          msgwriter(e.stack || e)
        }
        this._detailReport(msgwriter, e)
      }
    }
  }

  diagnosticsReport(msgwriter) {
    if (this.diagnostics) {
      for (const d of this.diagnostics) {
        if (d.loc) {
          msgwriter(`${fmtloc(d.loc)}: ${d.message} (${d.name})`)
        } else {
          msgwriter(`${d.message} (${d.name})`)
        }
        this._detailReport(msgwriter, d)
      }
    }
  }

  _adderr(e) {
    this.errors ? this.errors.push(e) : this.errors = [e]
  }

  _err(name, message, loc /*SrcLoc*/, details) {
    assert(Errors.has(name))
    this._adderr({
      name,
      message,
      details,
      file: loc.file,
      line: loc.line,
      col: loc.col,
    })
  }

  _diag(name, message, loc /*SrcLoc*/, details) {
    assert(Warnings.has(name))
    const d = { name, message, details, loc }
    if (!this.diagnostics) {
      this.diagnostics = [d]
    } else {
      this.diagnostics.push(d)
    }
  }

  _shouldStop() {
    return this.errors && !(this.mode & ParseModeContinueOnError)
  }

  _resolveFileDefs(f) {
    for (const [name, d /*DefOrigin*/] of f.definitions) {
      let otherd = this.definitions.get(name)
      if (otherd) {
        // error: duplicate identifier
        let otherloc = fmtloc(otherd.loc)
        this._err(
          'E_SYN_DUPID',
          `duplicate identifier ${name}; also defined at ${otherloc}`,
          d.loc
        )
        return
      }

      this.definitions.set(name, d)

      if (d.exported) {
        this.exports.add(name)
      }
    }
  }

  _resolveFileRefs(f, globals) {
    // register file
    this.filedeps.addNode(f)

    for (const [name, refs] of f.references) {
      let def = this.definitions.get(name)
      if (!def) {
        if (!globals.has(name)) {
          const intr = intrinsics.get(name)
          if (intr) {
            // intrinsic built-in
            if (!this.intrinsicsUsed) {
              this.intrinsicsUsed = new Set([intr])
            } else {
              this.intrinsicsUsed.add(intr)
            }
          } else {
            // error: not defined
            let details
            if (this.log.level > Logger.WARNING) {
              // look for name in other envs and esspecs, and include
              // "did you mean" / suggestions in the error message.
              details = []
              for (const env of environments.values()) {
                if (env.globals.has(name)) {
                  details.push(`Hint: "${env.name}" target has ${name}`)
                }
              }
            }
            let loc = refs[0].start
            this._err('E_REFUNDEF', `${name} is not defined`, loc, details)
          }
        }
        // else: known environment global
      } else {
        // reference within package -- register file-to-file dependency

        def.refcount++

        let tofiles = this.filedeps.getDestinations(f)
        let refType = tofiles ? tofiles.get(def.file) : refTypeRuntime
        if (refType !== refTypeInit) {

          // assume all references are dereferenced at runtime; visit each ref
          // and if any one of the references is dereferenced at init-time, mark
          // the entire file reference as being init-time rather than runtime.
          for (const ref of refs) {
            if (!ref.scope.parent_scope) {
              refType = refTypeInit  // reference is top-level
              break
            }
          }

          this.filedeps.setEdge(f, def.file, refType)
        }
      }
    }
  }

  _onCyclicDep(file2, file1, refType) {
    // this function is called when a mutual inter-package file-to-file
    // dependency has been encountered.

    // collect names that are referenced between both files
    let refnames_1_to_2 = []
    let refnames_2_to_1 = []
    for (const [name, refs] of file1.references) {
      let def = this.definitions.get(name)
      if (def && def.file === file2) {
        refnames_1_to_2.push(`\`${name}\``)
      }
    }
    for (const [name, refs] of file2.references) {
      let def = this.definitions.get(name)
      if (def && def.file === file1) {
        refnames_2_to_1.push(`\`${name}\``)
      }
    }

    const details = [
      `${file1} references ${strls(refnames_1_to_2)} defined in ${file2}.`,
      `${file2} references ${strls(refnames_2_to_1)} defined in ${file1}.`,
    ]

    if (refType === refTypeRuntime) {
      this._diag(
        'W_MUTDEP',
        `possible mutual dependency with ${file1}`,
        { file: file2, line: -1, col: 0 },
        details
      )
      return true // continue
    }
    
    this._err(
      'E_MUTDEP',
      `cyclic dependency with ${file1}`,
      { file: file2, line: -1, col: 0 },
      details
    )
    return false // stop
  }

  _bind() {
    // register definitions from files (will catch duplicate definitions)
    this.files.map(f => this._resolveFileDefs(f))
    if (this._shouldStop()) { return }

    // compute set of globals
    const globals = new Set(this.targets[0].globals)
    for (let i = 1; i < this.targets.length; ++i) {
      for (const n of this.targets[i].globals) {
        globals.add(n)
      }
    }

    // register references in files (will catch undefined references)
    this.files.map(f => this._resolveFileRefs(f, globals))
    if (this._shouldStop()) { return }

    // check for unused definitions
    for (const [name, def] of this.definitions) {
      if (def.refcount == 0 && !def.exported) {
        this._diag('W_UNUSED', `${def.name} defined but not used`, def.loc)
      }
    }

    // sort this.files topologically based on dependencies
    this.files = this.filedeps.sort(this._onCyclicDep.bind(this))
  }
}
