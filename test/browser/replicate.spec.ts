import { test, expect } from "@playwright/test"

const NoiseSecretStream = require("@hyperswarm/secret-stream")
const { create, replicate, eventFlush } = require("../helpers")

test("basic replication", async function () {
  const a = await create()

  await a.append(["a", "b", "c", "d", "e"])

  const b = await create(a.key)

  let d = 0
  b.on("download", () => d++)

  replicate(a, b)

  const r = b.download({ start: 0, end: a.length })

  await r.downloaded()

  expect(d).toBe(5)
})

test("basic replication from fork", async function () {
  const a = await create()

  await a.append(["a", "b", "c", "d", "e"])
  await a.truncate(4)
  await a.append("e")

  expect(a.fork).toBe(1)

  const b = await create(a.key)

  replicate(a, b)

  let d = 0
  b.on("download", () => d++)

  const r = b.download({ start: 0, end: a.length })

  await r.downloaded()

  expect(d).toBe(5)
  expect(a.fork).toBe(b.fork)
})

test("eager replication from bigger fork", async function () {
  const a = await create()
  const b = await create(a.key)

  replicate(a, b)

  await a.append(["a", "b", "c", "d", "e", "g", "h", "i", "j", "k"])
  await a.truncate(4)
  await a.append(["FORKED", "g", "h", "i", "j", "k"])

  expect(a.fork).toBe(1)

  let d = 0
  b.on("download", (index) => {
    d++
  })

  const r = b.download({ start: 0, end: a.length })
  await r.downloaded()

  expect(d).toBe(a.length)
  expect(a.fork).toBe(b.fork)
})

test("eager replication of updates per default", async function () {
  const a = await create()
  const b = await create(a.key)

  replicate(a, b)

  const appended = new Promise((resolve) => {
    b.on("append", function () {
      resolve()
    })
  })

  await a.append(["a", "b", "c", "d", "e", "g", "h", "i", "j", "k"])
  await appended
})

test("bigger download range", async function () {
  const a = await create()
  const b = await create(a.key)

  replicate(a, b)

  for (let i = 0; i < 20; i++) await a.append("data")

  const downloaded = new Set()

  b.on("download", function (index) {
    downloaded.add(index)
  })

  const r = b.download({ start: 0, end: a.length })
  await r.downloaded()

  expect(b.length).toBe(a.length, "same length")
  expect(downloaded.size).toBe(a.length, "downloaded all")
})

test("high latency reorg", async function () {
  const a = await create()
  const b = await create(a.key)

  const s = replicate(a, b)

  for (let i = 0; i < 50; i++) await a.append("data")

  {
    const r = b.download({ start: 0, end: a.length })
    await r.downloaded()
  }

  s[0].destroy()
  s[1].destroy()

  await a.truncate(30)

  for (let i = 0; i < 50; i++) await a.append("fork")

  replicate(a, b)

  {
    const r = b.download({ start: 0, end: a.length })
    await r.downloaded()
  }

  let same = 0

  for (let i = 0; i < a.length; i++) {
    const ba = await a.get(i)
    const bb = await b.get(i)
    if (ba.equals(bb)) same++
  }

  expect(a.fork).toBe(1)
  expect(a.fork).toBe(b.fork)
  expect(same).toBe(80)
})

test("invalid signature fails", async function () {
  const a = await create(null, {
    auth: {
      sign() {
        return Buffer.alloc(64)
      },
      verify(s, sig) {
        return false
      },
    },
  })

  const b = await create(a.key)

  await a.append(["a", "b", "c", "d", "e"])

  const [s1, s2] = replicate(a, b)

  s1.on("error", (err) => {
    expect(err, "stream closed").toBeTruthy()
  })

  s2.on("error", (err) => {
    expect(err.message).toBe("Remote signature does not match")
  })

  return new Promise((resolve) => {
    let missing = 2

    s1.on("close", onclose)
    s2.on("close", onclose)

    function onclose() {
      if (--missing === 0) resolve()
    }
  })
})

