import { test, expect } from "@playwright/test"

const ram = require("random-access-memory")
const Hypercore = require("../../src")
const crypto = require('../../../backbone-crypto')
const b4a = require("b4a")

test("preload - storage", async function () {
  const core = new Hypercore(null, {
    preload: () => {
      return { storage: ram }
    },
  })
  await core.ready()

  await core.append("hello world")
  expect(core.length).toBe(1)
  expect(await core.get(0)).toEqual(Buffer.from("hello world"))
})

test("preload - from another core", async function () {
  const first = new Hypercore(ram)
  await first.ready()

  const second = new Hypercore(null, {
    preload: () => {
      return { from: first }
    },
  })
  await second.ready()

  expect(b4a.equals(first.key, second.key)).toBeTruthy()
  expect(first.sessions).toBe(second.sessions)
})

test("preload - custom keypair", async function () {
  const keyPair = crypto.keyPair()
  const core = new Hypercore(ram, keyPair.publicKey, {
    preload: () => {
      return { keyPair }
    },
  })
  await core.ready()

  expect(core.writable).toBeTruthy()
  expect(b4a.equals(core.key, keyPair.publicKey)).toBeTruthy()
})

test("preload - sign/storage", async function () {
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

  expect(core.writable).toBeTruthy()
  await core.append("hello world")
  expect(core.length).toBe(1)
  expect(await core.get(0)).toBe("hello world")
})
