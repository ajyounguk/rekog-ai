const { test } = require('node:test')
const assert = require('node:assert/strict')
const { RekognitionClient, DetectLabelsCommand, DetectTextCommand, DetectFacesCommand, AccessDeniedException } = require('@aws-sdk/client-rekognition')
const { mockClient } = require('aws-sdk-client-mock')
const { analyseImage, summariseFaces, summariseText } = require('../lib/rekognition')
const { formatAwsError, stripMetadata, sanitiseMessage } = require('../lib/errors')
const { metadata, PNG_BYTES } = require('./helpers')

test('analyseImage sends all three commands with the image bytes', async () => {
    const client = new RekognitionClient({ region: 'eu-west-2', credentials: { accessKeyId: 'a', secretAccessKey: 'b' } })
    const mock = mockClient(client)
    mock.on(DetectLabelsCommand).resolves({ Labels: [], $metadata: metadata('l-1') })
    mock.on(DetectTextCommand).resolves({ TextDetections: [], $metadata: metadata('t-1') })
    mock.on(DetectFacesCommand).resolves({ FaceDetails: [], $metadata: metadata('f-1') })

    const calls = await analyseImage(client, PNG_BYTES)

    assert.deepEqual(calls.map(c => [c.api, c.ok, c.requestId]), [
        ['DetectLabels', true, 'l-1'],
        ['DetectText', true, 't-1'],
        ['DetectFaces', true, 'f-1']
    ])
    const labelsInput = mock.commandCalls(DetectLabelsCommand)[0].args[0].input
    assert.deepEqual(labelsInput, { Image: { Bytes: PNG_BYTES }, MaxLabels: 20, MinConfidence: 60 })
    assert.deepEqual(mock.commandCalls(DetectFacesCommand)[0].args[0].input.Attributes, ['ALL'])
    for (const call of calls) assert.equal('$metadata' in call.data, false)
})

test('one failing call does not lose the others', async () => {
    const client = new RekognitionClient({ region: 'eu-west-2', credentials: { accessKeyId: 'a', secretAccessKey: 'b' } })
    const mock = mockClient(client)
    mock.on(DetectLabelsCommand).resolves({ Labels: [{ Name: 'Cat', Confidence: 99 }], $metadata: metadata('l-1') })
    mock.on(DetectTextCommand).rejects(new AccessDeniedException({ message: 'not authorized', $metadata: metadata('t-err', 400) }))
    mock.on(DetectFacesCommand).resolves({ FaceDetails: [], $metadata: metadata('f-1') })

    const [labels, text, faces] = await analyseImage(client, PNG_BYTES)

    assert.equal(labels.ok, true)
    assert.equal(labels.summary[0].name, 'Cat')
    assert.equal(text.ok, false)
    assert.equal(text.status, 400)
    assert.equal(text.requestId, 't-err')
    assert.equal(text.error.name, 'AccessDeniedException')
    assert.equal(faces.ok, true)
})

test('summariseFaces reports each flag with its own value (old code printed Eyeglasses for EyesOpen)', () => {
    const [face] = summariseFaces({
        FaceDetails: [{
            AgeRange: { Low: 30, High: 40 },
            Eyeglasses: { Value: true, Confidence: 98 },
            EyesOpen: { Value: false, Confidence: 90 },
            Emotions: [{ Type: 'CALM', Confidence: 20 }, { Type: 'HAPPY', Confidence: 70 }]
        }]
    })
    assert.equal(face.ageRange, '30–40')
    assert.deepEqual(face.flags.find(f => f.name === 'EyesOpen'), { name: 'EyesOpen', value: false, confidence: 90 })
    assert.deepEqual(face.flags.find(f => f.name === 'Eyeglasses'), { name: 'Eyeglasses', value: true, confidence: 98 })
    assert.equal(face.emotions[0].type, 'HAPPY')
})

test('summariseFaces copes with missing attributes', () => {
    const [face] = summariseFaces({ FaceDetails: [{}] })
    assert.equal(face.ageRange, null)
    assert.equal(face.gender, null)
    assert.deepEqual(face.flags, [])
    assert.deepEqual(face.emotions, [])
})

test('summariseText separates lines from words', () => {
    const summary = summariseText({
        TextDetections: [
            { Type: 'LINE', DetectedText: 'Hello world', Confidence: 99 },
            { Type: 'WORD', DetectedText: 'Hello', Confidence: 99 },
            { Type: 'WORD', DetectedText: 'world', Confidence: 98 }
        ]
    })
    assert.deepEqual(summary.lines, [{ text: 'Hello world', confidence: 99 }])
    assert.equal(summary.wordCount, 2)
})

test('formatAwsError uses the real AWS status and request ID', () => {
    const err = new AccessDeniedException({ message: 'User is not authorized', $metadata: metadata('req-9', 400) })
    assert.deepEqual(formatAwsError(err), { name: 'AccessDeniedException', message: 'User is not authorized', status: 400, requestId: 'req-9' })
})

test('formatAwsError flags network errors with no HTTP status', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:4566'), { code: 'ECONNREFUSED' })
    const formatted = formatAwsError(err)
    assert.equal(formatted.status, null)
    assert.match(formatted.hint, /Could not reach the endpoint/)
})

test('sanitiseMessage strips signing details', () => {
    const message = 'The request signature we calculated does not match. The Canonical String for this request should have been POST / host:rekognition... Credential=AKIA...'
    const clean = sanitiseMessage(message)
    assert.doesNotMatch(clean, /Canonical String|Credential=/)
    assert.match(clean, /signing details removed/)
})

test('stripMetadata removes only $metadata', () => {
    assert.deepEqual(stripMetadata({ Labels: [], $metadata: {} }), { Labels: [] })
    assert.equal(stripMetadata(undefined), undefined)
})
