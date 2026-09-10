# Spezifikation: Responsive Layout (Mobile-Tauglichkeit)

Status: **umgesetzt** (App-Shell + E-Mail-Client) · Datum: 2026-07-05

## 1. Kontext & Problem
Die App war ausschließlich für Desktop ausgelegt. Auf Mobilgeräten:
- Die feste Sidebar (`w-64` = 256 px) belegte den halben Bildschirm.
- Das aktuell geöffnete Modul war nicht erkennbar (keine Titelzeile).
- Der E-Mail-Client (3-Spalten-Layout mit fester Panel-Breite) war unbedienbar.

## 2. Ziele
1. Sidebar verbraucht auf Mobile keinen permanenten Platz.
2. Das geöffnete Modul ist auf Mobile jederzeit klar benannt.
3. Kernseiten (insb. E-Mail-Client) sind auf Mobile bedienbar.
4. Desktop-Verhalten bleibt **unverändert**.

## 3. Breakpoint
- Einziger relevanter Breakpoint: **`lg` = 1024 px** (Tailwind-Default).
- `< lg` → Mobile-/Tablet-Modus (einspaltig, Drawer-Navigation).
- `≥ lg` → Desktop-Modus (bestehendes Verhalten).

## 4. App-Shell

### 4.1 Struktur
```
AppLayout (Server)          src/app/(app)/layout.tsx
└─ EmailNotificationsProvider
   └─ AppShell (Client)     src/components/AppShell.tsx
      ├─ Sidebar            src/components/Sidebar.tsx
      └─ <div> (Content-Spalte)
         ├─ <header> Mobile-Topbar   (lg:hidden)
         └─ <main> {children}
```

### 4.2 Sidebar — Verhalten
- **Desktop (`≥ lg`):** statisch im Flow (`lg:static`), Breite `lg:w-64` bzw. eingeklappt `lg:w-20`. Einklapp-Button nur auf Desktop sichtbar (`hidden lg:block`).
- **Mobile (`< lg`):** Off-Canvas-Drawer — `fixed inset-y-0 left-0 z-50 w-64`, ein-/ausgeblendet per `translate-x` (`-translate-x-full` ↔ `translate-x-0`). Zusätzlich ein **Backdrop** (`fixed inset-0 z-40 bg-black/50 lg:hidden`).
- **Labels:** werden über die Klasse `labelCls = collapsed ? "lg:hidden" : ""` gesteuert, damit sie auf Mobile **immer** sichtbar sind (der Desktop-Collapse-Zustand blendet sie nur ab `lg` aus).
- **Öffnen:** ☰-Button in der Mobile-Topbar (`setMobileNavOpen(true)`).
- **Schließen:** Backdrop-Tap, X-Button im Drawer-Kopf (`lg:hidden`), oder Klick auf einen Menüpunkt (`onClick={onClose}` an jedem `<Link>`).

### 4.3 Props / API der Sidebar
```ts
Sidebar({ mobileOpen?: boolean; onClose?: () => void })
```
- `mobileOpen` — steuert die Drawer-Sichtbarkeit (nur `< lg` wirksam).
- `onClose` — schließt den Drawer; wird von Backdrop, X-Button und Nav-Links aufgerufen.

Neu exportiert:
```ts
export const navItems            // zentrale Navigationsliste
export function getModuleLabel(pathname: string): string
```
`getModuleLabel` ermittelt aus dem Pfad das Label des aktiven Moduls
(gleiche Matching-Logik wie `isActive`), Fallback `"Berko AI"`.

### 4.4 Mobile-Topbar
- Nur `< lg` sichtbar (`lg:hidden`), Höhe `h-14`, `flex-shrink-0`.
- Inhalt: ☰-Button + **Modulname** (`getModuleLabel(pathname)`).
- State `mobileNavOpen` liegt in `AppShell` und wird an die Sidebar durchgereicht.

## 5. E-Mail-Client (einspaltig auf Mobile)
Datei: `src/app/(app)/emails/page.tsx`

