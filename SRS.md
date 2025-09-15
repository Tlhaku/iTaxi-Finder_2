# iTaxi-Finder — Software Requirements Specification (SRS)

(Short, descriptive, MEAN stack, radel.co.za–inspired)

## 1) Purpose & scope

Build a modern MEAN web app that maps, edits, and shares South African
minibus-taxi routes and adds an optional delivery workflow (“Delivery
Extenda”). The experience, look & feel, and layout are inspired by
**radel.co.za**: clean corporate aesthetic, full-bleed hero media, bold
section headers, card grids, and prominent CTAs with “Enquire/More”
patterns; sticky top nav with structured sections (Industries/Services/About/Contact equivalents).

## 2) Design language & UX (inspired by radel.co.za)

- **Visual tone:** restrained palette, high contrast, generous whitespace,
  full-width sections, bold H1/H2, card grids with concise copy and
  “Enquire/More”-style CTAs. Hero can be static image/video behind
  overlaid headings.
- **Navigation:** thin, sticky **top bar** with semi-transparent background
  (50%) so the map shows underneath; links to all pages; prominent
  right-side CTA (e.g., “Add Route” / “Start Delivery”).
- **Page structure:** focus content in **map-first canvases** that expand
  edge-to-edge; overlays (search, filters, tools) float **on top** of the
  map as translucent panels.
- **CTAs:** reuse “Enquire Now / More” patterns for actions like **Find
  Route / Save Route / Create Order**.

## 3) Architecture & tech

- **Stack:** MEAN (MongoDB, Express, Angular, Node).
- **Mapping:** Google Maps JavaScript API + **Roads API (Snap to Roads)** +
  **Routes API** (Compute Routes/Matrix). Use **data-driven styling** and
  (optionally) **cloud-based Map IDs** for consistent brand styling.
- **API key:** Configure
  `GOOGLE_MAPS_API_KEY=AIzaSyCYxFkL9vcvbaFz-Ut1Lm2Vge5byodujfk` on the
  server (`.env`) and expose via `/config` endpoint to the client (restrict
  by referrers/origins in production).
- **Realtime:** Socket.IO for live taxi markers (future).
- **Geo-init:** HTML5 Geolocation with **IP geolocation fallback** to
  center the map when permission is denied.

## 4) Global, cross-page requirements (“All Pages”)

- **Top bar:** extremely **narrow**, **50% transparent**, includes: Logo
  (left), links to **Route Finder**, **Route Adder**, **Delivery**,
  **Community**, **Registration**, **About**; plus a **Hide UI** button
  that collapses all overlays and leaves only the map.
- **Map canvas:** fills **left/right/bottom to the absolute edge**; top is
  under the translucent nav; overlays stack above the map (z-index).
- **Location on load:** center/zoom to viewer’s location (HTML5 geolocation
  → fallback to IP geolocation).
- **Cross-linking:** every page’s nav links to all the others.
- **Accessibility & perf:** AA contrast, keyboard-operable controls,
  lazy-load overlays; target <2.5s FCP on decent 4G.

## 5) Page-level specifications & functions

### A) Route Finder (Home / Route Lookup)

Goal: discover routes around the viewer.

UI:

- Search bar overlay (top-center) for **areas**, **stops**, **saved routes**
  (autocomplete → results list).
- On load: **center on viewer**, **render all routes** intersecting the
  **current viewport**; color by frequency (cool→warm).

Behaviors:

- When a route/area is searched: **temporarily highlight** (pulse/outline),
  **fit bounds** to selection, then return to normal styling after ~5–10s.
- Tap/hover a route segment: show floating card with **fare range,
  gesture, key stops, first/last load, rush/quiet times**.

Data: `/api/routes?bbox=...`, `/api/routes/:id`, `/api/search?q=...`.

### B) Route Adder (Route Editor)

Goal: create/clean routes on real roads.

