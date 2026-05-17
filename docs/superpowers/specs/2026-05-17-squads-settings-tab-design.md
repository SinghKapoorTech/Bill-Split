# Squads Settings Tab — Design Spec

**Date:** 2026-05-17  
**Status:** Approved

## Summary

Add a 4th "Squads" tab to the Settings page that lets users manage their squads without leaving Settings. Clicking a squad card opens a focused modal for adding/removing members. The existing `/squads` page is untouched.

---

## Architecture

### New files

| File | Purpose |
|------|---------|
| `src/components/squads/SquadMembersEditor.tsx` | Extracted member add/remove UI (refactored out of `SquadForm`) |
| `src/components/squads/SquadMembersModal.tsx` | Dialog wrapping `SquadMembersEditor` for a specific squad |
| `src/components/settings/SquadsSettingsCard.tsx` | Card content for the Settings Squads tab |

### Modified files

| File | Change |
|------|--------|
| `src/pages/SettingsView.tsx` | Add 4th Squads tab; `grid-cols-3 → grid-cols-4` |
| `src/components/squads/SquadForm.tsx` | Replace inline members section with `<SquadMembersEditor>` |
| `src/components/squads/SquadList.tsx` | Add optional `onCardClick` prop to `SquadCard` to override navigate |

---

## Component Details

### `SquadMembersEditor`

Extracted from the members section of `SquadForm`. Renders:
- Friend-search input with autocomplete (reuses `useFriendSearch`)
- "Add Guest Contact Info" toggle (email/phone/venmo inputs)
- "Add member" button (`UserPlus` icon)
- Current members list with contact info and remove buttons

**Props:**
```ts
interface SquadMembersEditorProps {
  members: SquadMember[];
  onChange: (members: SquadMember[]) => void;
}
```

`SquadForm` replaces its inline member section with `<SquadMembersEditor members={members} onChange={setMembers} />`.

---

### `SquadMembersModal`

Dialog that opens when a squad card is clicked in the Settings tab.

**Props:**
```ts
interface SquadMembersModalProps {
  squad: HydratedSquad;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (members: SquadMember[]) => Promise<void>;
}
```

**Behavior:**
- Title: squad name, subtitle: "Manage members"
- Body: `<SquadMembersEditor>` initialized with squad's current members
- Footer: "Save Changes" button (calls `onSave`, then closes) — disabled when fewer than 2 members remain
- Saving calls `useSquadManager.updateSquad` with the updated member list (name/description unchanged)

---

### `SquadsSettingsCard`

Card content for the Settings Squads tab. Mirrors `SquadsView` behavior but scoped to a card.

**Uses:** `useSquadEditor` hook (same as `SquadsView`), `SquadList`, `SquadForm`, `SquadMembersModal`

**Behavior:**
- Header: "My Squads" + count, "New Squad" button (opens `SquadForm` create dialog)
- Loading: skeleton (same 3-row pulse pattern as `SquadsView`)
- Empty state: same as `SquadsView` (Users icon, "No squads yet", "Create Squad" button)
- Squad cards: `SquadList` with `onCardClick` prop → opens `SquadMembersModal`
- Edit (pencil icon): opens `SquadForm` dialog in edit mode (same as `SquadsView`)
- Delete (trash icon): `AlertDialog` confirmation (same wording as `SquadsView`)

---

### `SettingsView` changes

- Tab grid: `grid-cols-3` → `grid-cols-4`
- New tab trigger: `Shield` icon, label "Squads", value `"squads"`
- New tab content: `<SquadsSettingsCard />`

---

## Styling Constraints

- All member row styling (`bg-secondary/30`, font sizes, `X` buttons) comes from `SquadMembersEditor` — identical in both `SquadForm` and `SquadMembersModal`
- Friend search dropdown markup is identical to current `SquadForm` implementation
- Squad cards, empty state, loading skeleton, and `AlertDialog` copy verbatim from `SquadsView`/`SquadList`
- No new CSS classes introduced; all existing Tailwind utilities reused

---

## Out of Scope

- Editing squad name/description from the members modal (full edit is still via the Edit button → `SquadForm`)
- Navigating to the squad detail page (`/squads/{id}`) from the settings tab
- Any changes to `SquadsView.tsx`
