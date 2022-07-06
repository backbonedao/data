import { test, expect } from "@playwright/test"

const sodium = require("sodium-universal")
const crypto = require('hypercore-crypto')
const RAM = require("random-access-memory")
const Hypercore = require("../../src")

const keyPair = crypto.keyPair(
  Buffer.alloc(sodium.crypto_sign_SEEDBYTES, "seed")
)

const encryptionKey = Buffer.alloc(
  sodium.crypto_stream_KEYBYTES,
  "encryption key"
)

test.skip("storage layout", async function () {
  const core = new Hypercore(RAM, { keyPair })

  for (let i = 0; i < 10; i++) {
    await core.append(Buffer.from([i]))
  }
  // TODO: How to replicate Brittle's snapshot?
  t.snapshot(core.core.blocks.storage.toBuffer().toString("base64"), "blocks")
  t.snapshot(core.core.tree.storage.toBuffer().toString("base64"), "tree")
})

test.skip("encrypted storage layout", async function () {
  const core = new Hypercore(RAM, { keyPair, encryptionKey })

  for (let i = 0; i < 10; i++) {
    await core.append(Buffer.from([i]))
  }

  t.snapshot(core.core.blocks.storage.toBuffer().toString("base64"), "blocks")
  t.snapshot(core.core.tree.storage.toBuffer().toString("base64"), "tree")
})
