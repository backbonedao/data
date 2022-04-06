const { ethers } = require('ethers')
const b4a = require('b4a')

exports.convert0xToHKey = function(hypercoreKey) {
  return b4a.from(ethers.utils.sha256(hypercoreKey).replace(/^0x/, ''), 'hex')
}