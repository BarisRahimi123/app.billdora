# Priority & Favorite Client – Implementation Status & Plan

## What exists today

### Data model (`Client` in `src/lib/api.ts`)
- **`priority`** (number | null): 1 = highest, 2 = medium, 3 = lower. Stored in DB, updated via `api.updateClient(id, { priority })`.
- **`is_favorite`** (boolean): Present on the type and in the DB. Used **only for sorting** in one place (QuoteDocumentPage). **There is no UI to set or toggle it** anywhere in the app.

### Where priority is implemented

| Area | What’s done |
|------|-------------|
| **SalesPage** | Client list sorted by priority. “① Priority” filter and section. `ClientPriorityDropdown` to set client priority (I / II / III). |
| **ProjectsPage** | Client sidebar sorted by priority. `PriorityDropdown` for clients and for projects. Priority section in client filter. |
| **QuoteDocumentPage** | Client dropdown: sort order is **favorites first → priority → name** (in code after `getClients`). No priority/favorite UI on this page. |

### Where it was missing (and is now fixed)

| Area | Change made |
|------|-------------|
| **InvoicingPage** | Create Invoice modal client dropdown and “All Clients” filter now use **`sortClientsForDisplay(clients)`** (favorites → priority → name). |
| **ProjectsPage** | Project create/edit modals: client dropdowns now use **`sortClientsForDisplay(clients)`**. |
| **ProjectShareAcceptPage** | “Select a client” dropdown now uses **`sortClientsForDisplay(clients)`**. |

### Shared helper (`src/lib/utils.ts`)
- **`sortClientsForDisplay(clients)`**: Sorts by `is_favorite` first, then `priority` (1, 2, 3), then `name`. Use this anywhere a flat client list is shown (dropdowns, filters, simple lists).

---

## Plan: where to add priority/favorite next

### 1. Invoicing
- **Done:** Create Invoice client dropdown and invoice list “All Clients” filter use priority/favorite sort.
- **Optional later:** “Priority only” filter (like SalesPage) for the invoice list; or a small priority indicator next to client name in the Create Invoice modal.

### 2. Project creation / edit
- **Done:** Client dropdown in project create and project edit modals uses priority/favorite sort.
- **Optional later:** When choosing “Client” in the project form, show a small badge (e.g. “①”) for priority clients.

### 3. Proposals / Quotes (QuoteDocumentPage)
- **Done:** Client list is already sorted (favorites → priority → name) when loaded.
- **Optional later:** Add a way to set **favorite** (e.g. star icon) from the quote flow or from Sales/Projects client list so “favorites first” is meaningful.

### 4. Favorite UI (not implemented anywhere)
- **`is_favorite`** is never set by the user. To make “favorites first” useful:
  - **Option A:** Add a star (or heart) on **SalesPage** and **ProjectsPage** client rows to toggle `is_favorite` (call `api.updateClient(id, { is_favorite: true/false })`).
  - **Option B:** Add the same toggle in a client detail/settings view if you have one.
- **DB:** Ensure `clients.is_favorite` exists and is exposed in your API (already on the `Client` type).

### 5. Other places that show clients
- **DashboardPage** – If it has a client dropdown or client list, use `sortClientsForDisplay(clients)`.
- **ReportsPage** – Uses `clients.map` for per-user client data; if there’s a global client selector, sort there.
- **SettingsPage** – If client selection exists (e.g. for defaults), use `sortClientsForDisplay`.
- **Time & expense / Resourcing** – If user selects “client” or “project” and project implies client, the project dropdown is usually the main control; client sort applies where a **client** list is shown.
- **ProjectShareAcceptPage** – **Done:** client dropdown uses `sortClientsForDisplay`.
- **PendingProjectInvitations** – If it renders a client list, use the same sort.
- **Layout / global nav** – If a client switcher exists, sort the list.

### 6. Consistency checklist (future)
- [ ] Every **client dropdown** (create invoice, create/edit project, proposals, share project, settings, etc.) uses **`sortClientsForDisplay`**.
- [ ] **Priority** can be set from at least one place (already: Sales + Projects).
- [ ] **Favorite** can be set from at least one place (e.g. Sales + Projects client row star).
- [ ] Optional: “Priority only” or “Favorites only” filters wherever a long client list is shown (Sales ✅, Invoicing optional, Projects optional).

---

## Summary

- **Priority:** Implemented on Sales and Projects (set + sort). Now **also used for sort order** in Invoicing (Create Invoice + filter), Projects (client dropdowns), and ProjectShareAcceptPage. Use **`sortClientsForDisplay`** for any new client dropdown.
- **Favorite:** Only used in sort (favorites first). **No UI to set it yet** – add a star (or similar) on client rows in Sales/Projects and `api.updateClient(id, { is_favorite })` when you want this to be usable.
