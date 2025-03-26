import crypto from 'crypto';

export function generateECDHKeys() {
    try {
        const ecdh = crypto.createECDH('secp256k1');
        ecdh.generateKeys();
        return {
            ecdhInstance: ecdh,
            publicKey: ecdh.getPublicKey('hex'),
            privateKey: ecdh.getPrivateKey('hex')
        };
    } catch (error) {
        throw new Error(`Failed to generate ECDH keys: ${error.message}`);
    }
}

export function deriveSharedKey(ecdhInstance, peerPublicKeyHex) {
    try {
        const peerPublicKey = Buffer.from(peerPublicKeyHex, 'hex');
        const sharedSecret = ecdhInstance.computeSecret(peerPublicKey);

        const hash = crypto.createHash('sha256');
        hash.update(sharedSecret);
        return hash.digest('hex');
    } catch (error) {
        throw new Error(`Failed to derive shared key: ${error.message}`);
    }
}


export function encryptMessage(message, sharedKey) {
    try {
        const iv = crypto.randomBytes(16);

        const cipher = crypto.createCipheriv(
            'aes-256-gcm',
            Buffer.from(sharedKey, 'hex').slice(0, 32),
            iv
        );

        let encrypted = cipher.update(message, 'utf-8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag().toString('hex');

        return JSON.stringify({
            iv: iv.toString('hex'),
            authTag,
            encryptedData: encrypted
        });
    } catch (error) {
        throw new Error(`Encryption failed: ${error.message}`);
    }
}


export function decryptMessage(encryptedMessage, sharedKey) {
    try {
        const { iv, authTag, encryptedData } = JSON.parse(encryptedMessage);

        const decipher = crypto.createDecipheriv(
            'aes-256-gcm',
            Buffer.from(sharedKey, 'hex').slice(0, 32),
            Buffer.from(iv, 'hex')
        );

        decipher.setAuthTag(Buffer.from(authTag, 'hex'));

        let decrypted = decipher.update(encryptedData, 'hex', 'utf-8');
        decrypted += decipher.final('utf-8');

        return decrypted;
    } catch (error) {
        throw new Error(`Decryption failed: ${error.message}`);
    }
}

export function signMessage(message, sharedKey) {
    try {
        return crypto.createHmac('sha256', Buffer.from(sharedKey, 'hex'))
            .update(message)
            .digest('hex');
    } catch (error) {
        throw new Error(`Signing failed: ${error.message}`);
    }
}


export function verifyMessage(message, signature, sharedKey) {
    try {
        const expectedSignature = signMessage(message, sharedKey);
        return crypto.timingSafeEqual(
            Buffer.from(expectedSignature, 'hex'),
            Buffer.from(signature, 'hex')
        );
    } catch (error) {
        return false;
    }
}

export function encryptAndSignMessage(message, sharedKey) {
    const encryptedMessage = encryptMessage(message, sharedKey);
    const signature = signMessage(encryptedMessage, sharedKey);
    return { encryptedMessage, signature };
}


export function verifyAndDecryptMessage(encryptedMessage, signature, sharedKey) {
    const isValid = verifyMessage(encryptedMessage, signature, sharedKey);
    if (!isValid) {
        return { message: null, verified: false };
    }

    try {
        const message = decryptMessage(encryptedMessage, sharedKey);
        return { message, verified: true };
    } catch (error) {
        return { message: null, verified: false, error: error.message };
    }
}


export function generateClientId() {
    return crypto.randomBytes(16).toString('hex');
}


export function validatePublicKey(publicKeyHex) {
    try {
        const publicKey = Buffer.from(publicKeyHex, 'hex');
        const ecdh = crypto.createECDH('secp256k1');

        ecdh.setPublicKey(publicKey);
        return true;
    } catch (error) {
        return false;
    }
}

export function createSecureSession(sharedKey) {
    return {
        encrypt: (message) => encryptMessage(message, sharedKey),
        decrypt: (encryptedMessage) => decryptMessage(encryptedMessage, sharedKey),
        sign: (message) => signMessage(message, sharedKey),
        verify: (message, signature) => verifyMessage(message, signature, sharedKey),
        encryptAndSign: (message) => encryptAndSignMessage(message, sharedKey),
        verifyAndDecrypt: (encryptedMessage, signature) => verifyAndDecryptMessage(encryptedMessage, signature, sharedKey)
    };
}