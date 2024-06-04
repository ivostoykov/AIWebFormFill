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
    "port": 1234,
    "threshold": 0.5,
    "calcOnLoad": false
};

document.addEventListener("DOMContentLoaded", () => {
    const manifest = chrome.runtime.getManifest();
    document.querySelector('span.options-title').textContent = manifest.name;
    document.querySelector('span.js-version').textContent = `version: ${manifest.version || '???'}`;
    const jsonInput = document.getElementById("jsonInput");
    const messageRibbon = document.getElementById("message-ribbon");

    document.querySelector(".save").addEventListener("click", async (e) => {
        try {
            const userInput = JSON.parse(jsonInput.value);
            var settingValues = {};
            document.querySelectorAll('input[type="number"]').forEach(el => settingValues[el.id] = el.value );
            await chrome.storage.sync.set({
                [formFieldsStorageKey]: userInput,
                [AIsettingsStarageKey]: settingValues
            });
            await chrome.storage.local.remove([staticEmbeddingsStorageKey]);
            showMessage("Settings saved successfully!", "success");
        } catch (error) {
            showMessage("Invalid JSON: " + error.message, "error");
        }
    });

    document.querySelector(".cancel").addEventListener("click", (e) => {
        document.getElementById('jsonInput').value = JSON.stringify(defaultFormFields, null, 4);
    });

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
            const items = Object.assign({}, defaultFormFields, obj[formFieldsStorageKey]);
            const settings = Object.assign({}, defaultSettings, obj[AIsettingsStarageKey]);
            jsonInput.value = JSON.stringify(items, null, 4);
            for (const [key, value] of Object.entries(settings)) {
                const el = document.getElementById(key);
                if (el) {
                    el.value = value;
                }
            }
        } catch (e) {
            console.error(`>>> ${manifest?.name ?? ''}`, e.message, e);
            showMessage("Failed to load settings: " + e.message, "error");
        }
    }

    loadSettings();
});