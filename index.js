const { app, BrowserWindow, safeStorage, ipcRenderer} = require('electron')
const path = require('path')
const util = require("util");
let { ipcMain } = require("electron")
const {XMLParser} = require("fast-xml-parser");
const https = require('https');
const fetch = require('node-fetch');
const parser = new XMLParser();
const moment = require('moment-timezone')
const sqlite3 = require('sqlite3');
const Store = require('electron-store');


let tokensNeeded = ['LtpaToken2', 'JSESSIONID'];
let cookiesList = [];

const args = process.argv;

let BASE_URL = args[2] ? args[2] : "https://jazz.net/sandbox01-ccm";
let teamAreaUrl = `${BASE_URL}/rpt/repository/foundation?fields=projectArea/projectArea/name`



let agent = new https.Agent({
    rejectUnauthorized: false
});

require('electron-debug')({ showDevTools: false });

const store = new Store({
    name: 'credentials',
    watch: true,
    encryptionKey: 'very_secure_obfuscation_key',
});
function setPassword(key, password) {
    const buffer = safeStorage.encryptString(password);
    store.set(key, buffer.toString('latin1'));
}

function deletePassword(key) {
    store.delete(key);
}

function getCredentials() {
    return Object.entries(store.store).reduce((credentials, [account, buffer]) => {
        return [...credentials, { account, password: safeStorage.decryptString(Buffer.from(buffer, 'latin1')) }];
    }, []);
};

let _win;
function createWindow () {

    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false,
            devTools: true
        }
    })

    let cookies = win.webContents.session.cookies;
    cookies.on('changed', function(event, cookie, cause, removed) {

        if (tokensNeeded.includes(cookie.name) && cookie.session && !removed) {
            cookiesList.push(cookie);
        }
        if(cookiesList.length === tokensNeeded.length) {
            //win.setSize(200, 400);
            win.loadFile("index.html");
        }
    });


    win.loadFile("login.html");
    _win = win;
    //win.loadURL(BASE_URL);

}

app.whenReady().then(() => {
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

let allDataList = [];

ipcMain.handle("getDefaultValues", (event) => {
    return store.get("defaultValues");
})

ipcMain.handle("loadWorkItems", async (event, projectArea, date) => {
    store.set("defaultValues", {
        projectArea: projectArea,
        date: date
    });
    let filters = [`projectArea/name='${projectArea}'`];
    //let tagFilters = tag.split(",").map(t => `tags=|${t}|`).join(" or ");
    if(date !== "") {
        const dateMoment = moment(date).utc(true).format("YYYY-MM-DDTHH:mm:ss.SSSZZ").replace("+", "-")
        filters.push(`modified>${dateMoment}`);
    }
    //filters.push(tagFilters);
    let size = 5;
    let pos = 0;
    let workItemsUrl = `${BASE_URL}/rpt/repository/workitem?fields=workitem/workItem[${filters.join(" and ")}]/(id|summary|state/name|modified|owner/name|tags)`
    allDataList = [];
    let text = await recursivelyCheckAllRemainingData(workItemsUrl);
    return allDataList;
});

ipcMain.handle("loadTeamAreas", async (event) => {
    let teamareas = await getData(teamAreaUrl);
    return teamareas;
})

/**
 * @returns string[]
 */
async function login(username, password) {
    let cookiesList = [];
    var myHeaders = new Headers();
    let url = new URL(BASE_URL);
    myHeaders.append("Referer", `${BASE_URL}/auth/authrequired`);
    myHeaders.append("Host", `${url.host}`);
    myHeaders.append("Content-Type", "application/x-www-form-urlencoded");
    myHeaders.append("Origin", `${url.protocol}//${url.host}`);

    var requestOptions = {
        agent: new https.Agent({
            rejectUnauthorized: false
        }),
        method: 'POST',
        headers: myHeaders,
        body: new URLSearchParams({
            j_username: username,
            j_password: password
        }),
        redirect: 'manual'
    };

    let response1 = await fetch(BASE_URL + "/j_security_check", requestOptions);
    if(!response1.headers.get('set-cookie')) {
        return [];
    }
    cookiesList.push(response1.headers.get('set-cookie').split(';')[0]);


    requestOptions.redirect = 'follow';
    myHeaders.append("Cookie", cookiesList.join(";"));


    let response2 = await fetch(BASE_URL + "/j_security_check", requestOptions);
    let authreq = response2.headers.get('x-com-ibm-team-repository-web-auth-msg');
    if(authreq !== null) {
        console.log('Unsuccessful auth');
        return [];
    }
    cookiesList.push(response2.headers.get('set-cookie').split(';')[0]);

    return cookiesList;
}

ipcMain.handle("getUserNameAndDummyPass", (event) => {
    let user = store.get("user");
    let pass = (store.get("pass"));
    if(user && pass) {
        store.set("autopopulatedCredentials", true);
    } else {
        store.set("autopopulatedCredentials", false);
    }
    return {user: user, pass: "*".repeat(8)};
})

async function loginWithSavedCredentials() {
    return await loginProcess(store.get("user"), safeStorage.decryptString(Buffer.from(store.get("pass"))), store.get("saveCredentials"));
}

async function loginProcess(username, password, saveCredentials) {
    if(store.get("autopopulatedCredentials")) {
        username = store.get("user");
        password = safeStorage.decryptString(Buffer.from(store.get("pass")));
    }
    let cookiesFromLogin = await login(username, password);
    if(cookiesFromLogin.length === 2) {
        cookiesList = cookiesFromLogin;
        if(saveCredentials) {
            store.set("pass", safeStorage.encryptString(password));
            store.set("user", username);
            store.set("autopopulatedCredentials", true)
            //save credentials
        }
        return true;
        //successful login
    } else {
        return false;
    }
}

ipcMain.handle("login", async (event, username, password, saveCredentials) => {
    let loginResponse = await loginProcess(username, password, saveCredentials);
    if(loginResponse) _win.loadFile("index.html");
    return loginResponse;
});

ipcMain.handle("loadWorkItemData", async (event, rtcNo) => {
    let url = `${BASE_URL}/rpt/repository/workitem?fields=workitem/workItem[id=${rtcNo}]/(*|allExtensions/displayValue|comments/creator/name|comments/content|comments/creationDate)`;
    return await getData(url);
})

let STEPS = 1000;
async function recursivelyCheckAllRemainingData(url, size = STEPS, pos = 0) {
    let text = await getData(url+`&size=${size}&pos=${pos}`);
    if(text?.['workitem']?.['workItem'] != null) {
        if(Array.isArray(text['workitem']['workItem'])) {
            allDataList.push(...text['workitem']['workItem']);
        } else {
            allDataList.push(text['workitem']['workItem']);
        }
        await recursivelyCheckAllRemainingData(url, size, pos + STEPS);
    }
}
async function getData(url) {
    let workitems = await fetch(url, {
        agent: agent,
        headers: {
            'Cookie': cookiesList.join(";")
            //'Cookie': cookiesList.map(cookie => `${cookie.name}=${cookie.value}`).join(";")
        }
    });
    let headers = workitems.headers;
    let authRequiredHeader = headers.get('X-com-ibm-team-repository-web-auth-msg');
    if(authRequiredHeader !== null) {
        if(store.get("autopopulatedCredentials") === true) {
            if(!await loginWithSavedCredentials()) {
                //can't login
                _win.loadFile("login.html");
            } else {
                return getData(url);
            }
        }
    }
    return await parser.parse(await workitems.text());
}