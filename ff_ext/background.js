var AIFillFormOptions = {};
var LLMStudioOptions = {};

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {

    if(tab.url && !tab.url.startsWith('http')) {  return;  }

    if (changeInfo.status === 'complete' && tab.url) {
        AIFillFormOptions = await getOptions();
        LLMStudioOptions = await getLLMStudioOptions();
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
        case "fillform":
            if(info.selectionText){
                fetchAndBuildEmbeddingsAndBestMatch(info.selectionText);
            }
            break;
        case "fillthisform":
            browser.tabs.sendMessage(tab.id, {action: "getFormFields"}, async function(response) {
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
            });
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

async function processForm(obj, tabId){
    var data = {};
    for (let i = 0, l = obj.length; i < l; i++) {
        const el = obj[i];
        const elId = el?.id || el?.name || '';
        if(!elId) {  continue;  }
        const bestKey = await fetchAndBuildEmbeddingsAndBestMatch(elId);
        data[elId] = AIFillFormOptions[bestKey];
    }
    browser.tabs.sendMessage(tabId, { action: "sentFormValues", value: data });
}

async function processElement(elId, tabId){
    const key = await fetchAndBuildEmbeddingsAndBestMatch(elId);
    browser.tabs.sendMessage(tabId, { action: "sendProposalValue", value: AIFillFormOptions[key] || 'unknown' });
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


async function fetchDataAction(request, sender) {
    const controller = new AbortController();
    let messages = request?.data?.messages || [];
    let data = messages.slice(-1)[0]?.content || '';
    data = await laiComposeUerImput(data, sender);
    request.data.messages.splice(-1, 1, { "role": "user", "content": data});
    messages = updateSystemMessageDate(messages);

    const url = `http://localhost:${request.port}/v1/embeddings`;
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request.data),
        signal: controller.signal,
    })
    .then(response => {
        if(shouldAbort && controller){
            controller.abort();
            browser.tabs.sendMessage(senderTabId, { action: "streamAbort" });
            return;
        }
        handleStreamingResponse(response?.body?.getReader(), sender.tab.id);
    })
    .catch(error => {
        if (error.name === 'AbortError') {
            browser.tabs.sendMessage(sender.tab.id, { action: "streamAbort"});
        } else {
            browser.tabs.sendMessage(sender.tab.id, { action: "streamError", error: error.toString()});
        }
        delete controller;
    });
}

async function fetchAndBuildEmbeddingsAndBestMatch(value) {
    if(Object.keys(AIFillFormOptions).includes(value)){
        return value;
    }

    var requests = [{body: {"input": value}}];
    Object.keys(AIFillFormOptions).forEach(key => {
        requests.push({body: {"input": key}});
    });

    const responses = {};

    for (const request of requests) {
        const { url = "http://localhost:1234/v1/embeddings", body } = request;
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
                responses[body.input] = { error: true, message: 'Network response was not ok: ' + response.statusText };
                continue;  // Move to the next request after logging the error
            }
            const data = await response.json();
            responses[body.input] = data.data[0]?.embedding ?? [];
        } catch (err) {
            console.log("Error in fetch or processing:", err);
            responses[body.input] = { error: true, message: err.message };
        }
    }

    if(Object.keys(responses).length < 1){
        console.error('Response is missing embeddings!');
        return '';
    }

    return getBestMatch(value, responses);
}

/* const embeddings = {
    "emailAddress": [...],  // 400-dim embedding for emailAddress
    "email": [...],         // 400-dim embedding for email
    "tel": [...]            // 400-dim embedding for tel
}; */
function getBestMatch(value, embeddings){
    if(!value){
        console.error(`invalid value: [${value}]`);
        return '';
    }

    let similarities = {};
    for (let key in embeddings) {
        if (key !== value) {
            similarities[key] = cosineSimilarity(embeddings[value], embeddings[key]);
        }
    }

    if (Object.keys(similarities).length === 0) {
        return '';
    }

    let closest = Object.keys(similarities).reduce((a, b) => similarities[a] > similarities[b] ? a : b);

    return closest;
}

// Function to calculate cosine similarity between two vectors
function cosineSimilarity(vecA, vecB) {
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
