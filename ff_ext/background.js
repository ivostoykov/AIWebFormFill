const manifest = chrome.runtime.getManifest();
const formFieldsStorageKey = "AIFillForm";
const AIsettingsStorageKey = "settings";
const staticEmbeddingsStorageKey = "staticEmbeddings";
const sessionStorageKey = "aiSession";

var AIFillFormOptions = {};
var AIHelperSettings = {};
var initCompleted = false;
var isContextMenuCreated = false;
var lastRightClickedElement;
/* const embeddings = {
    "emailAddress": [...],  // ~ 400-dim embedding for emailAddress
    "email": [...],         // ~ 400-dim embedding for email
    ...
}; */
var staticEmbeddings = {};
var dynamicEmbeddings = {};

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if(!isContextMenuCreated){
        await createContextMenu(tab);
    }
});

browser.tabs.onCreated.addListener(async (tab) => {  isContextMenuCreated = false;  });

browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    switch (message.action) {
        case 'hideSimilatityHints':
            await removeSimilatityHints(sender.tab);
            break;
        case "storeRightClickedElement":
            lastRightClickedElement = message.element;
            await browser.storage.session.set({[sessionStorageKey]: lastRightClickedElement})
            break;
        default:
            break;
    }
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if(tab.url && !(tab.url.startsWith('http') || tab.url.startsWith('file'))) { return;  }
    switch (info.menuItemId) {

        case "fillthisform":
            await executeFormFillRequest(info, tab)
            break;

        case "fillthisfield":
            await getAndProcessClickedElement(tab, info, true);
            break;

        case "showfieldmetadata":
            await showFieldAttributesMetadata(info, tab)
            break;

        case "clearallfields":
            await clearAllFieldValues(info, tab)
            break;

/*         case "replacefieldvalue":
            browser.tabs.sendMessage(tab.id, {action: "replaceFieldValue"});
            break; */

        case "showSimilarityAgain":
            await showSimilarityAgain(info, tab);
            break;

        case "openOptions":
            try {
                await browser.runtime.openOptionsPage();
            } catch (err) {
                console.log(`${manifest.name ?? ''}: >>>`, err);
            }
            break;

        default:
            if(info.menuItemId){
                await getAndProcessClickedElement(tab, info, false);
            }
    }
});

