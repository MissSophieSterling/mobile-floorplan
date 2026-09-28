# Embedding Mobile Floorplan in your app

This guide covers how another website or mobile app can use Mobile Floorplan as its floor plan generator. The hosted editor is at:

```
https://misssophiesterling.github.io/mobile-floorplan/
```

If you host your own copy, use your URL instead. No API key or account is needed. The editor runs entirely in the user's browser or WebView, so plans only go where your app sends them.

The "Service provided by zkitszo" mark stays visible in the editor and on exported images in every mode.

---

## Option 1: link out and get the plan back

This is the least work, and it suits apps that can't host an iframe, emails, and native apps that open a browser tab.

```html
<a href="https://misssophiesterling.github.io/mobile-floorplan/?return=https%3A%2F%2Fyourapp.example%2Ffloorplan-done&units=m">
  Draw a floor plan
</a>
```

When the user taps **Done**, the editor asks them to confirm, then opens:

```
https://yourapp.example/floorplan-done#plan=<base64url-encoded JSON>
```

The plan travels in the URL fragment, so it isn't sent to your server in the request. Read it on the page:

```html
<script src="https://misssophiesterling.github.io/mobile-floorplan/sdk/mobile-floorplan-sdk.js"></script>
<script>
  const plan = MobileFloorplan.readReturn();   // null if there is none
  if (plan) fetch('/api/plans', {method: 'POST', body: JSON.stringify(plan)});
</script>
```

Without the SDK, decode it yourself: take everything after `#plan=`, change `-` to `+` and `_` to `/`, base64-decode it, then decode the bytes as UTF-8 and parse the JSON.

To reopen a saved plan, put it in the link's fragment: `…/mobile-floorplan/?return=…#plan=<base64url JSON>`. `MobileFloorplan.linkUrl({returnUrl, plan, units})` builds that link for you.

Custom URL schemes work, e.g. `return=myapp://floorplan`. That lets a native app catch the result from the system browser. `javascript:`, `data:`, `file:` and similar schemes are refused.

---

## Option 2: embed in a web page with the SDK

```html
<div id="planner" style="height: 640px"></div>

<script src="https://misssophiesterling.github.io/mobile-floorplan/sdk/mobile-floorplan-sdk.js"></script>
<script>
  const editor = MobileFloorplan.embed('#planner', {
    units: 'ft',                         // 'm' (default) or 'ft'
    name: 'Customer home',               // starting plan name
    plan: savedPlan,                     // optional: a plan to open
    formats: ['png', 'pdf', 'dxf'],      // optional: limit the Export menu ([] hides it)
    theme: 'light',                      // optional: 'light' or 'dark'
    onReady:  plan => {},                // editor is up
    onChange: plan => autosave(plan),    // after every edit
    onSave:   plan => submit(plan),      // user tapped Done
    onExport: info => {},                // user downloaded a file themselves {format, filename}
    onError:  err => console.error(err),
  });
</script>
```

The returned object:

| Method | Returns |
|---|---|
| `editor.getPlan()` | `Promise<plan>` |
| `editor.load(plan)` | `Promise<plan>`: replaces the plan and clears undo |
| `editor.export(format, {floor})` | `Promise<{blob, filename, mime}>`. `format` is one of `png jpg pdf svg dxf sh3d obj csv json`. `floor` is a 0-based index; the default is the floor on screen. |
| `editor.setOptions({units, formats, theme, name})` | `Promise<plan>` |
| `editor.destroy()` | removes the iframe and listeners |
| `editor.iframe` | the `<iframe>` element |

Example: attach a PDF to your own form without the user downloading anything.

```js
const {blob, filename} = await editor.export('pdf');
const form = new FormData();
form.append('floorplan', blob, filename);
await fetch('/api/quote', {method: 'POST', body: form});
```

In embedded mode the editor starts empty unless you pass a plan, shows a **Done** button, and does not autosave to browser storage. Your app owns the data. Pass `storage: true` to turn autosave back on.

---

## Option 3: iframe and postMessage without the SDK

