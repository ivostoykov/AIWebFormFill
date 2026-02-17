const manifest = chrome.runtime.getManifest();
const AIsettingsStorageKey = "settings";
var _field;
var _AiFillTarget = {};
var similarityInfo = [];
var AIHelperSettings = {};

if (document.readyState !== 'loading') {
  setListner();
} else {
  document.addEventListener('DOMContentLoaded', function () {
    setListner();
  });
}

function setListner() {
  getLLMStudioOptions()
    .then(() => {
      if (AIHelperSettings?.calcOnLoad) {
        try {
          if (!chrome.runtime.sendMessage) { throw new Error(`chrome.runtime.sendMessage is ${typeof (chrome?.runtime?.sendMessage)}`); }
          chrome.runtime.sendMessage({ action: 'toggleAutoProposals', autoProposalStatusChanged: true });
        } catch (err) {
          if (err.message === 'Extension context invalidated.') {
            showMessage(`${err.message}. Please reload the page.`, 'error');
          }
          console.log(`>>> ${manifest?.name ?? ''}`, err);
        }
      }
    })
    .catch(e => { console.log('>>>', e) });

  document.addEventListener('contextmenu', function (event) {
    _field = event.target;
    let attr = getThisField(event.target);
    try {
      if (!chrome.runtime.sendMessage) { throw new Error(`chrome.runtime.sendMessage is ${typeof (chrome?.runtime?.sendMessage)}`); }
      chrome.runtime.sendMessage({ action: 'storeRightClickedElement', element: JSON.stringify([attr]) });
    } catch (err) {
      if (err.message === 'Extension context invalidated.') {
        showMessage(`${err.message}. Please reload the page.`, 'error');
      }
      console.log(`>>> ${manifest?.name ?? ''}`, err);
    }
  }, true);
}

async function getLLMStudioOptions() {
  const defaults = {
    "embeddings": [],
    "model": '',
    "threshold": 0.5,
    "calcOnLoad": false
  };

  try {
    const obj = await chrome.storage.sync.get([AIsettingsStorageKey])
    AIHelperSettings = (Object.assign({}, defaults, obj[AIsettingsStorageKey]));
  } catch (err) {
    AIHelperSettings = defaults;
    console.error('>>>', err);
  }
}

chrome.runtime.onMessage.addListener(function (request) {
  console.log(`${manifest.name ?? ''}: message:`, request);
  if (!request?.action) { return; }

  switch (request.action) {

    case "showLoader":
      showLoader();
      break;

    case "hideLoader":
      hideLoader();
      break;

    case "showMessage":
      hideLoader();
      showNotificationRibbon(request.message, request.type || 'info');
      break;

    case "error":
      hideLoader();
      showNotificationRibbon(request.value || 'An error occurred', 'error');
      break;

    case "replaceFieldValue":
      if (!_field) { return false; }
      replaceFieldValue(_field);
      break;

    case "autoProposalStatusChanged":
      AIHelperSettings['calcOnLoad'] = request?.calcOnLoad;
      try {
        if (!chrome.runtime.sendMessage) { throw new Error(`chrome.runtime.sendMessage is ${typeof (chrome?.runtime?.sendMessage)}`); }
        chrome.runtime.sendMessage({ action: 'toggleAutoProposals', autoProposalStatusChanged: request?.calcOnLoad });
      } catch (err) {
        if (err.message === 'Extension context invalidated.') {
          showMessage(`${err.message}. Please reload the page.`, 'error');
        }
        console.log(`>>> ${manifest?.name ?? ''}`, err);
      }
      break;

    case "collectFields":
      showLoader();
      collectInputFields(document);
      break;

    case "fillFields":
      fillFormWithProposedValues(request.data);
      hideLoader();
      showNotificationRibbon('Form filling complete', 'success');
      break;

    case "clearFields":
      clearAllFields();
      break;

    case "showMetadata":
      showFieldsMetadata();
      break;

    case "showSimilarities":
      showCalculatedSimilarityAgain();
      break;

    case "hideSimilarities":
      hideSimilatityHints();
      break;

    case "toggleAutoProposals":
      setAutoSimilarityProposalOn(document, request.enabled);
      break;

    case "showProposal":
      showProposal(request.element);
      break;

    case "showNotification":
      showNotificationRibbon(request.message, request.type);
      break;

    default:
      console.warn(`${manifest.name ?? ''}: Received unknown action:`, request.action);
      break;
  }
});

