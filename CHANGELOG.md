# AI Web Form Fill Helper

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<hr>

# Changelog

## [1.7.20] - 2024-05-14 - latest

- Similarity how is displayed for each field filled out
- Localhost port now is available in the options page
- A Threshold field is added in the options page. The value is intended to be used as a filter to avoid wrong suggestions
- Some refactoring work was done in attempt to optimise the process of the values
- The values provided in the option's `Form Fields Values` field are now availabel as a context menu for direct insert.
- Some bugs were fixed.

<hr>

## [1.5.80] - 2024-05-03

- Reduced the number of API calls
- Fixed context menu disappearing in Firefox after restart
- Added supposrt for nested web forms
- Improved AI embeddings query for better results
- Added support for psudo forms like `<div data-type="form">`
- Versions for Chrome and Firefox synced