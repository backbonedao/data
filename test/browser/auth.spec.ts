// @ts-nocheck
import { test, expect } from "@playwright/test"

const ram = require("random-access-memory")
const crypto = require('hypercore-crypto')
const sodium = require("sodium-universal")
const b4a = require("b4a")
const { eventFlush, replicate } = require("../helpers")

const Hypercore = require("../../src")

test("multisig hypercore", async function () {
  const k1 = crypto.keyPair()
  const k2 = crypto.keyPair()

  const auth = {
    sign: (signable) => {
      const sig1 = crypto.sign(signable, k1.secretKey)
      const sig2 = crypto.sign(signable, k2.secretKey)

      return b4a.concat([sig1, sig2])
    },
    verify: (signable, signature) => {
      const sig1 = signature.subarray(0, 65)
      const sig2 = signature.subarray(65)

      return (
        crypto.verify(signable, sig1, k1.publicKey) &&
        crypto.verify(signable, sig2, k2.publicKey)
      )
    },
  }

  const a = new Hypercore(ram, null, {
    valueEncoding: "utf-8",
    auth,
  })

  await a.ready()

  const b = new Hypercore(ram, a.key, {
    valueEncoding: "utf-8",
    auth,
  })

  await b.ready()

  await a.append(["a", "b", "c", "d", "e"])

  expect(a.length).toBe(5)

  replicate(a, b)

  const r = b.download({ start: 0, end: a.length })
  await r.downloaded()

  expect(b.length).toBe(5)
})

test("multisig hypercore with instance and extension", async function () {
  class MultiSigAuth {
    constructor(local, remote, opts = {}) {
      this.local = local
      this.remote = remote

      this._sign = opts.sign
        ? opts.sign
        : (s) => crypto.sign(s, opts.keyPair.secretKey)

      this.sigs = []

      this.localFirst = b4a.compare(this.local, this.remote) < 0
    }

    sign(signable) {
      const sig = this.sigs.find(({ signature }) => {
        const s = b4a.from(signature, "base64")
        return crypto.verify(signable, s, this.remote)
      })

      if (!sig) throw new Error("No remote signature.")

      const local = this._sign(signable)
      const remote = b4a.from(sig.signature, "base64")

      const sigs = []
      sigs.push(this.localFirst ? local : remote)
      sigs.push(this.localFirst ? remote : local)

      return b4a.concat(sigs)
    }

    verify(signable, signature) {
      const sig1 = signature.subarray(0, 65)
      const sig2 = signature.subarray(65)

      const key1 = this.localFirst ? this.local : this.remote
      const key2 = this.localFirst ? this.remote : this.local

      return (
        crypto.verify(signable, sig1, key1) &&
        crypto.verify(signable, sig2, key2)
      )
    }

    addSignature(m) {
      this.sigs.push(m)
    }
  }

  const aKey = crypto.keyPair()
  const bKey = crypto.keyPair()

  const a = new Hypercore(ram, null, {
    valueEncoding: "utf-8",
    auth: new MultiSigAuth(aKey.publicKey, bKey.publicKey, { keyPair: aKey }),
  })

  await a.ready()

  const b = new Hypercore(ram, a.key, {
    valueEncoding: "utf-8",
    auth: new MultiSigAuth(bKey.publicKey, aKey.publicKey, { keyPair: bKey }),
  })

  await b.ready()

  replicate(a, b)

  a.registerExtension("multisig-extension", {
    encoding: "json",
    onmessage: a.auth.addSignature.bind(a.auth),
  })

  const ext = b.registerExtension("multisig-extension", {
    encoding: "json",
    onmessage: b.auth.addSignature.bind(b.auth),
  })

  await eventFlush()
  expect(b.peers.length).toBe(1)

  const data = "hello"

  const batch = b.core.tree.batch()
  batch.append(b._encode(b.valueEncoding, data))

  const signable = batch.signable()
  const signature = crypto.sign(signable, bKey.secretKey).toString("base64")

  ext.send({ data, signature, length: a.length }, b.peers[0])

  await eventFlush()

  await a.append("hello")

  expect(a.length).toBe(1)

  const r = b.download({ start: 0, end: a.length })
  await r.downloaded()

  expect(a.length).toBe(1)
})

test("proof-of-work hypercore", async function () {
  const ZEROES = 8

  const auth = {
    sign: (signable) => {
      const sig = new Uint8Array(32)
      const view = new DataView(sig.buffer)

      for (let i = 0; ; ) {
        view.setUint32(0, i++, true)
        const buf = hash(signable, sig)

        let test = 0
        for (let j = 0; j < ZEROES / 8; j++) test |= buf[j]

        if (test) continue
        return sig
      }
    },
    verify: (signable, signature) => {
      const buf = hash(signable, signature)

      let test = 0
      for (let j = 0; j < ZEROES / 8; j++) test |= buf[j]
      return test === 0
    },
  }

  const a = new Hypercore(ram, null, {
    valueEncoding: "utf-8",
    auth,
  })

  await a.ready()

  const b = new Hypercore(ram, a.key, {
    valueEncoding: "utf-8",
    auth,
  })

  await b.ready()

  await a.append(["a", "b", "c", "d", "e"])

  expect(a.length).toBe(5)

  replicate(a, b)

  const r = b.download({ start: 0, end: a.length })
  await r.downloaded()

  expect(b.length).toBe(5)
})

test("core using custom sign fn", async function () {
  const keyPair = crypto.keyPair()

  const a = new Hypercore(ram, null, {
    valueEncoding: "utf-8",
    sign: (signable) => crypto.sign(signable, keyPair.secretKey),
    keyPair: {
      publicKey: keyPair.publicKey,
    },
  })

  await a.ready()
  const b = new Hypercore(ram, a.key, { valueEncoding: "utf-8" })
  await b.ready()

  await a.append(["a", "b", "c", "d", "e"])

  expect(a.length).toBe(5)

  replicate(a, b)

  const r = b.download({ start: 0, end: a.length })
  await r.downloaded()

  expect(b.length).toBe(5)
})

function hash(...data) {
  const out = b4a.alloc(32)
  sodium.crypto_generichash(out, b4a.concat(data))
  return out
}
