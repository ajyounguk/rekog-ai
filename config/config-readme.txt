Rekog AI - configuration files (see README.md for full details)

Credentials
- Preferred: no file at all. The app uses the AWS SDK default provider chain, so run it with
  AWS_PROFILE=<profile> after `aws sso login`, or with a role / environment credentials.
- Optional: aws-config.json (copy aws-config-sample.json). If present it takes priority over the chain.
  Only use it for short test runs, delete it afterwards and deactivate/delete the access key in IAM.

Region
- AWS_REGION, aws-override.json, aws-config.json or your profile. Nothing is assumed.

Endpoint override (LocalStack or custom)
- AWS_ENDPOINT_URL_REKOGNITION / AWS_ENDPOINT_URL, or aws-override.json:
  { "endpoint": "http://localhost:4566", "region": "us-east-1" }

IAM
- Only rekognition:DetectLabels, DetectText and DetectFaces are needed - no need for
  AmazonRekognitionFullAccess. The README has a least-privilege policy pinned to one region.

aws-config.json and aws-override.json are git-ignored. Never commit credentials.
