// sample image listing and upload validation

const fs = require('node:fs/promises')

const SAMPLE_PATTERN = /^[^.][^/\\]*\.(png|jpe?g)$/i

async function listSamples(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    return entries.filter(e => e.isFile() && SAMPLE_PATTERN.test(e.name)).map(e => e.name).sort()
}

// Rekognition only accepts PNG and JPEG - check the magic bytes rather than trusting the upload's mimetype
function detectImageType(buffer) {
    if (!buffer || buffer.length < 8) return null
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
    return null
}

module.exports = { listSamples, detectImageType }