Frame the editor with `embed=1`, and name your origin so it only listens to you:

```html
<iframe id="fp" src="https://misssophiesterling.github.io/mobile-floorplan/?embed=1&origin=https%3A%2F%2Fyourapp.example"
        style="width:100%;height:640px;border:0" allow="clipboard-write; web-share"></iframe>
```

```js
const EDITOR = 'https://misssophiesterling.github.io';
const fp = document.getElementById('fp');

window.addEventListener('message', e => {
  if (e.source !== fp.contentWindow || e.origin !== EDITOR) return;
  const m = e.data;                         // always has source: 'mobile-floorplan'
  if (m.type === 'ready') fp.contentWindow.postMessage({target: 'mobile-floorplan', type: 'init', units: 'm'}, EDITOR);
  if (m.type === 'save') console.log('plan', m.plan);
  if (m.type === 'export' && m.requestId === 'pdf1') {
    const bytes = Uint8Array.from(atob(m.base64), c => c.charCodeAt(0));
    const blob = new Blob([bytes], {type: m.mime});
  }
});

// later
fp.contentWindow.postMessage({target: 'mobile-floorplan', type: 'export', format: 'pdf', requestId: 'pdf1'}, EDITOR);
```

### Messages you send

Every message needs `target: 'mobile-floorplan'`. Add a `requestId` to match a reply to its request.

| `type` | Fields | Reply |
|---|---|---|
| `init` | `plan?`, `units?`, `name?`, `formats?`, `theme?` | `initialized` with `plan` |
| `load` | `plan` | `loaded` with `plan` |
| `getPlan` | | `plan` with `plan` |
| `export` | `format`, `floor?` | `export` with `filename`, `mime`, `base64` |
| `setOptions` | `units?`, `formats?`, `theme?`, `name?` | `optionsSet` with `plan` |

### Messages you receive

Every message has `source: 'mobile-floorplan'` and `version: 1`.

| `type` | Fields | When |
|---|---|---|
| `ready` | | the editor has loaded; send `init` now |
| `change` | `plan` | after edits (debounced about 250 ms) |
| `save` | `plan` | the user tapped **Done** |
| `exported` | `format`, `filename` | the user saved a file from the Export menu |
| `error` | `message`, `requestId?` | a request failed |

### Security

- Before the handshake the editor only sends `ready`, which carries no plan data.
- The editor replies only to the origin in `origin=`, or, if that is missing, to the first origin that messages it. Messages from any other window or origin are ignored.
- Every incoming plan is validated: unknown item types are dropped, numbers are clamped, and names are escaped before drawing.

---

## Option 4: native apps (WebView)

Load `…/mobile-floorplan/?embed=1`. The editor posts every event to each native bridge it finds. Send commands back by calling `window.MobileFloorplan.receive(message)`, which accepts an object or a JSON string.

### React Native (`react-native-webview`)

```jsx
const web = useRef(null);

<WebView
  ref={web}
  source={{ uri: 'https://misssophiesterling.github.io/mobile-floorplan/?embed=1&units=m' }}
  onMessage={e => {
    const msg = JSON.parse(e.nativeEvent.data);
    if (msg.type === 'ready') {
      web.current.injectJavaScript(
        `MobileFloorplan.receive(${JSON.stringify({ type: 'init', plan: savedPlan })}); true;`
      );
    }
    if (msg.type === 'save') savePlan(msg.plan);
    if (msg.type === 'export') shareFile(msg.base64, msg.filename, msg.mime);
  }}
/>

// ask for a PDF
web.current.injectJavaScript(`MobileFloorplan.receive({type:'export', format:'pdf', requestId:'p1'}); true;`);
```

### Android (Kotlin)

