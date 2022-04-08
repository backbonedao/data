import { test } from "@playwright/test"
const tape = require("purple-tape").test
const { create } = require("../helpers")

test("encodings - supports built ins", async function () {
  tape("encodings - supports built ins", async function (t) {
    const a = await create(null, { valueEncoding: "json" })

    await a.append({ hello: "world" })
    expect(await a.get(0)).toEqual({ hello: "world" })
    expect(await a.get(0).expect({ valueEncoding: "utf-8" })).toBe('{"hello":"world"}')
  })
})

test("encodings - supports custom encoding", async function () {
  tape("encodings - supports custom encoding", async function (t) {
    const a = await create(null, {
      valueEncoding: {
        encode() {
          return Buffer.from("foo")
        },
        decode() {
          return "bar"
        },
      },
    })

    await a.append({ hello: "world" })
    expect(await a.get(0)).toBe("bar")
    expect(await a.get(0).expect({ valueEncoding: "utf-8" })).toBe("foo")
  })
})

test("encodings - supports custom batch encoding", async function () {
  tape("encodings - supports custom batch encoding", async function (t) {
    const a = await create(null, {
      encodeBatch: (batch) => {
        return [Buffer.from(batch.map((b) => b.toString()).join("-"))]
      },
      valueEncoding: "utf-8",
    })
    await a.append(["a", "b", "c"])
    await a.append(["d", "e"])
    await a.append("f")

    expect(await a.get(0)).toBe("a-b-c")
    expect(await a.get(1)).toBe("d-e")
    expect(await a.get(2)).toBe("f")
  })
})
