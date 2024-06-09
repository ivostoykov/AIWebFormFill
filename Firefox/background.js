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

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if(!isContextMenuCreated){
        await createContextMenu(tab);
    }
});

chrome.tabs.onCreated.addListener(async (tab) => {  isContextMenuCreated = false;  });

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if(Object.keys(AIHelperSettings).length < 1){ await init();  }

    switch (message.action) {

        case 'hideSimilatityHints':
            await removeSimilatityHints(sender.tab);
            break;

        case "fieldsCollected":
            await processCollectedFields(message.fields, sender);
            break;

        case "fillAutoProposal":
            await setProposalValue(message.element, sender.tab);
            break;

        case "toggleAutoProposals":
            AIHelperSettings.calcOnLoad = message?.autoProposalStatusChanged;
            await execAutoSimilarityProposals(message, sender);
            break;

        case "storeRightClickedElement":
            lastRightClickedElement = message.element;
            await chrome.storage.session.set({[sessionStorageKey]: lastRightClickedElement})
            break;

        case "fillthisform":
            await executeFormFillRequest(message, sender.tab, 'fieldsCollected');
            break;

        default:
            break;
    }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if(tab.url && !(tab.url.startsWith('http') || tab.url.startsWith('file'))) { return;  }
    switch (info.menuItemId) {

        case "autoProposal":
            await toggleAutoProposal(info, tab);
            break;

        case "fillthisform":
            await executeFormFillRequest(info, tab, 'fieldsCollected');
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
            chrome.tabs.sendMessage(tab.id, {action: "replaceFieldValue"});
            break; */

        case "showSimilarityAgain":
            await showSimilarityAgain(info, tab);
            break;

        case "openOptions":
            try {
                await chrome.runtime.openOptionsPage();
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

    if (isContextMenuCreated) { return; }
    isContextMenuCreated = true;
    try {
        await chrome.contextMenus.removeAll();

        chrome.contextMenus.create({
            id: "fillthisform",
            title: "📝 Fill the form",
            contexts: ["editable"],
            documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*/*"]
        });

        chrome.contextMenus.create({
            id: "fillthisfield",
            title: "▭ Fill this field",
            contexts: ["editable"],
            documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*/*"]
        });

        chrome.contextMenus.create({
            id: "clearallfields",
            title: "⌦ Clear all fields",
            contexts: ["editable"],
            documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*/*"]
        });

        // chrome.contextMenus.create({
        //     id: "replacefieldvalue",
        //     title: "(→) Replace field value",
        //     contexts: ["editable"],
        //     documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*/*"]
        // });

        chrome.contextMenus.create({
            id: "showfieldmetadata",
            title: "</> Show form fields metadata",
            contexts: ["editable"],
            documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*/*"]
        });

        chrome.contextMenus.create({
            id: "showSimilarityAgain",
            title: "⅏ Show similarities again",
            contexts: ["editable"],
            documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*/*"]
        });

        await addDataAsMenu(tab);

        chrome.contextMenus.create({
            id: "separator1",
            type: "separator",
            contexts: ["all"],
            documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*/*"]
        });

        const mElm = AIHelperSettings?.calcOnLoad ? ['≁', 'Off'] : ['∼', 'On'];
        chrome.contextMenus.create({
            id: "autoProposal",
            title: `${mElm[0]} Turn auto proposals: ${mElm[1]}`,
            contexts: ["all"],
            documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*/*"]
        });

        chrome.contextMenus.create({
            id: "openOptions",
            title: "⚙️ Options",
            contexts: ["all"],
            documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*/*"]
        });
    } catch (e) {
        console.log('>>>', e);
        if (chrome.runtime.lastError) {
            console.warn(">>> Context menu creation failed: ", chrome.runtime.lastError.message);
            console.log(">>> Attempted creation by:", new Error().stack);
        }
    }
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
        const obj = await chrome.storage.local.get([staticEmbeddingsStorageKey]);
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
        await chrome.storage.local.set({[staticEmbeddingsStorageKey]: thisEmbeddings});
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

/**
 *
 * @param {*} el - the element the proposal will be generated for
 * @param {*} tab - the tab where the element is located - this is the activeTab
 *
 * @returns {Object} with three elements
 * @example: {"closest":"","similarity":0.3983276848547773,"threshold":"0.5"}
 */
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

/**
 * Asynchronously calculates and stores data about similarity proposal values in an array of objects.
 *
 * @param {Array<Object>|Object} obj - The object or array of objects to be processed. If it's not an array, it will be converted into one. Each object should have a single key-value pair where the value is the data that needs to be compared for similarity.
 *
 * @param {chrome.tabs.Tab} tab - The current active tab. This parameter isn't used directly within the function but might be required by some of the helper functions called in it, such as `getSimilarityForElemnt()`.
 *
 * The parameter ('obj') has for a key is the element's tagName, and the value is a dictionary containing the element's attributes as key-value pairs.
 * @typedef {Object} obj
 * @property {string} key - tagName.
 * @property {Object} value - dictionary of attributes and their values
 * @property {Object}obj[data] - dictionary of proposal text, similarivy level and predefined similarity threshold @see getSimilarityForElemnt
 *
 * @example: {
    "input": {
        "selector": "header.sticky.lazy-visible > div.main-content.headerTransitions > div.header-complete-top > div.majorlinksblock > form.search-form.search-desktop > div > div.search-input-container > input.search-input.autoc-input",
        "outerHtml": "<input type=\"text\" name=\"q\" class=\"search-input autoc-input\" placeholder=\"English Dictionary\" required=\"\" value=\"test\" autocomplete=\"off\" autocorrect=\"off\" autocapitalize=\"off\" spellcheck=\"false\" onfocus=\"this.select()\" autofocus=\"\" aria-label=\"English Dictionary\">",
        "type": "text",
        "name": "q",
        "class": "search-input autoc-input",
        "value": "test",
        "autocorrect": "off",
        "autocapitalize": "off",
        "autofocus": "",
        "aria-label": "English Dictionary"
        }
    }
 *
 * @returns {Promise<Array<Object>>} A Promise that resolves to the modified input array. Each object will have an additional 'data' property containing a stringified JSON with similarity data. If no similar element is found, it will be an empty string.
 */
async function calculateSimilarityProposalValue(obj, tab){
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

    return obj;
}

async function getAndProcessClickedElement(tab, info, shouldProcessElement = false){
    if(!tab){
        console.error(`${manifest?.name ?? ''}: Invalid tab id (${tab?.id || '???'})`);
        return;
    }

    try {
        if(!lastRightClickedElement){
            const sess = chrome.storage.session.get([sessionStorageKey]);
            lastRightClickedElement = sess[sessionStorageKey];
        if(!lastRightClickedElement){
            showUIMessage(tab, 'No element found to handle context menu!', 'error');
            return;
            }
        }
        let obj = JSON.parse(lastRightClickedElement);
        obj = await calculateSimilarityProposalValue(obj, tab);

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
        const obj = await chrome.storage.sync.get([formFieldsStorageKey]);
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
        obj = await chrome.storage.sync.get([AIsettingsStorageKey]);
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
        await chrome.tabs.sendMessage(tab.id, { action: "error", value: message || 'Error!' });
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
        if(!vecA[i] || !vecB[i]) {  break;  }
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

    chrome.contextMenus.create({
        id: "dataseparator",
        type: "separator",
        contexts: ["editable"],
        documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*/*"]
    });

    chrome.contextMenus.create({
        id: "dataset",
        title: "⇽ Insert data manually",
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

        chrome.contextMenus.create({
            id: menuId,
            parentId: "dataset",
            title: `☛ ${value}`,
            // title: `☛ ${key} ( ${value} )`,
            contexts: ["editable"],
            documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*/*"]
        });
        createdMenus.push(menuId);
    }
}

async function getCurrentTab() {
    let queryOptions = { active: true, lastFocusedWindow: true };
    // `tab` will either be a `tabs.Tab` instance or `undefined`.
    let [tab] = await chrome.tabs.query(queryOptions);

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
       const res = await chrome.scripting.executeScript({
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

async function executeFormFillRequest(info, tab, callbackAction){
    let res;
    try {
        res = await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: (callbackAction) => {
                return collectInputFields(document, callbackAction);
            },
            args: [callbackAction]
        });
    } catch (err) {
        console.error(`${manifest?.name ?? ''} >>>`, err);
        console.log(`${manifest.name ?? ''}: fields >>>`, res);
        showUIMessage(tab, err.message, 'error');
    }
}

async function processCollectedFields(fields, sender){
    if(!fields || fields.length < 1){
        return;
    }

    let res;
    try {
        res = JSON.parse(fields);
    } catch (e) {
        console.error(`${manifest.name ?? ''}: parsing fields json >>>`, e);
        return;
    }

    if(!res){  return;  }
    const tab = sender.tab;
    if(!Array.isArray(res)) {  res = [res];  }

    const filledInputs = await processForm(res, tab);

    await fillInputsWithProposedValues({ "result": filledInputs, "frameId": sender.frameId }, tab);
}

async function showSimilarityAgain(info, tab) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: () => { showCalculatedSimilarityAgain(); }
        });
    } catch (e) {
        console.error(`${manifest.name ?? ''}`, e)
    }
}

async function removeSimilatityHints(tab) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: () => { hideSimilatityHints(); }
        });
    } catch (e) {
        console.error(`${manifest.name ?? ''}`, e)
    }
}

