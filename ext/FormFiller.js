class FormFiller extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this.shadowRoot.innerHTML = `
      <style>
        /* Your styles here */
        input { margin: 5px; }
        button { margin: 5px; }
      </style>
      <input type="text" placeholder="Enter data" id="dataInput">
      <button id="fillButton">Fill Form</button>
    `;
  }

  connectedCallback() {
    this.shadowRoot.querySelector('#fillButton').addEventListener('click', () => {
      this.fillForm();
    });
  }

  fillForm() {
    const data = this.shadowRoot.querySelector('#dataInput').value;
    // Implement the logic to fill the form using the retrieved data
    console.log("Data to fill:", data); // This is where you would interact with the form
  }
}

// Define the custom element if it hasn't been defined yet
if (!customElements.get('form-filler')) {
  customElements.define('form-filler', FormFiller);
}

export { FormFiller };