test("invalid capability fails", async function () {
  const a = await create()
  const b = await create()

  b.replicator.discoveryKey = a.discoveryKey

  await a.append(["a", "b", "c", "d", "e"])

  const [s1, s2] = replicate(a, b)

  s1.on("error", (err) => {
    expect(err, "stream closed").toBeTruthy()
  })

  s2.on("error", (err) => {
    expect(err.message).toBe("Remote sent an invalid capability")
  })

  return new Promise((resolve) => {
    let missing = 2

    s1.on("close", onclose)
    s2.on("close", onclose)

    function onclose() {
      if (--missing === 0) resolve()
    }
  })
})

test("update with zero length", async function () {
  const a = await create()
  const b = await create(a.key)

  replicate(a, b)

  await b.update() // should not hang
  expect(b.length).toBe(0)
})

test("basic multiplexing", async function () {
  const a1 = await create()
  const a2 = await create()

  const b1 = await create(a1.key)
  const b2 = await create(a2.key)

  const a = a1.replicate(a2.replicate(true, { keepAlive: false }))
  const b = b1.replicate(b2.replicate(false, { keepAlive: false }))

  a.pipe(b).pipe(a)

  await a1.append("hi")
  expect(await b1.get(0)).toEqual(Buffer.from("hi"))

  await a2.append("ho")
  expect(await b2.get(0)).toEqual(Buffer.from("ho"))
})

test("async multiplexing", async function () {
  const a1 = await create()
  const b1 = await create(a1.key)

  const a = a1.replicate(true, { keepAlive: false })
  const b = b1.replicate(false, { keepAlive: false })

  a.pipe(b).pipe(a)

  const a2 = await create()
  await a2.append("ho")

  const b2 = await create(a2.key)

  // b2 doesn't replicate immediately.
  a2.replicate(a)
  await eventFlush()
  b2.replicate(b)

  await new Promise((resolve) => b2.once("peer-add", resolve))

  expect(b2.peers.length).toBe(1)
  expect(await b2.get(0)).toEqual(Buffer.from("ho"))
})

test("multiplexing with external noise stream", async function () {
  const a1 = await create()
  const a2 = await create()

  const b1 = await create(a1.key)
  const b2 = await create(a2.key)

  const n1 = new NoiseSecretStream(true)
  const n2 = new NoiseSecretStream(false)
  n1.rawStream.pipe(n2.rawStream).pipe(n1.rawStream)

  a1.replicate(n1, { keepAlive: false })
  a2.replicate(n1, { keepAlive: false })
  b1.replicate(n2, { keepAlive: false })
  b2.replicate(n2, { keepAlive: false })

  await a1.append("hi")
  expect(await b1.get(0)).toEqual(Buffer.from("hi"))

  await a2.append("ho")
  expect(await b2.get(0)).toEqual(Buffer.from("ho"))
})

test("seeking while replicating", async function () {
  const a = await create()
  const b = await create(a.key)

  replicate(a, b)

  await a.append(["hello", "this", "is", "test", "data"])

  expect(await b.seek(6)).toEqual([1, 1])
})

test("multiplexing multiple times over the same stream", async function () {
  const a1 = await create()

  await a1.append("hi")

  const b1 = await create(a1.key)

  const n1 = new NoiseSecretStream(true)
  const n2 = new NoiseSecretStream(false)

  n1.rawStream.pipe(n2.rawStream).pipe(n1.rawStream)

  a1.replicate(n1, { keepAlive: false })

  b1.replicate(n2, { keepAlive: false })
  b1.replicate(n2, { keepAlive: false })

  expect(await b1.update()).toBeTruthy()
  expect(await a1.update()).toBeFalsy()
  expect(await b1.update()).toBeFalsy()

  expect(b1.length).toBe(a1.length)
})

