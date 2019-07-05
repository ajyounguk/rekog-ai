# AWS Rekognition (Image Recognition) Web App 

## What is this?
A Node.js web client written in Node.js that excercises the AWS image recognition AI API using the rekognition service. 
See https://aws.amazon.com/rekognition/ for details


## Screenshots
![Alt text](/screenshots/rekog4.png?raw=true)
![Alt text](/screenshots/rekog1.png?raw=true)
![Alt text](/screenshots/rekog5.png?raw=true)


## Contents:
- app.js = main app & webserver. Launch this.
- /config = example aws creds config file and example endpoint override (optional) config file
- /public = stylesheet
- /images = sample images (put your own images into this directory)
- /models = ui data model
- /views = main index.ejs and UI partials 
- /controllers = HTTP routes and rekognition API functionality 
- /screenshots - app screenshots for readme


## Rekog Functionality:
- Upload photo, and run it through AWS rekognition service to get back:
-- text labels (description)
-- text from image (OCR) 
-- facial details including sentiment analysis (happy, sad, calm, etc.)


### Todo:
- include video recognition
- add functionality for webcam screenshots
- batch recognition and classification 
- continuous image recognition from webcam
- text to speech


## Installation overview
1. install Node.js: https://nodejs.org/en/

2. clone the repo:
```
git clone https://github.com/ajyounguk/img-rekog
```

3. install node modules/dependencies:
```
cd img-rekog
npm install
```

4. create AWS credentials and add them to the configuration file in the /config directory
You will need a AWS IAM user configured with AmazonRekognitionFullAccess permissions

** please take care and don't commit your creds back to git if you clone this repo **
```
cd config
cp aws-config-sample.json aws-config.json
```
edit the aws-config.jon file and add your IAM Access key (for example, AKIAIOSFODNN7EXAMPLE) and the secret access key into the config file


## Images to be analysed
put them in the /images directory
they must be under 5mb in jpg or png format


## How to run it
run the webserver:
```
node app.js
```

point your browser at the local/remoteIP port 3000 to load the HTML form
e.g http://127.0.0.1:3000/

