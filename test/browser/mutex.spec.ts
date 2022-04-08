import { test, expect } from "@playwright/test"

const Mutex = require("../lib/mutex")

test("mutex - lock after destroy", async function () {
  const mutex = new Mutex()
  mutex.destroy()
  expect(async () => mutex.lock()).rejects.toThrow()
})

test("mutex - graceful destroy", async function () {
  const mutex = new Mutex()
  const promises = []
  let resolveCount = 0

  for (let i = 0; i < 5; i++) {
    promises.push(mutex.lock().then(() => resolveCount++))
  }

  const destroyed = mutex.destroy()

  for (let i = 0; i < 5; i++) mutex.unlock()

  await destroyed

  expect(resolveCount).toBe(5)
})

test("mutex - quick destroy", async function () {
  const mutex = new Mutex()
  const promises = []
  let rejectCount = 0
  let resolveCount = 0

  for (let i = 0; i < 5; i++) {
    promises.push(
      mutex.lock().then(
        () => resolveCount++,
        () => rejectCount++
      )
    )
  }

  const destroyed = mutex.destroy(new Error("Test error"))

  for (let i = 0; i < 5; i++) mutex.unlock()

  await destroyed

  expect(resolveCount).toBe(1)
  expect(rejectCount).toBe(4)
})

test("mutex - graceful then quick destroy", async function () {
  const mutex = new Mutex()
  const promises = []
  let rejectCount = 0
  let resolveCount = 0

  for (let i = 0; i < 5; i++) {
    promises.push(
      mutex.lock().then(
        () => resolveCount++,
        () => rejectCount++
      )
    )
  }

  const destroyed = mutex.destroy()
  mutex.destroy(new Error("Test error"))

  for (let i = 0; i < 5; i++) mutex.unlock()

  await destroyed

  expect(resolveCount).toBe(1)
  expect(rejectCount).toBe(4)
})

test("mutex - quick destroy with re-entry", async function () {
  const mutex = new Mutex()
  const promises = []
  let rejectCount = 0
  let resolveCount = 0

  for (let i = 0; i < 5; i++) {
    promises.push(lock())
  }

  const destroyed = mutex.destroy(new Error("Test error"))

  for (let i = 0; i < 5; i++) mutex.unlock()

  await destroyed

  expect(resolveCount).toBe(1)
  expect(rejectCount).toBe(4)

  async function lock() {
    try {
      await mutex.lock()
      resolveCount++
    } catch {
      try {
        await mutex.lock()
        t.fail("should never aquire it after failing")
      } catch {
        rejectCount++
      }
    }
  }
})

test("mutex - error propagates", async function () {
  const mutex = new Mutex()

  let resolveCount = 0
  const rejectErrors = []
  const err = new Error("Stop")

  for (let i = 0; i < 5; i++) {
    mutex.lock().then(
      () => resolveCount++,
      (err) => rejectErrors.push(err)
    )
  }

  await mutex.destroy(err)

  try {
    await mutex.lock()
  } catch (e) {
    expect(e === err).toBeTruthy()
  }

  expect(resolveCount).toBe(1)
  expect(rejectErrors).toEqual([err, err, err, err])
})
