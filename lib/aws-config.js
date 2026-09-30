// AWS client settings: credentials, region and optional endpoint override

const fs = require('node:fs')
const path = require('node:path')

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', 'localstack', 'host.docker.internal'])

// read a JSON file, returning null if it doesn't exist.
// parse errors deliberately omit the parser message - newer V8 versions quote the file contents in it
function readJson(file) {
    let text
    try {
        text = fs.readFileSync(file, 'utf8')
    } catch (err) {
        if (err.code === 'ENOENT') return null
        throw new Error(`Could not read config/${path.basename(file)} (${err.code})`)
    }
    try {
        return JSON.parse(text)
    } catch {
        throw new Error(`config/${path.basename(file)} is not valid JSON`)
    }
}

// 'aws' (no override), 'local' (LocalStack or similar) or 'custom'
function classifyEndpoint(endpoint) {
    if (!endpoint) return 'aws'
    let url
    try {
        url = new URL(endpoint)
    } catch {
        throw new Error(`Endpoint override "${endpoint}" is not a valid URL`)
    }
    if (LOCAL_HOSTS.has(url.hostname) || url.port === '4566') return 'local'
    return 'custom'
}

// work out RekognitionClient config and a description of the target environment.
// precedence: env vars > config/aws-override.json > config/aws-config.json > SDK default chain
function loadAwsSettings({ configDir, env = process.env } = {}) {
    const creds = readJson(path.join(configDir, 'aws-config.json'))
    const override = readJson(path.join(configDir, 'aws-override.json')) || {}

    const endpoint = env.AWS_ENDPOINT_URL_REKOGNITION || env.AWS_ENDPOINT_URL || override.endpoint || undefined
    const region = env.AWS_REGION || env.AWS_DEFAULT_REGION || override.region || (creds && creds.region) || undefined
    const kind = classifyEndpoint(endpoint)

    const clientConfig = {}
    if (region) clientConfig.region = region
    if (endpoint) clientConfig.endpoint = endpoint

    let credentialSource = 'default provider chain'
    if (creds) {
        if (typeof creds.accessKeyId !== 'string' || typeof creds.secretAccessKey !== 'string') {
            throw new Error('config/aws-config.json must contain accessKeyId and secretAccessKey strings')
        }
        clientConfig.credentials = {
            accessKeyId: creds.accessKeyId,
            secretAccessKey: creds.secretAccessKey,
            ...(creds.sessionToken ? { sessionToken: creds.sessionToken } : {})
        }
        credentialSource = 'config/aws-config.json'
    } else if (kind === 'local' && !env.AWS_ACCESS_KEY_ID && !env.AWS_PROFILE) {
        // LocalStack accepts any credentials; saves needing a profile for local runs
        clientConfig.credentials = { accessKeyId: 'test', secretAccessKey: 'test' }
        credentialSource = 'LocalStack test credentials'
    }

    return {
        clientConfig,
        environment: { kind, region, endpoint, credentialSource }
    }
}

module.exports = { loadAwsSettings, classifyEndpoint }
