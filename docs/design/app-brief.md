# Surface brief: Save Brave app (Operate)

## Direction contract

Replaces the earlier "Polymer banknote" direction (2026-10-29). The user pinned this reference:
https://uxpilot.ai/mobile-design-templates/budget-planner-ui. The look below follows it.

THESIS: Your month on one figure. Every screen answers "where do I stand" with the headline number first.

OWN-WORLD: Monochrome iOS finance. Near-black header band (#111111) carrying the screen title and the headline figure in large white type. Below it, a white sheet with 32px rounded top corners and a small grab handle holds the content. Greys: #F3F4F6 fills, #E5E7EB rules, #1C1C1E ink. Inter type, tabular figures wherever money appears. Rounded 16px cards with a 1px grey border; round grey icon chips; black pill buttons; black is the active/selected colour.

COLOUR: Monochrome by default. Colour appears only where it carries status: amber at 80% of a limit, red when over, green when a target is met, a quiet purple tag for shared items. Status always also has text.

STORY: Open → the month's saved figure in the header, then the budget cards in a two-column grid, alerts above them. "+" always one thumb away.

SIGNATURE: The header-to-sheet seam: dark band, white sheet rising over it with the grab handle. The Add sheet repeats it.

RISK: The status colours drift into decoration; low-contrast grey text on white (the template's #8A8A8E fails 4.5:1, so body grey is darker).
