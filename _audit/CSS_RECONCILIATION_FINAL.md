# CSS RECONCILIATION FINAL

> Generated: 2026-08-10T05:09:19.838Z

## Summary

| Metric | Old | New(before) | New(after) | Missing(after) | Status |
|--------|-----|-------------|------------|----------------|--------|
| Variables | 254 | 149 | 254 | 0 | FIXED |
| Selectors | 1605 | 883 | 2088 | 4(false-positive) | FIXED |
| Media Queries | 15 | 5 | 15 | 0 | FIXED |
| Keyframes | 41 | 30 | 40 | 1(false-positive) | FIXED |

## Notes

- 4 missing selectors are scanner false-positives (already exist in global.css)
- 1 missing keyframe (toastSlide) is a comment reference, not an actual definition

## Variables Fixed

| # | Variable | Target | Method | Status |
|---|----------|--------|--------|--------|
| 1 | --shadow-accent-md | tokens.css | insert_before_root_close | FIXED |
| 2 | --shadow-focus-accent | tokens.css | insert_before_root_close | FIXED |
| 3 | --shadow-focus-danger | tokens.css | insert_before_root_close | FIXED |
| 4 | --blur-md | tokens.css | insert_before_root_close | FIXED |
| 5 | --blur-lg | tokens.css | insert_before_root_close | FIXED |
| 6 | --blur-xl | tokens.css | insert_before_root_close | FIXED |
| 7 | --backdrop-blur-sm | tokens.css | insert_before_root_close | FIXED |
| 8 | --backdrop-blur-md | tokens.css | insert_before_root_close | FIXED |
| 9 | --backdrop-blur-lg | tokens.css | insert_before_root_close | FIXED |
| 10 | --backdrop-saturate | tokens.css | insert_before_root_close | FIXED |
| 11 | --opacity-disabled | tokens.css | insert_before_root_close | FIXED |
| 12 | --opacity-overlay | tokens.css | insert_before_root_close | FIXED |
| 13 | --opacity-overlay-strong | tokens.css | insert_before_root_close | FIXED |
| 14 | --opacity-placeholder | tokens.css | insert_before_root_close | FIXED |
| 15 | --opacity-50 | tokens.css | insert_before_root_close | FIXED |
| 16 | --ease-out | tokens.css | insert_before_root_close | FIXED |
| 17 | --ease-in-out | tokens.css | insert_before_root_close | FIXED |
| 18 | --ease-spring | tokens.css | insert_before_root_close | FIXED |
| 19 | --ease-expo | tokens.css | insert_before_root_close | FIXED |
| 20 | --hover-lift | tokens.css | insert_before_root_close | FIXED |
| 21 | --hover-lift-md | tokens.css | insert_before_root_close | FIXED |
| 22 | --hover-press | tokens.css | insert_before_root_close | FIXED |
| 23 | --hover-press-sm | tokens.css | insert_before_root_close | FIXED |
| 24 | --btn-lg-height | tokens.css | insert_before_root_close | FIXED |
| 25 | --btn-sm-padding | tokens.css | insert_before_root_close | FIXED |
| 26 | --btn-md-padding | tokens.css | insert_before_root_close | FIXED |
| 27 | --btn-lg-padding | tokens.css | insert_before_root_close | FIXED |
| 28 | --panel-header-padding | tokens.css | insert_before_root_close | FIXED |
| 29 | --panel-body-padding | tokens.css | insert_before_root_close | FIXED |
| 30 | --modal-tab-padding | tokens.css | insert_before_root_close | FIXED |
| 31 | --success-active | tokens.css | insert_before_root_close | FIXED |
| 32 | --user-bubble-gradient | tokens.css | insert_before_root_close | FIXED |
| 33 | --card-width | tokens.css | insert_before_root_close | FIXED |
| 34 | --card-min-width | tokens.css | insert_before_root_close | FIXED |
| 35 | --card-max-width | tokens.css | insert_before_root_close | FIXED |
| 36 | --card-padding-sm | tokens.css | insert_before_root_close | FIXED |
| 37 | --card-padding-lg | tokens.css | insert_before_root_close | FIXED |
| 38 | --card-shadow | tokens.css | insert_before_root_close | FIXED |
| 39 | --card-shadow-hover | tokens.css | insert_before_root_close | FIXED |
| 40 | --card-font-size-sm | tokens.css | insert_before_root_close | FIXED |
| 41 | --card-font-weight | tokens.css | insert_before_root_close | FIXED |
| 42 | --card-line-height | tokens.css | insert_before_root_close | FIXED |
| 43 | --modal-width-sm | tokens.css | insert_before_root_close | FIXED |
| 44 | --modal-width | tokens.css | insert_before_root_close | FIXED |
| 45 | --modal-width-lg | tokens.css | insert_before_root_close | FIXED |
| 46 | --modal-width-xl | tokens.css | insert_before_root_close | FIXED |
| 47 | --modal-radius | tokens.css | insert_before_root_close | FIXED |
| 48 | --modal-padding | tokens.css | insert_before_root_close | FIXED |
| 49 | --modal-header-padding | tokens.css | insert_before_root_close | FIXED |
| 50 | --modal-footer-padding | tokens.css | insert_before_root_close | FIXED |
| 51 | --modal-overlay-bg | tokens.css | insert_before_root_close | FIXED |
| 52 | --modal-bg | tokens.css | insert_before_root_close | FIXED |
| 53 | --modal-shadow | tokens.css | insert_before_root_close | FIXED |
| 54 | --modal-anim-in | tokens.css | insert_before_root_close | FIXED |
| 55 | --modal-anim-scale | tokens.css | insert_before_root_close | FIXED |
| 56 | --modal-anim-scale-in | tokens.css | insert_before_root_close | FIXED |
| 57 | --panel-width | tokens.css | insert_before_root_close | FIXED |
| 58 | --panel-width-sm | tokens.css | insert_before_root_close | FIXED |
| 59 | --panel-width-lg | tokens.css | insert_before_root_close | FIXED |
| 60 | --panel-radius | tokens.css | insert_before_root_close | FIXED |
| 61 | --panel-padding | tokens.css | insert_before_root_close | FIXED |
| 62 | --panel-header-height | tokens.css | insert_before_root_close | FIXED |
| 63 | --panel-bg | tokens.css | insert_before_root_close | FIXED |
| 64 | --btn-radius | tokens.css | insert_before_root_close | FIXED |
| 65 | --btn-gap-sm | tokens.css | insert_before_root_close | FIXED |
| 66 | --btn-gap-lg | tokens.css | insert_before_root_close | FIXED |
| 67 | --btn-font-size-xs | tokens.css | insert_before_root_close | FIXED |
| 68 | --btn-font-size-sm | tokens.css | insert_before_root_close | FIXED |
| 69 | --btn-font-size-md | tokens.css | insert_before_root_close | FIXED |
| 70 | --btn-font-size-lg | tokens.css | insert_before_root_close | FIXED |
| 71 | --btn-transition | tokens.css | insert_before_root_close | FIXED |
| 72 | --space-0 | tokens.css | insert_before_root_close | FIXED |
| 73 | --space-7 | tokens.css | insert_before_root_close | FIXED |
| 74 | --fw-normal | tokens.css | insert_before_root_close | FIXED |
| 75 | --opacity-0 | tokens.css | insert_before_root_close | FIXED |
| 76 | --opacity-30 | tokens.css | insert_before_root_close | FIXED |
| 77 | --opacity-70 | tokens.css | insert_before_root_close | FIXED |
| 78 | --opacity-100 | tokens.css | insert_before_root_close | FIXED |
| 79 | --tf-lift | tokens.css | insert_before_root_close | FIXED |
| 80 | --btn-icon-size | tokens.css | insert_before_root_close | FIXED |
| 81 | --focus-ring | tokens.css | insert_before_root_close | FIXED |
| 82 | --cursor-pointer | tokens.css | insert_before_root_close | FIXED |
| 83 | --cursor-default | tokens.css | insert_before_root_close | FIXED |
| 84 | --cursor-grab | tokens.css | insert_before_root_close | FIXED |
| 85 | --cursor-grabbing | tokens.css | insert_before_root_close | FIXED |
| 86 | --cursor-text | tokens.css | insert_before_root_close | FIXED |
| 87 | --cursor-not-allowed | tokens.css | insert_before_root_close | FIXED |
| 88 | --cursor-help | tokens.css | insert_before_root_close | FIXED |
| 89 | --cursor-move | tokens.css | insert_before_root_close | FIXED |
| 90 | --font-smoothing | tokens.css | insert_before_root_close | FIXED |
| 91 | --font-smoothing-moz | tokens.css | insert_before_root_close | FIXED |
| 92 | --text-rendering | tokens.css | insert_before_root_close | FIXED |
| 93 | --user-select-none | tokens.css | insert_before_root_close | FIXED |
| 94 | --user-select-text | tokens.css | insert_before_root_close | FIXED |
| 95 | --user-select-all | tokens.css | insert_before_root_close | FIXED |
| 96 | --grad-surface | tokens.css | insert_before_root_close | FIXED |
| 97 | --grad-elevated | tokens.css | insert_before_root_close | FIXED |
| 98 | --grad-accent-subtle | tokens.css | insert_before_root_close | FIXED |
| 99 | --grad-success | tokens.css | insert_before_root_close | FIXED |
| 100 | --grad-danger | tokens.css | insert_before_root_close | FIXED |
| 101 | --z-sticky | tokens.css | insert_before_root_close | FIXED |
| 102 | --z-sticky-header | tokens.css | insert_before_root_close | FIXED |
| 103 | --z-drawer | tokens.css | insert_before_root_close | FIXED |
| 104 | --z-modal-high | tokens.css | insert_before_root_close | FIXED |
| 105 | --focus-ring-offset | tokens.css | insert_before_root_close | FIXED |

## Keyframes Fixed

| # | Keyframe | Target | Method | Status |
|---|----------|--------|--------|--------|
| 1 | bubbleIn | global.css | extract_from_old_append | FIXED |
| 2 | modal-in | global.css | extract_from_old_append | FIXED |
| 3 | slideIn | global.css | extract_from_old_append | FIXED |
| 4 | wh-fade-in | global.css | extract_from_old_append | FIXED |
| 5 | wh-modal-in | global.css | extract_from_old_append | FIXED |
| 6 | wh-modal-out | global.css | extract_from_old_append | FIXED |
| 7 | wh-panel-slide-in | global.css | extract_from_old_append | FIXED |
| 8 | wh-spin | global.css | extract_from_old_append | FIXED |
| 9 | wh-toast-slide-in | global.css | extract_from_old_append | FIXED |
| 10 | wh-toast-slide-out | global.css | extract_from_old_append | FIXED |

## Media Queries Fixed

| # | Condition | Target | Method | Status |
|---|-----------|--------|--------|--------|
| 1 | (max-width: 1023px) | global.css | append_end | FIXED |
| 2 | (max-width: 1024px) | global.css | append_end | FIXED |
| 3 | (max-width: 1280px) | global.css | append_end | FIXED |
| 4 | (max-width: 599px) | global.css | append_end | FIXED |
| 5 | (max-width: 600px) | global.css | append_end | FIXED |
| 6 | (min-width: 1280px) and (max-width: 1599px) | global.css | append_end | FIXED |
| 7 | (min-width: 1280px) and (max-width: 1599px) | global.css | append_end | FIXED |
| 8 | (min-width: 1024px) and (max-width: 1279px) | global.css | append_end | FIXED |
| 9 | (min-width: 800px) and (max-width: 1023px) | global.css | append_end | FIXED |
| 10 | (max-width: 799px) | global.css | append_end | FIXED |
| 11 | (min-width: 2560px) | global.css | append_end | FIXED |
| 12 | (min-width: 1600px) | global.css | append_end | FIXED |
| 13 | (min-width: 1920px) | global.css | append_end | FIXED |
| 14 | (min-width: 1920px) | global.css | append_end | FIXED |
| 15 | (min-width: 1280px) and (max-width: 1599px) | global.css | append_end | FIXED |
| 16 | (min-width: 1024px) and (max-width: 1279px) | global.css | append_end | FIXED |
| 17 | (min-width: 800px) and (max-width: 1023px) | global.css | append_end | FIXED |
| 18 | (max-width: 799px) | global.css | append_end | FIXED |
| 19 | (min-width: 2560px) | global.css | append_end | FIXED |
| 20 | (min-width: 1920px) | global.css | append_end | FIXED |
| 21 | (min-width: 2560px) | global.css | append_end | FIXED |
| 22 | (min-width: 2560px) | global.css | append_end | FIXED |
| 23 | (prefers-contrast: high) | global.css | append_end | FIXED |

## Selectors Fixed

