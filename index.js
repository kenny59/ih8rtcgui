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
const _ = require("lodash")
const getArray = require("./utils");

let tokensNeeded = ['LtpaToken2', 'JSESSIONID'];
let cookiesList = [];

const args = process.argv;

let agent = new https.Agent({
    rejectUnauthorized: false
});

//TODO refactor
//TODO open details in new page?
//TODO check state before updating if it has not been updated since
//TODO use constants instead of text
//TODO hide row (or just select differnt color)
//TODO fix timezone incorrect
//TODO remove filter when column is hidden
//TODO search RTC number directly (use right top search maybe)

//https://rtc.prg-dc.dhl.com:9443/jazz/rpt/repository/generic?fields=generic/com.ibm.team.process.TeamArea[projectArea/name=%22DHL%20Express%20OTC%20(RTC)%22]/(contributors/name)
//https://jazz.net/sandbox01-ccm/oslc/users?oslc.where=foaf:name="Tibor*"}&oslc.prefix=foaf=<http://xmlns.com/foaf/0.1/>&oslc.select=foaf:name
 //OSLC-Core-Version: 2.0 needs in header

//TODO nicetohave: zoom
//TODO nicetohave: custom icon
//TODO nicetohave: connection error show error

if (process.env.PORTABLE_EXECUTABLE_DIR)
    app.setPath ('userData', path.join(process.env.PORTABLE_EXECUTABLE_DIR, "data"));


require('electron-debug')({ showDevTools: false });

const store = new Store({
    name: 'credentials',
    watch: true,
    encryptionKey: 'very_secure_obfuscation_key',
});

/**
 *
 * @type {
 *  {
 *   baseUrl: string,
 *   useSavedPassword: boolean,
 *   projectAreas: *[],
 *   history: {lastProjectArea: string, lastFilterBy: string, lastFilterType: string, lastStartDate: string, lastEndDate: string},
 *   hasSavedPassword: boolean,
 *   customAttributes: string,
 *   datatablesState: object
 *  }
 * }
 */
let defaultConfig = {
    history: {
        /** string */ lastProjectArea: '',
        /** string */ lastStartDate: '',
        /** string */ lastEndDate: '',
        /** string */ lastFilterBy: '',
        /** string */ lastFilterType: ''
    },
    /** string[] */ projectAreas: [],
    /** string */ customAttributes: '',
    /** string */ baseUrl: '',
    /** boolean */ hasSavedPassword: false,
    /** boolean */ useSavedPassword: false,
    /** object */ datatablesState: {}
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
            nodeIntegration: true,
            contextIsolation: false,
            devTools: true
        }
    });
    configWindow.loadFile(`pages/config/config.html`);
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
                                    _win.loadFile("pages/login/login.html");
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
    menu.append(Menu.buildFromTemplate([{
        label: "Scroll to top",
        click: () => {
            _win.webContents.executeJavaScript('document.body.scrollTop = 0; document.documentElement.scrollTop = 0;');
        }
    }]).items[0])
    Menu.setApplicationMenu(menu); // set the modified menu


    const win = new BrowserWindow({
        width: 800,
        height: 600,
        minWidth: 1024,
        minHeight: 720,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            devTools: true,
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
            win.loadFile("pages/main/main.html");
            win.setTitle("ih8rtcgui tool")
        }
    });


    win.loadFile("pages/login/login.html");
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

