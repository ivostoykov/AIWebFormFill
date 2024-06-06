if(!manifest) {  const manifest = chrome.runtime.getManifest();  }

function collectInputFields(doc) {
    if (!doc) {  doc = document;  }
    var inputFields = [];
    let inputs = Array.from(doc.querySelectorAll('input[type="text"], input[type="email"], input[type="number"], input[type="tel"], textarea'));
    for (let i = 0, l = inputs.length; i < l; i++) {
        if (isVisible(inputs[i])) {
            inputFields.push(getThisField(inputs[i]));
        }
    }

    chrome.runtime.sendMessage({ action: 'fieldsCollected', fields: JSON.stringify(inputFields) });
}

function getThisField(field) {
    const attr2ignore = ['style', 'placeholder', 'required', 'maxlength', 'aria-required', 'autocomplete', 'spellcheck', 'size'];
    let selector = getJSPath(field);
    let fieldData = {};
    const tag = field.tagName.toLowerCase();
    fieldData[tag] = {};
    if (selector.length > 0) {
        fieldData[tag]['selector'] = selector;
    }

    const label = checkAndGetLabel(field);
    if (label) {
        fieldData[tag]['label'] = label;
    }

    if (Object.keys(fieldData[tag]).length > 0) {
        fieldData[tag]['outerHtml'] = field.outerHTML;
    }

    if (!field.attributes) {
        return fieldData;
    }

    for (let i = 0, l = field.attributes.length; i < l; i++) {
        const attr = field.attributes[i];
        if (attr2ignore.includes(attr.name)) { continue; }
        fieldData[tag][attr.name] = attr.value;
    }

    return fieldData;
}

function getJSPath(element) {
    let path = [];
    while (element) {
        let name = element.localName;
        if (!name || name === 'body') {
            break;
        }

        if (element.id) {
            path.push(`${name}#${element.id}`);
        } else if (element.classList.length > 0) {
            path.push(`${name}.${Array.from(element.classList).join('.')}`);
        } else {
            path.push(name);
        }

        if (name.indexOf('frame') > -1) { break; }
        element = element.parentNode;
    }

    return (path.reverse()).join(' > ');
}

function isVisible(el) {
    if (!el) return false;

    if (el.offsetParent === null) { return false; }

    const style = window.getComputedStyle(el);
    if (style.width === "0px" || style.height === "0px" || style.opacity === "0"
        || style.display === "none" || style.visibility === "hidden") {
        return false;
    }

    let currentElement = el;
    while (currentElement) {
        if (
            currentElement.hasAttribute('hidden') ||
            currentElement.getAttribute('aria-hidden') === 'true' ||
            currentElement.hasAttribute('inert')
        ) {
            return false;
        }
        currentElement = currentElement.parentElement;
    }

    return true;
}

function fillFormWithProposedValues(formValues) {
    if (!Array.isArray(formValues)) { formValues = [formValues]; }
    if (formValues.length < 1) {
        showMessage('No suitable values proposed for this form.', "warn");
        console.warn(`${manifest.name ?? ''}: No suitable values proposed for this form.`);
        return;
    }

    var suggestedValue;
    for (let i = 0, l = formValues.length; i < l; i++) {
        let elm = formValues[i];
        try {
            suggestedValue = JSON.parse(elm?.data || '{"closest": "unknown", "similarity": -1, "threshold": -1}');
        } catch (err) {
            console.error(`${manifest.name ?? ''}: >>> json parst failed!`, err)
            suggestedValue = { "closest": "unknown", "similarity": -1, "threshold": -1 };
        }

        if (elm.data) {
            delete elm.data;
        }

        const mainKey = Object.keys(elm)[0];
        if (!mainKey) {
            console.error(`${manifest.name ?? ''}: No mainKey found!`, elm);
            continue;
        }

        let toFill = findMatchingElement(elm)
        if (!toFill) {
            console.warn(`${manifest?.name ?? ''}: No element found with the specified id or name - ${JSON.stringify(elm)}.`);
            return;
        }

        if (document.hasFocus() && suggestedValue?.closest && suggestedValue?.closest !== 'unknown' && navigator.clipboard && navigator.clipboard.writeText) {
            try {
                navigator.clipboard.writeText(suggestedValue.closest);
            } catch (e) {
                console.error(`${manifest?.name ?? ''} >>>`, e);
            }
        }

        toFill.focus();
        showSimilarityHint(toFill, suggestedValue.similarity);
        toFill.value = suggestedValue?.closest || '';
        let event = new Event('input', { bubbles: true });
        toFill.dispatchEvent(event);
        toFill.blur();
    }
}

function findMatchingElement(elm) {
    const mainKey = Object.keys(elm)[0];
    if(!mainKey)  {  return;  }

    let firstHit = null;
    const elementAttributes = elm[mainKey];
    const attr2exclude = ['type', 'class', 'value', 'outerHtml', 'label', 'required', 'pattern', 'spellcheck', 'selector'];
    let id = elementAttributes?.id || '';
    let selector = elementAttributes?.selector || '';

    if(id){
        firstHit = document.getElementById(id);
        if (firstHit) { return firstHit; }
    }

    if(selector){
        firstHit = document.getElementById(selector);
        if (firstHit) { return firstHit; }
    }

    let combinedSelector = [mainKey];
    for (const [key, value] of Object.entries(elementAttributes)) {
        if (attr2exclude.includes(key)) { continue; }

        combinedSelector.push(`[${key}="${value}"]`);
    }

    firstHit = document.querySelector(combinedSelector.join(''));

    return firstHit;
}


function checkAndGetLabel(field) {
    if (!field) { return; }

    let label = field.id ? document.querySelector(`label[for="${field.id}"]`) : null;
    if (label) {
        return label.textContent;
    }

    if (field.parentElement && field.parentElement.tagName === 'LABEL') {
        return field?.parentElement?.textContent;
    }

    return field.closest(`label`)?.textContent;
}

function showFieldsMetadata() {
    const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="email"], input[type="number"], input[type="tel"], textarea'));
    if (inputs.length < 1) {  return;  }

    inputs.forEach(el => showFormFieldHint(el));
    if(window === window.top){
        showMessage('Click any hint to remove them.');
    }
}


function clearAllFields() {
    const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="email"], input[type="number"], input[type="tel"], textarea'));
    if (inputs.length < 1) { return; }

    inputs.forEach(el => {
        el.value = '';
    });
}