import { test, expect } from "@playwright/test"

const Tree = require("../lib/merkle-tree")
const ram = require("random-access-memory")

test("nodes", async function () {
  const tree = await create()

  const b = tree.batch()

  for (let i = 0; i < 8; i++) {
    b.append(Buffer.from([i]))
  }

  b.commit()

  expect(await tree.nodes(0)).toBe(0)
})

test("proof only block", async function () {
  const tree = await create(10)

  const proof = await tree.proof({
    block: { index: 4, nodes: 2 },
  })

  expect(proof.upgrade).toBe(null)
  expect(proof.seek).toBe(null)
  expect(proof.block.index).toBe(4)
  expect(proof.block.nodes.length).toBe(2)
  expect(proof.block.nodes.map((n) => n.index)).toEqual([10, 13])
})

test("proof with upgrade", async function () {
  const tree = await create(10)

  const proof = await tree.proof({
    block: { index: 4, nodes: 0 },
    upgrade: { start: 0, length: 10 },
  })

  expect(proof.seek).toBe(null)
  expect(proof.block.index).toBe(4)
  expect(proof.block.nodes.length).toBe(3)
  expect(proof.block.nodes.map((n) => n.index)).toEqual([10, 13, 3])
  expect(proof.upgrade.start).toBe(0)
  expect(proof.upgrade.length).toBe(10)
  expect(proof.upgrade.nodes.map((n) => n.index)).toEqual([17])
  expect(proof.upgrade.additionalNodes.map((n) => n.index)).toEqual([])
})

test("proof with upgrade + additional", async function () {
  const tree = await create(10)

  const proof = await tree.proof({
    block: { index: 4, nodes: 0 },
    upgrade: { start: 0, length: 8 },
  })

  expect(proof.seek).toBe(null)
  expect(proof.block.index).toBe(4)
  expect(proof.block.nodes.length).toBe(3)
  expect(proof.block.nodes.map((n) => n.index)).toEqual([10, 13, 3])
  expect(proof.upgrade.start).toBe(0)
  expect(proof.upgrade.length).toBe(8)
  expect(proof.upgrade.nodes.map((n) => n.index)).toEqual([])
  expect(proof.upgrade.additionalNodes.map((n) => n.index)).toEqual([17])
})

test("proof with upgrade from existing state", async function () {
  const tree = await create(10)

  const proof = await tree.proof({
    block: { index: 1, nodes: 0 },
    upgrade: { start: 1, length: 9 },
  })

  expect(proof.seek).toBe(null)
  expect(proof.block.index).toBe(1)
  expect(proof.block.nodes.length).toBe(0)
  expect(proof.block.nodes.map((n) => n.index)).toEqual([])
  expect(proof.upgrade.start).toBe(1)
  expect(proof.upgrade.length).toBe(9)
  expect(proof.upgrade.nodes.map((n) => n.index)).toEqual([5, 11, 17])
  expect(proof.upgrade.additionalNodes.map((n) => n.index)).toEqual([])
})

test("proof with upgrade from existing state + additional", async function () {
  const tree = await create(10)

  const proof = await tree.proof({
    block: { index: 1, nodes: 0 },
    upgrade: { start: 1, length: 5 },
  })

  expect(proof.seek).toBe(null)
  expect(proof.block.index).toBe(1)
  expect(proof.block.nodes.length).toBe(0)
  expect(proof.block.nodes.map((n) => n.index)).toEqual([])
  expect(proof.upgrade.start).toBe(1)
  expect(proof.upgrade.length).toBe(5)
  expect(proof.upgrade.nodes.map((n) => n.index)).toEqual([5, 9])
  expect(proof.upgrade.additionalNodes.map((n) => n.index)).toEqual([13, 17])
})

test("proof block and seek, no upgrade", async function () {
  const tree = await create(10)

  const proof = await tree.proof({
    seek: { bytes: 8 },
    block: { index: 4, nodes: 2 },
  })

  expect(proof.upgrade).toBe(null)
  expect(proof.seek).toBe(null) // seek included in the block
  expect(proof.block.index).toBe(4)
  expect(proof.block.nodes.length).toBe(2)
  expect(proof.block.nodes.map((n) => n.index)).toEqual([10, 13])
})

