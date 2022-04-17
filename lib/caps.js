const crypto = require('hypercore-crypto')
const sodium = require('sodium-javascript')
const b4a = require('b4a')
const c = require('compact-encoding')

// TODO: rename this to "crypto" and move everything hashing related etc in here
// Also lets move the tree stuff from hypercore-crypto here, and loose the types
// from the hashes there - they are not needed since we lock the indexes in the tree
// hash and just makes alignment etc harder in other languages

const [TREE, REPLICATE_INITIATOR, REPLICATE_RESPONDER] = crypto.namespace('hypercore', 3)

exports.replicate = function (isInitiator, key, handshakeHash) {
  const out = b4a.allocUnsafe(32)
  sodium.crypto_generichash_batch(out, [isInitiator ? REPLICATE_INITIATOR : REPLICATE_RESPONDER, key], handshakeHash)
  return out
}

exports.treeSignable = function (hash, length, fork) {
  const state = { start: 0, end: 80, buffer: b4a.allocUnsafe(80) }
  c.raw.encode(state, TREE)
  c.raw.encode(state, hash)
  c.uint64.encode(state, length)
  c.uint64.encode(state, fork)
  return state.buffer
}

exports.treeSignableLegacy = function (hash, length, fork) {
  const state = { start: 0, end: 48, buffer: b4a.allocUnsafe(48) }
  c.raw.encode(state, hash)
  c.uint64.encode(state, length)
  c.uint64.encode(state, fork)
  return state.buffer
}
