import { test, expect } from "@playwright/test"

const ram = require("random-access-memory")
const crypto = require("hypercore-crypto")
const codecs = require("codecs")

const Hypercore = require("../../src")

test("sessions - can create writable sessions from a read-only core", async function () {
  const keyPair = crypto.keyPair()
  const core = new Hypercore(ram, keyPair.publicKey, {
    valueEncoding: "utf-8",
  })
  await core.ready()
  expect(core.writable).toBeFalsy()

  const session = core.session({
    keyPair: { secretKey: keyPair.secretKey },
  })
  await session.ready()
  expect(session.writable).toBeTruthy()

  expect(async () => await core.append("hello")).rejects.toThrow()

  expect(async () => await session.append("world")).rejects.not.toThrow()

  expect(core.length).toBe(1)
})

test("sessions - writable session with custom sign function", async function () {
  const keyPair = crypto.keyPair()
  const core = new Hypercore(ram, keyPair.publicKey, {
    valueEncoding: "utf-8",
  })
  await core.ready()
  expect(core.writable).toBeFalsy()

  const session = core.session({
    auth: {
      sign: (signable) => crypto.sign(signable, keyPair.secretKey),
      verify: (signable, signature) =>
        crypto.verify(signable, signature, keyPair.publicKey),
    },
  })

  expect(session.writable).toBeTruthy()

  expect(async () => await core.append("hello")).rejects.toThrow()
  expect(async () => await session.append("world")).rejects.not.toThrow()
  expect(core.length).toBe(1)
})

test("sessions - writable session with invalid keypair throws", async function () {
  const keyPair1 = crypto.keyPair()
  const keyPair2 = crypto.keyPair()

  {
    const core = new Hypercore(ram, keyPair2.publicKey) // Create a new core in read-only mode.
    const session = core.session({ keyPair: keyPair1 })
    expect(async () => session.ready()).rejects.toThrow()
  }

  {
    const core = new Hypercore(ram, keyPair1.publicKey, {
      keyPair: keyPair2,
    })
    expect(async () => core.ready()).rejects.toThrow()
  }
})

test("sessions - auto close", async function () {
  const core = new Hypercore(ram, { autoClose: true })

  let closed = false
  core.on("close", function () {
    closed = true
  })

  const a = core.session()
  const b = core.session()

  await a.close()
  expect(closed, "not closed yet").toBeFalsy()

  await b.close()
  expect(closed, "all closed").toBeTruthy()
})

test("sessions - auto close different order", async function () {
  const core = new Hypercore(ram, { autoClose: true })

  const a = core.session()
  const b = core.session()

  let closed = false
  a.on("close", function () {
    closed = true
  })

  await core.close()
  expect(closed, "not closed yet").toBeFalsy()

  await b.close()
  expect(closed, "all closed").toBeTruthy()
})

test("sessions - auto close with all closing", async function () {
  const core = new Hypercore(ram, { autoClose: true })

  const a = core.session()
  const b = core.session()

  let closed = 0
  a.on("close", () => closed++)
  b.on("close", () => closed++)
  core.on("close", () => closed++)

  await Promise.all([core.close(), a.close(), b.close()])
  expect(closed).toBe(3, "all closed")
})

test("sessions - auto close when using from option", async function () {
  const core1 = new Hypercore(ram, {
    autoClose: true,
  })
  const core2 = new Hypercore({
    preload: () => {
      return {
        from: core1,
      }
    },
  })
  await core2.close()
  expect(core1.closed).toBeTruthy()
})

test("sessions - close with from option", async function () {
  const core1 = new Hypercore(ram)
  await core1.append("hello world")

  const core2 = new Hypercore({
    preload: () => {
      return {
        from: core1,
      }
    },
  })
  await core2.close()

  expect(core1.closed).toBeFalsy()
  expect(await core1.get(0)).toEqual(Buffer.from("hello world"))
})

test("sessions - custom valueEncoding on session", async function () {
  const core1 = new Hypercore(ram)
  await core1.append(codecs("json").encode({ a: 1 }))

  const core2 = core1.session({ valueEncoding: "json" })
  await core2.append({ b: 2 })

  expect(await core2.get(0)).toEqual({ a: 1 })
  expect(await core2.get(1)).toEqual({ b: 2 })
})

test("sessions - custom preload hook on first/later sessions", async function () {
  let called = 0
  const core1 = new Hypercore(ram, {
    preload: () => {
      called = 1
      return null
    },
  })
  await core1.ready()
  expect(called).toBe(1)

  const core2 = core1.session({
    preload: () => {
      called = 2
      return null
    },
  })
  await core2.ready()
  expect(called).toBe(2)
})
