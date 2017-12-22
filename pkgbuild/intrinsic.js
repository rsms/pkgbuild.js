
class Intrinsic {
  constructor(name, gencode) {
    this.name = name
    this._gencode = gencode
    this._ast = null  // lazy
  }

  getAST(target) {
    let ast
    if (!this._ast) {
      ast = parseHelper(this.name, this._gencode(target))
      this._ast = new Map([ [target, ast] ])
    } else {
      ast = this._ast.get(target)
      if (!ast) {
        ast = ast = parseHelper(this.name, this._gencode(target))
        this._ast.set(target, ast)
      }
    }
    return ast
  }

  toString() {
    return `Intrinsic(${this.name})`
  }
}

const intrinsics = new Map()  // Map<string,Intrinsic>

// (name :string, codeRelease :string, codeDebug? :string)
function defIntrinsic(name, gencode) {
  assert(!intrinsics.has(name))
  intrinsics.set(name, new Intrinsic(name, gencode))
}

// TODO: Figure out a nice way to be able to capture the "cond" input at the
// callsite so we can include it as a string in the error message.
defIntrinsic('assert', target => {
  if (!target.debug) {
    return 'const assert = () => {}'
  }
  let envcode = ''
  
  if (target.envs.includes('nodejs')) {
    if (target.envs.length == 1) {
      return 'var assert = require("assert")'
    }
    envcode = '(typeof require != "undefined" && require("assert")) ||'
  }

  return `
  var assert = ${envcode} function(cond, message) {
    if (!cond) {
      var e
      if (!message) {
        e = new Error()
        message = 'Assertion failed ' + e.stack.split('\\n')[2].trim()
      }
      if (typeof AssertionError == 'undefined') {
        e = new Error(message) 
        e.name = 'AssertionError'
      } else {
        e = new AssertionError(message)
      }
      try {
        var s = e.stack.split('\\n')
        s.splice(1,1)
        e.stack = s.join('\\n')
      } catch (_) {}
      throw e;
    }
  }`
})

defIntrinsic('DEBUG', target =>
  `const DEBUG = ${target.debug ? 'true' : 'false'}`
)
