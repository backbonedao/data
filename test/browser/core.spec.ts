import { test, expect } from "@playwright/test"

const RAM = require("random-access-memory")
const Core = require("../../lib/core")
const b4a = require("b4a")

test("core - append", async function () {
  const { core } = await create()

  {
    const seq = await core.append([b4a.from("hello"), b4a.from("world")])

    t.equal(seq, 0)
    t.equal(core.tree.length, 2)
    t.equal(core.tree.byteLength, 10)
    t.deepEqual(
      b4a.concat([
        b4a.from(await core.blocks.get(0)),
        b4a.from(await core.blocks.get(1)),
      ]),
      b4a.concat([b4a.from("hello"), b4a.from("world")])
    )
  }

  {
    const seq = await core.append([b4a.from("hej")])

    t.equal(seq, 2)
    t.equal(core.tree.length, 3)
    t.equal(core.tree.byteLength, 13)
    t.true(
      b4a
        .from(
          b4a.concat([
            b4a.from(await core.blocks.get(0)),
            b4a.from(await core.blocks.get(1)),
            b4a.from(await core.blocks.get(2)),
          ])
        )
        .equals(
          b4a.concat([b4a.from("hello"), b4a.from("world"), b4a.from("hej")])
        )
    )
  }
})

test("core - append and truncate", async function () {
  const { core, reopen } = await create()

  await core.append([
    b4a.from("hello"),
    b4a.from("world"),
    b4a.from("fo"),
    b4a.from("ooo"),
  ])

  await core.truncate(3, 1)

  t.equal(core.tree.length, 3)
  t.equal(core.tree.byteLength, 12)
  t.equal(core.tree.fork, 1)
  t.deepEqual(core.header.hints.reorgs, [{ from: 0, to: 1, ancestors: 3 }])

  await core.append([
    b4a.from("a"),
    b4a.from("b"),
    b4a.from("c"),
    b4a.from("d"),
  ])

  await core.truncate(3, 2)

  t.equal(core.tree.length, 3)
  t.equal(core.tree.byteLength, 12)
  t.equal(core.tree.fork, 2)
  t.deepEqual(core.header.hints.reorgs, [
    { from: 0, to: 1, ancestors: 3 },
    { from: 1, to: 2, ancestors: 3 },
  ])

  await core.truncate(2, 3)

  t.deepEqual(core.header.hints.reorgs, [{ from: 2, to: 3, ancestors: 2 }])

  await core.append([b4a.from("a")])
  await core.truncate(2, 4)

  await core.append([b4a.from("a")])
  await core.truncate(2, 5)

  await core.append([b4a.from("a")])
  await core.truncate(2, 6)

  await core.append([b4a.from("a")])
  await core.truncate(2, 7)

  t.equal(core.header.hints.reorgs.length, 4)

  // check that it was persisted
  const coreReopen = await reopen()

  t.equal(coreReopen.tree.length, 2)
  t.equal(coreReopen.tree.byteLength, 10)
  t.equal(coreReopen.tree.fork, 7)
  t.equal(coreReopen.header.hints.reorgs.length, 4)
})

test("core - user data", async function () {
  const { core, reopen } = await create()

  await core.userData("hello", b4a.from("world"))
  t.deepEqual(core.header.userData, [
    { key: "hello", value: b4a.from("world") },
  ])

  await core.userData("hej", b4a.from("verden"))
  t.deepEqual(core.header.userData, [
    { key: "hello", value: b4a.from("world") },
    { key: "hej", value: b4a.from("verden") },
  ])

  await core.userData("hello", null)
  t.deepEqual(core.header.userData, [{ key: "hej", value: b4a.from("verden") }])

  await core.userData("hej", b4a.from("world"))
  t.deepEqual(core.header.userData, [{ key: "hej", value: b4a.from("world") }])

  // check that it was persisted
  const coreReopen = await reopen()

  t.deepEqual(coreReopen.header.userData, [
    { key: "hej", value: b4a.from("world") },
  ])
})

test("core - verify", async function () {
  const { core } = await create()
  const { core: clone } = await create({
    keyPair: { publicKey: core.header.signer.publicKey },
  })

  expect(
    b4a.equals(clone.header.signer.publicKey, core.header.signer.publicKey)
  ).toBeTruthy()

  await core.append([b4a.from("a"), b4a.from("b")])

  {
    const p = await core.tree.proof({ upgrade: { start: 0, length: 2 } })
    await clone.verify(p)
  }

  t.equal(clone.header.tree.length, 2)
  expect(
    b4a.equals(clone.header.tree.signature, core.header.tree.signature)
  ).toBeTruthy()

  {
    const p = await core.tree.proof({
      block: { index: 1, nodes: await clone.tree.nodes(2), value: true },
    })
    p.block.value = await core.blocks.get(1)
    await clone.verify(p)
  }
})

