
export function message(name) {
  return `${greeting(name)} ${name}`
}

if (module.id == '.') {
  ['Anne', 'Carl', 'Karen', 'Flavio'].forEach(name =>
    console.log(message(name)))
}
