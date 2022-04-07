import { test } from "@playwright/test"
const tape = require("purple-tape").test
const ram = require("random-access-memory")
const Hypercore = require("../../src")
const crypto = require('hypercore-crypto')

test("preload - storage", async function () {
  tape("preload - storage", async function (t) {
    const core = new Hypercore(null, {
      preload: () => {
        return { storage: ram }
      },
    })
    await core.ready()

    await core.append("hello world")
    t.equal(core.length, 1)
    t.deepEqual(await core.get(0), Buffer.from("hello world"))
  })
})

test("preload - from another core", async function () {
  tape("preload - from another core", async function (t) {
    const first = new Hypercore(ram)
    await first.ready()

    const second = new Hypercore(null, {
      preload: () => {
        return { from: first }
      },
    })
    await second.ready()

    t.equal(first.key, second.key)
    t.equal(first.sessions, second.sessions)
  })
})

test("preload - custom keypair", async function () {
  tape("preload - custom keypair", async function (t) {
    const keyPair = crypto.keyPair()
    const core = new Hypercore(ram, keyPair.publicKey, {
      preload: () => {
        return { keyPair }
      },
    })
    await core.ready()

    t.ok(core.writable)
    t.equal(core.key, keyPair.publicKey)
  })
})

test("preload - sign/storage", async function () {
  tape("preload - sign/storage", async function (t) {
    const keyPair = crypto.keyPair()
    const core = new Hypercore(null, keyPair.publicKey, {
      valueEncoding: "utf-8",
      preload: () => {
        return {
          storage: ram,
          auth: {
            sign: (signable) => crypto.sign(signable, keyPair.secretKey),
            verify: (signable, signature) =>
              crypto.verify(signable, signature, keyPair.publicKey),
          },
        }
      },
    })
    await core.ready()

    t.ok(core.writable)
    await core.append("hello world")
    t.equal(core.length, 1)
    t.equal(await core.get(0), "hello world")
  })
})