ipcMain.handle("loadWorkItems", async (event, projectArea, startDateString, endDateString, filterBy, filterType) => {
    store.set("config.history.lastProjectArea", projectArea);
    store.set("config.history.lastStartDate", startDateString);
    store.set("config.history.lastEndDate", endDateString);
    store.set("config.history.lastFilterBy", filterBy);
    store.set("config.history.lastFilterType", filterType);

    let filters = [`projectArea/name='${projectArea}'`];
    //let tagFilters = tag.split(",").map(t => `tags=|${t}|`).join(" or ");
    [{date: moment(startDateString), operator: ">"}, {date: moment(endDateString), operator: "<"}].forEach(date => {
        if(filterType !== date.operator && filterType !== "!!") return;
        const dateMoment = moment(date.date).utc(true).format("YYYY-MM-DDTHH:mm:ss.SSSZZ").replace("+", "-")
        filters.push(`${filterBy}${date.operator}${dateMoment}`);
    })
    //filters.push(tagFilters);
    let size = 5;
    let pos = 0;
    let workItemsUrl = `${store.get("config.baseUrl")}/rpt/repository/workitem?fields=workitem/workItem[${filters.join(" and ")}]/(id|summary|state/name|modified|owner/name|tags|subscriptions/name|state/workflow/id|state/name)`
    allDataList = [];
    let text = await recursivelyCheckAllRemainingData(workItemsUrl, ['workitem', 'workItem']);
    allDataList = text;
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

let DATATABLES_STATE_KEY = "datatablesState"
ipcMain.handle("saveDataTables", (event, data) => {
    return store.set(DATATABLES_STATE_KEY, data);
})
ipcMain.handle("loadDataTables", (event) => {
    return store.get(DATATABLES_STATE_KEY);
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
        store.set("config.useSavedPassword", useSavedCredentials)
    }
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

ipcMain.handle("getContributorName", async (event, itemId) => {
    let jtsUrl = `${store.get("config.baseUrl").replace("ccm", "jts")}/rpt/repository/foundation?fields=projectArea/contributor[itemId=${itemId}]/name`;
    let response = await getData(jtsUrl);
    return response?.['foundation']?.['contributor']?.['name'];
})
ipcMain.handle("login", async (event, username, password, saveCredentials, useSavedCredentials) => {
    let loginResponse = await loginProcess(username, password, saveCredentials, useSavedCredentials);
    if(loginResponse.success) {
        _win.loadFile("pages/main/main.html");
        _win.setTitle("ih8rtcgui tool")
    }
    return loginResponse;
});

ipcMain.handle("loadWorkItemData", async (event, rtcNo) => {
    let url = `${store.get("config.baseUrl")}/rpt/repository/workitem?fields=workitem/workItem[id=${rtcNo}]/(*|creator/name|creator/itemType|comments/creator/name|comments/formattedContent|comments/creationDate|itemHistory/modifiedBy/name|itemHistory/*|itemHistory/owner/name|itemHistory/state/name|itemHistory/subscriptions/name|auditableLinks/targetRef/referencedItem/href|auditableLinks/targetRef/comment|auditableLinks/modified|allExtensions/key|allExtensions/displayValue|customAttributes/identifier|customAttributes/itemType|customAttributes/attributeType|allExtensions/itemValue/itemId|state/name|state/workflow/id)`;
    let dataPreprocessed = await getData(url);
    //let stateName = dataPreprocessed?.['workitem']?.['workItem']?.['state']?.['name'];
    //let workflowId = dataPreprocessed?.['workitem']?.['workItem']?.['state']?.['workflow']?.['id'];
    //let possibleActions = await getPossibleStates(workflowId, stateName);
    //dataPreprocessed['actions'] = possibleActions;
    if(dataPreprocessed?.['workitem']?.['workItem']) {
        let wi = dataPreprocessed['workitem']['workItem'];
        wi.id = wi.id + ` <a href="${store.get("config.baseUrl")}/web/projects/${store.get("config.history.lastProjectArea")}#action=com.ibm.team.workitem.viewWorkItem&id=${wi.id}"><i class="fa fa-external-link" aria-hidden="true"></i></a>`;
    }
    return dataPreprocessed;
})

ipcMain.handle("saveConfig", (event, baseUrl, projectAreas, customAttributes) => {
    store.set("config.baseUrl", baseUrl);
    store.set("config.projectAreas", projectAreas.split("\n"))
    let customAttributesRows = customAttributes.split("\n");
    let customAttributesMap = new Map()
    customAttributesRows.forEach(car => {
        let keyValues = car.split("=");
        customAttributesMap.set(keyValues[0], keyValues[1]);
    });
    store.set("config.customAttributes", JSON.stringify(Object.fromEntries(customAttributesMap)))
    _win.webContents.send("changedConfig", store.get("config"));
    return "Saved config successfully";
})

ipcMain.handle("getAllStates", async (event) => {
    return await getAllStates();
})
ipcMain.handle("getUsersByCondition", async (event, searchText) => {
    return await getUsersByCondition(searchText);
})

ipcMain.handle("getTeamAreaUsers", async (event) => {
    return await getTeamAreaUsers();
})

ipcMain.handle("modifyState", async (event, id, stateId, userId, comment) => {
    await modifyState(id, stateId, userId, comment);
    return true;
})

let STEPS = 1000;
async function recursivelyCheckAllRemainingData(url, selectors, size = STEPS, pos = 0, customHeader = {}) {
    let list = [];
    let text = await getData(url+`&size=${size}&pos=${pos}`, false, customHeader);
    if(_.get(text, selectors.join('.')) != null) {
        if(Array.isArray(_.get(text, selectors.join('.')))) {
            list.push(..._.get(text, selectors.join('.')));
        } else {
            list.push(_.get(text, selectors.join('.')));
        }
        list.push(...await recursivelyCheckAllRemainingData(url, selectors, size, pos + size));
    }
    return list;
}
async function sendData(url, method = 'POST', body = {}) {
    let jsessionid = cookiesList.find(c => c.startsWith("JSESSIONID"))?.split("=")[1];
    let workitems = await fetch(url, {
        method: method,
        agent: agent,
        headers: {
            'Cookie': cookiesList.join(";"),
            'X-Jazz-CSRF-Prevent': jsessionid,
            'Accept': 'application/x-oslc-cm-change-request+json',
            'Content-Type': 'application/json'
            //'Cookie': cookiesList.map(cookie => `${cookie.name}=${cookie.value}`).join(";")
        },
        body: JSON.stringify(body)
    });
    console.log(workitems.status);
    console.log(await workitems.text())
}
async function getData(url, overrideStatus = false, customHeader = {}) {
    let jsessionid = cookiesList.find(c => c.startsWith("JSESSIONID"))?.split("=")[1];
    let inputHeaders = {
        'Cookie': cookiesList.join(";"),
        'X-Jazz-CSRF-Prevent': jsessionid
        //'Cookie': cookiesList.map(cookie => `${cookie.name}=${cookie.value}`).join(";")
    }
    for (const ch in customHeader) {
        inputHeaders[ch] = customHeader[ch];
    }
    let workitems = await fetch(url, {
        agent: agent,
        headers: inputHeaders
    });
    if(workitems.status === 500) return null;
    let headers = workitems.headers;
    let authRequiredHeader = headers.get('X-com-ibm-team-repository-web-auth-msg');
    if((authRequiredHeader !== null || workitems.status !== 200) && !overrideStatus) {
        if(store.get("config.hasSavedPassword") === true) {
            if(!await loginWithSavedCredentials()) {
                //can't login
                _win.loadFile("pages/login/login.html");
                _win.setTitle("Login")
            } else {
                return getData(url);
            }
        } else {
            _win.loadFile("pages/login/login.html");
            _win.setTitle("Login")
        }
    }
    return await parser.parse(await workitems.text());
}

async function getContentId() {
    let teamarea = store.get("config.history.lastProjectArea") || store.get("config.projectAreas")?.[0];
    let contentIdUrl = `${store.get("config.baseUrl")}/rpt/repository/generic?fields=generic/com.ibm.team.process.ProjectArea[name='${teamarea}']/processData[key=%27com.ibm.team.internal.process.compiled.xml%27]/value/contentId`
    let content = await getData(contentIdUrl);
    return content?.['generic']?.['com.ibm.team.process.ProjectArea']?.['processData']?.['value']?.['contentId'];
}

async function getPossibleStates(type, currentState) {
    let contentId = await getContentId();
    let resourceUrl = `${store.get("config.baseUrl")}/resource/content/${contentId}`;
    let resources = await getData(resourceUrl, true);
    let configurationData = _.get(resources, 'process-specification.project-configuration.data.configuration-data');
    let workflowDefinitions = _.find(configurationData, (value) => {
        return value?.['@_id'] === 'com.ibm.team.workitem.configuration.workflow'
    })?.['workflowDefinition'];
    let currentWorkflowDefinition = _.find(workflowDefinitions, (value) => {
        return value?.['@_id'] === type
    })
    let possibleStates = _.find(currentWorkflowDefinition?.['workflow']?.['state'], (value) => {
        return value?.['@_name'] === currentState
    });
    return getArray(possibleStates, ['action']).map(ps => {
        return {
            humanFriendlyName: currentWorkflowDefinition['workflow']?.['action'].find(a => a['@_id'] === ps['@_id'])?.['@_name'],
            action: ps['@_id']
        }
    });
}
async function getAllStates() {
    let contentId = await getContentId();
    let resourceUrl = `${store.get("config.baseUrl")}/resource/content/${contentId}`;
    let resources = await getData(resourceUrl, true);
    let configurationData = _.get(resources, 'process-specification.project-configuration.data.configuration-data');
    let workflowDefinitions = _.find(configurationData, (value) => {
        return value?.['@_id'] === 'com.ibm.team.workitem.configuration.workflow'
    })?.['workflowDefinition'];
    return workflowDefinitions?.map(wd => {
        return {
            workflowName: wd?.['@_id'],
            states: wd?.['workflow']?.['state'].filter(e => e['action']).map(ps => {
                return {
                    stateName: ps?.['@_name'],
                    possibleStates: getArray(ps, ['action']).map(ps => {
                        return {
                            humanFriendlyName: wd['workflow']?.['action'].find(a => a['@_id'] === ps['@_id'])?.['@_name'],
                            action: ps['@_id']
                        }
                    })
                }
            })
        }
    })
}

async function getTeamAreaUsers() {
    let url = `${store.get("config.baseUrl")}/rpt/repository/generic?fields=generic/com.ibm.team.process.TeamArea[projectArea/name="${store.get("config.history.lastProjectArea")}"]/contributors[archived=false]/(name|href)`;
    let teamareas = await getData(url, false);
    return _.flatMap(getArray(teamareas, ['generic', 'com.ibm.team.process.TeamArea']).filter(ta => ta), 'contributors').map(contributor => {
        return {
            text: contributor['name'],
            id: contributor['@_href']
        }
    })
}
async function getUsersByCondition(condition) {
    let conditionWithWildcard = condition ? `*${condition}*` : '*';
    let conditionName = new ConditionBuilder().setKey("oslc.where").setValue("foaf:name=\"" + conditionWithWildcard + "\" and foaf:archived=false")
    let conditionPrefixFoaf = new ConditionBuilder().setWrapQuotes(false).setKey("oslc.prefix").setValue("foaf=<http://xmlns.com/foaf/0.1/>")
    let conditionSelect = new ConditionBuilder().setKey("oslc.select").setValue("foaf:name")
    let conditionWhere = [conditionName.toString(), conditionPrefixFoaf.toString(), conditionSelect.toString()].join("&")
    let resourceUrl = `${store.get("config.baseUrl")}/oslc/users?${conditionWhere}`;
    let resources = await getData(resourceUrl,  false, {"OSLC-Core-Version": "2.0", "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"});
    let users = getArray(resources, ['rdf:RDF', 'rdf:Description', 'rdfs:member'])?.map(tm => {
        return {
            text: tm['foaf:Person']?.['foaf:name']?.['#text'],
            id: tm['foaf:Person']?.['@_rdf:about']
        }
    });
    let teamAreaUsers = await getTeamAreaUsers();
    if(condition) {
        teamAreaUsers = teamAreaUsers.filter(tau => tau.text.toLowerCase().indexOf(condition.toLowerCase()) > -1);
    }
    return {
        results: [
            {
                text: "Team Area Users",
                children: _.orderBy(_.uniqBy(teamAreaUsers, 'text'), 'text')
            },
            {
                text: "Search",
                children: _.orderBy(users, 'text')
            }
        ]
    };
}

class ConditionBuilder {
    key;
    value;
    wrapQuotes = false;
    setKey(key) {
        this.key = key;
        return this;
    }
    setValue(value) {
        this.value = value;
        return this;
    }

    setWrapQuotes(wrapQuotes) {
        this.wrapQuotes = wrapQuotes;
        return this;
    }
    toString() {
        let quote = this.wrapQuotes ? '"' : '';
        return this.key + "=" + encodeURIComponent(quote + this.value + quote);
    }
}
async function modifyState(id, actionId, userId, comment) {
    let modifyStateUrl = `${store.get("config.baseUrl")}/oslc/workitems/${id}`;
    let modifyStateOwnerUrl = modifyStateUrl;
    let modifyStateCommentUrl = modifyStateUrl;
    if(actionId) modifyStateOwnerUrl += `?_action=${actionId}`;
    let body = {};
    if(userId) {
        body = {
            "rtc_cm:ownedBy": userId
        }
    }
    if(userId || actionId) {
        await sendData(modifyStateOwnerUrl, 'PUT', body);
    }
    if(comment && comment.replace(/\s/g, '').length) {
        let commentBody = {
            "dc:description": comment.replace("\n", "<br>")
        }
        await sendData(`${modifyStateCommentUrl}/rtc_cm:comments`, 'POST', commentBody);
    }
}