test("destroying a stream and re-replicating works", async function () {
  const core = await create()

  while (core.length < 33) await core.append(Buffer.from("#" + core.length))

  const clone = await create(core.key)

  let s1 = core.replicate(true, { keepAlive: false })
  let s2 = clone.replicate(false, { keepAlive: false })

  s1.pipe(s2).pipe(s1)

  await s2.opened

  const all = []
  for (let i = 0; i < 33; i++) {
    all.push(clone.get(i))
  }

  clone.once("download", function () {
    // simulate stream failure in the middle of bulk downloading
    s1.destroy()
  })

  await new Promise((resolve) => s1.once("close", resolve))

  // retry
  s1 = core.replicate(true, { keepAlive: false })
  s2 = clone.replicate(false, { keepAlive: false })

  s1.pipe(s2).pipe(s1)

  const blocks = await Promise.all(all)

  expect(blocks.length).toBe(33, "downloaded 33 blocks")
})

test("replicate discrete range", async function () {
  const a = await create()

  await a.append(["a", "b", "c", "d", "e"])

  const b = await create(a.key)

  let d = 0
  b.on("download", () => d++)

  replicate(a, b)

  const r = b.download({ blocks: [0, 2, 3] })
  await r.downloaded()

  expect(d).toBe(3)
  expect(await b.get(0)).toEqual(Buffer.from("a"))
  expect(await b.get(2)).toEqual(Buffer.from("c"))
  expect(await b.get(3)).toEqual(Buffer.from("d"))
})

test("replicate discrete empty range", async function () {
  const a = await create()

  await a.append(["a", "b", "c", "d", "e"])

  const b = await create(a.key)

  let d = 0
  b.on("download", () => d++)

  replicate(a, b)

  const r = b.download({ blocks: [] })

  await r.downloaded()

  expect(d).toBe(0)
})

test("get with { wait: false } returns null if block is not available", async function () {
  const a = await create()

  await a.append("a")

  const b = await create(a.key, { valueEncoding: "utf-8" })

  replicate(a, b)

  expect(await b.get(0, { wait: false })).toBeNull()
  expect(await b.get(0)).toBe("a")
})

test("request cancellation regression", async function () {
  const a = await create()
  const b = await create(a.key)

  let errored = 0

  // do not connect the two

  b.get(0).catch(onerror)
  b.get(1).catch(onerror)
  b.get(2).catch(onerror)

  // No explict api to trigger this (maybe we add a cancel signal / abort controller?) but cancel get(1)
  b.activeRequests[1].context.detach(b.activeRequests[1])

  await b.close()

  expect(b.activeRequests.length).toBe(0)
  expect(errored).toBe(3)

  function onerror() {
    errored++
  }
})

test("findingPeers makes update wait for first peer", async function () {
  const a = await create()
  const b = await create(a.key)

  await a.append("hi")

  expect(await b.update()).toBe(false)

  const done = b.findingPeers()

  const u = b.update()
  await eventFlush()

  replicate(a, b)

  expect(await u).toBe(true)
  done()
})

test("findingPeers + done makes update return false if no peers", async function () {
  const a = await create()
  const b = await create(a.key)

  await a.append("hi")

  expect(await b.update()).toBe(false)

  const done = b.findingPeers()

  const u = b.update()
  await eventFlush()

  done()
  expect(await u).toBe(false)
})

test("can disable downloading from a peer", async function () {
  const a = await create()

  await a.append(["a", "b", "c", "d", "e"])

  const b = await create(a.key, { valueEncoding: "utf-8" })
  const c = await create(a.key, { valueEncoding: "utf-8" })

  const [aStream] = replicate(b, a)
  replicate(b, c)
  replicate(a, c)

  {
    const r = c.download({ start: 0, end: a.length })
    await r.downloaded()
  }

  const aPeer =
    b.peers[0].stream.rawStream === aStream ? b.peers[0] : b.peers[1]

  aPeer.setDownloading(false)

  let aUploads = 0
  let cUploads = 0

  c.on("upload", function () {
    cUploads++
  })
  a.on("upload", function () {
    aUploads++
  })

  {
    const r = b.download({ start: 0, end: a.length })
    await r.downloaded()
  }

  expect(aUploads).toBe(0)
  expect(cUploads).toBe(a.length)
})
