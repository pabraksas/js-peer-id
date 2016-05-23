/*
 * Id is an object representation of a peer Id. a peer Id is a multihash
 */

'use strict'

const fs = require('fs')
const multihashing = require('multihashing')
const base58 = require('bs58')
const forge = require('node-forge')
const protobuf = require('protocol-buffers')
const path = require('path')

const pbCrypto = protobuf(fs.readFileSync(path.resolve(__dirname, '../protos/crypto.proto')))

exports = module.exports = PeerId

exports.Buffer = Buffer

function PeerId (id, privKey, pubKey) {
  const self = this

  if (!(self instanceof PeerId)) {
    throw new Error('Id must be called with new')
  }

  self.privKey = privKey
  self.pubKey = pubKey
  self.id = id // multihash - sha256 - buffer

  // pretty print
  self.toPrint = function () {
    return {
      id: self.toB58String(),
      privKey: privKey.toString('hex'),
      pubKey: pubKey.toString('hex')
    }
  }

  self.toJSON = function () {
    return {
      id: self.id.toString('hex'),
      privKey: self.privKey.toString('hex'),
      pubKey: self.pubKey.toString('hex')
    }
  }

  // encode/decode functions
  self.toHexString = function () {
    return self.id.toString('hex')
  }

  self.toBytes = function () {
    return self.id
  }

  self.toB58String = function () {
    return base58.encode(self.id)
  }
}

// unwrap the private key protobuf
function keyUnmarshal (key) {
  return pbCrypto.PrivateKey.decode(key)
}

// create a public key protobuf to be base64 string stored in config
function keyMarshal (data, type) {
  const RSA = 0

  let epb
  if (type === 'Public') {
    epb = pbCrypto.PublicKey.encode({
      Type: RSA,
      Data: data
    })
  }

  if (type === 'Private') {
    epb = pbCrypto.PrivateKey.encode({
      Type: RSA,
      Data: data
    })
  }

  return epb
}

// this returns a base64 encoded protobuf of the public key
function formatKey (key, type) {
  // create der buffer of public key asn.1 object
  const der = forge.asn1.toDer(key)

  // create forge buffer of der public key buffer
  const fDerBuf = forge.util.createBuffer(der.data, 'binary')

  // convert forge buffer to node buffer public key
  const nDerBuf = new Buffer(fDerBuf.getBytes(), 'binary')

  // protobuf the new DER bytes to the PublicKey Data: field
  const marsheledKey = keyMarshal(nDerBuf, type)

  // encode the protobuf public key to base64 string
  const b64 = marsheledKey.toString('base64')
  return b64
}

// generation
exports.create = function (opts) {
  opts = opts || {}
  opts.bits = opts.bits || 2048

  // generate keys
  const pair = forge.rsa.generateKeyPair({
    bits: opts.bits,
    e: 0x10001
  })

  // return the RSA public/private key to asn1 object
  const asnPub = forge.pki.publicKeyToAsn1(pair.publicKey)
  const asnPriv = forge.pki.privateKeyToAsn1(pair.privateKey)

  // format the keys to protobuf base64 encoded string
  const protoPublic64 = formatKey(asnPub, 'Public')
  const protoPrivate64 = formatKey(asnPriv, 'Private')

  // store the keys as a buffer
  const bufProtoPub64 = new Buffer(protoPublic64, 'base64')
  const bufProtoPriv64 = new Buffer(protoPrivate64, 'base64')

  const mhId = multihashing(new Buffer(protoPublic64, 'base64'), 'sha2-256')

  return new PeerId(mhId, bufProtoPriv64, bufProtoPub64)
}

exports.createFromHexString = function (str) {
  return new PeerId(new Buffer(str, 'hex'))
}

exports.createFromBytes = function (buf) {
  return new PeerId(buf)
}

exports.createFromB58String = function (str) {
  return new PeerId(new Buffer(base58.decode(str)))
}

// Public Key input will be a buffer
exports.createFromPubKey = function (pubKey) {
  const buf = new Buffer(pubKey, 'base64')
  const mhId = multihashing(buf, 'sha2-256')
  return new PeerId(mhId, null, pubKey)
}

// Private key input will be a string
exports.createFromPrivKey = function (privKey) {
  // create a buffer from the base64 encoded string
  const buf = new Buffer(privKey, 'base64')

  // get the private key data from the protobuf
  const mpk = keyUnmarshal(buf)

  // create a forge buffer
  const fbuf = forge.util.createBuffer(mpk.Data.toString('binary'))

  // create an asn1 object from the private key bytes saved in the protobuf Data: field
  const asnPriv = forge.asn1.fromDer(fbuf)

  // get the RSA privatekey data from the asn1 object
  const privateKey = forge.pki.privateKeyFromAsn1(asnPriv)

  // set the RSA public key to the modulus and exponent of the private key
  const publicKey = forge.pki.rsa.setPublicKey(privateKey.n, privateKey.e)

  // return the RSA public key to asn1 object
  const asnPub = forge.pki.publicKeyToAsn1(publicKey)

  // format the public key
  const protoPublic64 = formatKey(asnPub, 'Public')

  // buffer the public key for consistency before storing
  const bufProtoPub64 = new Buffer(protoPublic64, 'base64')
  const mhId = multihashing(new Buffer(protoPublic64, 'base64'), 'sha2-256')
  return new PeerId(mhId, privKey, bufProtoPub64)
}

exports.createFromJSON = function (obj) {
  return new PeerId(
      new Buffer(obj.id, 'hex'),
      new Buffer(obj.privKey, 'hex'),
      new Buffer(obj.pubKey, 'hex'))
}
