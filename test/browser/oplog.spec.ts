import { test, expect } from "@playwright/test"
const p = require("path")
const BrowserFS = require("browserfs")
const fs = require("fs")
const tape = require("purple-tape").test
const fsctl = require("fsctl")
const raf = require("random-access-file")
const c = require("compact-encoding")
const promisify = require("util.promisify")

const Oplog = require("../../lib/oplog")

const STORAGE_FILE_NAME = "oplog-test-storage"
const STORAGE_FILE_PATH = p.join(__dirname, STORAGE_FILE_NAME)
const SHOULD_ERROR = Symbol("hypercore-oplog-should-error")

function initFS(cb) {
  BrowserFS.configure(
    {
      fs: "IndexedDb",
    },
    cb
  )
}
test("oplog - reset storage", async function () {
  initFS(() => {
    initFS(() => {
      tape("oplog - reset storage", async function (t) {
        // just to make sure to cleanup storage if it failed half way through before
        if (fs.existsSync(STORAGE_FILE_PATH))
          await fs.promises.unlink(STORAGE_FILE_PATH)
        t.pass("data is reset")
      })
    })
  })
})

test("oplog - basic append", async function () {
  initFS(() => {
    initFS(() => {
      tape("oplog - basic append", async function (t) {
        const storage = testStorage()

        const logWr = new Oplog(storage)

        await logWr.open()
        await logWr.flush(Buffer.from("h"))
        await logWr.append(Buffer.from("a"))
        await logWr.append(Buffer.from("b"))

        const logRd = new Oplog(storage)

        {
          const { header, entries } = await logRd.open()

          expect(header).toEqual(Buffer.from("h"))
          expect(entries.length).toBe(2)
          expect(entries[0]).toEqual(Buffer.from("a"))
          expect(entries[1]).toEqual(Buffer.from("b"))
        }

        await logWr.flush(Buffer.from("i"))

        {
          const { header, entries } = await logRd.open()

          expect(header).toEqual(Buffer.from("i"))
          expect(entries.length).toBe(0)
        }

        await logWr.append(Buffer.from("c"))

        {
          const { header, entries } = await logRd.open()

          expect(header).toEqual(Buffer.from("i"))
          expect(entries.length).toBe(1)
          expect(entries[0]).toEqual(Buffer.from("c"))
        }

        await cleanup(storage)
      })
    })
  })
})

test("oplog - custom encoding", async function () {
  initFS(() => {
    tape("oplog - custom encoding", async function (t) {
      const storage = testStorage()

      const log = new Oplog(storage, {
        headerEncoding: c.string,
        entryEncoding: c.uint,
      })

      await log.open()
      await log.flush("one header")
      await log.append(42)
      await log.append(43)

      const { header, entries } = await log.open()

      expect(header).toBe("one header")
      expect(entries.length).toBe(2)
      expect(entries[0]).toBe(42)
      expect(entries[1]).toBe(43)

      await cleanup(storage)
    })
  })
})

test("oplog - alternating header writes", async function () {
  initFS(() => {
    tape("oplog - alternating header writes", async function (t) {
      const storage = testStorage()

      const log = new Oplog(storage)

      await log.open()
      await log.flush(Buffer.from("1"))
      await log.flush(Buffer.from("2"))

      {
        const { header } = await log.open()
        expect(header).toEqual(Buffer.from("2"))
      }

      await log.flush(Buffer.from("1")) // Should overwrite first header

      {
        const { header } = await log.open()
        expect(header).toEqual(Buffer.from("1"))
      }

      await log.flush(Buffer.from("2")) // Should overwrite second header

      {
        const { header } = await log.open()
        expect(header).toEqual(Buffer.from("2"))
      }

      await cleanup(storage)
    })
  })
})

test("oplog - one fully-corrupted header", async function () {
  initFS(() => {
    tape("oplog - one fully-corrupted header", async function (t) {
      const storage = testStorage()

      const log = new Oplog(storage)

      await log.open()
      await log.flush(Buffer.from("header 1"))

      {
        const { header } = await log.open()
        expect(header).toEqual(Buffer.from("header 1"))
      }

      await log.flush(Buffer.from("header 2"))

      {
        const { header } = await log.open()
        expect(header).toEqual(Buffer.from("header 2"))
      }

      await log.flush(Buffer.from("header 3")) // should overwrite first header

      {
        const { header } = await log.open()
        expect(header).toEqual(Buffer.from("header 3"))
      }

      // Corrupt the first header -- second header should win now
      await new Promise((resolve, reject) => {
        storage.write(0, Buffer.from("hello world"), (err) => {
          if (err) return reject(err)
          return resolve()
        })
      })

      {
        const { header } = await log.open()
        t.deepEqual(
          header,
          Buffer.from("header 2"),
          "one is corrupted or partially written"
        )
      }

      await cleanup(storage)
    })
  })
})

test("oplog - header invalid checksum", async function () {
  initFS(() => {
    tape("oplog - header invalid checksum", async function (t) {
      const storage = testStorage()

      const log = new Oplog(storage)

      await log.open()
      await log.flush(Buffer.from("a"))
      await log.flush(Buffer.from("b"))

      {
        const { header } = await log.open()
        expect(header).toEqual(Buffer.from("b"))
      }

      // Invalidate the first header's checksum -- second header should win now
      await new Promise((resolve, reject) => {
        storage.write(4096 + 8, Buffer.from("a"), (err) => {
          if (err) return reject(err)
          return resolve()
        })
      })

      {
        const { header } = await log.open()
        expect(header).toEqual(Buffer.from("a"))
      }

      // Invalidate the second header's checksum -- the hypercore is now corrupted
      await new Promise((resolve, reject) => {
        storage.write(8, Buffer.from("b"), (err) => {
          if (err) return reject(err)
          return resolve()
        })
      })

      try {
        await log.open()
        t.fail("corruption should have been detected")
      } catch {
        t.pass("corruption was correctly detected")
      }

      await cleanup(storage)
    })
  })
})

