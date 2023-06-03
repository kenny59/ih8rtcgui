let { ipcRenderer } = require("electron");
const fetch = require('node-fetch');
const https = require('https');
function login() {
    ipcRenderer.invoke("login", $('#j_username').val(), $('#j_password').val(), $('#save-details').prop('checked')).then(response => {
        if(!response) {
            $('#myModal').modal('show');
        }
    })
}

ipcRenderer.invoke("getUserNameAndDummyPass").then(resp => {
    $('#j_username').val(resp.user);
    $('#j_password').val(resp.pass);
})
