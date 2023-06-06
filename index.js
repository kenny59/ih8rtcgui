const { app, BrowserWindow, safeStorage, ipcRenderer, Menu, dialog} = require('electron')
const path = require('path')
const util = require("util");
let { ipcMain } = require("electron")
const {XMLParser} = require("fast-xml-parser");
const https = require('https');
const fetch = require('node-fetch');
const parser = new XMLParser({ignoreAttributes : false});
const moment = require('moment-timezone')
const Store = require('electron-store');

let tokensNeeded = ['LtpaToken2', 'JSESSIONID'];
let cookiesList = [];

const args = process.argv;

let agent = new https.Agent({
    rejectUnauthorized: false
});

//TODO zoom
//TODO custom icon
//TODO connection error show error
//TODO subscribers scroll?

require('electron-debug')({ showDevTools: false });

const store = new Store({
    name: 'credentials',
    watch: true,
    encryptionKey: 'very_secure_obfuscation_key',
});

let defaultConfig = {
    history: {
        lastProjectArea: '',
        lastDate: '',
        lastFilterBy: '',
        lastFilterType: ''
    },
    projectAreas: [],
    baseUrl: '',
    hasSavedPassword: false,
    useSavedPassword: false
}

if(!store.get("config")) {
    store.set("config", defaultConfig);
}

let _win;

function createConfigWindow() {
    const configWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false,
            devTools: true
        }
    });
    configWindow.loadFile("./config/config.html");
    configWindow.setTitle("Configuration")
}

function createWindow () {

    const menu = Menu.getApplicationMenu(); // get default menu

    const menuTest = Menu.buildFromTemplate(
        [{
                label: "Caches",
                submenu: [
                    {
                        label: "Delete all data",
                        click: () => {
                            let text = "You are about to delete stored passwords, base url and project areas.\nAre you sure?";
                            let options  = {
                                buttons: ["Yes","No", "Cancel"],
                                message: text
                            }
                            dialog.showMessageBox(options).then((response, checkboxChecked) => {
                                if(response.response === 0) {
                                    cookiesList = [];
                                    store.set("config", defaultConfig);
                                    store.delete("user");
                                    store.delete("pass");
                                }
                            })
                        }
                    }, {
                        label: "Logout",
                        click: () => {
                            let text = "You are about to logout.\nAre you sure?";
                            let options  = {
                                buttons: ["Yes","No", "Cancel"],
                                message: text
                            }
                            dialog.showMessageBox(options).then((response, checkboxChecked) => {
                                if (response.response === 0) {
                                    store.delete("user");
                                    store.delete("pass");
                                    store.set("config.hasSavedPassword", false);
                                    store.set("config.useSavedPassword", false);
                                    _win.loadFile("login.html");
                                    _win.setTitle("Login")
                                }
                            })
                        }
                    }
                ]
    }])
    menu.append(menuTest.items[0]);
    menu.append(Menu.buildFromTemplate([{
        label: "Open configs",
        click: () => {
            createConfigWindow();
        }
    }]).items[0]);
    Menu.setApplicationMenu(menu); // set the modified menu


    const win = new BrowserWindow({
        width: 800,
        height: 600,
        minWidth: 1024,
        minHeight: 720,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false,
            devTools: true
        }
    })

    win.webContents.on('will-navigate', (event, url) => {
        event.preventDefault();
        require("electron").shell.openExternal(url);
    });

    let cookies = win.webContents.session.cookies;
    cookies.on('changed', function(event, cookie, cause, removed) {

        if (tokensNeeded.includes(cookie.name) && cookie.session && !removed) {
            cookiesList.push(cookie);
        }
        if(cookiesList.length === tokensNeeded.length) {
            //win.setSize(200, 400);
            win.loadFile("index.html");
            win.setTitle("ih8rtcgui tool")
        }
    });


    win.loadFile("login.html");
    win.setTitle("Login")
    _win = win;


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
    return store.get("config");
})

ipcMain.handle("loadWorkItems", async (event, projectArea, date, filterBy, filterType) => {
    store.set("config.history.lastProjectArea", projectArea);
    store.set("config.history.lastDate", date);
    store.set("config.history.lastFilterBy", filterBy);
    store.set("config.history.lastFilterType", filterType);

    let filters = [`projectArea/name='${projectArea}'`];
    //let tagFilters = tag.split(",").map(t => `tags=|${t}|`).join(" or ");
    if(date !== "") {
        const dateMoment = moment(date).utc(true).format("YYYY-MM-DDTHH:mm:ss.SSSZZ").replace("+", "-")
        filters.push(`${filterBy}${filterType}${dateMoment}`);
    }
    //filters.push(tagFilters);
    let size = 5;
    let pos = 0;
    let workItemsUrl = `${store.get("config.baseUrl")}/rpt/repository/workitem?fields=workitem/workItem[${filters.join(" and ")}]/(id|summary|state/name|modified|owner/name|tags|subscriptions/name)`
    allDataList = [];
    let text = await recursivelyCheckAllRemainingData(workItemsUrl);
    return allDataList;
});