test("proof block and seek #2, no upgrade", async function () {
  const tree = await create(10)

  const proof = await tree.proof({
    seek: { bytes: 10 },
    block: { index: 4, nodes: 2 },
  })

  expect(proof.upgrade).toBe(null)
  expect(proof.seek).toBe(null) // seek included in the block
  expect(proof.block.index).toBe(4)
  expect(proof.block.nodes.length).toBe(2)
  expect(proof.block.nodes.map((n) => n.index)).toEqual([10, 13])
})

test("proof block and seek #3, no upgrade", async function () {
  const tree = await create(10)

  const proof = await tree.proof({
    seek: { bytes: 13 },
    block: { index: 4, nodes: 2 },
  })

  expect(proof.upgrade).toBe(null)
  expect(proof.seek.nodes.map((n) => n.index)).toEqual([12, 14])
  expect(proof.block.index).toBe(4)
  expect(proof.block.nodes.length).toBe(1)
  expect(proof.block.nodes.map((n) => n.index)).toEqual([10])
})

test("proof block and seek that results in tree, no upgrade", async function () {
  const tree = await create(16)

  const proof = await tree.proof({
    seek: { bytes: 26 },
    block: { index: 0, nodes: 4 },
  })

  expect(proof.upgrade).toBe(null)
  expect(proof.block.nodes.map((n) => n.index)).toEqual([2, 5, 11])
  expect(proof.seek.nodes.map((n) => n.index)).toEqual([19, 27])
})

test("proof block and seek, with upgrade", async function () {
  const tree = await create(10)

  const proof = await tree.proof({
    seek: { bytes: 13 },
    block: { index: 4, nodes: 2 },
    upgrade: { start: 8, length: 2 },
  })

  expect(proof.seek.nodes.map((n) => n.index)).toEqual([12, 14])
  expect(proof.block.index).toBe(4)
  expect(proof.block.nodes.length).toBe(1)
  expect(proof.block.nodes.map((n) => n.index)).toEqual([10])
  expect(proof.upgrade.start).toBe(8)
  expect(proof.upgrade.length).toBe(2)
  expect(proof.upgrade.nodes.map((n) => n.index)).toEqual([17])
  expect(proof.upgrade.additionalNodes.map((n) => n.index)).toEqual([])
})

test("proof seek with upgrade", async function () {
  const tree = await create(10)

  const proof = await tree.proof({
    seek: { bytes: 13 },
    upgrade: { start: 0, length: 10 },
  })

  expect(proof.seek.nodes.map((n) => n.index)).toEqual([12, 14, 9, 3])
  expect(proof.block).toBe(null)
  expect(proof.upgrade.start).toBe(0)
  expect(proof.upgrade.length).toBe(10)
  expect(proof.upgrade.nodes.map((n) => n.index)).toEqual([17])
  expect(proof.upgrade.additionalNodes.map((n) => n.index)).toEqual([])
})

test("verify proof #1", async function () {
  const tree = await create(10)
  const clone = await create()

  const p = await tree.proof({
    hash: { index: 6, nodes: 0 },
    upgrade: { start: 0, length: 10 },
  })

  const b = await clone.verify(p)
  b.commit()

  expect(clone.length).toBe(tree.length)
  expect(clone.byteLength).toBe(tree.byteLength)
  expect(await clone.byteOffset(6)).toBe(await tree.byteOffset(6))
  expect(await clone.get(6)).toBe(await tree.get(6))
})

test("verify proof #2", async function () {
  const tree = await create(10)
  const clone = await create()

  const p = await tree.proof({
    seek: { bytes: 10 },
    upgrade: { start: 0, length: 10 },
  })

  const b = await clone.verify(p)
  b.commit()

  expect(clone.length).toBe(tree.length)
  expect(clone.byteLength).toBe(tree.byteLength)
  expect(await clone.byteRange(10)).toEqual(await tree.byteRange(10))
})

