# V269 emergency dock geometry

Release 379 keeps the resident Thebe dock compact and reserves its workspace rail. The older emergency stylesheet-recovery path still carried legacy 420/560px panel geometry and an 82px voice control, so a stylesheet outage or delayed presentation recovery could temporarily recreate the oversized interface.

V269 adds a small release-bound recovery geometry guard on top of the Release 379 baseline. It activates only while `data-css-recovery="1"`, mirrors the current production desktop/mobile dimensions, reserves the same workspace/public lane, and removes only its own temporary inline geometry after normal CSS recovery. The existing V266 ownership handoff and the Release 379 Property/workspace rail remain intact.

Regression coverage includes static geometry/cleanup assertions, release-bound injection on every HTML surface, and Chromium with the dock stylesheets deliberately withheld. The browser gate verifies normal and expanded desktop widths, 68px voice geometry, workspace non-overlap, mobile gutters, and absence of browser errors.