async function createContextMenu(tab) {

    if(isContextMenuCreated) {  return; }
    isContextMenuCreated = true;
    await browser.contextMenus.removeAll();

    browser.contextMenus.create({
        id: "fillthisform",
        title: "📝 Fill the form",
        contexts: ["editable"],
        documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*/*"]
    });

    browser.contextMenus.create({
        id: "fillthisfield",
        title: "▭ Fill this field",
        contexts: ["editable"],
        documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*/*"]
    });

    browser.contextMenus.create({
        id: "clearallfields",
        title: "⌦ Clear all fields",
        contexts: ["editable"],
        documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*/*"]
    });

    // browser.contextMenus.create({
    //     id: "replacefieldvalue",
    //     title: "(→) Replace field value",
    //     contexts: ["editable"],
    //     documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*/*"]
    // });

    browser.contextMenus.create({
        id: "showfieldmetadata",
        title: "</> Show form fields metadata",
        contexts: ["editable"],
        documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*/*"]
    });

    browser.contextMenus.create({
        id: "showSimilarityAgain",
        title: "⅏ Show similarities again",
        contexts: ["editable"],
        documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*/*"]
    });

    await addDataAsMenu(tab);

    browser.contextMenus.create({
        id: "separator1",
        type: "separator",
        contexts: ["all"],
        documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*/*"]
    });

    browser.contextMenus.create({
            id: "openOptions",
            title: "⚙️ Options",
            contexts: ["all"],
        documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*/*"]
    });
}

async function init(tab) {
    if(Object.keys(AIFillFormOptions).length === 0){
        AIFillFormOptions = await getOptions();
    }
    if(Object.keys(AIHelperSettings).length === 0){
        AIHelperSettings = await getLLMStudioOptions();
    }

    staticEmbeddings = await getStaticEmbeddings(tab);

        initCompleted = true;
}

async function getStaticEmbeddings(tab){
    if(Object.values(staticEmbeddings).length > 0){
        return staticEmbeddings;
    }

    try {
        const obj = await browser.storage.local.get([staticEmbeddingsStorageKey]);
        if(obj[staticEmbeddingsStorageKey] && Object.values(obj[staticEmbeddingsStorageKey]).length > 0){
            return obj[staticEmbeddingsStorageKey];
        }
    } catch (err) {
        console.error(`${manifest?.name ?? ''} >>>`, err);
        return {};
    }

    const thisEmbeddings = {};
    try {
    const formFields = Object.keys(AIFillFormOptions);
    for (const field of formFields) {
            const vectors = await fetchData(tab, { "input": field.toLowerCase() });
        if (vectors && vectors.length > 0) {
                thisEmbeddings[field] = vectors;
        }
    }
    } catch (err) {
        console.error(`${manifest?.name ?? ''} >>>`, err);
        return {};
    }

    try {
        await browser.storage.local.set({[staticEmbeddingsStorageKey]: thisEmbeddings});
    } catch (error) {
        console.error(`${manifest?.name ?? ''} >>>`, err);
        return {};
    }

    return thisEmbeddings;
}

async function processForm(obj, tab){
    if(!obj){  return false;  }
    if(Object.keys(staticEmbeddings).length === 0){
        await init(tab);
    }

    for (let i = 0, l = obj.length; i < l; i++) {
        const data = await getSimilarityForElemnt(obj[i], tab);
        if(data){
            obj[i]['data'] = JSON.stringify(data);
        }
    }
    return obj;
}

async function getSimilarityForMultiWordLabel(label, tab){
    const parts = label.toLowerCase().split(/\s/);
    const bestMatches = [];
    for (let x = 0, z = parts.length; x < z; x++) {
        const value = parts[x];
        dynamicEmbeddings[value] = await fetchData(tab, { "input": value });
        bestMatches.push(getBestMatch(value));
    }
    bestMatches.sort((a, b) => b.similarity - a.similarity);
    return bestMatches[0];
}

async function getSimilarityForElemnt(el, tab){
    if(!el){  return;  }
    const mainObjKey = Object.keys(el)[0];
    if(!mainObjKey){  return;  }

    const labelResult = await getSimilarityForElementLabel(el[mainObjKey]?.label, tab);
    if(labelResult){
        return labelResult;
    }

    const directMatchResult = checkForDirectMatch(el[mainObjKey]);
    if(directMatchResult){
        return directMatchResult;
    }

    const theMatch = await getAttributeBestMatch(el[mainObjKey], tab);
    theMatch.closest = AIFillFormOptions[theMatch.closest] || '';
    return theMatch;
}

async function getAttributeBestMatch(elAttributes, tab) {
    const bestMatches = []; // no direct match - calc the best match by attributes
    if(!elAttributes) {  return bestMatches;  }

    const keysToIterate = getKeysToIterate(Object.keys(elAttributes));
    for (let x = 0, z = keysToIterate.length; x < z; x++) {
        let attributeName = keysToIterate[x];
        let attributeValue = elAttributes[attributeName];
        if(!dynamicEmbeddings[attributeValue] || dynamicEmbeddings[attributeValue]?.length < 1){
            dynamicEmbeddings[attributeValue] = await fetchData(tab, { "input": attributeValue.toLowerCase() });
        }

        bestMatches.push(getBestMatch(attributeValue));
    }

    if(bestMatches.length === 1){
        return bestMatches[0];
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
            return {"closest": AIFillFormOptions[value], "similarity": 1, "threshold": AIHelperSettings.threshold};
        }
    }

    return false;
}

function getKeysToIterate(objectKeys) {
    const keys2exclude = ['class', 'type', 'outerHtml', 'value', 'label', 'selector'];
    return objectKeys.filter(key => !keys2exclude.includes(key));
}

async function getSimilarityForElementLabel(label, tab) {
    if(!label){  return false;  }
    label = label.replace(/[^a-zA-Z0-9\- ]/g, '').trim();
    bestKey = await getBestKeyFor(label, tab);
    if(bestKey.similarity >= AIHelperSettings.threshold){
        return bestKey;
    }

    if (label.indexOf(' ') > -1) {
        bestKey = await getSimilarityForMultiWordLabel(label, tab);
        if(bestKey.similarity < AIHelperSettings.threshold) {
            return false;
        }

        bestKey.closest =  AIFillFormOptions[bestKey.closest] || '';
    }

    return bestKey;
}

async function getBestKeyFor(prop, tab){
    let bestKey = 'unknown';
    if(staticEmbeddings[prop]){
        bestKey = {"closest": AIFillFormOptions[prop], "similarity": 1, "threshold": AIHelperSettings.threshold};
    } else {
        dynamicEmbeddings[prop] = await fetchData(tab, { "input": prop.toLowerCase() });
        const key = getBestMatch(prop);
        bestKey = {"closest": AIFillFormOptions[key.closest], "similarity": key.similarity, "threshold": AIHelperSettings.threshold};
    }

    return bestKey;
}

async function getAndProcessClickedElement(tab, info, shouldProcessElement = false){
    if(!tab){
        console.error(`${manifest?.name ?? ''}: Invalid tab id (${tab?.id || '???'})`);
        return;
    }

    try {
        if(!lastRightClickedElement){
            const sess = browser.storage.session.get([sessionStorageKey]);
            lastRightClickedElement = sess[sessionStorageKey];
            if(!lastRightClickedElement){
                showUIMessage(tab, 'No element found to handle context menu!', 'error');
                return;
            }
        }
        let obj = JSON.parse(lastRightClickedElement);
        if(!Array.isArray(obj)){  obj = [obj];  }
        for (let i = 0; i < obj.length; i++) {
            const elTagName = Object.keys(obj[i])?.[0] || '';
            let data = checkForDirectMatch(obj[i][elTagName]);
            if(data){
                obj[i]['data'] = JSON.stringify(data);
                continue;
            }

            data = await getSimilarityForElemnt(obj[i], tab);
            obj[i]['data'] = JSON.stringify(data);
        }

        await fillInputsWithProposedValues({frameId: info.frameId, result: obj}, tab);
    } catch (e) {
        await showUIMessage(tab, e.message, 'error');
        console.warn(`>>> ${manifest?.name ?? ''}`, e);
    }
}

async function getOptions() {
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

      let options;
    try {
        const obj = await browser.storage.sync.get([formFieldsStorageKey]);
        options = Object.assign({}, defaults, obj[formFieldsStorageKey]);
    } catch (err) {
        options = defaults;
        consnole.error('>>>', err);
    }

    return options;
}

async function getLLMStudioOptions() {
        const defaults = {
        "port": 1234,
        "threshold": 0.5,
        "calcOnLoad": false
    };
    let lmsOptions;
    try {
        obj = await browser.storage.sync.get([AIsettingsStorageKey]);
        lmsOptions = (Object.assign({}, defaults, obj[AIsettingsStorageKey]));
    } catch (err) {
        lmsOptions = defaults;
        consnole.error('>>>', err);
    }
    return lmsOptions;
}

async function fetchData(tab = null, body = {}) {
    if (Object.keys(body).length < 1) {
        return [];
    }

    if(!AIHelperSettings || !AIHelperSettings.port){
        await init();
    }

    const url = `http://localhost:${AIHelperSettings?.port?.toString() || "1234"}/v1/embeddings`;
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
        console.log(`${manifest.name ?? ''}: Body sent`, body);
        if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
            errorMessage = "Network error: Unable to connect to the server. Please check your connection.";
            if(tab?.id){
                showUIMessage(tab, errorMessage, 'error');
            }
        } else {
            errorMessage = `Error in fetch or processing: ${err.message}`
            if(tab?.id){
                showUIMessage(tab, errorMessage, 'error');
            }
        }
        if(tab?.id){
            showUIMessage(tab, errorMessage, 'error');
        }
        return [];
    }
}

