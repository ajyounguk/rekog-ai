// turn SDK v3 errors into something safe and useful to render

// SignatureDoesNotMatch and friends can echo the canonical request / signing details
const SENSITIVE_MARKERS = ['The Canonical String', 'The String-to-Sign', 'Authorization=', 'X-Amz-Signature', 'Signature=', 'Credential=']
const NETWORK_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'])

function sanitiseMessage(message) {
    let text = String(message || '')
    for (const marker of SENSITIVE_MARKERS) {
        const at = text.indexOf(marker)
        if (at >= 0) text = text.slice(0, at).trim() + ' [signing details removed]'
    }
    return text.length > 500 ? text.slice(0, 500) + '…' : text
}

// { name, message, status, requestId } - status is the real AWS HTTP status, or null if AWS never answered
function formatAwsError(err) {
    const meta = (err && err.$metadata) || {}
    const status = meta.httpStatusCode || (err && err.$response && err.$response.statusCode) || null
    const network = err && (NETWORK_CODES.has(err.code) || err.name === 'TimeoutError')
    return {
        name: (err && err.name) || 'Error',
        message: sanitiseMessage(err && err.message) || 'Unknown error',
        status,
        requestId: meta.requestId || null,
        ...(network ? { hint: 'Could not reach the endpoint - check the endpoint override and your network' } : {})
    }
}

function stripMetadata(output) {
    if (!output || typeof output !== 'object') return output
    const { $metadata, ...rest } = output
    return rest
}

module.exports = { formatAwsError, stripMetadata, sanitiseMessage }