/**
 * @returns string[]
 */
async function login(username, password) {
    let cookiesList = [];
    var myHeaders = new Headers();
    let url = new URL(store.get("config.baseUrl"));
    myHeaders.append("Referer", `${store.get("config.baseUrl")}/auth/authrequired`);
    myHeaders.append("Host", `${url.host}`);
    myHeaders.append("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
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

    let response1 = await fetch(store.get("config.baseUrl") + "/j_security_check", requestOptions);
    if(!response1.headers.get('set-cookie')) {
        return [];
    }
    cookiesList.push(...response1?.headers?.raw()?.["set-cookie"]?.map(c => c.split(";")[0]));


    requestOptions.redirect = 'follow';
    myHeaders.append("Cookie", cookiesList.join(";"));


    let response2 = await fetch(store.get("config.baseUrl") + "/j_security_check", requestOptions);
    let authreq = response2.headers.get('x-com-ibm-team-repository-web-auth-msg');
    if(authreq !== null || response2.status !== 200) {
        console.log('Unsuccessful auth');
        return [];
    }
    cookiesList.push(response2.headers.get('set-cookie').split(';')[0]);

    return cookiesList;
}

ipcMain.handle("getUserNameAndDummyPass", (event) => {
    let user = store.get("user");
    let pass = store.get("pass");
    return {user: user, pass: "*".repeat(8), hasSavedPass: store.get("config.hasSavedPassword"), useSavedPass: store.get("config.useSavedPassword")};
})

async function loginWithSavedCredentials() {
    return await loginProcess(store.get("user"), safeStorage.decryptString(Buffer.from(store.get("pass"))), store.get("saveCredentials"));
}

async function loginProcess(username, password, saveCredentials, useSavedCredentials) {
    if(useSavedCredentials) {
        if(store.get("user") && store.get("pass")) {
            username = store.get("user");
            password = safeStorage.decryptString(Buffer.from(store.get("pass")));
        } else {
            return {success: false, message: 'You have no stored password, please enter password.'};
        }
    }
    store.set("config.useSavedPassword", useSavedCredentials)
    let cookiesFromLogin = await login(username, password);
    if(cookiesFromLogin.length >= 2) {
        cookiesList = cookiesFromLogin;
        if(saveCredentials) {
            store.set("pass", safeStorage.encryptString(password));
            store.set("user", username);
            store.set("config.hasSavedPassword", true)
            //save credentials
        }
        return {success: true, message: ''};
        //successful login
    } else {
        return {success: false, message: 'Wrong username/password combination'};
    }
}

ipcMain.handle("login", async (event, username, password, saveCredentials, useSavedCredentials) => {
    let loginResponse = await loginProcess(username, password, saveCredentials, useSavedCredentials);
    if(loginResponse.success) {
        _win.loadFile("index.html");
        _win.setTitle("ih8rtcgui tool")
    }
    return loginResponse;
});

ipcMain.handle("loadWorkItemData", async (event, rtcNo) => {
    let url = `${store.get("config.baseUrl")}/rpt/repository/workitem?fields=workitem/workItem[id=${rtcNo}]/(*|creator/name|comments/creator/name|comments/formattedContent|comments/creationDate|itemHistory/modifiedBy/name|itemHistory/*|itemHistory/owner/name|itemHistory/state/name|itemHistory/subscriptions/name|auditableLinks/targetRef/referencedItem/href|auditableLinks/targetRef/comment|auditableLinks/modified)`;
    let dataPreprocessed = await getData(url);
    if(dataPreprocessed?.['workitem']?.['workItem']) {
        let wi = dataPreprocessed['workitem']['workItem'];
        wi.id = wi.id + ` <a href="${store.get("config.baseUrl")}/web/projects/${store.get("config.history.lastProjectArea")}#action=com.ibm.team.workitem.viewWorkItem&id=${wi.id}"><i class="fa fa-external-link" aria-hidden="true"></i></a>`;
    }
    return dataPreprocessed;
})

ipcMain.handle("saveConfig", (event, baseUrl, projectAreas) => {
    store.set("config.baseUrl", baseUrl);
    store.set("config.projectAreas", projectAreas.split("\n"))
    _win.webContents.send("changedConfig", store.get("config"));
    return "Saved config successfully";
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
    if(workitems.status === 500) return null;
    let headers = workitems.headers;
    let authRequiredHeader = headers.get('X-com-ibm-team-repository-web-auth-msg');
    if(authRequiredHeader !== null || workitems.status !== 200) {
        if(store.get("config.hasSavedPassword") === true) {
            if(!await loginWithSavedCredentials()) {
                //can't login
                _win.loadFile("login.html");
                _win.setTitle("Login")
            } else {
                return getData(url);
            }
        } else {
            _win.loadFile("login.html");
            _win.setTitle("Login")
        }
    }
    return await parser.parse(await workitems.text());
}