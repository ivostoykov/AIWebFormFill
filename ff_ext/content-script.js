var _field;

if (document.readyState !== 'loading') {
  console.log('document is already ready, just execute code here');
  setListner();
} else {
  document.addEventListener('DOMContentLoaded', function () {
      console.log('document was not ready, place code here');
      setListner();
  });
}

function setListner() {
  console.log(`${setListner.name} fired. iframes:`, document.querySelectorAll('iframe').length);
  document.addEventListener('contextmenu', function(event) {
    console.log('Right-clicked element in main document:', event.target);
    _field = event.target;
  }, true);
}

browser.runtime.onMessage.addListener(function(request, sender, sendResponse) {

  switch (request.action) {
    case "getFormFields":
      if(!_field){  return;  }

      const oForm = getFormFields(_field);
      if(oForm.length < 1){  return;  }

      sendResponse({formDetails: JSON.stringify(oForm)});
      return true;
    case "getClickedElement":
      if(!_field) {  return false;  }

      let attr = {};
      if(_field.id){  attr['id'] = _field.id;  }
      if(_field.name){  attr['name'] = _field.name;  }
      if(_field.type){  attr['type'] = _field.type;  }

      if(Object.keys(attr).length === 0){
        console.warn('Element does not have needed attributes!');
        return;
      }

      sendResponse({elementDetails: JSON.stringify(attr)});
      return true;
    case "sendProposalValue":
      fillElementWithProposedValue(request.value);
      break;
    case "sentFormValues":
      fillFormWithProposedValues(request.value);
      break;
    case "showFieldsMetadata":
      if (!_field) {  return false;  }

      showFieldsMetadata(_field);
      break;
    case "clearAllFields":
      if (!_field) {  return false;  }

      clearAllFields(_field);
      break;
    case "replaceFieldValue":
      if (!_field) {  return false;  }

      replaceFieldValue(_field);
      break;
    default:
      console.warn('Received unknown action:', request.action);
      return false;
  }
});

function findMatchingElement(elementAttributes) {
  const attr2exclude = ['type', 'class', 'value', 'outerHtml', 'label', 'required', 'pattern'];
  let firstHit = null;

  if('id' in elementAttributes){
    firstHit = document.getElementById(elementAttributes.id);
    if(firstHit){  return firstHit;  }
  }

  let querySelector = [];
  for (const [key, value] of Object.entries(elementAttributes)) {
    if (attr2exclude.includes(key)) continue;

    querySelector.push(`[${key}="${value}"]`);
  }

  firstHit = document.querySelector(querySelector.join(''));

  return firstHit;
}

function fillFormWithProposedValues(formValues){
  if(formValues.length < 1){
    showMessage('No suitable values proposed for this form.', "warn");
    console.warn('No suitable values proposed for this form.');
    return;
  }

  for (let i = 0, l = formValues.length; i < l; i++) {
    let elm = formValues[i];
    const suggestedValue = elm?.data || '';
    if(elm.data){
      delete elm.data;
    }

    const mainKey = Object.keys(elm)[0];
    if(!mainKey){
      console.error('No mainKey found!', elm);
      continue;
    }

    let toFill = findMatchingElement(elm[mainKey])
    if (!toFill) {
      console.warn(`No element found with the specified id or name - ${elm}.`);
      return;
      }

    toFill.focus();
    toFill.value = suggestedValue;
    let event = new Event('input', { bubbles: true });
    toFill.dispatchEvent(event);
    toFill.blur();
  }
}

function fillElementWithProposedValue(value = 'unknown'){
  if (!_field) {
    console.warn("The field is undefined", _field, value);
    return;
  }

  _field.value = value;
}

function getInputFormFields(el){
  const theForm = el?.closest('form') || el?.closest('#form');
  if (!theForm) {
    console.error("No form found to fill", theForm);
    return [];
  }

  const inputs = theForm.querySelectorAll('input[type="text"], input[type="email"], input[type="number"], input[type="tel"]');
  var formFields = [];
  inputs.forEach(function(field) {
    const rect = field.getBoundingClientRect();
    const isVisible = (rect.width > 0 || rect.height > 0) && document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === field;
    if(isVisible) {
      formFields.push(field);
    }
  });

  return formFields;

}

