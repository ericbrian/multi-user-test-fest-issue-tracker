---
name: design-aesthetics
description: Ensure the user interface meets premium design standards, maintains consistency with existing design tokens, and provides a polished user experience.
---

# Design Aesthetics Skill

This skill ensures that all UI/UX changes in `test-fest-tracker` adhere to a "Premium" and professional aesthetic.

## When to use this skill

- When modifying `public/index.html` or other templates.
- When updating styles in `public/styles.css`.
- When implementing new features via `public/js/`.
- During UI polish phases.

## Core Design Principles

### 1. Visual Hierarchy & Premium Feel

- **Gradients & Shadows**: Use specific CSS variables for gradients (`--bg-gradient`) and soft shadows (`--shadow-card`).
- **Glassmorphism**: Use `backdrop-filter: blur(10px)` and semi-transparent backgrounds (`rgba(255, 255, 255, 0.1)`) for overlays/modals.
- **Typography**: Stick to the project's font family (Inter/Sans-serif).

### 2. Consistency & Design Tokens

- **CSS Variables**: Always use the variables defined in `public/styles.css` (e.g., `--primary-color`, `--text-color`) instead of hardcoding hex values.
- **Transitions**: Interactive elements should use `transition: all 0.2s ease`.

### 3. Component Reusability (CSS Classes)

- **Cards**: Use `.card` and `.glass-panel` classes.
- **Buttons**: Use `.btn`, `.btn-primary`, `.btn-secondary` classes.
- **Forms**: Use standard `.form-group`, `.form-control`, and `.form-label` structures.
- **Empty States**: Ensure empty lists have a visual representation (icons/text) using `.empty-state`.

### 4. Animation & Interaction

- **Micro-animations**: Add `:hover` effects (scale, brightness).
- **Feedback**: Show loading spinners or toast notifications for async actions.

## Procedures

### New Feature UI

1. Draft HTML structure in `index.html` or JS template string.
2. Apply existing CSS utility classes from `styles.css`.
3. If new styles are needed, add them to `styles.css` (grouped by feature).
4. Verify responsiveness (Mobile first or Desktop down).
5. Check Dark Mode compatibility (via CSS variables).

### UI Review

1. Check for alignment.
2. Ensure color contrast meets accessibility.
3. Verify "Glassmorphism" effect is consistent.

## Example Requests

- "Update the issue list card to look more premium."
- "Add a glassmorphism effect to the modal background."
- " Ensure the new input form matches the 'btn-primary' style."
- "Check if the dashboard is responsive on mobile."
