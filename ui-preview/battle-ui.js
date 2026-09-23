(function(){
'use strict';
const css="\n     :host { display:block;position:absolute;inset:0; --gold:#d6ae52; --ink:#0c0e13; --panel:rgba(13,15,21,.94); --line:rgba(214,174,82,.38); --blue:#5ca9d6; --red:#bd4b52; --edge:14px; --gap:14px; --side:clamp(270px,19vw,400px); --portrait:clamp(68px,5.35vw,108px); --table-h:clamp(420px,calc(100vh - 315px),620px); }\n    * { box-sizing:border-box; }\n    .battle-root { margin:0; min-height:100vh; overflow:hidden; color:#eee; font-family:\"Microsoft YaHei\",sans-serif; background:#090b0f url(\"../assets/map/battle-bg.png\") center/cover no-repeat; }\n    .battle-root::before { content:\"\"; position:fixed; inset:0; background:rgba(4,6,10,.22); pointer-events:none; }\n    .topbar { position:fixed; z-index:3; inset:0 0 auto; height:68px; display:grid; grid-template-columns:minmax(520px,610px) 1fr 200px; align-items:center; padding:0 22px; background:linear-gradient(180deg,rgba(6,8,12,.98),rgba(10,12,17,.88)); border-bottom:1px solid var(--line); box-shadow:0 8px 24px rgba(0,0,0,.35); }\n    .brand { color:var(--gold); font-family:Georgia,serif; font-weight:bold; font-size:17px; }\n    .ranking { display:block; max-width:590px; margin-top:3px; color:#c0c3c9; font:11px/1.5 \"Microsoft YaHei\",sans-serif; white-space:normal; }\n    .ranking b { color:var(--gold); }\n    .phase-zone { position:absolute; left:50%; top:0; height:68px; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; }\n    .phase { display:flex; align-items:center; gap:9px; color:#777; font-size:11px; }\n    .phase span { padding:7px 11px; border-bottom:2px solid transparent; }\n    .phase .active { color:#fff; border-color:var(--gold); text-shadow:0 0 12px rgba(214,174,82,.7); }\n    .turn-order { display:flex; align-items:center; gap:5px; color:#777; font-size:9px; }\n    .turn-order::before { content:\"顺序\"; margin-right:3px; color:#aaa; }\n    .turn-token { position:relative; width:21px; height:21px; overflow:hidden; border:1px solid #555; border-radius:50%; background:#20232a; }\n    .turn-token img { width:100%; height:100%; object-fit:cover; }\n    .turn-token.active { width:25px; height:25px; border:2px solid var(--gold); box-shadow:0 0 9px rgba(214,174,82,.65); }\n    .turn-token.active::after { content:\"1\"; position:absolute; right:-1px; bottom:-1px; width:10px; height:10px; display:grid; place-items:center; border-radius:50%; background:var(--gold); color:#111; font-size:7px; font-weight:bold; }\n    .turn-arrow { color:#777; font-size:8px; }\n    .round { position:fixed; z-index:9; right:24px; top:17px; min-width:74px; text-align:right; font-size:12px; color:#bbb; }\n    .round strong { color:var(--gold); font-size:16px; margin-left:0; }\n    .top-tools { position:fixed; z-index:8; right:132px; top:14px; display:flex; gap:6px; }\n    .top-tools button { height:30px; padding:0 12px; font-size:11px; background:#151820; }\n    .status { position:fixed; z-index:3; top:76px; left:50%; transform:translateX(-50%); min-width:440px; padding:9px 18px; text-align:center; background:rgba(8,10,15,.94); border:1px solid var(--line); box-shadow:0 8px 18px rgba(0,0,0,.35); }\n    .status b { color:var(--gold); }\n    .player { position:fixed; z-index:3; left:var(--edge); bottom:8px; width:var(--side); min-width:300px; background:var(--panel); border:1px solid var(--line); box-shadow:0 12px 30px rgba(0,0,0,.55); }\n    .portraits { display:grid; grid-template-columns:82px 82px 1fr; min-height:132px; }\n    .portrait { position:relative; overflow:hidden; border-right:1px solid var(--line); }\n    .portrait img { width:100%; height:100%; object-fit:cover; }\n    .portrait::after { content:\"御主\"; position:absolute; left:0; right:0; bottom:0; padding:5px; text-align:center; font-size:10px; background:rgba(0,0,0,.78); color:var(--blue); }\n    .portrait.servant::after { content:attr(data-class); color:var(--gold); }\n    .player-info { padding:13px; }\n    .player-info h2 { margin:0 0 4px; font-size:16px; color:#fff; }\n    .servant-name { color:var(--gold); font-size:12px; margin-bottom:13px; }\n    .meters { display:grid; gap:8px; font-size:11px; color:#aaa; }\n    .meter { height:5px; margin-top:4px; background:#282a31; overflow:hidden; }\n    .meter i { display:block; height:100%; background:var(--blue); }\n    .meter.red i { width:66%; background:var(--red); }\n    .resources { display:flex; justify-content:space-between; padding:9px 12px; border-top:1px solid rgba(255,255,255,.08); font-size:12px; }\n    .resources b { color:var(--gold); }\n    .hand { position:fixed; z-index:2; left:50%; bottom:-82px; transform:translateX(-50%); display:flex; align-items:flex-end; gap:8px; padding:18px 28px 80px; }\n    .card { position:relative; width:112px; height:158px; overflow:hidden; border:2px solid #50535c; background:#171920; box-shadow:0 8px 18px rgba(0,0,0,.62); transition:transform .18s,border-color .18s,box-shadow .18s; cursor:pointer; }\n    .card:hover { transform:translateY(-24px); border-color:var(--gold); box-shadow:0 15px 28px rgba(0,0,0,.72),0 0 13px rgba(214,174,82,.25); }\n    .card.selected { transform:translateY(-28px); border-color:var(--gold); box-shadow:0 0 0 3px rgba(214,174,82,.18),0 16px 30px rgba(0,0,0,.74); }\n    .card.selected::after { content:\"✓\"; position:absolute; z-index:3; right:6px; top:6px; width:22px; height:22px; display:grid; place-items:center; border-radius:50%; background:var(--gold); color:#111; font-size:13px; font-weight:bold; }\n    .card.played { transform:translateY(18px) scale(.93); filter:brightness(.55) saturate(.7); border-color:#8f343a; cursor:default; pointer-events:none; }\n    .card.played .tag { color:#ff9da2; }\n    .card img { width:100%; height:100%; object-fit:cover; }\n    .card .fallback { position:absolute; inset:0; display:grid; place-content:center; text-align:center; background:linear-gradient(145deg,#292d37,#101218); color:#ddd; }\n    .card .fallback b { color:var(--gold); font-size:17px; }\n    .card .tag { position:absolute; left:0; right:0; bottom:0; padding:8px 5px; text-align:center; background:rgba(4,5,8,.88); font-size:11px; }\n    .actions { position:fixed; z-index:3; right:var(--edge); bottom:8px; width:var(--side); max-width:300px; display:grid; gap:6px; }\n    .actions button { height:38px; }\n    button { position:relative; height:42px; overflow:hidden; border:1px solid #4b4f59; border-radius:5px; color:#eee; background:linear-gradient(180deg,rgba(24,28,38,.98),rgba(12,15,21,.97)); font-weight:bold; cursor:pointer; transform:translateY(0) scale(1); box-shadow:0 4px 12px rgba(0,0,0,.18); transition:transform .16s ease,border-color .18s ease,color .18s ease,background .18s ease,box-shadow .18s ease,filter .18s ease; }\n    button::before { content:\"\"; position:absolute; top:-55%; bottom:-55%; left:-42%; width:28%; transform:skewX(-22deg); background:linear-gradient(90deg,transparent,rgba(255,239,190,.16),transparent); opacity:0; pointer-events:none; transition:left .38s ease,opacity .16s ease; }\n    button:not(:disabled):hover { transform:translateY(-2px); border-color:rgba(214,174,82,.78); color:#ffe6a5; background:linear-gradient(180deg,rgba(38,39,40,.98),rgba(18,19,22,.98)); box-shadow:0 8px 20px rgba(0,0,0,.32),0 0 14px rgba(214,174,82,.11); }\n    button:not(:disabled):hover::before { left:118%; opacity:1; }\n    button:not(:disabled):active { transform:translateY(1px) scale(.985); box-shadow:0 2px 7px rgba(0,0,0,.35) inset; transition-duration:.06s; }\n    button:focus-visible { outline:none; box-shadow:0 0 0 2px rgba(214,174,82,.24),0 0 18px rgba(214,174,82,.16); }\n    button:disabled { opacity:.38; cursor:not-allowed; border-color:#3a3d45; color:#747780; box-shadow:none; }\n    button:disabled:hover { border-color:#3a3d45; color:#747780; }\n    button.primary { background:linear-gradient(180deg,#b4313a,#8c222a); border-color:#d46a70; color:#fff; box-shadow:0 5px 16px rgba(153,38,46,.22); }\n    button.primary:not(:disabled):hover { background:linear-gradient(180deg,#c63b44,#982630); color:#fff4d1; box-shadow:0 9px 24px rgba(172,42,51,.3),0 0 16px rgba(214,174,82,.11); }\n    .skill { display:none; }\n    .skill-title { color:var(--gold); font-size:12px; margin-bottom:9px; }\n    .skill-row { width:100%; height:auto; display:grid; grid-template-columns:46px 1fr; gap:9px; align-items:center; padding:8px; border:1px solid #4d505b; background:#171920; text-align:left; }\n    .skill-icon { width:46px; height:46px; display:grid; place-items:center; overflow:hidden; background:#292c35; color:var(--gold); font-family:Georgia,serif; font-size:20px; }\n    .skill-icon img { width:100%; height:100%; object-fit:cover; }\n    .skill-row b { display:block; font-size:12px; }\n    .skill-row small { color:#888; font-size:10px; }\n    .hint { position:fixed; z-index:2; left:50%; bottom:162px; transform:translateX(-50%); font-size:11px; color:rgba(255,255,255,.72); text-shadow:0 2px 4px #000; }\n    .board { position:fixed; z-index:1; left:calc(var(--edge) + var(--side) + var(--gap)); right:calc(var(--edge) + var(--side) + var(--gap)); top:126px; width:auto; height:var(--table-h); transform:none; display:grid; grid-template-columns:2fr 7fr; grid-template-rows:repeat(3,1fr); gap:6px; }\n    .place { position:relative; width:auto; height:auto; overflow:hidden; border:1px solid rgba(255,255,255,.28); background:#171920 center/cover; box-shadow:0 8px 20px rgba(0,0,0,.48); }\n    .place::before { content:\"\"; position:absolute; inset:0; background:linear-gradient(180deg,rgba(0,0,0,.05),rgba(3,5,8,.82)); }\n    .place.active { border:2px solid var(--gold); box-shadow:0 0 0 3px rgba(214,174,82,.12),0 10px 28px rgba(0,0,0,.65); }\n    .place-title { position:absolute; z-index:1; left:12px; bottom:10px; font-weight:bold; font-size:clamp(16px,1.15vw,22px); text-shadow:0 2px 4px #000; }\n    .place small { display:block; color:#ddd; font-size:clamp(10px,.72vw,13px); margin-top:3px; }\n    .situation { background-image:url(\"../assets/map/locations/situation.png\"); }\n    .workshop { background-image:url(\"../assets/map/locations/workshop.png\"); }\n    .event { background-image:url(\"../assets/map/locations/event-deck.png\"); }\n    .mountain { background-image:url(\"../assets/map/locations/mountain.png\"); }\n    .scout { background-image:url(\"../assets/map/locations/scouting.png\"); }\n    .city { background-image:url(\"../assets/map/locations/city.png\"); }\n    .token { position:absolute; z-index:2; top:9px; right:9px; width:38px; height:38px; border:2px solid #fff; border-radius:50%; overflow:hidden; box-shadow:0 3px 8px #000; background:#222; }\n    .token img { width:100%; height:100%; object-fit:cover; }\n    .token.two { right:52px; }\n    .opponents { position:fixed; z-index:2; top:126px; width:var(--side); height:var(--table-h); display:grid; grid-template-rows:repeat(3,minmax(0,1fr)); gap:8px; }\n    .opponents.left { left:var(--edge); }\n    .opponents.right { right:var(--edge); top:126px; }\n    .opponent { min-height:0; display:grid; grid-template-columns:var(--portrait) var(--portrait) minmax(0,1fr); grid-template-rows:minmax(0,1fr) 38px; overflow:hidden; background:rgba(10,12,17,.96); border:1px solid rgba(255,255,255,.24); box-shadow:0 7px 18px rgba(0,0,0,.5); }\n    .opponent.current { border-color:var(--gold); box-shadow:0 0 13px rgba(214,174,82,.22),0 7px 18px rgba(0,0,0,.55); }\n    .opponent > img { width:100%; height:100%; min-height:0; object-fit:cover; border-right:1px solid #333; cursor:zoom-in; }\n    .opp-info { min-width:0; padding:clamp(7px,.6vw,11px); font-size:clamp(10px,.7vw,13px); line-height:1.5; color:#aaa; }\n    .opp-info b { display:block; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; color:#fff; font-size:clamp(13px,.85vw,16px); margin-bottom:4px; }\n    .opp-info .class { color:var(--gold); margin-bottom:5px; }\n    .opp-info strong { color:#fff; }\n    .opp-skill-zone { margin-top:7px; display:flex; align-items:center; gap:5px; min-height:38px; }\n    .opp-skill-label { flex:0 0 auto; color:#7f838d; font-size:8px; letter-spacing:.05em; }\n    .opp-skill-card { position:relative; width:25px; height:35px; overflow:hidden; border:1px solid #5c465f; border-radius:2px; background:#17131c; box-shadow:0 3px 8px rgba(0,0,0,.48); }\n    .opp-skill-card img { width:100%; height:100%; object-fit:cover; display:block; }\n    .opp-skill-card .skill-name-face { width:100%; height:100%; display:grid; place-items:center; padding:2px; text-align:center; color:#f0d88f; background:linear-gradient(145deg,#3a2639,#151019); font-size:6px; line-height:1.15; }\n    .opp-skill-card.revealed { border-color:var(--gold); box-shadow:0 0 0 1px rgba(214,174,82,.14),0 3px 8px rgba(0,0,0,.58); }\n    .opp-skill-card.revealed::after { content:\"已公开\"; position:absolute; inset:auto 0 0; padding:1px 0; text-align:center; color:#ffe5a3; background:rgba(0,0,0,.78); font-size:5px; line-height:7px; }\n    .waiting { color:var(--gold); }\n    .public-cards { grid-column:1/-1; display:flex; align-items:center; gap:7px; padding:4px 8px; border-top:1px solid #343741; background:#11141a; overflow:hidden; }\n    .public-label { flex:0 0 auto; color:#888; font-size:clamp(9px,.62vw,12px); }\n    .mini-card { position:relative; width:clamp(32px,2vw,40px); height:31px; border:1px solid #565a65; background:#252832; overflow:hidden; cursor:zoom-in; }\n    .mini-card img { width:100%; height:100%; object-fit:cover; }\n    .mini-card.effect { border-color:var(--gold); }\n    .mini-card.played { border-color:#bb5158; }\n    .mini-card::after { position:absolute; inset:auto 0 0; text-align:center; font-size:6px; line-height:8px; background:rgba(0,0,0,.8); color:#fff; }\n    .mini-card.effect::after { content:\"效果\"; color:var(--gold); }\n    .mini-card.played::after { content:\"出牌\"; color:#ff9da2; }\n    .deck-back { display:grid; place-items:center; color:#777; font-size:12px; background:repeating-linear-gradient(45deg,#13151a,#13151a 4px,#242731 4px,#242731 8px); }\n    .base-vp { position:absolute; z-index:4; left:12px; top:10px; min-width:42px; height:42px; display:grid; place-items:center; border:2px solid var(--gold); border-radius:50%; background:rgba(7,9,13,.9); color:var(--gold); font-size:18px; font-weight:bold; box-shadow:0 4px 12px rgba(0,0,0,.6),0 0 10px rgba(214,174,82,.25); }\n    .base-vp::after { content:\"战果\"; position:absolute; top:42px; color:#eee; font-size:9px; white-space:nowrap; text-shadow:0 2px 4px #000; }\n    .map-event-card { position:absolute; z-index:3; left:70px; top:10px; width:clamp(52px,3.7vw,72px); aspect-ratio: .7; border:2px solid #686b73; background:#171920; box-shadow:0 7px 16px rgba(0,0,0,.7); cursor:zoom-in; overflow:hidden; }\n    .map-event-card img { width:100%; height:100%; object-fit:cover; }\n    .map-event-card .event-vp { position:absolute; right:3px; top:3px; min-width:20px; height:20px; display:grid; place-items:center; border-radius:50%; background:var(--gold); color:#111; font-size:10px; font-weight:bold; }\n    .map-event-card .event-name { position:absolute; inset:auto 0 0; padding:4px 2px; background:rgba(0,0,0,.86); color:#fff; text-align:center; font-size:8px; }\n    .map-event-card.facedown { border-style:dashed; background-image:url(\"../assets/map/events/event-back.png\"); background-size:cover; }\n    .map-event-card.facedown::after { content:\"未揭示\"; position:absolute; inset:auto 0 0; padding:5px; text-align:center; background:rgba(0,0,0,.84); color:#aaa; font-size:8px; }\n    .land-slots { position:absolute; z-index:4; right:12px; bottom:11px; display:flex; gap:8px; align-items:flex-end; }\n    .land-slot { display:grid; justify-items:center; gap:3px; color:#fff; font-size:9px; text-shadow:0 2px 4px #000; }\n    .land-slot .slot-face { width:38px; height:38px; border:2px solid var(--gold); border-radius:50%; overflow:hidden; background:rgba(0,0,0,.72); box-shadow:0 4px 10px rgba(0,0,0,.7); }\n    .land-slot.secondary .slot-face { border-color:#aaa; }\n    .land-slot img { width:100%; height:100%; object-fit:cover; }\n    .workshop-slots { right:10px; gap:5px; }\n    .workshop-slots .slot-face { width:34px; height:34px; border-color:#6fbbe6; }\n    .workshop-slots .land-slot b { color:#a7dcff; font-size:8px; }\n    .deck-display { position:absolute; z-index:3; left:50%; top:50%; width:clamp(52px,3.5vw,68px); aspect-ratio:.7; transform:translate(-50%,-50%); border:2px solid #686b73; background-size:cover; background-position:center; box-shadow:5px 5px 0 #292c34,9px 9px 0 #17191e,0 9px 20px rgba(0,0,0,.6); }\n    .deck-display.event-deck { background-image:url(\"../assets/map/events/event-back.png\"); }\n    .deck-display.situation-deck { background-image:url(\"../assets/map/situations/situation-back.png\"); }\n    .deck-display::after { content:attr(data-count); position:absolute; right:-10px; top:-10px; width:26px; height:26px; display:grid; place-items:center; border-radius:50%; background:var(--gold); color:#111; font-size:11px; font-weight:bold; }\n    .situation-active { position:absolute; z-index:3; left:16px; top:12px; width:clamp(58px,4.1vw,80px); aspect-ratio:.7; border:2px solid #6e9bb6; background:#111; box-shadow:0 8px 18px rgba(0,0,0,.65); overflow:hidden; cursor:zoom-in; }\n    .situation-active img { width:100%; height:100%; object-fit:cover; }\n    .situation-active span { position:absolute; inset:auto 0 0; padding:4px 2px; background:rgba(0,0,0,.88); color:#9bd9ff; text-align:center; font-size:8px; }\n    .log-drawer { position:fixed; z-index:35; top:62px; right:0; bottom:0; width:min(420px,90vw); transform:translateX(100%); transition:.22s; background:rgba(10,12,17,.98); border-left:1px solid var(--gold); box-shadow:-18px 0 45px rgba(0,0,0,.55); }\n    .log-drawer.open { transform:none; }\n    .drawer-head { height:52px; display:flex; align-items:center; justify-content:space-between; padding:0 16px; border-bottom:1px solid #353842; }\n    .drawer-head h3 { margin:0; color:var(--gold); font-size:15px; }\n    .log-list { padding:12px 16px; overflow:auto; height:calc(100% - 52px); }\n    .log-item { display:grid; grid-template-columns:52px 1fr; gap:10px; padding:10px 0; border-bottom:1px solid #292c34; font-size:11px; line-height:1.5; }\n    .log-time { color:#777; }\n    .log-item b { color:var(--gold); }\n    .save-box { width:min(440px,88vw); padding:22px; background:#10131a; border:1px solid var(--gold); box-shadow:0 24px 70px rgba(0,0,0,.8); }\n    .save-box h2 { margin:0 0 8px; font-size:20px; }\n    .save-box p { margin:0 0 18px; color:#aaa; font-size:12px; line-height:1.6; }\n    .save-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; }\n    .save-actions button { height:40px; }\n    [data-info] { cursor:help; }\n    .preview { position:fixed; z-index:20; display:none; width:min(720px,calc(100vw - 24px)); max-height:82vh; padding:12px; grid-template-columns:minmax(270px,320px) minmax(260px,1fr); grid-template-rows:auto 1fr; gap:8px 14px; background:rgba(8,10,15,.985); border:1px solid var(--gold); box-shadow:0 20px 48px rgba(0,0,0,.78); pointer-events:none; overflow:hidden; }\n    .preview.show { display:grid; }\n    .preview img { grid-column:1; grid-row:1/3; width:100%; height:min(520px,72vh); object-fit:contain; background:#111319; border:1px solid #323640; }\n    .preview h3 { grid-column:2; margin:2px 0 6px; color:var(--gold); font-size:23px; }\n    .preview p { grid-column:2; margin:0; max-height:calc(82vh - 64px); overflow:auto; white-space:pre-line; color:#e1e2e6; font-size:15px; line-height:1.75; }\n    .damage-pips { display:flex; gap:5px; margin-top:5px; }\n    .damage-pips i { width:28px; height:6px; background:var(--red); box-shadow:0 0 7px rgba(189,75,82,.5); }\n    .damage-pips i.empty { background:#30333c; box-shadow:none; }\n    .ability-modal { position:fixed; z-index:40; inset:0; display:none; place-items:center; padding:28px; background:radial-gradient(circle at 50% 44%,rgba(30,34,46,.34),rgba(2,3,7,.88) 58%); backdrop-filter:blur(7px); }\n    .ability-modal.open { display:grid; }\n    .ability-panel { position:relative; width:min(1120px,94vw); height:min(690px,88vh); max-height:88vh; display:grid; grid-template-columns:260px minmax(0,1fr); overflow:hidden; border:1px solid rgba(214,174,82,.52); border-radius:14px; background:linear-gradient(145deg,rgba(18,21,29,.985),rgba(9,11,16,.99)); box-shadow:0 28px 90px rgba(0,0,0,.82),0 0 0 1px rgba(255,255,255,.025) inset,0 0 42px rgba(214,174,82,.08); }\n    .ability-identity { position:relative; min-height:0; overflow:hidden; border-right:1px solid rgba(214,174,82,.18); background:#090b10; }\n    .ability-identity img { width:100%; height:100%; object-fit:cover; object-position:50% 16%; filter:saturate(.94) contrast(1.02); }\n    .ability-identity::after { content:\"\"; position:absolute; inset:0; background:linear-gradient(180deg,rgba(5,7,12,.02) 34%,rgba(5,7,12,.72) 72%,rgba(5,7,12,.98) 100%); }\n    .identity-copy { position:absolute; z-index:1; left:22px; right:22px; bottom:24px; padding-top:18px; border-top:1px solid rgba(214,174,82,.34); }\n    .identity-copy small { display:inline-block; color:var(--gold); font:700 11px Georgia,serif; letter-spacing:.16em; text-transform:uppercase; }\n    .identity-copy h2 { margin:7px 0 8px; color:#fff; font-size:27px; line-height:1.18; text-shadow:0 2px 12px #000; }\n    .identity-copy p { margin:0; color:#b9bdc7; font-size:12px; line-height:1.7; }\n    .ability-content { display:flex; flex-direction:column; min-width:0; min-height:0; overflow:hidden; background:linear-gradient(180deg,rgba(20,23,31,.82),rgba(10,12,17,.94)); }\n    .ability-head { flex:0 0 68px; height:68px; display:flex; align-items:center; justify-content:space-between; padding:0 22px; border-bottom:1px solid rgba(255,255,255,.08); background:rgba(8,10,15,.52); }\n    .ability-tabs { display:flex; gap:8px; padding:5px; border:1px solid rgba(255,255,255,.08); border-radius:10px; background:rgba(0,0,0,.24); }\n    .ability-tabs button { height:36px; padding:0 20px; border-color:transparent; border-radius:7px; background:transparent; color:#9da2ad; font-size:13px; letter-spacing:.02em; }\n    .ability-tabs button.active { border-color:rgba(214,174,82,.55); color:#ffe4a0; background:linear-gradient(180deg,rgba(113,86,31,.34),rgba(65,48,16,.24)); box-shadow:0 0 16px rgba(214,174,82,.08) inset; }\n    .close { width:36px; height:36px; border-radius:50%; border-color:rgba(255,255,255,.12); background:rgba(255,255,255,.035); color:#b9bdc6; font-size:20px; line-height:1; }\n    .ability-list { flex:1 1 auto; min-height:0; padding:20px 22px 24px; overflow:auto; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); grid-auto-rows:max-content; gap:14px; align-content:start; scrollbar-width:thin; scrollbar-color:rgba(214,174,82,.42) rgba(255,255,255,.04); }\n    .ability-card { min-width:0; min-height:176px; height:max-content; display:grid; grid-template-columns:92px minmax(0,1fr); align-items:stretch; overflow:hidden; border:1px solid rgba(255,255,255,.105); border-radius:10px; background:linear-gradient(145deg,rgba(27,31,41,.92),rgba(18,21,28,.96)); box-shadow:0 7px 20px rgba(0,0,0,.2),0 1px 0 rgba(255,255,255,.025) inset; transition:border-color .16s,transform .16s,box-shadow .16s; }\n    .ability-card:hover { transform:translateY(-1px); border-color:rgba(214,174,82,.34); box-shadow:0 10px 25px rgba(0,0,0,.28); }\n    .ability-art { position:relative; min-height:176px; overflow:hidden; border-right:1px solid rgba(255,255,255,.07); background:#0c0f15; }\n    .ability-art img { width:100%; height:100%; min-height:176px; object-fit:cover; object-position:50% 18%; filter:saturate(.9) brightness(.9); }\n    .ability-art::after { content:\"\"; position:absolute; inset:45% 0 0; background:linear-gradient(transparent,rgba(6,8,12,.9)); pointer-events:none; }\n    .ability-art span { position:absolute; z-index:1; left:8px; bottom:8px; padding:3px 7px; border:1px solid rgba(214,174,82,.35); border-radius:999px; background:rgba(5,7,11,.74); color:#e0c579; font-size:9px; letter-spacing:.12em; }\n    .ability-art.has-skill-art { display:flex; align-items:center; justify-content:center; padding:5px; background:radial-gradient(circle at 50% 35%,#1a1d24,#080a0e 72%); }\n    .ability-art.has-skill-art img { width:100%; height:100%; min-height:0; max-height:176px; padding:0; object-fit:contain; object-position:center; filter:none; box-shadow:0 5px 16px rgba(0,0,0,.46); }\n    .ability-art.has-skill-art::after,.ability-art.has-skill-art span { display:none; }\n    .ability-text { min-width:0; display:flex; flex-direction:column; align-items:flex-start; padding:15px 16px 14px; overflow-wrap:anywhere; }\n    .ability-type { display:inline-flex; align-items:center; min-height:22px; padding:2px 8px; border-radius:999px; background:rgba(214,174,82,.09); color:#dabb6a; font-size:10px; letter-spacing:.03em; }\n    .ability-text h3 { margin:7px 0 8px; color:#f2f3f6; font-size:18px; line-height:1.25; }\n    .ability-text p { margin:0; color:#c4c8d0; font-size:12px; line-height:1.72; overflow-wrap:anywhere; }\n    .public-state { margin-top:12px; padding:11px; border-left:2px solid var(--gold); background:#20232b; color:#e0e1e4; font-size:14px; line-height:1.6; }\n    .ability-card button { min-width:84px; height:31px; margin-top:auto; padding:0 13px; border-radius:6px; border-color:rgba(214,174,82,.34); background:rgba(214,174,82,.06); color:#e9d292; font-size:11px; }\n    .ability-card button.np { border-color:var(--gold); color:#fff; background:#8f252c; }\n    .ability-page.hidden-page { display:none; }\n    .ability-list.ability-page { grid-template-columns:repeat(2,minmax(0,1fr)); }\n    .ability-list.servant-page .ability-card:last-child { grid-column:auto; max-width:none; }\n    @media(max-width:860px){.ability-panel{grid-template-columns:210px minmax(0,1fr)}.ability-list.ability-page{grid-template-columns:1fr}}\n    .skill-toast { position:fixed; z-index:60; left:50%; bottom:32%; transform:translate(-50%,18px); min-width:300px; padding:13px 20px; text-align:center; color:#fff; background:rgba(10,12,18,.96); border:1px solid var(--gold); box-shadow:0 10px 30px rgba(0,0,0,.65); opacity:0; pointer-events:none; transition:.2s; }\n    .skill-toast.show { opacity:1; transform:translate(-50%,0); }\n    .choice-modal { position:fixed; z-index:70; inset:0; display:none; place-items:center; background:rgba(2,3,7,.82); backdrop-filter:blur(5px); }\n    .choice-modal.open { display:grid; }\n    .choice-panel { width:min(700px,88vw); padding:20px; background:#0d1016; border:1px solid var(--gold); box-shadow:0 24px 70px rgba(0,0,0,.82); }\n    .choice-head { display:flex; justify-content:space-between; gap:18px; align-items:flex-start; padding-bottom:14px; border-bottom:1px solid #30333b; }\n    .choice-head small { color:var(--gold); letter-spacing:1px; }\n    .choice-head h3 { margin:4px 0 5px; font-size:22px; }\n    .choice-head p { margin:0; color:#999da6; font-size:11px; line-height:1.55; }\n    .choice-options { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-top:16px; }\n    .choice-option { min-height:112px; height:auto; padding:14px; text-align:left; border:1px solid #3b404b; background:linear-gradient(180deg,#171b24,#10131a); color:#d9dce2; font-size:12px; line-height:1.6; }\n    .choice-option::before { content:attr(data-index); display:block; margin-bottom:7px; color:var(--gold); font:700 11px Georgia,serif; }\n    .choice-option.selected { border-color:var(--gold); color:#fff3cb; box-shadow:0 0 0 2px rgba(214,174,82,.13),0 8px 22px rgba(0,0,0,.35); background:linear-gradient(180deg,#272116,#16130e); }\n    .choice-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:16px; }\n    .choice-actions button { min-width:108px; }\n    @media(max-width:900px){.choice-options{grid-template-columns:1fr}.choice-panel{max-height:82vh;overflow:auto}}\n  ";
const markup="<div class=\"battle-root\"><header class=\"topbar\">\n    <div class=\"brand\">Fate / Domination<span class=\"ranking\">战果排名　<b>1. 伊莉雅斯菲尔 9</b>　2. 卫宫切嗣 6　3. 远坂凛 5　4. 言峰绮礼 3<br>5. 间桐樱 2　6. 斯堪的纳维亚·佩佩隆奇诺 1　7. 巴泽特·弗拉加·马克雷米兹 0</span></div>\n    <div class=\"phase-zone\">\n      <div class=\"phase\"><span>准备阶段</span><span>前哨阶段</span><span class=\"active\">行动阶段</span><span>战斗阶段</span><span>结算阶段</span></div>\n      <div class=\"turn-order\" aria-label=\"本回合行动顺序\">\n        <span class=\"turn-token active\" title=\"1 卫宫切嗣（当前）\"><img src=\"../assets/cards/masters/卫宫切嗣.png\" alt=\"卫宫切嗣\"></span><i class=\"turn-arrow\">›</i>\n        <span class=\"turn-token\" title=\"2 远坂凛\"><img src=\"../assets/cards/masters/远坂凛.png\" alt=\"远坂凛\"></span><i class=\"turn-arrow\">›</i>\n        <span class=\"turn-token\" title=\"3 言峰绮礼\"><img src=\"../assets/cards/masters/言峰绮礼.png\" alt=\"言峰绮礼\"></span><i class=\"turn-arrow\">›</i>\n        <span class=\"turn-token\" title=\"4 伊莉雅斯菲尔\"><img src=\"../assets/cards/masters/伊莉雅斯菲尔.png\" alt=\"伊莉雅\"></span><i class=\"turn-arrow\">›</i>\n        <span class=\"turn-token\" title=\"5 间桐樱\"><img src=\"../assets/cards/masters/间桐樱.png\" alt=\"间桐樱\"></span><i class=\"turn-arrow\">›</i>\n        <span class=\"turn-token\" title=\"6 佩佩隆奇诺\"><img src=\"../assets/cards/masters/斯堪的纳维亚·佩佩隆奇诺.png\" alt=\"佩佩\"></span><i class=\"turn-arrow\">›</i>\n        <span class=\"turn-token\" title=\"7 巴泽特\"><img src=\"../assets/cards/masters/巴泽特·弗拉加·马克雷米兹.png\" alt=\"巴泽特\"></span>\n      </div>\n    </div>\n    <div class=\"round\"><strong>第 2 回合</strong></div>\n  </header>\n  <div class=\"top-tools\"><button id=\"open-log\">操作记录</button><button id=\"open-save\">退出</button></div>\n\n  <div class=\"status\"><b>卫宫切嗣</b> 正在行动 · 请选择一张牌或进行常规移动</div>\n\n  <section class=\"opponents left\">\n    <article class=\"opponent\"><img src=\"../assets/cards/masters/远坂凛.png\" alt=\"远坂凛\"><img src=\"../assets/cards/servants/阿尔托莉雅·潘德拉贡.png\" alt=\"Saber\"><div class=\"opp-info\"><b>远坂凛</b><div class=\"class\">Saber</div><div>魔力 <strong>8</strong> · 令咒 <strong>3</strong></div><div>深山町 · 威力 <strong>5</strong></div></div><div class=\"public-cards\"><span class=\"public-label\">出牌区</span><span class=\"mini-card played\" title=\"已打出：翻弄\"><img src=\"../assets/cards/deck/翻弄.png\" alt=\"翻弄\"></span><span class=\"mini-card deck-back\" title=\"暗置牌\">?</span></div></article>\n    <article class=\"opponent\"><img src=\"../assets/cards/masters/间桐樱.png\" alt=\"间桐樱\"><img src=\"../assets/ui/card-backs/servant-hidden.png\" alt=\"未解放\"><div class=\"opp-info\"><b>间桐樱</b><div class=\"class\">从者未解放</div><div>魔力 <strong>6</strong> · 令咒 <strong>2</strong></div><div>新都 · 威力 <strong>?</strong></div></div><div class=\"public-cards\"><span class=\"public-label\">出牌区</span><span class=\"mini-card effect\" title=\"轮回时代：争斗时代\"><img src=\"../assets/cards/skills/争斗时代.png\" alt=\"争斗时代\"></span><span class=\"mini-card played\" title=\"已打出：迫击\"><div class=\"deck-back\">2</div></span></div></article>\n    <article class=\"opponent\"><img src=\"../assets/cards/masters/斯堪的纳维亚·佩佩隆奇诺.png\" alt=\"佩佩\"><img src=\"../assets/cards/servants/宫本武藏.png\" alt=\"宫本武藏\"><div class=\"opp-info\"><b>佩佩隆奇诺</b><div class=\"class\">Saber · 宫本武藏</div><div>魔力 <strong>5</strong> · 令咒 <strong>2</strong></div><div>侦察 · 威力 <strong>4</strong></div></div><div class=\"public-cards\"><span class=\"public-label\">出牌区</span><span class=\"mini-card effect\" title=\"轮回时代：圆满时代\"><img src=\"../assets/cards/skills/圆满时代.png\" alt=\"圆满时代\"></span><span class=\"mini-card effect\" title=\"境界：水之境界\"><img src=\"../assets/cards/skills/空之境界.png\" alt=\"境界\"></span></div></article>\n  </section>\n\n  <section class=\"opponents right\">\n    <article class=\"opponent current\"><img src=\"../assets/cards/masters/言峰绮礼.png\" alt=\"言峰绮礼\"><img src=\"../assets/cards/servants/库·丘林.png\" alt=\"Lancer\"><div class=\"opp-info\"><b>言峰绮礼</b><div class=\"class\">Lancer</div><div>魔力 <strong>4</strong> · 令咒 <strong>1</strong></div><div class=\"waiting\">等待你行动</div></div><div class=\"public-cards\"><span class=\"public-label\">出牌区</span><span class=\"mini-card effect\" title=\"神仆\"><img src=\"../assets/cards/skills/神仆.png\" alt=\"神仆\"></span><span class=\"mini-card played\" title=\"已打出：幸运\"><div class=\"deck-back\">4</div></span></div></article>\n    <article class=\"opponent\"><img src=\"../assets/cards/masters/伊莉雅斯菲尔.png\" alt=\"伊莉雅\"><img src=\"../assets/cards/servants/赫拉克勒斯.png\" alt=\"Berserker\"><div class=\"opp-info\"><b>伊莉雅斯菲尔</b><div class=\"class\">Berserker</div><div>魔力 <strong>9</strong> · 令咒 <strong>3</strong></div><div>工坊 · 威力 <strong>7</strong></div></div><div class=\"public-cards\"><span class=\"public-label\">出牌区</span><span class=\"mini-card effect\" title=\"天数进程：第三天\"><img src=\"../assets/cards/skills/时代轮回.png\" alt=\"天数进程\"></span><span class=\"mini-card played\" title=\"已打出：强打\"><div class=\"deck-back\">3</div></span></div></article>\n    <article class=\"opponent\"><img src=\"../assets/cards/masters/巴泽特·弗拉加·马克雷米兹.png\" alt=\"巴泽特\"><img src=\"../assets/cards/servants/美杜莎.png\" alt=\"美杜莎\"><div class=\"opp-info\"><b>巴泽特</b><div class=\"class\">Rider · 美杜莎</div><div>魔力 <strong>7</strong> · 令咒 <strong>2</strong></div><div>新都 · 威力 <strong>6</strong></div></div><div class=\"public-cards\"><span class=\"public-label\">出牌区</span><span class=\"mini-card effect\" title=\"天数进程：第三天\"><img src=\"../assets/cards/skills/时代轮回.png\" alt=\"第三天\"></span><span class=\"mini-card played\" title=\"已打出：翻弄\"><img src=\"../assets/cards/deck/翻弄.png\" alt=\"翻弄\"></span></div></article>\n  </section>\n\n  <section class=\"board\" aria-label=\"原版3乘2地点地图\">\n    <article class=\"place situation\"><div class=\"deck-display situation-deck\" data-count=\"11\"></div><div class=\"place-title\">局势牌<small>剩余11张</small></div></article>\n    <article class=\"place workshop\"><div class=\"situation-active\" data-info=\"怒不可遏|力量攻击于深山町和新都获得威力+2；恢复2点魔力。\"><img src=\"../assets/map/situations/怒不可遏.png\" alt=\"怒不可遏\"><span>怒不可遏</span></div><div class=\"place-title\">魔术工坊<small>当前局势：怒不可遏</small></div><div class=\"land-slots workshop-slots\"><span class=\"land-slot\"><span class=\"slot-face\"><img src=\"../assets/cards/masters/伊莉雅斯菲尔.png\" alt=\"伊莉雅斯菲尔\"></span><b>魔力 +2</b></span><span class=\"land-slot secondary\"><span class=\"slot-face\"></span><b>魔力 +1</b></span><span class=\"land-slot secondary\"><span class=\"slot-face\"></span><b>魔力 +1</b></span><span class=\"land-slot secondary\"><span class=\"slot-face\"></span><b>魔力 +1</b></span></div></article>\n    <article class=\"place event\"><div class=\"deck-display event-deck\" data-count=\"18\"></div><div class=\"place-title\">事件牌<small>冬木事件组 · 剩余18张</small></div></article>\n    <article class=\"place mountain active\"><span class=\"base-vp\">2</span><div class=\"map-event-card\" data-info=\"占领高地|事件战果3；此战场的地利翻倍。\"><img src=\"../assets/map/events/占领高地.png\" alt=\"占领高地\"><span class=\"event-vp\">3</span><span class=\"event-name\">占领高地</span></div><div class=\"place-title\">深山町<small>基础战果2 · 事件牌明置</small></div><div class=\"land-slots\"><span class=\"land-slot\"><span class=\"slot-face\"><img src=\"../assets/cards/masters/卫宫切嗣.png\" alt=\"卫宫切嗣\"></span><b>地利 +3威</b></span><span class=\"land-slot secondary\"><span class=\"slot-face\"><img src=\"../assets/cards/masters/远坂凛.png\" alt=\"远坂凛\"></span><b>地利 +1威</b></span></div></article>\n    <article class=\"place scout\"><span class=\"base-vp\">2</span><div class=\"place-title\">侦察</div></article>\n    <article class=\"place city\"><span class=\"base-vp\">3</span><div class=\"map-event-card facedown\" data-info=\"新都事件牌|当前尚未揭示，卡名、效果及事件战果均保持隐藏。\"></div><div class=\"place-title\">新都<small>基础战果3 · 当前事件未揭示</small></div><div class=\"land-slots\"><span class=\"land-slot\"><span class=\"slot-face\"><img src=\"../assets/cards/masters/间桐樱.png\" alt=\"间桐樱\"></span><b>地利 +3威</b></span><span class=\"land-slot secondary\"><span class=\"slot-face\"></span><b>地利 +1威</b></span></div></article>\n  </section>\n\n  <section class=\"player\">\n    <div class=\"portraits\">\n      <div class=\"portrait\"><img src=\"../assets/cards/masters/卫宫切嗣.png\" alt=\"卫宫切嗣\"></div>\n      <div class=\"portrait servant\"><img src=\"../assets/cards/servants/卫宫.png\" alt=\"卫宫\"></div>\n      <div class=\"player-info\">\n        <h2>卫宫切嗣</h2>\n        <div class=\"servant-name\">Archer · 卫宫</div>\n        <div class=\"meters\"><div>魔力 7 / 12<div class=\"meter\"><i style=\"width:58.33%\"></i></div></div><div>牌库 12 · 弃牌 6<div class=\"meter red\"><i style=\"width:34%\"></i></div></div></div>\n      </div>\n    </div>\n    <div class=\"resources\"><span>令咒 <b>● ● ●</b></span><span>战果 <b>6</b></span><span>手牌 <b>4</b></span></div>\n  </section>\n\n  <main class=\"hand\">\n    <div class=\"card\"><div class=\"fallback\"><b>迫击</b><small>力量 · 威力 2</small></div><div class=\"tag\">迫击</div></div>\n    <div class=\"card\"><div class=\"fallback\"><b>翻弄</b><small>迅捷 · 威力 2</small></div><div class=\"tag\">翻弄</div></div>\n    <div class=\"card\"><img src=\"../assets/cards/deck/幸运.png\" onerror=\"this.remove()\" alt=\"幸运\"><div class=\"fallback\"><b>幸运</b><small>特殊 · 威力 4</small></div><div class=\"tag\">幸运</div></div>\n    <div class=\"card\"><div class=\"fallback\"><b>高位魔法</b><small>魔法 · 威力 4</small></div><div class=\"tag\">高位魔法</div></div>\n  </main>\n\n  <nav class=\"actions\"><button id=\"open-ability\">御主与从者技能</button><button>常规移动</button><div class=\"play-action-row\"><output class=\"power-meter\" id=\"player-power\" aria-live=\"polite\"><span>威力</span><strong>0</strong></output><button id=\"confirm-play\" disabled>确认出牌 0/2</button></div><button class=\"primary\">结束行动阶段</button></nav>\n\n  <div class=\"preview\" id=\"preview\"><img alt=\"卡图预览\"><h3></h3><p></p></div>\n  <div class=\"ability-modal\" id=\"ability-modal\">\n    <section class=\"ability-panel\">\n      <div class=\"ability-identity\"><img src=\"../assets/cards/servants/卫宫.png\" alt=\"卫宫\"><div class=\"identity-copy\"><small>ARCHER</small><h2>卫宫</h2><p>御主：卫宫切嗣<br>真名已解放 · 当前位于深山町</p></div></div>\n      <div class=\"ability-content\">\n        <header class=\"ability-head\"><div class=\"ability-tabs\"><button data-page=\"master\">御主能力</button><button class=\"active\" data-page=\"servant\">从者技能</button></div><button class=\"close\" id=\"close-ability\" aria-label=\"关闭\">×</button></header>\n        <div class=\"ability-list ability-page master-page hidden-page\" data-ability-page=\"master\">\n          <article class=\"ability-card\"><img src=\"../assets/cards/masters/卫宫切嗣.png\" alt=\"魔术师杀手\"><div class=\"ability-text\"><span class=\"ability-type\">被动</span><h3>魔术师杀手</h3><p>游戏开始时，将牌库中的一张牌替换为【起源弹】。</p></div></article>\n          <article class=\"ability-card\"><img src=\"../assets/cards/masters/卫宫切嗣.png\" alt=\"固有时制御\"><div class=\"ability-text\"><span class=\"ability-type\">行动阶段</span><h3>固有时制御</h3><p>暗置打出一张牌，然后抽一张牌。普通能力只显示选择与结算反馈。</p><button data-normal-skill=\"固有时制御\">使用能力</button></div></article>\n        </div>\n        <div class=\"ability-list ability-page servant-page\" data-ability-page=\"servant\">\n          <article class=\"ability-card\"><img src=\"../assets/cards/skills/炽天覆七重圆环.png\" alt=\"炽天覆七重圆环\"><div class=\"ability-text\"><span class=\"ability-type\">特殊 · 战斗阶段</span><h3>炽天覆七重圆环</h3><p>将同一战场所有对手的迅捷属性威力变为0。</p><button data-normal-skill=\"炽天覆七重圆环\">使用技能</button></div></article>\n          <article class=\"ability-card\"><img src=\"../assets/cards/skills/伪·螺旋剑.png\" alt=\"伪·螺旋剑\"><div class=\"ability-text\"><span class=\"ability-type\">迅捷 / 宝具</span><h3>伪·螺旋剑</h3><p>使用后按卡牌效果正常结算；真名状态由规则自动处理。</p><button data-normal-skill=\"伪·螺旋剑\">使用技能</button></div></article>\n          <article class=\"ability-card\"><img src=\"../assets/cards/skills/无限剑制.png\" alt=\"无限剑制\"><div class=\"ability-text\"><span class=\"ability-type\">特殊属性 · 非宝具</span><h3>无限剑制</h3><p>组建至多12张牌的手牌并展开残留效果。它不是宝具，因此不播放宝具动画。</p><button data-normal-skill=\"无限剑制\">使用技能</button></div></article>\n        </div>\n      </div>\n    </section>\n  </div>\n  <div class=\"choice-modal\" id=\"choice-modal\"><section class=\"choice-panel\"><header class=\"choice-head\"><div><small id=\"choice-type\">OPTION SKILL</small><h3 id=\"choice-title\">选择效果</h3><p id=\"choice-desc\"></p></div><button class=\"close\" id=\"close-choice\" aria-label=\"关闭\">×</button></header><div class=\"choice-options\" id=\"choice-options\"></div><div class=\"choice-actions\"><button id=\"cancel-choice\">取消</button><button class=\"primary\" id=\"confirm-choice\" disabled>确认选择</button></div></section></div>\n  <aside class=\"log-drawer\" id=\"log-drawer\"><header class=\"drawer-head\"><h3>本局操作记录</h3><button class=\"close\" id=\"close-log\" aria-label=\"关闭\">×</button></header><div class=\"log-list\"><div class=\"log-item\"><span class=\"log-time\">行动 1</span><span><b>卫宫切嗣</b> 部署于深山町，获得地利 +3。</span></div><div class=\"log-item\"><span class=\"log-time\">行动 2</span><span><b>远坂凛</b> 打出【翻弄】，当前公开威力2。</span></div><div class=\"log-item\"><span class=\"log-time\">行动 3</span><span><b>伊莉雅斯菲尔</b> 部署于魔术工坊，获得2点魔力。</span></div><div class=\"log-item\"><span class=\"log-time\">当前</span><span><b>卫宫切嗣</b> 正在行动，等待选择卡牌或移动地点。</span></div></div></aside>\n  <div class=\"ability-modal\" id=\"save-modal\"><section class=\"save-box\"><h2>保存并退出</h2><p>单人进度保存到独立存档。联机对局只保留重连信息，不生成房间存档。</p><div class=\"save-actions\"><button id=\"cancel-save\">返回游戏</button><button class=\"primary\">保存并退出</button></div></section></div>\n  <div class=\"skill-toast\" id=\"skill-toast\"></div></div>";
function render(host,options={}){
 if(!host) throw new Error('FDBattleUI host missing');
 const root=host.shadowRoot||host.attachShadow({mode:'open'});
 root.innerHTML='<style>'+css+'</style>'+markup;
  root.querySelector('style').textContent+=`
    :host { --table-h:clamp(420px,calc(100vh - 300px),620px); }
    .status { display:none; }
    .board,.opponents,.opponents.right { top:82px; }
    /* Tilt the main location board away from the player. */
    .board { transform-origin:center bottom; transform:perspective(1100px) rotateX(17deg); }
    /* Give the two full-height card faces enough width to match their 5:7 artwork. */
    :host { --side:clamp(300px,23vw,440px); --portrait:clamp(96px,7.25vw,140px); }
    /* Preserve the full card art, including its original frame and text. */
    .player { border-radius:12px; overflow:hidden; }
    .opp-panel-face { border-radius:12px; }
    .player .portrait img { width:100%; height:100%; object-fit:contain; object-position:center; background:#0c1119; }
    /* Show the entire playable card face above the screen edge. */
    .hand { bottom:8px; padding-bottom:0; }
    .hand .card img { display:block; object-fit:contain; }
    /* Center the phase sequence; place turn order in the space before the action buttons. */
    .topbar { height:82px; }
    .ranking { max-width:640px; font-size:12.5px; line-height:1.45; }
    .phase-zone { left:0; right:0; top:0; width:auto; height:82px; transform:none; display:block; white-space:nowrap; pointer-events:none; }
    .phase { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); gap:6px; font-size:13px; pointer-events:auto; }
    .phase span { padding:8px 7px; }
    .turn-order { position:absolute; right:340px; top:50%; transform:translateY(-50%); gap:4px; font-size:11px; pointer-events:auto; }
    .turn-token { width:28px; height:28px; }
    .turn-token.active { width:32px; height:32px; }
    .turn-arrow { font-size:10px; }
    .top-tools { top:24px; }
    .round { top:28px; }
    @media(max-width:1700px) { .ranking { max-width:580px; font-size:12px; } .phase-zone { left:50%; right:auto; width:max-content; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; } .phase,.turn-order { position:static; transform:none; } .phase { font-size:12px; } .phase span { padding:5px 8px; } .turn-token { width:23px; height:23px; } .turn-token.active { width:27px; height:27px; } }
    @media(max-width:1500px) { .ranking { max-width:440px; font-size:11.5px; } }
    .play-action-row { display:grid; grid-template-columns:112px minmax(0,1fr); gap:6px; }
    .power-meter { height:38px; display:flex; align-items:center; justify-content:space-between; gap:6px; padding:0 11px; border:1px solid rgba(214,174,82,.52); border-radius:5px; color:#d9d4c7; background:linear-gradient(180deg,rgba(29,32,39,.96),rgba(12,15,21,.98)); font-size:12px; }
    .power-meter strong { color:#ffe29a; font:700 19px/1 Georgia,serif; }
    /* Seven or more cards collapse into a centered 3D fan. */
    .hand.fan { width:min(820px,calc(100vw - var(--side) - var(--side) - 76px)); height:218px; bottom:30px; display:block; padding:0; perspective:1100px; transform:translateX(-50%); }
    .hand.fan .card { position:absolute; left:calc(50% - clamp(56px,3.15vw,64px)); bottom:0; margin:0; transform-origin:50% 135%; transform:translate3d(var(--fan-x,0),var(--fan-y,0),var(--fan-z,0)) rotateZ(var(--fan-r,0deg)) rotateY(var(--fan-tilt,0deg)); z-index:var(--fan-layer,1); transition:transform .24s cubic-bezier(.18,.78,.2,1),border-color .18s,box-shadow .18s,filter .18s; }
    .hand.fan .card:hover { transform:translate3d(var(--fan-x,0),calc(var(--fan-y,0px) - 38px),70px) rotateZ(0deg) rotateY(0deg) scale(1.05); z-index:40; }
    .hand.fan .card.selected { transform:translate3d(var(--fan-x,0),calc(var(--fan-y,0px) - 42px),82px) rotateZ(0deg) rotateY(0deg) scale(1.055); z-index:45; }
    .hand.fan .card.played { transform:translate3d(var(--fan-x,0),calc(var(--fan-y,0px) + 16px),var(--fan-z,0)) rotateZ(var(--fan-r,0deg)) rotateY(var(--fan-tilt,0deg)) scale(.93); }
    .draw-card-flight { position:fixed; z-index:80; overflow:hidden; border:2px solid var(--gold); background:#11151d; box-shadow:0 18px 38px rgba(0,0,0,.72),0 0 22px rgba(214,174,82,.26); pointer-events:none; transform-style:preserve-3d; will-change:transform,opacity; }
    .draw-card-flight img { width:100%; height:100%; display:block; object-fit:contain; background:#0c1119; }
    .card.draw-pending { visibility:hidden; }
    /* Make deployed masters and their location rewards readable at a glance. */
    .land-slots { right:14px; bottom:12px; gap:12px; }
    .land-slot { gap:5px; font-size:12px; font-weight:800; line-height:1.15; }
    .land-slot .slot-face { width:52px; height:52px; border-width:3px; box-shadow:0 6px 15px rgba(0,0,0,.82),0 0 10px rgba(214,174,82,.2); }
    .land-slot b { padding:2px 4px; border-radius:4px; background:rgba(4,7,12,.68); font-size:11px; letter-spacing:.02em; }
    .workshop-slots { right:12px; gap:8px; }
    .workshop-slots .slot-face { width:46px; height:46px; }
    .workshop-slots .land-slot b { font-size:10px; }
    /* Deck-to-location deal overlay: the real target stays hidden until the flying card lands. */
    .map-deal-pending { visibility:hidden; }
    .map-card-flight { position:fixed; z-index:90; pointer-events:none; perspective:1200px; transform-origin:0 0; will-change:transform,filter; }
    .map-card-flight-inner { position:absolute; inset:0; transform-style:preserve-3d; will-change:transform; }
    .map-flight-face { position:absolute; inset:0; overflow:hidden; border:2px solid #777d89; border-radius:3px; background:#11151d center/cover no-repeat; box-shadow:0 18px 38px rgba(0,0,0,.8),0 0 24px rgba(214,174,82,.28); backface-visibility:hidden; }
    .map-flight-face.front { transform:rotateY(180deg); border-color:var(--gold); }
    .map-flight-face img { width:100%; height:100%; display:block; object-fit:cover; }
    /* Preview panels ease in and out instead of snapping open. */
    .preview { display:grid; opacity:0; visibility:hidden; transform:translateY(12px) scale(.972); transform-origin:42% 18%; filter:blur(2px); transition:opacity .2s ease,transform .28s cubic-bezier(.16,1,.3,1),filter .2s ease,visibility 0s linear .28s; will-change:opacity,transform; }
    .preview.show { display:grid; opacity:1; visibility:visible; transform:translateY(0) scale(1); filter:blur(0); transition-delay:0s; }
    @media(max-width:1200px) { .hand.fan { width:min(650px,calc(100vw - 48px)); } }
    @media(prefers-reduced-motion:reduce) { .hand.fan .card { transition:none; } .map-deal-pending { visibility:visible; } .preview { transition:none; filter:none; } }
    .portraits { grid-template-columns:clamp(104px,6vw,128px) clamp(104px,6vw,128px) minmax(0,1fr); height:clamp(150px,17vh,184px); min-height:0; }
    .card { width:clamp(112px,6.3vw,128px); height:clamp(158px,8.9vw,181px); }
    .opponent { position:relative; display:block; overflow:visible; border:0; background:transparent; box-shadow:none; }
    .opponent.current { border:0; box-shadow:none; }
    .opp-panel-rotor { position:absolute; inset:0; }
    .opp-panel-face { position:absolute; inset:0; min-width:0; overflow:hidden; border:1px solid rgba(255,255,255,.24); background:rgba(10,12,17,.96); box-shadow:0 7px 18px rgba(0,0,0,.5); transition:opacity .22s ease,transform .26s cubic-bezier(.2,.72,.18,1),filter .22s ease; }
    .opponent.current .opp-panel-face { border-color:var(--gold); box-shadow:0 0 13px rgba(214,174,82,.22),0 7px 18px rgba(0,0,0,.55); }
    .opp-panel-front { z-index:2; display:grid; grid-template-columns:var(--portrait) var(--portrait) minmax(0,1fr); opacity:1; transform:scale(1); pointer-events:auto; }
    .opp-panel-front > img { width:100%; height:100%; min-height:0; object-fit:contain; object-position:center; background:#0c1119; border-right:1px solid #333; cursor:zoom-in; }
    .opp-panel-front .opp-info { position:relative; display:flex; flex-direction:column; min-height:0; padding:8px 7px 7px 9px; }
    .opp-panel-front .opp-info>b { flex:0 0 auto; max-height:2.5em; padding-right:34px; overflow:hidden; white-space:normal; line-height:1.25; }
    .opp-power-badge { display:flex; align-items:baseline; gap:5px; margin-top:3px; color:var(--gold); line-height:1.25; }
    .opp-power-badge small { color:var(--gold); font-size:11px; }
    .opp-power-badge strong { color:#ffe29a; font:700 15px/1 "Microsoft YaHei",sans-serif; }
    .opp-seal-line { display:flex; align-items:center; gap:5px; margin-top:3px; color:#858b96; font-size:9px; white-space:nowrap; }
    .opp-location-line { margin-top:auto; overflow:hidden; color:#d8dce2; font-size:10px; white-space:nowrap; text-overflow:ellipsis; }
    .opp-resource-line,.opp-deck-line { display:flex; align-items:center; gap:7px; min-width:0; margin-top:3px; color:#858b96; font-size:9px; white-space:nowrap; }
    .opp-deck-line { padding-right:33px; }
    .opp-resource-line strong,.opp-deck-line strong { margin-left:2px; color:#f0f2f5; font-size:10px; }
    .opp-seals { color:#d8b75f; letter-spacing:1px; }
    .opp-seals .spent { color:#424750; }
    .opp-panel-back { z-index:1; display:grid; grid-template-rows:34px 21px minmax(0,1fr); opacity:0; transform:scale(.965); filter:brightness(.8); pointer-events:none; background:linear-gradient(155deg,rgba(25,27,34,.99),rgba(9,11,16,.99)); }
    .opponent.is-flipped .opp-panel-front { z-index:1; opacity:0; transform:scale(.965); filter:brightness(.8); pointer-events:none; }
    .opponent.is-flipped .opp-panel-back { z-index:2; opacity:1; transform:scale(1); filter:none; pointer-events:auto; }
    .opp-detail-head { display:flex; align-items:center; min-width:0; padding:0 7px 0 10px; border-bottom:1px solid rgba(214,174,82,.28); background:rgba(214,174,82,.055); }
    .opp-detail-title { min-width:0; flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; color:#fff; font-size:11px; font-weight:bold; }
    .opp-detail-title small { margin-left:6px; color:var(--gold); font-size:9px; font-weight:normal; }
    .opp-detail-power { flex:0 0 auto; margin:0 6px; color:var(--gold); font-size:9px; }
    .opp-detail-power strong { margin-left:3px; color:#ffe29a; font:700 11px/1 "Microsoft YaHei",sans-serif; }
    .opp-detail-meta { display:flex; align-items:center; gap:9px; min-width:0; padding:0 9px; overflow:hidden; border-bottom:1px solid rgba(255,255,255,.06); color:#858b96; font-size:8px; white-space:nowrap; }
    .opp-detail-meta span:first-child { min-width:0; overflow:hidden; text-overflow:ellipsis; color:#c9ced6; }
    .opp-panel-toggle { width:29px; height:29px; min-width:29px; padding:0; display:grid; place-items:center; border-color:rgba(214,174,82,.42); border-radius:3px; color:var(--gold); background:linear-gradient(180deg,rgba(38,34,25,.98),rgba(18,18,19,.98)); font:17px/1 Georgia,serif; }
    .opp-panel-toggle::before { display:none; }
    .opp-panel-front .opp-panel-toggle { position:absolute; right:7px; top:7px; }
    .opp-panel-toggle:not(:disabled):hover { transform:none; color:#fff0bc; background:#2b271d; box-shadow:0 0 10px rgba(214,174,82,.16); }
    .opp-detail-content { min-height:0; display:grid; grid-template-columns:1.45fr 1fr; grid-template-rows:minmax(0,1fr) auto; gap:5px 8px; padding:6px 9px 7px; }
    .opp-detail-group { min-width:0; overflow:hidden; }
    .opp-detail-group.status-group { grid-column:1/-1; display:grid; grid-template-columns:38px minmax(0,1fr); align-items:center; }
    .opp-detail-label { display:block; margin-bottom:4px; color:#959ba6; font-size:9px; line-height:1; }
    .status-group .opp-detail-label { margin:0; }
    .opp-skill-strip,.opp-played-strip,.opp-status-row { min-width:0; display:flex; align-items:center; gap:5px; overflow:hidden; }
    .opp-skill-card { flex:0 0 auto; width:42px; height:58px; cursor:zoom-in; }
    .opp-panel-back .mini-card { flex:0 0 auto; width:42px; height:58px; }
    .opp-card-overflow { flex:0 0 auto; width:36px; height:58px; display:grid; place-items:center; border:1px solid rgba(189,75,82,.5); color:#ffc2c5; background:linear-gradient(145deg,#382126,#151319); font:700 11px Georgia,serif; box-shadow:-3px 0 0 #23262e,-6px 0 0 #17191f; cursor:zoom-in; }
    .preview.attack-stack { width:min(960px,calc(100vw - 24px)); grid-template-columns:minmax(0,1fr); grid-template-rows:auto minmax(0,1fr) auto; gap:10px; padding:14px 16px; }
    .preview-card-gallery { display:none; }
    .preview.attack-stack > img { display:none !important; }
    .preview.attack-stack .preview-card-gallery { grid-column:1; grid-row:2; display:grid; align-items:center; justify-content:center; gap:10px; min-width:0; min-height:0; }
    .preview.attack-stack .preview-card-gallery img { grid-column:auto; grid-row:auto; width:100%; height:min(440px,62vh); min-width:0; object-fit:contain; background:#111319; border:1px solid #323640; }
    .preview.attack-stack h3 { grid-column:1; grid-row:1; margin:0; text-align:center; }
    .preview.attack-stack p { grid-column:1; grid-row:3; max-height:none; text-align:center; font-size:13px; }
    .opp-status-chip { max-width:110px; padding:3px 7px; border:1px solid rgba(92,169,214,.32); border-radius:3px; color:#b5ddff; background:rgba(24,53,75,.38); font-size:9px; line-height:1.3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:help; }
    .opp-power-badge.changed,.opp-detail-power.changed { animation:opp-power-pulse .46s ease; }
    @keyframes opp-power-pulse { 45% { color:#fff; filter:brightness(1.5); text-shadow:0 0 12px rgba(255,222,137,.8); } }
    @media (prefers-reduced-motion: reduce) { .opp-panel-face { transition:none; } }
  `;
 const battleRoot=root.querySelector('.battle-root');
 if(battleRoot&&options.backgroundUrl){const bg=String(options.backgroundUrl).replace(/"/g,'%22');battleRoot.style.backgroundImage='url("'+bg+'")'}
 const api={root};

    const query={get:key=>key==='master'?options.master:key==='servant'?options.servant:key==='mode'?options.mode:null};
    const detailData = window.FDCodexDetailData || {masters:{},servants:{}};
    const requestedMaster = query.get('master') || '远坂凛';
    const requestedServant = query.get('servant') || '阿尔托莉雅';
    const masterData = detailData.masters?.[requestedMaster] || detailData.masters?.['远坂凛'];
    const servantData = detailData.servants?.[requestedServant] || detailData.servants?.['阿尔托莉雅'];
    function h(v){return String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]))}
    function asset(src,kind,name){if(src&&src.startsWith('../assets/'))return '../assets/'+src.slice('../assets/'.length);return src||('../assets/cards/'+(kind==='master'?'masters':'servants')+'/'+name+'.png')}
    function phaseSkill(s){return /(?:准备|前哨|行动|战斗)阶段/.test((s.type||'')+'\n'+(s.text||''))}
    function purePassive(s){return String(s.type||'').replace(/\s+/g,'')==='被动'&&!phaseSkill(s)}
    function choiceLines(s){return String(s.text||'').split(/\r?\n/).map(x=>x.trim()).filter(x=>/^[-－•]/.test(x)).map(x=>x.replace(/^[-－•]\s*/,''))}
    function masterManaCap(data){
      const texts=(data?.skills||[]).map(s=>String(s.text||'')).join('\n');
      const match=texts.match(/魔力上限(?:为|是)?\s*(\d+)/);
      return match?Number(match[1]):12;
    }
    function skillCards(list,kind,ownerImage){return (list||[]).filter(s=>s.type!=='牌库牌').map((s,i)=>{const passive=purePassive(s),phase=phaseSkill(s),choices=choiceLines(s),ownerName=kind==='master'?masterData.name:servantData.name,hasSkillArt=!!s.image,img=asset(s.image||ownerImage,kind,ownerName),button=passive?'':('<button data-normal-skill="'+h(s.name)+'" data-skill-kind="'+kind+'" data-skill-index="'+i+'" '+(choices.length?'data-choice-skill="1"':'')+'>'+(phase?'发动能力':'使用技能')+'</button>');return '<article class="ability-card"><div class="ability-art '+(hasSkillArt?'has-skill-art':'')+'"><img src="'+h(img)+'" alt="'+h(hasSkillArt?s.name:ownerName)+'">'+(hasSkillArt?'<span>技能卡</span>':'')+'</div><div class="ability-text"><span class="ability-type">'+h(s.type||'技能')+'</span><h3>'+h(s.name)+'</h3><p>'+h(s.text||'').replace(/\n/g,'<br>')+'</p>'+button+'</div></article>'}).join('')}
    const extraMasterIdentities=[
      {name:'伊莉雅斯菲尔',fullName:'伊莉雅斯菲尔',class:'Master',image:'../assets/cards/masters/伊莉雅斯菲尔.png',skills:[
        {name:'人工生命体',type:'被动',text:'你的魔力初始值为6。'},
        {name:'圣杯容器',type:'被动',text:'第八回合开始时，激活【天之衣】。'},
        {name:'小圣杯',type:'被动',text:'你打出攻击时所需的魔力消耗-1。回合结束时，若你本回合打出的攻击均为暗置，获得1点魔力。'},
        {name:'天之衣',type:'被动',text:'归于虚无-回合开始时，若你上回合在战斗阶段时与至少一名被淘汰的玩家位于同一战场，获得2点战果。'},
        {name:'第三法',type:'升华技',text:'解锁此技能后，你立即从手牌、牌库及弃牌堆中移除所有力量牌。你的魔术和特殊属性的基本攻击获得+2威力。当局势牌为天之杯时，未被淘汰的玩家全部获胜。'}
      ]},
      {name:'巴泽特·弗拉加·马克雷米兹',fullName:'巴泽特·弗拉加·马克雷米兹',class:'Master',image:'../assets/cards/masters/巴泽特·弗拉加·马克雷米兹.png',skills:[
        {name:'传承保菌者',type:'被动',text:'将【佛拉格拉克】加入你的技能区。'},
        {name:'时间迷失',type:'被动',text:'游戏开始时，你处于【第一天】，每回合结束时，推进一天。当你战败时【再启动】。高潮阶段的每回合结束时，若你未【觉醒】，失去5点战果。'},
        {name:'第一天',type:'被动',text:'彷徨-你-2合计威力。'},
        {name:'第二天',type:'被动',text:'你拥有的魔力少于8点也可以打出【佛拉格拉克】且其于本回合失去<每局游戏限一次>。战斗阶段：若你获胜，获得2点战果。'},
        {name:'第四天',type:'被动',text:'若你于本回合获胜，【觉醒】。若你于回合结束时未【觉醒】，【再启动】。'},
        {name:'佛拉格拉克',type:'魔术',text:'<每局游戏限一次>\n先发后至-下一次一名与你位于同一战场的对手使用宝具时，令其【败北】。'},
        {name:'再启动',type:'被动',text:'下回合开始时，你返回【第一天】并获得1点战果。'},
        {name:'觉醒',type:'被动',text:'你失去时间迷失并恢复所有令咒，然后令【佛拉格拉克】返回你的技能区。'},
        {name:'第三天',type:'力量',text:'（此牌于第三天加入你的技能区）\n被动/行动阶段：将此牌加入攻击。\n战斗阶段：若你获胜，获得3点战果。'},
        {name:'无懈可击',type:'升华技',text:'【佛拉格拉克】失去<每局游戏限一次>并获得：“残留：此牌持续激活至你触发先发后至或再启动。”'}
      ]},
      {name:'斯堪的纳维亚·佩佩隆奇诺',fullName:'斯堪的纳维亚·佩佩隆奇诺',class:'Master',image:'../assets/cards/masters/斯堪的纳维亚·佩佩隆奇诺.png',skills:[
        {name:'隐匿者',type:'被动',text:'你负责【印度异闻带】。'},
        {name:'心理论',type:'被动',text:'你可查看对手的弃牌堆。'},
        {name:'身体论',type:'行动',text:'行动阶段：花费2点魔力，合计威力+3，若可能则沿着箭头移动一步。'},
        {name:'印度异闻带',type:'被动',text:'扩张-从【时代轮回】中随机选择一张事件牌加入你所在的战场。战斗结束后，若你未获得该事件的胜利将该事件牌移除游戏。当你本回合进行扩张的事件牌进入弃牌堆时，此异闻带的【尺寸】永久+1。'},
        {name:'时代轮回',type:'被动',text:'你的准备阶段将【时代】改为适合当前回合的。\n神明裁判-每回合第一次，佩佩隆奇诺进入任一战场时，他进行【扩张】。回合结束时，若你未进行扩张，移除除此牌上的一张事件牌。\n【圆满时代】回合1-4：印度事件牌的X为4。\n【三分时代】回合5-7：印度事件牌的X为3。\n【二分时代】回合8-9：印度事件牌的X为2。\n【争斗时代】回合10：印度事件牌的X为1。\n【审判时代】回合11：印度事件牌的X为印度的【尺寸】。'},
        {name:'印度事件牌',type:'被动',text:'印度异闻带事件牌会依当前【时代】与【尺寸】改变战果、地利或基础攻击威力，并处理扩张、移除与弃置。'},
        {name:'涅槃',type:'升华技',text:'你的对手不会受到印度事件牌的影响。\n虚空论-前哨阶段：移除【时代轮回】的一张事件牌，获得2点魔力且合计威力+3。\n强制扩张-行动阶段：花费7点魔力，使印度异闻带的【尺寸】永久+1。'}
      ]}
    ];
    function uniqueByName(list){const seen=new Set();return list.filter(x=>x&&x.name&&!seen.has(x.name)&&(seen.add(x.name),true))}
    function masterImg(m){return asset(m?.image,'master',m?.name||'远坂凛')}
    function servantImg(s){return asset(s?.image,'servant',s?.name||'阿尔托莉雅')}
    function buildBattleRoster(){
      const mastersPool=uniqueByName([...Object.values(detailData.masters||{}),...extraMasterIdentities]).filter(m=>m.name!==masterData.name);
      const servantsPool=uniqueByName(Object.values(detailData.servants||{})).filter(s=>s.name!==servantData.name);
      const locations=['深山町','新都','侦察','魔术工坊','深山町','新都'];
      const current={master:masterData,servant:servantData,mana:7,seals:3,location:'深山町',power:5,vp:6,handCount:4,deckCount:8,discardCount:0,activeAttackCount:2,current:true,nameRevealed:true};
      const attackCounts=[2,3,5,6,7,4];
      const opponents=Array.from({length:6},(_,i)=>({master:mastersPool[i%mastersPool.length],servant:servantsPool[i%servantsPool.length],mana:4+(i%5),seals:3-(i===4?1:0),location:locations[i],power:4+(i%4),vp:5-i,handCount:3,deckCount:7-(i%3),discardCount:i%3,activeAttackCount:attackCounts[i],revealedSkillSlots:i===1?[0]:[],current:false,nameRevealed:i%3!==1}));
      return [current,...opponents];
    }
    const battleRoster=buildBattleRoster();
    function opponentPower(player){const value=Number(player?.power);return Number.isFinite(value)?value:0}
    function opponentDeckCount(player){const value=Number(player?.deckCount);return Number.isFinite(value)?Math.max(0,value):(player?.servant?.deck||[]).length}
    function sealPips(count){return Array.from({length:3},(_,i)=>'<i class="'+(i<count?'':'spent')+'">●</i>').join('')}
    function opponentHtml(player,index){
      const m=player.master,s=player.servant,revealed=player.nameRevealed!==false,opponentIndex=index-1,servantSrc=revealed?servantImg(s):'../assets/ui/card-backs/servant-hidden.png',servantAlt=revealed?s.name:'从者未解放',classText=revealed?((s.class||'Servant')+' · '+s.name):'从者未解放',power=opponentPower(player),deckCount=opponentDeckCount(player),handCount=Number(player.handCount||0),discardCount=Number(player.discardCount||0);
      player.rosterIndex=opponentIndex;
      return '<article class="opponent" data-roster-index="'+index+'"><div class="opp-panel-rotor"><div class="opp-panel-face opp-panel-front"><img data-card-kind="master" src="'+h(masterImg(m))+'" alt="'+h(m.name)+'"><img data-card-kind="servant" src="'+h(servantSrc)+'" alt="'+h(servantAlt)+'"><div class="opp-info"><b>'+h(m.name)+'</b><div class="class">'+h(classText)+'</div><span class="opp-power-badge" title="当前公开的合计威力"><small>合计威力</small><strong data-opponent-power>'+power+'</strong></span><div class="opp-seal-line"><span>令咒</span><b class="opp-seals">'+sealPips(player.seals)+'</b></div><div class="opp-location-line">'+h(player.location)+' · 魔力 <strong>'+player.mana+'</strong></div><div class="opp-deck-line"><span>牌库 <strong>'+deckCount+'</strong></span><span>手牌 <strong>'+handCount+'</strong></span><span>弃牌 <strong>'+discardCount+'</strong></span></div><button class="opp-panel-toggle" type="button" title="查看技能、攻击与状态" aria-label="查看'+h(m.name)+'的技能、攻击与状态" aria-pressed="false"><span aria-hidden="true">⇄</span></button></div></div><div class="opp-panel-face opp-panel-back"><div class="opp-detail-head"><span class="opp-detail-title">'+h(m.name)+'<small class="opp-detail-subtitle">'+h(classText)+'</small></span><span class="opp-detail-power">威力 <strong data-opponent-power>'+power+'</strong></span><button class="opp-panel-toggle" type="button" title="返回玩家信息" aria-label="返回'+h(m.name)+'的玩家信息" aria-pressed="false"><span aria-hidden="true">⇄</span></button></div><div class="opp-detail-meta"><span>'+h(player.location)+'</span><span>魔 '+player.mana+'</span><span>令 '+player.seals+'</span><span>牌 '+deckCount+'</span></div>'+opponentBackHtml(player,opponentIndex,revealed)+'</div></div></article>';
    }
    function bindBattleRoster(){
      const opponents=battleRoster.slice(1);
      const left=root.querySelector('.opponents.left'),right=root.querySelector('.opponents.right');
      if(left)left.innerHTML=opponents.slice(0,3).map((p,i)=>opponentHtml(p,i+1)).join('');
      if(right)right.innerHTML=opponents.slice(3,6).map((p,i)=>opponentHtml(p,i+4)).join('');
      const ranking=root.querySelector('.ranking');if(ranking)ranking.innerHTML='战果排名　'+battleRoster.map((p,i)=>(i===0?'<b>':'')+(i+1)+'. '+h(p.master.name)+' '+p.vp+(i===0?'</b>':'')).join('　');
      const turn=root.querySelector('.turn-order');if(turn)turn.innerHTML=battleRoster.map((p,i)=>'<span class="turn-token '+(i===0?'active':'')+'" title="'+(i+1)+' '+h(p.master.name)+(i===0?'（当前）':'')+'"><img src="'+h(masterImg(p.master))+'" alt="'+h(p.master.name)+'"></span>'+(i<battleRoster.length-1?'<i class="turn-arrow">›</i>':'')).join('');
      const workshopSlots=[...root.querySelectorAll('.workshop .slot-face')],mountainSlots=[...root.querySelectorAll('.mountain .slot-face')],citySlots=[...root.querySelectorAll('.city .slot-face')];
      const placements=[battleRoster[4],battleRoster[0],battleRoster[1],battleRoster[2]];
      [workshopSlots[0],mountainSlots[0],mountainSlots[1],citySlots[0]].forEach((slot,i)=>{const p=placements[i];if(!slot||!p)return;slot.innerHTML='<img src="'+h(masterImg(p.master))+'" alt="'+h(p.master.name)+'">'});
    }
    bindBattleRoster();
    function updateAbilityIdentity(page='servant'){
      const identity=root.querySelector('.ability-identity');
      if(!identity||!masterData||!servantData)return;
      const img=identity.querySelector('img'),label=identity.querySelector('small'),title=identity.querySelector('h2'),desc=identity.querySelector('p');
      if(page==='master'){
        if(img){img.src=asset(masterData.image,'master',masterData.name);img.alt=masterData.name}
        if(label)label.textContent='MASTER';
        if(title)title.textContent=masterData.name;
        if(desc)desc.innerHTML='御主能力<br>当前位于深山町';
      }else{
        const klass=servantData.class||'Servant';
        if(img){img.src=asset(servantData.image,'servant',servantData.name);img.alt=servantData.name}
        if(label)label.textContent=klass;
        if(title)title.textContent=servantData.name;
        if(desc)desc.innerHTML='御主：'+h(masterData.name)+'<br>当前位于深山町';
      }
    }
    let openingHand=[];
    function expandDeckCards(deck){return (deck||[]).flatMap(card=>Array.from({length:Math.max(1,Number(card.count)||1)},(_,copy)=>({...card,copy}))) }
    function handCardHtml(card){return '<div class="card" data-card-id="'+h(card.id||card.name)+'" data-power="'+h(card.basePower??0)+'" data-info="'+h(card.name)+'|'+h(card.type||'攻击')+' · 魔耗 '+h(card.cost??0)+' · 威力 '+h(card.basePower??0)+'\n'+h(card.text||'')+'"><img src="'+h(card.image||'')+'" alt="'+h(card.name)+' 卡图"><div class="tag">'+h(card.name)+'</div></div>'}
    function handCards(){return [...root.querySelectorAll('.hand .card')]}
    function updateHandLayout(){
      const hand=root.querySelector('.hand'),cards=handCards(),count=cards.length,isFan=count>6;
      if(!hand)return;
      hand.classList.toggle('fan',isFan);
      cards.forEach((card,index)=>{
        if(!isFan){['--fan-x','--fan-y','--fan-z','--fan-r','--fan-tilt','--fan-layer'].forEach(name=>card.style.removeProperty(name));return}
        const middle=(count-1)/2,offset=index-middle,step=Math.min(61,690/Math.max(1,count-1)),normalized=middle?offset/middle:0;
        card.style.setProperty('--fan-x',(offset*step).toFixed(1)+'px');
        card.style.setProperty('--fan-y',(Math.pow(Math.abs(normalized),1.65)*16).toFixed(1)+'px');
        card.style.setProperty('--fan-z',(index*1.5).toFixed(1)+'px');
        card.style.setProperty('--fan-r',(normalized*13).toFixed(2)+'deg');
        card.style.setProperty('--fan-tilt',(normalized*-5).toFixed(2)+'deg');
        card.style.setProperty('--fan-layer',String(index+1));
      });
      const countNode=root.querySelector('.resources span:last-child b');if(countNode)countNode.textContent=String(count);
    }
    function nextDeckCards(count){
      const deck=expandDeckCards(servantData?.deck),existing=handCards().length;
      if(!deck.length)return [];
      return Array.from({length:Math.max(0,count)},(_,i)=>deck[(existing+i)%deck.length]);
    }
    function animateDrawCard(card,delay=0){
      const reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if(reduced){card.classList.remove('draw-pending');return Promise.resolve()}
      return new Promise(resolve=>window.setTimeout(()=>{
        const source=(root.querySelector('.player .meters>div:last-child')||root.querySelector('.situation-deck'))?.getBoundingClientRect(),target=card.getBoundingClientRect(),flight=document.createElement('div');
        if(!source||!target.width){card.classList.remove('draw-pending');resolve();return}
        const startX=source.left+source.width/2-target.width/2,startY=source.top+source.height/2-target.height/2;
        flight.className='draw-card-flight';flight.style.cssText='left:'+startX+'px;top:'+startY+'px;width:'+target.width+'px;height:'+target.height+'px';
        flight.innerHTML=card.querySelector('img')?.outerHTML||'';root.append(flight);
        const dx=target.left-startX,dy=target.top-startY,animation=flight.animate([{transform:'translate3d(0,0,0) rotateY(165deg) rotateZ(-7deg) scale(.42)',opacity:.35},{offset:.58,transform:'translate3d('+(dx*.72)+'px,'+(dy*.64)+'px,90px) rotateY(70deg) rotateZ(4deg) scale(.86)',opacity:1},{transform:'translate3d('+dx+'px,'+dy+'px,0) rotateY(0deg) rotateZ(0deg) scale(1)',opacity:1}],{duration:620,easing:'cubic-bezier(.2,.72,.18,1)',fill:'forwards'});
        animation.onfinish=()=>{flight.remove();card.classList.remove('draw-pending');resolve()};animation.oncancel=animation.onfinish;
      },delay))
    }
    function drawCards(cardsOrCount=1){
      const cards=Array.isArray(cardsOrCount)?cardsOrCount:nextDeckCards(Number(cardsOrCount)||1),hand=root.querySelector('.hand');
      if(!hand||!cards.length)return Promise.resolve([]);
      const added=cards.map(card=>{const template=document.createElement('template');template.innerHTML=handCardHtml(card);const node=template.content.firstElementChild;node.classList.add('draw-pending');hand.append(node);return node});
      updateHandLayout();refreshPlaySelection();
      return Promise.all(added.map((card,index)=>animateDrawCard(card,index*105))).then(()=>added);
    }
    function bindSelectedCharacters(){
      if(!masterData||!servantData)return;
      const masterImg=asset(masterData.image,'master',masterData.name),servantImg=asset(servantData.image,'servant',servantData.name),klass=servantData.class||'Servant';
      const portraits=root.querySelectorAll('.player .portrait img');
      if(portraits[0]){portraits[0].src=masterImg;portraits[0].alt=masterData.name}
      if(portraits[1]){portraits[1].src=servantImg;portraits[1].alt=servantData.name;portraits[1].closest('.portrait')?.setAttribute('data-class',klass)}
      const name=root.querySelector('.player-info h2');if(name)name.textContent=masterData.name;
      const servantName=root.querySelector('.player-info .servant-name');if(servantName)servantName.textContent=klass+' · '+servantData.name;
      const statusName=root.querySelector('.status b');if(statusName)statusName.textContent=masterData.name;
      const firstTurn=root.querySelector('.turn-token.active');if(firstTurn){firstTurn.title='1 '+masterData.name+'（当前）';const img=firstTurn.querySelector('img');if(img){img.src=masterImg;img.alt=masterData.name}}
      const mapMe=root.querySelector('.mountain .land-slot .slot-face img');if(mapMe){mapMe.src=masterImg;mapMe.alt=masterData.name}
      updateAbilityIdentity('servant');
      const manaValue=battleRoster[0]?.mana??7,manaCap=masterManaCap(masterData),manaRow=root.querySelector('.meters>div:first-child');
      if(manaRow){const fill=manaRow.querySelector('.meter i');if(manaRow.firstChild)manaRow.firstChild.nodeValue='魔力 '+manaValue+' / '+manaCap;if(fill)fill.style.width=Math.max(0,Math.min(100,manaValue/manaCap*100))+'%'}
      const masterList=root.querySelector('[data-ability-page="master"]'),servantList=root.querySelector('[data-ability-page="servant"]');
      if(masterList)masterList.innerHTML=skillCards(masterData.skills,'master',masterData.image);
      if(servantList)servantList.innerHTML=skillCards(servantData.skills,'servant',servantData.image);
      const tabs=root.querySelectorAll('.ability-tabs button[data-page]');
      if(tabs[0])tabs[0].textContent='御主能力 · '+(masterData.skills||[]).filter(s=>s.type!=='牌库牌').length;
      if(tabs[1])tabs[1].textContent='从者技能 · '+(servantData.skills||[]).filter(s=>s.type!=='牌库牌').length;
      const hand=root.querySelector('.hand');
      if(hand){openingHand=expandDeckCards(servantData.deck).slice(0,4);hand.replaceChildren();updateHandLayout()}
      const logName=root.querySelector('.log-item:last-child b');if(logName)logName.textContent=masterData.name;
    }
    bindSelectedCharacters();
    if(masterData?.name==='远坂凛'){
      const masterTab=root.querySelector('.ability-tabs button[data-page="master"]'),servantTab=root.querySelector('.ability-tabs button[data-page="servant"]');
      masterTab?.classList.add('active');servantTab?.classList.remove('active');
      root.querySelector('[data-ability-page="master"]')?.classList.remove('hidden-page');
      root.querySelector('[data-ability-page="servant"]')?.classList.add('hidden-page');
    }
    updateAbilityIdentity(root.querySelector('.ability-tabs button.active')?.dataset.page||'servant');
    function skillFaceHtml(player,slot){
      const skill=player?.servant?.skills?.[slot];
      if(!skill)return '<span class="skill-name-face">无技能</span>';
      const src=skill.image?asset(skill.image,'servant',player.servant.name):'';
      return src?'<img src="'+h(src)+'" alt="'+h(skill.name)+'">':'<span class="skill-name-face">'+h(skill.name)+'</span>';
    }
    function skillItemHtml(player,slot,revealed){
      const skill=player?.servant?.skills?.[slot],isPublic=revealed||(player?.revealedSkillSlots||[]).includes(slot),title=isPublic?(skill?.name||'已公开技能'):'技能未公开';
      return '<span class="opp-skill-card '+(isPublic?'revealed':'')+'" data-opponent="'+h(player.rosterIndex)+'" data-skill-slot="'+slot+'" title="'+h(title)+'">'+(isPublic?skillFaceHtml(player,slot):'<img src="../assets/cards/skills/skill-back.png" alt="技能牌背面">')+'</span>';
    }
    function opponentPublicCards(player,opponentIndex){
      const deck=(player?.servant?.deck||[]).filter(Boolean),count=Math.max(0,Number(player?.activeAttackCount??2)),cards=Array.from({length:count},(_,i)=>deck[(opponentIndex*2+i)%Math.max(1,deck.length)]).filter(Boolean),visible=cards.slice(0,cards.length>2?1:2);
      const faces=visible.map(card=>'<span class="mini-card played" title="已激活：'+h(card.name)+'|'+h(card.type||'攻击')+' · 魔耗 '+h(card.cost??0)+' · 威力 '+h(card.basePower??0)+'\n'+h(card.text||'')+'">'+(card.image?'<img src="'+h(card.image)+'" alt="'+h(card.name)+'">':'<div class="deck-back">'+h(card.basePower??'?')+'</div>')+'</span>').join('');
      const hidden=cards.slice(visible.length),stackCards=hidden.map(card=>'<i hidden data-stack-src="'+h(card.image||'')+'" data-stack-name="'+h(card.name||'攻击牌')+'"></i>').join('');
      return faces+(hidden.length?'<span class="opp-card-overflow" data-info="攻击区|另有 '+hidden.length+' 张激活攻击牌。">'+stackCards+'+'+hidden.length+'</span>':'');
    }
    function opponentStateSkills(player,opponentIndex,revealed){
      const skills=[...(player?.master?.skills||[]),...(player?.servant?.skills||[])],explicit=[...(player?.statuses||[]),...(player?.states||[]),...(player?.statusSkills||[])];
      const normalized=explicit.map(state=>{
        if(typeof state!=='string')return {...state,name:state.name||state.label||state.id||'状态',text:state.text||state.description||''};
        const exact=skills.find(skill=>skill.name===state);
        if(exact)return exact;
        const parts=state.split(':'),rawName=parts[0]==='role'&&parts[1]==='god-servant'?'神仆':parts[0]==='poison-until'?'中毒':parts[0]==='flawed'?'瑕疵':parts[0]==='dragon-source'?'龙化':parts.at(-1)||state;
        const detail=parts.length>1?'状态标识：'+state:'当前生效中的玩家状态';
        return {name:rawName,type:'状态',text:detail};
      }).filter(Boolean);
      const seen=new Set();
      return normalized.filter(state=>{const key=state.id||state.name||state.label;if(!key||seen.has(key))return false;seen.add(key);return true}).slice(0,3).map(skill=>({skill,src:skill.image?asset(skill.image,'servant',player.servant.name):'',kind:'状态'}));
    }
    function opponentStateHtml(player,opponentIndex,revealed){
      const states=opponentStateSkills(player,opponentIndex,revealed);
      if(!states.length)return '<span class="opp-status-chip" data-info="状态技能|暂无公开状态类技能。">无状态</span>';
      return states.map(({skill,src,kind})=>'<span class="opp-status-chip" data-info="'+h(skill.name)+'|'+h(kind+' · '+(skill.type||'技能')+'\n'+(skill.text||''))+'">'+(src?'<img hidden src="'+h(src)+'" alt="">':'')+h(skill.name)+'</span>').join('');
    }
    function opponentBackHtml(player,opponentIndex,revealed=player.nameRevealed!==false){
      return '<div class="opp-detail-content"><section class="opp-detail-group"><span class="opp-detail-label">从者技能</span><span class="opp-skill-strip">'+[0,1,2].map(slot=>skillItemHtml(player,slot,revealed)).join('')+'</span></section><section class="opp-detail-group"><span class="opp-detail-label">攻击区</span><span class="opp-played-strip">'+opponentPublicCards(player,opponentIndex)+'</span></section><section class="opp-detail-group status-group"><span class="opp-detail-label">状态</span><span class="opp-status-row">'+opponentStateHtml(player,opponentIndex,revealed)+'</span></section></div>';
    }
    root.addEventListener('click',event=>{
      const toggle=event.target.closest('.opp-panel-toggle');
      if(!toggle)return;
      const opponent=toggle.closest('.opponent'),flipped=!opponent.classList.contains('is-flipped');
      opponent.classList.toggle('is-flipped',flipped);
      opponent.querySelectorAll('.opp-panel-toggle').forEach(button=>button.setAttribute('aria-pressed',String(flipped)));
    });
    function motionApi(){return window.anime&&typeof window.anime.animate==='function'?window.anime:null}
    function playBattleEntrance(){
      const motion=motionApi();
      if(!motion||(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches))return;
      const top=[root.querySelector('.topbar'),root.querySelector('.top-tools'),root.querySelector('.status')].filter(Boolean);
      const board=root.querySelector('.board'),left=[...root.querySelectorAll('.opponents.left .opponent')],right=[...root.querySelectorAll('.opponents.right .opponent')],player=root.querySelector('.player'),actions=root.querySelector('.actions'),handCards=[...root.querySelectorAll('.hand .card')];
      if(board)motion.animate(board,{opacity:[0,1],scale:[.985,1],duration:520,ease:'outCubic'});
      if(left.length)motion.animate(left,{opacity:[0,1],x:[-30,0],delay:motion.stagger?motion.stagger(70):0,duration:430,ease:'outCubic'});
      if(right.length)motion.animate(right,{opacity:[0,1],x:[30,0],delay:motion.stagger?motion.stagger(70):0,duration:430,ease:'outCubic'});
      if(top.length)motion.animate(top,{opacity:[0,1],y:[-18,0],delay:250,duration:360,ease:'outCubic'});
      if(player)motion.animate(player,{opacity:[0,1],x:[-24,0],delay:340,duration:420,ease:'outCubic'});
      if(actions)motion.animate(actions,{opacity:[0,1],x:[24,0],delay:380,duration:420,ease:'outCubic'});
      if(handCards.length){motion.animate(handCards,{opacity:[0,1],y:[42,0],scale:[.94,1],delay:motion.stagger?motion.stagger(65,{from:'center'}):420,duration:520,ease:'outBack'});window.setTimeout(()=>handCards.forEach(card=>{card.style.removeProperty('transform');card.style.removeProperty('opacity');card.style.removeProperty('translate');card.style.removeProperty('scale')}),1050)}
    }
    function prepareMapDeals(){
      const deals=[
        {source:'.situation-deck',target:'.situation-active',back:'../assets/map/situations/situation-back.png',reveal:true,delay:0},
        {source:'.event-deck',target:'.mountain .map-event-card:not(.facedown)',back:'../assets/map/events/event-back.png',reveal:true,delay:210},
        {source:'.event-deck',target:'.city .map-event-card.facedown',back:'../assets/map/events/event-back.png',reveal:false,delay:420}
      ].map(item=>({...item,sourceNode:root.querySelector(item.source),targetNode:root.querySelector(item.target)})).filter(item=>item.sourceNode&&item.targetNode);
      deals.forEach(item=>item.targetNode.classList.add('map-deal-pending'));
      return deals;
    }
    function animateMapDeal(item){
      const {sourceNode,targetNode,back,reveal,delay}=item;
      if(!sourceNode?.isConnected||!targetNode?.isConnected)return Promise.resolve();
      const reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if(reduced){targetNode.classList.remove('map-deal-pending');return Promise.resolve()}
      const sourceRect=sourceNode.getBoundingClientRect(),targetRect=targetNode.getBoundingClientRect();
      if(!sourceRect.width||!targetRect.width){targetNode.classList.remove('map-deal-pending');return Promise.resolve()}
      const flight=document.createElement('div'),inner=document.createElement('div'),backFace=document.createElement('div'),frontFace=document.createElement('div');
      flight.className='map-card-flight';inner.className='map-card-flight-inner';backFace.className='map-flight-face back';frontFace.className='map-flight-face front';
      const backImg=document.createElement('img');backImg.src=back;backImg.alt='牌背';backFace.append(backImg);
      const faceImg=targetNode.querySelector('img')?.cloneNode(true)||backImg.cloneNode(true);frontFace.append(faceImg);
      inner.append(backFace,frontFace);flight.append(inner);root.append(flight);
      Object.assign(flight.style,{left:sourceRect.left+'px',top:sourceRect.top+'px',width:sourceRect.width+'px',height:sourceRect.height+'px'});
      const dx=targetRect.left-sourceRect.left,dy=targetRect.top-sourceRect.top,sx=targetRect.width/sourceRect.width,sy=targetRect.height/sourceRect.height,turn=dx>=0?4:-4;
      const travel=flight.animate([
        {transform:'translate3d(0,0,0) scale(1,1) rotateZ(0deg)',filter:'brightness(.9)'},
        {offset:.52,transform:`translate3d(${dx*.56}px,${dy*.56-54}px,100px) scale(${1+(sx-1)*.55},${1+(sy-1)*.55}) rotateZ(${turn}deg)`,filter:'brightness(1.2)'},
        {transform:`translate3d(${dx}px,${dy}px,0) scale(${sx},${sy}) rotateZ(0deg)`,filter:'brightness(1)'}
      ],{duration:760,delay,easing:'cubic-bezier(.2,.72,.18,1)',fill:'both'});
      inner.animate(reveal?[
        {transform:'rotateY(0deg)'},{offset:.38,transform:'rotateY(0deg)'},{offset:.72,transform:'rotateY(180deg)'},{transform:'rotateY(180deg)'}
      ]:[{transform:'rotateY(0deg)'},{transform:'rotateY(0deg)'}],{duration:760,delay,easing:'ease-in-out',fill:'both'});
      return travel.finished.catch(()=>{}).then(()=>{targetNode.classList.remove('map-deal-pending');flight.remove()});
    }
    function playMapOpeningSequence(deals){return Promise.all(deals.map(animateMapDeal))}
    function openAnimatedModal(modal,panel){
      if(!modal)return;
      modal.classList.add('open');
      const motion=motionApi(),target=panel||modal.firstElementChild;
      if(!motion||!target)return;
      target.style.removeProperty('opacity');target.style.removeProperty('transform');target.style.removeProperty('translate');target.style.removeProperty('scale');
      motion.animate(target,{opacity:[0,1],y:[16,0],scale:[.965,1],duration:280,ease:'outBack'});
    }
    function closeAnimatedModal(modal,panel){
      if(!modal||!modal.classList.contains('open'))return;
      const motion=motionApi(),target=panel||modal.firstElementChild;
      if(!motion||!target){modal.classList.remove('open');return}
      motion.animate(target,{opacity:[1,0],y:[0,10],scale:[1,.975],duration:165,ease:'inQuad'});
      window.setTimeout(()=>{modal.classList.remove('open');target.style.removeProperty('opacity');target.style.removeProperty('transform');target.style.removeProperty('translate');target.style.removeProperty('scale')},175);
    }
    window.fdRevealOpponentSkill=function(opponentIndex,slotIndex,frontSrc,title){const cards=root.querySelectorAll('.opp-skill-card[data-opponent="'+opponentIndex+'"][data-skill-slot="'+slotIndex+'"]'),player=battleRoster[opponentIndex+1],skill=player?.servant?.skills?.[slotIndex];if(!cards.length||!player)return false;player.revealedSkillSlots=[...new Set([...(player.revealedSkillSlots||[]),slotIndex])];const actualSrc=frontSrc||(skill?.image?asset(skill.image,'servant',player.servant.name):'');const actualTitle=title||skill?.name||'已公开从者技能';cards.forEach(card=>{card.innerHTML=actualSrc?'<img src="'+h(actualSrc)+'" alt="'+h(actualTitle)+'">':'<span class="skill-name-face">'+h(actualTitle)+'</span>';card.dataset.info=actualTitle+'|已公开从者技能';card.removeAttribute('title');card.classList.add('revealed')});return true};
    window.fdHideOpponentSkill=function(opponentIndex,slotIndex){const cards=root.querySelectorAll('.opp-skill-card[data-opponent="'+opponentIndex+'"][data-skill-slot="'+slotIndex+'"]'),player=battleRoster[opponentIndex+1];if(!cards.length)return false;if(player)player.revealedSkillSlots=(player.revealedSkillSlots||[]).filter(slot=>slot!==slotIndex);cards.forEach(card=>{card.innerHTML='<img src="../assets/cards/skills/skill-back.png" alt="技能牌背面">';card.dataset.info='技能未公开|真名解放前保持背面。';card.removeAttribute('title');card.classList.remove('revealed')});return true};
    window.fdSetOpponentStatuses=function(opponentIndex,statuses){const player=battleRoster[opponentIndex+1],opponent=root.querySelectorAll('.opponent')[opponentIndex];if(!player||!opponent||!Array.isArray(statuses))return false;player.statuses=statuses.slice();const detail=opponent.querySelector('.opp-detail-content');if(detail)detail.outerHTML=opponentBackHtml(player,opponentIndex,player.nameRevealed!==false);return true};
    window.fdSetOpponentPower=function(opponentIndex,power){const player=battleRoster[opponentIndex+1],opponent=root.querySelectorAll('.opponent')[opponentIndex],value=Number(power);if(!player||!opponent||!Number.isFinite(value))return false;player.power=value;opponent.querySelectorAll('[data-opponent-power]').forEach(node=>node.textContent=String(value));opponent.querySelectorAll('.opp-power-badge,.opp-detail-power').forEach(node=>{node.classList.remove('changed');void node.offsetWidth;node.classList.add('changed')});return true};
    window.fdSetOpponentTrueName=function(opponentIndex,revealed){const player=battleRoster[opponentIndex+1],opponent=root.querySelectorAll('.opponent')[opponentIndex];if(!player||!opponent)return false;player.nameRevealed=!!revealed;const servantCard=opponent.querySelector('img[data-card-kind="servant"]'),classLine=opponent.querySelector('.opp-info .class'),subtitle=opponent.querySelector('.opp-detail-subtitle'),detail=opponent.querySelector('.opp-detail-content'),classText=revealed?((player.servant.class||'Servant')+' · '+player.servant.name):'从者未解放';if(servantCard){servantCard.src=revealed?servantImg(player.servant):'../assets/ui/card-backs/servant-hidden.png';servantCard.alt=revealed?player.servant.name:'从者未解放'}if(classLine)classLine.textContent=classText;if(subtitle)subtitle.textContent=classText;if(detail)detail.outerHTML=opponentBackHtml(player,opponentIndex,!!revealed);return true};
    function stripNativeTitles(scope=root){
      const nodes=[];
      if(scope?.nodeType===1&&scope.hasAttribute('title'))nodes.push(scope);
      scope?.querySelectorAll?.('[title]').forEach(node=>nodes.push(node));
      nodes.forEach(node=>{
        const tip=node.getAttribute('title')?.trim();
        if(!tip)return node.removeAttribute('title');
        if(node.matches('.turn-token,.mini-card')&&!node.dataset.info)node.dataset.info=tip.includes('|')?tip:tip+'|';
        if(!node.getAttribute('aria-label'))node.setAttribute('aria-label',tip.split('|')[0]);
        node.removeAttribute('title');
      });
    }
    stripNativeTitles();
    const nativeTitleObserver=new MutationObserver(records=>records.forEach(record=>{
      if(record.type==='attributes')stripNativeTitles(record.target);
      else record.addedNodes.forEach(node=>stripNativeTitles(node));
    }));
    nativeTitleObserver.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['title']});
    const preview = root.getElementById('preview'),previewGallery=document.createElement('div');
    previewGallery.className='preview-card-gallery';preview.append(previewGallery);
    function publicSkillText(owner){const skills=(owner?.skills||[]).filter(s=>s.type!=='牌库牌');return skills.length?skills.map((s,i)=>(i+1)+'. 【'+s.name+'】'+(s.type?' · '+s.type:'')+'\n'+(s.text||'')).join('\n\n'):'暂无公开技能资料。'}
    function positionPreview(event){const r=preview.getBoundingClientRect(),vw=window.innerWidth,vh=window.innerHeight;let x=event.clientX+18,y=event.clientY-Math.min(100,r.height*.22);if(x+r.width>vw-12)x=event.clientX-r.width-18;if(y+r.height>vh-12)y=vh-r.height-12;preview.style.left=Math.max(10,x)+'px';preview.style.top=Math.max(10,y)+'px'}
    const previewSelector='[data-info], .mini-card, .opp-panel-front > img, .opp-skill-card, .hand .card';
    let previewReady=false,previewHoverTarget=null,previewDelayTimer=0,previewPointer={clientX:0,clientY:0};
    function cancelPreviewDelay(){window.clearTimeout(previewDelayTimer);previewDelayTimer=0}
    function hidePreview(){cancelPreviewDelay();preview.classList.remove('show')}
    function renderCardPreview(target,event){
      preview.classList.remove('attack-stack');previewGallery.replaceChildren();
      let img = target.matches('img') ? target.src : target.querySelector('img')?.src;
      let title='',detail='';
      const opponent=target.closest('.opponent');
      if(opponent&&target.matches('.opp-panel-front > img')){
        const player=battleRoster[Number(opponent.dataset.rosterIndex)],kind=target.dataset.cardKind,owner=kind==='master'?player?.master:player?.servant;
        title=kind==='servant'&&player?.nameRevealed===false?'从者未解放':owner?.name||target.alt||'角色';
        if(kind==='master') detail='御主能力\n\n'+publicSkillText(owner);
        else if(player?.nameRevealed!==false) detail=(owner?.class?owner.class+'\n\n':'')+'从者技能\n\n'+publicSkillText(owner);
        else detail='真名尚未解放。\n从者资料与技能保持隐藏。';
      }else if(target.classList.contains('opp-skill-card')){
        const opponentIndex=Number(target.dataset.opponent),slotIndex=Number(target.dataset.skillSlot),player=battleRoster[opponentIndex+1],skill=player?.servant?.skills?.[slotIndex];
        if(target.classList.contains('revealed')&&skill){title=skill.name;detail=(skill.type||'从者技能')+'\n\n'+(skill.text||'');img=skill.image?asset(skill.image,'servant',player.servant.name):img}else{title='从者技能未公开';detail='真名解放前保持背面。'}
      }else if(target.classList.contains('opp-card-overflow')){
        const stack=[...target.querySelectorAll('[data-stack-src]')];title='攻击区';detail='另有 '+stack.length+' 张激活攻击牌';img='';
        stack.forEach(marker=>{const card=document.createElement('img');card.src=marker.dataset.stackSrc;card.alt=marker.dataset.stackName;previewGallery.append(card)});
        previewGallery.style.gridTemplateColumns='repeat('+stack.length+',minmax(0,1fr))';preview.classList.add('attack-stack');
      }else{
        const raw = target.dataset.info || target.alt || '公开信息';
        [title,detail=''] = raw.split('|');
        if(!detail)detail=target.classList.contains('effect')?'当前持续生效的公开效果。':'点击或悬浮查看公开信息。';
      }
      const previewImg=preview.querySelector('img');previewImg.style.display=img?'block':'none';if(img)previewImg.src=img;
      preview.querySelector('h3').textContent=title;
      preview.querySelector('p').textContent=detail;
      positionPreview(event);
      if(!preview.classList.contains('show'))requestAnimationFrame(()=>{if(previewHoverTarget===target)preview.classList.add('show')});
    }
    root.addEventListener('pointerover',event=>{
      if(!previewReady){previewHoverTarget=null;hidePreview();return}
      const target=event.target.closest(previewSelector);
      if(!target||(event.relatedTarget&&target.contains(event.relatedTarget)))return;
      cancelPreviewDelay();previewHoverTarget=target;previewPointer={clientX:event.clientX,clientY:event.clientY};
      if(target.matches('.hand .card')){
        preview.classList.remove('show');
        previewDelayTimer=window.setTimeout(()=>{if(previewHoverTarget===target&&target.matches(':hover'))renderCardPreview(target,previewPointer)},1500);
      }else renderCardPreview(target,event);
    });
    root.addEventListener('pointermove',event=>{
      previewPointer={clientX:event.clientX,clientY:event.clientY};
      if(preview.classList.contains('show'))positionPreview(event);
    });
    root.addEventListener('pointerout',event=>{
      const target=event.target.closest(previewSelector);
      if(!target||(event.relatedTarget&&target.contains(event.relatedTarget)))return;
      if(previewHoverTarget===target){previewHoverTarget=null;hidePreview()}
    });
    const abilityModal = root.getElementById('ability-modal'),abilityPanel=abilityModal?.querySelector('.ability-panel');
    root.getElementById('open-ability').addEventListener('click', () => openAnimatedModal(abilityModal,abilityPanel));
    root.getElementById('close-ability').addEventListener('click', () => closeAnimatedModal(abilityModal,abilityPanel));
    abilityModal.addEventListener('click', event => { if (event.target === abilityModal) closeAnimatedModal(abilityModal,abilityPanel); });
    root.querySelectorAll('.ability-tabs button[data-page]').forEach(button => button.addEventListener('click', () => {
      root.querySelectorAll('.ability-tabs button[data-page]').forEach(item => item.classList.toggle('active', item === button));
      root.querySelectorAll('[data-ability-page]').forEach(page => page.classList.toggle('hidden-page', page.dataset.abilityPage !== button.dataset.page));
      updateAbilityIdentity(button.dataset.page);
      const activePage=root.querySelector('[data-ability-page="'+button.dataset.page+'"]'),tabMotion=motionApi();
      if(activePage&&tabMotion)tabMotion.animate(activePage,{opacity:[0,1],x:[10,0],duration:220,ease:'outCubic'});
    }));
    root.querySelectorAll('.ability-card').forEach(card => {
      const type = (card.querySelector('.ability-type')?.textContent || '').replace(/\s+/g, '');
      const passivePhase = /被动[\/／].*阶段/.test(type);
      const purePassive = /(^|[·])被动(?:$|[：:·])/.test(type) && !passivePhase;
      if (purePassive) card.querySelectorAll('button').forEach(button => button.remove());
      if (passivePhase && !card.querySelector('button')) {
        const button = document.createElement('button');
        button.dataset.normalSkill = card.querySelector('h3')?.textContent?.trim() || '阶段能力';
        button.textContent = '发动能力';
        card.querySelector('.ability-text')?.appendChild(button);
      }
    });
    const toast = root.getElementById('skill-toast');
    const confirmPlay = root.getElementById('confirm-play');
    const powerMeter = root.getElementById('player-power');
    function refreshPlaySelection() {
      const cards=handCards(),selected=cards.filter(card => card.classList.contains('selected'));
      const cardPower = card => Number(card.dataset.power) || 0;
      const playedPower = cards.filter(card => card.classList.contains('played')).reduce((sum,card) => sum + cardPower(card),0);
      const selectedPower = selected.reduce((sum,card) => sum + cardPower(card),0);
      confirmPlay.textContent = `确认出牌 ${selected.length}/2`;
      confirmPlay.disabled = selected.length !== 2;
      powerMeter.querySelector('strong').textContent = String(playedPower + selectedPower);
    }
    root.querySelector('.hand').addEventListener('click',event=>{
      const card=event.target.closest('.card');if(!card||card.classList.contains('played'))return;
      const selected=handCards().filter(item=>item.classList.contains('selected'));
      if(!card.classList.contains('selected')&&selected.length>=2)return;
      card.classList.toggle('selected');refreshPlaySelection();
    });
    confirmPlay.addEventListener('click', () => {
      const selected = handCards().filter(card => card.classList.contains('selected'));
      if (selected.length !== 2) return;
      const names = selected.map(card => card.querySelector('.tag')?.textContent?.trim() || '攻击牌');
      selected.forEach(card => {
        card.classList.remove('selected');
        card.classList.add('played');
        const tag = card.querySelector('.tag');
        if (tag) tag.textContent = '已出牌 · ' + (tag.textContent || '攻击牌');
      });
      refreshPlaySelection();
      toast.textContent = `已确认出牌：${names.join(' + ')}`;
      toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 1700);
    });
    const choiceModal=root.getElementById('choice-modal'),choiceTitle=root.getElementById('choice-title'),choiceType=root.getElementById('choice-type'),choiceDesc=root.getElementById('choice-desc'),choiceOptions=root.getElementById('choice-options'),confirmChoice=root.getElementById('confirm-choice');
    let activeChoiceSkill=null,activeChoiceText='';
    function openChoice(skill,source){const options=choiceLines(skill);if(!options.length)return false;activeChoiceSkill=skill;activeChoiceText='';choiceType.textContent=(source||'技能')+' · '+(skill.type||'');choiceTitle.textContent=skill.name;choiceDesc.textContent=String(skill.text||'').split(/\r?\n/).filter(x=>!/^\s*[-－•]/.test(x)).join(' ');choiceOptions.innerHTML=options.map((x,i)=>'<button class="choice-option" type="button" data-choice-value="'+h(x)+'" data-index="0'+(i+1)+'">'+h(x)+'</button>').join('');confirmChoice.disabled=true;openAnimatedModal(choiceModal,choiceModal.querySelector('.choice-panel'));const choiceMotion=motionApi(),choiceButtons=[...choiceOptions.querySelectorAll('.choice-option')];if(choiceMotion&&choiceButtons.length)choiceMotion.animate(choiceButtons,{opacity:[0,1],y:[12,0],delay:choiceMotion.stagger?choiceMotion.stagger(55):0,duration:260,ease:'outCubic'});return true}
    choiceOptions.addEventListener('click',event=>{const option=event.target.closest('.choice-option');if(!option)return;choiceOptions.querySelectorAll('.choice-option').forEach(x=>x.classList.toggle('selected',x===option));activeChoiceText=option.dataset.choiceValue||option.textContent.trim();confirmChoice.disabled=false});
    function closeChoice(){closeAnimatedModal(choiceModal,choiceModal.querySelector('.choice-panel'));activeChoiceSkill=null;activeChoiceText='';confirmChoice.disabled=true}
    root.getElementById('close-choice').addEventListener('click',closeChoice);root.getElementById('cancel-choice').addEventListener('click',closeChoice);choiceModal.addEventListener('click',e=>{if(e.target===choiceModal)closeChoice()});
    confirmChoice.addEventListener('click',()=>{if(!activeChoiceSkill||!activeChoiceText)return;const name=activeChoiceSkill.name;closeChoice();toast.textContent=`【${name}】已选择：${activeChoiceText}`;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1900)});
    root.querySelectorAll('[data-normal-skill]').forEach(button => button.addEventListener('click', () => {
      const source=button.dataset.skillKind==='master'?masterData:servantData,skill=(source?.skills||[]).find(s=>s.name===button.dataset.normalSkill);
      if(button.dataset.choiceSkill&&skill&&openChoice(skill,button.dataset.skillKind==='master'?'御主能力':'从者技能'))return;
      if(button.dataset.normalSkill==='无限剑制'){
        const targetHand=expandDeckCards(servantData.deck).slice(0,12),missing=targetHand.slice(handCards().length);
        closeAnimatedModal(abilityModal,abilityPanel);
        drawCards(missing).then(()=>{toast.textContent=`【无限剑制】手牌已重组为 ${handCards().length} 张`;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1900)});
        return;
      }
      if(button.dataset.normalSkill==='固有时制御'){
        closeAnimatedModal(abilityModal,abilityPanel);
        drawCards(1).then(()=>{toast.textContent='【固有时制御】抽取了 1 张牌';toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1700)});
        return;
      }      toast.textContent = `【${button.dataset.normalSkill}】已选择，等待目标或规则结算`;
      toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 1700);
    }));
    const logDrawer = root.getElementById('log-drawer');
    root.getElementById('open-log').addEventListener('click', () => logDrawer.classList.add('open'));
    root.getElementById('close-log').addEventListener('click', () => logDrawer.classList.remove('open'));
    const saveModal = root.getElementById('save-modal'),saveBox=saveModal?.querySelector('.save-box');
    root.getElementById('open-save').addEventListener('click', () => openAnimatedModal(saveModal,saveBox));
    root.getElementById('cancel-save').addEventListener('click', () => closeAnimatedModal(saveModal,saveBox));
    saveModal.addEventListener('click', event => { if (event.target === saveModal) closeAnimatedModal(saveModal,saveBox); });
    const confirmExit = saveModal.querySelector('.save-actions .primary');
    if (confirmExit) confirmExit.addEventListener('click', () => options.onExit?.());
    api.drawCards=drawCards;
    api.reflowHand=updateHandLayout;
    api.isPreviewReady=()=>previewReady;
    api.playMapDealSequence=()=>playMapOpeningSequence(prepareMapDeals());
    window.fdDrawPlayerCards=count=>drawCards(count);
    const openingMapDeals=prepareMapDeals();
    playBattleEntrance();
    window.setTimeout(()=>{
      if(!root.isConnected)return;
      playMapOpeningSequence(openingMapDeals)
        .then(()=>drawCards(openingHand))
        .then(()=>{if(root.isConnected){previewReady=true;root.classList.add('preview-ready')}});
    },650);

 return api;
}
window.FDBattleUI={render};
})();
