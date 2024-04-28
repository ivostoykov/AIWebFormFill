document.addEventListener('contextmenu', function(event) {
    field = event.target;
}, true);

browser.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  switch (request.action) {
    case "getFormFields":
      const oForm = getFormFields(field);
      sendResponse({formDetails: JSON.stringify(oForm)});
      return true;
    case "getClickedElement":
      let attr = {id: field.id, name: field.name, type: field.type}.filter(attr => field[attr]);
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
      showFieldsMetadata(field);
      break;
    case "clearAllFields":
      clearAllFields(field);
      break;
    case "replaceFieldValue":
      replaceFieldValue(field);
      break;
    default:
      console.warn('Received unknown action:', request.action);
      return false;
  }
});

function fillFormWithProposedValues(formValues){
  const formElements = Object.keys(formValues);

  if(formElements.length < 1){
    showMessage('No suitable values proposed for this form.', "warn");
    console.warn('No suitable values proposed for this form.');
    return;
  }

  formElements.forEach(id => {
    let toFill = document.getElementById(id) || document.getElementsByName(id)[0];
    if(!toFill){
      console.warn(`No element found with the specified id or name - ${id}.`);
      return;
    }

    toFill.focus();
    toFill.value = formValues[id] || '';
    toFill.blur();
  });
}

function fillElementWithProposedValue(value = 'unknown'){
  try {
    field.value = value;
  } catch (error) {
    console.error(error);
  }
}

function getInputFormFields(el){
  const theForm = el.closest('form');
  const inputs = theForm.querySelectorAll('input[type="text"], input[type="email"], input[type="number"], input[type="tel"]');
  var formFields = [];
  inputs.forEach(function(field, index) {
    const rect = field.getBoundingClientRect();
    const isVisible = (rect.width > 0 || rect.height > 0) && document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === field;
    if(isVisible) {
      formFields.push(field);
    }
  });

  return formFields;

}

function getFormFields(el){
  const inputs = getInputFormFields(el);
  var formFields = [];
  inputs.forEach(function(field, index) {
    // const rect = field.getBoundingClientRect();
    // const isVisible = (rect.width > 0 || rect.height > 0) && document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === field;
    // if(!isVisible) {  return;  }
    let attr = {};
    if(field.id){  attr['id'] = field.id;  }
    if(field.name){  attr['name'] = field.name;  }
    if(Object.keys(attr).length > 0){
      formFields.push(attr);
    }
  });

  return formFields;
}

function showMessage(message, type = "info"){
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
  const id = 'formFillHelperPopup';
  var popup = document.getElementById(id);
  if(!popup){
    popup = document.createElement('div');
    popup.id = id;
    popup.style.position = 'fixed';
    popup.style.top = '10%';
    popup.style.left = '50%';
    popup.style.width = '75%';
    popup.style.height = 'auto';
    popup.style.transform = 'translateX(-50%)';
    popup.style.padding = '10px';
    popup.style.border = '1px solid gray';
    popup.style.zIndex = '1000';
    popup.style.textAlign = 'center';
    popup.style.fontSize = '1.5rem';
    popup.style.fontWeight = 'bold';
    popup.style.color = 'black';
    popup.style.transition = 'opacity 0.5s ease-out';

    document.body.appendChild(popup);
  }

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
      }
  `;

  document.head.appendChild(hintStyle);
}

function showFormFieldHint(field) {
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
  inputs.forEach(el => showFormFieldHint(el));
  showMessage('Click any hint to remove them.');
}

function clearAllFields(field){
  const inputs = getInputFormFields(field);
  inputs.forEach(el => {
    el.value = '';
  });
}

function positionReplaceElementNearField(replaceElement, field) {
  const rect = field.getBoundingClientRect();
  replaceElement.style.position = 'absolute';
  replaceElement.style.left = `${rect.left + window.scrollX}px`;
  replaceElement.style.top = `${rect.bottom + window.scrollY + 5}px`;
}

function getReplaceElement(field){
  let replaceElement = document.querySelector('div.js-ai-form-fill-helper');
  if(!replaceElement){
    replaceElement = document.createElement('div');
    replaceElement.className = 'js-ai-form-fill-helper';
    replaceElement.style.cssText = "position: fixed; bottom: 20px; right: 20px; padding: 10px; background: white; border: 1px solid black; z-index: 1000; border: 1px solid gray; height: fit-content; width: fit-content;";
    replaceElement.innerHTML = `
        <input type="text" id="searchText" placeholder="Search text">
        <input type="text" id="replaceText" placeholder="Replace text">
        <div id="previewResult" style="padding: 15px; margin: 7px 0; background: #f0f0f0;"></div>
        <button id="replaceButton">⚙️</button>
        <button id="closeButton">✖️</button>
    `;
    document.body.appendChild(replaceElement);
  }

  positionReplaceElementNearField(replaceElement, field);
  return replaceElement
}

function typeReplacement(field, text) {
  field.value = '';
  field.focus();
  field.value = text;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function replaceFieldValue(field){
  const replaceElement = getReplaceElement(field);

  const searchInput = replaceElement.querySelector('#searchText');
  const replaceInput = replaceElement.querySelector('#replaceText');
  const replaceButton = replaceElement.querySelector('#replaceButton');
  const closeButton = replaceElement.querySelector('#closeButton');

  searchInput.value = field.value;
  const updatePreview = () => {
    const searchVal = searchInput.value;
    const replaceVal = replaceInput.value;
    const elementValue = field.value;

    if (searchVal) {
      try {
        const regex = new RegExp(searchVal, 'g');
        previewResult.innerText = elementValue.replace(regex, replaceVal);
        previewResult.style.color = 'black'; // Default text color
      } catch (e) {
          previewResult.innerText = `Error: ${e.message}`;
          previewResult.style.color = 'red'; // Error text color
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
      // field.value = previewResult.innerText;
  };
}