import { test } from "@playwright/test"
const tape = require("purple-tape").test
const RAM = require("random-access-memory")
const Hypercore = require("../../src")
const { create, replicate } = require("../helpers")

const encryptionKey = Buffer.alloc(32, "hello world")

test("encrypted append and get", async function () {
  tape("encrypted append and get", async function (t) {
    const a = await create({ encryptionKey })

    expect(a.encryptionKey).toEqual(encryptionKey)

    await a.append(["hello"])

    expect(a.byteLength).toBe(5)
    expect(a.core.tree.byteLength).toBe(5 + a.padding)

    const unencrypted = await a.get(0)
    expect(unencrypted).toEqual(Buffer.from("hello"))

    const encrypted = await a.core.blocks.get(0)
    t.false(encrypted.includes("hello"))
  })
})

test("encrypted seek", async function () {
  tape("encrypted seek", async function (t) {
    const a = await create({ encryptionKey })

    await a.append(["hello", "world", "!"])

    expect(await a.seek(0)).toEqual([0, 0])
    expect(await a.seek(4)).toEqual([0, 4])
    expect(await a.seek(5)).toEqual([1, 0])
    expect(await a.seek(6)).toEqual([1, 1])
    expect(await a.seek(6)).toEqual([1, 1])
    expect(await a.seek(9)).toEqual([1, 4])
    expect(await a.seek(10)).toEqual([2, 0])
    expect(await a.seek(11)).toEqual([3, 0])
  })
})

test("encrypted replication", async function () {
  tape("encrypted replication", async function (t) {
    const a = await create({ encryptionKey })

    await a.append(["a", "b", "c", "d", "e"])

    const b = await create(a.key, { encryptionKey })

    replicate(a, b, t)

    const r = b.download({ start: 0, length: a.length })
    await r.downloaded()

    for (let i = 0; i < 5; i++) {
      expect(await b.get(i)).toEqual(await a.get(i))
    }

    await a.append(["f", "g", "h", "i", "j"])

    for (let i = 5; i < 10; i++) {
      expect(await b.get(i)).toEqual(await a.get(i))
    }

    const b2 = await create(a.key)

    replicate(a, b2, t)

    const r2 = b2.download({ start: 0, length: a.length })
    await r2.downloaded()

    for (let i = 0; i < 5; i++) {
      expect(await b2.get(i)).toEqual(await a.core.blocks.get(i))
    }

    await a.append(["f", "g", "h", "i", "j"])

    for (let i = 5; i < 10; i++) {
      expect(await b2.get(i)).toEqual(await a.core.blocks.get(i))
    }
  })
})

test("encrypted session", async function () {
  tape("encrypted session", async function (t) {
    const a = await create({ encryptionKey })

    await a.append(["hello"])

    const s = a.session()

    expect(a.encryptionKey).toEqual(s.encryptionKey)
    expect(await s.get(0)).toEqual(Buffer.from("hello"))

    await s.append(["world"])

    const unencrypted = await s.get(1)
    expect(unencrypted).toEqual(Buffer.from("world"))
    expect(await a.get(1)).toEqual(unencrypted)

    const encrypted = await s.core.blocks.get(1)
    t.false(encrypted.includes("world"))
    expect(await a.core.blocks.get(1)).toEqual(encrypted)
  })
})

test("encrypted session before ready core", async function () {
  tape("encrypted session before ready core", async function (t) {
    const a = new Hypercore(RAM, { encryptionKey })
    const s = a.session()

    await a.ready()

    expect(a.encryptionKey).toEqual(s.encryptionKey)

    await a.append(["hello"])
    expect(await s.get(0)).toEqual(Buffer.from("hello"))
  })
})