test("upgrade edgecase when no roots need upgrade", async function () {
  const tree = await create(4)
  const clone = await create()

  {
    const proof = await tree.proof({
      upgrade: { start: 0, length: 4 },
    })

    const b = await clone.verify(proof)
    b.commit()
  }

  const b = tree.batch()
  b.append(Buffer.from("#5"))
  b.commit()

  {
    const proof = await tree.proof({
      upgrade: { start: 4, length: 1 },
    })

    const b = await clone.verify(proof)
    b.commit()
  }

  expect(tree.length).toBe(5)
})

test("lowest common ancestor - small gap", async function () {
  const tree = await create(10)
  const clone = await create(8)
  const ancestors = await reorg(clone, tree)

  expect(ancestors).toBe(8)
  expect(clone.length).toBe(tree.length)
})

test("lowest common ancestor - bigger gap", async function () {
  const tree = await create(20)
  const clone = await create(1)
  const ancestors = await reorg(clone, tree)

  expect(ancestors).toBe(1)
  expect(clone.length).toBe(tree.length)
})

test("lowest common ancestor - remote is shorter than local", async function () {
  const tree = await create(5)
  const clone = await create(10)
  const ancestors = await reorg(clone, tree)

  expect(ancestors).toBe(5)
  expect(clone.length).toBe(tree.length)
})

test("lowest common ancestor - simple fork", async function () {
  const tree = await create(5)
  const clone = await create(5)

  {
    const b = tree.batch()
    b.append(Buffer.from("fork #1"))
    b.commit()
  }

  {
    const b = clone.batch()
    b.append(Buffer.from("fork #2"))
    b.commit()
  }

  const ancestors = await reorg(clone, tree)

  expect(ancestors).toBe(5)
  expect(clone.length).toBe(tree.length)
})

test("lowest common ancestor - long fork", async function () {
  const tree = await create(5)
  const clone = await create(5)

  {
    const b = tree.batch()
    b.append(Buffer.from("fork #1"))
    b.commit()
  }

  {
    const b = clone.batch()
    b.append(Buffer.from("fork #2"))
    b.commit()
  }

  {
    const b = tree.batch()
    for (let i = 0; i < 100; i++) b.append(Buffer.from("#" + i))
    b.commit()
  }

  {
    const b = clone.batch()
    for (let i = 0; i < 100; i++) b.append(Buffer.from("#" + i))
    b.commit()
  }

  const ancestors = await reorg(clone, tree)

  expect(ancestors).toBe(5)
  expect(clone.length).toBe(tree.length)

  expect(await audit(tree)).toBeTruthy()
  await tree.flush()
  expect(await audit(tree)).toBeTruthy()
})

test("tree hash", async function () {
  const a = await create(5)
  const b = await create(5)

  expect(a.hash()).toEqual(b.hash())

  {
    const b = a.batch()
    expect(b.hash()).toEqual(a.hash())
    b.append(Buffer.from("hi"))
    const h = b.hash()
    expect(h).not.toEqual(a.hash())
    b.commit()
    expect(h).toEqual(a.hash())
  }

  {
    const ba = b.batch()
    ba.append(Buffer.from("hi"))
    const h = ba.hash()
    t.notDeepEqual(h, b.hash())
    expect(h).toEqual(a.hash())
    ba.commit()
    expect(h).toEqual(b.hash())
  }
})

test("basic tree seeks", async function () {
  const a = await create(5)

  {
    const b = a.batch()
    b.append(Buffer.from("bigger"))
    b.append(Buffer.from("block"))
    b.append(Buffer.from("tiny"))
    b.append(Buffer.from("s"))
    b.append(Buffer.from("another"))
    b.commit()
  }

  expect(a.length).toBe(10)
  expect(a.byteLength).toBe(33)

  for (let i = 0; i < a.byteLength; i++) {
    const s = a.seek(i)

    const actual = await s.update()
    const expected = await linearSeek(a, i)

    if (actual[0] !== expected[0] || actual[1] !== expected[1]) {
      expect(actual).toBe(expected, "bad seek at " + i)
      return
    }
  }

  async function linearSeek(tree, bytes) {
    for (let i = 0; i < tree.length * 2; i += 2) {
      const node = await tree.get(i)
      if (node.size > bytes) return [i / 2, bytes]
      bytes -= node.size
    }
    return [tree.length, bytes]
  }
})