function isValidRequestValue(requestValue) {
  return Array.isArray(requestValue) || requestValue instanceof Object ? requestValue : false;
}

function hideSimilatityHints() {
  document.querySelectorAll('.js-similarity-hint')?.forEach(hint => hint.parentNode.removeChild(hint));
}

function showSimilarityHint(field, similarity, duration = 4000) {
  const hint = document.createElement('div');
  hint.classList.add('js-similarity-hint');
  hint.textContent = `Similarity: ${similarity}`;
  hint.style.cssText = 'position: absolute; background-color: lightyellow; padding: 10px; border-radius: 5px; border: 1px solid lightgray; visibility: visible; z-index: 9999; transition: opacity 0.8s ease-out; opacity: 1; font-size: 12px';
  document.body.appendChild(hint);

  const rect = field.getBoundingClientRect();
  hint.style.top = `${window.scrollY + rect.top - hint.offsetHeight / 2}px`; // 5px above the input
  hint.style.left = `${window.scrollX + rect.left + rect.width / 2}px`;
  hint.style.visibility = 'visible';
  similarityInfo.push({ "field": field, "similarity": similarity });

  if (duration > 0) {
    setTimeout(() => {
      hint.style.opacity = '0';
      setTimeout(() => {
        hint.parentNode.removeChild(hint);
      }, 1000);
    }, duration);
  } else {
    return hint;
  }
}

function getPopup() {
  if (!document.body) {
    return null;
  }

  const id = 'formFillHelperPopup';
  var popup = document.getElementById(id);
  if (popup) { return popup; }

  const dialogStyle = document.createElement('style');
  dialogStyle.textContent = `
    .modal-dialog{
      position: fixed;
      width: 500px;
      height: fit-content;
      padding: 20px;
      z-index: 999999;
      text-align: center;
      black;box-shadow: #777 10px 8px 10px;
      display: flex;
      flex-direction: column;
      outline: none;
      border: 1px solid #999;
    }

    .modal-title{
      margin-bottom:5px;
    }

    .dialog-content{
      flex-grow: 1;
      font-weight: normal;
      align-self: center;
      padding-top: 5px;
    }

    .dialog-button{
      padding: 10px 20px;
      font-size: 1rem;
      cursor: pointer;
      width: 200px;
      align-self: center;
    }

    .dialog-button:hover{
      box-shadow: #888 10px 8px 10px;
      border: 1px solid #555;
    }

    .dialog-button:hover,
    .dialog-button:focus{
      outline:none;
    }

    .dialog-hr{
      border-top: 1px solid #888;
    }

    .dlg-icon{
      position: absolute;
      top: 5px;
      left: 20px;
      width: 42px;
      height: auto;
    }`;

  popup = document.createElement('dialog');
  popup.id = id;
  popup.classList.add('modal-dialog');
  popup.appendChild(dialogStyle);

  try {
      const icon = document.createElement('img');
      icon.src = chrome.runtime.getURL('img/warning.svg')
      icon.classList.add('dlg-icon');
      popup.appendChild(icon);
  } catch (err) {
    if(err.message !== 'Extension context invalidated.'){
      console.error(`>>> ${manifest?.name ?? ''}`, err)
    }
  }

  const title = document.createElement('div');
  title.id = 'popupTitle';
  title.classList.add('modal-title');
  title.textContent = manifest.name || '';
  popup.appendChild(title);

  const hr = document.createElement('hr');
  hr.classList.add('dialog-hr');
  popup.appendChild(hr);

  const content = document.createElement('p');
  content.id = 'popupContent';
  content.classList.add('dialog-content');
  popup.appendChild(content);

  const okButton = document.createElement('button');
  okButton.textContent = 'OK';
  okButton.classList.add('dialog-button');
  okButton.addEventListener('click', () => popup.remove());
  popup.appendChild(okButton);

  window.top.document.body.appendChild(popup);

  return popup;
}