### 5.1 Breakpoint-Erkennung
```ts
const [isDesktop, setIsDesktop] = useState(true);
useEffect(() => {
  const mq = window.matchMedia("(min-width: 1024px)");
  const update = () => setIsDesktop(mq.matches);
  update();
  mq.addEventListener("change", update);
  return () => mq.removeEventListener("change", update);
}, []);
```
Nötig, weil die Panel-Breite per **Inline-Style** gesetzt wird (nicht per
responsiver Klasse überschreibbar).

### 5.2 Layout-Regeln
Ansichts-Umschalter: `detailAktiv = !!(selectedEmail || compose)`.

| Element | Desktop (`≥ lg`) | Mobile (`< lg`) |
|---|---|---|
| Root | `flex h-full` | `flex h-full` |
| Linkes Panel (Liste) | feste Breite (Inline-Style, resizable) | `w-full`; **ausgeblendet wenn `detailAktiv`** |
| Resize-Griff | sichtbar | `hidden lg:block` |
| Rechtes Panel (Detail/Compose) | `flex-1`, immer sichtbar | `flex-1`; **nur sichtbar wenn `detailAktiv`** |
| „← Zurück zur Liste" | ausgeblendet (`lg:hidden`) | sichtbar; setzt `selectedEmail=null` + `compose=null` |

Konkrete Klassen:
- Liste: `${detailAktiv ? "hidden" : "flex"} lg:flex w-full lg:w-auto …`, `style={isDesktop ? {width,minWidth,maxWidth} : undefined}`
- Detail: `${detailAktiv ? "flex" : "hidden"} lg:flex flex-1 …`

### 5.3 Höhe
`h-screen` → **`h-full`**, damit der Client-Bereich unter die Mobile-Topbar
passt (auf Desktop identisch, da `<main>` dort volle Höhe hat).

## 6. Höhen-Kontext (allgemein)
- `AppShell`-Root: `flex h-screen overflow-hidden`.
- Content-Spalte: `flex-1 flex flex-col min-w-0 overflow-hidden`.
- `<main>`: `flex-1 overflow-y-auto min-h-0` → definierte Höhe, damit
  Kindseiten mit `h-full` korrekt füllen.

## 7. Geänderte / neue Dateien
| Datei | Änderung |
|---|---|
| `src/components/AppShell.tsx` | **neu** — Shell mit Mobile-Topbar + Drawer-State |
| `src/components/Sidebar.tsx` | Drawer-Verhalten, Props, `navItems`/`getModuleLabel`-Export |
| `src/app/(app)/layout.tsx` | rendert nur noch `AppShell` |
| `src/app/(app)/emails/page.tsx` | einspaltiges Mobile-Layout, `isDesktop`-Hook, Zurück-Button |

## 8. Akzeptanzkriterien
- [x] `< lg`: Sidebar nicht im Flow; öffnet/schließt als Drawer.
- [x] `< lg`: Topbar zeigt korrekten Modulnamen je Route.
- [x] Drawer schließt bei Navigation, Backdrop-Tap und X.
- [x] `≥ lg`: Layout & Collapse unverändert.
- [x] E-Mail-Client `< lg`: Liste ↔ Detail einspaltig mit Zurück-Button.
- [x] `tsc --noEmit`: 0 Fehler · ESLint: keine neuen Fehler.

## 9. Offene Punkte / nächste Schritte
- **Datendichte Tabellenseiten** (Kontakte, Deals, Anrufliste, KPIs):
  scrollen `< lg` noch horizontal → pro Seite Karten-/Stack-Layout prüfen.
- **Detail-/Formularseiten** (Kontakt-/Deal-Detail, Verträge): mehrspaltige
  Grids auf `grid-cols-1` bei `< lg` umstellen.
- **Visueller Mobil-Test** mit eingeloggter Session (bisher nur `tsc`/Lint
  verifiziert, kein Klick-Test).
- Optional: `isDesktop` initial serverseitig unbekannt → kurzer Breiten-Flash
  des Listen-Panels vor Hook-Init; ggf. via CSS-only-Ansatz eliminieren.
