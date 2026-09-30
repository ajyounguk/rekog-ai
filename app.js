// AWS Rekognition demo - Express app factory

const fs = require('node:fs/promises')
const path = require('node:path')
const express = require('express')
const multer = require('multer')
const { RekognitionClient } = require('@aws-sdk/client-rekognition')
const { loadAwsSettings } = require('./lib/aws-config')
const { analyseImage } = require('./lib/rekognition')
const { listSamples, detectImageType } = require('./lib/images')

// Rekognition's limit for images passed as bytes
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const ENVIRONMENT_LABELS = { aws: 'AWS', local: 'Local', custom: 'Custom endpoint' }

const SECURITY_HEADERS = {
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
}

// cheap CSRF guard: browsers send Origin (and Sec-Fetch-Site) on form POSTs, so reject cross-site ones.
// requests with neither header (curl, scripts) are allowed through
function sameOriginOnly(req, res, next) {
    if (req.method !== 'POST') return next()
    const site = req.get('sec-fetch-site')
    if (site && site !== 'same-origin' && site !== 'none') return res.status(403).type('text').send('Cross-site request blocked')
    const origin = req.get('origin')
    if (origin) {
        let host = null
        try {
            host = new URL(origin).host
        } catch {
            // "null" or garbage - treat as cross-site
        }
        if (host !== req.get('host')) return res.status(403).type('text').send('Cross-site request blocked')
    }
    next()
}

function formatPercent(value) {
    return typeof value === 'number' ? value.toFixed(1) + '%' : '–'
}

function createApp({ rekognition, environment = {}, imagesDir = path.join(__dirname, 'images'), log = console } = {}) {
    if (!rekognition) throw new Error('createApp needs a Rekognition client')

    const app = express()

    // last analysis, shown on GET / (post/redirect/get). single-user local tool, so one slot is enough
    let lastResult = null

    app.disable('x-powered-by')
    app.set('views', path.join(__dirname, 'views'))
    app.set('view engine', 'ejs')
    app.locals.environment = { ...environment, label: ENVIRONMENT_LABELS[environment.kind] || 'Unknown' }
    app.locals.formatPercent = formatPercent
    app.locals.maxImageMb = MAX_IMAGE_BYTES / 1024 / 1024

    app.use((req, res, next) => {
        res.set(SECURITY_HEADERS)
        next()
    })
    app.use('/assets', express.static(path.join(__dirname, 'public')))
    app.use('/samples', express.static(imagesDir))
    app.use(express.urlencoded({ extended: false, limit: '10kb' }))
    app.use(sameOriginOnly)

    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }).single('image')

    function storeError(source, status, name, message) {
        lastResult = { at: new Date().toISOString(), source, calls: [], ok: false, status, error: { name, message, status, requestId: null } }
    }

    async function analyse(source, bytes) {
        const type = detectImageType(bytes)
        if (!type) return storeError(source, 415, 'UnsupportedImage', 'Only PNG and JPEG images are supported')
        if (source.kind === 'upload') source.url = `data:${type};base64,${bytes.toString('base64')}`

        const calls = await analyseImage(rekognition, bytes)
        const failed = calls.find(call => !call.ok)
        for (const call of calls.filter(c => !c.ok)) {
            log.warn(`${call.api} failed: ${call.error.name} (status ${call.status ?? 'none'}, request ${call.requestId ?? 'none'})`)
        }
        lastResult = { at: new Date().toISOString(), source, calls, ok: !failed, status: failed ? failed.status : 200 }
    }

    app.get('/', async (req, res) => {
        const samples = await listSamples(imagesDir)
        res.render('index', { samples, result: lastResult })
    })

    app.post('/analyse/sample', async (req, res) => {
        const name = req.body && req.body.name
        const samples = await listSamples(imagesDir)
        // only names from the directory listing - never join user input onto a path
        if (typeof name !== 'string' || !samples.includes(name)) {
            storeError({ kind: 'sample', name: null }, 400, 'ValidationError', 'Unknown sample image')
        } else {
            const bytes = await fs.readFile(path.join(imagesDir, name))
            if (bytes.length > MAX_IMAGE_BYTES) {
                storeError({ kind: 'sample', name }, 413, 'ImageTooLarge', 'Image is larger than 5 MB')
            } else {
                await analyse({ kind: 'sample', name, url: '/samples/' + encodeURIComponent(name) }, bytes)
            }
        }
        res.redirect(303, '/')
    })

    app.post('/analyse/upload', (req, res, next) => {
        upload(req, res, async err => {
            try {
                if (err && err.code === 'LIMIT_FILE_SIZE') {
                    storeError({ kind: 'upload', name: null }, 413, 'ImageTooLarge', 'Image is larger than 5 MB')
                } else if (err) {
                    storeError({ kind: 'upload', name: null }, 400, 'UploadError', 'Upload failed: ' + (err.code || 'invalid form data'))
                } else if (!req.file || !req.file.size) {
                    storeError({ kind: 'upload', name: null }, 400, 'ValidationError', 'Choose an image to upload')
                } else {
                    await analyse({ kind: 'upload', name: req.file.originalname.slice(0, 200) }, req.file.buffer)
                }
                res.redirect(303, '/')
            } catch (e) {
                next(e)
            }
        })
    })

    app.post('/clear', (req, res) => {
        lastResult = null
        res.redirect(303, '/')
    })

    app.use((req, res) => res.status(404).type('text').send('Not found'))

    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
        log.error('Unhandled error:', err.name, err.message)
        res.status(500).type('text').send('Internal error - see the server log')
    })

    return app
}

module.exports = { createApp, sameOriginOnly, MAX_IMAGE_BYTES }

// start the server only when run directly (not when required by tests)
if (require.main === module) {
    const host = process.env.HOST || '127.0.0.1'
    const port = Number(process.env.PORT) || 3000

    let settings
    try {
        settings = loadAwsSettings({ configDir: path.join(__dirname, 'config') })
    } catch (err) {
        console.error(err.message)
        process.exit(1)
    }

    const rekognition = new RekognitionClient(settings.clientConfig)

    // region may come from a profile via the provider chain - resolve it for the environment badge
    rekognition.config.region().catch(() => undefined).then(region => {
        const environment = { ...settings.environment, region: region || settings.environment.region }
        const app = createApp({ rekognition, environment })
        app.listen(port, host, () => {
            console.log(`Rekog AI listening on http://${host}:${port}`)
            console.log(`Target: ${app.locals.environment.label}${environment.endpoint ? ' (' + environment.endpoint + ')' : ''}, region ${environment.region || 'NOT SET'}, credentials from ${environment.credentialSource}`)
            if (!environment.region) console.warn('No region configured - set AWS_REGION or add "region" to config/aws-config.json')
        })
    })
}