function getMessageColour(type = "info"){
  let colour;
  switch (type) {
    case 'success':
    case 's':
      colour = '#bcfebc';
      break;
    case 'error':
    case 'e':
      colour = '#ffc2c2';
      break;
    case 'warning':
    case 'warn':
    case 'w':
      colour = '#fca73e';
      break;
    default:
      colour = '#ccc';
      break;
  }

  return colour
}

function showMessage(message, type = "info") {
  if (!message) { return; }

  let color = getMessageColour(type);

  var popup = getPopup();
  if (!popup) {
    setTimeout(() => { showMessage(`${manifest.name}: ${message}`, type) }, 1000);
    return;
  }

  const content = document.getElementById('popupContent');
  if (content) {
    content.textContent = message;
  }

  popup.style.backgroundColor = color;
  popup.showModal();
}

function createFormFieldHintStyle() {
  const id = 'formFillHelperFieldHistStyle';

  var hintStyle = document.getElementById(id);
  if (hintStyle) { return; }

  hintStyle = document.createElement('style');
  hintStyle.id = id;
  hintStyle.textContent = `
      .custom-hint {
          position: absolute;
          background-color: #f9f9f9;
          border: 1px solid #d3d3d3;
          padding: 5px 10px;
          border-radius: 4px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.2);
          z-index: 1000;
          display: none; // Initially hidden
          transform: translate(-50%, -100%);
          top: 0;
          left: 50%;
          color:black;
      }
  `;

  document.head.appendChild(hintStyle);
}

function showFormFieldHint(field) {
  if (!field) {
    console.error(`${manifest.name ?? ''}: Invalid field`, field);
    return;
  }

  createFormFieldHintStyle();

  const fieldId = field.id;
  if (!fieldId) { return; }

  const fieldHintId = `${fieldId}Hint`;
  var hint = document.getElementById(fieldHintId);
  if (!hint) {
    hint = document.createElement('div');
    hint.id = fieldHintId;
    hint.className = 'custom-hint';
    hint.textContent = `id: ${field.id}; name: ${field.name}`;
  }

  const rect = field.getBoundingClientRect();

  document.body.appendChild(hint);

  hint.style.top = `${window.scrollY + rect.top}px`;
  hint.style.left = `${window.scrollX + rect.left + rect.width / 2}px`;
  hint.style.display = 'block';
  hint.addEventListener('click', (e) => {
    const hints = document.querySelectorAll('div.custom-hint');
    hints.forEach(h => {
      if (h.parentNode) { h.parentNode.removeChild(h); }
    })
  });
}

function positionReplaceElementNearField(replaceElement, field) {
  if (!field) {
    console.error(`${manifest.name ?? ''}: Invalid field`, field);
    return;
  }

  const rect = field.getBoundingClientRect();
  replaceElement.style.position = 'absolute';
  replaceElement.style.left = `${rect.left + window.scrollX}px`;
  replaceElement.style.top = `${rect.bottom + window.scrollY + 5}px`;
}

function getReplaceElement(field) {
  if (!field) {
    console.error(`${manifest.name ?? ''}: Invalid field`, field);
    return;
  }

  let replaceElement = document.querySelector('div.js-ai-form-fill-helper');
  if (!replaceElement) {
    replaceElement = document.createElement('div');
    replaceElement.className = 'js-ai-form-fill-helper';
    replaceElement.style.cssText = "position: fixed; bottom: 20px; right: 20px; padding: 10px; background: white; border: 1px solid black; z-index: 1000; border: 1px solid gray; height: fit-content; width: fit-content; color:black;";
    replaceElement.innerHTML = `
        <input type="text" id="searchText" placeholder="Search text" style="color:black">
        <input type="text" id="replaceText" placeholder="Replace text" style="color:black">
        <div id="previewResult" style="padding: 15px; margin: 7px 0; background: #f0f0f0;"></div>
        <button id="closeButton" style="padding: 0 2rem; font-size: 20px;">✖️</button>
        <button id="replaceButton" style="padding: 0 2rem; font-size: 20px;">✓</button>
    `;
    document.body.appendChild(replaceElement);
  }

  positionReplaceElementNearField(replaceElement, field);
  return replaceElement
}