UI: left-side **tools panel** (single column, 50% transparency) stacked
**one button per row**: **Draw**, **Snap to Road**, **Edit segment**,
**Undo**, **Redo**, **Save**, **Delete**, **Exit editing**.

Behaviors:

- **Freehand/segment draw** on map → show provisional polyline.
- **Snap to Road** converts drawn points via **Roads API “Snap to Roads”**
  (`interpolate=true`) and stores the snapped polyline.
- **Per-segment editing:** select a segment → move/insert/delete vertices
  → **re-snap just that segment**.
- **Save** posts `{name, path, fare, gesture, stops[], variations[]}` to
  server; version each save.

Endpoints:

- `POST /api/routes` (create), `PUT /api/routes/:id` (update),
  `POST /api/roads/snap` (server-side proxy to Roads API),
  `GET /api/routes/:id/history`.

Notes: call Roads API server-side; store both **raw drawn** and
**snapped** paths for audit.

### C) Delivery Extenda (Extender)

Banner (fixed, dismissible):

> “The taxi industry already has the infrastructure and building blocks to
> facilitate a parcel delivery service, all that remains is a central
> platform to manage, track and coordinate all order requests and the
> handovers they require along the way.”

Flow & features:

1. **Customer creates order** (form overlay): **Initial Collection**
   (pickup) & **Customer Reception** (drop-off) addresses; optional partner
   selector (Uber/Woolies/Checkers/Mr D/private).
2. **Order record** appears in a list + on the map (pickup/drop pins). The
   record contains:
   - **Initial Collection** (partner depot/rider/home).
   - **Customer Reception** (spaza/taxi rank/near-route address).
   - **Trip Chain**: a linked list of legs
     `Depot_1 or Taxi_1 → Route_1 → (Depot_2) → Route_2 → Reception`.
3. **Trip Chain suggestion (auto):**
   - Use **saved taxi routes** and **depots** within buffered corridors of
     the pickup/drop pins.
   - Compute **shortest combined distance**: pickup→entry of `Route_1` →
     interchange/`Depot_2` at the best **intersection with `Route_2`** →
     exit to reception.
   - Use **Routes API (Compute Routes/Matrix)** to score candidate legs by
     **distance/time**; select minimum total.
4. **QR assignment:** system generates QR (orderId) for the **Collector** to
   stick on parcel; scanning updates status at each handover
   (Depot_1, Taxi_1, Depot_2, Taxi_2, Reception).
5. **Tracking:** map shows the parcel’s **current leg** and ETA; status
   timeline lists completed/pending nodes.
6. **Template link** (footer badge) to **Basa Gas**: configurable
   `BASA_GAS_URL` (placeholder until confirmed).

Key APIs:

- `POST /api/orders` (create), `GET /api/orders/:id`,
  `POST /api/orders/:id/scan` (QR events),
- `POST /api/tripchain/suggest` (uses Routes + saved routes/depots).

### D) Community

Goal: localised notice board per township.

UI: Directory grid linking to **50 township subpages** (empty template
pages, ready for posts).

Social links: icons to **Facebook, Instagram, TikTok, X**, (open in new tab).

Posts: simple HTML posts with title, body, tags, optional image, optional
route tag (to overlay the referenced route on the map).

### E) Registration

Single form (tabs/steps) to register any of: **Collector, Taxi Driver,
Spaza Owner, Taxi Rank Depot/Depot Shop, Monthly Subscriber, Taxi Owner**.
Captured fields vary by role; all create a **User** plus a **Role profile**;
email/phone verification optional.

### F) About

Include this (edited for investor-friendly tone):

> **iTaxi-Finder** is a live mapping and analytics platform for South
> Africa’s minibus-taxi ecosystem. By publishing **useful route intel**—common
> routes and variations with **frequency ratings**, **fares**, **destination
> hand-signals**, and, where available, **live taxi locations** from a
> lightweight driver app (even via WhatsApp Live Location)—we make everyday
> commutes clearer and **grow demand** for operators. Fleet owners get
> **vehicle usage and location analytics** to spot efficiency gains and
> improve profits. A future-facing **parcel-delivery module** leverages the
> existing taxi network for low-cost, near-route deliveries. The
> **Community** page surfaces geo-tagged social posts along mapped routes
> and highlights sponsor partners.

