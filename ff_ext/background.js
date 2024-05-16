const formFieldsStorageKey = "AIFillForm";
const AIsettingsStarageKey = "settings";

var AIFillFormOptions = {};
var AIHelperSettings = {};
var initCompleted = false;
/* const embeddings = {
    "emailAddress": [...],  // ~ 400-dim embedding for emailAddress
    "email": [...],         // ~ 400-dim embedding for email
    "tel": [...]            // ~ 400-dim embedding for tel
}; */
var staticEmbeddings = {};
var dynamicEmbeddings = {};

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if(tab.url && !tab.url.startsWith('http')) {  return;  }
});

function createContextMenu(){

    browser.contextMenus.create({
            id: "fillthisform",
            title: "📝 Fill the form",
            contexts: ["editable"]
        },
        // See https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/#event-pages-and-backward-compatibility
        // for information on the purpose of this error capture.
        () => void browser.runtime.lastError,
    );

    browser.contextMenus.create({
            id: "fillthisfield",
            title: "▭ Fill this field",
            contexts: ["editable"]
        },
        () => void browser.runtime.lastError,
    );

    browser.contextMenus.create({
            id: "clearallfield",
            title: "⌦ Clear the fields",
            contexts: ["editable"]
        },
        () => void browser.runtime.lastError,
    );

    browser.contextMenus.create({
            id: "replacefieldvalue",
            title: "(→) Replace field value",
            contexts: ["editable"]
        },
        () => void browser.runtime.lastError,
    );

    browser.contextMenus.create({
            id: "showfieldmetadata",
            title: "</> Show form fields metadata",
            contexts: ["editable"]
        },
        () => void browser.runtime.lastError,
    );

    chrome.contextMenus.create({
        id: "showSimilarityAgain",
        title: "⅏ Show similarities again",
        contexts: ["editable"]
    });

    addDataAsMenu().then().catch(e => console.error(`Failed to bild dynamic menu items.`, e));

    browser.contextMenus.create({
            id: "separator1",
            type: "separator",
            contexts: ["all"]
        },
        () => void browser.runtime.lastError,
    );

    browser.contextMenus.create({
            id: "openOptions",
            title: "⚙️ Options",
            contexts: ["all"]
        },
        () => void browser.runtime.lastError,
    );
}

browser.contextMenus.onClicked.addListener(function(info, tab) {
    if(tab.url && !tab.url.startsWith('http')) {  return;  }
    switch (info.menuItemId) {
        case "fillthisform":
            browser.tabs.sendMessage(tab.id, {action: "getFormFields"}).then(async response => {
                if (response && response.formDetails) {
                    try {
                        let obj = JSON.parse(response?.formDetails || '[]');
                        if(obj && obj.length > 0){
                            await processForm(obj, tab.id);
                        }
                    } catch (error) {
                        console.error(error);
                        console.log(response.formDetails);
                    }
                }
            }).catch(e=>  console.error("Error sending message:", e));
            break;
        case "fillthisfield":
            getAndProcessClickedElement(tab, info.menuItemId, true);
/*             browser.tabs.sendMessage(tab.id, {action: "getClickedElement"}, async function(response) {
                if (response && response.elementDetails) {
                    try {
                        let obj = JSON.parse(response.elementDetails);
                        if(obj.id || obj.name){
                            await processElement(obj.id || obj.name, tab.id);
                        }
                    } catch (error) {
                        console.error(error);
                    }
                }
            }); */
            break;
        case "showfieldmetadata":
            browser.tabs.sendMessage(tab.id, {action: "showFieldsMetadata"});
            break;
        case "clearallfield":
            browser.tabs.sendMessage(tab.id, {action: "clearAllFields"});
            break;
        case "replacefieldvalue":
            browser.tabs.sendMessage(tab.id, {action: "replaceFieldValue"});
            break;
        case "showSimilarityAgain":
            chrome.tabs.sendMessage(tab.id, {action: "showSimilarityAgain"});
            break;
        case "openOptions":
            browser.runtime.openOptionsPage().then(() => {
                console.log("Options page opened successfully.");
            }).catch((error) => {
                console.error("Error opening options page:", error);
            });
            break;
        default:
            if(Object.keys(AIFillFormOptions).some(k => k.replace(/\W/g, '').toLowerCase() === info.menuItemId)){
                getAndProcessClickedElement(tab, info.menuItemId, false);
            } else {
                console.log("No action found for:", info.menuItemId);
            }

    }
});

async function init() {
    if(Object.keys(AIFillFormOptions).length === 0){
        AIFillFormOptions = await getOptions();
    }
    if(Object.keys(AIHelperSettings).length === 0){
        AIHelperSettings = await getLLMStudioOptions();
    }
    if(Object.keys(staticEmbeddings).length > 0){
        initCompleted = true;
        return;
    }

    const formFields = Object.keys(AIFillFormOptions);
    for (const field of formFields) {
        const vectors = await fetchData({ "input": field.toLowerCase() });
        if (vectors && vectors.length > 0) {
            staticEmbeddings[field] = vectors;
        }
    }

    initCompleted = true;
}