function typeReplacement(field, text) {
  if (!field) {
    console.error(`${manifest.name ?? ''}: Invalid field`, field);
    return;
  }

  field.value = '';
  field.focus();
  field.value = text;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function replaceFieldValue(field) {
  if (!field) {
    console.error(`${manifest.name ?? ''}: Invalid field`, field);
    return;
  }

  const replaceElement = getReplaceElement(field);

  const searchInput = replaceElement.querySelector('#searchText');
  const replaceInput = replaceElement.querySelector('#replaceText');
  const replaceButton = replaceElement.querySelector('#replaceButton');
  const closeButton = replaceElement.querySelector('#closeButton');
  const previewResult = replaceElement.querySelector('#previewResult');

  searchInput.value = field.value;
  replaceInput.focus();
  const updatePreview = () => {
    const searchVal = searchInput.value;
    const replaceVal = replaceInput.value;
    const elementValue = field.value;

    if (searchVal) {
      try {
        const regex = new RegExp(searchVal, 'g');
        previewResult.innerText = elementValue.replace(regex, replaceVal);
        previewResult.style.color = 'black';
      } catch (e) {
        previewResult.innerText = `Error: ${e.message}`;
        previewResult.style.color = 'red';
      }
    } else {
      previewResult.innerText = '';
    }
  };

  searchInput.addEventListener('input', updatePreview);
  replaceInput.addEventListener('input', updatePreview);

  closeButton.onclick = function () {
    replaceElement.remove();
  };

  replaceButton.onclick = function () {
    typeReplacement(field, previewResult.innerText);
  };
}

function showCalculatedSimilarityAgain() {
  var hints = [];
  similarityInfo.forEach(el => {
    const hint = showSimilarityHint(el.field, el.similarity, 0);
    if (hint) { hints.push(hint); }
  });

  if (window !== window.top) { return; }

  const hideButton = document.createElement('button');
  hideButton.textContent = "Hide similarities";
  hideButton.style.cssText = 'position: fixed; left: 0; bottom: 0; width: 100%; height: 2rem z-index: 999999; text-align: center; background-color: lightyellow;outline: none; border:none; outline: none; height: 75px;';

  document.body.appendChild(hideButton);

  hideButton.addEventListener('click', () => {
    try {
      if (!chrome.runtime.sendMessage) { throw new Error(`chrome.runtime.sendMessage is ${typeof (chrome?.runtime?.sendMessage)}`); }
      chrome.runtime.sendMessage({ action: "hideSimilatityHints" });
    } catch (err) {
      if (err.message === 'Extension context invalidated.') {
        showMessage(`${err.message}. Please reload the page.`, 'error');
      }
      console.log(`>>> ${manifest?.name ?? ''}`, err);
    }
    document.body.removeChild(hideButton);
  });
}

let loaderShowTime = 0;

function showLoader() {
    const id = 'aiFormFillHelperLoader';
    let existingLoader = document.getElementById(id);
    if (existingLoader) { return; }

    loaderShowTime = Date.now();

    const zIntex = getHighestZIndex();
    const loaderStyle = document.createElement('style');
    loaderStyle.id = `${id}Style`;
    loaderStyle.textContent = `
        #${id} {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: ${zIntex};
            cursor: pointer;
        }
        .loader {
            position: relative;
            width: 100px;
            height: 130px;
            background: #fff;
            border-radius: 4px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
        }
        .loader:before {
            content: '';
            position: absolute;
            width: 54px;
            height: 25px;
            left: 50%;
            top: 0;
            background-image:
                radial-gradient(ellipse at center, #0000 24%, #de3500 25%, #de3500 64%, #0000 65%),
                linear-gradient(to bottom, #0000 34%, #de3500 35%);
            background-size: 12px 12px, 100% auto;
            background-repeat: no-repeat;
            background-position: center top;
            transform: translate(-50%, -65%);
            box-shadow: 0 -3px rgba(0, 0, 0, 0.25) inset;
        }
        .loader:after {
            content: '';
            position: absolute;
            left: 50%;
            top: 20%;
            transform: translateX(-50%);
            width: 66%;
            height: 60%;
            background: linear-gradient(to bottom, #f79577 30%, #0000 31%);
            background-size: 100% 16px;
            animation: writeDown 2s ease-out infinite;
        }
        @keyframes writeDown {
            0% { height: 0%; opacity: 0; }
            20% { height: 0%; opacity: 1; }
            80% { height: 65%; opacity: 1; }
            100% { height: 65%; opacity: 0; }
        }
    `;

    const loaderContainer = document.createElement('div');
    loaderContainer.id = id;
    loaderContainer.title = 'Click to dismiss';

    const loader = document.createElement('span');
    loader.classList.add('loader');

    loaderContainer.addEventListener('click', () => {
        hideLoader();
    });

    loaderContainer.appendChild(loaderStyle);
    loaderContainer.appendChild(loader);
    document.body.appendChild(loaderContainer);
}

function hideLoader() {
  try {
    const id = 'aiFormFillHelperLoader';
    const loader = document.getElementById(id);
    loader?.remove();
  } catch (err) {
    console.log(`>>> ${manifest?.name ?? ''} - ${err.message}`, err);
  }
}

function showNotificationRibbon(text, type = 'info'){
    if(!text){  return;  }
    const id = 'aiFormFillHelperTopRibbon';
    let existingRibbon = document.getElementById(id);
    if (existingRibbon) {  existingRibbon.remove();  }

    let colour = getMessageColour(type);
    let timeout = type === 'error' || type === 'e' ? 8000 : 5000;
    let zIntex = getHighestZIndex();
    let ribbon = document.createElement('div');
    ribbon.id = id;
    ribbon.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        z-index: ${zIntex};
        text-align: center;
        padding: 10px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        transition: opacity 1s ease;
        background-color: ${colour};
    `;

    ribbon.innerText = text;
    document.body.appendChild(ribbon);
    ribbon.addEventListener('click', e => e.target.remove());

    setTimeout(() => {
        ribbon.style.opacity = '0';
        setTimeout(() => {
            ribbon.remove();
        }, 1000);
    }, timeout);
}

function getHighestZIndex() {
  let elements = document.getElementsByTagName('*');
  let highestZIndex = 0;
  let highestElement = null;

  for (let i = 0; i < elements.length; i++) {
      let zIndex = window.getComputedStyle(elements[i]).zIndex;
      if (zIndex === 'auto'){  continue;  }
      if(highestZIndex > zIndex) {  continue;  }

      highestZIndex = zIndex;
      highestElement = elements[i];
  }

  let intZIndex = parseInt(highestZIndex, 10);

  console.log({ element: highestElement, zIndex: highestZIndex });
  return isNaN(intZIndex) ? highestZIndex : intZIndex + 10;
}

// ========== Field Functions (migrated from field.js) ==========

function getJSPath(element) {
    if (element.id) {
        return `${element.localName}#${CSS.escape(element.id)}`;
    }

    const path = [];
    let currentElement = element;

    while (currentElement && currentElement !== document.body) {
        let name = currentElement.localName;
        if (!name || name === 'body') {
            break;
        }

        if (currentElement.id) {
            path.unshift(`${name}#${CSS.escape(currentElement.id)}`);
            break;
        }

        const parent = currentElement.parentNode;
        if (parent && parent.children.length > 1) {
            const siblings = Array.from(parent.children).filter(child => child.localName === name);
            if (siblings.length > 1) {
                const index = siblings.indexOf(currentElement);
                path.unshift(`${name}:nth-of-type(${index + 1})`);
            } else {
                path.unshift(name);
            }
        } else {
            path.unshift(name);
        }

        if (name.indexOf('frame') > -1) { break; }
        currentElement = parent;
    }

    return path.join(' > ');
}


