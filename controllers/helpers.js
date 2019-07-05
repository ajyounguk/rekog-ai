
// load UI data model 
var ui = require('../models/uiDataModel')


// Helper - reset UI data
function resetUI() {

    ui.data.rekogResultLabel = null
    ui.data.rekogResultText = null
    ui.data.rekogResultFace = null
    ui.data.filename = null
    
    ui.flow.activateDiv = ui.flow.activateDiv || 'label-result-div'
    ui.flow.activateButton = ui.flow.activateButton || 'label-button'

}
exports.resetUI = resetUI



