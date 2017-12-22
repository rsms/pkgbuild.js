const crypto = require('crypto')

const autoExportNameRegEx = /^[A-Z]/
  // automatically export top-level defs that begin with an upper-case letter


function buildDefinitionsMap(n, srcfile, srcfilemap) {
  const m = new Map()

  for (let k in n.variables._values) {
    let def = n.variables._values[k]
    assert(def.orig.length == 1) // Note: uglify checks for dup def in file

    if (autoExportNameRegEx.test(def.name)) {
      def['export'] = true
    }

    const orig = def.orig[0]
    const _srcfile = srcfile || srcfilemap.get(orig.start.file)
    if (_srcfile) {
      m.set(def.name, new DefOrigin(
        _srcfile,
        orig,
        def.references.length,
        def['export'],
      ))
    }
  }

  return m
}


function sha256(data, encoding) {
  const h = crypto.createHash('sha256')
  h.update(data)
  return h.digest(encoding)
}


class SrcFile {
  constructor(filename) {
    this.filename = filename
    this.ast = null
    this.references = new Map   // Map<string,AST_Node[]>
    this.definitions = new Map // Map<string,DefOrigin>
    this._inrcParse = false
    this.version = '' // used when _inrcParse
  }

  enableIncrementalParsing() {
    if (!this._inrcParse) {
      if (this.ast) {
        panic('already parsed')
      }
      this._inrcParse = true
    }
  }

  _parse(source) { // :Promise<SrcFile>
    return new Promise((resolve, reject) => {
      const r = parse({ [this.filename]: source })
      if (r.error) {
        return reject(r.error)
      }
      let ast = r.ast
      ast = this._resolveScope(ast)
      ast = this._transform(ast)
      this.ast = ast
      resolve(this)
    })
  }

  parse() { // :Promise<SrcFile>
    if (this._inrcParse) {
      return readfile(this.filename).then(content => {
        const version = sha256(content, 'base64')
        if (this.ast && version == this.version) {
          assert(this.version)
          // up-to date
          return this
        }
        this.version = version
        return this._parse(content.toString('utf8'))
      })
    } else {
      return readfile(this.filename, 'utf8').then(s => this._parse(s))
    }
  }

  _resolveScope(ast) {
    ast.figure_out_scope({})

    this.definitions = buildDefinitionsMap(ast, this)

    for (let k in ast.globals._values) {
      let def = ast.globals._values[k]
      if (def.references && def.references.length) {
        this.references.set(def.name, def.references)
      }
    }

    return ast
  }

  _transform(ast) {
    // TreeTransformer(before :CB|undefined, after :CB|undefined)
    //   extends TreeWalker
    //
    // CB(n :AST_Node, descend :()=>void, inList :bool) :undefined|AST_Node
    //
    //   if CB returns undefined, descend is called automatically and any
    //   "after" handler is called.
    //
    //   if CB returns a node, descend must be called manually (if descent is
    //   wished for), and the return node replaces the input node.
    //
    const t = new U.TreeTransformer((n, descend, inList) => {
      // n.parent = t.parent()  // link parent

      if (n instanceof U.AST_Export) {
        if (n.exported_definition) {
          // `export const x ...` => `const x ...`
          return n.exported_definition
        } else {
          const e = new Error(`unsupported export declaration`)
          e.details = () => codegenNodes(n)
          e.name = 'E_SYN_BADEXPORT'
          e.file = n.start.file
          e.line = n.start.line
          e.col  = n.start.col
          throw e
        }
      }
    })
    return ast.transform(t)
  }

  // resolveASTParents() {
  //   if (!this._astParentsResolved) {
  //     this._astParentsResolved = true
  //     var tw = new U.TreeWalker((node, descend) => {
  //       // return falsy from visitor = descend automatically
  //       // return truthy from visitor = do not descend automatically
  //       node.parent = tw.parent()
  //     })
  //     this.ast.walk(tw)
  //   }
  // }

  toString() {
    return this.filename
  }
}
