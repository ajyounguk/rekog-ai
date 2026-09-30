// shared test fixtures: mocked Rekognition client, temp image folder, app factory

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { RekognitionClient } = require('@aws-sdk/client-rekognition')
const { mockClient } = require('aws-sdk-client-mock')
const { createApp } = require('../app')

// smallest useful headers - Rekognition is mocked so the pixels don't matter
const PNG_BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)])
const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)])

function makeImagesDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rekog-test-'))
    fs.writeFileSync(path.join(dir, 'cat.png'), PNG_BYTES)
    fs.writeFileSync(path.join(dir, 'duck.jpg'), JPEG_BYTES)
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not an image')
    fs.writeFileSync(path.join(dir, 'fake.png'), 'not really a png')
    return dir
}

function metadata(requestId, httpStatusCode = 200) {
    return { httpStatusCode, requestId, attempts: 1, totalRetryDelay: 0 }
}

function makeApp({ environment = { kind: 'aws', region: 'eu-west-2', credentialSource: 'default provider chain' } } = {}) {
    const client = new RekognitionClient({ region: 'eu-west-2', credentials: { accessKeyId: 'test', secretAccessKey: 'test' } })
    const mock = mockClient(client)
    const imagesDir = makeImagesDir()
    const logged = []
    const log = { warn: msg => logged.push(msg), error: (...args) => logged.push(args.join(' ')) }
    const app = createApp({ rekognition: client, environment, imagesDir, log })
    return { app, mock, imagesDir, logged }
}

// all element ids in a page, with any duplicates
function duplicateIds(html) {
    const seen = new Map()
    for (const [, id] of html.matchAll(/\sid="([^"]+)"/g)) seen.set(id, (seen.get(id) || 0) + 1)
    return [...seen].filter(([, n]) => n > 1).map(([id]) => id)
}

module.exports = { makeApp, makeImagesDir, metadata, duplicateIds, PNG_BYTES, JPEG_BYTES }
