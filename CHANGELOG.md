# AI Web Form Fill Helper

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<hr>

# Changelog

## [1.29.15] - 2026-03-17 - latest

### Changed
- **Major UI improvement**: Replaced floating tooltip suggestions with placeholder-based suggestions
  - Suggestions now appear directly in the field's placeholder text
  - Apply suggestions by pressing Enter or Tab
  - No more positioning issues or iframe visibility problems
  - Cleaner, more native user experience

### Added
- Context menu toggle for auto-suggestions (on/off)
- Smart positioning logic for future tooltip features (supports right, left, above, below, and overlay positions)
- Styled placeholder suggestions (bold, blue, italic) for better visibility
- Extracted CSS to separate file (src/css/content.css) for better maintainability

### Fixed
- Fixed settings preservation when toggling auto-suggestions after service worker restart
- Fixed content script state synchronisation for auto-suggestions toggle
- Fixed Tab key behaviour for inputs outside form elements
- Fixed auto-suggestions to only target standard input elements (removed contenteditable and ARIA textbox support)
- Empty suggestions no longer shown when no matching value exists

### Removed
- Removed obsolete Ctrl+Shift+Left/Right Arrow keyboard shortcuts
- Removed floating proposal tooltip implementation
- Removed dynamic style element creation (now uses static CSS file)

## [1.29.10] - 2026-03-17

- Added export functionality for dataset entries
- Added import functionality for dataset entries
- Fixed minor issues in import process

## [1.28.83] - 2026-03-10

- replaced modal dialog with non-blocking ribbon
- Fixed initialization race in data-dependent context menu
- Feedback improved - success messages only shown when fields are actually filled
- Simplified context menu
- Eliminated unnecessary menu rebuilds
- Menu now rebuilds only when dataset entries change
- Added clipboard feedback for empty proposal scenarios
- Added 23 integration tests
- Expanded test coverage to 49 tests total (26 utils + 23 integration)

## [1.28.80] - 2026-03-09

- Fixed IPv6 localhost detection (::1) to prevent false security warnings
- Fixed embedding cache invalidation when provider/model changes via options page
- Fixed stale backend selection after changing provider/model in options
- Added security warnings for non-local/insecure embedding endpoints
- Updated documentation to accurately describe sync storage behaviour
- Refactored metadata collection to on-demand only (no longer automatic on right-click)
- Separated clipboard operations into explicit context menu commands
- Added CSS.escape() to prevent selector breakage with special characters
- Added comprehensive testing infrastructure with 26 unit tests

## [1.28.70] - 2025-02-16

- Refactored to sendMessage architecture and removed executeScript calls
- Added support for custom textbox components
- Fixed selector generation for IDs starting with numbers
- Implemented frame-based form filling with targeted message passing
- Added placeholder attribute to field detection for better AI matching
- Code cleanup: removed dead code, fixed typos, added missing awaits

## [1.17.17] - 2025-03-20

- Minor bug fixed

## [1.17.17] - 2024-07-10

- Allow to add more than one API and manage the list.
- If Ollama is selected as API provider, a list of the available models is populated.
- Models and providers added to the context menu for an easy temporary switch.

## [1.15.65] - 2024-06-23

- Fixed minor bugs in forms.
- Enabled real-time updates for options.
- Added extended embeddings endpoint API for containered and external use (if required).
- Updated help section to reflect new features.
- Streamlined direct entry pasting process.

## [1.15.27] - 2024-06-12

- Added short help in the add-on options page.
- Added a checkbox allowing calculations to be made when the page loads.
- If startup calculation is enabled, a proposal is shown when a suitable element receives focus.
- Proposal will be hidden upon focus loss.
- Added shortcut (Ctrl+Shift+Left Arrow OR Ctrl+Shift+Right Arrow) to accept the proposal (meaning to fill the element with the proposed value).
- Added shortcut (Ctrl+Shift+Enter) to fill all suitable elements with their proposal values.


## [1.12.00] - 2024-06-05

- refactored finding out the field candidate for auto fill
- refactored communication with the Embedding and calculation of the similarity
- refactored populated suggested values in the matching fields
- added messaging interface to present some additional information to the user
- removed search and replace functionality
- added UI messaging for user's convinience

## [1.7.89] - 2024-05-22

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
