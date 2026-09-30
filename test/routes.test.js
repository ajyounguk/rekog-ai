const { test } = require('node:test')
const assert = require('node:assert/strict')
const request = require('supertest')
const { DetectLabelsCommand, DetectTextCommand, DetectFacesCommand, AccessDeniedException, InvalidImageFormatException } = require('@aws-sdk/client-rekognition')
const { makeApp, metadata, duplicateIds, PNG_BYTES, JPEG_BYTES } = require('./helpers')
const { MAX_IMAGE_BYTES } = require('../app')

function mockSuccess(mock, { labels = [{ Name: 'Cat', Confidence: 98.76, Parents: [{ Name: 'Animal' }] }] } = {}) {
    mock.on(DetectLabelsCommand).resolves({ Labels: labels, LabelModelVersion: '3.0', $metadata: metadata('req-labels') })
    mock.on(DetectTextCommand).resolves({
        TextDetections: [
            { Type: 'LINE', DetectedText: 'HELLO THERE', Confidence: 99.1 },
            { Type: 'WORD', DetectedText: 'HELLO', Confidence: 99.1 },
            { Type: 'WORD', DetectedText: 'THERE', Confidence: 99.0 }
        ],
        $metadata: metadata('req-text')
    })
    mock.on(DetectFacesCommand).resolves({
        FaceDetails: [{
            AgeRange: { Low: 25, High: 35 },
            Smile: { Value: true, Confidence: 97 },
            Emotions: [{ Type: 'HAPPY', Confidence: 95 }]
        }],
        $metadata: metadata('req-faces')
    })
}

// POST, check the post/redirect/get response, then fetch the page it points at
async function postAndFollow(app, url, send) {
    const agent = request(app)
    const res = await send(agent.post(url))
    assert.equal(res.status, 303)
    assert.equal(res.headers.location, '/')
    const page = await request(app).get('/')
    assert.equal(page.status, 200)
    return page.text
}

test('GET / with no result shows the empty state and the samples', async () => {
    const { app } = makeApp()
    const res = await request(app).get('/')
    assert.equal(res.status, 200)
    assert.match(res.headers['content-type'], /text\/html/)
    assert.match(res.text, /Analyse an image/)
    assert.match(res.text, /value="cat.png"/)
    assert.match(res.text, /value="duck.jpg"/)
    assert.doesNotMatch(res.text, /notes\.txt/)
    assert.deepEqual(duplicateIds(res.text), [])
})

test('security headers are set', async () => {
    const { app } = makeApp()
    const res = await request(app).get('/')
    assert.match(res.headers['content-security-policy'], /default-src 'self'/)
    assert.equal(res.headers['x-content-type-options'], 'nosniff')
    assert.equal(res.headers['x-powered-by'], undefined)
})

test('environment badge: real AWS is red with region', async () => {
    const { app } = makeApp({ environment: { kind: 'aws', region: 'eu-west-2', credentialSource: 'default provider chain' } })
    const res = await request(app).get('/')
    assert.match(res.text, /class="env env-aws"/)
    assert.match(res.text, /<span class="env-name">AWS<\/span>/)
    assert.match(res.text, /<span class="env-region">eu-west-2<\/span>/)
})

test('environment badge: local and custom endpoints', async () => {
    const local = makeApp({ environment: { kind: 'local', region: 'us-east-1', endpoint: 'http://localhost:4566' } })
    assert.match((await request(local.app).get('/')).text, /class="env env-local" title="http:\/\/localhost:4566"/)
    const custom = makeApp({ environment: { kind: 'custom', region: 'eu-west-2', endpoint: 'https://rekognition.example.com' } })
    const html = (await request(custom.app).get('/')).text
    assert.match(html, /class="env env-custom"/)
    assert.match(html, /Custom endpoint/)
})

test('environment badge: missing region is called out', async () => {
    const { app } = makeApp({ environment: { kind: 'aws' } })
    assert.match((await request(app).get('/')).text, /region not set/)
})

test('POST /analyse/sample runs all three APIs and renders the results', async () => {
    const { app, mock } = makeApp()
    mockSuccess(mock)
    const html = await postAndFollow(app, '/analyse/sample', r => r.type('form').send({ name: 'cat.png' }))

    assert.deepEqual(mock.commandCalls(DetectLabelsCommand)[0].args[0].input.Image.Bytes, PNG_BYTES)
    assert.match(html, /<h1>cat.png<\/h1>/)
    assert.match(html, /src="\/samples\/cat.png"/)
    assert.match(html, /Cat <small>Animal<\/small>/)
    assert.match(html, /98.8%/)
    assert.match(html, /HELLO THERE/)
    assert.match(html, /1 lines, 2 words/)
    assert.match(html, /25–35/)
    assert.match(html, /200 OK/)
    assert.match(html, /req-labels/)
    assert.match(html, /req-text/)
    assert.match(html, /req-faces/)
    assert.match(html, /LabelModelVersion/)
    assert.doesNotMatch(html, /\$metadata|httpStatusCode/)
    assert.match(html, /class="sample is-current"/)
    assert.deepEqual(duplicateIds(html), [])
})