function checkAndGetLabel(field){
  if(!field) { return; }

  let label = field.id ? document.querySelector(`label[for="${field.id}"]`) : null;
  if(label) {
    return label.textContent;
  }

  if(field.parentElement && field.parentElement.tagName === 'LABEL') {
    return field?.parentElement?.textContent;
  }

  return field.closest(`label`)?.textContent;
}

function getFormFields(el){
  const inputs = getInputFormFields(el);
  var formFields = [];
  if(inputs && inputs.length < 1){
    return formFields;
  }

  const attr2ignore = ['style', 'placeholder', 'required'];
  inputs.forEach(function (field) {
    let fieldData = {};
    const tag = field.tagName.toLowerCase();
    fieldData[tag] = {};
    for (let i = 0, l = field.attributes.length; i < l; i++) {
      const attr = field.attributes[i];
      if (attr2ignore.includes(attr.name)) { continue; }
      fieldData[tag][attr.name] = attr.value;
    }

    const label = checkAndGetLabel(field);
    if(label){
      fieldData[tag]['label'] = label;
    }

    if (Object.keys(fieldData[tag]).length > 0) {
      fieldData[tag]['outerHtml'] = field.outerHTML;
      formFields.push(fieldData);
    }
  });

  return formFields;
}

function getPopup(){
  const id = 'formFillHelperPopup';
  var popup = document.getElementById(id);
  if(!popup){
    popup = document.createElement('div');
    popup.id = id;
    popup.style.cssText = 'position:fixed;top:10%;left:50%;width:75%;height:auto;transform:translateX(-50%);padding:10px;border:1px solid gray;zIndex:1000;text-align:center;font-size:1.5rem;font-weight:bold;color:black;transition:opacity 0.5s ease-out;';

    document.body.appendChild(popup);
  }

  return popup;
}

function showMessage(message, type = "info"){
  if(!message){  return;  }

  let color;
  switch (type) {
    case 'error':
    case 'e':
      color = 'red'
      break;
    case 'warning':
    case 'warn':
    case 'w':
      color = 'orange'
      break;
    default:
      color = 'lightgray'
      break;
  }

  var popup = getPopup();

  popup.textContent = message;
  popup.style.background = color;

  setTimeout(() => {
    popup.style.opacity = '0';
  }, 2500);

  setTimeout(() => {
    document.body.removeChild(popup);
  }, 3000);
}

function createFormFieldHintStyle() {
  const id = 'formFillHelperFieldHistStyle';

  var hintStyle = document.getElementById(id);
  if(hintStyle){ return; }

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
  if(!field){
    console.error("Invalid field", field);
    return;
  }

  createFormFieldHintStyle();

  const fieldId = field.id;
  if(!fieldId){  return;  }

  const fieldHintId = `${fieldId}Hint`;
  var hint = document.getElementById(fieldHintId);
  if(!hint){
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
      if(h.parentNode){  h.parentNode.removeChild(h);  }
    })
  });
}

function showFieldsMetadata(field){
  const inputs = getInputFormFields(field);
  if(inputs.length < 1){
    console.error("Either field or form is invalid", field);
    return;
  }

  inputs.forEach(el => showFormFieldHint(el));
  showMessage('Click any hint to remove them.');
}

function clearAllFields(field){
  const inputs = getInputFormFields(field);
  if(inputs.length < 1){
    console.error("Either field or form is invalid", field);
    return;
  }

  inputs.forEach(el => {
    el.value = '';
  });
}

function positionReplaceElementNearField(replaceElement, field) {
  if(!field){
    console.error("Invalid field", field);
    return;
  }

  const rect = field.getBoundingClientRect();
  replaceElement.style.position = 'absolute';
  replaceElement.style.left = `${rect.left + window.scrollX}px`;
  replaceElement.style.top = `${rect.bottom + window.scrollY + 5}px`;
}

function getReplaceElement(field){
  if(!field){
    console.error("Invalid field", field);
    return;
  }

  let replaceElement = document.querySelector('div.js-ai-form-fill-helper');
  if(!replaceElement){
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
  if(!field){
    console.error("Invalid field", field);
    return;
  }

  field.value = '';
  field.focus();
  field.value = text;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function replaceFieldValue(field){
  if(!field){
    console.error("Invalid field", field);
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

  closeButton.onclick = function() {
      replaceElement.remove();
  };

  replaceButton.onclick = function() {
    typeReplacement(field, previewResult.innerText);
  };
}