| # | Selector | Target | Method | Status |
|---|----------|--------|--------|--------|
| 1 | #agent-form | global.css | extract_from_old | FIXED |
| 2 | #agent-form .form-actions | global.css | extract_from_old | FIXED |
| 3 | #agent-form .form-actions button | global.css | extract_from_old | FIXED |
| 4 | #agent-form .form-group | global.css | extract_from_old | FIXED |
| 5 | #agent-form h4 | global.css | extract_from_old | FIXED |
| 6 | #agent-form input[type="number"] | global.css | extract_from_old | FIXED |
| 7 | #agent-form input[type="range"] | global.css | extract_from_old | FIXED |
| 8 | #agent-form input[type="range"]::-webkit-slider-thumb | global.css | extract_from_old | FIXED |
| 9 | #agent-form input[type="range"]::-webkit-slider-thumb:hover | global.css | extract_from_old | FIXED |
| 10 | #agent-form label | global.css | extract_from_old | FIXED |
| 11 | #agent-form textarea | global.css | extract_from_old | FIXED |
| 12 | #agent-info-bar | global.css | extract_from_old | FIXED |
| 13 | #agent-list .agent-card | global.css | extract_from_old | FIXED |
| 14 | #agent-list .agent-card:hover | global.css | extract_from_old | FIXED |
| 15 | #agent-test-modal #atm-result | global.css | extract_from_old | FIXED |
| 16 | #agent-test-modal .btn-close | global.css | extract_from_old | FIXED |
| 17 | #agent-test-modal .btn-close:hover | global.css | extract_from_old | FIXED |
| 18 | #agent-test-modal .modal-content | global.css | extract_from_old | FIXED |
| 19 | #agent-test-modal .modal-header | global.css | extract_from_old | FIXED |
| 20 | #agent-test-modal h4 | global.css | extract_from_old | FIXED |
| 21 | #app-header | global.css | extract_from_old | FIXED |
| 22 | #app-main | global.css | extract_from_old | FIXED |
| 23 | #app-sidebar | global.css | extract_from_old | FIXED |
| 24 | #app-sidebar button | global.css | manual_extract | FIXED |
| 25 | #app-sidebar button) | global.css | manual_extract | FIXED |
| 26 | #app-sidebar button) svg | global.css | manual_extract | FIXED |
| 27 | #app-sidebar button).active | global.css | manual_extract | FIXED |
| 28 | #app-sidebar button).active::before | global.css | manual_extract | FIXED |
| 29 | #app-sidebar button):hover | global.css | manual_extract | FIXED |
| 30 | #breadcrumb-bar | global.css | extract_from_old | FIXED |
| 31 | #btn-add-item | global.css | extract_from_old | FIXED |
| 32 | #btn-add-mem | global.css | extract_from_old | FIXED |
| 33 | #btn-add-mem-cat | global.css | extract_from_old | FIXED |
| 34 | #btn-ai-gen-item | global.css | extract_from_old | FIXED |
| 35 | #btn-batch-review | global.css | extract_from_old | FIXED |
| 36 | #btn-export-epub | global.css | manual_extract | FIXED |
| 37 | #btn-export-md | global.css | extract_from_old | FIXED |
| 38 | #btn-export-outline-md | global.css | extract_from_old | FIXED |
| 39 | #btn-export-outline-txt | global.css | manual_extract | FIXED |
| 40 | #btn-export-txt | global.css | manual_extract | FIXED |
| 41 | #btn-lock-outline | global.css | extract_from_old | FIXED |
| 42 | #btn-lock-outline:hover | global.css | extract_from_old | FIXED |
| 43 | #btn-open-project | global.css | manual_extract | FIXED |
| 44 | #btn-open-project:hover | global.css | manual_extract | FIXED |
| 45 | #btn-redo | global.css | manual_extract | FIXED |
| 46 | #btn-revise | global.css | manual_extract | FIXED |
| 47 | #btn-timeline | global.css | extract_from_old | FIXED |
| 48 | #btn-toggle-key | global.css | extract_from_old | FIXED |
| 49 | #btn-tree-gen | global.css | extract_from_old | FIXED |
| 50 | #btn-tree-gen:hover | global.css | extract_from_old | FIXED |
| 51 | #btn-undo | global.css | extract_from_old | FIXED |
| 52 | #chat-context-bar | global.css | extract_from_old | FIXED |
| 53 | #chat-context-bar:empty | global.css | extract_from_old | FIXED |
| 54 | #chat-panel | global.css | extract_from_old | FIXED |
| 55 | #ctx-menu | global.css | manual_extract | FIXED |
| 56 | #current-project-name | global.css | extract_from_old | FIXED |
| 57 | #deai-progress-percent | global.css | extract_from_old | FIXED |
| 58 | #deai-progress-step | global.css | extract_from_old | FIXED |
| 59 | #deai-split-size-group | global.css | extract_from_old | FIXED |
| 60 | #deai-split-size-group input | global.css | extract_from_old | FIXED |
| 61 | #diff-modal .modal-content | global.css | manual_extract | FIXED |
| 62 | #editor-content ::selection | global.css | extract_from_old | FIXED |
| 63 | #editor-content h1 | global.css | extract_from_old | FIXED |
| 64 | #editor-content h2 | global.css | extract_from_old | FIXED |
| 65 | #editor-content h3 | global.css | extract_from_old | FIXED |
| 66 | #editor-content p | global.css | extract_from_old | FIXED |
| 67 | #editor-title | global.css | extract_from_old | FIXED |
| 68 | #find-replace-bar | global.css | extract_from_old | FIXED |
| 69 | #find-replace-bar button | global.css | extract_from_old | FIXED |
| 70 | #find-replace-bar button:hover | global.css | extract_from_old | FIXED |
| 71 | #find-replace-bar input[type="text"] | global.css | extract_from_old | FIXED |
| 72 | #find-replace-bar.visible | global.css | extract_from_old | FIXED |
| 73 | #inline-menu | global.css | extract_from_old | FIXED |
| 74 | #inline-menu .inline-menu-sep | global.css | extract_from_old | FIXED |
| 75 | #inline-menu.visible | global.css | extract_from_old | FIXED |
| 76 | #loading-indicator | global.css | extract_from_old | FIXED |
| 77 | #loading-indicator .loading-content | global.css | extract_from_old | FIXED |
| 78 | #loading-indicator.active | global.css | extract_from_old | FIXED |
| 79 | #memory-panel | global.css | extract_from_old | FIXED |
| 80 | #memory-panel.mem-hidden | global.css | extract_from_old | FIXED |
| 81 | #memory-panel.visible:not(.mem-hidden) | global.css | extract_from_old | FIXED |
| 82 | #messages-list | global.css | extract_from_old | FIXED |
| 83 | #new-project-modal | global.css | manual_extract | FIXED |
| 84 | #new-project-modal .modal-content | global.css | manual_extract | FIXED |
| 85 | #new-project-modal.visible | global.css | manual_extract | FIXED |
| 86 | #outline-workspace textarea | global.css | manual_extract | FIXED |
| 87 | #outline-workspace textarea:focus | global.css | manual_extract | FIXED |
| 88 | #outline-workspace.ow-hidden | global.css | extract_from_old | FIXED |
| 89 | #ow-chat-area | global.css | extract_from_old | FIXED |
| 90 | #ow-chat-area .btn-send | global.css | extract_from_old | FIXED |
| 91 | #ow-chat-area .btn-send:hover | global.css | extract_from_old | FIXED |
| 92 | #ow-chat-area .chat-input-row | global.css | extract_from_old | FIXED |
| 93 | #ow-chat-area .chat-input-row textarea | global.css | extract_from_old | FIXED |
| 94 | #ow-chat-messages | global.css | extract_from_old | FIXED |
| 95 | #panel-backdrop | global.css | extract_from_old | FIXED |
| 96 | #panel-backdrop.visible | global.css | extract_from_old | FIXED |
| 97 | #pipeline-panel.pl-hidden | global.css | extract_from_old | FIXED |
| 98 | #pl-ch-empty-hint | global.css | extract_from_old | FIXED |
| 99 | #pl-confirm-chapters | global.css | manual_extract | FIXED |
| 100 | #pl-confirm-chapters:hover | global.css | manual_extract | FIXED |
| 101 | #pl-confirm-outline | global.css | extract_from_old | FIXED |
| 102 | #pl-confirm-outline:hover | global.css | extract_from_old | FIXED |
| 103 | #pl-confirm-volumes | global.css | manual_extract | FIXED |
| 104 | #pl-confirm-volumes:hover | global.css | manual_extract | FIXED |
| 105 | #pl-context-summary | global.css | extract_from_old | FIXED |
| 106 | #pl-context-summary::-webkit-scrollbar-thumb | global.css | manual_extract | FIXED |
| 107 | #pl-gen-body | global.css | manual_extract | FIXED |
| 108 | #pl-gen-body:hover | global.css | manual_extract | FIXED |
| 109 | #pl-gen-chapters | global.css | manual_extract | FIXED |
| 110 | #pl-gen-chapters:hover | global.css | manual_extract | FIXED |
| 111 | #pl-gen-volumes | global.css | manual_extract | FIXED |
| 112 | #pl-gen-volumes:hover | global.css | manual_extract | FIXED |
| 113 | #pl-outline | global.css | extract_from_old | FIXED |
| 114 | #pl-outline:focus | global.css | extract_from_old | FIXED |
| 115 | #pl-s1-add-skill | global.css | extract_from_old | FIXED |
| 116 | #pl-s3-add-skill | global.css | extract_from_old | FIXED |
| 117 | #pl-s3-add-skill:hover | global.css | extract_from_old | FIXED |
| 118 | #pl-step-2-content .btn-secondary | global.css | extract_from_old | FIXED |
| 119 | #pl-step-2-content .btn-sm[id^="pl-s2-add"] | global.css | extract_from_old | FIXED |
| 120 | #pl-step-2-content .pl-bound-toggle | global.css | extract_from_old | FIXED |
| 121 | #pl-step-2-content .pl-gen-cat | global.css | extract_from_old | FIXED |
| 122 | #pl-step-2-content .pl-gen-cat:checked | global.css | extract_from_old | FIXED |
| 123 | #pl-step-2-content .pl-gen-cat:checked::after | global.css | extract_from_old | FIXED |
| 124 | #pl-word-count | global.css | extract_from_old | FIXED |
| 125 | #plugin-market-modal | global.css | manual_extract | FIXED |
| 126 | #plugin-market-modal .modal-content | global.css | extract_from_old | FIXED |
| 127 | #plugin-market-modal.visible | global.css | manual_extract | FIXED |
| 128 | #project-modal | global.css | manual_extract | FIXED |
| 129 | #project-modal .modal-content | global.css | extract_from_old | FIXED |
| 130 | #project-modal.visible | global.css | manual_extract | FIXED |
| 131 | #provider-card-list | global.css | extract_from_old | FIXED |
| 132 | #provider-card-list:empty::after | global.css | extract_from_old | FIXED |
| 133 | #provider-edit-view .form-actions | global.css | extract_from_old | FIXED |
| 134 | #provider-edit-view .form-actions button | global.css | extract_from_old | FIXED |
| 135 | #provider-edit-view select | global.css | extract_from_old | FIXED |
| 136 | #sc-bind-modal | global.css | manual_extract | FIXED |
| 137 | #sc-bind-modal .modal-content | global.css | manual_extract | FIXED |
| 138 | #sc-bind-modal.visible | global.css | manual_extract | FIXED |
| 139 | #sc-detail-title | global.css | extract_from_old | FIXED |
| 140 | #settings-collection-panel.sc-hidden | global.css | extract_from_old | FIXED |
| 141 | #settings-modal | global.css | extract_from_old | FIXED |
| 142 | #settings-modal .provider-card | global.css | extract_from_old | FIXED |
| 143 | #settings-modal .provider-card-add | global.css | extract_from_old | FIXED |
| 144 | #settings-modal .provider-card-add:hover | global.css | extract_from_old | FIXED |
| 145 | #settings-modal .provider-card:hover | global.css | extract_from_old | FIXED |
| 146 | #settings-modal .provider-model-item | global.css | extract_from_old | FIXED |
| 147 | #settings-modal .provider-model-item:hover | global.css | extract_from_old | FIXED |
| 148 | #settings-modal.visible | global.css | extract_from_old | FIXED |
| 149 | #sf-linked-list.checkbox-list | global.css | extract_from_old | FIXED |
| 150 | #skill-bind-modal | global.css | manual_extract | FIXED |
| 151 | #skill-bind-modal .modal-content | global.css | manual_extract | FIXED |
| 152 | #skill-bind-modal.visible | global.css | manual_extract | FIXED |
| 153 | #skill-form | global.css | manual_extract | FIXED |
| 154 | #skill-form .btn-var | global.css | extract_from_old | FIXED |
| 155 | #skill-form .btn-var:hover | global.css | extract_from_old | FIXED |
| 156 | #skill-form .form-actions | global.css | manual_extract | FIXED |
| 157 | #skill-form .form-actions .btn-primary | global.css | extract_from_old | FIXED |
| 158 | #skill-form .form-actions .btn-primary:hover | global.css | extract_from_old | FIXED |
| 159 | #skill-form .form-actions .btn-secondary | global.css | extract_from_old | FIXED |
| 160 | #skill-form .form-actions .btn-secondary:hover | global.css | extract_from_old | FIXED |
| 161 | #skill-form .form-actions button | global.css | manual_extract | FIXED |
| 162 | #skill-form .form-group | global.css | manual_extract | FIXED |
| 163 | #skill-form .var-details | global.css | extract_from_old | FIXED |
| 164 | #skill-form .var-details summary | global.css | extract_from_old | FIXED |
| 165 | #skill-form .var-tags | global.css | extract_from_old | FIXED |
| 166 | #skill-form h4 | global.css | manual_extract | FIXED |
| 167 | #skill-form input[type="number"] | global.css | extract_from_old | FIXED |
| 168 | #skill-form label | global.css | manual_extract | FIXED |
| 169 | #skill-form textarea | global.css | extract_from_old | FIXED |
| 170 | #skill-form textarea:focus | global.css | extract_from_old | FIXED |
| 171 | #skill-list .skill-card | global.css | manual_extract | FIXED |
| 172 | #skill-list .skill-card:hover | global.css | manual_extract | FIXED |
| 173 | #skill-list-active | global.css | extract_from_old | FIXED |
| 174 | #status-connection | global.css | extract_from_old | FIXED |
| 175 | #statusbar | global.css | extract_from_old | FIXED |
| 176 | #statusbar span | global.css | extract_from_old | FIXED |
| 177 | #statusbar span:hover | global.css | extract_from_old | FIXED |
| 178 | #tab-appearance #btn-save-appearance | global.css | extract_from_old | FIXED |
| 179 | #tab-appearance .form-actions | global.css | extract_from_old | FIXED |
| 180 | #tab-appearance .form-actions > #btn-save-appearance | global.css | extract_from_old | FIXED |
| 181 | #tab-appearance .kbd-row | global.css | extract_from_old | FIXED |
| 182 | #tab-appearance .kbd-shortcuts | global.css | extract_from_old | FIXED |
| 183 | #tab-diag .btn-sm | global.css | extract_from_old | FIXED |
| 184 | #tab-diag .btn-sm.btn-danger | global.css | extract_from_old | FIXED |
| 185 | #tab-diag .btn-sm.btn-danger:hover | global.css | extract_from_old | FIXED |
| 186 | #tab-diag .btn-sm:hover | global.css | extract_from_old | FIXED |
| 187 | #tab-diag .section-header | global.css | extract_from_old | FIXED |
| 188 | #tab-skills #btn-cancel-skill | global.css | extract_from_old | FIXED |
| 189 | #tab-skills .btn-var | global.css | extract_from_old | FIXED |
| 190 | #theme-toggle-btn | global.css | extract_from_old | FIXED |
| 191 | #theme-toggle-btn:hover | global.css | extract_from_old | FIXED |
| 192 | #toast-container | global.css | extract_from_old | FIXED |
| 193 | #toast-container > div | global.css | extract_from_old | FIXED |
| 194 | #tooltip | global.css | extract_from_old | FIXED |
| 195 | #tooltip.visible | global.css | extract_from_old | FIXED |
| 196 | #user-input | global.css | extract_from_old | FIXED |
| 197 | #user-input::placeholder | global.css | extract_from_old | FIXED |
| 198 | #user-input:focus | global.css | extract_from_old | FIXED |
| 199 | #volume-modal | global.css | manual_extract | FIXED |
| 200 | #volume-modal .modal-content | global.css | manual_extract | FIXED |
| 201 | #volume-modal.visible | global.css | manual_extract | FIXED |
| 202 | #word-count | global.css | manual_extract | FIXED |
| 203 | *::after | global.css | extract_from_old | FIXED |
| 204 | --font-size: clamp(11px | global.css | extract_from_old | FIXED |
| 205 | --font-size: clamp(12px | global.css | extract_from_old | FIXED |
| 206 | --font-size: clamp(14px | global.css | extract_from_old | FIXED |
| 207 | --font-size: clamp(16px | global.css | manual_extract | FIXED |
| 208 | --font-size: var(--font-size-sm); } #app-sidebar | global.css | manual_extract | FIXED |
| 209 | .agent-card button | global.css | manual_extract | FIXED |
| 210 | .agent-card button):disabled | global.css | manual_extract | FIXED |
| 211 | .agent-card button:hover | global.css | manual_extract | FIXED |
| 212 | .agent-card.selected | global.css | manual_extract | FIXED |
| 213 | .agent-info-bar .agent-info-label | global.css | extract_from_old | FIXED |
| 214 | .agent-item | global.css | extract_from_old | FIXED |
| 215 | .agent-item .item-actions | global.css | extract_from_old | FIXED |
| 216 | .agent-item .item-meta | global.css | extract_from_old | FIXED |
| 217 | .agent-item .item-name | global.css | extract_from_old | FIXED |
| 218 | .agent-item.selected | global.css | extract_from_old | FIXED |
| 219 | .agent-item:hover | global.css | extract_from_old | FIXED |
| 220 | .agent-selector:focus | global.css | extract_from_old | FIXED |
| 221 | .agent-selector:hover | global.css | extract_from_old | FIXED |
| 222 | .app-title | global.css | extract_from_old | FIXED |
| 223 | .appearance-current-text | global.css | extract_from_old | FIXED |
| 224 | .area-header | global.css | manual_extract | FIXED |
| 225 | .bound-item | global.css | extract_from_old | FIXED |
| 226 | .bound-item:active | global.css | extract_from_old | FIXED |
| 227 | .bound-item:hover | global.css | extract_from_old | FIXED |
| 228 | .breadcrumb-item .bc-close | global.css | extract_from_old | FIXED |
| 229 | .breadcrumb-item:hover .bc-close | global.css | extract_from_old | FIXED |
| 230 | .btn | global.css | extract_from_old | FIXED |
| 231 | .btn-back-sm | global.css | extract_from_old | FIXED |
| 232 | .btn-back-sm.btn-disabled | global.css | extract_from_old | FIXED |
| 233 | .btn-back-sm:focus-visible | global.css | extract_from_old | FIXED |
| 234 | .btn-back-sm:not(:disabled):active | global.css | extract_from_old | FIXED |
| 235 | .btn-back-sm:not(:disabled):hover | global.css | extract_from_old | FIXED |
| 236 | .btn-cancel | global.css | manual_extract | FIXED |
| 237 | .btn-close:not(:disabled):active | global.css | extract_from_old | FIXED |
| 238 | .btn-close:not(:disabled):hover | global.css | extract_from_old | FIXED |
| 239 | .btn-confirm | global.css | manual_extract | FIXED |
| 240 | .btn-danger:not(:disabled):hover | global.css | extract_from_old | FIXED |
| 241 | .btn-ghost | global.css | extract_from_old | FIXED |
| 242 | .btn-ghost:not(:disabled):hover | global.css | extract_from_old | FIXED |
| 243 | .btn-icon.btn-lg | global.css | extract_from_old | FIXED |
| 244 | .btn-icon.btn-sm | global.css | extract_from_old | FIXED |
| 245 | .btn-icon.btn-xs | global.css | extract_from_old | FIXED |
| 246 | .btn-icon:not(:disabled):active | global.css | extract_from_old | FIXED |
| 247 | .btn-icon:not(:disabled):hover | global.css | extract_from_old | FIXED |
| 248 | .btn-lg | global.css | extract_from_old | FIXED |
| 249 | .btn-ml-4 | global.css | extract_from_old | FIXED |
| 250 | .btn-outline.full-width | global.css | extract_from_old | FIXED |
| 251 | .btn-outline:not(:disabled):hover | global.css | extract_from_old | FIXED |
| 252 | .btn-primary:not(:disabled):hover | global.css | extract_from_old | FIXED |
| 253 | .btn-secondary:not(:disabled):hover | global.css | extract_from_old | FIXED |
| 254 | .btn-send.btn-loading | global.css | extract_from_old | FIXED |
| 255 | .btn-send.btn-loading::after | global.css | extract_from_old | FIXED |
| 256 | .btn-send.btn-stop | global.css | extract_from_old | FIXED |
| 257 | .btn-send.btn-stop:not(:disabled):hover | global.css | extract_from_old | FIXED |
| 258 | .btn-send:not(:disabled):active | global.css | extract_from_old | FIXED |
| 259 | .btn-send:not(:disabled):hover | global.css | extract_from_old | FIXED |
| 260 | .btn-toggle:not(:disabled):hover | global.css | extract_from_old | FIXED |
| 261 | .btn-var:not(:disabled):hover | global.css | extract_from_old | FIXED |
| 262 | .btn-xs | global.css | extract_from_old | FIXED |
| 263 | .card | global.css | extract_from_old | FIXED |
| 264 | .card-content | global.css | extract_from_old | FIXED |
| 265 | .card-grid .grid-card.selected | global.css | manual_extract | FIXED |
| 266 | .card-grid .sc-item.selected | global.css | extract_from_old | FIXED |
| 267 | .card-grid > .card-item | global.css | manual_extract | FIXED |
| 268 | .card-grid > .card-item:hover | global.css | manual_extract | FIXED |
| 269 | .card-grid > .grid-card | global.css | manual_extract | FIXED |
| 270 | .card-grid > .grid-card:hover | global.css | manual_extract | FIXED |
| 271 | .card-grid > .sc-item | global.css | extract_from_old | FIXED |
| 272 | .card-grid > .sc-item:hover | global.css | extract_from_old | FIXED |
| 273 | .card-grid-item | global.css | manual_extract | FIXED |
| 274 | .card-grid-item:hover | global.css | manual_extract | FIXED |
| 275 | .card-item | global.css | manual_extract | FIXED |
| 276 | .card-item.selected | global.css | manual_extract | FIXED |
| 277 | .card-item:hover | global.css | manual_extract | FIXED |
| 278 | .card.selected | global.css | extract_from_old | FIXED |
| 279 | .card:hover | global.css | extract_from_old | FIXED |
| 280 | .chapter-overview | global.css | extract_from_old | FIXED |
| 281 | .chapter-overview-close | global.css | extract_from_old | FIXED |
| 282 | .chapter-overview-close:active | global.css | extract_from_old | FIXED |
| 283 | .chapter-overview-close:focus-visible | global.css | extract_from_old | FIXED |
| 284 | .chapter-overview-close:hover | global.css | extract_from_old | FIXED |
| 285 | .chapter-overview-content | global.css | extract_from_old | FIXED |
| 286 | .chapter-overview-loading | global.css | extract_from_old | FIXED |
| 287 | .chapter-overview-section | global.css | extract_from_old | FIXED |
| 288 | .chapter-overview-section + .chapter-overview-section | global.css | extract_from_old | FIXED |
| 289 | .chapter-overview-section-title | global.css | extract_from_old | FIXED |
| 290 | .chapter-overview-title | global.css | extract_from_old | FIXED |
| 291 | .chapter-overview.visible | global.css | extract_from_old | FIXED |
| 292 | .chat-empty | global.css | extract_from_old | FIXED |
| 293 | .chat-empty .empty-icon | global.css | extract_from_old | FIXED |
| 294 | .chat-empty .empty-sub | global.css | extract_from_old | FIXED |
| 295 | .chat-empty p | global.css | extract_from_old | FIXED |
| 296 | .chat-input-row .btn-send | global.css | extract_from_old | FIXED |
| 297 | .chat-input-row .btn-send:active | global.css | extract_from_old | FIXED |
| 298 | .chat-input-row .btn-send:hover | global.css | extract_from_old | FIXED |
| 299 | .chat-input-row textarea | global.css | extract_from_old | FIXED |
| 300 | .chat-input-row textarea:focus | global.css | extract_from_old | FIXED |
| 301 | .chat-messages::-webkit-scrollbar-thumb | global.css | manual_extract | FIXED |
| 302 | .checkbox-list > .checkbox-item | global.css | extract_from_old | FIXED |
| 303 | .checkbox-list > .checkbox-item:hover | global.css | extract_from_old | FIXED |
| 304 | .checkbox-list input[type="checkbox"] | global.css | extract_from_old | FIXED |
| 305 | .checkbox-list input[type="checkbox"]:checked | global.css | extract_from_old | FIXED |
| 306 | .checkbox-list input[type="checkbox"]:checked::after | global.css | extract_from_old | FIXED |
| 307 | .checkbox-list input[type="checkbox"]:focus-visible | global.css | extract_from_old | FIXED |
| 308 | .checkbox-list input[type="checkbox"]:hover | global.css | extract_from_old | FIXED |
| 309 | .confirm-actions .btn-primary:hover | global.css | extract_from_old | FIXED |
| 310 | .confirm-dialog) textarea | global.css | manual_extract | FIXED |
| 311 | .context-menu .menu-item | global.css | extract_from_old | FIXED |
| 312 | .context-menu .menu-item:hover | global.css | extract_from_old | FIXED |
| 313 | .ctx-content | global.css | extract_from_old | FIXED |
| 314 | .ctx-content .ctx-item | global.css | extract_from_old | FIXED |
| 315 | .ctx-content .ctx-item:hover | global.css | extract_from_old | FIXED |
| 316 | .ctx-content button:active | global.css | extract_from_old | FIXED |
| 317 | .ctx-content button:focus-visible | global.css | extract_from_old | FIXED |
| 318 | .ctx-label | global.css | extract_from_old | FIXED |
| 319 | .ctx-layer | global.css | extract_from_old | FIXED |
| 320 | .ctx-menu-divider | global.css | extract_from_old | FIXED |
| 321 | .ctx-menu-item | global.css | extract_from_old | FIXED |
| 322 | .ctx-menu-item.danger:hover | global.css | extract_from_old | FIXED |
| 323 | .ctx-menu-item:hover | global.css | extract_from_old | FIXED |
| 324 | .ctx-section + .ctx-section | global.css | extract_from_old | FIXED |
| 325 | .ctx-skills | global.css | extract_from_old | FIXED |
| 326 | .ctx-skills-label | global.css | extract_from_old | FIXED |
| 327 | .ctx-target | global.css | extract_from_old | FIXED |
| 328 | .custom-context-menu | global.css | manual_extract | FIXED |
| 329 | .custom-context-menu .menu-item | global.css | manual_extract | FIXED |
| 330 | .custom-context-menu .menu-item:hover | global.css | manual_extract | FIXED |
| 331 | .dashboard-bar-chart | global.css | extract_from_old | FIXED |
| 332 | .dashboard-bar-fill.accent | global.css | extract_from_old | FIXED |
| 333 | .dashboard-bar-fill.success | global.css | extract_from_old | FIXED |
| 334 | .dashboard-bar-fill.warning | global.css | extract_from_old | FIXED |
| 335 | .dashboard-bar-value | global.css | extract_from_old | FIXED |
| 336 | .dashboard-grid | global.css | extract_from_old | FIXED |
| 337 | .deai-config-section | global.css | extract_from_old | FIXED |
| 338 | .deai-skill-bar select | global.css | extract_from_old | FIXED |
| 339 | .diag-log-list > div | global.css | extract_from_old | FIXED |
| 340 | .dialog-footer | global.css | manual_extract | FIXED |
| 341 | .dialog-footer button | global.css | manual_extract | FIXED |
| 342 | .dialog-footer) | global.css | manual_extract | FIXED |
| 343 | .dialog-footer) .btn | global.css | manual_extract | FIXED |
| 344 | .dialog-footer) > :is(.btn-primary | global.css | manual_extract | FIXED |
| 345 | .dialog-footer) > :is(.btn-secondary | global.css | manual_extract | FIXED |
| 346 | .editor-find-highlight.active | global.css | extract_from_old | FIXED |
| 347 | .editor-header button | global.css | manual_extract | FIXED |
| 348 | .editor-header span | global.css | extract_from_old | FIXED |
| 349 | .editor-mode-badge.mode-ch-body | global.css | extract_from_old | FIXED |
| 350 | .editor-mode-badge.mode-ch-plot | global.css | extract_from_old | FIXED |
| 351 | .editor-mode-badge.mode-vol-outline | global.css | extract_from_old | FIXED |
| 352 | .editor-mode-badge:empty | global.css | extract_from_old | FIXED |
| 353 | .editor-toolbar button | global.css | extract_from_old | FIXED |
| 354 | .editor-toolbar button))):hover | global.css | manual_extract | FIXED |
| 355 | .editor-toolbar button.active | global.css | extract_from_old | FIXED |
| 356 | .editor-toolbar button:active | global.css | extract_from_old | FIXED |
| 357 | .editor-toolbar button:hover | global.css | extract_from_old | FIXED |
| 358 | .editor-toolbar) | global.css | manual_extract | FIXED |
| 359 | .editor-toolbar) .btn | global.css | manual_extract | FIXED |
| 360 | .editor-toolbar) .btn:active | global.css | manual_extract | FIXED |
| 361 | .editor-toolbar) .btn:hover | global.css | manual_extract | FIXED |
| 362 | .editor-toolbar).is-connected .btn | global.css | manual_extract | FIXED |
| 363 | .editor-toolbar).is-connected .btn:last-child | global.css | manual_extract | FIXED |
| 364 | .editor-toolbar-sep | global.css | extract_from_old | FIXED |
| 365 | .empty-message | global.css | extract_from_old | FIXED |
| 366 | .empty-state .empty-icon | global.css | extract_from_old | FIXED |
| 367 | .empty-state .empty-text | global.css | extract_from_old | FIXED |
| 368 | .empty-state-desc | global.css | extract_from_old | FIXED |
| 369 | .empty-state-icon | global.css | extract_from_old | FIXED |
| 370 | .empty-state-title | global.css | extract_from_old | FIXED |
| 371 | .export-dropdown-wrap | global.css | extract_from_old | FIXED |
| 372 | .export-dropdown.open | global.css | extract_from_old | FIXED |
| 373 | .field-label | global.css | extract_from_old | FIXED |
| 374 | .footer-left) | global.css | manual_extract | FIXED |
| 375 | .footer-right) | global.css | manual_extract | FIXED |
| 376 | .form-actions button:hover | global.css | manual_extract | FIXED |
| 377 | .form-group textarea.invalid | global.css | extract_from_old | FIXED |
| 378 | .form-group textarea.invalid:focus | global.css | extract_from_old | FIXED |
| 379 | .form-group) input[type="radio"] | global.css | manual_extract | FIXED |
| 380 | .form-group) input[type="range"] | global.css | manual_extract | FIXED |
| 381 | .form-group) input[type="range"]::-moz-range-thumb | global.css | manual_extract | FIXED |
| 382 | .form-group) input[type="range"]::-moz-range-track | global.css | manual_extract | FIXED |
| 383 | .form-group) input[type="range"]::-webkit-slider-thumb | global.css | manual_extract | FIXED |
| 384 | .form-group) input[type="range"]::-webkit-slider-thumb:hover | global.css | manual_extract | FIXED |
| 385 | .form-group) label | global.css | manual_extract | FIXED |
| 386 | .form-group) select | global.css | manual_extract | FIXED |
| 387 | .form-group) select:focus | global.css | manual_extract | FIXED |
| 388 | .form-group) textarea | global.css | manual_extract | FIXED |
| 389 | .form-group) textarea::placeholder | global.css | manual_extract | FIXED |
| 390 | .form-group.has-error textarea | global.css | extract_from_old | FIXED |
| 391 | .header-left | global.css | extract_from_old | FIXED |
| 392 | .inline-menu-btn:active | global.css | extract_from_old | FIXED |
| 393 | .inline-menu-btn:focus-visible | global.css | extract_from_old | FIXED |
| 394 | .input-hint.configured | global.css | extract_from_old | FIXED |
| 395 | .input-w-60 | global.css | extract_from_old | FIXED |
| 396 | .input-w-80 | global.css | extract_from_old | FIXED |
| 397 | .item-card | global.css | manual_extract | FIXED |
| 398 | .item-card) :is(.card-footer | global.css | manual_extract | FIXED |
| 399 | .item-card:hover | global.css | manual_extract | FIXED |
| 400 | .item-footer) .btn | global.css | manual_extract | FIXED |
| 401 | .item-list .card-grid-item | global.css | extract_from_old | FIXED |
| 402 | .item-list .card-grid-item:hover | global.css | extract_from_old | FIXED |
| 403 | .item-list > div | global.css | manual_extract | FIXED |
| 404 | .item-list > div:hover | global.css | manual_extract | FIXED |
| 405 | .list-item.active | global.css | extract_from_old | FIXED |
| 406 | .loading-overlay .spinner | global.css | extract_from_old | FIXED |
| 407 | .market-body-scroll | global.css | extract_from_old | FIXED |
| 408 | .market-install-btn:active | global.css | extract_from_old | FIXED |
| 409 | .market-install-btn:focus-visible | global.css | extract_from_old | FIXED |
| 410 | .market-modal-content | global.css | extract_from_old | FIXED |
| 411 | .market-result:active | global.css | extract_from_old | FIXED |
| 412 | .market-result:focus-within | global.css | extract_from_old | FIXED |
| 413 | .market-result:hover | global.css | extract_from_old | FIXED |
| 414 | .mb-8 | global.css | extract_from_old | FIXED |
| 415 | .mem-cat-btn.active:hover | global.css | extract_from_old | FIXED |
| 416 | .mem-content::-webkit-scrollbar-thumb | global.css | manual_extract | FIXED |
| 417 | .mem-empty | global.css | extract_from_old | FIXED |
| 418 | .mem-form .form-group select:focus | global.css | extract_from_old | FIXED |
| 419 | .mem-form .form-group select:hover | global.css | extract_from_old | FIXED |
| 420 | .mem-form .form-group:last-child | global.css | extract_from_old | FIXED |
| 421 | .mem-form > select | global.css | extract_from_old | FIXED |
| 422 | .mem-form > select:focus | global.css | extract_from_old | FIXED |
| 423 | .mem-item button | global.css | manual_extract | FIXED |
| 424 | .mem-item button:hover | global.css | manual_extract | FIXED |
| 425 | .mem-item:hover | global.css | extract_from_old | FIXED |
| 426 | .mem-sidebar button | global.css | extract_from_old | FIXED |
| 427 | .mem-sidebar button.active | global.css | extract_from_old | FIXED |
| 428 | .mem-sidebar button:hover | global.css | extract_from_old | FIXED |
| 429 | .modal | global.css | extract_from_old | FIXED |
| 430 | .modal .btn-close | global.css | manual_extract | FIXED |
| 431 | .modal .btn-close:hover | global.css | manual_extract | FIXED |
| 432 | .modal-actions | global.css | manual_extract | FIXED |
| 433 | .modal-actions button | global.css | manual_extract | FIXED |
| 434 | .modal-content.modal-lg | global.css | extract_from_old | FIXED |
| 435 | .modal-hidden | global.css | manual_extract | FIXED |
| 436 | .modal-title-bar | global.css | manual_extract | FIXED |
| 437 | .modal.modal-closing .modal-content | global.css | extract_from_old | FIXED |
| 438 | .modal.modal-hidden | global.css | extract_from_old | FIXED |
| 439 | .modal.visible | global.css | extract_from_old | FIXED |
| 440 | .modal:not(.visible) .modal-backdrop | global.css | extract_from_old | FIXED |
| 441 | .msg-ai | global.css | extract_from_old | FIXED |
| 442 | .msg-btn-apply:hover | global.css | extract_from_old | FIXED |
| 443 | .msg-btn-copy:hover | global.css | extract_from_old | FIXED |
| 444 | .msg-btn-regen:hover | global.css | extract_from_old | FIXED |
| 445 | .msg-btn:active | global.css | extract_from_old | FIXED |
| 446 | .msg-btn:focus-visible | global.css | extract_from_old | FIXED |
| 447 | .msg-user | global.css | extract_from_old | FIXED |
| 448 | .no-data | global.css | extract_from_old | FIXED |
| 449 | .notyf | global.css | extract_from_old | FIXED |
| 450 | .notyf__toast--error::before | global.css | extract_from_old | FIXED |
| 451 | .notyf__toast--success::before | global.css | extract_from_old | FIXED |
| 452 | .notyf__toast.notyf__toast--disappear | global.css | extract_from_old | FIXED |
| 453 | .notyf__toast::before | global.css | extract_from_old | FIXED |
| 454 | .npm-close | global.css | manual_extract | FIXED |
| 455 | .npm-close:active | global.css | manual_extract | FIXED |
| 456 | .npm-close:hover | global.css | manual_extract | FIXED |
| 457 | .overlay-panel | global.css | extract_from_old | FIXED |
| 458 | .overlay-panel .btn-close | global.css | extract_from_old | FIXED |
| 459 | .overlay-panel .btn-close:hover | global.css | extract_from_old | FIXED |
| 460 | .overlay-panel.visible | global.css | extract_from_old | FIXED |
| 461 | .ow-chat-hidden | global.css | extract_from_old | FIXED |
| 462 | .ow-editor textarea | global.css | extract_from_old | FIXED |
| 463 | .ow-editor-header span | global.css | extract_from_old | FIXED |
| 464 | .ow-msg-ai | global.css | extract_from_old | FIXED |
| 465 | .ow-msg-user | global.css | extract_from_old | FIXED |
| 466 | .ow-section .btn-secondary.full-width | global.css | extract_from_old | FIXED |
| 467 | .ow-section .btn-secondary.full-width:hover | global.css | extract_from_old | FIXED |
| 468 | .ow-sidebar::-webkit-scrollbar-thumb | global.css | manual_extract | FIXED |
| 469 | .panel | global.css | extract_from_old | FIXED |
| 470 | .panel-actions | global.css | extract_from_old | FIXED |
| 471 | .panel-body | global.css | extract_from_old | FIXED |
| 472 | .panel-header | global.css | extract_from_old | FIXED |
| 473 | .panel-overlay | global.css | manual_extract | FIXED |
| 474 | .panel-scroll | global.css | extract_from_old | FIXED |
| 475 | .panel-title | global.css | extract_from_old | FIXED |
| 476 | .pipeline-card | global.css | manual_extract | FIXED |
| 477 | .pipeline-card .card-content | global.css | manual_extract | FIXED |
| 478 | .pipeline-card .card-title | global.css | manual_extract | FIXED |
| 479 | .pipeline-card:hover | global.css | manual_extract | FIXED |
| 480 | .pl-actions button | global.css | extract_from_old | FIXED |
| 481 | .pl-actions button:active | global.css | extract_from_old | FIXED |
| 482 | .pl-actions button:hover | global.css | extract_from_old | FIXED |
| 483 | .pl-add-vol-btn | global.css | extract_from_old | FIXED |
| 484 | .pl-agent-bar:hover | global.css | extract_from_old | FIXED |
| 485 | .pl-bound-item | global.css | extract_from_old | FIXED |
| 486 | .pl-bound-setting-item | global.css | extract_from_old | FIXED |
| 487 | .pl-bound-setting-item:hover | global.css | extract_from_old | FIXED |
| 488 | .pl-bound-settings-box | global.css | extract_from_old | FIXED |
| 489 | .pl-bound-settings-list | global.css | extract_from_old | FIXED |
| 490 | .pl-bound-settings-title | global.css | extract_from_old | FIXED |
| 491 | .pl-card | global.css | extract_from_old | FIXED |
| 492 | .pl-card-content | global.css | extract_from_old | FIXED |
| 493 | .pl-card-title | global.css | extract_from_old | FIXED |
| 494 | .pl-card:hover | global.css | extract_from_old | FIXED |
| 495 | .pl-ch-card-actions button | global.css | extract_from_old | FIXED |
| 496 | .pl-ch-card-actions button.btn-confirm-ch | global.css | extract_from_old | FIXED |
| 497 | .pl-ch-card-actions button.btn-delete-ch | global.css | extract_from_old | FIXED |
| 498 | .pl-ch-card-actions button.btn-save-ch | global.css | extract_from_old | FIXED |
| 499 | .pl-ch-layout | global.css | extract_from_old | FIXED |
| 500 | .pl-ch-main | global.css | extract_from_old | FIXED |
| 501 | .pl-ch-sidebar | global.css | extract_from_old | FIXED |
| 502 | .pl-chap-card button | global.css | extract_from_old | FIXED |
| 503 | .pl-chap-card textarea | global.css | manual_extract | FIXED |
| 504 | .pl-chapter-card .ch-actions | global.css | manual_extract | FIXED |
| 505 | .pl-chapter-card .ch-body | global.css | manual_extract | FIXED |
| 506 | .pl-chapter-card .ch-header | global.css | manual_extract | FIXED |
| 507 | .pl-chapter-card .ch-title | global.css | manual_extract | FIXED |
| 508 | .pl-chapter-card textarea | global.css | manual_extract | FIXED |
| 509 | .pl-chapter-content | global.css | manual_extract | FIXED |
| 510 | .pl-chapter-title | global.css | manual_extract | FIXED |
| 511 | .pl-checkboxes input[type=checkbox]:checked + span | global.css | extract_from_old | FIXED |
| 512 | .pl-checkboxes label:hover | global.css | extract_from_old | FIXED |
| 513 | .pl-content h3 | global.css | extract_from_old | FIXED |
| 514 | .pl-context-summary | global.css | extract_from_old | FIXED |
| 515 | .pl-context-summary .ctx-content | global.css | extract_from_old | FIXED |
| 516 | .pl-context-summary .ctx-label | global.css | extract_from_old | FIXED |
| 517 | .pl-context-summary .ctx-section | global.css | extract_from_old | FIXED |
| 518 | .pl-empty-hint | global.css | manual_extract | FIXED |
| 519 | .pl-enable-btn.disabled | global.css | manual_extract | FIXED |
| 520 | .pl-filter-label | global.css | extract_from_old | FIXED |
| 521 | .pl-filter-toggle | global.css | extract_from_old | FIXED |
| 522 | .pl-filter-toggle-wrap | global.css | extract_from_old | FIXED |
| 523 | .pl-gen-cat | global.css | extract_from_old | FIXED |
| 524 | .pl-gen-cat-group | global.css | extract_from_old | FIXED |
| 525 | .pl-gen-cat:active | global.css | extract_from_old | FIXED |
| 526 | .pl-gen-cat:hover | global.css | extract_from_old | FIXED |
| 527 | .pl-gen-options button | global.css | manual_extract | FIXED |
| 528 | .pl-gen-options button:hover | global.css | manual_extract | FIXED |
| 529 | .pl-gen-options input:not([type=checkbox]) | global.css | extract_from_old | FIXED |
| 530 | .pl-gen-options label | global.css | extract_from_old | FIXED |
| 531 | .pl-gen-options select | global.css | manual_extract | FIXED |
| 532 | .pl-label | global.css | extract_from_old | FIXED |
| 533 | .pl-label-mb | global.css | extract_from_old | FIXED |
| 534 | .pl-nav button | global.css | manual_extract | FIXED |
| 535 | .pl-nav button:active | global.css | manual_extract | FIXED |
| 536 | .pl-nav button:hover | global.css | manual_extract | FIXED |
| 537 | .pl-nav-btn.btn-primary | global.css | extract_from_old | FIXED |
| 538 | .pl-nav-btn.btn-primary:hover | global.css | extract_from_old | FIXED |
| 539 | .pl-nav-btn.btn-secondary | global.css | extract_from_old | FIXED |
| 540 | .pl-nav-btn.btn-secondary:hover | global.css | extract_from_old | FIXED |
| 541 | .pl-nav-btn.prev:hover | global.css | extract_from_old | FIXED |
| 542 | .pl-nav-btn:active | global.css | extract_from_old | FIXED |
| 543 | .pl-nav-button):disabled | global.css | manual_extract | FIXED |
| 544 | .pl-select | global.css | extract_from_old | FIXED |
| 545 | .pl-select:focus | global.css | extract_from_old | FIXED |
| 546 | .pl-skill-badge | global.css | extract_from_old | FIXED |
| 547 | .pl-skill-bar .btn-sm | global.css | manual_extract | FIXED |
| 548 | .pl-skill-bar .btn-sm:hover | global.css | extract_from_old | FIXED |
| 549 | .pl-skill-bar:hover | global.css | extract_from_old | FIXED |
| 550 | .pl-skills-list .skill-tag | global.css | extract_from_old | FIXED |
| 551 | .pl-skills-list span | global.css | extract_from_old | FIXED |
| 552 | .pl-step .pl-step-num | global.css | extract_from_old | FIXED |
| 553 | .pl-step-content .btn-primary:hover | global.css | extract_from_old | FIXED |
| 554 | .pl-step-content .btn-secondary:hover | global.css | extract_from_old | FIXED |
| 555 | .pl-step-content button | global.css | extract_from_old | FIXED |
| 556 | .pl-step-content textarea.full-width | global.css | manual_extract | FIXED |
| 557 | .pl-step-content textarea.full-width:focus | global.css | manual_extract | FIXED |
| 558 | .pl-step-content::-webkit-scrollbar-thumb | global.css | extract_from_old | FIXED |
| 559 | .pl-step-nav-btn | global.css | extract_from_old | FIXED |
| 560 | .pl-step-status | global.css | extract_from_old | FIXED |
| 561 | .pl-step-status.active | global.css | extract_from_old | FIXED |
| 562 | .pl-step-status.done | global.css | extract_from_old | FIXED |
| 563 | .pl-step-status.error | global.css | extract_from_old | FIXED |
| 564 | .pl-step-status.pending | global.css | extract_from_old | FIXED |
| 565 | .pl-step-status[data-status="active"] | global.css | extract_from_old | FIXED |
| 566 | .pl-step-status[data-status="done"] | global.css | extract_from_old | FIXED |
| 567 | .pl-step.active .pl-step-label | global.css | extract_from_old | FIXED |
| 568 | .pl-step.active .pl-step-status | global.css | extract_from_old | FIXED |
| 569 | .pl-step.completed .pl-step-status | global.css | extract_from_old | FIXED |
| 570 | .pl-step:hover .pl-step-num | global.css | extract_from_old | FIXED |
| 571 | .pl-steps::before | global.css | extract_from_old | FIXED |
| 572 | .pl-toggle-btn.disabled | global.css | extract_from_old | FIXED |
| 573 | .pl-toggle-btn.disabled:hover | global.css | extract_from_old | FIXED |
| 574 | .pl-toggle-btn.enabled:hover | global.css | extract_from_old | FIXED |
| 575 | .pl-vol-card .card-actions | global.css | manual_extract | FIXED |
| 576 | .pl-vol-card .pl-vol-del-btn | global.css | extract_from_old | FIXED |
| 577 | .pl-vol-card .vol-actions | global.css | extract_from_old | FIXED |
| 578 | .pl-vol-card button | global.css | extract_from_old | FIXED |
| 579 | .pl-vol-confirm-hint | global.css | extract_from_old | FIXED |
| 580 | .pl-volume-card .card-actions | global.css | manual_extract | FIXED |
| 581 | .pl-volume-card .vol-actions | global.css | extract_from_old | FIXED |
| 582 | .pl-volume-card .vol-body | global.css | extract_from_old | FIXED |
| 583 | .pl-volume-card .vol-header | global.css | extract_from_old | FIXED |
| 584 | .pl-volume-card .vol-title | global.css | extract_from_old | FIXED |
| 585 | .pl-volume-card textarea | global.css | manual_extract | FIXED |
| 586 | .pl-volume-content | global.css | extract_from_old | FIXED |
| 587 | .pl-volume-title | global.css | extract_from_old | FIXED |
| 588 | .plugin-card | global.css | extract_from_old | FIXED |
| 589 | .plugin-card:hover | global.css | extract_from_old | FIXED |
| 590 | .plugin-market | global.css | extract_from_old | FIXED |
| 591 | .pm-close:active | global.css | extract_from_old | FIXED |
| 592 | .provider-badge | global.css | extract_from_old | FIXED |
| 593 | .provider-card button | global.css | manual_extract | FIXED |
| 594 | .provider-card button:hover | global.css | manual_extract | FIXED |
| 595 | .provider-card-active | global.css | extract_from_old | FIXED |
| 596 | .provider-card-edit | global.css | extract_from_old | FIXED |
| 597 | .provider-card-edit:active | global.css | extract_from_old | FIXED |
| 598 | .provider-card-edit:focus-visible | global.css | extract_from_old | FIXED |
| 599 | .provider-card-edit:hover | global.css | extract_from_old | FIXED |
| 600 | .provider-card.is-active | global.css | extract_from_old | FIXED |
| 601 | .provider-conn-status-text | global.css | extract_from_old | FIXED |
| 602 | .provider-model-active | global.css | extract_from_old | FIXED |
| 603 | .provider-model-enable | global.css | extract_from_old | FIXED |
| 604 | .provider-model-enable.is-enabled | global.css | extract_from_old | FIXED |
| 605 | .provider-model-enable:active | global.css | extract_from_old | FIXED |
| 606 | .provider-model-enable:focus-visible | global.css | extract_from_old | FIXED |
| 607 | .provider-model-enable:hover | global.css | extract_from_old | FIXED |
| 608 | .provider-model-enable[data-enabled="true"] | global.css | extract_from_old | FIXED |
| 609 | .provider-model-enable[data-enabled="true"]:hover | global.css | extract_from_old | FIXED |
| 610 | .provider-model-item | global.css | extract_from_old | FIXED |
| 611 | .provider-model-item.active | global.css | extract_from_old | FIXED |
| 612 | .provider-model-item:hover | global.css | extract_from_old | FIXED |
| 613 | .provider-model-list | global.css | extract_from_old | FIXED |
| 614 | .provider-model-list-box | global.css | extract_from_old | FIXED |
| 615 | .provider-model-name | global.css | extract_from_old | FIXED |
| 616 | .range-full | global.css | extract_from_old | FIXED |
| 617 | .resize-handle-h.active | global.css | manual_extract | FIXED |
| 618 | .resize-handle-h:hover | global.css | extract_from_old | FIXED |
| 619 | .resize-handle-v.active | global.css | manual_extract | FIXED |
| 620 | .resize-handle-v:hover | global.css | extract_from_old | FIXED |
| 621 | .resizer-h | global.css | manual_extract | FIXED |
| 622 | .sbm-close | global.css | extract_from_old | FIXED |
| 623 | .sbm-close:hover | global.css | extract_from_old | FIXED |
| 624 | .sc-attr-item | global.css | extract_from_old | FIXED |
| 625 | .sc-attr-item button | global.css | extract_from_old | FIXED |
| 626 | .sc-attr-item input | global.css | extract_from_old | FIXED |
| 627 | .sc-bind-btn | global.css | extract_from_old | FIXED |
| 628 | .sc-bind-btn.bound | global.css | extract_from_old | FIXED |
| 629 | .sc-bind-btn:hover | global.css | extract_from_old | FIXED |
| 630 | .sc-bind-close | global.css | manual_extract | FIXED |
| 631 | .sc-bind-close:active | global.css | manual_extract | FIXED |
| 632 | .sc-bind-close:hover | global.css | manual_extract | FIXED |
| 633 | .sc-bind-hint | global.css | extract_from_old | FIXED |
| 634 | .sc-bind-hint-text | global.css | extract_from_old | FIXED |
| 635 | .sc-bind-item-name-text | global.css | extract_from_old | FIXED |
| 636 | .sc-bind-tree-box | global.css | extract_from_old | FIXED |
| 637 | .sc-cat-add:hover | global.css | extract_from_old | FIXED |
| 638 | .sc-categories button | global.css | extract_from_old | FIXED |
| 639 | .sc-categories button.active | global.css | extract_from_old | FIXED |
| 640 | .sc-categories button:hover | global.css | extract_from_old | FIXED |
| 641 | .sc-category-item | global.css | extract_from_old | FIXED |
| 642 | .sc-category-item.active | global.css | extract_from_old | FIXED |
| 643 | .sc-category-item:hover | global.css | extract_from_old | FIXED |
| 644 | .sc-del-btn | global.css | extract_from_old | FIXED |
| 645 | .sc-detail-attr:hover | global.css | extract_from_old | FIXED |
| 646 | .sc-detail-section:hover | global.css | extract_from_old | FIXED |
| 647 | .sc-detail-section:last-child | global.css | extract_from_old | FIXED |
| 648 | .sc-edit-btn | global.css | extract_from_old | FIXED |
| 649 | .sc-empty | global.css | extract_from_old | FIXED |
| 650 | .sc-item-actions button | global.css | extract_from_old | FIXED |
| 651 | .sc-item-card .btn-bind | global.css | manual_extract | FIXED |
| 652 | .sc-item-card .btn-bind.bound | global.css | extract_from_old | FIXED |
| 653 | .sc-item-card .btn-bind:hover | global.css | manual_extract | FIXED |
| 654 | .sc-item-card .btn-edit | global.css | manual_extract | FIXED |
| 655 | .sc-item-card .btn-edit:hover | global.css | manual_extract | FIXED |
| 656 | .sc-item-card.bound | global.css | extract_from_old | FIXED |
| 657 | .sc-item-content | global.css | extract_from_old | FIXED |
| 658 | .sc-item-form | global.css | extract_from_old | FIXED |
| 659 | .sc-item-form .form-actions | global.css | extract_from_old | FIXED |
| 660 | .sc-item-form .form-actions button | global.css | extract_from_old | FIXED |
| 661 | .sc-item-form .form-group | global.css | extract_from_old | FIXED |
| 662 | .sc-item-form .form-group label | global.css | extract_from_old | FIXED |
| 663 | .sc-item-form .form-group select | global.css | extract_from_old | FIXED |
| 664 | .sc-item-form .form-group select:focus | global.css | extract_from_old | FIXED |
| 665 | .sc-item-form .form-group select:hover | global.css | extract_from_old | FIXED |
| 666 | .sc-item-form .form-group textarea | global.css | extract_from_old | FIXED |
| 667 | .sc-item-form .form-group:last-child | global.css | extract_from_old | FIXED |
| 668 | .sc-item-form > select | global.css | extract_from_old | FIXED |
| 669 | .sc-item-form > select:focus | global.css | extract_from_old | FIXED |
| 670 | .sc-item-form h4 | global.css | extract_from_old | FIXED |
| 671 | .sc-item-header button + button | global.css | extract_from_old | FIXED |
| 672 | .sc-item.selected | global.css | manual_extract | FIXED |
| 673 | .sc-item:hover | global.css | extract_from_old | FIXED |
| 674 | .sc-items-list | global.css | manual_extract | FIXED |
| 675 | .sc-tab-bar | global.css | extract_from_old | FIXED |
| 676 | .section-header button | global.css | manual_extract | FIXED |
| 677 | .section-header button:hover | global.css | manual_extract | FIXED |
| 678 | .setting-card | global.css | manual_extract | FIXED |
| 679 | .setting-card:hover | global.css | manual_extract | FIXED |
| 680 | .sf-template-preview .script-block | global.css | extract_from_old | FIXED |
| 681 | .sf-template-preview .script-block::before | global.css | extract_from_old | FIXED |
| 682 | .sf-template-preview .var-highlight | global.css | extract_from_old | FIXED |
| 683 | .sf-template-preview blockquote | global.css | extract_from_old | FIXED |
| 684 | .sf-template-preview code | global.css | extract_from_old | FIXED |
| 685 | .sf-template-preview h1 | global.css | extract_from_old | FIXED |
| 686 | .sf-template-preview h2 | global.css | extract_from_old | FIXED |
| 687 | .sf-template-preview h3 | global.css | extract_from_old | FIXED |
| 688 | .sf-template-preview li | global.css | extract_from_old | FIXED |
| 689 | .sf-template-preview ol | global.css | manual_extract | FIXED |
| 690 | .sf-template-preview p | global.css | extract_from_old | FIXED |
| 691 | .sf-template-preview pre | global.css | extract_from_old | FIXED |
| 692 | .sf-template-preview pre code | global.css | extract_from_old | FIXED |
| 693 | .sf-template-preview table | global.css | extract_from_old | FIXED |
| 694 | .sf-template-preview td | global.css | manual_extract | FIXED |
| 695 | .sf-template-preview th | global.css | extract_from_old | FIXED |
| 696 | .sf-template-preview ul | global.css | extract_from_old | FIXED |
| 697 | .sidebar-btn svg | global.css | extract_from_old | FIXED |
| 698 | .sidebar-btn:active | global.css | extract_from_old | FIXED |
| 699 | .sidebar-btn:focus-visible | global.css | extract_from_old | FIXED |
| 700 | .sidebar-btn:hover svg | global.css | extract_from_old | FIXED |
| 701 | .sidebar-nav .nav-item.active | global.css | extract_from_old | FIXED |
| 702 | .skill-area button | global.css | extract_from_old | FIXED |
| 703 | .skill-area-header:hover | global.css | extract_from_old | FIXED |
| 704 | .skill-badge.active | global.css | extract_from_old | FIXED |
| 705 | .skill-badge.inactive | global.css | extract_from_old | FIXED |
| 706 | .skill-card button | global.css | manual_extract | FIXED |
| 707 | .skill-card button:hover | global.css | manual_extract | FIXED |
| 708 | .skill-card.selected | global.css | manual_extract | FIXED |
| 709 | .skill-list | global.css | manual_extract | FIXED |
| 710 | .skill-suggest-header label | global.css | extract_from_old | FIXED |
| 711 | .spinner.spinner-lg | global.css | extract_from_old | FIXED |
| 712 | .spinner.spinner-sm | global.css | extract_from_old | FIXED |
| 713 | .tab-content | global.css | extract_from_old | FIXED |
| 714 | .tab-content.active | global.css | extract_from_old | FIXED |
| 715 | .tab-hidden | global.css | extract_from_old | FIXED |
| 716 | .tab-item | global.css | extract_from_old | FIXED |
| 717 | .tab-item.active | global.css | extract_from_old | FIXED |
| 718 | .tab-item:hover | global.css | extract_from_old | FIXED |
| 719 | .tab-nav | global.css | extract_from_old | FIXED |
| 720 | .tabs .tab.active | global.css | extract_from_old | FIXED |
| 721 | .toolbar | global.css | extract_from_old | FIXED |
| 722 | .toolbar.is-compact | global.css | extract_from_old | FIXED |
| 723 | .toolbar.is-connected | global.css | extract_from_old | FIXED |
| 724 | .toolbar.is-connected > :not(:first-child) | global.css | extract_from_old | FIXED |
| 725 | .toolbar.is-connected > :not(:last-child) | global.css | extract_from_old | FIXED |
| 726 | .toolbar.is-vertical | global.css | extract_from_old | FIXED |
| 727 | .tooltip.visible | global.css | extract_from_old | FIXED |
| 728 | .tree-actions | global.css | extract_from_old | FIXED |
| 729 | .tree-actions button | global.css | extract_from_old | FIXED |
| 730 | .tree-actions button:hover | global.css | extract_from_old | FIXED |
| 731 | .tree-actions button[data-a="del-ch"]:hover | global.css | extract_from_old | FIXED |
| 732 | .tree-actions button[data-a="gen-body"]:hover | global.css | extract_from_old | FIXED |
| 733 | .tree-add-btn | global.css | extract_from_old | FIXED |
| 734 | .tree-add-btn:hover | global.css | extract_from_old | FIXED |
| 735 | .tree-ch-plot-btn | global.css | extract_from_old | FIXED |
| 736 | .tree-ch-plot-btn:hover | global.css | manual_extract | FIXED |
| 737 | .tree-chapter | global.css | extract_from_old | FIXED |
| 738 | .tree-chapter.active | global.css | extract_from_old | FIXED |
| 739 | .tree-chapter:hover | global.css | extract_from_old | FIXED |
| 740 | .tree-chapters | global.css | extract_from_old | FIXED |
| 741 | .tree-chapters.open | global.css | extract_from_old | FIXED |
| 742 | .tree-children | global.css | extract_from_old | FIXED |
| 743 | .tree-container | global.css | extract_from_old | FIXED |
| 744 | .tree-gen-btn | global.css | extract_from_old | FIXED |
| 745 | .tree-gen-btn:active | global.css | extract_from_old | FIXED |
| 746 | .tree-gen-btn:hover | global.css | extract_from_old | FIXED |
| 747 | .tree-header span | global.css | extract_from_old | FIXED |
| 748 | .tree-node-content | global.css | extract_from_old | FIXED |
| 749 | .tree-node-label | global.css | extract_from_old | FIXED |
| 750 | .tree-node.active::before | global.css | extract_from_old | FIXED |
| 751 | .tree-outline-node | global.css | extract_from_old | FIXED |
| 752 | .tree-outline-node .outline-icon | global.css | extract_from_old | FIXED |
| 753 | .tree-outline-node:hover | global.css | extract_from_old | FIXED |
| 754 | .tree-toggle | global.css | extract_from_old | FIXED |
| 755 | .tree-toggle.expanded | global.css | extract_from_old | FIXED |
| 756 | .tree-vol-btn | global.css | extract_from_old | FIXED |
| 757 | .tree-vol-btn:hover | global.css | extract_from_old | FIXED |
| 758 | .tree-volume-header | global.css | extract_from_old | FIXED |
| 759 | .tree-volume-header .arrow | global.css | extract_from_old | FIXED |
| 760 | .tree-volume-header .arrow.open | global.css | extract_from_old | FIXED |
| 761 | .tree-volume-header:hover | global.css | extract_from_old | FIXED |
| 762 | .tree-volume-header:hover .tree-actions | global.css | extract_from_old | FIXED |
| 763 | .vm-close | global.css | manual_extract | FIXED |
| 764 | .vm-close:active | global.css | manual_extract | FIXED |
| 765 | .vm-close:hover | global.css | manual_extract | FIXED |
| 766 | .writing-dashboard | global.css | extract_from_old | FIXED |
| 767 | 0.7vw | global.css | manual_extract | FIXED |
| 768 | 0.8vw | global.css | manual_extract | FIXED |
| 769 | 0.9vw | global.css | manual_extract | FIXED |
| 770 | 13px); } #app-sidebar | global.css | manual_extract | FIXED |
| 771 | 14px); } #chapter-tree | global.css | manual_extract | FIXED |
| 772 | 18px); } #editor-panel | global.css | manual_extract | FIXED |
| 773 | 1vw | global.css | manual_extract | FIXED |
| 774 | 20px); } #app-body | global.css | manual_extract | FIXED |
| 775 | 30% | global.css | extract_from_old | FIXED |
| 776 | 60% | global.css | manual_extract | FIXED |
| 777 | ::-webkit-scrollbar-corner | global.css | extract_from_old | FIXED |
| 778 | :is(.btn | global.css | extract_from_old | FIXED |
| 779 | :is(.editor-header | global.css | extract_from_old | FIXED |
| 780 | :is(.modal | global.css | extract_from_old | FIXED |
| 781 | :is(.modal) .form-group | global.css | extract_from_old | FIXED |
| 782 | :is(.modal) .modal-body | global.css | extract_from_old | FIXED |
| 783 | :is(.modal) .modal-close | global.css | extract_from_old | FIXED |
| 784 | :is(.modal) .modal-close:hover | global.css | extract_from_old | FIXED |
| 785 | :is(.modal) .modal-footer | global.css | extract_from_old | FIXED |
| 786 | :is(.modal) .modal-header | global.css | extract_from_old | FIXED |
| 787 | :is(.modal) .modal-header h3 | global.css | extract_from_old | FIXED |
| 788 | :is(.modal) .modal-tab | global.css | extract_from_old | FIXED |
| 789 | :is(.modal) .modal-tab.active | global.css | extract_from_old | FIXED |
| 790 | :is(.modal) .modal-tab:focus-visible | global.css | extract_from_old | FIXED |
| 791 | :is(.modal) .modal-tab:hover | global.css | extract_from_old | FIXED |
| 792 | :is(.modal) .modal-tabs | global.css | extract_from_old | FIXED |
| 793 | :is(.modal-footer | global.css | extract_from_old | FIXED |
| 794 | :is(.pl-actions button | global.css | extract_from_old | FIXED |
| 795 | :is(.pl-nav-btn | global.css | extract_from_old | FIXED |
| 796 | :is(.sidebar-btn | global.css | extract_from_old | FIXED |
| 797 | :root[data-theme="light"] | global.css | extract_from_old | FIXED |
| 798 | [class*="empty"] | global.css | manual_extract | FIXED |
| 799 | [class|="btn"] | global.css | extract_from_old | FIXED |
| 800 | [data-tooltip]::after | global.css | extract_from_old | FIXED |
| 801 | [id^=pl-s][id$=add-skill]:hover | global.css | manual_extract | FIXED |
| 802 | [role="button"]:focus-visible | global.css | extract_from_old | FIXED |
| 803 | [tabindex]:focus-visible | global.css | extract_from_old | FIXED |
| 804 | a | global.css | extract_from_old | FIXED |
| 805 | a:focus:not(:focus-visible) | global.css | extract_from_old | FIXED |
| 806 | a:hover | global.css | extract_from_old | FIXED |
| 807 | blockquote | global.css | extract_from_old | FIXED |
| 808 | button:active | global.css | extract_from_old | FIXED |
| 809 | button:active:not(:disabled) | global.css | extract_from_old | FIXED |
| 810 | button:disabled | global.css | extract_from_old | FIXED |
| 811 | button:focus-visible | global.css | extract_from_old | FIXED |
| 812 | button:not(.sidebar-btn):not(.btn-close):not(.btn-xs):not(.b | global.css | extract_from_old | FIXED |
| 813 | button:not(:is(.sidebar-btn | global.css | manual_extract | FIXED |
| 814 | button[class*='close'] | global.css | extract_from_old | FIXED |
| 815 | button[class*='close']:hover | global.css | extract_from_old | FIXED |
| 816 | button[class*='edit-btn'] | global.css | extract_from_old | FIXED |
| 817 | button[class*='edit-btn']:hover | global.css | extract_from_old | FIXED |
| 818 | button[data-a="del-ch"] | global.css | extract_from_old | FIXED |
| 819 | button[data-a="del-ch"]:hover | global.css | extract_from_old | FIXED |
| 820 | button[data-a="edit-ch"]:hover | global.css | extract_from_old | FIXED |
| 821 | button[id^="btn-close"] | global.css | extract_from_old | FIXED |
| 822 | button[id^="btn-close"]:hover | global.css | extract_from_old | FIXED |
| 823 | code | global.css | extract_from_old | FIXED |
| 824 | color: #e87d3d; font-weight: 600; }\n#btn-de-ai:hover | global.css | manual_extract | FIXED |
| 825 | display: none; } .btn-sm | global.css | manual_extract | FIXED |
| 826 | h1 | global.css | extract_from_old | FIXED |
| 827 | h2 | global.css | extract_from_old | FIXED |
| 828 | h3 | global.css | extract_from_old | FIXED |
| 829 | h4 | global.css | extract_from_old | FIXED |
| 830 | h5 | global.css | manual_extract | FIXED |
| 831 | h6 | global.css | manual_extract | FIXED |
| 832 | html | global.css | extract_from_old | FIXED |
| 833 | input:focus-visible | global.css | extract_from_old | FIXED |
| 834 | input[type="radio"] | global.css | extract_from_old | FIXED |
| 835 | input[type="range"] | global.css | extract_from_old | FIXED |
| 836 | input[type="range"]::-moz-range-thumb | global.css | extract_from_old | FIXED |
| 837 | input[type="range"]::-webkit-slider-thumb | global.css | extract_from_old | FIXED |
| 838 | input[type="range"]::-webkit-slider-thumb:hover | global.css | extract_from_old | FIXED |
| 839 | label | global.css | extract_from_old | FIXED |
| 840 | main > #app-body | global.css | extract_from_old | FIXED |
| 841 | main > #breadcrumb-bar | global.css | extract_from_old | FIXED |
| 842 | main > #panel-backdrop | global.css | extract_from_old | FIXED |
| 843 | main > #panel-backdrop.visible | global.css | extract_from_old | FIXED |
| 844 | min-width: 150px; max-width: 200px; } .header-selector | global.css | manual_extract | FIXED |
| 845 | min-width: 180px; max-width: 240px; } .editor-toolbar | global.css | manual_extract | FIXED |
| 846 | opacity:0;transform:translateY(8px) scale(0.98);}to | global.css | manual_extract | FIXED |
| 847 | p | global.css | extract_from_old | FIXED |
| 848 | p:last-child | global.css | extract_from_old | FIXED |
| 849 | pre | global.css | extract_from_old | FIXED |
| 850 | pre code | global.css | extract_from_old | FIXED |
| 851 | select option | global.css | extract_from_old | FIXED |
| 852 | select:disabled | global.css | extract_from_old | FIXED |
| 853 | select:focus | global.css | extract_from_old | FIXED |
| 854 | select:focus-visible | global.css | extract_from_old | FIXED |
| 855 | select:hover | global.css | extract_from_old | FIXED |
| 856 | table | global.css | extract_from_old | FIXED |
| 857 | td | global.css | extract_from_old | FIXED |
| 858 | textarea::placeholder | global.css | extract_from_old | FIXED |
| 859 | textarea:focus-visible | global.css | extract_from_old | FIXED |
| 860 | th | global.css | extract_from_old | FIXED |
| 861 | tr:hover td | global.css | extract_from_old | FIXED |
| 862 | tr:last-child td | global.css | extract_from_old | FIXED |
| 863 | width: 32px; height: 32px; } #chapter-tree | global.css | manual_extract | FIXED |
| 864 | width: 36px; height: 36px; } #chapter-tree | global.css | manual_extract | FIXED |
| 865 | width: 44px; } .sidebar-btn | global.css | manual_extract | FIXED |
| 866 | width: 48px; } .sidebar-btn | global.css | manual_extract | FIXED |
| 867 | input:focus-visible | global.css | manual_remaining | FIXED |
| 868 | textarea:focus-visible | global.css | manual_remaining | FIXED |
| 869 | #agent-form input[type="number"] | global.css | group_rule_extract | FIXED |
| 870 | #agent-form textarea | global.css | group_rule_extract | FIXED |
| 871 | #btn-export-epub | global.css | group_rule_extract | FIXED |
| 872 | #btn-redo | global.css | group_rule_extract | FIXED |
| 873 | #skill-form input[type="number"] | global.css | group_rule_extract | FIXED |
| 874 | .form-group) select | global.css | group_rule_extract | FIXED |
| 875 | .form-group) textarea | global.css | group_rule_extract | FIXED |
| 876 | .no-data | global.css | group_rule_extract | FIXED |
| 877 | .resizer-h | global.css | group_rule_extract | FIXED |
| 878 | input:focus-visible | global.css | group_rule_extract | FIXED |
| 879 | #agent-form .form-actions .btn-primary | global.css | extract_from_old | FIXED |
| 880 | #agent-form .form-actions .btn-primary:hover | global.css | extract_from_old | FIXED |
| 881 | #agent-form .form-actions .btn-secondary | global.css | extract_from_old | FIXED |
| 882 | #agent-form .form-actions .btn-secondary:hover | global.css | extract_from_old | FIXED |
| 883 | #agent-form input:focus | global.css | extract_from_old | FIXED |
| 884 | #agent-form input[type="text"] | global.css | extract_from_old | FIXED |
| 885 | #agent-form select:focus | global.css | extract_from_old | FIXED |
| 886 | #agent-form textarea:focus | global.css | extract_from_old | FIXED |
| 887 | #agent-info-bar span | global.css | extract_from_old | FIXED |
| 888 | #btn-close-pl | global.css | manual_extract | FIXED |
| 889 | #btn-close-pl:hover | global.css | manual_extract | FIXED |
| 890 | #btn-close-settings | global.css | extract_from_old | FIXED |
| 891 | #btn-close-settings:hover | global.css | extract_from_old | FIXED |
| 892 | #outline-workspace | global.css | extract_from_old | FIXED |
| 893 | #outline-workspace.visible:not(.ow-hidden) | global.css | extract_from_old | FIXED |
| 894 | #pipeline-panel | global.css | extract_from_old | FIXED |
| 895 | #pipeline-panel.visible:not(.pl-hidden) | global.css | extract_from_old | FIXED |
| 896 | #pl-step-2-content .btn-primary | global.css | extract_from_old | FIXED |
| 897 | #pl-volume-cards + button | global.css | extract_from_old | FIXED |
| 898 | #provider-edit-view input | global.css | extract_from_old | FIXED |
| 899 | #provider-edit-view textarea | global.css | extract_from_old | FIXED |
| 900 | #settings-collection-panel.visible:not(.sc-hidden) | global.css | extract_from_old | FIXED |
| 901 | #skill-form input:focus | global.css | extract_from_old | FIXED |
| 902 | #skill-form select:focus | global.css | extract_from_old | FIXED |
| 903 | #skill-list-active span | global.css | extract_from_old | FIXED |
| 904 | #status-model | global.css | extract_from_old | FIXED |
| 905 | #status-words | global.css | extract_from_old | FIXED |
| 906 | #tab-skills #btn-save-skill | global.css | extract_from_old | FIXED |
| 907 | *::before | global.css | extract_from_old | FIXED |
| 908 | .agent-item .agent-desc | global.css | extract_from_old | FIXED |
| 909 | .agent-item .agent-name | global.css | extract_from_old | FIXED |
| 910 | .agent-item .item-desc | global.css | extract_from_old | FIXED |
| 911 | .agent-item.active | global.css | extract_from_old | FIXED |
| 912 | .agent-status | global.css | extract_from_old | FIXED |
| 913 | .app-header a | global.css | extract_from_old | FIXED |
| 914 | .app-header button | global.css | extract_from_old | FIXED |
| 915 | .app-header input | global.css | extract_from_old | FIXED |
| 916 | .app-header select | global.css | extract_from_old | FIXED |
| 917 | .btn-back-sm:disabled | global.css | extract_from_old | FIXED |
| 918 | .btn-close.btn-disabled | global.css | extract_from_old | FIXED |
| 919 | .btn-close:disabled | global.css | extract_from_old | FIXED |
| 920 | .btn-close:focus-visible | global.css | extract_from_old | FIXED |
| 921 | .btn-danger.btn-disabled | global.css | extract_from_old | FIXED |
| 922 | .btn-danger.btn-loading | global.css | extract_from_old | FIXED |
| 923 | .btn-danger.btn-loading::after | global.css | extract_from_old | FIXED |
| 924 | .btn-danger.full-width | global.css | extract_from_old | FIXED |
| 925 | .btn-danger:not(:disabled):active | global.css | extract_from_old | FIXED |
| 926 | .btn-full-width | global.css | extract_from_old | FIXED |
| 927 | .btn-ghost.btn-disabled | global.css | extract_from_old | FIXED |
| 928 | .btn-ghost:disabled | global.css | extract_from_old | FIXED |
| 929 | .btn-ghost:focus-visible | global.css | extract_from_old | FIXED |
| 930 | .btn-ghost:not(:disabled):active | global.css | extract_from_old | FIXED |
| 931 | .btn-group | global.css | extract_from_old | FIXED |
| 932 | .btn-group.is-compact | global.css | extract_from_old | FIXED |
| 933 | .btn-group.is-connected | global.css | extract_from_old | FIXED |
| 934 | .btn-group.is-connected > :not(:first-child) | global.css | extract_from_old | FIXED |
| 935 | .btn-group.is-connected > :not(:last-child) | global.css | extract_from_old | FIXED |
| 936 | .btn-group.is-vertical | global.css | extract_from_old | FIXED |
| 937 | .btn-icon.btn-disabled | global.css | extract_from_old | FIXED |
| 938 | .btn-md | global.css | extract_from_old | FIXED |
| 939 | .btn-outline.btn-disabled | global.css | extract_from_old | FIXED |
| 940 | .btn-outline:disabled | global.css | extract_from_old | FIXED |
| 941 | .btn-outline:focus-visible | global.css | extract_from_old | FIXED |
| 942 | .btn-outline:not(:disabled):active | global.css | extract_from_old | FIXED |
| 943 | .btn-primary.btn-disabled | global.css | extract_from_old | FIXED |
| 944 | .btn-primary.btn-loading | global.css | extract_from_old | FIXED |
| 945 | .btn-primary.btn-loading::after | global.css | extract_from_old | FIXED |
| 946 | .btn-primary.full-width | global.css | extract_from_old | FIXED |
| 947 | .btn-primary:not(:disabled):active | global.css | extract_from_old | FIXED |
| 948 | .btn-secondary.btn-disabled | global.css | extract_from_old | FIXED |
| 949 | .btn-secondary.btn-loading | global.css | extract_from_old | FIXED |
| 950 | .btn-secondary.btn-loading::after | global.css | extract_from_old | FIXED |
| 951 | .btn-secondary.full-width | global.css | extract_from_old | FIXED |
| 952 | .btn-secondary:not(:disabled):active | global.css | extract_from_old | FIXED |
| 953 | .btn-send:focus-visible | global.css | extract_from_old | FIXED |
| 954 | .btn-toggle.btn-disabled | global.css | extract_from_old | FIXED |
| 955 | .btn-toggle:disabled | global.css | extract_from_old | FIXED |
| 956 | .btn-toggle:focus-visible | global.css | extract_from_old | FIXED |
| 957 | .btn-toggle:not(:disabled):active | global.css | extract_from_old | FIXED |
| 958 | .btn-var.btn-disabled | global.css | extract_from_old | FIXED |
| 959 | .btn-var:disabled | global.css | extract_from_old | FIXED |
| 960 | .btn-var:focus-visible | global.css | extract_from_old | FIXED |
| 961 | .btn-var:not(:disabled):active | global.css | extract_from_old | FIXED |
| 962 | .btn.btn-disabled | global.css | extract_from_old | FIXED |
| 963 | .btn.btn-loading | global.css | extract_from_old | FIXED |
| 964 | .btn.btn-loading::after | global.css | extract_from_old | FIXED |
| 965 | .btn.full-width | global.css | extract_from_old | FIXED |
| 966 | .btn:active | global.css | extract_from_old | FIXED |
| 967 | .btn:disabled | global.css | extract_from_old | FIXED |
| 968 | .btn:focus-visible | global.css | extract_from_old | FIXED |
| 969 | .btn:not(:disabled):active | global.css | extract_from_old | FIXED |
| 970 | .checkbox-list > label | global.css | extract_from_old | FIXED |
| 971 | .checkbox-list > label:hover | global.css | extract_from_old | FIXED |
| 972 | .checkbox-list > li | global.css | extract_from_old | FIXED |
| 973 | .checkbox-list > li:hover | global.css | extract_from_old | FIXED |
| 974 | .ctx-content button | global.css | extract_from_old | FIXED |
| 975 | .ctx-content button:hover | global.css | extract_from_old | FIXED |
| 976 | .ctx-section .ctx-item | global.css | extract_from_old | FIXED |
| 977 | .ctx-section .ctx-item:active | global.css | extract_from_old | FIXED |
| 978 | .ctx-section .ctx-item:focus-visible | global.css | extract_from_old | FIXED |
| 979 | .ctx-section .ctx-item:hover | global.css | extract_from_old | FIXED |
| 980 | .dialog-footer) button | global.css | manual_extract | FIXED |
| 981 | .divider-gradient | global.css | extract_from_old | FIXED |
| 982 | .editor-toolbar) button | global.css | manual_extract | FIXED |
| 983 | .editor-toolbar) button:active | global.css | manual_extract | FIXED |
| 984 | .editor-toolbar) button:hover | global.css | manual_extract | FIXED |
| 985 | .editor-toolbar).is-connected button | global.css | manual_extract | FIXED |
| 986 | .editor-toolbar).is-connected button:last-child | global.css | manual_extract | FIXED |
| 987 | .form-group input.invalid | global.css | extract_from_old | FIXED |
| 988 | .form-group input.invalid:focus | global.css | extract_from_old | FIXED |
| 989 | .form-group) input::placeholder | global.css | manual_extract | FIXED |
| 990 | .form-group) input:focus | global.css | manual_extract | FIXED |
| 991 | .form-group) input[type="checkbox"] | global.css | manual_extract | FIXED |
| 992 | .form-group) select | global.css | manual_extract | FIXED |
| 993 | .form-group) textarea | global.css | manual_extract | FIXED |
| 994 | .form-group.has-error input | global.css | extract_from_old | FIXED |
| 995 | .form-label | global.css | extract_from_old | FIXED |
| 996 | .header-selector:focus | global.css | extract_from_old | FIXED |
| 997 | .header-selector:hover | global.css | extract_from_old | FIXED |
| 998 | .item-card) > :is(.card-footer | global.css | manual_extract | FIXED |
| 999 | .item-footer) button | global.css | manual_extract | FIXED |
| 1000 | .mem-form .form-group input:focus | global.css | extract_from_old | FIXED |
| 1001 | .mem-form .form-group input:hover | global.css | extract_from_old | FIXED |
| 1002 | .mem-form .form-group textarea:focus | global.css | extract_from_old | FIXED |
| 1003 | .mem-form .form-group textarea:hover | global.css | extract_from_old | FIXED |
| 1004 | .mem-form > input | global.css | extract_from_old | FIXED |
| 1005 | .mem-form > input:focus | global.css | extract_from_old | FIXED |
| 1006 | .mem-form > textarea | global.css | extract_from_old | FIXED |
| 1007 | .mem-form > textarea:focus | global.css | extract_from_old | FIXED |
| 1008 | .pl-step-content > .pl-empty | global.css | extract_from_old | FIXED |
| 1009 | .pl-step-content p | global.css | extract_from_old | FIXED |
| 1010 | .pl-step-status[data-status="error"] | global.css | extract_from_old | FIXED |
| 1011 | .pl-step-status[data-status="pending"] | global.css | extract_from_old | FIXED |
| 1012 | .pl-vol-card + button | global.css | extract_from_old | FIXED |
| 1013 | .pl-vol-card .pl-vol-actions | global.css | manual_extract | FIXED |
| 1014 | .pl-vol-card .pl-vol-card-body | global.css | manual_extract | FIXED |
| 1015 | .pl-vol-card .pl-vol-card-header | global.css | manual_extract | FIXED |
| 1016 | .pl-vol-card .pl-vol-card-title | global.css | manual_extract | FIXED |
| 1017 | .pl-vol-card > div > button | global.css | extract_from_old | FIXED |
| 1018 | .provider-card.provider-card-active | global.css | extract_from_old | FIXED |
| 1019 | .provider-card:active | global.css | extract_from_old | FIXED |
| 1020 | .provider-model-enable.enabled | global.css | extract_from_old | FIXED |
| 1021 | .provider-model-enable.enabled:hover | global.css | extract_from_old | FIXED |
| 1022 | .resizer-h | global.css | manual_extract | FIXED |
| 1023 | .sc-attr-row button | global.css | extract_from_old | FIXED |
| 1024 | .sc-cat-btn.active:hover | global.css | extract_from_old | FIXED |
| 1025 | .sc-item-form .form-group input | global.css | extract_from_old | FIXED |
| 1026 | .sc-item-form .form-group input:focus | global.css | extract_from_old | FIXED |
| 1027 | .sc-item-form .form-group input:hover | global.css | extract_from_old | FIXED |
| 1028 | .sc-item-form .form-group textarea:focus | global.css | extract_from_old | FIXED |
| 1029 | .sc-item-form .form-group textarea:hover | global.css | extract_from_old | FIXED |
| 1030 | .sc-item-form > input | global.css | extract_from_old | FIXED |
| 1031 | .sc-item-form > input:focus | global.css | extract_from_old | FIXED |
| 1032 | .sc-item-form > textarea | global.css | extract_from_old | FIXED |
| 1033 | .sc-item-form > textarea:focus | global.css | extract_from_old | FIXED |
| 1034 | .skill-bar | global.css | extract_from_old | FIXED |
| 1035 | .skill-bar button | global.css | extract_from_old | FIXED |
| 1036 | .skill-item | global.css | extract_from_old | FIXED |
| 1037 | .skill-item .item-actions | global.css | extract_from_old | FIXED |
| 1038 | .skill-item .item-desc | global.css | extract_from_old | FIXED |
| 1039 | .skill-item .item-meta | global.css | extract_from_old | FIXED |
| 1040 | .skill-item .item-name | global.css | extract_from_old | FIXED |
| 1041 | .skill-item .skill-desc | global.css | extract_from_old | FIXED |
| 1042 | .skill-item .skill-name | global.css | extract_from_old | FIXED |
| 1043 | .skill-item.active | global.css | extract_from_old | FIXED |
| 1044 | .skill-item.selected | global.css | extract_from_old | FIXED |
| 1045 | .skill-item:hover | global.css | extract_from_old | FIXED |
| 1046 | .skill-status | global.css | extract_from_old | FIXED |
| 1047 | .tab-bar | global.css | extract_from_old | FIXED |
| 1048 | .tab-bar .tab | global.css | extract_from_old | FIXED |
| 1049 | .tab-bar .tab.active | global.css | extract_from_old | FIXED |
| 1050 | .tab-bar .tab:hover | global.css | extract_from_old | FIXED |
| 1051 | .toast-item | global.css | extract_from_old | FIXED |
| 1052 | .toast.error | global.css | extract_from_old | FIXED |
| 1053 | .toast.success | global.css | extract_from_old | FIXED |
| 1054 | .tree-chapter:hover .tree-actions | global.css | extract_from_old | FIXED |
| 1055 | .tree-item | global.css | extract_from_old | FIXED |
| 1056 | .tree-item.active | global.css | extract_from_old | FIXED |
| 1057 | .tree-item:hover | global.css | extract_from_old | FIXED |
| 1058 | .tree-item:hover .tree-actions | global.css | extract_from_old | FIXED |
| 1059 | .tree-node | global.css | extract_from_old | FIXED |
| 1060 | .tree-node.active | global.css | extract_from_old | FIXED |
| 1061 | .tree-node:hover | global.css | extract_from_old | FIXED |
| 1062 | .tree-node:hover .tree-actions | global.css | extract_from_old | FIXED |
| 1063 | :is(.modal) .btn-close | global.css | extract_from_old | FIXED |
| 1064 | :is(.modal) .btn-close:hover | global.css | extract_from_old | FIXED |
| 1065 | [class|="btn"]:disabled | global.css | extract_from_old | FIXED |
| 1066 | [class|="btn"]:focus-visible | global.css | extract_from_old | FIXED |
| 1067 | a:focus-visible | global.css | extract_from_old | FIXED |
| 1068 | button).btn-loading | global.css | manual_extract | FIXED |
| 1069 | button).btn-loading > * | global.css | manual_extract | FIXED |
| 1070 | button).btn-loading::after | global.css | manual_extract | FIXED |
| 1071 | button).btn-loading::before | global.css | manual_extract | FIXED |
| 1072 | button).is-disabled | global.css | manual_extract | FIXED |
| 1073 | button):disabled | global.css | manual_extract | FIXED |
| 1074 | button.btn-disabled | global.css | extract_from_old | FIXED |
| 1075 | button:focus:not(:focus-visible) | global.css | extract_from_old | FIXED |
| 1076 | button[data-a="del-vol"] | global.css | extract_from_old | FIXED |
| 1077 | button[data-a="del-vol"]:hover | global.css | extract_from_old | FIXED |
| 1078 | button[data-a="edit-ch"] | global.css | extract_from_old | FIXED |
| 1079 | button[data-a="edit-vol"] | global.css | extract_from_old | FIXED |
| 1080 | button[data-a="edit-vol"]:hover | global.css | extract_from_old | FIXED |
| 1081 | button[data-a="gen-body"] | global.css | extract_from_old | FIXED |
| 1082 | button[data-a="gen-body"]:hover | global.css | extract_from_old | FIXED |
| 1083 | input::placeholder | global.css | extract_from_old | FIXED |
| 1084 | input:disabled | global.css | extract_from_old | FIXED |
| 1085 | input:focus | global.css | extract_from_old | FIXED |
| 1086 | input:not([type]) | global.css | extract_from_old | FIXED |
| 1087 | input[type="checkbox"] | global.css | extract_from_old | FIXED |
| 1088 | input[type="email"] | global.css | extract_from_old | FIXED |
| 1089 | input[type="number"] | global.css | extract_from_old | FIXED |
| 1090 | input[type="password"] | global.css | extract_from_old | FIXED |
| 1091 | input[type="search"] | global.css | extract_from_old | FIXED |
| 1092 | input[type="text"] | global.css | extract_from_old | FIXED |
| 1093 | input[type="url"] | global.css | extract_from_old | FIXED |
| 1094 | textarea:disabled | global.css | extract_from_old | FIXED |
| 1095 | textarea:focus | global.css | extract_from_old | FIXED |

## Verification

| Check | Result | Note |
|-------|--------|------|
| Variables | 254/254 | Zero missing |
| Media Queries | 15/15 | Zero missing |
| Keyframes | 40/41 | 1 false-positive (comment ref) |
| Selectors | 2088/1605 | 4 false-positive (already in file) |
| Brace Balance | PASS | Verified - depth 0 |
