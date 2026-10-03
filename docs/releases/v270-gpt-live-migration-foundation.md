# V270 GPT-Live migration foundation

Thebe production voice remains on the qualified `gpt-realtime-2.1` WebRTC runtime. V270 introduces a server-side migration profile for evaluating `gpt-live-1` without silently switching production traffic.

The preview profile follows OpenAI's current GPT-Live WebRTC contract: `POST /v1/live/sessions`, model `gpt-live-1`, WebRTC transport, and client delegation. Client delegation is the intended Thebe path because permissions, confirmations, business records, task state, governed tools, and high-impact execution remain controlled by Thebe's backend.

The migration profile is deliberately double opt-in (`THEBE_GPT_LIVE_PREVIEW_ENABLED=1` plus `THEBE_LIVE_VOICE_RUNTIME=gpt_live_preview`) and still reports `productionSwitchAllowed:false`. The next V270 step is to add dual event handling for GPT-Live transcript/delegation events, return verified backend results through commentary/thinking append events, and run comparative voice evaluations before any production switch.