test('sample served statically for the preview', async () => {
    const { app } = makeApp()
    const res = await request(app).get('/samples/duck.jpg')
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, JPEG_BYTES)
})

test('POST /analyse/sample rejects unknown names and path traversal without calling AWS', async () => {
    for (const name of ['nope.png', '../package.json', '..\\app.js', 'notes.txt', '']) {
        const { app, mock } = makeApp()
        const html = await postAndFollow(app, '/analyse/sample', r => r.type('form').send({ name }))
        assert.match(html, /ValidationError/)
        assert.match(html, /Unknown sample image/)
        assert.equal(mock.calls().length, 0, `no AWS call for ${JSON.stringify(name)}`)
    }
})

test('POST /analyse/sample with a non-image file posing as .png is rejected', async () => {
    const { app, mock } = makeApp()
    const html = await postAndFollow(app, '/analyse/sample', r => r.type('form').send({ name: 'fake.png' }))
    assert.match(html, /UnsupportedImage/)
    assert.match(html, /415/)
    assert.equal(mock.calls().length, 0)
})

test('POST /analyse/sample with no body is handled, not hung', async () => {
    const { app } = makeApp()
    const html = await postAndFollow(app, '/analyse/sample', r => r)
    assert.match(html, /Unknown sample image/)
})