## 6) Data model (MongoDB, minimal)

- **Route** `{routeId, name, fare:{min,max,currency}, gesture,
  stops:[{name,lat,lng}], frequencyPerHour, firstLoad, lastLoad,
  rushHours[], quietHours[], path:[{lat,lng}], snappedPath:[{lat,lng}],
  variations[]}`
- **Depot** `{depotId, name, lat, lng, type:'rank'|'spaza'|'hub'}`
- **Order** `{orderId, pickup:{lat,lng}, dropoff:{lat,lng}, partner, qrCode,
  status, tripChain:[{type:'depot'|'route'|'handover', refId, seq}],
  events:[{ts,type,meta}]}`
- **User/Role** standard auth + role-specific fields.

## 7) Key APIs (Express)

- **Routes:** `GET /api/routes?bbox=…`, `GET /api/routes/:id`,
  `POST /api/routes`, `PUT /api/routes/:id`
- **Roads proxy:** `POST /api/roads/snap` → calls **Roads Snap-to-Roads**
  w/ `interpolate=true` and API key server-side.
- **TripChain:** `POST /api/tripchain/suggest` → scores candidate legs
  using **Routes API** (Compute Routes/Matrix).
- **Orders:** `POST /api/orders`, `GET /api/orders/:id`,
  `POST /api/orders/:id/scan`
- **Config:** `GET /config` → returns Maps key (and optional Map ID) to the
  client.
- **Community:** static pages under `/community/<township>`.

## 8) Map behavior & styling

- **Full-screen map** on every page; overlays (search/tools/panels) are
  translucent.
- **Data-driven styling** for route lines (color by frequency), stop
  markers, and search highlights.
- **Snapping:** all **user-drawn routes** must be snapped before save;
  show a “snapped” preview then commit.

## 9) Security, keys, and quotas

- Keep the provided key in **server env**; the client fetches it at
  runtime.
- In production, **restrict** by HTTP referrers (web), allowed IPs
  (server), and enable only Maps/Roads/Routes SKUs you use.
- Respect Roads per-request limits (≤100 points per call; interpolate as
  needed).

## 10) Acceptance criteria (per page)

- **Nav/Hide:** top bar is 50% transparent; **Hide** collapses all
  overlays; map edges touch viewport edges (L/R/B).
- **Location init:** with permission → use GPS; else **IP geolocation
  fallback**; map centers appropriately.
- **Route Finder:** search finds areas or saved routes; selection
  **highlights + fits** the map; hovering a route shows the info card.
- **Route Adder:** draw → **Snap to Roads** button produces a visibly
  adjusted polyline; **undo/redo** work; **per-segment edit** re-snaps only
  that segment; **Save** persists.
- **Delivery Extenda:** entering pickup/drop suggests a **Trip Chain** that
  minimises total distance/time (verifiable by showing the computed legs
  and distances); QR generated; scan updates status.
- **Community:** grid shows 50 township links (stub pages render); social
  icons open correctly.
- **About:** investor-friendly text renders.

## 11) Non-functional

- **Responsive:** desktop, tablet, mobile.
- **Performance:** routes in viewport render <1s with up to ~1,000 segments
  (simplify/cluster as needed).
- **A11y:** semantic HTML, focus management for overlays, keyboard access
  for drawing/undo/save.

## References

- radel.co.za homepage, services, contact (style, layout, CTAs, sticky
  nav).
- **Roads API – Snap to Roads** (limits & behavior).
- **Routes API – Compute Routes/Matrix** for scoring Trip Chains.
- **Data-driven styling / Cloud-based styling** (map visual consistency).

