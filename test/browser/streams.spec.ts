import { test, expect } from "@playwright/test"
const tape = require("purple-tape").test

const { create } = require("../helpers")

test("basic read stream", async function () {
  tape("basic read stream", async function (t) {
    const core = await create()

    const expected = ["hello", "world", "verden", "welt"]

    await core.append(expected)

    for await (const data of core.createReadStream()) {
      expect(data.toString()).toEqual(expected.shift())
    }

    expect(expected.length).toBe(0)
  })
})

test("read stream with start / end", async function () {
  tape("read stream with start / end", async function (t) {
    const core = await create()

    const datas = ["hello", "world", "verden", "welt"]

    await core.append(datas)

    {
      const expected = datas.slice(1)

      for await (const data of core.createReadStream({ start: 1 })) {
        expect(data.toString()).toEqual(expected.shift())
      }

      expect(expected.length).toBe(0)
    }

    {
      const expected = datas.slice(2, 3)

      for await (const data of core.createReadStream({ start: 2, end: 3 })) {
        expect(data.toString()).toEqual(expected.shift())
      }

      expect(expected.length).toBe(0)
    }
  })
})

test("basic write+read stream", async function () {
  tape("basic write+read stream", async function (t) {
    const core = await create()

    const expected = ["hello", "world", "verden", "welt"]

    const ws = core.createWriteStream()

    for (const data of expected) ws.write(data)
    ws.end()

    await new Promise((resolve) => ws.on("finish", resolve))

    for await (const data of core.createReadStream()) {
      expect(data.toString()).toEqual(expected.shift())
    }

    expect(expected.length).toBe(0)
  })
})