test('POST /analyse/upload analyses the uploaded bytes and previews them inline', async () => {
    const { app, mock } = makeApp()
    mockSuccess(mock)
    const html = await postAndFollow(app, '/analyse/upload', r => r.attach('image', JPEG_BYTES, 'holiday.jpg'))

    assert.deepEqual(mock.commandCalls(DetectTextCommand)[0].args[0].input.Image.Bytes, JPEG_BYTES)
    assert.match(html, /<h1>holiday.jpg<\/h1>/)
    assert.match(html, /Uploaded/)
    assert.match(html, /src="data:image\/jpeg;base64,/)
})

test('POST /analyse/upload rejects files over 5 MB with 413', async () => {
    const { app, mock } = makeApp()
    const big = Buffer.concat([PNG_BYTES, Buffer.alloc(MAX_IMAGE_BYTES)])
    const html = await postAndFollow(app, '/analyse/upload', r => r.attach('image', big, 'big.png'))
    assert.match(html, /ImageTooLarge/)
    assert.match(html, /413/)
    assert.equal(mock.calls().length, 0)
})

test('POST /analyse/upload rejects non-images with 415', async () => {
    const { app, mock } = makeApp()
    const html = await postAndFollow(app, '/analyse/upload', r => r.attach('image', Buffer.from('GIF89a...'), 'anim.png'))
    assert.match(html, /UnsupportedImage/)
    assert.equal(mock.calls().length, 0)
})

test('POST /analyse/upload with no file', async () => {
    const { app } = makeApp()
    const html = await postAndFollow(app, '/analyse/upload', r => r.type('form').send({}))
    assert.match(html, /Choose an image to upload/)
})

test('POST /analyse/upload with the wrong field name', async () => {
    const { app } = makeApp()
    const html = await postAndFollow(app, '/analyse/upload', r => r.attach('other', PNG_BYTES, 'a.png'))
    assert.match(html, /UploadError/)
    assert.match(html, /LIMIT_UNEXPECTED_FILE/)
})

test('AWS errors show name, message, real HTTP status and request ID', async () => {
    const { app, mock, logged } = makeApp()
    mock.on(DetectLabelsCommand).rejects(new AccessDeniedException({ message: 'User is not authorized to perform: rekognition:DetectLabels', $metadata: metadata('req-denied', 400) }))
    mock.on(DetectTextCommand).rejects(new AccessDeniedException({ message: 'User is not authorized to perform: rekognition:DetectText', $metadata: metadata('req-denied-2', 400) }))
    mock.on(DetectFacesCommand).rejects(new InvalidImageFormatException({ message: 'Request has invalid image format', $metadata: metadata('req-bad', 400) }))

    const html = await postAndFollow(app, '/analyse/sample', r => r.type('form').send({ name: 'cat.png' }))

    assert.match(html, /AccessDeniedException/)
    assert.match(html, /User is not authorized to perform: rekognition:DetectLabels/)
    assert.match(html, /InvalidImageFormatException/)
    assert.match(html, /\(HTTP 400\)/)
    assert.match(html, /req-denied/)
    assert.match(html, /class="badge badge-error">400</)
    assert.doesNotMatch(html, /500/)
    assert.equal(logged.length, 3)
    assert.match(logged[0], /DetectLabels failed: AccessDeniedException \(status 400, request req-denied\)/)
})

test('network errors render with no status and a hint', async () => {
    const { app, mock } = makeApp()
    const refused = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:4566'), { code: 'ECONNREFUSED' })
    mock.on(DetectLabelsCommand).rejects(refused)
    mock.on(DetectTextCommand).rejects(refused)
    mock.on(DetectFacesCommand).rejects(refused)

    const html = await postAndFollow(app, '/analyse/sample', r => r.type('form').send({ name: 'cat.png' }))
    assert.match(html, /No response/)
    assert.match(html, /Could not reach the endpoint/)
})

test('signing details in error messages are not rendered', async () => {
    const { app, mock } = makeApp()
    const err = Object.assign(new Error('Signature mismatch. The Canonical String for this request should have been POST / Credential=AKIAIOSFODNN7EXAMPLE'), {
        name: 'InvalidSignatureException',
        $metadata: metadata('req-sig', 403)
    })
    mock.on(DetectLabelsCommand).rejects(err)
    mock.on(DetectTextCommand).rejects(err)
    mock.on(DetectFacesCommand).rejects(err)

    const html = await postAndFollow(app, '/analyse/sample', r => r.type('form').send({ name: 'cat.png' }))
    assert.match(html, /InvalidSignatureException/)
    assert.match(html, /403/)
    assert.doesNotMatch(html, /Canonical String|AKIAIOSFODNN7EXAMPLE/)
})

test('XSS: AWS data and upload filenames are escaped', async () => {
    const { app, mock } = makeApp()
    const payload = '<script>alert(1)</script>'
    mockSuccess(mock, { labels: [{ Name: payload, Confidence: 90, Parents: [{ Name: '<img src=x onerror=alert(2)>' }] }] })
    mock.on(DetectTextCommand).resolves({ TextDetections: [{ Type: 'LINE', DetectedText: '"><svg onload=alert(3)>', Confidence: 90 }], $metadata: metadata('t') })

    const html = await postAndFollow(app, '/analyse/upload', r => r.attach('image', PNG_BYTES, '"><img src=x onerror=alert(4)>.png'))

    assert.doesNotMatch(html, /<script>alert/)
    assert.doesNotMatch(html, /<img src=x/)
    assert.doesNotMatch(html, /<svg/)
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
    assert.match(html, /&lt;img src=x onerror=alert\(2\)&gt;/)
    assert.match(html, /&#34;&gt;&lt;svg onload=alert\(3\)&gt;/)
    assert.match(html, /&#34;&gt;&lt;img src=x onerror=alert\(4\)&gt;.png/)
    // the only <script> tag is the app's own
    assert.deepEqual([...html.matchAll(/<script\b[^>]*>/g)].map(m => m[0]), ['<script src="/assets/app.js">'])
})

test('POST /clear removes the stored result', async () => {
    const { app, mock } = makeApp()
    mockSuccess(mock)
    await postAndFollow(app, '/analyse/sample', r => r.type('form').send({ name: 'cat.png' }))
    const html = await postAndFollow(app, '/clear', r => r)
    assert.match(html, /Analyse an image/)
    assert.doesNotMatch(html, /req-labels/)
})

test('cross-site POSTs are blocked, same-origin ones allowed', async () => {
    const { app, mock } = makeApp()
    mockSuccess(mock)

    const evil = await request(app).post('/clear').set('Origin', 'https://evil.example.com')
    assert.equal(evil.status, 403)
    const nullOrigin = await request(app).post('/clear').set('Origin', 'null')
    assert.equal(nullOrigin.status, 403)
    const crossSite = await request(app).post('/analyse/sample').set('Sec-Fetch-Site', 'cross-site').type('form').send({ name: 'cat.png' })
    assert.equal(crossSite.status, 403)
    assert.equal(mock.calls().length, 0)

    const same = await request(app).post('/clear').set('Host', '127.0.0.1:3000').set('Origin', 'http://127.0.0.1:3000').set('Sec-Fetch-Site', 'same-origin')
    assert.equal(same.status, 303)
})

test('same-origin form POST with "Origin: null" is allowed (what Edge/Chrome actually sent)', async () => {
    const { app } = makeApp()
    const res = await request(app).post('/clear').set('Origin', 'null').set('Sec-Fetch-Site', 'same-origin')
    assert.equal(res.status, 303)
})

test('Sec-Fetch-Site same-site (another port on localhost) is blocked even with a matching-looking Origin', async () => {
    const { app } = makeApp()
    const res = await request(app).post('/clear').set('Host', '127.0.0.1:3000').set('Origin', 'http://127.0.0.1:3000').set('Sec-Fetch-Site', 'same-site')
    assert.equal(res.status, 403)
})

test('referrer policy keeps the Origin header meaningful', async () => {
    const { app } = makeApp()
    assert.equal((await request(app).get('/')).headers['referrer-policy'], 'same-origin')
})

test('unknown routes 404', async () => {
    const { app } = makeApp()
    assert.equal((await request(app).get('/nope')).status, 404)
    assert.equal((await request(app).get('/rekog')).status, 404)
})

test('unexpected errors return 500 instead of hanging', async () => {
    const { app, imagesDir, logged } = makeApp()
    require('node:fs').rmSync(imagesDir, { recursive: true })
    const res = await request(app).get('/')
    assert.equal(res.status, 500)
    assert.match(res.text, /Internal error/)
    assert.match(logged[0], /ENOENT/)
})

test('createApp requires a client', () => {
    const { createApp } = require('../app')
    assert.throws(() => createApp({}), /needs a Rekognition client/)
})
