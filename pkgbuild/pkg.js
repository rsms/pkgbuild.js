class Pkg {
  // dir         :string
  // files       :SrcFile[]
  // imports     :Map<string,null> // TODO
  // exports     :Set<string>

  constructor(dir) {
    this.dir = Path.normalize(dir)
    this.name = Path.basename(
      this.dir == '.' ? Path.resolve(this.dir) :
      this.dir
    )
    this.files = []
    this.exports = new Set
  }

  addFile(filename) {
    this.files.push(new SrcFile(filename))
  }

  toString() {
    return `<${this.name.replace('"', '\\"')}>`
  }
}