async function clearAllFieldValues(info, tab) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: () => { clearAllFields(); }
        });
    } catch (e) {
        console.error(`${manifest.name ?? ''}`, e)
    }
}

async function showUIMessage(tab, message, type = '') {
    try {
        await chrome.scripting.executeScript({
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
        await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: () => { showFieldsMetadata(); }
        });
    } catch (e) {
        console.error(`${manifest.name ?? ''}`, e)
    }
}

async function execAutoSimilarityProposals(info, sender) {
    if(Object.keys(AIHelperSettings).length === 0){
        await init();
    }

    try {
        await chrome.scripting.executeScript({
            target: { tabId: sender.tab.id, allFrames: true },
            func: (isAuto) => { if(typeof(setAutoSimilarityProposalOn) === 'function'){setAutoSimilarityProposalOn(document, isAuto);} },
            args: [AIHelperSettings?.calcOnLoad]
        });
    } catch (e) {
        console.error(`${manifest.name ?? ''}`, e)
    }
}

async function toggleAutoProposal(info, tab){
    AIHelperSettings["calcOnLoad"] = !AIHelperSettings?.calcOnLoad;
    const mElm = AIHelperSettings?.calcOnLoad ? ['≁', 'Off'] : ['∼', 'On'];
    const newTitle = `${mElm[0]} Turn auto proposals: ${mElm[1]}`;
    chrome.contextMenus.update("autoProposal", { title: newTitle });
    chrome.tabs.sendMessage(tab.id, {action: 'autoProposalStatusChanged', autoProposalStatus: AIHelperSettings?.calcOnLoad});
}

async function setProposalValue(el, tab){
    if(typeof(el) === 'string'){
        try {
            el = JSON.parse(el);
        } catch (e) {
            console.error(`${manifest.name ?? ''}`, e);
            return;
        }
    }

    const prop = await calculateSimilarityProposalValue(el, tab);
    if(!prop) {  return;  }
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: (elWithProposal) => { if(typeof(showProposal) === 'function'){ showProposal(elWithProposal);} },
            args: [prop]
        });
    } catch (e) {
        console.error(`${manifest.name ?? ''}`, e)
    }
}