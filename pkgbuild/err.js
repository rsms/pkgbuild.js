const Errors = new Set([
  'E_MUTDEP',
    // mutual file dependencies in a package. Represents a cyclic reference
    // that's dereferenced at initialization time. See also: W_MUTDEP
  'E_SYN_DUPID', // duplicate identifier inside a package
  'E_SYN_BADEXPORT', // unsupported export (depends on target)
  'E_REFUNDEF',  // reference to undefined identifier
])

const Warnings = new Set([
  'W_MUTDEP',
    // mutual file dependencies in a package. Represents a cyclic reference
    // that's most likely dereferenced at runtime. See also: E_MUTDEP
  'W_UNUSED',
    // something is defined, but never used
])
