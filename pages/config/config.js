let { ipcRenderer } = require("electron");
const $ = require('jquery')

ipcRenderer.invoke("getDefaultValues").then(resp => {
    $('#base-url').val(resp.baseUrl);
    $('#project-areas').val(resp.projectAreas.join('\n'));
    let customAttributesString = [];
    new Map(Object.entries(JSON.parse(resp.customAttributes))).forEach((v,k) => {
        customAttributesString.push(`${k}=${v}`)
    })
    $('#custom-attributes').val(customAttributesString.join('\n'))
})

function saveConfig() {
    let baseUrl = $('#base-url').val()
    let projectAreas = $('#project-areas').val();
    let customAttributes = $('#custom-attributes').val();

    let projectAreaPredicate = projectAreas.length === 0;
    let baseUrlPredicate = !baseUrl;
    if(projectAreaPredicate || baseUrlPredicate) {
        $('#errors').html(`One of the configs is empty, you need to fill everything in order to work.`);
        $('#errors').show();
        return;
    } else {
        $('#errors').hide();
    }

    ipcRenderer.invoke("saveConfig", baseUrl, projectAreas, customAttributes).then(resp => {
        $('#config-toast-body').text('Saved successfully');
        new bootstrap.Toast($('.toast')).show();
    })

}