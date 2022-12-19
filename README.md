# Rekog-AI - Image Recognition

## What is this?
A web app that allows you to use Amazon's rekognition AI service to analyse images. 

The app is written in Node.js and uses the Amazon Rekognition AI service to perform the image recognition and analysis. 

See https://aws.amazon.com/rekognition/ for details

## Functionality
- upload image
- get textual description (labels) for image
- extract text and words from image 
- get face details including sentiment analysis (happy, sad, calm, etc.)

## Screenshots
![Alt text](/screenshots/labels.png?raw=true)
![Alt text](/screenshots/text.png?raw=true)
![Alt text](/screenshots/face.png?raw=true)

## Repo Contents
- /config = example aws creds config file
- /controllers = UI http controller and rekognition API functionality 
- /images = sample images (put your own images into this directory)
- /models = ui data model
- /public = stylesheet, favorite icon, ui assets
- /screenshots - screenshot images for this readme
- /views = UI ejs components, assets and partials

## Todo
- add video recognition functionality
- add functionality to capture screenshots from webcam
- batch recognition and classification
- continuous (image recognition from webcam (polling) 
- text to speech
- hardware recognition prototype?

## Images to be analysed
put them in the /images directory

images must be under 5mb and in either .jpg or .png format

## Installation overview

#### 1. Install Node.js
get it from https://nodejs.org/en/

#### 2. Clone this repository
```
git clone https://github.com/ajyounguk/img-rekog
```

#### 3. Install project modules/dependencies
```
cd img-rekog
npm install
```

#### 4. Create AWS credentials and add them to the configuration file in the /config directory
You will need a AWS IAM user configured with AmazonRekognitionFullAccess permissions
**please take care and don't commit your creds back to git if you clone this repo**
```
cd config
cp aws-config-sample.json aws-config.json
```
edit the aws-config.json file and add your IAM access key (for example, AKIAIOSFODNN7EXAMPLE), the secret access key and your aws account region into the config file

IAM policy requires access to 'rekognition' APIs - e.g. arn:aws:iam::aws:policy/AmazonRekognitionFullAccess

## How to run it
run the webserver:
```
node app.js
```

## How to access the app
point your browser at the local/remoteIP port 3000 to load the HTML form

e.g http://127.0.0.1:3000/