test("clear full tree", async function () {
  const a = await create(5)

  expect(a.length).toBe(5)

  await a.clear()

  expect(a.length).toBe(0)
  expect(async () => a.get(2)).rejects.toThrow()
})

test("get older roots", async function () {
  const a = await create(5)

  const roots = await a.getRoots(5)
  expect(roots).toEqual(a.roots)

  {
    const b = a.batch()
    b.append(Buffer.from("next"))
    b.append(Buffer.from("next"))
    b.append(Buffer.from("next"))
    b.commit()
  }

  const oldRoots = await a.getRoots(5)
  expect(oldRoots).toEqual(roots)

  const expected = []
  const len = a.length

  for (let i = 0; i < 40; i++) {
    expected.push([...a.roots])
    {
      const b = a.batch()
      b.append(Buffer.from("tick"))
      b.commit()
    }
  }

  const actual = []

  for (let i = 0; i < 40; i++) {
    actual.push(await a.getRoots(len + i))
  }

  expect(actual).toEqual(expected)
})

test("check if a length is upgradeable", async function () {
  const tree = await create(5)
  const clone = await create()

  // Full clone, has it all

  expect(await tree.upgradeable(0)).toBe(true)
  expect(await tree.upgradeable(1)).toBe(true)
  expect(await tree.upgradeable(2)).toBe(true)
  expect(await tree.upgradeable(3)).toBe(true)
  expect(await tree.upgradeable(4)).toBe(true)
  expect(await tree.upgradeable(5)).toBe(true)

  const p = await tree.proof({
    upgrade: { start: 0, length: 5 },
  })

  const b = await clone.verify(p)
  b.commit()

  /*
    Merkle tree looks like

    0─┐
      1─┐
    2─┘ │
        3 <-- root
    4─┐ │
      5─┘
    6─┘

    8 <-- root

    So length = 0, length = 4 (node 3) and length = 5 (node 8 + 3) should be upgradeable
  */

  expect(await clone.upgradeable(0)).toBe(true)
  expect(await clone.upgradeable(1)).toBe(false)
  expect(await clone.upgradeable(2)).toBe(false)
  expect(await clone.upgradeable(3)).toBe(false)
  expect(await clone.upgradeable(4)).toBe(true)
  expect(await clone.upgradeable(5)).toBe(true)
})

async function audit(tree) {
  const flat = require("flat-tree")
  const expectedRoots = flat.fullRoots(tree.length * 2)

  for (const root of tree.roots) {
    if (expectedRoots.shift() !== root.index) return false
    if (!(await check(root))) return false
  }

  if (expectedRoots.length) return false

  return true

  async function check(node) {
    if ((node.index & 1) === 0) return true

    const [l, r] = flat.children(node.index)
    const nl = await tree.get(l, false)
    const nr = await tree.get(r, false)

    if (!nl && !nr) return true

    return (
      tree.crypto.parent(nl, nr).equals(node.hash) &&
      (await check(nl)) &&
      (await check(nr))
    )
  }
}

async function reorg(local, remote) {
  const upgrade = { start: 0, length: remote.length }
  const r = await local.reorg(await remote.proof({ upgrade }))

  while (!r.finished) {
    const nodes = r.want.nodes

    const proof = await remote.proof({ hash: { index, nodes } })
    await r.update(proof)
  }

  r.commit()
  return r.ancestors
}

async function create(length = 0) {
  const tree = await Tree.open(ram())
  const b = tree.batch()
  for (let i = 0; i < length; i++) {
    b.append(Buffer.from("#" + i))
  }
  b.commit()
  return tree
}
