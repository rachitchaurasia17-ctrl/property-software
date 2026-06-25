# PlotMap Button Design System

**Keyword:** `AEROCITY_BUTTONS_LAYOUT`

Whenever you start a new project and need these premium button designs, just mention the keyword `AEROCITY_BUTTONS_LAYOUT` or describe that you want the "Aerocity/PlotMap premium button layout design system" and I will be able to retrieve these styles for you.

## 1. Top Navigation Tabs

```html
<div style="display: flex; gap: 3px; background: #0B1A36; padding: 10px;">
  <button class="tab on">Masterplan</button>
  <button class="tab">Properties</button>
  <button class="tab">Sector Maps</button>
</div>
```

```css
.tab {
  border: none;
  cursor: pointer;
  border-radius: 11px;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 680;
  background: transparent;
  color: rgba(251,246,234,0.62);
}
.tab.on { background: rgba(251,246,234,0.16); color: #FFFFFF; }
.tab:hover:not(.on) { background: rgba(251,246,234,0.08); }
```

## 2. Floating Mode Switch

```html
<div class="mode-switch">
  <button class="on" data-mode="original">Original Map</button>
  <button data-mode="easy">Easy Map</button>
</div>
```

```css
.mode-switch {
  position: absolute; left: 18px; top: 16px;
  display: flex; background: rgba(251,246,234,0.96);
  border: 1px solid #E1D6BF; border-radius: 14px;
  padding: 4px; gap: 3px;
  box-shadow: 0 6px 18px rgba(40,28,8,0.16);
  z-index: 16;
}
.mode-switch button {
  border: none; cursor: pointer; border-radius: 11px;
  padding: 9px 16px; font-size: 13px; font-weight: 700;
  white-space: nowrap; background: transparent; color: #6A6453;
}
.mode-switch button.on {
  background: #0B1A36; color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(22,53,106,0.3);
}
```

## 3. Map Layer Pills

```html
<div style="display: flex; gap: 8px;">
  <button class="layer-pill act">Key Roads</button>
  <button class="layer-pill">Blocks</button>
</div>
```

```css
.layer-pill {
  display: inline-flex; align-items: center; gap: 8px;
  background: #fff; border: 1px solid #EBE1CC; border-radius: 12px;
  padding: 8px 14px; font-size: 13px; font-weight: 680;
  color: #3F3A30; cursor: pointer; transition: 0.15s;
}
.layer-pill:hover { border-color: #0B1A36; box-shadow: 0 4px 12px rgba(11,26,54,0.06); transform: translateY(-1px); }
.layer-pill.act { border-color: #0B1A36; background: #0B1A36; color: #fff; }
```

## 4. Item Selection Chips

```html
<div style="display: flex; gap: 8px;">
  <button class="item-chip act">Airport Road</button>
  <button class="item-chip">PR-7 Road</button>
</div>
```

```css
.item-chip {
  display: inline-flex; align-items: center; background: #fff;
  border: 1px solid #EBE1CC; border-radius: 10px; padding: 8px 14px;
  font-size: 13.5px; font-weight: 640; color: #3F3A30;
  cursor: pointer; transition: all 0.2s cubic-bezier(0.2,0,0,1);
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.item-chip:hover { border-color: #16356A; color: #16356A; transform: translateY(-2px); box-shadow: 0 4px 8px rgba(22,53,106,0.12); background: #F8FAFC; }
.item-chip:active { transform: translateY(0); }
.item-chip.act { border-color: #0B1A36; background: #0B1A36; color: #fff; box-shadow: 0 4px 10px rgba(11,26,54,0.25); transform: translateY(-1px); }
```

## 5. Primary and Ghost Actions

```html
<div style="display: flex; gap: 8px; height: 44px;">
  <button class="btn-primary" style="flex: 1;">View Gallery</button>
  <button class="btn-ghost" style="flex: 1;">Properties</button>
</div>
```

```css
.btn-primary {
  border: none; border-radius: 13px; background: #0B1A36;
  color: #FFFFFF; font-weight: 720; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 7px;
}
.btn-primary:hover { background: #1B3F7C; }
.btn-primary:disabled { background: #C9BCA0; cursor: default; }

.btn-ghost {
  border: 1px solid #E2D7C0; border-radius: 13px; background: #fff;
  font-weight: 680; color: #23211C; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.btn-ghost:hover { border-color: #0B1A36; }
.btn-ghost:disabled { color: #A89F89; cursor: default; }
```
