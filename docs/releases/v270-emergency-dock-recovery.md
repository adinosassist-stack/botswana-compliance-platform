# V270 emergency dock recovery

Release 380 carries the current compact Thebe dock and dock-safe Property workspace. V270 hardens the emergency stylesheet-recovery path so a delayed or missing dock stylesheet cannot recreate legacy oversized geometry.

The guard activates only while `data-css-recovery="1"`. It preserves current desktop widths (272/344px wide desktop and 256/324px medium desktop), the 68px voice entry, reserved workspace/public lanes, and 8px mobile gutters. It owns only its temporary inline recovery declarations and releases them when normal styling returns.

Qualification keeps the existing V269 live-dock audit and adds V270 static geometry checks plus a Chromium test that deliberately withholds both dock stylesheets and validates desktop, expanded, mobile, non-overlap, and browser-error behavior.
