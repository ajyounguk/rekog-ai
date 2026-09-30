# Rekog AI - Image Recognition

A small local web app for trying out [Amazon Rekognition](https://aws.amazon.com/rekognition/). Pick a sample image or
upload your own, and it shows what Rekognition finds:

- **Labels** - objects, scenes and concepts, with confidence and parent labels
- **Text** - lines and words detected in the image
- **Faces** - age range, predicted gender, attributes (smile, glasses, eyes open...) and emotions
- **Response** - the raw API output, highlighted, with a copy button and the AWS request IDs

Written in Node.js with Express, EJS and the AWS SDK for JavaScript v3.

## Screenshots

Captured from a demo server with a mocked Rekognition client and placeholder data.

![Labels view](screenshots/labels.png)

![Faces view](screenshots/faces.png)

![Text view in dark mode](screenshots/text-dark.png)

![A failed call showing the AWS error, status and request ID](screenshots/error.png)

<img src="screenshots/narrow.png" alt="Narrow screen layout" width="300">

## Requirements

- Node.js 20 or later
- An AWS account with access to Rekognition in your chosen region (there is a free tier; each analysis makes
  **3 billable API calls** - DetectLabels, DetectText and DetectFaces)

## Setup

```
git clone https://github.com/ajyounguk/rekog-ai.git
cd rekog-ai
npm install
```

### Credentials

The app uses the AWS SDK's **default credential provider chain**, so short-lived credentials work out of the box. This
is the recommended setup:

- **IAM Identity Center (SSO):** `aws sso login --profile my-profile`, then run with `AWS_PROFILE=my-profile`
- **Named profile or assumed role** from `~/.aws/config`: set `AWS_PROFILE`
- **Environment variables:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN`
- **Instance / container roles** when running on AWS

If `config/aws-config.json` exists it takes priority over the chain. It's there for compatibility with the old setup
and for short test runs. Avoid long-lived access keys if you can:

```
cp config/aws-config-sample.json config/aws-config.json
```

```json
{
  "accessKeyId": "AKIAIOSFODNN7EXAMPLE",
  "secretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  "sessionToken": "optional",
  "region": "eu-west-2"
}
```

`config/aws-config.json` and `config/aws-override.json` are git-ignored. Don't commit credentials, and delete the file
(and the access key in IAM) when you're done with it.

### Region

The region comes from, in order: `AWS_REGION` / `AWS_DEFAULT_REGION`, `config/aws-override.json`,
`config/aws-config.json`, then your AWS profile. Nothing is assumed. If no region is set, the badge shows
"region not set" and calls fail with a clear error. Rekognition isn't offered in every region.

### Endpoint override (LocalStack or a custom endpoint)

Point the client at another endpoint with `AWS_ENDPOINT_URL_REKOGNITION` or `AWS_ENDPOINT_URL`, or with
`config/aws-override.json`:

```json
{ "endpoint": "http://localhost:4566", "region": "us-east-1" }
```

Endpoints on `localhost`, `127.0.0.1`, `localstack`, `host.docker.internal` or port 4566 count as local. If there's no
config file, profile or key env var, the app uses LocalStack's `test`/`test` credentials. Rekognition support in
LocalStack is limited, so check what your version emulates.

The sidebar badge shows where calls are going:

| Badge | Meaning |
| --- | --- |
| Red **AWS** | Real AWS - calls are billed |
| Green **Local** | LocalStack / local emulator |
| Amber **Custom endpoint** | Any other endpoint override |

### IAM policy

These Rekognition actions don't support resource-level permissions, so the narrowest useful policy is the three
actions pinned to one region:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["rekognition:DetectLabels", "rekognition:DetectText", "rekognition:DetectFaces"],
      "Resource": "*",
      "Condition": { "StringEquals": { "aws:RequestedRegion": "eu-west-2" } }
    }
  ]
}
```

No need for `AmazonRekognitionFullAccess`.

## Running it

```
npm start
```

Then open http://127.0.0.1:3000/. The console shows the target environment, region and where the credentials came
from.

| Variable | Default | |
| --- | --- | --- |
| `PORT` | `3000` | |
| `HOST` | `127.0.0.1` | Only change this if you understand the security notes below |

## Images

Sample images live in `images/`. Any `.png` or `.jpg` you drop in there shows up in the sidebar. You can also upload
an image directly. Rekognition accepts PNG and JPEG up to 5 MB when sent as bytes. The app checks the file's actual
content, not just its extension. Uploads are held in memory for the current result only and never written to disk.

## Security notes

- **No authentication.** Anyone who can reach the port can run analyses on your AWS account (and your bill). The
  server binds to `127.0.0.1` by default. Don't expose it on a network or the internet.
- **CSRF:** the POST endpoints check `Origin` / `Sec-Fetch-Site` and reject cross-site requests from browsers.
  Requests without those headers (curl, scripts) are allowed, since anything that can reach the port can already
  use the app. There are no destructive actions: Rekognition's Detect APIs don't create or delete AWS resources.
- **Output escaping:** everything from AWS or the user (labels, detected text, filenames) is HTML-escaped, and the
  JSON highlighter builds DOM nodes with `textContent`. A restrictive Content-Security-Policy blocks inline scripts.
- **Errors** show the AWS error name, message, HTTP status and request ID. Signing details (canonical request,
  string-to-sign, credential scope) are stripped from messages before they're shown or logged.
- **Sample picker** only accepts names from the `images/` directory listing, so it can't read files outside it.
- The provided sample images were collected from the web for demo purposes.

## Tests

```
npm test
```

Uses `node:test`, [supertest](https://github.com/ladjs/supertest) and
[aws-sdk-client-mock](https://github.com/m-radzikowski/aws-sdk-client-mock). No AWS access needed. It covers every
route (success and error paths), config loading and precedence, error formatting, upload validation, the CSRF check,
page rendering and XSS escaping.

Rekognition's Detect APIs return everything in one response, so there's no pagination to handle.

## Repo contents

| Path | |
| --- | --- |
| `app.js` | `createApp()` factory (Express app, routes); starts the server when run directly |
| `lib/aws-config.js` | Credential, region and endpoint resolution |
| `lib/rekognition.js` | Runs the three Detect APIs in parallel and summarises the results |
| `lib/errors.js` | SDK v3 error formatting and sanitising |
| `lib/images.js` | Sample listing and PNG/JPEG detection |
| `views/` | EJS page and partials |
| `public/` | Stylesheet, client script, icons |
| `images/` | Sample images |
| `config/` | Sample credentials file (real ones are git-ignored) |
| `test/` | Test suite |

## Architecture

```mermaid
flowchart TB
    Browser["Browser<br/>127.0.0.1:3000"]

    subgraph App["Node.js app"]
        direction TB
        Routes["app.js<br/>createApp() routes"]
        Views["views/*.ejs"]
        Images["lib/images.js"]
        Rekog["lib/rekognition.js<br/>+ lib/errors.js"]
        Config["lib/aws-config.js"]
    end

    Samples[("images/")]
    Files[("config/aws-config.json<br/>config/aws-override.json")]
    Chain["SDK default provider chain<br/>SSO · profile · env · role"]
    AWS["Amazon Rekognition<br/>or LocalStack / custom endpoint"]

    Browser -->|"GET / · POST /analyse/*"| Routes
    Routes --> Views
    Routes --> Images
    Routes --> Rekog
    Images --> Samples
    Config -.->|client settings| Rekog
    Files --> Config
    Chain --> Config
    Rekog -->|"DetectLabels · DetectText · DetectFaces"| AWS
```

```mermaid
sequenceDiagram
    actor User
    participant Browser
    participant App as Express app
    participant Rek as Rekognition

    User->>Browser: Pick a sample or upload an image
    Browser->>App: POST /analyse/sample or /analyse/upload
    App->>App: Same-origin check, validate name / size / PNG-JPEG bytes
    par Three calls in parallel
        App->>Rek: DetectLabels
        App->>Rek: DetectText
        App->>Rek: DetectFaces
    end
    Rek-->>App: Results or errors (status, request ID)
    App->>App: Summarise, strip $metadata, sanitise errors, store result
    App-->>Browser: 303 See Other → /
    Browser->>App: GET /
    App-->>Browser: Rendered page (escaped), result panel
    Browser->>Browser: Highlight JSON with textContent
```
