let { ipcRenderer } = require("electron");
const fetch = require('node-fetch');
const https = require('https');
const $ = require("jquery");

function login() {
    $('#overlay').show();
    ipcRenderer.invoke("login", $('#j_username').val(), $('#j_password').val(), $('#save-details').prop('checked'), $('#saved-pass-checkbox').prop('checked')).then(response => {
        if(!response.success) {
            $('#message').text(response.message);
            new bootstrap.Modal($('#myModal')).show();
        }
        $('#overlay').fadeOut();
    })
}

ipcRenderer.invoke("getUserNameAndDummyPass").then(resp => {
    $('#j_username').val(resp.user);
    if(resp.hasSavedPass) {
        $('#j_password').prop('placeholder', resp.pass);
    } else {
        $('#saved-pass-checkbox').attr('disabled', '')
    }
    if(resp.useSavedPass) {
        $('#saved-pass-checkbox').prop('checked', true)
    }
})
ipcRenderer.invoke("getDefaultValues").then(resp => {
    let projectAreaPredicate = Array.isArray(resp.projectAreas) && !resp.projectAreas.length;
    let baseUrlPredicate = !resp.baseUrl;
    if(projectAreaPredicate || baseUrlPredicate) {
        $('#errors').html(`Don't forget to set all values in config page.`);
        $('#errors').show();
    } else {
        $('#errors').hide();
    }
})