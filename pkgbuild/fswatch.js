// onChange(changedFilesHint :Set<string>, w? :fsdirWatcher)=>any

class fsdirWatcher {
  constructor(dirs, onChange) {
    this.timeThreshold = 100
    this.onChange = onChange
    this._dirs = new Set(dirs)
    this._fswatchers = new Map() // Map<string,FSWatcher> dir => watcher
    this._timer = null // Timer|null
    this._changes = new Set() // Set<string>
    this._closed = true
    this._paused = true
    this._onChange = (event, filename) => {
      console.log('[fs-change]', event, filename)
      this._changes.add(filename)
      if (!this._paused) {
        this.setHasChanges()
      }
    }
  }

  get dirs() { return this._dirs } // ReadonlySet<string>

  addDir(dir) {
    if (!this._dirs.has(dir)) {
      this._dirs.add(dir)
      if (!this._closed) {
        this._reload()
        this._onChange('added', dir)
      }
    }
  }

  removeDir(dir) {
    if (this._dirs.delete(dir) && !this._closed) {
      this._reload()
      this._onChange('removed', dir)
    }
  }

  _reload() {
    for (const dir of this.dirs) {
      let w = this._fswatchers.get(dir)
      if (!w) {
        // console.log(`start watching ${dir}`)
        w = fs.watch(dir, { recursive: false }, (ev, filename) =>
          this._onChange(ev, Path.join(dir, filename))
        )
        this._fswatchers.set(dir, w)
      }
    }
    const gonedirs = []
    for (const [ dir, w ] of this._fswatchers) {
      if (!this.dirs.has(dir)) {
        w.close()
        gonedirs.push(dir)
      }
    }
    for (const dir of gonedirs) {
      this._fswatchers.delete(dir)
    }
  }

  open() {
    if (!this._closed) {
      panic('already opened')
    }
    this._reload()
    this._closed = false
    this.resume()
  }

  close() {
    if (this._closed) {
      panic('already closed')
    }
    this.pause()
    for (const [dir, w] of this._fswatchers.entries()) {
      w.close()
      this._fswatchers.delete(dir)
    }
    this._closed = true
  }

  resume() {
    if (!this._paused) {
      return
    }
    this._paused = false
    if (this._changes.size) {
      this.setHasChanges()
    }
  }

  pause() {
    if (this._paused) {
      return
    }
    this._paused = true
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
  }

  setHasChanges() {
    if (this._timer) {
      clearTimeout(this._timer)
    }
    this._timer = setTimeout(() => {
      this._timer = null
      this.onChange(this._changes, this)
      this._changes = new Set() // Set<string>
    }, this.timeThreshold)
  }
}
