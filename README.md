## AWS Rekognition Web App 

## What is this?
A Node.js web client that excercises the AWS image recognition AI (using the rekognition service)

## Screenshots
![Alt text](/screenshots/rekog4.png?raw=true)
![Alt text](/screenshots/rekog3.png?raw=true)
![Alt text](/screenshots/rekog2.png?raw=true)
![Alt text](/screenshots/rekog1.png?raw=true)

## Contains:
- app.js = main app & webserver. Launch this
- /controllers = HTTP routes and rekognition API functionality 
- /config = example aws creds config file and example endpoint override (optional) config file
- /public = stylesheet
- views = main index.ejs and UI partials 

### Rekog Functionality:
- Upload photo and get recognised text labes (description)


### Todo:
- text recognition
- celebrity... recognition
- (near) real time recognition

## Installation overview
install Node.js: https://nodejs.org/en/

clone the repo and install modules:

```
git clone https://github.com/ajyounguk/img-rekog
cd img-rekog
npm install
```

## AWS Credentials
Copy the configuration details and add your AWS creds.

** please take care and don't commit your creds back to git **
```
cd config
cp aws-config-sample.json aws-config.json
```
create a IAM user with AmazonRekognitionFullAccess permissions and copy in the accesskey and secret into the aws-config.json file

## Images to be analysed
put them in the /images directory
they must be under 5mb in jpg or png format



## How to run it
run the webserver:

```
node app.js
```

point your browser at the local/remoteIP port 3000 to load the HTML form

For more information on AWS Rekognition see:
https://aws.amazon.com/rekognition/