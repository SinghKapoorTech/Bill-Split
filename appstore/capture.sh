#!/bin/bash
# Tap-free screen capture for the Divit WebView app running in a simulator.
#
#   ./appstore/capture.sh <device-udid> <out-dir> <out.png> <route> [actions-json] [wait-s]
#
# Drives the app by patching index.html INSIDE THE INSTALLED SIMULATOR BUNDLE
# (never the repo) with a bootstrap script that sets the route and clicks real
# DOM elements. simctl has no tap verb and `simctl openurl` raises a blocking
# "Open in Divit?" dialog, so this is the only unattended path.
#
# Two hard-won requirements:
#  1. <base href="/"> is injected. Vite emits RELATIVE asset paths
#     (./assets/index-*.js); rewriting the path to a multi-segment route like
#     /bill/xyz resolves them against /bill/ -> 404 -> blank white page with NO
#     window.onerror (script 404s don't fire it).
#  2. Actions support {"text":"Next","until":"Split Summary"} which clicks UNTIL a
#     marker appears. Never use a fixed count: the wizard's starting step depends
#     on how complete the bill is, so a fixed count silently lands on the wrong
#     screen.
#
# Prereq: a pristine copy of the installed index.html at /tmp/divit-index-original.html
#   cp "$(xcrun simctl get_app_container <udid> com.singhkapoortech.divit app)/public/index.html" \
#      /tmp/divit-index-original.html
# Refresh it after EVERY build — asset hashes change.
set -e

DEV="$1"; OUTDIR="$2"; OUT="$3"; ROUTE="$4"; ACTIONS="${5:-[]}"; WAIT="${6:-15}"
BID=com.singhkapoortech.divit
PRISTINE=/tmp/divit-index-original.html

[ -f "$PRISTINE" ] || { echo "Missing $PRISTINE — see header"; exit 1; }
APPDIR=$(xcrun simctl get_app_container "$DEV" "$BID" app)

python3 - "$APPDIR/public/index.html" "$ROUTE" "$ACTIONS" "$PRISTINE" <<'PY'
import sys
idx, route, actions, pristine = sys.argv[1:5]
html = open(pristine).read()
boot = """<base href="/">
<script>
(function(){
  history.replaceState(null,"","%s");
  var ACTIONS = %s;
  function vis(e){ return e.offsetParent !== null; }
  function findByText(t){
    var els = Array.from(document.querySelectorAll('button,[role="button"],a'));
    var m = els.filter(function(e){ return vis(e) && (e.textContent||"").trim().toLowerCase().indexOf(t.toLowerCase())>=0; });
    if(!m.length) m = els.filter(function(e){ return (e.textContent||"").trim().toLowerCase().indexOf(t.toLowerCase())>=0; });
    return m[0];
  }
  function hasText(t){ return (document.body.innerText||"").toLowerCase().indexOf(t.toLowerCase())>=0; }
  function waitClick(t, cb, tries){
    tries = tries||0;
    var el = findByText(t);
    if(el){ el.click(); setTimeout(cb, 1300); return; }
    if(tries>60){ cb(); return; }
    setTimeout(function(){ waitClick(t, cb, tries+1); }, 250);
  }
  function run(i){
    if(i>=ACTIONS.length){ window.__AUTO_DONE__=true; return; }
    var a=ACTIONS[i];
    if(a.until){
      var guard=0;
      (function loop(){
        if(hasText(a.until) || guard>=(a.max||6)){ run(i+1); return; }
        guard++; waitClick(a.text, loop);
      })();
    } else {
      var n=a.times||1,k=0;
      (function step(){ if(k>=n){ run(i+1); return; } k++; waitClick(a.text, step); })();
    }
  }
  window.addEventListener("load", function(){ setTimeout(function(){ run(0); }, 3200); });
})();
</script>
""" % (route, actions)
open(idx,'w').write(html.replace("<head>", "<head>\n" + boot, 1))
PY

xcrun simctl terminate "$DEV" "$BID" 2>/dev/null || true
sleep 1
xcrun simctl launch "$DEV" "$BID" >/dev/null
sleep "$WAIT"
xcrun simctl status_bar "$DEV" override --time "9:41" \
  --batteryState discharging --batteryLevel 100 --cellularBars 4 --wifiBars 3 2>/dev/null || true
sleep 1
mkdir -p "$OUTDIR"
xcrun simctl io "$DEV" screenshot "$OUTDIR/$OUT" >/dev/null 2>&1
echo "captured $OUTDIR/$OUT"