```kotlin
webView.settings.javaScriptEnabled = true
webView.settings.domStorageEnabled = true
webView.addJavascriptInterface(object {
    @JavascriptInterface
    fun postMessage(json: String) {
        val msg = JSONObject(json)
        when (msg.getString("type")) {
            "ready" -> runOnUiThread {
                webView.evaluateJavascript("MobileFloorplan.receive({type:'init', units:'m'})", null)
            }
            "save" -> savePlan(msg.getJSONObject("plan"))
        }
    }
}, "MobileFloorplanAndroid")
webView.loadUrl("https://misssophiesterling.github.io/mobile-floorplan/?embed=1")
```

The interface name must be `MobileFloorplanAndroid`.

### iOS (Swift, WKWebView)

```swift
class PlanVC: UIViewController, WKScriptMessageHandler {
    var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "mobileFloorplan")
        webView = WKWebView(frame: view.bounds, configuration: config)
        view.addSubview(webView)
        webView.load(URLRequest(url: URL(string: "https://misssophiesterling.github.io/mobile-floorplan/?embed=1")!))
    }

    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let msg = message.body as? [String: Any], let type = msg["type"] as? String else { return }
        if type == "ready" { webView.evaluateJavaScript("MobileFloorplan.receive({type:'init', units:'m'})") }
        if type == "save", let plan = msg["plan"] { savePlan(plan) }
    }
}
```

The handler name must be `mobileFloorplan`.

### Flutter (`webview_flutter`)

Add a JavaScript channel named `MobileFloorplanAndroid` on both platforms; the editor calls its `postMessage` with a JSON string. Send commands with `controller.runJavaScript("MobileFloorplan.receive({...})")`.

---

## URL parameters

| Parameter | Meaning |
|---|---|
| `embed=1` | Embedded mode: shows **Done**, starts empty, no browser autosave. Automatic inside an iframe or a WebView with a bridge. |
| `units=m` / `units=ft` | Starting units |
| `name=` | Starting plan name |
| `formats=png,pdf,dxf` | Formats shown in the Export menu. `formats=none` hides the button. |
| `return=URL` | Where **Done** sends the user, with `#plan=` added |
| `origin=URL` | Only accept postMessage from this origin |
| `plan=` or `#plan=` | Open this plan (base64url JSON). Prefer the fragment: it is not sent to servers and can be longer. |
| `theme=light` / `theme=dark` | Force a colour theme |
| `storage=0` / `storage=1` | Turn browser autosave off or on |

---

## Plan format

Plain JSON. All lengths are in centimetres, whatever units the user sees. `x` and `y` are the top-left corner of the item's box after rotation, and `y` grows downward.

```json
{
  "format": "mobile-floorplan",
  "version": 1,
  "name": "My flat",
  "units": "m",
  "floors": [
    {
      "id": "f1",
      "name": "Ground floor",
      "items": [
        { "id": "a", "kind": "room", "name": "Kitchen", "x": 0, "y": 0, "w": 320, "h": 280, "rot": 0 },
        { "id": "b", "kind": "door", "name": "Door", "x": 40, "y": 0, "w": 80, "h": 80, "rot": 0 },
        { "id": "c", "kind": "fridge", "name": "Fridge", "x": 240, "y": 10, "w": 70, "h": 70, "rot": 0 }
      ]
    }
  ]
}
```

| Field | Values |
|---|---|
| `kind` | `room`; openings `door`, `dbldoor`, `slider`, `window`, `opening`; furniture `bed`, `sofa`, `armchair`, `table`, `rtable`, `chair`, `desk`, `wardrobe`, `tv`, `counter`, `stove`, `fridge`, `ksink`, `toilet`, `sink`, `bath`, `shower`, `washer`, `stairs`, `plant` |
| `w`, `h` | Size before rotation. For openings, `w` runs along the wall. |
| `rot` | `0`, `90`, `180` or `270`, clockwise |

A door with `rot: 0` sits on the top wall of a room and swings down into it. `90` puts it on a right-hand wall, `180` on a bottom wall and `270` on a left-hand wall.

Room area in square metres is `w * h / 10000`.

---

## Try it locally

```sh
npx http-server -c-1 .
# then open http://localhost:8080/examples/embed.html
```

The demo host page embeds the editor, saves each change, and has buttons that fetch PDF, PNG and DXF files from it.