async function processForm(obj, tabId){
    if(Object.keys(staticEmbeddings).length === 0){
        await init();
    }

    for (let i = 0, l = obj.length; i < l; i++) {
        const data = await getSimilarityForElemnt(obj[i]);
        if(data){
            obj[i]['data'] = JSON.stringify(data);
        }
    }
    browser.tabs.sendMessage(tabId, { action: "sentFormValues", value: obj });
}

async function getSimilarityForMultiWordLabel(label){
    const parts = label.toLowerCase().split(/\s/);
    const bestMatches = [];
    for (let x = 0, z = parts.length; x < z; x++) {
        const value = parts[x];
        dynamicEmbeddings[value] = await fetchData({ "input": value });
        bestMatches.push(getBestMatch(value));
    }
    bestMatches.sort((a, b) => b.similarity - a.similarity);
    return bestMatches[0];
}

async function getSimilarityForElemnt(el){
    const mainObjKey = Object.keys(el)[0];
    if(!mainObjKey){  return;  }

    const labelResult = await getSimilarityForElementLabel(el[mainObjKey]?.label);
    if(labelResult){
        return labelResult;
    }

    const directMatchResult = checkForDirectMatch(el[mainObjKey]);
    if(directMatchResult){  return directMatchResult;  }

    return await getAttributeBestMatch(el[mainObjKey]);
}

async function getAttributeBestMatch(elAttributes) {
    const keysToIterate = getKeysToIterate(Object.keys(elAttributes));
    const bestMatches = []; // no direct match - calc the best match by attributes
    for (let x = 0, z = keysToIterate.length; x < z; x++) {
        let attributeName = keysToIterate[x];
        let attributeValue = elAttributes[attributeName];
        dynamicEmbeddings[attributeValue] = await fetchData({ "input": attributeValue.toLowerCase() });
        bestMatches.push(getBestMatch(attributeValue));
    }
    bestMatches.sort((a, b) => b.similarity - a.similarity);
    return bestMatches[0];
}

function checkForDirectMatch(elData){
    if(!elData){
        return false;
    }

    const objectKeys = Object.keys(elData);
    if(objectKeys.length < 1){  return false;  }

    const keysToIterate = getKeysToIterate(objectKeys);
    for (let x = 0, z = keysToIterate.length; x < z; x++) {
        let key = keysToIterate[x];
        let value = elData[key];
        if(staticEmbeddings[value]){ // direct match found
            return {"closest": value, "similarity": 1, "threshold": AIHelperSettings.threshold};
        }
    }

    return false;
}

function getKeysToIterate(objectKeys) {
    const keys2exclude = ['class', 'type', 'outerHtml', 'value', 'label'];
    return objectKeys.filter(key => !keys2exclude.includes(key));
}

async function getSimilarityForElementLabel(label) {
    if(!label){  return false;  }
    label = label.replace(/[^a-zA-Z0-9\- ]/g, '').trim();
    bestKey = await getBestKeyFor(label);
    if(bestKey.similarity >= AIHelperSettings.threshold){
        return bestKey;
    }

    if (label.indexOf(' ') > -1) {
        bestKey = await getSimilarityForMultiWordLabel(label);
        if(bestKey.similarity < AIHelperSettings.threshold) {
            return false;
        }

        bestKey.closest =  AIFillFormOptions[bestKey.closest] || '';
    }

    return bestKey;
}

async function getBestKeyFor(prop){
    let bestKey = 'unknown';
    if(staticEmbeddings[prop]){
        bestKey = {"closest": AIFillFormOptions[prop], "similarity": 1, "threshold": AIHelperSettings.threshold};
    } else {
        dynamicEmbeddings[prop] = await fetchData({ "input": prop.toLowerCase() });
        const key = getBestMatch(prop);
        bestKey = {"closest": AIFillFormOptions[key.closest], "similarity": key.similarity, "threshold": AIHelperSettings.threshold};
    }

    return bestKey;
}

function getAndProcessClickedElement(tab, menuId, shouldProcessElement = false){
    if(!tab){
        console.error(`Invalid tab id (${tab?.id || '???'})`);
        return;
    }

    browser.tabs.sendMessage(tab.id, {action: "getClickedElement"}, async function(response) {
        if (response && response.elementDetails) {
            let obj;
            try {
                obj = JSON.parse(response.elementDetails);
                if(Array.isArray(obj) && obj.length > 0){
                    if (shouldProcessElement) {
                        await processForm(obj, tab.id);
                    } else {
                        for (const [key, value] of Object.entries(AIFillFormOptions)) {
                            if(menuId === key.replace(/\W/g, '').toLowerCase()){
                                obj[0]['data'] = JSON.stringify({"closest": value, "similarity": 1, "threshold": AIHelperSettings.threshold});
                                break;
                            }
                        }
                        browser.tabs.sendMessage(tab.id, { action: "sendProposalValue", value: obj });
                    }
                } else if(obj.constructor === Object){
                    let data = await getSimilarityForElemnt(obj);
                    obj['data'] = JSON.stringify(data);
                    browser.tabs.sendMessage(tab.id, { action: "sendProposalValue", value: obj });
                } else {
                    console.error(`Unexpected type: ${typeof(obj)}`, obj);
                }
            } catch (error) {
                console.error(error);
            }
        }
    });
}

