// function enableToJSON(ast) {
//   ast.walk(new U.TreeWalker((node, descend) => {
//     // add toJSON function to node
//     node.toJSON = function() {
//       let o = { type:this.CTOR.name }
//       for (const k of Object.keys(this)) {
//         const r = this[k]
//         o[k] = r
//       }
//       return o
//     }
//   }))
// }

function bootstrap() {
  const code =
    `
    (function(factory) {
      var m, id = $PKGID, g = typeof global == 'undefined' ? this : global
      if (typeof exports != 'undefined') {
        if (typeof module != 'undefined') {
          // commonjs environment
          factory(g, module, exports)
        } else {
          // commonjs-like environment (no module)
          m = { id: id, exports: exports }
          factory(g, m, exports)
          if (m.exports !== exports) {
            for (var k in m.exports) {
              exports[k] = m.exports[k]
            }
          }
        }
      } else {
        // fallback -- add to global
        m = { id: id, exports: {} }
        factory.call(g, g, m, m.exports)
        g[id] = m.exports
      }
    })(function(global, module, exports){});`

  return parseHelper('boot', code)

  // enableToJSON(ast);
  // console.log('wrapper:', repr(JSON.parse(JSON.stringify(ast)), 10))

  // TODO: generate wrapper suitable for all target.envs
}

// assemble builds a single AST for the package.
// The shape of the resulting AST depends on the target.
// If mutatePkgAst is true, this function will save time and memory by modifying
// the package source file ASTs in place instead of making copies.
//
function assemble(pkg, pkgname, intrinsicsUsed, target, mutatePkgAst) {
  let ast = bootstrap()

  let directive = new U.AST_Directive()
  directive.value = "use strict"
  directive.quote = '"'

  let body = [ directive ]

  // include code for any used intrinsics
  if (intrinsicsUsed) for (const intr of intrinsicsUsed) {
    const intrAst = intr.getAST(target).clone(true)
    for (const n of intrAst.body) {
      body.push(n)
    }
  }

  // Add each source file's AST in order to the module body
  for (const f of pkg.files) {
    for (let n of f.ast.body) {
      if (!mutatePkgAst) {
        n = n.clone(true)
      }
      body.push(n)
    }
  }

  // Add exports
  for (const name of pkg.exports) {
    // exports.name = name
    const expn = new U.AST_SimpleStatement({
      body: new U.AST_Assign({
        start    : null,  // TODO: use start of the original export decl
        operator : '=',
        right    : new U.AST_SymbolRef({ name }),
        left     : new U.AST_Dot({
          expression : new U.AST_SymbolRef({ name: 'exports' }),
          property   : name,
        })
      })
    })
    // const a = parse('exports.Foo = Foo').ast.body[0].body.right
    // console.log(repr(a), a.CTOR.name); process.exit(1)
    body.push(expn)
  }

  const vars = {
    $PKGID: new U.AST_String({ quote: '"', value: pkgname }),
  }

  let factory
  ast = ast.transform(new U.TreeTransformer((n, descend, inList) => {
    // scrub source location
    // n.start = n.end = undefined

    if (n instanceof U.AST_Function && n.body.length == 0) {
      n.body = body
      factory = n
      return n // don't descend
    }

    // replace constant ids
    if (n instanceof U.AST_SymbolRef && n.name[0] == '$') {
      let v = vars[n.name]
      if (v) {
        return v
      }
    }
  }))

  return { factory, ast }
}
