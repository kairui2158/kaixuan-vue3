# CSS Regression Report (P16)

## Summary

| Metric | Old | New | Matched | Missing |
|--------|-----|-----|---------|---------|
| CSS Variables | 148 | 254 | 148 | 0 |
| Selectors | 1612 | 357 | 137 | 1475 |
| CSS Lines | 7489 | 2280 | - | - |

Match rate: 8.5%

New CSS files: global.css, modal.css, tokens.css

## Missing Selectors (1475)

- /* Opacity scale */

  /* Standardized transforms */

  /* Extended easing functions */

  /* Extended transition presets */

  /* Button sizing system */

  /* Form control sizing */

  /* Focus ring */


  /* === Design Token System V2 === */
:root
- /* === TopBar === */

.app-title
- /* === Sidebar === */




/* === Messages === */
/* #messages-container merged to L286 */
/* #messages-container merged to L286 */
/* #messages-container merged to L286 */
/* #messages-container merged to L286 */
/* #messages-container merged to L286 */
/* #messages-container merged to L286 */

#messages-list
- /* === Message Bubbles === */

@keyframes fadeIn
- /* === Streaming Cursor === */
@keyframes blink
- /* === Loading Animation === */
@keyframes dotPulse
- /* === Input Area === */


#user-input
- #user-input::placeholder
- #user-input:focus
- /* Skill Area */
.skill-area
- .skill-area-header
- .skill-area-content
- /* === Modal === */
/* @keyframes wh-modal-in L464-467 removed: L464 earlier
- overridden by L1120 */








.password-row
- .password-row input
- /* === Scrollbar === */

/* Settings Tabs */

/* Section Headers */
.section-header
- /* Item Lists */
.item-list
- .item-row
- .item-row:hover
- .item-info
- .item-name
- .item-meta
- .item-actions
- /* Variable Details */
.var-details
- .var-details summary
- .var-tags
- /* Checkbox Lists */
.checkbox-list
- .checkbox-list label
- /* Buttons & Layout */
.full-width
- /* Three-Panel Layout */

/* Chapter Tree */
/* removed: dead .tree-actions button:hover (R40 dedup) */

/* Editor Panel */
#editor-content:disabled
- #editor-content:focus
- /* Chat Panel === */
#messages-container
- /* === Outline Workspace === */
/* Resize handle for outline workspace */
.ow-main
- .ow-editor
- .ow-editor-header .word-count
- #outline-editor
- .ow-sidebar
- /* #ow-chat-area merged to L628 */
/* #ow-chat-messages merged to L633 */
#ow-skill-suggestions
- #ow-skill-suggestions .skill-suggestion
- #ow-bound-list
- #ow-bound-list .bound-item
- .ow-footer
- /* Settings Collection Panel */
.sc-main
- /* .sc-main merged above */
.sc-header
- .sc-header h3
- .sc-body
- .sc-categories
- .sc-cat-btn
- .sc-cat-btn:hover
- .sc-cat-btn.active
- .sc-cat-add
- .sc-items-area
- .sc-detail-area
- .sc-detail-area.visible
- .sc-detail-header
- .sc-detail-header span
- .sc-detail-content
- .sc-detail-name
- .sc-detail-section
- .sc-detail-section-title
- .sc-detail-section-body
- .sc-detail-attrs
- .sc-detail-attr
- .sc-detail-attr > span:last-child
- .sc-detail-attrs .sc-detail-attr
- .sc-detail-attr-key
- .sc-detail-actions
- .sc-items-header
- .sc-items-header span
- #sc-items-list
- .sc-item
- .sc-item-header
- .sc-item-name
- .sc-item-actions
- .sc-item-attrs
- /* .sc-item-attrs merged above */
.sc-item-attr
- .sc-item-attr-key
- .sc-attr-row
- .sc-attr-row input
- .sc-item-bind-summary
- /* Pipeline Panel */
.pl-main
- .pl-header h3
- .pl-body
- .pl-body > .pl-content
- .pl-steps
- /* .pl-step merged to L582 */
.pl-step.active
- .pl-step.completed
- .pl-step-label
- /* .pl-step-status merged to L705 */
.pl-content
- /* pl-step-content visibility handled by JS _plShowStep */
.pl-step-content .pl-desc
- .pl-result
- .pl-gen-options
- .pl-checkboxes
- .pl-checkboxes label
- /* Memory Panel */
.mem-main
- .mem-header h3
- .mem-body
- .mem-sidebar
- .mem-cat-list
- .mem-cat-btn

## Extra New Selectors (220)

- /* Global shared styles - supplement to tokens.css */

/* Scrollbar styles */
::-webkit-scrollbar
- /* Text selection */
::selection
- /* Focus outline */
*:focus
- /* Input reset */
input
- button
- input
- /* Transition utilities */
.fade-enter-active
- .fade-leave-active
- .fade-enter-from
- .fade-leave-to
- .slide-enter-active
- .slide-leave-active
- .slide-enter-from
- .slide-leave-to
- /* Common button styles */
.btn-primary
- .btn-primary:hover
- .btn-secondary:hover
- .btn-danger
- /* Card hover effect */
.card-hover
- .card-hover:hover
- /* Empty state */
.empty-state
- /* Tooltip */
[data-tooltip]
- /* === Migrated from old global.css backup === */

/* Scrollbar styles */
::-webkit-scrollbar
- .btn-primary:active
- .btn-secondary:active
- .btn-danger:hover
- .btn-danger:active
- .btn-danger:focus-visible
- .btn-danger:disabled
- .btn-icon:hover
