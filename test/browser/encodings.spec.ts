import { test, expect } from "@playwright/test"

const { create } = require("../helpers")

test("encodings - supports built ins", async function () {
  const a = await create(null, { valueEncoding: "json" })

  await a.append({ hello: "world" })
  expect(await a.get(0)).toEqual({ hello: "world" })
  expect(await a.get(0, { valueEncoding: "utf-8" })).toEqual(
    '{"hello":"world"}'
  )
})

test("encodings - supports custom encoding", async function () {
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
  expect(await a.get(0, { valueEncoding: "utf-8" })).toEqual("foo")
})

test("encodings - supports custom batch encoding", async function () {
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
