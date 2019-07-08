// AWS Rekog Client Controller
module.exports = function (app) {

	// load the AWS SDK
	var aws = require('aws-sdk')
	var fs = require('fs')

	// require Helper functions
	var helper = require('./helpers')

	// load UI data model 
	var ui = require('../models/uiDataModel')

	// setup bodyparser
	var bodyParser = require('body-parser')
	app.use(bodyParser.json()) // support json encoded bodies
	app.use(
		bodyParser.urlencoded({
			extended: true
		})
	) // support encoded bodies

	// load aws config
	aws.config.loadFromPath(__dirname + '/../config/aws-config.json')

	// load page / form
	var rekog = new aws.Rekognition({})

	// serve up main page
	app.get('/', function (req, res) {

		helper.resetUI()

		// ui flow
		ui.flow.timestamp = new Date(Date.now())

		res.setHeader('Content-Type', 'text/html')
		res.render('./index.ejs', {
			ui: ui
		})

	})

	// process image
	app.post('/rekog', function (req, res) {

		ui.data.filename = req.body.filename
		ui.flow.activateDiv = ui.flow.activateDiv || 'label-result-div'
		ui.flow.activateButton = ui.flow.activateButton || 'label-button'

		var loadImage = function () {
			return new Promise(function (resolve, reject) {

				var fs = require('fs')
				var file = __dirname + '/../images/' + req.body.filename

				if (ui.debuginfo) console.log('==> reading image from file ' + file)

				// this will run async
				fs.readFile(file, 'base64', (err, data) => {

					// file error?
					if (err) reject(err)
					else {
						// create a new base64 buffer out of the string passed to us by fs.readFile()
						buffer = new Buffer(data, 'base64')
						resolve(buffer)
					}
				})
			})

		}

		// detect image labels
		var detectLabels = function (buffer) {
			return new Promise(function (resolve, reject) {

				var params = {
					Image: {
						Bytes: buffer
					},
					MaxLabels: 20,
					MinConfidence: 60
				}
				// call rekog and resolve / reject promise
				rekog.detectLabels(params, function (err, data) {
					if (err) reject(err)
					else {
						var str = ''
						if (ui.debuginfo) console.log('==> rekog label data is ', JSON.stringify(data, null, 3))

						for (i = 0; i < data.Labels.length; i++) {
							str += data.Labels[i].Name + ' - Confidence ' + data.Labels[i].Confidence.toFixed(2) + '%\n'
						}
						resolve(str)
					}
				})
			})


		}

		// detect image text
		var detectText = function (buffer) {
			return new Promise(function (resolve, reject) {

				var params = {
					Image: {
						Bytes: buffer
					}
				}

				// call rekog and resolve / reject promise
				rekog.detectText(params, function (err, data) {

					if (err) reject(err)
					else {
						str = ''
						if (ui.debuginfo) console.log('==> rekog text result data is', JSON.stringify(data, null, 3))

						for (i = 0; i < data.TextDetections.length; i++) {
							str += '(' + data.TextDetections[i].Type + ') ' + data.TextDetections[i].DetectedText + ' - Confidence ' + data.TextDetections[i].Confidence.toFixed(2) + '%\n'
						}
						resolve(str)
					}
				})
			})
		}

		// detect image face description and sentiment analysis data
		var detectFace = function (buffer) {
			return new Promise(function (resolve, reject) {

				var params = {
					Attributes: ['ALL'],
					Image: {
						Bytes: buffer
					}
				}

				// call rekog and resolve / reject promise
				rekog.detectFaces(params, function (err, data) {

					if (err) reject(err)
					else {
						str = ''
						if (ui.debuginfo) console.log('==> rekog face result data is', JSON.stringify(data, null, 3))

						str = ''
						str += 'Faces detected:' + data.FaceDetails.length + '\n\n'

						for (i = 0; i < data.FaceDetails.length; i++) {
							face = i + 1
							str += 'Face(' + face + '):\n'
							str += 'Age between ' + data.FaceDetails[i].AgeRange.Low + ' and ' + data.FaceDetails[i].AgeRange.High + '\n'
							str += 'Smiling = ' + data.FaceDetails[i].Smile.Value + ', Confidence ' + data.FaceDetails[i].Smile.Confidence.toFixed(2) + '\n'
							str += 'Eyeglasses = ' + data.FaceDetails[i].Eyeglasses.Value + ', Confidence ' + data.FaceDetails[i].Eyeglasses.Confidence.toFixed(2) + '\n'
							str += 'EyesOpen = ' + data.FaceDetails[i].Eyeglasses.Value + ', Confidence ' + data.FaceDetails[i].EyesOpen.Confidence.toFixed(2) + '\n'
							str += 'Gender = ' + data.FaceDetails[i].Gender.Value + ', Confidence ' + data.FaceDetails[i].Gender.Confidence.toFixed(2) + '\n'
							str += 'Mouth Open = ' + data.FaceDetails[i].MouthOpen.Value + ', Confidence ' + data.FaceDetails[i].MouthOpen.Confidence.toFixed(2) + '\n'
							str += 'Mustache = ' + data.FaceDetails[i].Mustache.Value + ', Confidence ' + data.FaceDetails[i].Mustache.Confidence.toFixed(2) + '\n'
							str += 'Sunglasses = ' + data.FaceDetails[i].Sunglasses.Value + ', Confidence ' + data.FaceDetails[i].Sunglasses.Confidence.toFixed(2) + '\n'

							str += 'Emotions:\n'
							for (j = 0; j < data.FaceDetails[i].Emotions.length; j++) {
								str += data.FaceDetails[i].Emotions[j].Type + ', Confidence ' + data.FaceDetails[i].Emotions[j].Confidence.toFixed(2) + '\n'
							}
							str += '\n'
						}
						resolve(str)
					}
				})
			})
		}






		// main controller logic - load the file, then call recog APIs in parallel, collect promises and render screen

		// loadimage - on promise resolved,  call detectlabels and detecttext functions
		loadImage().then(function resolveLoadImage(buffer) {

				// execute detectLabels and detectText in parallel then assign UI vars and render results
				Promise.all([detectLabels(buffer), detectText(buffer), detectFace(buffer)]).then(function resolveAll(arr) {
						// all promises resolved
						ui.data.rekogResultLabel = arr[0]
						ui.data.rekogResultText = arr[1]
						ui.data.rekogResultFace = arr[2]
						res.render('./index.ejs', {
							ui: ui
						})

					},
					// promise error - from either detectLabels, detectText
					function rejectAll(err) {
						ui.data.rekogResultLabel = err
						res.render('./index.ejs', {
							ui: ui
						})
					})

			}, // loadmimage promise err
			function rejectLoadImage(err) {
				ui.data.rekogResultLabel = err
				res.render('./index.ejs', {
					ui: ui
				})
			})

	})
}