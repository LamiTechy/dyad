// =============================================================================
// lib/crypto/e2ee.ts — End-to-End Encryption Layer
//
// Architecture:
//   1. Key Generation: Each device generates an ECDH P-256 keypair on first launch.
//      The PUBLIC key is uploaded to device_keys table.
//      The PRIVATE key is stored ONLY in IndexedDB (non-exportable where possible).
//
//   2. Key Exchange: When User A wants to send User B a message:
//      - A fetches B's public key from device_keys
//      - A performs ECDH key agreement → shared secret (never stored on server)
//      - A derives an AES-256-GCM key via HKDF from the shared secret
//
//   3. Encryption: Each message is encrypted with AES-256-GCM using:
//      - The derived shared key
//      - A random 12-byte IV (stored alongside ciphertext in DB)
//      - Output: base64url ciphertext + base64url IV
//
//   4. Decryption: Recipient performs same ECDH derivation → AES key → decrypts
//
// Tradeoffs vs Signal Protocol:
//   - We don't implement Double Ratchet (forward secrecy per-message)
//   - We use a single static ECDH shared secret per device pair
//   - For a 2-user private app, this is a strong practical choice
//   - Full Double Ratchet can be layered on top; interfaces are designed for it
//
// Browser limitation: SubtleCrypto is available in all modern browsers.
// Private keys are stored as non-extractable CryptoKey objects in IndexedDB.
// =============================================================================

const ECDH_ALGORITHM = { name: 'ECDH', namedCurve: 'P-256' } as const
const AES_ALGORITHM = { name: 'AES-GCM', length: 256 } as const
const HKDF_ALGORITHM = { name: 'HKDF' } as const
const KEY_USAGE_ECDH: KeyUsage[] = ['deriveKey', 'deriveBits']
const KEY_USAGE_AES: KeyUsage[] = ['encrypt', 'decrypt']
const IV_LENGTH = 12 // bytes, recommended for AES-GCM

const DB_NAME = 'dyad_keys'
const DB_VERSION = 1
const STORE_NAME = 'identity_keys'

// =============================================================================
// IndexedDB helpers for private key storage
// =============================================================================

function openKeyDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'device_id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function storePrivateKey(deviceId: string, privateKey: CryptoKey): Promise<void> {
  const db = await openKeyDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put({ device_id: deviceId, private_key: privateKey })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function getPrivateKey(deviceId: string): Promise<CryptoKey | null> {
  const db = await openKeyDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(deviceId)
    req.onsuccess = () => resolve(req.result?.private_key ?? null)
    req.onerror = () => reject(req.error)
  })
}

// =============================================================================
// Key Generation
// =============================================================================

export interface GeneratedKeyPair {
  deviceId: string
  publicKeyJwk: JsonWebKey     // Uploaded to server
  fingerprint: string           // SHA-256 hex of public key bytes
}

export async function generateIdentityKeyPair(deviceId: string): Promise<GeneratedKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    ECDH_ALGORITHM,
    false,             // non-extractable private key
    KEY_USAGE_ECDH
  )

  // Export public key as JWK for server storage
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)

  // Store non-extractable private key in IndexedDB
  await storePrivateKey(deviceId, keyPair.privateKey)

  // Compute fingerprint for verification display
  const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey)
  const fingerprintBuffer = await crypto.subtle.digest('SHA-256', publicKeyRaw)
  const fingerprint = bufferToHex(fingerprintBuffer)

  return { deviceId, publicKeyJwk, fingerprint }
}

// =============================================================================
// Key Agreement — derive shared AES key from ECDH
// =============================================================================

// Cache derived keys per peer to avoid recomputing on every message
const derivedKeyCache = new Map<string, CryptoKey>()

