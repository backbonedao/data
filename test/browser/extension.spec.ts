import { test, expect } from "@playwright/test"

const { create, replicate, eventFlush } = require("../helpers")

test("basic extension", async function () {
  const messages = ["world", "hello"]

  const a = await create()
  a.registerExtension("test-extension", {
    encoding: "utf-8",
    onmessage: (message, peer) => {
      expect(peer === a.peers[0]).toBeTruthy()
      expect(message).toBe(messages.pop())
    },
  })

  const b = await create(a.key)
  const bExt = b.registerExtension("test-extension", {
    encoding: "utf-8",
  })

  replicate(a, b)

  await eventFlush()
  expect(b.peers.length).toBe(1)

  bExt.send("hello", b.peers[0])
  bExt.send("world", b.peers[0])

  await eventFlush()
  expect(messages.length).toBeFalsy()
})

test("two extensions", async function () {
  const messages = ["world", "hello"]

  const a = await create()
  const b = await create(a.key)

  replicate(a, b)

  b.registerExtension("test-extension-1", {
    encoding: "utf-8",
  })
  const bExt2 = b.registerExtension("test-extension-2", {
    encoding: "utf-8",
  })

  await eventFlush()
  expect(b.peers.length).toBe(1)

  bExt2.send("world", b.peers[0])

  await eventFlush()

  a.registerExtension("test-extension-2", {
    encoding: "utf-8",
    onmessage: (message, peer) => {
      expect(peer === a.peers[0]).toBeTruthy()
      expect(message).toBe(messages.pop())
    },
  })

  bExt2.send("hello", b.peers[0])

  await eventFlush()
  expect(messages.length).toBe(1) // First message gets ignored
})
