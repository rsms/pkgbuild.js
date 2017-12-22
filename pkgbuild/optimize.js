// interface OptResult {
//   ast      :AST
//   error    :null | Error
//   warnings :null | string[]
// }

function optimize(ast, exportedNames, target) {  // :OptResult
  assert(target.optlevel > 0)
  assert(target.optlevel < 4)

  const r = U.minify(ast, {
    ecma: target.esspecNum,
    warnings: true,
    toplevel: false,
    nameCache: {},
    compress: {
      drop_debugger: !target.debug,
      passes: target.optlevel,
      hoist_vars: true,
      keep_fargs: false, // true = do not discard unused function arguments
      keep_infinity: true, // false = convert `Infinity` to `1/0` (disabled)
      pure_funcs: target.optlevel > 2 ? target.pureFuncList() : null,
        // enable elimination of calls to these functions when the result is
        // unused. Warning: will not check if the name is redefined in scope.
      typeofs: !target.supportIE8,
        // true = transforms `typeof foo == "undefined"` -> foo === void 0
        // when `foo` is known to be defined. Problematic with IE8.

      unsafe_arrows: true,
    },
    mangle: target.optlevel > 2 ? {
      reserved: exportedNames,
      keep_classnames: target.optlevel == 2,
      safari10: target.supportSafari10,
    } : false,
    output: {
      ast: true,
      code: false,
    },
  })

  r.report = function(log, definitions) {
    if (!r.warnings || r.warnings.length == 0) {
      return
    }

    const msgre = /^(.+)\s*\[(.+)\:(\d+),(\d+)\]$/
    const namere = / variable [a-zA-Z0-9_\$]+[\r\n\t\s]*$/

    for (const w of r.warnings) {
      // Note: Unfortunately warnings are just pre-formatted strings and not
      // structures, so we have to resort to string parsing. Frail.
      if (w.indexOf('Dropping unused') == 0) {
        continue
      }
      if (!DEBUG && w.indexOf('Dropping unreachable') == 0) {
        continue
      }
      const m = msgre.exec(w)
      let message = m[1]
      if (target.optlevel > 1) {
        // optimization >1 includes mangling, in which case the names make no
        // sense, so we strip away the names.
        message = message.replace(namere, ' $1')
      }
      const file = m[2]
      if (!DEBUG && file.indexOf('helper:') == 0) {
        continue
      }
      log.warn(`${file}:${m[3]}:${m[4]}: ${message}`)
    }

    // report eliminated code
    for (const [name, def] of definitions) {
      if (def.node.thedef.eliminated) {
        log.debug(() =>
          fmtloc(def.loc) + `: ${name} eliminated (${nodeTypeName(def.node)})`
        )
      }
    }
  }

  return r
}
