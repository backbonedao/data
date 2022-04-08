import { test, expect } from "@playwright/test"
const tape = require("purple-tape").test
const ram = require("random-access-memory")
const Bitfield = require("../lib/bitfield")

test("bitfield - set and get", async function () {
  tape("bitfield - set and get", async function (t) {
    const b = await Bitfield.open(ram())

    expect(b.get(42)).toBeFalsy()
    b.set(42, true)
    expect(b.get(42)).toBeTruthy()

    // bigger offsets
    expect(b.get(42000000)).toBeFalsy()
    b.set(42000000, true)
    expect(b.get(42000000)).toBeTruthy()

    b.set(42000000, false)
    expect(b.get(42000000)).toBeFalsy()

    await b.flush()
  })
})

test("bitfield - random set and gets", async function () {
  tape("bitfield - random set and gets", async function (t) {
    const b = await Bitfield.open(ram())
    const set = new Set()

    for (let i = 0; i < 200; i++) {
      const idx = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
      b.set(idx, true)
      set.add(idx)
    }

    for (let i = 0; i < 500; i++) {
      const idx = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
      const expected = set.has(idx)
      const val = b.get(idx)
      if (val !== expected) {
        t.fail("expected " + expected + " but got " + val + " at " + idx)
        return
      }
    }

    for (const idx of set) {
      const val = b.get(idx)
      if (val !== true) {
        t.fail("expected true but got " + val + " at " + idx)
        return
      }
    }

    t.pass("all random set and gets pass")
  })
})

test("bitfield - reload", async function () {
  tape("bitfield - reload", async function (t) {
    const s = ram()

    {
      const b = await Bitfield.open(s)
      b.set(142, true)
      b.set(40000, true)
      b.set(1424242424, true)
      await b.flush()
    }

    {
      const b = await Bitfield.open(s)
      expect(b.get(142)).toBeTruthy()
      expect(b.get(40000)).toBeTruthy()
      expect(b.get(1424242424)).toBeTruthy()
    }
  })
})
