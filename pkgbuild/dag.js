// Directed Acyclic Graph
// DAG<Node>
class DAG {
  // nodes :Map<Node, Map<Node,EdgeType>|undefined>

  constructor() {
    this.nodes = new Map()
  }

  // add(fr :any, to? :any, edgeType? :any) :DAG<Node>
  setEdge(fr, to, edgeType) {
    // from -> to
    const dstm = this.nodes.get(fr)
    if (dstm) {
      if (to) {
        dstm.set(to, edgeType)
      }
    } else if (to) {
      this.nodes.set(fr, new Map([[to, edgeType]]))
    } else {
      this.nodes.set(fr, undefined)
    }
    return this
  }

  addNode(fr) {
    if (!this.nodes.has(fr)) {
      this.nodes.set(fr, undefined)
    }
  }

  getDestinations(fr) { // :Map<Node,EdgeType> | undefined
    return this.nodes.get(fr)
  }

  // sort(cyclicCallback :(n2 :Node, n1 :Node, et :EdgeType)=>bool) :Node[]
  sort(cyclicCallback) {
    // L ← Empty list that will contain the sorted nodes
    // while there are unmarked nodes do
    //     select an unmarked node n
    //     visit(n) 
    // function visit(node n)
    //     if n has a temporary mark then stop (not a DAG)
    //     if n is not marked (i.e. has not been visited yet) then
    //         mark n temporarily
    //         for each node m with an edge from n to m do
    //             visit(m)
    //         mark n permanently
    //         unmark n temporarily
    //         add n to head of L
    const L = []
    const mark = new Map()

    const visit = (n, edges, pn, edgeType) => {
      const m = mark.get(n)
      
      if (m == 2) {  // has permanent mark -- has been visited
        return
      }
      if (m == 1) {  // has a temporary mark -- cyclic; not a DAG
        return cyclicCallback(n, pn, edgeType)
      }

      mark.set(n, 1)
      if (edges) for (const e of edges) {
        // edges :Map<Node,EdgeType>|null
        visit(e[0], this.nodes.get(e[0]), n, e[1])
      }
      mark.set(n, 2)

      L.push(n)
    }

    for (const e of this.nodes) {
      visit.apply(this, e)
    }

    return L
  }

  // toDotString(
  //   nodelist?  :Iterable<Node>,
  //   makeattr?  :(n :Node, n2? :Node, edgeType? :EdgeType)=>string
  // ) :string
  toDotString(nodelist, makeattr) {
    let s = ''  // 'digraph D {\n'
    let i = 0
    const ids = new Map()
    const edgeLines = new Map() // Map<attr, string[]>

    let visit = n => {
      if (ids.has(n)) return
      let id = 'N' + (i++)
      const attr = makeattr ? makeattr(n) : null
      const attrs = (
        attr === undefined || attr === null ? ' [ label="' + n + '" ]' :
        attr ? ' ' + attr : ''
      )
      s += '  ' + id + attrs + ';\n'
      ids.set(n, id)
    }

    for (const n of (nodelist || this.nodes.keys())) {
      visit(n)
      const edges = this.nodes.get(n)
      if (edges) {
        edges.forEach((edgeType, n) => visit(n))
      }
    }

    for (const n1 of (nodelist || this.nodes.keys())) {
      const edges = this.nodes.get(n1)
      const id1 = ids.get(n1)

      if (edges) {
        let prefix = '    ' + id1 + ' -> '
        edges.forEach((edgeType, n2) => {
          let usesCustomAttr = false
          let attr = makeattr ? makeattr(n1, n2, edgeType) : null
          
          if (edgeType && (attr === null || attr === undefined)) {
            attr = '[ label="' + String(edgeType).replace('"', '\\"') + '" ]'
          } else if (!attr) {
            attr = ''
          }

          const id2 = ids.get(n2)
          const line = prefix + id2 + ';'

          let lines = edgeLines.get(attr)
          if (!lines) {
            edgeLines.set(attr || '', [line])
          } else {
            lines.push(line)
          }
        })
      }
    }

    // sort edges by attributes
    const attrs = Array.from(edgeLines.keys()).sort()
    for (let i = 0; i < attrs.length; ++i) {
      const attr = attrs[i]
      const lines = edgeLines.get(attr)

      s += `  subgraph S${i} {\n`
      if (attr) {
        s += `    edge ${attr};\n`
      }

      s += lines.join('\n') + '\n  };'

      if (i < attrs.length-1) {
        s += '\n'
      }
    }

    // s += edgeLines.map(l => l[0]).join('\n')

    return s  // + '}\n'
  }
}
