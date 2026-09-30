const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { loadAwsSettings, classifyEndpoint } = require('../lib/aws-config')

function configDir(files = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rekog-config-'))
    for (const [name, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(dir, name), typeof content === 'string' ? content : JSON.stringify(content))
    }
    return dir
}

test('no config files: default provider chain, real AWS, no region forced', () => {
    const { clientConfig, environment } = loadAwsSettings({ configDir: configDir(), env: {} })
    assert.deepEqual(clientConfig, {})
    assert.equal(environment.kind, 'aws')
    assert.equal(environment.credentialSource, 'default provider chain')
    assert.equal(environment.region, undefined)
})

test('aws-config.json supplies static credentials and region', () => {
    const dir = configDir({ 'aws-config.json': { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'secret', region: 'eu-west-2' } })
    const { clientConfig, environment } = loadAwsSettings({ configDir: dir, env: {} })
    assert.deepEqual(clientConfig.credentials, { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'secret' })
    assert.equal(clientConfig.region, 'eu-west-2')
    assert.equal(environment.credentialSource, 'config/aws-config.json')
})

test('aws-config.json passes through a session token', () => {
    const dir = configDir({ 'aws-config.json': { accessKeyId: 'ASIA', secretAccessKey: 's', sessionToken: 'tok' } })
    const { clientConfig } = loadAwsSettings({ configDir: dir, env: {} })
    assert.equal(clientConfig.credentials.sessionToken, 'tok')
})

test('aws-config.json without keys is rejected', () => {
    const dir = configDir({ 'aws-config.json': { region: 'eu-west-2' } })
    assert.throws(() => loadAwsSettings({ configDir: dir, env: {} }), /must contain accessKeyId and secretAccessKey/)
})

test('invalid JSON error does not echo the file contents', () => {
    const dir = configDir({ 'aws-config.json': '{"accessKeyId": "AKIASECRETVALUE", oops' })
    assert.throws(() => loadAwsSettings({ configDir: dir, env: {} }), err => {
        assert.match(err.message, /not valid JSON/)
        assert.doesNotMatch(err.message, /AKIASECRETVALUE/)
        return true
    })
})

test('aws-override.json endpoint on port 4566 is local, with LocalStack test credentials', () => {
    const dir = configDir({ 'aws-override.json': { endpoint: 'http://localhost:4566', region: 'us-east-1' } })
    const { clientConfig, environment } = loadAwsSettings({ configDir: dir, env: {} })
    assert.equal(clientConfig.endpoint, 'http://localhost:4566')
    assert.equal(clientConfig.region, 'us-east-1')
    assert.deepEqual(clientConfig.credentials, { accessKeyId: 'test', secretAccessKey: 'test' })
    assert.equal(environment.kind, 'local')
    assert.equal(environment.credentialSource, 'LocalStack test credentials')
})

test('local endpoint keeps the provider chain when a profile is set', () => {
    const dir = configDir({ 'aws-override.json': { endpoint: 'http://localhost:4566' } })
    const { clientConfig } = loadAwsSettings({ configDir: dir, env: { AWS_PROFILE: 'dev' } })
    assert.equal(clientConfig.credentials, undefined)
})

test('env vars override the config files', () => {
    const dir = configDir({
        'aws-config.json': { accessKeyId: 'a', secretAccessKey: 'b', region: 'eu-west-2' },
        'aws-override.json': { endpoint: 'http://localhost:4566', region: 'us-east-1' }
    })
    const { clientConfig, environment } = loadAwsSettings({
        configDir: dir,
        env: { AWS_REGION: 'eu-west-1', AWS_ENDPOINT_URL: 'https://rekognition.example.com' }
    })
    assert.equal(clientConfig.region, 'eu-west-1')
    assert.equal(clientConfig.endpoint, 'https://rekognition.example.com')
    assert.equal(environment.kind, 'custom')
})

test('service-specific endpoint env var wins over the generic one', () => {
    const { clientConfig } = loadAwsSettings({
        configDir: configDir(),
        env: { AWS_ENDPOINT_URL: 'https://generic.example.com', AWS_ENDPOINT_URL_REKOGNITION: 'http://127.0.0.1:4566' }
    })
    assert.equal(clientConfig.endpoint, 'http://127.0.0.1:4566')
})

test('classifyEndpoint', () => {
    assert.equal(classifyEndpoint(undefined), 'aws')
    assert.equal(classifyEndpoint('http://localhost:4566'), 'local')
    assert.equal(classifyEndpoint('http://localstack:4566'), 'local')
    assert.equal(classifyEndpoint('http://10.0.0.5:4566'), 'local')
    assert.equal(classifyEndpoint('https://vpce.example.com'), 'custom')
    assert.throws(() => classifyEndpoint('not a url'), /not a valid URL/)
})
