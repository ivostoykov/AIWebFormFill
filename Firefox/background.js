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

var apiUrl = '';
var activeModel = '';

chrome.runtime.onInstalled.addListener((details) => {
    switch (details.reason) {
        case chrome.runtime.OnInstalledReason.INSTALL:
        case chrome.runtime.OnInstalledReason.UPDATE:
            chrome.runtime.openOptionsPage();
            break;
    }
});

chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== 'sync') { return; }
    for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
        if (key === "AIFillForm") {
            AIFillFormOptions = {};
            AIFillFormOptions = await getOptions();
            staticEmbeddings = {}; // need to clean it, otherwise will return the existing object
            isContextMenuCreated = false;
        } else {
            AIHelperSettings = await getAIHelperSettings();
        }
    }
});

chrome.tabs.onActivated.addListener(async (tab) => {
    const theTab = await chrome.tabs.get(tab.tabId);
    if (!theTab || theTab?.url.indexOf('http') !== 0) { return; }
    if (!isContextMenuCreated) {
        await createContextMenu(tab);
    }
    staticEmbeddings = await getStaticEmbeddings(tab);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (!isContextMenuCreated) {
        await createContextMenu(tab);
    }
});

chrome.tabs.onCreated.addListener(async (tab) => { isContextMenuCreated = false; });

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (Object.keys(AIHelperSettings).length < 1) { await init(); }

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
            await chrome.storage.session.set({ [sessionStorageKey]: lastRightClickedElement })
            break;

        case "fillthisform":
            await executeFormFillRequest(message, sender.tab, 'fieldsCollected');
            break;

        default:
            break;
    }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (tab.url && !(tab.url.startsWith('http') || tab.url.startsWith('file'))) { return; }
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
            if (info.menuItemId && /^api_/i.test(info.menuItemId)) {
                await tempChamgeApiProvider(tab, info);
            } else {
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

        await addModelsMenu(tab);

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
    if (Object.keys(AIFillFormOptions).length === 0) {
        AIFillFormOptions = await getOptions();
    }
    if (Object.keys(AIHelperSettings).length === 0) {
        AIHelperSettings = await getAIHelperSettings();
    }

    setActiveUrl();
    const provider = AIHelperSettings.embeddings.filter(o => o.value === apiUrl)[0]?.text;
    if(provider?.toLowerCase().indexOf('ollama') > -1 && !activeModel){
        if( AIHelperSettings.model) {
            activeModel = AIHelperSettings.model;
        }
    }

    staticEmbeddings = await getStaticEmbeddings(tab);

    initCompleted = true;
}

async function getStaticEmbeddings(tab) {
    if (Object.values(staticEmbeddings).length > 0) {
        return staticEmbeddings;
    }

    try {
        const obj = await chrome.storage.local.get([staticEmbeddingsStorageKey]);
        if (obj[staticEmbeddingsStorageKey] && Object.values(obj[staticEmbeddingsStorageKey]).length > 0) {
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
            const vectors = await fetchData(tab, generatePrompt(field?.toLowerCase()));
            if (vectors && vectors.length > 0) {
                thisEmbeddings[field] = vectors;
            }
        }
    } catch (err) {
        console.error(`${manifest?.name ?? ''} >>>`, err);
        return {};
    }

    try {
        await chrome.storage.local.set({ [staticEmbeddingsStorageKey]: thisEmbeddings });
    } catch (error) {
        console.error(`${manifest?.name ?? ''} >>>`, err);
        return {};
    }

    return thisEmbeddings;
}

async function processForm(obj, tab) {
    if (!obj) { return false; }
    if (Object.keys(staticEmbeddings).length === 0) {
        // await init(tab);
        staticEmbeddings = await getStaticEmbeddings(tab);
    }

    for (let i = 0, l = obj.length; i < l; i++) {
        const data = await getSimilarityForElemnt(obj[i], tab);
        if (data) {
            obj[i]['data'] = JSON.stringify(data);
        }
    }
    return obj;
}

