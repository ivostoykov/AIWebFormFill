console.log('AI Form Fill Helper loaded background.js ');
var AIFillFormOptions = {};
var LLMStudioOptions = {};
/* const embeddings = {
    "emailAddress": [...],  // ~ 400-dim embedding for emailAddress
    "email": [...],         // ~ 400-dim embedding for email
    "tel": [...]            // ~ 400-dim embedding for tel
}; */
var staticEmbeddings = {};
var dynamicEmbeddings = {};

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if(tab.url && !tab.url.startsWith('http')) {  return;  }

    if (changeInfo.status === 'complete' && tab.url) {
        await init();
    }
});

browser.runtime.onInstalled.addListener(function() {

    browser.contextMenus.create({
        id: "fillthisform",
        title: "📝 Fill the form",
        contexts: ["editable"]
    });

    browser.contextMenus.create({
        id: "fillthisfield",
        title: "▭ Fill this field",
        contexts: ["editable"]
    });

    browser.contextMenus.create({
        id: "clearallfield",
        title: "⌦ Clear the fields",
        contexts: ["editable"]
    });

    browser.contextMenus.create({
        id: "replacefieldvalue",
        title: "(→) Replace field value",
        contexts: ["editable"]
    });

    browser.contextMenus.create({
        id: "showfieldmetadata",
        title: "</> Show form fields metadata",
        contexts: ["editable"]
    });

    browser.contextMenus.create({
        id: "separator1",
        type: "separator",
        contexts: ["all"]
    });

    browser.contextMenus.create({
        id: "openOptions",
        title: "⚙️ Options",
        contexts: ["all"]
    });
});

browser.contextMenus.onClicked.addListener(function(info, tab) {
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
            browser.tabs.sendMessage(tab.id, {action: "getClickedElement"}, async function(response) {
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
            });
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
        case "openOptions":
            browser.runtime.openOptionsPage().then(() => {
                console.log("Options page opened successfully.");
            }).catch((error) => {
                console.error("Error opening options page:", error);
            });
            break;
        default:
            console.log("No action found for:", info.menuItemId);
    }
});

async function init() {
    AIFillFormOptions = await getOptions();
    LLMStudioOptions = await getLLMStudioOptions();
    const formFields = Object.keys(AIFillFormOptions);
    for (const field of formFields) {
        const vectors = await fetchData({ "input": field });
        if (vectors && vectors.length > 0) {
            staticEmbeddings[field] = vectors;
        }
    }
}

async function processForm(obj, tabId){
    var data = {};
    for (let i = 0, l = obj.length; i < l; i++) {
        const el = obj[i];
        const elId = el?.id || el?.name || '';
        if(!elId) {  continue;  }
        dynamicEmbeddings[elId] = await fetchData({ "input": elId });
        const bestKey = getBestMatch(elId);
        data[elId] = AIFillFormOptions[bestKey] || 'unknown';
    }
    browser.tabs.sendMessage(tabId, { action: "sentFormValues", value: data });
}

async function processElement(elId, tabId){
    dynamicEmbeddings[elId] = await fetchData({ "input": elId });
    const bestKey = getBestMatch(elId);
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

        browser.storage.sync.get('AIFillForm').then((obj) => {
            const options = Object.assign({}, defaults, obj.AIFillForm);
            resolve(options);
        }).catch((error) => {
            reject(error);
        });
    });
}

function getLLMStudioOptions() {
    return new Promise((resolve, reject) => {
        const defaults = {
            "localPort": "1234",
        };

        browser.storage.sync.get('laiOptions').then((obj) => {
            const options = Object.assign({}, defaults, obj.laiOptions);
            resolve(options);
        }).catch((error) => {
            reject(error);
        });
    });
}

async function fetchData(body = {}){
    if(!body || Object.keys(body).length < 1){
        return [];
    }

    const url = `http://localhost:${LLMStudioOptions.localPort || "1234"}/v1/embeddings`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            console.log("Non-ok response received", response.status, await response.text());
            console.log("body sent", body);
            return [];
        }
        const data = await response.json();
        return data.data[0]?.embedding ?? [];
    } catch (err) {
        console.log("Error in fetch or processing:", err);
        return [];
    }
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
if(similarities[key] < 1){
    console.error(`key: ${key}`, staticEmbeddings[key], `value: ${value}`, dynamicEmbeddings[value]);
}
        }
    }

    if (Object.keys(similarities).length === 0) {
        return '';
    }

    let closest = Object.keys(similarities).reduce((a, b) => similarities[a] > similarities[b] ? a : b);

    return closest;
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
