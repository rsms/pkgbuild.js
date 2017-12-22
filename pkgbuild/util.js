const U = UglifyJS || require('uglify-es')
const fs = require('fs')
const Path = require('path')
const inspect = require('util').inspect
// const assert = require('assert')

// function repr(o, depth, showHidden) {
//   return inspect(o, {
//     depth: depth === undefined ? 3 : depth,
//     colors: true,
//     showHidden: showHidden,
//   })
// }


// interface SrcLoc {
//   file :string
//   line :number
//   col  :number
// }

function isloc(o) {
  return (o.filename || o.file) && o.line !== undefined && o.col !== undefined
}

// fmtloc(loc :SrcLoc) :string
function fmtloc(loc) {
  return (
    loc.line < 0 ? loc.filename || loc.file :
    `${loc.filename || loc.file}:${loc.line}:${loc.col+1}`
  )
}

function panic(msg) {
  const e = new Error(msg)
  e.name = 'panic'
  if (Error.captureStackTrace) {
    Error.captureStackTrace(e, panic)
  }
  const p = e.stack.indexOf('\n')
  if (p != -1) {
    e.stack = e.stack.substr(p+1)
  }
  throw e
}


// codegenNodes(n... :ASTNode[])
function codegenNodes() {
  const body = [].slice.call(arguments)
  return U.minify(new U.AST_Toplevel({ body }), {
    compress: false,
    mangle: false,
    output: {
      code: true,
      beautify: true,
      indent_level: 2,
      comments: false,
    },
  }).code
}


// strls(collection :Iterable<any>) :string
// e.g. strls([1,2,3]) => '1, 2 and 3'
//
function strls(collection) {
  let s = '', v
  if (collection.length !== undefined) {
    v = collection
  } else {
    v = []
    for (const e of collection) {
      v.push(e)
    }
  }
  const lasti = v.length - 1
  for (let i = 0; i <= lasti; ++i) {
    if (i > 0) {
      s += i == lasti ? ' and ' : ', '
    }
    s += v[i]
  }
  return s
}

// cws collapses whitespace and trims any whitespace from the beginning and end
// of a string. Conveniently used as a prefix function for multiline string
// literals, e.g. cws`\n hello\n   wor\n  ld` => `hello wor ld`
// 
function cws(strings) {
  let s = strings
  if (Array.isArray(s)) {
    s = s[0]
    let ae = arguments.length - 1
    let ai = 1
    let si = 1
    while (ai < ae) {
      let a = arguments[ai]
      s += a
      let str = strings[si++]
      if (str === undefined) {
        break
      }
      s += str
    }
  }
  return s.trim().replace(/[\s\t\r\n]+/g, ' ')
}

// error creates a new Error with message and optional name.
//
// error(name :string, message :string) :Error
// error(message :string) :Error
function error(name, message) {
  if (message === undefined) {
    return new Error(cws(name))
  }
  const e = new Error(cws(message))
  e.name = name
  return e
}


// stripext removes the filename extension from a filename
// e.g. "/foo/bar/lol.cat" => "/foo/bar/lol"
// e.g. "/foo/bar/.lol" => "/foo/bar/.lol"
//
// function stripext(fn) {
//   const di = fn.lastIndexOf('.')
//   if (di < 1) {
//     return fn
//   }
//   const si = fn.lastIndexOf('/')
//   return (si == -1 || di > si+1) ? fn.substr(0, di) : fn
// }


function uglifyerr(e) {
  const err = e.stack ? e : new Error()
  err.name = e.name || err.name
  if (e.message) {
    let msg = e.message
    if (isloc(e)) {
      msg += ` [${fmtloc(e)}]`
    }
    err.message = msg
  }
  if (!e.stack && Error.captureStackTrace) {
    Error.captureStackTrace(err, uglifyerr)
  }
  return err
}


function nodeTypeName(n) {
  if (n instanceof U.AST_SymbolLet ||
      n instanceof U.AST_SymbolVar)
  {
    return "variable"
  }

  if (n instanceof U.AST_SymbolConst) {
    return "constant"
  }

  if (n instanceof U.AST_SymbolDefun) {
    return "function"
  }

  if (n instanceof U.AST_SymbolDefClass) {
    return "class"
  }

  return n.CTOR ? (n.CTOR.TYPE || '?') : '?'
}


function fmtbytesize(n) {
  return (
    n < 1024 ? n + ' B' :
    n <= 1024 * 1024 ? (n/1024).toFixed(1) + ' kB' :
    (n/(1024 * 1024)).toFixed(1) + ' MB'
  )
}

function readfile(filename, encodingOrOptions) { // :Promise<Buffer|string>
  return new Promise((resolve, reject) => {
    fs.readFile(filename, encodingOrOptions, (err, content) => {
      err ? reject(err) : resolve(content)
    })
  })
}


export function writefile(filename, data, log) {
  return new Promise((resolve, reject) => {
    if (log) {
      log.info(() => `${filename}: write ${fmtbytesize(data.length)}`)
    }
    fs.writeFile(
      filename,
      data,
      {encoding:'utf8'},
      err => err ? reject(err) : resolve()
    )
  })
}


function parse(source) {
  return U.minify(source, {
    ecma:  999,
    parse: {},
    compress: false,
    mangle: false,
    output: { ast: true, code: false },
  })
}

function parseHelper(name, code, vars) {
  let r = parse({ ['helper:' + name]: code })

  if (r.error) {
    throw uglifyerr(r.error)
  }

  // uncomment the following code if we would need to store the AST that has
  // template vars rather than the "baked" version.
  //
  // return r.ast.walk(new U.TreeWalker((n, descend) => {
  //   // scrub source location
  //   n.start = n.end = undefined
  // }))

  return r.ast
}