export async function deriveSharedKey(
  myDeviceId: string,
  peerPublicKeyJwk: JsonWebKey,
  conversationId: string   // Used as HKDF salt context
): Promise<CryptoKey> {
  const cacheKey = `${myDeviceId}:${conversationId}`
  if (derivedKeyCache.has(cacheKey)) {
    return derivedKeyCache.get(cacheKey)!
  }

  const myPrivateKey = await getPrivateKey(myDeviceId)
  if (!myPrivateKey) {
    throw new Error('Private key not found for device: ' + myDeviceId)
  }

  const peerPublicKey = await crypto.subtle.importKey(
    'jwk',
    peerPublicKeyJwk,
    ECDH_ALGORITHM,
    false,
    []
  )

  // Derive raw shared bits via ECDH
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerPublicKey },
    myPrivateKey,
    256
  )

  // HKDF to derive a proper AES key with domain separation
  const sharedKeyMaterial = await crypto.subtle.importKey(
    'raw',
    sharedBits,
    HKDF_ALGORITHM,
    false,
    ['deriveKey']
  )

  const encoder = new TextEncoder()
  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode(`dyad:${conversationId}`),
      info: encoder.encode('dyad-message-key-v1'),
    },
    sharedKeyMaterial,
    AES_ALGORITHM,
    false,
    KEY_USAGE_AES
  )

  derivedKeyCache.set(cacheKey, aesKey)
  return aesKey
}

// =============================================================================
// Encryption
// =============================================================================

export interface EncryptedPayload {
  ciphertext: string   // base64url
  iv: string           // base64url
}

export async function encryptMessage(
  plaintext: string,
  aesKey: CryptoKey
): Promise<EncryptedPayload> {
  const encoder = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoder.encode(plaintext)
  )

  return {
    ciphertext: bufferToBase64url(ciphertextBuffer),
    iv: bufferToBase64url(iv),
  }
}

// =============================================================================
// Decryption
// =============================================================================

export async function decryptMessage(
  payload: EncryptedPayload,
  aesKey: CryptoKey
): Promise<string> {
  const iv = base64urlToBuffer(payload.iv)
  const ciphertext = base64urlToBuffer(payload.ciphertext)

  const plaintextBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as any },
    aesKey,
    ciphertext as any
  )

  return new TextDecoder().decode(plaintextBuffer)
}

// =============================================================================
// File/Attachment Encryption
// Attachments are encrypted client-side before upload to Supabase Storage.
// A random per-file AES key is generated, encrypted with the shared key, and
// stored in the attachments table as encrypted_key.
// =============================================================================

export interface EncryptedFile {
  encryptedBuffer: ArrayBuffer
  iv: string           // base64url IV for the file
  encryptedKey: string // The file's AES key, encrypted with message shared key, base64url
}

export async function encryptFile(
  fileBuffer: ArrayBuffer,
  sharedAesKey: CryptoKey
): Promise<EncryptedFile> {
  // Generate a random AES key for this specific file
  const fileKey = await crypto.subtle.generateKey(AES_ALGORITHM, true, KEY_USAGE_AES)
  const fileIv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

  // Encrypt the file
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: fileIv },
    fileKey,
    fileBuffer
  )

  // Encrypt the file key with the shared conversation key
  const fileKeyRaw = await crypto.subtle.exportKey('raw', fileKey)
  const keyIv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encryptedKeyBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: keyIv },
    sharedAesKey,
    fileKeyRaw
  )

  // Encode: keyIv (12 bytes) + encryptedKey concatenated, then base64url
  const combinedKey = new Uint8Array(keyIv.length + encryptedKeyBuffer.byteLength)
  combinedKey.set(keyIv)
  combinedKey.set(new Uint8Array(encryptedKeyBuffer), keyIv.length)

  return {
    encryptedBuffer,
    iv: bufferToBase64url(fileIv),
    encryptedKey: bufferToBase64url(combinedKey),
  }
}

export async function decryptFile(
  encryptedBuffer: ArrayBuffer,
  iv: string,
  encryptedKey: string,
  sharedAesKey: CryptoKey
): Promise<ArrayBuffer> {
  const combinedKey = base64urlToBuffer(encryptedKey)
  const keyIv = combinedKey.slice(0, IV_LENGTH)
  const encryptedKeyBytes = combinedKey.slice(IV_LENGTH)

  // Decrypt the file key
  const fileKeyRaw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: keyIv },
    sharedAesKey,
    encryptedKeyBytes
  )

  const fileKey = await crypto.subtle.importKey('raw', fileKeyRaw, AES_ALGORITHM, false, KEY_USAGE_AES)

  // Decrypt the file
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64urlToBuffer(iv) as any },
    fileKey,
    encryptedBuffer as any
  )
}

// =============================================================================
// Device ID management
// =============================================================================

export function getOrCreateDeviceId(): string {
  const key = 'dyad_device_id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
}

// =============================================================================
// Utilities
// =============================================================================

function bufferToBase64url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64urlToBuffer(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export { bufferToBase64url, base64urlToBuffer, bufferToHex }
