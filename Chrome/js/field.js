if(!manifest) {  const manifest = chrome.runtime.getManifest();  }

function setAutoSimilarityProposalOn(doc, isAuto = false) {
    if (!doc) { doc = document; }
    let inputs = Array.from(doc.querySelectorAll('input[type="text"], input[type="email"], input[type="number"], input[type="tel"], textarea'));
    if (!inputs) { return; }
    for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i];
        if (isAuto) {
            input.addEventListener('keydown', applyProposal);
            input.addEventListener('focus', handleInputFocusForAutoProposal);
            // input.addEventListener('blur', cleanAutoProposal);
        } else {
            input.removeEventListener('keydown', applyProposal);
            input.removeEventListener('focus', handleInputFocusForAutoProposal);
            input.removeEventListener('blur', cleanAutoProposal);
        }
    }
}

function collectInputFields(doc, callbackAction) {
    if (!doc) {  doc = document;  }
    if(!callbackAction){  callbackAction = 'fieldsCollected';  }
    var inputFields = [];
    let inputs = Array.from(doc.querySelectorAll('input[type="text"], input[type="email"], input[type="number"], input[type="tel"], textarea'));
    for (let i = 0, l = inputs.length; i < l; i++) {
        if (isVisible(inputs[i])) {
            inputFields.push(getThisField(inputs[i]));
        }
    }

    chrome.runtime.sendMessage({ action: callbackAction, fields: JSON.stringify(inputFields) });
}

function getThisField(field) {
    const attr2ignore = ['style', 'placeholder', 'required', 'maxlength', 'aria-required', 'autocomplete',
        'spellcheck', 'size', 'autocapitalize', 'autocorrect', 'autofocus'];
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
        if(attr.name.startsWith('on')) { continue; }
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

// Similarity Proposals
function getProposalStyle(){
    const proposalStyle = document.createElement('style');
    proposalStyle.textContent = `
    .proposal-container {
        position: fixed;
        border: 1px solid gray;
        background-color: #fffbcb;
        width: max-content;
        height: 30px;
        align-items: center;
        padding: .5em;
        z-index: 999999;
    }

    .proposal-btn {
        font-size: 1.3rem;
        cursor: pointer;
        display: inline-block;
        padding: 0 5px;
    }

    .prop-value {
        min-width: 50px;
        display: inline-block;
    }`;

    return proposalStyle;
}

function cleanAutoProposal(e){
    const existingProposal = document.querySelector('#proposal');
    if(!existingProposal){  return;  }
    if (existingProposal?.contains(e?.relatedTarget)) {
        return;
    }
    if (existingProposal) { existingProposal.remove(); }
}

function getAutoProposalElement(proposalText){
    if (!document.body) {
        return null;
    }

    const id = 'proposal';
    if (document.getElementById(id)) { cleanAutoProposal(); }
    const proposal = document.createElement('div');
    proposal.id = id;
    proposal.appendChild(getProposalStyle());
    proposal.classList.add('proposal-container');

    const children = [
        {id:"pasteProposal", class:"proposal-btn", title: "Replace proposal", text: '⇽'},
        {id:"appendProposal", class: "proposal-btn", title:"Append proposal", text: '⤶'},
        {id:"ignoreProposal", class: "proposal-btn", title:"Ignore proposal", text: '⨉'},
        {id:"proposalValue", class: "prop-value", text: proposalText}
    ];
    for (let i = 0; i < children.length; i++) {
        const el = children[i];
        let child = document.createElement('div');
        for (const [key, value] of Object.entries(el)) {
            switch (key) {
                case 'class':
                    child.classList.add(value);
                    break;
                case 'text':
                    child.textContent = value ?? '';
                    break;
                default:
                    child[key] = value;
                    break;
            }
        }
        proposal.appendChild(child);
    }

    return proposal;
}

function setAutoProposalPosition(target, proposal){
    let rect = target.getBoundingClientRect();
    const proposalTop = window.scrollY + rect.top;
    const proposalLeft = window.scrollX + rect.left + rect.width + 2;

    proposal.style.top = `${proposalTop}px`;
    proposal.style.left = `${proposalLeft}px`;
    rect = proposal.getBoundingClientRect()
}

function handleInputFocusForAutoProposal(e) {
    cleanAutoProposal();
    let attr = getThisField(e.target);
    chrome.runtime.sendMessage({ action: 'fillAutoProposal', element: JSON.stringify([attr]) });
}

function showProposal(el){
    if(document.getElementById('proposal')){  return;  }
    if(!el){  return;  }
    if(!AIHelperSettings?.calcOnLoad){  return;  }
    if(Array.isArray(el) && el.length > 0){  el = el[0];  }

    let data = el?.data;
    if(el?.data){  delete el?.data;  }
    if(typeof(data) === 'string'){
        try {
            data = JSON.parse(data);
        } catch (e) {
            console.log(`>>> ${manifest?.name ?? ''} - data`, el);
            console.error(`>>> ${manifest?.name ?? ''}`, e);
            return;
        }
    }

    const field = Object.keys(el)[0] ?? '';
    if(!field){  return;  }
    let target = findMatchingElement(el);
    if(!target){  return;  }

    let proposal = getAutoProposalElement(data.closest);
    if(proposal){
        setAutoProposalPosition(target, proposal);
        document.body.appendChild(proposal);
    }

    proposal.querySelector('#pasteProposal').addEventListener('mousedown', (e) => {  handlePasteAutoProposal(e, target);  });
    proposal.querySelector('#appendProposal').addEventListener('mousedown', (e) => {  handlePasteAutoProposal(e, target);  });
    proposal.querySelector('#ignoreProposal').addEventListener('click', (e) => {handleIgnoreAutoProposal(e);  });
}

function handlePasteAutoProposal(e, target) {
    const propValue = e.target.parentElement.querySelector('div.prop-value').textContent;
    if(!target){  return;  }

    const newValue = `${e.target.id === 'pasteProposal' ? '' : target.value} ${propValue}`.trim();
    target.value = newValue;
}

function handleIgnoreAutoProposal(e) {
    e.target.closest('div#proposal').remove();
}

function applyProposal(e) {
    if (!e.ctrlKey || !e.shiftKey /* !e.altKey */) {  return;  }

    switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowRight':
            applyPasteProposal(e);
            break;
        case 'Enter':
            chrome.runtime.sendMessage({ action: 'fillthisform' });
            break;
    }
}

function applyPasteProposal(e){
    const proposal = document.getElementById('proposal');
    if(!proposal){  return;  }

    const pasteBtn = proposal.querySelector('#pasteProposal');
    if(!pasteBtn) {  return;  }

    var mousedownEvent = new MouseEvent('mousedown', {
        'view': window,
        'bubbles': true,
        'cancelable': true
    });
    pasteBtn.dispatchEvent(mousedownEvent);
    cleanAutoProposal();
}