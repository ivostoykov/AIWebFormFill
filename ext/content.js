const manifest = chrome.runtime.getManifest();
var _field;
var _AiFillTarget = {};
var similarityInfo = [];

if (document.readyState !== 'loading') {
  setListner();
} else {
  document.addEventListener('DOMContentLoaded', function () {
      setListner();
  });
}

function setListner() {
  document.addEventListener('contextmenu', function(event) {
    _field = event.target;
    let attr = getThisField(event.target);
    chrome.runtime.sendMessage({ action: 'storeRightClickedElement', element: JSON.stringify([attr]) });
  }, true);
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if(!request?.action){  return;  }   // Chrome opens context menu on double click and on 1st click there is not information about the target

  switch (request.action) {

    case "replaceFieldValue":
      if (!_field) {  return false;  }

      replaceFieldValue(_field);
      break;

    default:
      console.warn(`${manifest.name ?? ''}: Received unknown action:`, request.action);
      break;
  }
});

function isValidRequestValue(requestValue) {
  return Array.isArray(requestValue) || requestValue instanceof Object ? requestValue : false;
}

function hideSimilatityHints(/* hints */){
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
  similarityInfo.push({"field": field, "similarity": similarity});

  if(duration > 0) {
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

  const icon = document.createElement('img');
  icon.src = chrome.runtime.getURL('img/warning.svg')
  icon.classList.add('dlg-icon');
  popup.appendChild(icon);

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
  okButton.addEventListener('click', () => popup.remove() );
  popup.appendChild(okButton);

  window.top.document.body.appendChild(popup);

  return popup;
}

function showMessage(message, type = "info") {
  if (!message) { return; }

  let color;
  switch (type) {
    case 'success':
    case 's':
      color = '#bcfebc';
      break;
    case 'error':
    case 'e':
      color = '#ffc2c2';
      break;
    case 'warning':
    case 'warn':
    case 'w':
      color = '#fca73e';
      break;
    default:
      color = '#ccc';
      break;
  }

  var popup = getPopup();
  if(!popup){
    setTimeout(() => {showMessage(`${manifest.name}: ${message}`, type)}, 1000);
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

function showCalculatedSimilarityAgain(){
  var hints = [];
  similarityInfo.forEach(el => {
    const hint = showSimilarityHint(el.field, el.similarity, 0);
    if(hint){  hints.push(hint);  }
  });

  if(window !== window.top){  return;  }

  const hideButton = document.createElement('button');
  hideButton.textContent = "Hide similarities";
  hideButton.style.cssText = 'position: fixed; left: 0; bottom: 0; width: 100%; height: 2rem z-index: 999999; text-align: center; background-color: lightyellow;outline: none; border:none; outline: none; height: 75px;';

  document.body.appendChild(hideButton);

  hideButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "hideSimilatityHints" });
    document.body.removeChild(hideButton);
  });
}