async function processElement(elId, tabId){
    if(Object.keys(staticEmbeddings).length === 0){
        await init();
    }

    let bestKey = 'unknown';
    if(staticEmbeddings[elId]){
        bestKey = elId;
    } else {
        dynamicEmbeddings[elId] = await fetchData({ "input": elId.toLowerCase() });
        key = getBestMatch(elId);
        bestKey = {"closest": AIFillFormOptions[key.closest], "similarity": key.similarity, "threshold": AIHelperSettings.threshold};
    }
    browser.tabs.sendMessage(tabId, { action: "sendProposalValue", value: AIFillFormOptions[bestKey] || 'unknown' });
}

function getOptions() {
    return new Promise((resolve, reject) => {
        const defaults ={
            "fullName": "",
            "firstName": "",
            "lastName": "",
            "email": "",
            "tel": "",
            "address1": "",
            "town": "",
            "country": ""
        };

        browser.storage.sync.get([formFieldsStorageKey]).then((obj) => {
            const options = Object.assign({}, defaults, obj[formFieldsStorageKey]);
            resolve(options);
        }).catch((error) => {
            reject(error);
        });
    });

}

function getLLMStudioOptions() {
    return new Promise((resolve, reject) => {
        const defaults = {
            "threshold": 0.5,
            "port": 1234,
        };
        browser.storage.sync.get([AIsettingsStarageKey])
        .then((obj) => {
            const options = Object.assign({}, defaults, obj.laiOptions);
            resolve(options);
        }).catch((error) => {
            reject(error);
        });
    });
}

async function fetchData(body = {}) {
    if (!body || Object.keys(body).length < 1) {
        return [];
    }

    const url = `http://localhost:${AIHelperSettings.port.toString() || "1234"}/v1/embeddings`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const responseText = await response.text();
            throw new Error(`Non-ok response received: ${response.status} - ${responseText}`);
        }

        const data = await response.json();
        return data.data[0]?.embedding ?? [];
    } catch (err) {
        let errorMessage = '';
        console.log("Body sent", body);
        // Handle network errors or other issues with the fetch request
        if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
            errorMessage = "Network error: Unable to connect to the server. Please check your connection.";
            console.error(errorMessage);
        } else {
            errorMessage = `Error in fetch or processing: ${err.message}`
            console.error("Error in fetch or processing:", err);
        }
        sendErrorMessage(tabId, errorMessage);
        return [];
    }
}

function sendErrorMessage(tabId, message){
    browser.tabs.sendMessage(tabId, { action: "communicationError", value: message || 'Error!' })
    .then(()=>{})
    .catch(e => console.log(e));
}

function getBestMatch(value){
    if(!value){
        console.error(`invalid value: [${value}]`);
        return '';
    }

    let similarities = {};
    for (let key in staticEmbeddings) {
        if (key !== value) {
            similarities[key] = cosineSimilarity(dynamicEmbeddings[value], staticEmbeddings[key]);
        }
    }

    if (Object.keys(similarities).length === 0) {
        return '';
    }

    let closest = Object.keys(similarities).reduce((a, b) => similarities[a] > similarities[b] ? a : b);
    let result = similarities[closest] >= AIHelperSettings.threshold ? closest : '';

    return {"closest": result, "similarity": similarities[closest], "threshold": AIHelperSettings.threshold};
}

function cosineSimilarity(vecA, vecB) {
    if (!Array.isArray(vecA) || !Array.isArray(vecB)) {
        console.error("Invalid input vectors", vecA, vecB);
        return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

createContextMenu();

async function addDataAsMenu(){
    if(!initCompleted){
        await init();
    }

    if(Object.keys(AIFillFormOptions).length === 0){
        return;
    }

    chrome.contextMenus.create({
        id: "dataseparator",
        type: "separator",
        contexts: ["editable"]
    });

    chrome.contextMenus.create({
        id: "dataset",
        title: "Insert data manually",
        contexts: ["editable"]
    });

    var createdMenus = [];
    for (const [key, value] of Object.entries(AIFillFormOptions)) {
        const menuId = key.replace(/\W/g, '').toLowerCase();
        if(createdMenus.includes(menuId)) {  continue;  }
        chrome.contextMenus.create({
            id: menuId,
            parentId: "dataset",
            title: `☛ Insert ${key} ( ${value} )`,
            contexts: ["editable"]
        });
        createdMenus.push(menuId);
    }
}