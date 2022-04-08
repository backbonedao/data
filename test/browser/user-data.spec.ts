import { test, expect } from "@playwright/test"
const tape = require("purple-tape").test
const Hypercore = require("../../src")
const tmp = require("tmp-promise")
const { create } = require("../helpers")

test("userdata - can set through setUserData", async function () {
  tape("userdata - can set through setUserData", async function (t) {
    const core = await create()
    await core.setUserData("hello", Buffer.from("world"))

    expect(await core.getUserData("hello")).toEqual(Buffer.from("world"))
  })
})

test("userdata - can set through constructor option", async function () {
  tape("userdata - can set through constructor option", async function (t) {
    const core = await create({
      userData: {
        hello: Buffer.from("world"),
      },
    })

    expect(await core.getUserData("hello")).toEqual(Buffer.from("world"))
  })
})

test("userdata - persists across restarts", async function () {
  tape("userdata - persists across restarts", async function (t) {
    const dir = await tmp.dir()

    let core = new Hypercore(dir.path, {
      userData: {
        hello: Buffer.from("world"),
      },
    })
    await core.ready()

    await core.close()
    core = new Hypercore(dir.path, {
      userData: {
        other: Buffer.from("another"),
      },
    })

    expect(await core.getUserData("hello")).toEqual(Buffer.from("world"))
    expect(await core.getUserData("other")).toEqual(Buffer.from("another"))
  })
})
