'use strict';
const crypto = require('node:crypto');
function decodeEnvelope(envelope, publicKey) {
    try {
        if (!publicKey || typeof envelope?.payload !== 'string' || envelope.payload.length > 16000 || typeof envelope.signature !== 'string') return null;
        if (!crypto.verify(null, Buffer.from(envelope.payload), publicKey, Buffer.from(envelope.signature, 'base64url'))) return null;
        return JSON.parse(Buffer.from(envelope.payload, 'base64url').toString());
    } catch { return null; }
}
function verifyEntitlement(envelope, publicKey, deviceId, uid, now = Date.now()) {
  try {
    if (!publicKey || !envelope || typeof envelope.payload !== 'string' || envelope.payload.length > 16000 || typeof envelope.signature !== 'string') return null;
    if (!crypto.verify(null, Buffer.from(envelope.payload), publicKey, Buffer.from(envelope.signature, 'base64url'))) return null;
    const value = JSON.parse(Buffer.from(envelope.payload, 'base64url').toString());
    if (value.version !== 1 || !value.uid || value.uid !== uid || value.deviceId !== deviceId ||
        !Number.isFinite(value.issuedAt) || value.issuedAt > now + 60000 || !Number.isFinite(value.offlineUntil) ||
        value.offlineUntil > value.issuedAt + 3 * 86400000 || value.offlineUntil <= now ||
        !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= now) return null;
    return value;
  } catch { return null; }
}
module.exports = { verifyEntitlement, decodeEnvelope };