test("core - verify parallel upgrades", async function () {
  const { core } = await create()
  const { core: clone } = await create({
    keyPair: { publicKey: core.header.signer.publicKey },
  })

  expect(
    b4a.equals(clone.header.signer.publicKey, core.header.signer.publicKey)
  ).toBeTruthy()

  await core.append([
    b4a.from("a"),
    b4a.from("b"),
    b4a.from("c"),
    b4a.from("d"),
  ])

  {
    const p1 = await core.tree.proof({ upgrade: { start: 0, length: 2 } })
    const p2 = await core.tree.proof({ upgrade: { start: 0, length: 3 } })

    const v1 = clone.verify(p1)
    const v2 = clone.verify(p2)

    await v1
    await v2
  }

  t.equal(clone.header.tree.length, core.header.tree.length)
  expect(
    b4a.equals(clone.header.tree.signature, core.header.tree.signature)
  ).toBeTruthy()
})

test("core - update hook is triggered", async function () {
  const { core } = await create()
  const { core: clone } = await create({
    keyPair: { publicKey: core.header.signer.publicKey },
  })

  let ran = 0

  core.onupdate = (status, bitfield, value, from) => {
    t.equal(status, 0b01, "was appended")
    t.equal(from, null, "was local")
    expect(bitfield).toEqual({ drop: false, start: 0, length: 4 })
    ran |= 1
  }

  await core.append([
    b4a.from("a"),
    b4a.from("b"),
    b4a.from("c"),
    b4a.from("d"),
  ])

  const peer = {}

  clone.onupdate = (status, bitfield, value, from) => {
    t.equal(status, 0b01, "was appended")
    t.equal(from, peer, "was remote")
    expect(bitfield).toEqual({ drop: false, start: 1, length: 1 })
    expect(value).toEqual(b4a.from("b"))
    ran |= 2
  }

  {
    const p = await core.tree.proof({
      block: { index: 1, nodes: 0, value: true },
      upgrade: { start: 0, length: 2 },
    })
    p.block.value = await core.blocks.get(1)
    await clone.verify(p, peer)
  }

  clone.onupdate = (status, bitfield, value, from) => {
    t.equal(status, 0b00, "no append or truncate")
    t.equal(from, peer, "was remote")
    expect(bitfield).toEqual({ drop: false, start: 3, length: 1 })
    expect(value).toEqual(b4a.from("d"))
    ran |= 4
  }

  {
    const p = await core.tree.proof({
      block: { index: 3, nodes: await clone.tree.nodes(6), value: true },
    })
    p.block.value = await core.blocks.get(3)
    await clone.verify(p, peer)
  }

  core.onupdate = (status, bitfield, value, from) => {
    t.equal(status, 0b10, "was truncated")
    t.equal(from, null, "was local")
    expect(bitfield).toEqual({ drop: true, start: 1, length: 3 })
    ran |= 8
  }

  await core.truncate(1, 1)

  core.onupdate = (status, bitfield, value, from) => {
    t.equal(status, 0b01, "was appended")
    t.equal(from, null, "was local")
    expect(bitfield).toEqual({ drop: false, start: 1, length: 1 })
    ran |= 16
  }

  await core.append([b4a.from("e")])

  clone.onupdate = (status, bitfield, value, from) => {
    t.equal(status, 0b11, "was appended and truncated")
    t.equal(from, peer, "was remote")
    expect(bitfield).toEqual({ drop: true, start: 1, length: 3 })
    ran |= 32
  }

  {
    const p = await core.tree.proof({
      hash: { index: 0, nodes: 0 },
      upgrade: { start: 0, length: 2 },
    })
    const r = await clone.tree.reorg(p)
    await clone.reorg(r, peer)
  }

  core.onupdate = (status, bitfield, value, from) => {
    t.equal(status, 0b10, "was truncated")
    t.equal(from, null, "was local")
    expect(bitfield).toEqual({ drop: true, start: 1, length: 1 })
    ran |= 64
  }

  await core.truncate(1, 2)

  clone.onupdate = (status, bitfield, value, from) => {
    t.equal(status, 0b10, "was truncated")
    t.equal(from, peer, "was remote")
    expect(bitfield).toEqual({ drop: true, start: 1, length: 1 })
    ran |= 128
  }

  {
    const p = await core.tree.proof({
      hash: { index: 0, nodes: 0 },
      upgrade: { start: 0, length: 1 },
    })
    const r = await clone.tree.reorg(p)

    await clone.reorg(r, peer)
  }

  t.equal(ran, 255, "ran all")
})

async function create(opts) {
  const storage = new Map()

  const createFile = (name) => {
    if (storage.has(name)) return storage.get(name)
    const s = new RAM()
    storage.set(name, s)
    return s
  }

  const reopen = () => Core.open(createFile, opts)
  const core = await reopen()
  return { core, reopen }
}
