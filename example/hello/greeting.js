
const greetings = [
  'Howdie',
  'Hey',
  'Good day',
  'O hai',
  'Yo',
  'Hello',
]

function greeting(name) {
  assert(name.length > 0, 'name is empty')
  const firstLetter = name[0].toLowerCase().charCodeAt(0)
  return greetings[firstLetter % greetings.length]
}

// This demonstrates conditional compilation.
// When compiled with target.optlevel>0, this code is either stripped,
// or the `if (DEBUG)` check is eliminated (when target.debug==true).
if (DEBUG) {
  let something = timeConsumingCalculation(greetings)
  console.log(`something: ${something.join(', ')}`)
}

function timeConsumingCalculation(stuffs) {
  let v = []
  for (const n of stuffs) {
    let s = ''
    for (const cstr of String(n)) {
      const c = cstr.codePointAt(0)
      if (c < 0x0061) {
        s += String.fromCodePoint(c)
      }
    }
    v.push(s)
  }
  return v
}
