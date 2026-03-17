const formFieldsStorageKey = "AIFillForm";
const AIsettingsStarageKey = "settings";
const staticEmbeddingsStorageKey = "staticEmbeddings";

var defaultFormFields = {
    "fullName": "",
    "firstName": "",
    "lastName": "",
    "email": "",
    "tel": "",
    "address1": "",
    "town": "",
    "country": ""
};

var defaultSettings = {
    "embeddings": [],
    "model": '',
    "threshold": 0.5,
    "calcOnLoad": false,
    "autoLearn": true
};

document.addEventListener("DOMContentLoaded", () => {
    const manifest = chrome.runtime.getManifest();
    document.querySelector('span.options-title').textContent = manifest.name;
    document.querySelector('span.js-version').textContent = `version: ${manifest.version || '???'}`;
    const jsonInput = document.getElementById("jsonInput");
    const messageRibbon = document.getElementById("message-ribbon");

    const helpContainer = document.querySelector('div.help-container');
    document.getElementById('colseHelp').addEventListener('click', e => helpContainer.classList.remove('active'));
    const helpIcons = document.querySelectorAll('img.help-icon');
    helpIcons.forEach(i => i.addEventListener('click', helpClicked));

    const embeddingsEndPointList = document.querySelector('#embeddings');
    embeddingsEndPointList.addEventListener('change', async e => await apiProviderChanged(e));
    embeddingsEndPointList?.parentElement.querySelectorAll('img').forEach(img => img.addEventListener('click', onEmbeddingsButtonClick));
    document.querySelectorAll('.dialog-button').forEach(btn => btn.addEventListener('click', dialogButtonClicked));

    const refreshModelsBtn = document.querySelector('#refreshModels');
    refreshModelsBtn?.addEventListener('click', async e => await fillModelList());

    document.querySelector(".save").addEventListener("click", async e => await saveSettings(e));

    document.querySelector(".cancel").addEventListener("click", (e) => {
        document.getElementById('jsonInput').value = JSON.stringify(defaultFormFields, null, 4);
    });

    document.querySelector(".export").addEventListener("click", async (e) => await exportSettings(e));

    document.querySelector(".import").addEventListener("click", (e) => {
        document.getElementById('importFile').click();
    });

    document.getElementById('importFile').addEventListener("change", async (e) => await importSettings(e));

    function showMessage(msg, type) {
        messageRibbon.textContent = msg;
        const styles = ["success", "error", "info", "warning"]
        if(!styles.includes(type)){
            type = "info";
        }

        messageRibbon.className = `message-ribbon ${type}`;

        setTimeout(() => {
            messageRibbon.classList.add("invisible");
        }, 3000);
    }

    async function loadSettings() {
        try {
            const obj = await chrome.storage.sync.get([formFieldsStorageKey, AIsettingsStarageKey]);
            let items = Object.assign({}, obj[formFieldsStorageKey]);

            if (items && isOldFormat(items)) {
                items = convertToNewFormat(items);
            }

            const settings = Object.assign({}, defaultSettings, obj[AIsettingsStarageKey]);
            jsonInput.value = JSON.stringify(items, null, 4);
            for (const [key, value] of Object.entries(settings)) {
                const el = document.getElementById(key);
                if (!el) {  continue;  }
                if(key === 'embeddings'){
                    fillEmbeddingsOption(el, value);
                    el.dispatchEvent(new Event('change', {bubbles: true}));
                    continue;
                }
                if (el.type === 'checkbox') {
                    el.checked = value;
                } else {
                    el.value = value;
                }
            }
        } catch (e) {
            console.error(`>>> ${manifest?.name ?? ''}`, e.message, e);
            showMessage("Failed to load settings: " + e.message, "error");
        }
    }

    function isOldFormat(data) {
        return Object.values(data).some(v => !Array.isArray(v));
    }

    function convertToNewFormat(oldData) {
        const newData = {};
        for (const [field, value] of Object.entries(oldData)) {
            if (Array.isArray(value)) { continue; }

            if (!newData[value]) {
                newData[value] = new Set();
            }
            newData[value].add(field);
        }

        for (const key in newData) {
            newData[key] = Array.from(newData[key]);
        }

        return newData;
    }

    loadSettings();

    async function saveSettings(e) {
        try {
            const userInput = JSON.parse(jsonInput.value);

            for (const [key, value] of Object.entries(userInput)) {
                if (!Array.isArray(value)) {
                    throw new Error(`Invalid format: "${key}" must be an array of field names`);
                }
            }

            var settingValues = {};
            document.querySelectorAll('input[type="text"]').forEach(el => settingValues[el.id] = el.value );
            document.querySelectorAll('input[type="number"]').forEach(el => settingValues[el.id] = el.value );
            document.querySelectorAll('input[type="checkbox"]').forEach(el => settingValues[el.id] = el.checked );
            const embeddings = document.querySelector('#embeddings');
            settingValues[embeddings.id] = [];
            embeddings.querySelectorAll('option').forEach(el => {
                if(el?.value?.trim() === '') {  return;  }
                settingValues[embeddings.id].push({"text": el.text, "value": el.value, "selected": el.selected});
                if(el.selected && el.text.toLowerCase().indexOf('ollama') > -1){
                    let modelList = document.querySelector('#modelList');
                    if(!modelList){  return;  }
                    if(modelList.selectedIndex < 0){  throw new Error(`${el.text} requires model name!`);  }
                    settingValues['model'] = modelList.options[modelList.selectedIndex].value || '';
                }
            });

            await chrome.storage.sync.set({
                [formFieldsStorageKey]: userInput,
                [AIsettingsStarageKey]: settingValues
            });
            await chrome.storage.local.remove([staticEmbeddingsStorageKey]);
            showMessage("Settings saved successfully!", "success");
        } catch (error) {
            showMessage("Invalid JSON: " + error.message, "error");
        }
    }

    async function apiProviderChanged(e){
        const embed = e.target;
        const idx = embed.selectedIndex;
        const selectedOption = embed.options[idx];
        const modelRow = document.querySelector('#modelsRow')
        modelRow.querySelector('#modelList')?.replaceChildren();
        if(selectedOption?.text?.toLowerCase().indexOf('ollama') > -1){
            modelRow.classList.remove('obscured');
            await fillModelList();
        } else  {
            modelRow.classList.add('obscured');
        }
    }

    async function fillModelList(){
        const obj = await chrome.storage.sync.get([AIsettingsStarageKey]);
        const settings = Object.assign({}, defaultSettings, obj[AIsettingsStarageKey]);
        const modelList = document.querySelector('#modelList');
        const embeddingsList = document.querySelector('#embeddings');
        if(!modelList || !embeddingsList) {  return; }
        const provider = embeddingsList.options[embeddingsList.selectedIndex];;
        if((provider?.text?.toLowerCase() || '').indexOf('ollama') < 0){  return []; }
        let url = provider.value?.split('/');
        url.pop();
        url.push('tags');
        url = url.join('/');

        // Clear existing models before repopulating
        modelList.replaceChildren();

        let idx = -1;
        const models = await fetchModels(url);
        if(!Array.isArray(models)){  models = [models]; }

        for (let i = 0; i < models.length; i++) {
            const model = models[i];
            if(model.name?.trim() === '' || model.model?.trim() === '') {  continue;  }
            const o = document.createElement('option');
            o.text = model.name;
            o.value = model.model;
            if(settings['model'] === model.model){
                idx = i;
            }
            modelList.appendChild(o);
        }
        modelList.selectedIndex = idx;
    }

    async function fetchModels(url){
        let response;
        let data;
        try {
            response = await fetch(url, {'Content-type':'application/json'});
            if (!response.ok) {
                const responseText = await response.text();
                throw new Error(`Non-ok response received: ${response.status} - ${responseText}`);
            }
            data = await response.json();
        } catch (e) {
            if(typeof(showMessage) === 'function'){
                showMessage(e.message, 'error');
            } else {
                console.error(`>>> ${manifest.name}`, e);
                console.log(`>>> ${manifest.name} - response:`, response);
            }
            return [];
        }

        if(!data.models){
            if(typeof(showMessage) === 'function'){
                showMessage(`${provider?.value} doesn't return models list. Is the URL valid?`, 'error');
            } else {
                console.error(`>>> ${manifest.name} - ${provider?.value} doesn't return models list. Is the URL valid?`);
                console.log(`>>> ${manifest.name} - data:`, data);
            }
            return [];
        }

        return data.models;
    }

    function fillEmbeddingsOption(el, options){
        if(!el || !options) {  return;  }
        if(!Array.isArray(options)) {  options = [options];  }
        if(el.tagName.toLowerCase() !== 'select'){  return;  }
        el.replaceChildren();

        let o = document.createElement('option');
        o.text = 'Select provider';
        o.value = '';
        o.selected = true;
        el.appendChild(o);

        for (let i = 0; i < options.length; i++) {
            const option = options[i];
            o = document.createElement('option');
            if(typeof(option) === 'string'){
                o.text = option;
                o.value = option;
            } else {
                o.text = option?.text || 'Unknown';
                o.value = option?.value || '';
                o.selected = option?.selected || false;
            }
            el.appendChild(o);
        }
    }

    function helpClicked(e){
        const label = e.target.parentElement.querySelector('label');

        switch(label.textContent){
            case "Embeddings API endpoint":
                setHelpContent('#embeddingsHelpTemplate', label);
                break;
            case "Probability threshold":
                setHelpContent('#probabilityHelpTemplate', label);
                break;
            case "Calculate similarities on focus":
                setHelpContent('#calcSimilaritiesOnFocus', label);
                break;
            case "Auto-learn field mappings":
                setHelpContent('#autoLearnHelp', label);
                break;
            case "Form Fields Values":
                setHelpContent('#formFieldValuesHelp', label);
                break;
        }

        if(!helpContainer.classList.contains('active')){
            helpContainer.classList.add('active');
        }
    }

    function setHelpContent(template, label){
        const helpContainer = document.querySelector('div.help-container');
        const helpContent = helpContainer.querySelector('p.help-content');
        helpContent.replaceChildren();

        if(!template)  {  return;  }

        helpContainer.querySelector('.help-title').textContent = label.textContent;
        const content = document.querySelector(template)?.content?.firstElementChild?.cloneNode(true);

        if(content && helpContent){
            helpContent.appendChild(content);
        }
    }

    function onEmbeddingsButtonClick(e){
        const action = e.target.getAttribute('data-action');
        if(!action){  return;  }

        switch (action) {
            case 'edit':
            case 'add':
                showAddDialog(action);
                break;
            case 'remove':
            case 'removeAll':
                removeEmbeddingsOptions(action);
                break;
            case 'asc':
            case 'desc':
                sortEmbeddingsOptions(action);
                break;
            default:
                break;
        }
    }

    function showAddDialog(action){
        const dlg = document.querySelector('#dlgAddEmbeddings');
        if(!dlg){
            console.error('Dialog not found!');
            return;
        }

        dlg.setAttribute('data-action', action);
        const dlgName = dlg.querySelector('#dlgName');
        const dlgUrl = dlg.querySelector('#dlgUrl');
        if(action === 'edit'){
            const embeddings = document.querySelector('#embeddings');
            if(embeddings?.selectedIndex > 0){
                dlgName.value = embeddings.options[embeddings.selectedIndex].text;
                dlgUrl.value = embeddings.options[embeddings.selectedIndex].value;
            }
        } else {
            dlgName.value = '';
            dlgUrl.value = '';
        }

        dlg.showModal();
    }

    function removeEmbeddingsOptions(action = 'removeAll'){
        const embeddings = document.querySelector('#embeddings');
        if(action === 'removeAll'){
            embeddings.replaceChildren();
            return;
        }

        if(embeddings.selectedIndex > 0){
            embeddings.remove(embeddings.selectedIndex);
        } else {
            showMessage('Please select provider first.', 'warning');
        }
    }

    function sortEmbeddingsOptions(direction = 'asc'){
        const embeddings = document.querySelector('#embeddings');
        const selected = embeddings.selectedIndex;
        let option = embeddings.options[0];

        let options = Array.from(embeddings.options);
        options.sort((a, b) =>
            direction === 'asc'
            ? a.text.localeCompare(b.text)
            : b.text.localeCompare(a.text));

        embeddings.replaceChildren();
        embeddings.appendChild(option);
        for (let i = 0; i < options.length; i++) {
            if(options[i].value === '')  {  continue;  }
            embeddings.appendChild(options[i]);
        }

        showMessage('Options sorted', 'success');
    }


    function isLocalOrSecureEndpoint(urlString){
        try {
            const url = new URL(urlString);
            const hostname = url.hostname.toLowerCase();

            const isLocalhost = hostname === 'localhost' ||
                              hostname === '127.0.0.1' ||
                              hostname === '::1' ||
                              hostname === '[::1]' ||
                              hostname.startsWith('192.168.') ||
                              hostname.startsWith('10.') ||
                              /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);

            const isSecure = url.protocol === 'https:';

            return { isLocal: isLocalhost, isSecure, hostname, protocol: url.protocol };
        } catch (e) {
            return { isLocal: false, isSecure: false, hostname: '', protocol: '' };
        }
    }

    function dialogButtonClicked(e){
        const dlg = e.target.closest('dialog');
        if(!dlg){  return;  }
        if(e.target.id === 'dlgCancel'){
            dlg.close();
            return;
        }

        if(e.target.id !== 'dlgAdd'){  return; }

        const dlgName = dlg.querySelector('#dlgName')?.value || 'Unknown';
        const dlgUrl = dlg.querySelector('#dlgUrl')?.value || '';
        if(!dlgName || !dlgUrl){  return;  }

        const check = isLocalOrSecureEndpoint(dlgUrl);
        if (!check.isLocal || !check.isSecure) {
            let warnings = [];
            if (!check.isLocal) {
                warnings.push(`⚠ This endpoint (${check.hostname}) is not on localhost or a private network. Field metadata will be sent to this remote host.`);
            }
            if (!check.isSecure && check.protocol === 'http:') {
                warnings.push(`⚠ This endpoint uses plain HTTP. Data will not be encrypted in transit.`);
            }

            const confirmMsg = warnings.join('\n\n') + '\n\nAre you sure you want to add this endpoint?';
            if (!confirm(confirmMsg)) {
                return;
            }
        }

        const embeddings = document.querySelector('#embeddings');
        if(!embeddings)  {  return;  }

        const o = document.createElement('option');
        o.text = dlgName;
        o.value = dlgUrl;
        o.selected = false;

        embeddings.appendChild(o);
        dlg.close();
    }

    async function exportSettings(e) {
        try {
            const manifest = chrome.runtime.getManifest();
            if (!manifest) {
                throw new Error('Failed to retrieve extension manifest');
            }

            const exportData = {};

            // Gather all form field values
            document.querySelectorAll('input[type="text"]').forEach(el => {
                if (el.id && el.id !== 'importFile') {
                    exportData[el.id] = el.value;
                }
            });

            document.querySelectorAll('input[type="number"]').forEach(el => {
                if (el.id) {
                    exportData[el.id] = el.value;
                }
            });

            document.querySelectorAll('input[type="checkbox"]').forEach(el => {
                if (el.id) {
                    exportData[el.id] = el.checked;
                }
            });

            // Handle embeddings select
            const embeddings = document.querySelector('#embeddings');
            if (embeddings) {
                const embeddingsData = [];
                embeddings.querySelectorAll('option').forEach(el => {
                    if (el?.value?.trim() !== '') {
                        embeddingsData.push({
                            "text": el.text,
                            "value": el.value,
                            "selected": el.selected
                        });
                    }
                });
                if (embeddingsData.length > 0) {
                    exportData[embeddings.id] = embeddingsData;
                }
            }

            // Handle model list select - only export the selected model
            const modelList = document.querySelector('#modelList');
            if (modelList && modelList.selectedIndex >= 0) {
                const selectedOption = modelList.options[modelList.selectedIndex];
                if (selectedOption.value) {
                    exportData['modelList'] = [{
                        "text": selectedOption.text,
                        "value": selectedOption.value,
                        "selected": true
                    }];
                }
            }

            // Handle JSON input (form fields)
            const jsonInput = document.getElementById('jsonInput');
            if (jsonInput && jsonInput.value.trim()) {
                try {
                    const parsedJson = JSON.parse(jsonInput.value);
                    exportData[jsonInput.id] = parsedJson;
                } catch (err) {
                    console.warn('Failed to parse jsonInput, storing as string:', err);
                    exportData[jsonInput.id] = jsonInput.value;
                }
            }

            // Validate we have some data to export
            if (Object.keys(exportData).length === 0) {
                throw new Error('No settings to export');
            }

            // Create filename
            const version = (manifest.version || '0_0_0').replace(/\./g, '_');
            const name = (manifest.name || 'settings').replace(/\s+/g, '_').replace(/\./g, '_');
            const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const filename = `${name}_${version}_${date}.json`;

            // Download file
            let jsonString;
            try {
                jsonString = JSON.stringify(exportData, null, 2);
            } catch (stringifyError) {
                throw new Error('Failed to serialize settings: ' + stringifyError.message);
            }

            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showMessage('Settings exported successfully!', 'success');
        } catch (error) {
            console.error('Export error:', error);
            showMessage('Export failed: ' + error.message, 'error');
        }
    }

    async function importSettings(e) {
        try {
            const file = e.target.files[0];
            if (!file) {
                return;
            }

            // Validate file is JSON
            if (!file.name.toLowerCase().endsWith('.json')) {
                showMessage('Import failed: Please select a JSON file', 'error');
                e.target.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    let importData;

                    // Parse JSON with error handling
                    try {
                        importData = JSON.parse(event.target.result);
                    } catch (parseError) {
                        throw new Error('Invalid JSON format: ' + parseError.message);
                    }

                    // Validate the imported data structure
                    if (typeof importData !== 'object' || importData === null) {
                        throw new Error('Invalid settings file: expected an object');
                    }

                    if (Object.keys(importData).length === 0) {
                        throw new Error('Settings file is empty');
                    }

                    let hasOllamaProvider = false;
                    let importedModelValue = null;
                    let importedFieldsCount = 0;

                    for (const [key, value] of Object.entries(importData)) {
                        const el = document.getElementById(key);
                        if (!el && key !== 'modelList') { continue; }

                        if (key === 'embeddings') {
                            if (!Array.isArray(value)) {
                                console.warn('embeddings should be an array, skipping');
                                continue;
                            }
                            fillEmbeddingsOption(el, value);

                            value.forEach(item => {
                                if (item.selected && item.text && item.text.toLowerCase().indexOf('ollama') > -1) {
                                    hasOllamaProvider = true;
                                }
                            });

                            el.dispatchEvent(new Event('change', { bubbles: true }));
                            importedFieldsCount++;
                        } else if (key === 'modelList') {
                            if (!Array.isArray(value)) {
                                console.warn('modelList should be an array, skipping');
                                continue;
                            }
                            if (value.length > 0 && value[0].value) {
                                importedModelValue = value[0].value;
                                importedFieldsCount++;
                            }
                        } else if (key === 'jsonInput') {
                            if (typeof value === 'object') {
                                for (const [fieldKey, fieldValue] of Object.entries(value)) {
                                    if (!Array.isArray(fieldValue)) {
                                        throw new Error(`Invalid format in jsonInput: "${fieldKey}" must be an array of field names`);
                                    }
                                }
                                el.value = JSON.stringify(value, null, 4);
                            } else if (typeof value === 'string') {
                                el.value = value;
                            }
                            importedFieldsCount++;
                        } else if (el.type === 'checkbox') {
                            el.checked = Boolean(value);
                            importedFieldsCount++;
                        } else if (el.type === 'number') {
                            const numValue = parseFloat(value);
                            if (!isNaN(numValue)) {
                                el.value = numValue;
                                importedFieldsCount++;
                            }
                        } else {
                            el.value = value;
                            importedFieldsCount++;
                        }
                    }

                    if (importedModelValue && hasOllamaProvider) {
                        const modelList = document.querySelector('#modelList');
                        if (modelList) {
                            const startTime = Date.now();
                            const timeout = 5000;

                            while (modelList.options.length === 0 && (Date.now() - startTime) < timeout) {
                                await new Promise(resolve => setTimeout(resolve, 100));
                            }

                            if (modelList.options.length > 0) {
                                let modelFound = false;
                                for (let i = 0; i < modelList.options.length; i++) {
                                    if (modelList.options[i].value === importedModelValue) {
                                        modelList.selectedIndex = i;
                                        modelFound = true;
                                        break;
                                    }
                                }

                                if (!modelFound) {
                                    console.warn(`Model "${importedModelValue}" not found in current Ollama models`);
                                }
                            } else {
                                console.warn('Model list did not populate within timeout period');
                            }
                        }
                    }

                    e.target.value = '';

                    if (importedFieldsCount === 0) {
                        throw new Error('No valid settings found in the file');
                    }

                    let message = 'Import completed successfully! ';
                    if (hasOllamaProvider) {
                        message += 'Please check the Ollama model selection and adjust if needed. ';
                    }
                    message += 'Click Save to apply the changes.';

                    showMessage(message, 'info');
                } catch (error) {
                    console.error('Import error:', error);
                    showMessage('Import failed: ' + error.message, 'error');
                    e.target.value = '';
                }
            };

            reader.onerror = (error) => {
                console.error('File read error:', error);
                showMessage('Failed to read file: ' + (error.message || 'Unknown error'), 'error');
                e.target.value = '';
            };

            reader.readAsText(file);
        } catch (error) {
            console.error('Import exception:', error);
            showMessage('Import failed: ' + error.message, 'error');
            if (e.target) {
                e.target.value = '';
            }
        }
    }
});