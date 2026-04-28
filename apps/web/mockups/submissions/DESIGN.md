# Design System Specification: The Precision Architect

## 1. Overview & Creative North Star: "The Analytical Sanctuary"
In the high-stakes world of Monitoring and Evaluation (M&E), data is the foundation of truth. This design system moves beyond the "generic SaaS dashboard" by adopting a Creative North Star we call **The Analytical Sanctuary**. 

Instead of overwhelming the user with dense grids and harsh lines, we create a high-end editorial experience that feels authoritative yet calm. We break the "template" look through **Intentional Asymmetry**—where sidebar navigation and data entry panels use staggered widths—and **Tonal Depth**, using stacked surfaces rather than lines to define the workspace. The result is a platform that feels like a premium productivity tool: sophisticated, intentional, and surgically precise.

---

## 2. Colors & Surface Logic
The palette is rooted in a spectrum of deep, trustworthy blues (`primary`) and cool, architectural greys (`secondary`).

### The "No-Line" Rule
To achieve a signature, high-end look, **1px solid borders are prohibited for sectioning.** We define boundaries through background color shifts. A `surface-container-low` sidebar sitting against a `surface` background creates a cleaner, more modern separation than a stroke ever could.

### Surface Hierarchy & Nesting
Think of the UI as physical layers of fine paper. 
- **Base Layer:** `surface` (#f9f9ff) for the main application background.
- **Sectioning:** Use `surface-container-low` (#f1f3ff) for secondary navigation or utility panels.
- **Content Blocks:** Use `surface-container-lowest` (#ffffff) for the primary data entry cards. This creates a "lifted" feel that draws the eye to the input task.
- **Focus Areas:** Use `surface-container-high` (#e0e8ff) for active or highlighted regions.

### The "Glass & Gradient" Rule
For floating elements like modals or popovers, use **Glassmorphism**. Apply a semi-transparent `surface` color with a `20px` backdrop blur. For main Action Buttons, use a subtle linear gradient from `primary` (#0056d2) to `primary_dim` (#004bb9) at a 135° angle. This adds a "visual soul" and tactile depth that flat colors lack.

---

## 3. Typography: Editorial Authority
We utilize a dual-font strategy to balance character with extreme readability.

*   **Display & Headlines (Manrope):** A geometric sans-serif that feels modern and architectural. 
    *   Use `display-lg` (3.5rem) for high-level data summaries.
    *   Use `headline-sm` (1.5rem) for section titles to assert authority.
*   **Interface & Body (Inter):** The gold standard for data legibility.
    *   `body-md` (0.875rem) is your workhorse for form labels and data entry.
    *   `label-sm` (0.6875rem) in `on_surface_variant` is used for metadata, ensuring high-contrast hierarchy without clutter.

---

## 4. Elevation & Depth
We eschew traditional drop shadows for **Tonal Layering**.

*   **The Layering Principle:** Depth is achieved by "stacking." A `surface-container-lowest` card placed on a `surface-container-low` background creates a natural, soft lift.
*   **Ambient Shadows:** When a component must float (e.g., a dropdown), use an extra-diffused shadow: `box-shadow: 0 12px 40px rgba(20, 49, 97, 0.06);`. Note the use of `on_surface` (#143161) as the shadow tint rather than pure black; this mimics natural light.
*   **The "Ghost Border" Fallback:** If a border is required for accessibility, use `outline_variant` (#99b2e9) at **20% opacity**. Never use 100% opaque strokes.

---

## 5. Components & Data Input

### Form Fields (The Core Experience)
Data input is the heart of M&E.
*   **Structure:** Fields should use `surface-container-lowest` with a "Ghost Border." On focus, the border transitions to 2px `primary` (#0056d2).
*   **Labels:** Always use `label-md` in `on_surface`. Never hide labels inside inputs.
*   **Error States:** Use `error` (#9f403d) for text and a subtle `error_container` (#fe8983) at 10% opacity for the field background to ensure the error is felt, not just seen.

### Buttons
*   **Primary:** Gradient (Primary to Primary-Dim), `md` (0.375rem) roundedness.
*   **Secondary:** Ghost style. No background, `outline` stroke at 30% opacity, `on_surface` text.

### Cards & Data Lists
*   **The No-Divider Rule:** Forbid the use of horizontal rules. Separate list items using `8` (1.75rem) of vertical white space or alternating subtle background shifts between `surface` and `surface-container-low`.
*   **Data Chips:** Use `secondary_container` for read-only tags and `primary_container` for interactive filters. Keep corners at `full` (9999px) to contrast with the more structured `md` corners of form fields.

### Modern Productivity Additions
*   **The Progress Ribbon:** A 4px slim line at the top of a data-entry card using a gradient of `primary` to indicate completion percentage.
*   **Sticky Summary Bar:** A glassmorphic footer that stays anchored during long form scrolls, using `surface_container_lowest` with 80% opacity and backdrop-blur.

---

## 6. Do’s and Don’ts

### Do:
*   **Do** use the Spacing Scale religiously. Use `16` (3.5rem) for major section padding to allow the data to "breathe."
*   **Do** use `surface-tint` for subtle highlights in active navigation states.
*   **Do** prioritize high contrast. Ensure `on_surface` text always sits on a `surface` tier that provides at least a 7:1 contrast ratio.

### Don't:
*   **Don't** use 1px solid black or dark grey borders to separate content.
*   **Don't** use standard "drop shadows" (0, 2, 4). Always use the Ambient Shadow spec.
*   **Don't** crowd the UI. If a screen feels busy, increase the spacing between containers using the `10` or `12` scale tokens rather than adding lines.