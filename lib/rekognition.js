// run the three Rekognition image APIs and shape their results for the UI

const { DetectLabelsCommand, DetectTextCommand, DetectFacesCommand } = require('@aws-sdk/client-rekognition')
const { formatAwsError, stripMetadata } = require('./errors')

const FACE_FLAGS = ['Smile', 'EyesOpen', 'MouthOpen', 'Eyeglasses', 'Sunglasses', 'Beard', 'Mustache']

function summariseLabels(output) {
    return (output.Labels || []).map(label => ({
        name: label.Name,
        confidence: label.Confidence,
        parents: (label.Parents || []).map(p => p.Name)
    }))
}

function summariseText(output) {
    const detections = output.TextDetections || []
    return {
        lines: detections.filter(d => d.Type === 'LINE').map(d => ({ text: d.DetectedText, confidence: d.Confidence })),
        wordCount: detections.filter(d => d.Type === 'WORD').length
    }
}

function summariseFaces(output) {
    return (output.FaceDetails || []).map(face => ({
        ageRange: face.AgeRange ? `${face.AgeRange.Low}–${face.AgeRange.High}` : null,
        gender: face.Gender ? { value: face.Gender.Value, confidence: face.Gender.Confidence } : null,
        flags: FACE_FLAGS.filter(name => face[name]).map(name => ({
            name,
            value: face[name].Value,
            confidence: face[name].Confidence
        })),
        emotions: (face.Emotions || [])
            .map(e => ({ type: e.Type, confidence: e.Confidence }))
            .sort((a, b) => b.confidence - a.confidence)
    }))
}

const OPERATIONS = [
    {
        key: 'labels',
        api: 'DetectLabels',
        command: bytes => new DetectLabelsCommand({ Image: { Bytes: bytes }, MaxLabels: 20, MinConfidence: 60 }),
        summarise: summariseLabels
    },
    {
        key: 'text',
        api: 'DetectText',
        command: bytes => new DetectTextCommand({ Image: { Bytes: bytes } }),
        summarise: summariseText
    },
    {
        key: 'faces',
        api: 'DetectFaces',
        command: bytes => new DetectFacesCommand({ Image: { Bytes: bytes }, Attributes: ['ALL'] }),
        summarise: summariseFaces
    }
]

// calls run in parallel; one failing doesn't lose the others' results
async function analyseImage(client, bytes) {
    const settled = await Promise.allSettled(OPERATIONS.map(op => client.send(op.command(bytes))))
    return OPERATIONS.map((op, i) => {
        const result = settled[i]
        if (result.status === 'fulfilled') {
            const meta = (result.value && result.value.$metadata) || {}
            return {
                key: op.key,
                api: op.api,
                ok: true,
                status: meta.httpStatusCode || 200,
                requestId: meta.requestId || null,
                summary: op.summarise(result.value || {}),
                data: stripMetadata(result.value)
            }
        }
        const error = formatAwsError(result.reason)
        return { key: op.key, api: op.api, ok: false, status: error.status, requestId: error.requestId, error }
    })
}

module.exports = { analyseImage, summariseLabels, summariseText, summariseFaces }
