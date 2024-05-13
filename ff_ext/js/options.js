const formFieldsStorageKey = "AIFillForm";
const AIsettingsStarageKey = "settings";

var formFields = {
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
    "threshold": 0.5
};

document.addEventListener("DOMContentLoaded", () => {
    const manifest = browser.runtime.getManifest();
    document.querySelector('span.js-version').textContent = `version: ${manifest.version || '???'}`;
    const jsonInput = document.getElementById("jsonInput");
    const messageRibbon = document.getElementById("message-ribbon");

    document.querySelector(".save").addEventListener("click", async (e) => {
        try {
            const userInput = JSON.parse(jsonInput.value); // This will throw an error if the JSON is not valid
            var settingValues = {};
            document.querySelectorAll('input[type="number"]').forEach(el => settingValues[el.id] = el.value );
            await browser.storage.sync.set({
                [formFieldsStorageKey]: userInput,
                [AIsettingsStarageKey]: settingValues
            });
            showMessage("Settings saved successfully!", "success");
        } catch (error) {
            showMessage("Invalid JSON: " + error.message, "error");
        }
    });

    document.querySelector(".cancel").addEventListener("click", (e) => {
        document.getElementById('jsonInput').value = JSON.stringify(formFields, null, 4);
    });

    function showMessage(msg, type) {
        messageRibbon.textContent = msg;
        const styles = ["success", "error", "info", "warning"];
        if (!styles.includes(type)) {
            type = "info";
        }

        messageRibbon.className = `message-ribbon ${type}`;

        setTimeout(() => {
            messageRibbon.classList.add("invisible");
        }, 3000);
    }

    async function loadSettings() {
        try {
            const obj = await browser.storage.sync.get("AIFillForm");
            const items = Object.assign({}, defaultFormFields, obj[formFieldsStorageKey]);
            const settings = Object.assign({}, defaultSettings, obj[AIsettingsStarageKey]);
            jsonInput.value = JSON.stringify(items, null, 4);
            for (const [key, value] of Object.entries(settings)) {
                const el = document.getElementById(key);
                if (el) {
                    el.value = value;
                }
            }
        } catch (error) {
            showMessage("Failed to load settings: " + error.message, "error");
        }
    }

    loadSettings();
});