function checkAndGetLabel(field) {
    if (!field) { return; }

    let label = field.id ? document.querySelector(`label[for="${CSS.escape(field.id)}"]`) : null;
    if (label) {
        return label.textContent;
    }

    if (field.parentElement && field.parentElement.tagName === 'LABEL') {
        return field?.parentElement?.textContent;
    }

    return field.closest(`label`)?.textContent;
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

function getThisField(field) {
    const attr2ignore = ['style', 'required', 'maxlength', 'aria-required', 'autocomplete',
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

function collectInputFields(doc, callbackAction) {
    if (!doc) {  doc = document;  }
    if(!callbackAction){  callbackAction = 'fieldsCollected';  }
    var inputFields = [];
    let inputs = Array.from(doc.querySelectorAll('input[type="text"], input[type="email"], input[type="number"], input[type="tel"], textarea, [role="textbox"], [contenteditable="true"]'));
    for (let i = 0, l = inputs.length; i < l; i++) {
        if (isVisible(inputs[i]) && !inputs[i].value && !inputs[i].textContent) {
            inputFields.push(getThisField(inputs[i]));
        }
    }

    // CRITICAL: Don't send message if no fields found - skip empty frames
    if (inputFields.length === 0) {
        console.log(`${manifest?.name ?? ''}: No empty fields in this frame - skipping`);
        hideLoader(); // Hide loader in this frame if it was shown
        return;
    }

    try {
        if(!chrome.runtime.sendMessage){  throw new Error(`chrome.runtime.sendMessage is ${typeof(chrome?.runtime?.sendMessage)}`);  }
        chrome.runtime.sendMessage({ action: callbackAction, fields: JSON.stringify(inputFields) });
    } catch (err) {
        if(err.message === 'Extension context invalidated.'){
            showMessage(`${err.message}. Please reload the page.`, 'error');
        }
        console.log(`>>> ${manifest?.name ?? ''}`, err);
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
        try {
            firstHit = document.querySelector(selector);
            if (firstHit) { return firstHit; }
        } catch (e) {
            console.log(`${manifest?.name ?? ''}: Invalid selector - ${e.message}`);
        }
    }

    let combinedSelector = [mainKey];
    for (const [key, value] of Object.entries(elementAttributes)) {
        if (attr2exclude.includes(key)) { continue; }

        combinedSelector.push(`[${key}="${value}"]`);
    }

    firstHit = document.querySelector(combinedSelector.join(''));

    return firstHit;
}

function fillFormWithProposedValues(formValues) {
  if (!Array.isArray(formValues)) { formValues = [formValues]; }
  if (formValues.length < 1) {
    showMessage('No suitable values proposed for this form.', "warn");
    console.warn(`${manifest.name ?? ''}: No suitable values proposed for this form.`);
    return;
  }

  var suggestedValue;
  var topField;
  try {
    for (let i = 0, l = formValues.length; i < l; i++) {
      let elm = formValues[i];
      try {
        suggestedValue = JSON.parse(elm?.data || '{"closest": "unknown", "similarity": -1, "threshold": -1}');
      } catch (err) {
        console.error(`${manifest.name ?? ''}: >>> json parse failed!`, err)
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
        console.log(`${manifest?.name ?? ''}: No element found - skipping this field`);
        continue; // Skip this field, continue with others
      }
      if(i < 1){  topField = toFill;  }

      if (!suggestedValue?.closest || suggestedValue.closest === 'unknown' || suggestedValue.closest.trim() === '') {
        console.log(`${manifest?.name ?? ''}: No suitable value found for field - skipping`);
        continue;
      }

      const threshold = parseFloat(suggestedValue.threshold);
      if (suggestedValue.similarity < threshold) {
        console.log(`${manifest?.name ?? ''}: Similarity ${suggestedValue.similarity} below threshold ${threshold} - skipping`);
        continue;
      }

      if (document.hasFocus() && suggestedValue?.closest && suggestedValue?.closest !== 'unknown' && navigator.clipboard?.writeText) {
        navigator.permissions.query({ name: 'clipboard-write' }).then(result => {
          if (result.state === 'granted' || result.state === 'prompt') {
            return navigator.clipboard.writeText(suggestedValue.closest);
          }
        }).catch(() => {});
      }


      toFill.focus();
      showSimilarityHint(toFill, suggestedValue.similarity);

      if (toFill.hasAttribute('contenteditable') || toFill.getAttribute('role') === 'textbox') {
        toFill.textContent = suggestedValue.closest;
      } else {
        toFill.value = suggestedValue.closest;
      }

      let event = new Event('input', { bubbles: true });
      toFill.dispatchEvent(event);
      toFill.blur();
    }

    topField?.scrollIntoView();
    topField?.focus();
  } catch (err) {
    console.error(`${manifest?.name ?? ''} >>> ${err.message}`, err);
  }
}

function clearAllFields() {
    const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="email"], input[type="number"], input[type="tel"], textarea, [role="textbox"], [contenteditable="true"]'));
    if (inputs.length < 1) { return; }

    inputs.forEach(el => {
        if (el.hasAttribute('contenteditable') || el.getAttribute('role') === 'textbox') {
            el.textContent = '';
        } else {
            el.value = '';
        }
    });
}

function showFieldsMetadata() {
    const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="email"], input[type="number"], input[type="tel"], textarea, [role="textbox"], [contenteditable="true"]'));
    if (inputs.length < 1) {  return;  }

    inputs.forEach(el => showFormFieldHint(el));
    if(window === window.top){
        showMessage('Click any hint to remove them.');
    }
}

function setAutoSimilarityProposalOn(doc, isAuto = false) {
    if (!doc) { doc = document; }
    let inputs = Array.from(doc.querySelectorAll('input[type="text"], input[type="email"], input[type="number"], input[type="tel"], textarea, [role="textbox"], [contenteditable="true"]'));
    if (!inputs) { return; }
    for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i];
        if (isAuto) {
            input.addEventListener('keydown', applyProposal);
            input.addEventListener('focus', handleInputFocusForAutoProposal);
            input.addEventListener('blur', cleanAutoProposal);
        } else {
            input.removeEventListener('keydown', applyProposal);
            input.removeEventListener('focus', handleInputFocusForAutoProposal);
            input.removeEventListener('blur', cleanAutoProposal);
        }
    }
}

