# Navigation, buttons and cards

Use the shared application menu and UI primitives. Product chrome, window controls and card presentation follow [product presentation](overview.md); forms use [the input contract](inputs-and-forms.md).

**`dialog-action-quiet`** — A low-emphasis alternative action in application dialogs. It uses a transparent background, no border, muted text at 13px, and adopts the shared neutral interaction fill plus normal text color on hover. Use it for reversible choices such as “Switch this window” and “Cancel” beside a filled primary action; do not render those choices as bordered secondary buttons. Keep destructive actions visually separate from this quiet action and the primary confirmation.

Dialog footers that pair Cancel with a primary confirmation use the same action hierarchy as the model-configuration dialog: a transparent muted Cancel action followed by the shared compact primary pill. Keep workspace-opening dialogs on this pattern so native-path workflows do not introduce a separate button grammar.

**Settings actions** — Keep settings-page and onboarding actions on a compact 30px grammar with an icon and explicit semantic hierarchy. Creation actions use a content-sized primary blue pill instead of a full-width gray bar. Ordinary file, test, and navigation actions use an 8px shadowless filled control with the same restrained `--mica-divider` perimeter as Settings inputs; inline row-building actions use a shadowless blue text treatment. Destructive actions use a restrained danger-tinted fill and matching subtle perimeter, especially inside a grouped Settings card. Status text and switches remain flat and must not be wrapped in additional gray capsules.

**Top-bar management windows** — Settings windows opened from the application menu share a compact typography rhythm: 13px body labels at 1.45 line-height, 12px supporting copy at 1.45, and 16px section headings at 1.35. Content columns use a 24px inset and 24px section rhythm; variants such as provider and channel lists may add their own structural columns but must retain these type tokens. Keep larger type limited to an intentional window-level heading, not individual settings rows.

Inline links consume the active theme primary color and preserve keyboard focus. Cards use the semantic surface and matching foreground; Settings cards use the shared shadowless Mica treatment.