test("oplog - malformed log entry gets overwritten", async function () {
  initFS(() => {
    tape("oplog - malformed log entry gets overwritten", async function (t) {
      let storage = testStorage()
      let log = new Oplog(storage)

      await log.flush(Buffer.from("header"))
      await log.append(Buffer.from("a"))
      await log.append(Buffer.from("b"))
      await log.close()

      const offset = log.byteLength

      storage = testStorage()
      log = new Oplog(storage)

      // Write a bad oplog message at the end (simulates a failed append)
      await new Promise((resolve, reject) => {
        storage.write(
          offset + 4096 * 2,
          Buffer.from([0, 0, 0, 0, 4, 0, 0, 0]),
          (err) => {
            if (err) return reject(err)
            return resolve()
          }
        )
      })

      {
        const { entries } = await log.open()

        expect(entries.length).toBe(2) // The partial entry should not be present
        expect(entries[0]).toEqual(Buffer.from("a"))
        expect(entries[1]).toEqual(Buffer.from("b"))
      }

      // Write a valid oplog message now
      await log.append(Buffer.from("c"))

      {
        const { entries } = await log.open()

        expect(entries.length).toBe(3) // The partial entry should not be present
        expect(entries[0]).toEqual(Buffer.from("a"))
        expect(entries[1]).toEqual(Buffer.from("b"))
        expect(entries[2]).toEqual(Buffer.from("c"))
      }

      await cleanup(storage)
    })
  })
})

test("oplog - log not truncated when header write fails", async function () {
  initFS(() => {
    tape(
      "oplog - log not truncated when header write fails",
      async function (t) {
        const storage = failingOffsetStorage(4096 * 2)

        const log = new Oplog(storage)

        await log.flush(Buffer.from("header"))
        await log.append(Buffer.from("a"))
        await log.append(Buffer.from("b"))

        // Make subsequent header writes fail
        storage[SHOULD_ERROR](true)

        // The flush should fail because the header can't be updated -- log should still have entries after this
        try {
          await log.flush(Buffer.from("header two"))
        } catch (err) {
          expect(err.synthetic).toBeTruthy()
        }

        {
          const { header, entries } = await log.open()

          expect(header).toEqual(Buffer.from("header"))
          expect(entries.length).toBe(2)
          expect(entries[0]).toEqual(Buffer.from("a"))
          expect(entries[1]).toEqual(Buffer.from("b"))
        }

        // Re-enable header writes
        storage[SHOULD_ERROR](false)
        await log.flush(Buffer.from("header two")) // Should correctly truncate the oplog now

        {
          const { header, entries } = await log.open()

          expect(header).toEqual(Buffer.from("header two"))
          expect(entries.length).toBe(0)
        }

        await cleanup(storage)
      }
    )
  })
})

test("oplog - multi append", async function () {
  initFS(() => {
    tape("oplog - multi append", async function (t) {
      const storage = testStorage()

      const log = new Oplog(storage)

      await log.open()
      await log.flush(Buffer.from("a"))

      await log.append([
        Buffer.from("1"),
        Buffer.from("22"),
        Buffer.from("333"),
        Buffer.from("4"),
      ])

      expect(log.length).toBe(4)
      expect(log.byteLength).toBe(32 + 1 + 2 + 3 + 1)

      const { header, entries } = await log.open()

      expect(header).toEqual(Buffer.from("a"))
      t.deepEqual(entries, [
        Buffer.from("1"),
        Buffer.from("22"),
        Buffer.from("333"),
        Buffer.from("4"),
      ])

      await cleanup(storage)
    })
  })
})

test("oplog - multi append is atomic", async function () {
  initFS(() => {
    tape("oplog - multi append is atomic", async function (t) {
      const storage = testStorage()

      const log = new Oplog(storage)

      await log.open()
      await log.flush(Buffer.from("a"))

      await log.append(Buffer.from("0"))
      await log.append([
        Buffer.from("1"),
        Buffer.from("22"),
        Buffer.from("333"),
        Buffer.from("4"),
      ])

      expect(log.length).toBe(5)
      expect(log.byteLength).toBe(40 + 1 + 1 + 2 + 3 + 1)

      // Corrupt the last write, should revert the full batch
      await new Promise((resolve, reject) => {
        storage.write(8192 + log.byteLength - 1, Buffer.from("x"), (err) => {
          if (err) return reject(err)
          return resolve()
        })
      })

      const { entries } = await log.open()

      expect(log.length).toBe(1)
      expect(entries).toEqual([Buffer.from("0")])

      await cleanup(storage)
    })
  })
})

function testStorage() {
  return raf(STORAGE_FILE_NAME, { directory: __dirname, lock: fsctl.lock })
}

function failingOffsetStorage(offset) {
  let shouldError = false
  const storage = raf(STORAGE_FILE_NAME, {
    directory: __dirname,
    lock: fsctl.lock,
  })
  const write = storage.write.bind(storage)

  storage.write = (off, data, cb) => {
    if (off < offset && shouldError) {
      const err = new Error("Synthetic write failure")
      err.synthetic = true
      return cb(err)
    }
    return write(off, data, cb)
  }
  storage[SHOULD_ERROR] = (s) => {
    shouldError = s
  }

  return storage
}

async function cleanup(storage) {
  await new Promise((resolve) => storage.close(() => resolve()))
  await fs.promises.unlink(STORAGE_FILE_PATH)
}