function getProposalStyle(){
    const proposalStyle = document.createElement('style');
    proposalStyle.textContent = `
    .proposal-container:hover .icon {
        display: none;
    }

    .proposal-container:not(:hover) .icon {
        display: inline-block;
        width: 100%;
        height: 100%;
        padding: .03rem;
    }

    .proposal-container {
        position: absolute;
        border: 1px solid gray;
        background-color: #fffbcb;
        width: 0px;
        height: 20px;
        overflow: hidden;
        text-align: left;
        padding: .5em;
        z-index: 999999;
        animation: shring-width 0.3s forwards;
        box-sizing: unset;
    }

    .proposal-container:hover{
        animation: expand-width 0.3s forwards;
        overflow: auto
    }

    @keyframes expand-width {
        95% {
            width: 200px;
        }
        100% {
            height: 30px;
            width: max-content;
        }
    }

    @keyframes shring-width {
        from {
            width: 0px;
        }
        100% {
            width: 20px;
            height: 20px;
        }
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
        {id:"flashIcon", class:"icon", title: "Show proposal", text: '⚡'},
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
}

function handleInputFocusForAutoProposal(e) {
    cleanAutoProposal();
    let attr = getThisField(e.target);
    try {
        if(!chrome.runtime.sendMessage){  throw new Error(`chrome.runtime.sendMessage is ${typeof(chrome?.runtime?.sendMessage)}`);  }
        chrome.runtime.sendMessage({ action: 'fillAutoProposal', element: JSON.stringify([attr]) });
    } catch (err) {
        if(err.message === 'Extension context invalidated.'){
            showMessage(`${err.message}. Please reload the page.`, 'error');
        }
        console.log(`>>> ${manifest?.name ?? ''}`, err);
    }
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
    if (!e.ctrlKey || !e.shiftKey) { return; }

    switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowRight':
            applyPasteProposal(e);
            break;
        case 'Enter':
            try {
                if (!chrome.runtime.sendMessage) { throw new Error(`chrome.runtime.sendMessage is ${typeof (chrome?.runtime?.sendMessage)}`); }
                chrome.runtime.sendMessage({ action: 'fillthisform' });
            } catch (err) {
                if (err.message === 'Extension context invalidated.') {
                    showMessage(`${err.message}. Please reload the page.`, 'error');
                }
                console.log(`>>> ${manifest?.name ?? ''}`, err);
            }
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