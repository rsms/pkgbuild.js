// interface Logger {
//   level :number
//   debug(args... :any[])
//   info(args... :any[])
//   warn(args... :any[])
//   err(args... :any[])
// }

// Logger creates a new logger that writes to `w`.
// w can be a function, an object with three methods: error, warn and log, or
// another Logger.
//
// Logger(level? :number, w? :Writer|LoggerLike)
//
function Logger(level, w) {
  if (level === undefined) {
    level = Logger.INFO
  }
  if (w === undefined) {
    if (typeof console != 'undefined') {
      w = console
    } else {
      level = Logger.NONE
    }
  }
  const noop = () => {}
  const f = w => function () {
    let s = ''
    let lastlf = false
    for (let i = 0; i < arguments.length; ++i) {
      const v = arguments[i]
      if (lastlf) {
        lastlf = false
      } else if (i > 0) {
        s += ' '
      }
      const t = typeof v
      s += String(
        t == 'function' ?
          v() :
        (t && t == 'object' &&
         i > 0 &&
         (!v.toString || v.toString === Object.prototype.toString)
        ) ?
          inspect(v) :
        v
      )
      if (s.charCodeAt(s.length-1) == 0xa) {
        lastlf = true
      }
    }
    w(s)
  }
  if (w.error) {
    return {
      level,
      err:   level < 1 ? noop : f((w.error || w.err).bind(w)),
      warn:  level < 2 ? noop : f(w.warn.bind(w)),
      info:  level < 3 ? noop : f((w.log || w.info).bind(w)),
      debug: level < 4 ? noop : f((w.log || w.info).bind(w)),
    }
  }
  return {
    level,
    err:   level < 1 ? noop : f(w),
    warn:  level < 2 ? noop : f(w),
    info:  level < 3 ? noop : f(w),
    debug: level < 4 ? noop : f(w),
  }
}

Object.defineProperty(Logger, 'default', {
  enumerable: true,
  configurable: true,
  get() {
    const value = Logger()
    Object.defineProperty(Logger, 'default', { enumerable: true, value })
    return value
  }
})

Logger.ALL = Infinity
Logger.DEBUG = 4
Logger.INFO = 3
Logger.WARNING = 2
Logger.ERROR = 1
Logger.NONE = 0
