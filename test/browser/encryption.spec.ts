import { test } from "@playwright/test"
const tape = require("purple-tape").test
const RAM = require("random-access-memory")
const Hypercore = require("../../src")
const { create, replicate } = require("../helpers")

const encryptionKey = Buffer.alloc(32, "hello world")

test("encrypted append and get", async function () {
  tape("encrypted append and get", async function (t) {
    const a = await create({ encryptionKey })

    t.deepEqual(a.encryptionKey, encryptionKey)

    await a.append(["hello"])

    t.equal(a.byteLength, 5)
    t.equal(a.core.tree.byteLength, 5 + a.padding)

    const unencrypted = await a.get(0)
    t.deepEqual(unencrypted, Buffer.from("hello"))

    const encrypted = await a.core.blocks.get(0)
    t.false(encrypted.includes("hello"))
  })
})

test("encrypted seek", async function () {
  tape("encrypted seek", async function (t) {
    const a = await create({ encryptionKey })

    await a.append(["hello", "world", "!"])

    t.deepEqual(await a.seek(0), [0, 0])
    t.deepEqual(await a.seek(4), [0, 4])
    t.deepEqual(await a.seek(5), [1, 0])
    t.deepEqual(await a.seek(6), [1, 1])
    t.deepEqual(await a.seek(6), [1, 1])
    t.deepEqual(await a.seek(9), [1, 4])
    t.deepEqual(await a.seek(10), [2, 0])
    t.deepEqual(await a.seek(11), [3, 0])
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
      t.deepEqual(await b.get(i), await a.get(i))
    }

    await a.append(["f", "g", "h", "i", "j"])

    for (let i = 5; i < 10; i++) {
      t.deepEqual(await b.get(i), await a.get(i))
    }

    const b2 = await create(a.key)

    replicate(a, b2, t)

    const r2 = b2.download({ start: 0, length: a.length })
    await r2.downloaded()

    for (let i = 0; i < 5; i++) {
      t.deepEqual(await b2.get(i), await a.core.blocks.get(i))
    }

    await a.append(["f", "g", "h", "i", "j"])

    for (let i = 5; i < 10; i++) {
      t.deepEqual(await b2.get(i), await a.core.blocks.get(i))
    }
  })
})

test("encrypted session", async function () {
  tape("encrypted session", async function (t) {
    const a = await create({ encryptionKey })

    await a.append(["hello"])

    const s = a.session()

    t.deepEqual(a.encryptionKey, s.encryptionKey)
    t.deepEqual(await s.get(0), Buffer.from("hello"))

    await s.append(["world"])

    const unencrypted = await s.get(1)
    t.deepEqual(unencrypted, Buffer.from("world"))
    t.deepEqual(await a.get(1), unencrypted)

    const encrypted = await s.core.blocks.get(1)
    t.false(encrypted.includes("world"))
    t.deepEqual(await a.core.blocks.get(1), encrypted)
  })
})

test("encrypted session before ready core", async function () {
  tape("encrypted session before ready core", async function (t) {
    const a = new Hypercore(RAM, { encryptionKey })
    const s = a.session()

    await a.ready()

    t.deepEqual(a.encryptionKey, s.encryptionKey)

    await a.append(["hello"])
    t.deepEqual(await s.get(0), Buffer.from("hello"))
  })
})
