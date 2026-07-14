import crypto from 'crypto'

const ENCRYPTION_VERSION = 'v1'
const ALGORITHM = 'aes-256-gcm'

export interface EncryptedSecret {
  ciphertext: string
  keyId: string
}

function getEncryptionKeyMaterial() {
  const secret = process.env.DATA_SOURCE_ENCRYPTION_KEY?.trim()
  if (!secret || secret.length < 24) {
    throw new Error('DATA_SOURCE_ENCRYPTION_KEY must be configured with at least 24 characters')
  }

  const keyId = crypto.createHash('sha256').update(secret).digest('hex').slice(0, 12)
  const key = crypto.createHash('sha256').update(secret).digest()
  return { key, keyId }
}

export function encryptJsonSecret(value: unknown): EncryptedSecret {
  const { key, keyId } = getEncryptionKeyMaterial()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8')
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()

  return {
    keyId,
    ciphertext: [
      ENCRYPTION_VERSION,
      iv.toString('base64url'),
      tag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join(':'),
  }
}

export function decryptJsonSecret<T = unknown>(ciphertext: string): T {
  const { key } = getEncryptionKeyMaterial()
  const [version, ivRaw, tagRaw, encryptedRaw] = ciphertext.split(':')
  if (version !== ENCRYPTION_VERSION || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error('Unsupported encrypted secret format')
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivRaw, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final(),
  ])

  return JSON.parse(decrypted.toString('utf8')) as T
}

export function hasDataSourceEncryptionKey() {
  const secret = process.env.DATA_SOURCE_ENCRYPTION_KEY?.trim()
  return Boolean(secret && secret.length >= 24)
}
