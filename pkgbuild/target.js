
/*constexpr*/ function nameset(s) {
  const names = new Set()
  for (let line of s.trim().split(/\n+/)) {
    line = line.trim()
    if (line.substr(0,2) == '//') {
      continue
    }
    for (const w of line.split(/\s+/)) {
      names.add(w)
    }
  }
  return names
}


class TargetEnv {
  constructor(name, globals, baseEnv) {
    this.name = name       // :string
    this.globals = globals // :Set<string>
    this.baseEnv = baseEnv // :TargetEnv|null
  }
}

const esspecs = new Map([
  ['es5',    5],
  ['es2015', 6],
  ['es2016', 7],
  ['es2017', 8],
  ['esnext', 9],
])

const esspecAliases = new Map([  // Map<string,string>
  ['es6',    'es2015'],
  ['es7',    'es2016'],
  ['es8',    'es2017'],
  
  // esnext
  ['es2018', 'esnext'],
  ['es9',    'esnext'],
  ['latest', 'esnext'],
])

const environments = new Map  // Map<string,TargetEnv[]>


function defTargetEnv(name, baseEnv, globals) {
  const d = new TargetEnv(name, globals, baseEnv)
  environments.set(name, d)
  return d
}


// unknown represents the lowest common denominator of all targets and serves
// as the basis for other, more specific targets.
const unknownEnv = defTargetEnv('unknown', null, nameset(`
  // Value properties
  Infinity NaN undefined

  // Function properties
  eval isFinite isNaN parseFloat parseInt decodeURI decodeURIComponent
  encodeURI encodeURIComponent escape unescape console uneval
  clearTimeout setTimeout clearInterval setInterval

  // Fundamental objects
  Object Function Boolean Symbol Error EvalError InternalError RangeError
  ReferenceError SyntaxError TypeError URIError

  // Numbers and dates
  Number Math Date

  // Text processing
  String RegExp

  // Indexed collections
  Array Int8Array Uint8Array Uint8ClampedArray Int16Array Uint16Array
  Int32Array Uint32Array Float32Array Float64Array

  // Keyed collections
  Map Set WeakMap WeakSet

  // Vector collections
  SIMD

  // Structured data
  JSON ArrayBuffer DataView Atomics SharedArrayBuffer

  // Control abstraction objects
  Promise Generator GeneratorFunction AsyncFunction

  // Reflection
  Reflect Proxy

  // Internationalization (ECMA-402, year 2010)
  Intl

  // WebAssembly
  WebAssembly

  // pkgbuild module
  module exports
`))


defTargetEnv('browser', unknownEnv, nameset(`
  window document location atob btoa

  TextDecoder TextEncoder
  WebSocket
  Worker
  // TODO: complete this list
`))

const commonjsEnv = defTargetEnv('commonjs', unknownEnv, nameset(`
  require
`))

defTargetEnv('nodejs', commonjsEnv, nameset(`
  Buffer
  // TODO: complete this list
`))


// Target represents the target environment some code is being built for.
// e.g. (["nodejs"],"es2016"); (["browser","commonjs"],"es5"); ("unknown",null)
// Absence of esspec assumes latest specification (== "esnext")
//
// To declare custom global identifiers, provide an Iterable<string> with props,
// e.g. new Target('', '', { globals: ['BleedingEdgeFeature'] })
//
class Target {
  // envs            :string[]
  // esspec          :string
  // esspecNum       :number
  // globals         :Set<string>
  // optlevel        :number = 0
  // debug           :bool = false
  // sourceMap       :bool = true
  // supportIE8      :bool
  // supportSafari10 :bool

  // ( envs :string[]|string, esspec :string, props? :{[keyof Target]:any} )
  constructor(envs, esspec, props) {
    if (!Array.isArray(envs)) {
      envs = envs.trim().split(/[\s\t\r\n,;]+/)
    }

    if (envs.length == 0) {
      envs.push('unknown')
    }

    if (!esspec) {
      esspec = 'esnext'
    }

    if ((this.esspecNum = esspecs.get(esspec)) === undefined) {
      let esspecAlias = esspecAliases.get(esspec)
      if (esspecAlias === undefined) {
        throw error(`
          Unknown ES specification "${esspec}";
          Acceptable values: unknown, ${strls(Target.esspecs())}
        `)
      }
      esspec = esspecAlias
      this.esspecNum = esspecs.get(esspec)
      assert(this.esspecNum !== undefined)
    }

    let globals = props.globals ? new Set(props.globals) : new Set()
    for (const envname of envs) {
      let env = environments.get(envname)
      if (!env) {
        throw error(`
          Unexpected environment "${envname}";
          Acceptable values: ${strls(Target.envs())}
        `)
      }
      while (env) {
        for (const name of env.globals) {
          globals.add(name)
        }
        env = env.baseEnv
      }
    }

    this.envs = envs
    this.esspec = esspec
    this.globals = globals
    this.optlevel = props.optlevel || 0
    this.debug = !!props.debug
    this.sourceMap = !!props.sourceMap
    this.supportIE8 = false
    this.supportSafari10 = true
  }

  pureFuncList() {
    // list of known global pure functions that doesn't have any side-effects,
    // provided by the environment.
    return [
      'Math.floor',
      'Math.ceil',
      'Math.round',
      'Math.random',
      // TODO: expand and move to TargetData
    ]
  }

  toString() {
    return (
      `${this.envs.join(',')}-${this.esspec}-` +
      (this.debug ? 'debug' : 'release')
    )
  }
}

Target.envs = () => { // :string[]
  return Array.from(environments.keys())
}

Target.esspecs = () => { // :string[]
  return Array.from(esspecs.keys())
}