async function sendErrorMessage(tab, message){
    if(!tab?.id){
        const tab = await getCurrentTab();
    }

    if(!tab.id){  return;  }

    try {
        await browser.tabs.sendMessage(tab.id, { action: "error", value: message || 'Error!' });
    } catch (e) {
        console.error(`${manifest?.name ?? ''} >>>`, e);
    }
}

function getBestMatch(value){
    if(!value){ return {"closest": '', "similarity": 0, "threshold": AIHelperSettings.threshold};  }

    let similarities = {};
    for (let key in staticEmbeddings) {
        if (key !== value) {
            similarities[key] = cosineSimilarity(dynamicEmbeddings[value], staticEmbeddings[key]);
        }
    }

    if (Object.keys(similarities).length === 0) {
        return {"closest": '', "similarity": 0, "threshold": AIHelperSettings.threshold};;
    }

    let closest = Object.keys(similarities).reduce((a, b) => similarities[a] > similarities[b] ? a : b);
    let result = similarities[closest] >= AIHelperSettings.threshold ? closest : '';

    return {"closest": result, "similarity": similarities[closest], "threshold": AIHelperSettings.threshold};
}

function cosineSimilarity(vecA, vecB) {
    if (!Array.isArray(vecA) || !Array.isArray(vecB)) {
        console.error(`${manifest.name ?? ''}: Invalid input vectors`, vecA, vecB);
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

async function addDataAsMenu(tab){
    if(!Object.entries(AIFillFormOptions).some(([key, value]) => value)){
        await init(tab);
        if(Object.keys(AIFillFormOptions).length < 1){  return;  }
    }

    browser.contextMenus.create({
        id: "dataseparator",
        type: "separator",
        contexts: ["editable"],
        documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*/*"]
    });

    browser.contextMenus.create({
        id: "dataset",
        title: "Insert data manually",
        contexts: ["editable"],
        documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*/*"]
    });

    var createdMenus = [];

    let keySorted = Object.keys(AIFillFormOptions);
    keySorted.sort((a, b) => {
        a = a.toLowerCase();
        b = b.toLowerCase();
        if (a < b) return -1;
        else if (a > b) return 1;
        else return 0;
    });

    for (const key of keySorted) {
        const value = AIFillFormOptions[key];
        if(!value) {  continue;  }

        const menuId = key.replace(/\W/g, '').toLowerCase();
        if(createdMenus.includes(menuId)) {  continue;  }

        browser.contextMenus.create({
            id: menuId,
            parentId: "dataset",
            title: `☛ ${key} ( ${value} )`,
            contexts: ["editable"],
            documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*/*"]
        });
        createdMenus.push(menuId);
    }
}

async function getCurrentTab() {
    let queryOptions = { active: true, lastFocusedWindow: true };
    // `tab` will either be a `tabs.Tab` instance or `undefined`.
    let [tab] = await browser.tabs.query(queryOptions);

    return tab;
}

async function fillInputsWithProposedValues(data, tab){
    if(!data){
        showUIMessage(tab, 'No data provided for the action!', 'warning');
        return;
    }

    if(!data?.result || data.result.length < 1){
        return;
    }

    try {
       const res = await browser.scripting.executeScript({
            target: { tabId: tab.id, frameIds: [data.frameId] },
            func: (data) => fillFormWithProposedValues(data?.result), // fillFieldsWithProposalValues(data),
            args: [data]
        });
    } catch (err) {
        console.error(`${manifest?.name ?? ''} >>>`, err);
        console.log(`${manifest.name ?? ''}: data >>>`, data);
        showUIMessage(tab, err.message, 'error');
    }
}

async function executeFormFillRequest(info, tab){
    let res;
    try {
        res = await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: () => {
                return collectInputFields(document);
            }
        });

    if(!Array.isArray(res)) {  res = [res];  }

    for (let i = 0; i < res.length; i++) {
        if(!res[i]?.result || res[i].result.length < 1){  continue;  }
        const filledInputs = await processForm(res[i].result, tab);
        res[i].result = filledInputs;
        res[i].frmeId = info.frameId;

        await fillInputsWithProposedValues(res[i], tab);
        }
    } catch (err) {
        console.error(`${manifest?.name ?? ''} >>>`, err);
        console.log(`${manifest.name ?? ''}: fields >>>`, res);
        showUIMessage(tab, err.message, 'error');
    }
}

async function showSimilarityAgain(info, tab) {
    try {
        await browser.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: () => { showCalculatedSimilarityAgain(); }
        });
    } catch (e) {
        console.error(`${manifest.name ?? ''}`, e)
    }
}

async function removeSimilatityHints(tab) {
    try {
        await browser.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: () => { hideSimilatityHints(); }
        });
    } catch (e) {
        console.error(`${manifest.name ?? ''}`, e)
    }
}

async function clearAllFieldValues(info, tab) {
    try {
        await browser.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: () => { clearAllFields(); }
        });
    } catch (e) {
        console.error(`${manifest.name ?? ''}`, e)
    }
}

async function showUIMessage(tab, message, type = '') {
    try {
        await browser.scripting.executeScript({
            target: { tabId: tab.id, frameIds: [0] },
            func: (message, type) => { showMessage(message, type); },
            args: [message, type]
        });
    } catch (e) {
        console.error(`${manifest.name ?? ''}`, e)
    }
}

async function showFieldAttributesMetadata(info, tab) {
    try {
        await browser.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: () => { showFieldsMetadata(); }
        });
    } catch (e) {
        console.error(`${manifest.name ?? ''}`, e)
    }
}