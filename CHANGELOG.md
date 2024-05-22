# AI Web Form Fill Helper

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<hr>

# Changelog

## [1.7.89] - 2024-05-22 - latest

- Fixed added to handle pages which forms do not adhere strictly to web standards and thus auto fill fails.

## [1.7.85] - 2024-05-15

- A similarity score is provided for each field that has been populated with a proposed value.
- The localhost port can be configured through the options page.
- The Threshold field has been introduced on the options page for filtering out incorrect suggestions. A higher value ensures a stricter matching.
- Refactoring efforts have been made to improve the efficiency of value processing.
- The values listed in the options' Form Fields Values field can now be inserted directly from a contextual menu.
- Calculated similarities are persistent until the next call and can be reviewed again.
- Several issues have been resolved.

<hr>

## [1.5.80] - 2024-05-03

- Reduced the number of API calls
- Fixed context menu disappearing in Firefox after restart
- Added supposrt for nested web forms
- Improved AI embeddings query for better results
- Added support for psudo forms like `<div data-type="form">`
- Versions for Chrome and Firefox synced
