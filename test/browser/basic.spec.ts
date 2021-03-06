import { test, expect } from "@playwright/test"

const ram = require("random-access-memory")
const b4a = require("b4a")
const Hypercore = require("../../src")
const { create, eventFlush } = require("../helpers")

test("basic", async function () {
  const core = await create()
  let appends = 0

  expect(core.length).toBe(0)
  expect(core.byteLength).toBe(0)
  expect(core.writable).toBe(true)
  expect(core.readable).toBe(true)

  core.on("append", function () {
    appends++
  })

  await core.append("hello")
  await core.append("world")

  expect(core.length).toBe(2)
  expect(core.byteLength).toBe(10)
  expect(appends).toBe(2)
})

test("session", async function () {
  const core = await create()

  const session = core.session()

  await session.append("test")
  expect(b4a.from("test").equals(await core.get(0))).toBeTruthy()
  expect(b4a.from("test").equals(await session.get(0))).toBeTruthy()
})

test("close", async function () {
  const core = await create()
  await core.append("hello world")

  await core.close()

  expect(async () => core.get(0)).rejects.toThrow()
})

test("close multiple", async function () {
  const core = await create()
  await core.append("hello world")

  /*
    Note: What is the point of this?

    const ev = t.test("events")

    ev.plan(4)

    let i = 0

    core.on("close", () => ev.is(i++, 0, "on close"))
    core.close().then(() => ev.is(i++, 1, "first close"))
    core.close().then(() => ev.is(i++, 2, "second close"))
    core.close().then(() => ev.is(i++, 3, "third close")) 

    await ev
    */
  let i = 0

  core.on("close", () => {
    expect(i++).toBe(0)
  })
  await core.close()
  expect(i++).toBe(1)
  await core.close()
  expect(i++).toBe(2)
  await core.close()
  expect(i++).toBe(3)
  expect(i).toBe(4)
})

test("storage options", async function () {
  const core = new Hypercore({ storage: ram })
  await core.append("hello")
  expect(b4a.from("hello").equals(await core.get(0))).toBeTruthy()
})

test("createIfMissing", async function () {
  const core = new Hypercore(ram, { createIfMissing: false })

  expect(async () => core.ready()).rejects.toThrow()
})

test("reopen and overwrite", async function () {
  const st = {}
  const core = new Hypercore(open)

  await core.ready()
  const key = core.key

  const reopen = new Hypercore(open)

  await reopen.ready()
  expect(b4a.from(reopen.key).equals(key), "reopened the core").toBeTruthy()

  const overwritten = new Hypercore(open, { overwrite: true })

  await overwritten.ready()
  expect(
    b4a.from(overwritten.key).equals(key),
    "overwrote the core"
  ).toBeFalsy()

  function open(name) {
    if (st[name]) return st[name]
    st[name] = ram()
    return st[name]
  }
})

test("truncate event has truncated-length and fork", async function () {
  const core = new Hypercore(ram)

  core.on("truncate", function (length, fork) {
    expect(length).toBe(2)
    expect(fork).toBe(1)
  })

  await core.append(["a", "b", "c"])
  await core.truncate(2)
})

test("treeHash gets the tree hash at a given core length", async function () {
  const core = new Hypercore(ram)
  await core.ready()

  const {
    core: { tree },
  } = core

  const hashes = [tree.hash()]

  for (let i = 1; i < 10; i++) {
    await core.append([`${i}`])
    hashes.push(tree.hash())
  }

  for (let i = 0; i < 10; i++) {
    expect(b4a.from(await core.treeHash(i)).equals(hashes[i])).toBeTruthy()
  }
})

test("snapshot locks the state", async function () {
  const core = new Hypercore(ram)
  await core.ready()

  const a = core.snapshot()

  await core.append("a")

  expect(a.length).toBe(0)
  expect(core.length).toBe(1)

  const b = core.snapshot()

  await core.append("c")

  expect(a.length).toBe(0)
  expect(b.length).toBe(1)
})

test("downloading local range", async function () {
  const core = new Hypercore(ram)

  await core.append("a")

  const range = core.download({ start: 0, end: 1 })

  await eventFlush()

  await range.destroy()
})

test("read ahead", async function () {
  const core = new Hypercore(ram, { valueEncoding: "utf-8" })

  await core.append("a")

  const blk = core.get(1, { wait: true }) // readahead

  await eventFlush()

  await core.append("b")

  expect(await blk).toBe("b")
})