async function getSimilarityForMultiWordLabel(label, tab) {
    const parts = label?.toLowerCase().split(/\s/);
    const bestMatches = [];
    for (let x = 0, z = parts.length; x < z; x++) {
        const value = parts[x]?.trim();
        if(!value){  continue;  }
        dynamicEmbeddings[value] = await fetchData(tab, generatePrompt(value));
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
async function getSimilarityForElemnt(el, tab) {
    if (!el) { return; }
    const mainObjKey = Object.keys(el)[0];
    if (!mainObjKey) { return; }

    const labelResult = await getSimilarityForElementLabel(el[mainObjKey]?.label, tab);
    if (labelResult) {
        return labelResult;
    }

    const directMatchResult = checkForDirectMatch(el[mainObjKey]);
    if (directMatchResult) {
        return directMatchResult;
    }

    const theMatch = await getAttributeBestMatch(el[mainObjKey], tab);
    theMatch.closest = AIFillFormOptions[theMatch.closest] || '';
    return theMatch;
}

async function getAttributeBestMatch(elAttributes, tab) {
    const bestMatches = []; // no direct match - calc the best match by attributes
    if (!elAttributes) { return bestMatches; }

    const keysToIterate = getKeysToIterate(Object.keys(elAttributes));
    for (let x = 0, z = keysToIterate.length; x < z; x++) {
        let attributeName = keysToIterate[x];
        // let attributeValue = elAttributes[attributeName];
        let attrValues = elAttributes[attributeName].split(/[^a-zA-Z0-9]+/);
        for (let index = 0; index < attrValues.length; index++) {
            const attributeValue = attrValues[index]?.trim();
            if(!attributeValue){  continue;  }

            if (!dynamicEmbeddings[attributeValue] || dynamicEmbeddings[attributeValue]?.length < 1) {
                dynamicEmbeddings[attributeValue] = await fetchData(tab, generatePrompt(attributeValue?.toLowerCase()));
            }

            bestMatches.push(getBestMatch(attributeValue));
        }
    }

    if (bestMatches.length === 1) {
        return bestMatches[0];
    }

    bestMatches.sort((a, b) => b.similarity - a.similarity);
    return bestMatches[0];
}

function checkForDirectMatch(elData) {
    if (!elData) {
        return false;
    }

    const objectKeys = Object.keys(elData);
    if (objectKeys.length < 1) { return false; }

    const keysToIterate = getKeysToIterate(objectKeys);
    for (let x = 0, z = keysToIterate.length; x < z; x++) {
        let key = keysToIterate[x];
        let value = elData[key];
        if (staticEmbeddings[value]) { // direct match found
            return { "closest": AIFillFormOptions[value], "similarity": 1, "threshold": AIHelperSettings.threshold };
        }
    }

    return false;
}

function getKeysToIterate(objectKeys) {
    const keys2exclude = ['class', 'type', 'outerHtml', 'value', 'label', 'selector'];
    return objectKeys.filter(key => !keys2exclude.includes(key));
}

async function getSimilarityForElementLabel(label, tab) {
    if (!label) { return false; }
    label = label.replace(/[^a-zA-Z0-9\- ]/g, '').trim();
    let bestKey = await getBestKeyFor(label, tab);
    if (bestKey.similarity >= AIHelperSettings.threshold) {
        return bestKey;
    }

    bestKey = await getBestKeyFor(label.replace(/-|\s+/g, '').trim(), tab); // let's try concatenated
    if (bestKey.similarity >= AIHelperSettings.threshold) {
        return bestKey;
    }

    if (label.indexOf(' ') > -1) {
        bestKey = await getSimilarityForMultiWordLabel(label, tab);
        if (bestKey.similarity < AIHelperSettings.threshold) {
            return false;
        }

        bestKey.closest = AIFillFormOptions[bestKey.closest] || '';
    }

    return bestKey;
}

async function getBestKeyFor(prop, tab) {
    let bestKey = 'unknown';
    const keyFound = Object.keys(staticEmbeddings).find(key => key?.toLowerCase().trim() === prop?.toLowerCase().trim());
    if(keyFound){
        bestKey = { "closest": AIFillFormOptions[keyFound], "similarity": 1, "threshold": AIHelperSettings.threshold };
    } else {
        dynamicEmbeddings[prop] = await fetchData(tab, generatePrompt(prop?.toLowerCase()));
        const key = getBestMatch(prop);
        bestKey = { "closest": AIFillFormOptions[key.closest], "similarity": key.similarity, "threshold": AIHelperSettings.threshold };
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
async function calculateSimilarityProposalValue(obj, tab) {
    if (!Array.isArray(obj)) { obj = [obj]; }
    for (let i = 0; i < obj.length; i++) {
        const elTagName = Object.keys(obj[i])?.[0] || '';
        let data = checkForDirectMatch(obj[i][elTagName]);
        if (data) {
            obj[i]['data'] = JSON.stringify(data);
            continue;
        }

        data = await getSimilarityForElemnt(obj[i], tab);
        obj[i]['data'] = JSON.stringify(data);
    }

    return obj;
}

async function getAndProcessClickedElement(tab, info, shouldProcessElement = false) {
    if (!tab) {
        console.error(`${manifest?.name ?? ''}: Invalid tab id (${tab?.id || '???'})`);
        return;
    }

    try {
        if (!lastRightClickedElement) {
            const sess = chrome.storage.session.get([sessionStorageKey]);
            lastRightClickedElement = sess[sessionStorageKey];
            if (!lastRightClickedElement) {
                showUIMessage(tab, 'No element found to handle context menu!', 'error');
                return;
            }
        }
        let obj = JSON.parse(lastRightClickedElement);
        if (shouldProcessElement) {
            obj = await calculateSimilarityProposalValue(obj, tab)
        } else {
            if (!Array.isArray(obj)) { obj = [obj]; }
            const key = Object.keys(AIFillFormOptions).find(k => k?.toLowerCase() === info.menuItemId?.toLowerCase());
            const value = key ? AIFillFormOptions[key] : '';

            obj[0]['data'] = JSON.stringify({ "closest": value, "similarity": 1, "threshold": AIHelperSettings.threshold });
        }

        await fillInputsWithProposedValues({ frameId: info.frameId, result: obj }, tab);
    } catch (e) {
        await showUIMessage(tab, e.message, 'error');
        console.warn(`>>> ${manifest?.name ?? ''}`, e);
    }
}

async function getOptions() {
    const defaults = {
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

async function getAIHelperSettings() {
    const defaults = {
        "embeddings": [],
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

    if (!AIHelperSettings || !AIHelperSettings.embeddings) {
        AIHelperSettings = await getAIHelperSettings();
    }

    if (!AIHelperSettings) {
        showUIMessage("Please fill extension options.", "error");
        return;
    }

    if (!AIHelperSettings.embeddings) {
        showUIMessage("Please fill Embeddings API endpoint in the extension options first.", "error");
        return;
    }

    if(!apiUrl) {
        setActiveUrl();
        const provider = AIHelperSettings.embeddings.filter(o => o.value === apiUrl)[0]?.text;
        if(provider?.toLowerCase().indexOf('ollama') > -1 && !activeModel){
             if( AIHelperSettings.model) {
                activeModel = AIHelperSettings.model;
             }
        }
    }

    let response;
    let data;
    try {
        response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const responseText = await response.text();
            throw new Error(`Non-ok response received: ${response.status} - ${responseText}`);
        }

        data = await response.json();
        return data.data?.[0]?.embedding ?? data?.embedding ?? [];
    } catch (err) {
        let errorMessage = '';
        console.log(`${manifest.name ?? ''}: Body sent`, body);
        console.log(`${manifest.name ?? ''}: API: ${apiUrl};  Model: ${activeModel || ''}`);
        console.error(err, data);
        if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
            errorMessage = "Network error: Unable to connect to the server. Please check your connection.";
            if (tab?.id) {
                showUIMessage(tab, errorMessage, 'error');
            }
        } else {
            errorMessage = `Error in fetch or processing: ${err.message}`
            if (tab?.id) {
                showUIMessage(tab, errorMessage, 'error');
            }
        }
        if (tab?.id) {
            showUIMessage(tab, errorMessage, 'error');
        }
        return [];
    }
}

async function sendErrorMessage(tab, message) {
    if (!tab?.id) {
        const tab = await getCurrentTab();
    }

    if (!tab.id) { return; }

    try {
        await chrome.tabs.sendMessage(tab.id, { action: "error", value: message || 'Error!' });
    } catch (e) {
        console.error(`${manifest?.name ?? ''} >>>`, e);
    }
}

function getBestMatch(value) {
    if (!value) { return { "closest": '', "similarity": 0, "threshold": AIHelperSettings.threshold }; }

    let similarities = {};
    for (let key in staticEmbeddings) {
        if (key !== value) {
            similarities[key] = cosineSimilarity(dynamicEmbeddings[value], staticEmbeddings[key]);
        }
    }

    if (Object.keys(similarities).length === 0) {
        return { "closest": '', "similarity": 0, "threshold": AIHelperSettings.threshold };;
    }

    let closest = Object.keys(similarities).reduce((a, b) => similarities[a] > similarities[b] ? a : b);
    let result = similarities[closest] >= AIHelperSettings.threshold ? closest : '';

    return { "closest": result, "similarity": similarities[closest], "threshold": AIHelperSettings.threshold };
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
        if (!vecA[i] || !vecB[i]) { break; }
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function addDataAsMenu(tab) {
    if (!Object.entries(AIFillFormOptions).some(([key, value]) => value)) {
        await init(tab);
        if (Object.keys(AIFillFormOptions).length < 1) { return; }
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
        a = a?.toLowerCase();
        b = b?.toLowerCase();
        if (a < b) return -1;
        else if (a > b) return 1;
        else return 0;
    });

    for (const key of keySorted) {
        const value = AIFillFormOptions[key];
        if (!value) { continue; }

        const menuId = key.replace(/\W/g, '')?.toLowerCase();
        if (createdMenus.includes(menuId)) { continue; }

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

async function addModelsMenu(tab) {
    if (!Object.entries(AIHelperSettings).some(([key, value]) => value)) {
        await init(tab);
        if (Object.keys(AIHelperSettings).length < 1) { return; }
    }

    if (!AIHelperSettings['embeddings']) { return; }
    const empbeddings = Array.isArray(AIHelperSettings['embeddings']) ? AIHelperSettings['embeddings'] : [AIHelperSettings['embeddings']];
    if (empbeddings.length < 1) { return; }

    chrome.contextMenus.create({
        id: "empbeddingsseparator",
        type: "separator",
        contexts: ["editable"],
        documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*/*"]
    });

    chrome.contextMenus.create({
        id: "provider",
        title: "↔ Change provider",
        contexts: ["editable"],
        documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*/*"]
    });

    for (let i = 0; i < empbeddings.length; i++) {
        const emb = empbeddings[i];
        if (emb.text?.toLowerCase().trim().indexOf('ollama') > -1) {
            const models = await fetchModels(emb.value.replace('embeddings', 'tags'));
            if(!models) {  continue;  }
            for (let x = 0; x < models.length; x++) {
                const model = models[x];
                chrome.contextMenus.create({
                    id: `api_${emb.text}_${model.model}`,
                    parentId: "provider",
                    title: `${emb.value === apiUrl && activeModel === model.model ? '✓ ' : '  '}${emb.text} - ${model.model}`,
                    contexts: ["editable"],
                    documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*/*"]
                });
            }
        } else {
            chrome.contextMenus.create({
                id: `api_${emb.text.replace(/\s+/g, '+')}`,
                parentId: "provider",
                title: `${emb.value === apiUrl ? '✓ ' : '  '}${emb.text}`,
                contexts: ["editable"],
                documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*/*"]
            });
        }
    }
}

async function getCurrentTab() {
    let queryOptions = { active: true, lastFocusedWindow: true };
    // `tab` will either be a `tabs.Tab` instance or `undefined`.
    let [tab] = await chrome.tabs.query(queryOptions);

    return tab;
}

async function fillInputsWithProposedValues(data, tab) {
    if (!data) {
        showUIMessage(tab, 'No data provided for the action!', 'warning');
        return;
    }

    if (!data?.result || data.result.length < 1) {
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

async function executeFormFillRequest(info, tab, callbackAction) {
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

async function processCollectedFields(fields, sender) {
    if (!fields || fields.length < 1) {
        return;
    }

    let res;
    try {
        res = JSON.parse(fields);
    } catch (e) {
        console.error(`${manifest.name ?? ''}: parsing fields json >>>`, e);
        return;
    }

    if (!res) { return; }
    const tab = sender.tab;
    if (!Array.isArray(res)) { res = [res]; }

    const filledInputs = await processForm(res, tab);

    await fillInputsWithProposedValues({ "result": filledInputs, "frameId": sender.frameId }, tab);
}

async function showSimilarityAgain(info, tab) {
    if (!/^http/i.test(tab.url)) { return; }
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
    if (!/^http/i.test(tab.url)) { return; }
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
    if (!/^http/i.test(tab.url)) { return; }
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
    if (!/^http/i.test(tab.url)) { return; }
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

async function showUINotification(tab, message, type = 'info') {
    if (!/^http/i.test(tab.url)) { return; }
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id, frameIds: [0] },
            func: (message, type) => { showNotificationRibbon(message, type); },
            args: [message, type]
        });
    } catch (e) {
        console.error(`${manifest.name ?? ''}`, e)
    }
}

async function showFieldAttributesMetadata(info, tab) {
    if (!/^http/i.test(tab.url)) { return; }
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
    if (Object.keys(AIHelperSettings).length === 0) {
        await init();
    }

    try {
        await chrome.scripting.executeScript({
            target: { tabId: sender.tab.id, allFrames: true },
            func: (isAuto) => { if (typeof (setAutoSimilarityProposalOn) === 'function') { setAutoSimilarityProposalOn(document, isAuto); } },
            args: [AIHelperSettings?.calcOnLoad]
        });
    } catch (e) {
        console.error(`${manifest.name ?? ''}`, e)
    }
}

async function toggleAutoProposal(info, tab) {
    AIHelperSettings["calcOnLoad"] = !AIHelperSettings?.calcOnLoad;
    const mElm = AIHelperSettings?.calcOnLoad ? ['≁', 'Off'] : ['∼', 'On'];
    const newTitle = `${mElm[0]} Turn auto proposals: ${mElm[1]}`;
    chrome.contextMenus.update("autoProposal", { title: newTitle });
    chrome.tabs.sendMessage(tab.id, { action: 'autoProposalStatusChanged', autoProposalStatus: AIHelperSettings?.calcOnLoad });
}

async function setProposalValue(el, tab) {
    if (typeof (el) === 'string') {
        try {
            el = JSON.parse(el);
        } catch (e) {
            console.error(`${manifest.name ?? ''}`, e);
            return;
        }
    }

    const prop = await calculateSimilarityProposalValue(el, tab);
    if (!prop) { return; }
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: (elWithProposal) => { if (typeof (showProposal) === 'function') { showProposal(elWithProposal); } },
            args: [prop]
        });
    } catch (e) {
        console.error(`${manifest.name ?? ''}`, e)
    }
}

async function fetchModels(url) {
    let response;
    let data;
    try {
        response = await fetch(url, { 'Content-type': 'application/json' });
        if (!response.ok) {
            const responseText = await response.text();
            throw new Error(`Non-ok response received: ${response.status} - ${responseText}`);
        }
        data = await response.json();
    } catch (e) {
        showUIMessage(e.message, 'error');
        return [];
    }

    if (!data.models) {
        showUIMessage(`${provider?.value} doesn't return models list. Is the URL valid?`, 'error');
        return [];
    }

    return data.models;
}

async function tempChamgeApiProvider(tab, info){
    if (!AIHelperSettings || !AIHelperSettings.embeddings) {
        AIHelperSettings = await getAIHelperSettings();
    }

    if(!AIHelperSettings['embeddings']){
        showUIMessage('It seems that API provider is missing. Did you set it in the options?', 'error');
        return;
    }

    const [preifx, provider, model] = info.menuItemId.split('_');
    setActiveUrl(provider);
    setActiveModel(model);

    isContextMenuCreated = false; // invalidate menu
    createContextMenu(tab); // have to recreate it to add a tick

    staticEmbeddings = {}; // need to clean it, otherwise will return the existing object
    showUINotification(tab, `Provider changed to ${provider?.replace(/\+/g, ' ')}${model ? ' - ': ''}${model || ''}.`, 'success');
}

function getSelectedProviderIndex(){
    if(!Array.isArray(AIHelperSettings.embeddings)){  return -1;  }
    return AIHelperSettings.embeddings.findIndex(o => o?.selected);
}

function setActiveUrl(provider){
    provider = provider?.replace(/\+/g, ' ');
    let i = AIHelperSettings.embeddings.findIndex(o => o.text === provider);
    if(i < 0){   i = getSelectedProviderIndex();  }

    switch (i) {
        case -1:
            showUIMessage(`${provider} not found!`, 'error');
            break;
        default:
            apiUrl = AIHelperSettings.embeddings[Math.max(0, i)]?.value || '';
            break;
    }
}

function setActiveModel(model = ''){
    activeModel = model;
}

function generatePrompt(data){
    if(activeModel !== ''){
        return { "model": activeModel, "prompt": data };
    } else {
        return {"input": data};
    }
}