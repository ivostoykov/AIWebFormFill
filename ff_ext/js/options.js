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

document.addEventListener("DOMContentLoaded", () => {
    const jsonInput = document.getElementById("jsonInput");
    const messageRibbon = document.getElementById("message-ribbon");

    document.querySelector(".save").addEventListener("click", async (e) => {
        try {
            const userInput = JSON.parse(jsonInput.value); // This will throw an error if the JSON is not valid
            await browser.storage.sync.set({"AIFillForm": userInput});
            showMessage("Settings saved successfully!", "success");
        } catch (error) {
            showMessage("Invalid JSON: " + error.message, "error");
        }
    });

    function showMessage(msg, type) {
        messageRibbon.textContent = msg;
        const styles = ["success", "error", "info", "warning"];
        if (!styles.includes(type)) {
            type = "info";
        }

        messageRibbon.className = `message-ribbon ${type}`;
        messageRibbon.classList.remove("invisible");

        setTimeout(() => {
            messageRibbon.classList.add("invisible");
        }, 3000);
    }

    async function loadSettings() {
        try {
            const obj = await browser.storage.sync.get("AIFillForm");
            const items = obj.AIFillForm || formFields;
            jsonInput.value = JSON.stringify(items, null, 4);
        } catch (error) {
            showMessage("Failed to load settings: " + error.message, "error");
        }
    }

    loadSettings();
});
