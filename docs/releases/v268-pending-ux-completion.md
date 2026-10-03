# V268 pending UI completion

Port useful remaining changes from the obsolete V261 branch onto the current workspace: narrower desktop assistant (272px normal / 344px expanded; 256px / 324px on medium desktop), shorter dock, long-content containment, keyboard focus indicators and reduced motion. Voice can answer ordinary general questions on any page while business data and actions remain delegated to the governed backend.

Retain V262 Property operations, V263 optimise, V264 compare and V266 emergency dock recovery. The old branch cannot be merged wholesale because it deletes these newer features and weakens extraction checks. Its obsolete Property presentation is superseded by the current resident workspace. V267 release identity covers its personalization cache rotation.

Validation: full npm test and npm run check, plus existing Chromium dock interaction and width checks with the updated geometry. No private account data was changed.
