---
name: design-aesthetics
description: Ensure the user interface meets premium design standards, maintains consistency with existing design tokens, and provides a polished user experience.
---

# Design Aesthetics Skill

This skill ensures that all UI/UX changes in Numis adhere to a "Premium" and professional numismatic collection management aesthetic.

## When to use this skill

- When creating new React components.
- When modifying existing layouts or pages.
- When implementing new features that require visual representation.
- During UI polish phases.

## Core Design Principles

### 1. Visual Hierarchy & Premium Feel

- **Gradients & Shadows**: Use subtle gradients and soft shadows to provide depth. Avoid flat, uninspired colors.
- **Glassmorphism**: Use `backdrop-filter: blur()` for overlays and modals to create a modern, high-end feel.
- **Typography**: Stick to the project's font family (Inter/Sans-serif). Use clear font-weight distinctions for headers.

### 2. Consistency & Design Tokens

- **Color Palette**:

- **Transitions**: All interactive elements (buttons, links, toggles) should have smooth transitions (e.g., `transition: all 0.2s ease`).

### 3. Component Reusability

- **Forms**: Always use `FormSection` and `FormField` from `src/components/Common/`.
- **Buttons**: Use the consistent button styling defined in `index.css`.
- **Empty States**: Design beautiful empty states with relevant icons or illustrations instead of plain text.

### 4. Animation & Interaction

- **Micro-animations**: Add subtle hover effects (e.g., slight scale up, shadow increase).
- **Transitions**: Ensure page transitions or content swaps feel animated and not jarred.

## Procedures

### New Component Design

1. Identify existing components that share similar logic.
2. Draft the layout using Semantic HTML.
3. Apply Utility classes (if using Tailwind) or consistent CSS classes.
4. Verify responsiveness (Mobile, Tablet, Desktop).
5. Check Dark Mode compatibility.

### UI Review

1. Open the page in both Light and Dark modes.
2. Check for alignment issues (use a grid if possible).
3. Ensure color contrast meets accessibility standards (WCAG AA).

## Example Requests

- "Design a premium-looking card component for displaying individual coins."
- "The contact form looks a bit dated; update it with better gradients and a glassmorphism feel."
- "Ensure the new dashboard is fully responsive and looks great on mobile."
- "Add a smooth micro-animation to the primary 'Add Item' button."
- "Check if the newly added color theme matches our existing brand tokens."
