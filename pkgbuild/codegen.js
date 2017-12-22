// (...) :{ code :string, map? :string }
function codegen(ast, preamble, target, jsfile) {
  const r = U.minify(ast, {
    ecma: target.esspecNum,
    warnings: true,
    toplevel: true,
    nameCache: {},
    compress: false,
    mangle: false,
    output: {
      preamble: preamble || undefined,
      beautify: target.optlevel < 3,
      indent_level: 2,
      ast: false,
      code: true,
      comments: target.optlevel < 1 && target.debug,
      safari10: target.supportSafari10,
    },

    // https://github.com/mishoo/UglifyJS2/tree/harmony#source-map-options
    sourceMap: target.sourceMap ? {
      filename: jsfile,
      url:      jsfile + '.map'
    } : false,
  })

  if (r.error) {
    throw uglifyerr(r.error)
  }

  if (r.warnings) {
    console.log('[codegen] warnings from uglify:', r.warnings.join('\n'))
  }

  return { code: r.code, map: r.map }
}
