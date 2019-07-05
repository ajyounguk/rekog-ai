// AWS Rekog API demo

// load the express framework
var express = require('express')
var app = express()
var port = process.env.PORT || 3000

// configure assets and views
app.use('/assets', express.static(__dirname + '/public'))
app.use( express.static(__dirname + '/images'))


app.set('views', __dirname + '/views')
app.set('view engine', 'ejs')

// load the controller
var rekogController = require('./controllers/rekogController')

rekogController(app)

// Start server.
console.log('AWS Rekog Client listening on port', port)

app.listen(port)

// done -eol
