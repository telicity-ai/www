// Headless HTML -> PNG snapshot using WebKit.
// usage: snap <url-or-file> <out.png> [width=1280] [height=900] [waitSeconds=2.0] [fullPage=1]
// Loads the page in an offscreen WKWebView, waits for load + `wait` seconds
// (fonts, entrance animations), then writes a PNG of the viewport or full page.
import AppKit
import WebKit

let args = CommandLine.arguments
guard args.count >= 3 else {
  print("usage: snap <url-or-file> <out.png> [width] [height] [wait] [fullPage 0|1]"); exit(2)
}
let target = args[1]
let out = URL(fileURLWithPath: args[2])
let width = args.count > 3 ? Double(args[3]) ?? 1280 : 1280
let height = args.count > 4 ? Double(args[4]) ?? 900 : 900
let wait = args.count > 5 ? Double(args[5]) ?? 2.0 : 2.0
let fullPage = args.count > 6 ? args[6] != "0" : true
let scale = args.count > 7 ? Double(args[7]) ?? 1 : 1

let url: URL = target.hasPrefix("http") ? URL(string: target)! : URL(fileURLWithPath: target)

final class Snapper: NSObject, WKNavigationDelegate {
  let web: WKWebView
  let window: NSWindow
  init(width: Double, height: Double) {
    let cfg = WKWebViewConfiguration()
    // Offscreen windows don't advance CSS animations; render every element in its end state.
    let css = "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}"
    let js = "var s=document.createElement('style');s.textContent='\(css)';document.documentElement.appendChild(s);"
    cfg.userContentController.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
    web = WKWebView(frame: NSRect(x: 0, y: 0, width: width, height: height), configuration: cfg)
    window = NSWindow(contentRect: NSRect(x: -10000, y: -10000, width: width, height: height),
                      styleMask: [.borderless], backing: .buffered, defer: false)
    super.init()
    window.contentView = web
    window.orderFrontRegardless()
    web.navigationDelegate = self
    if scale != 1 { web.setValue(scale, forKey: "overrideDeviceScaleFactor") }
  }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    DispatchQueue.main.asyncAfter(deadline: .now() + wait) { self.capture() }
  }
  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    print("load failed: \(error)"); exit(1)
  }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    print("load failed: \(error)"); exit(1)
  }
  func capture() {
    // CSP can block the injected <style>; finishing animations through the Web Animations API always works.
    web.evaluateJavaScript("document.getAnimations().forEach(function(a){try{a.finish()}catch(e){}});Math.ceil(Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0))") { result, _ in
      let pageH = (result as? Double) ?? height
      let h = fullPage ? min(max(pageH, height), 6000) : height
      self.web.setFrameSize(NSSize(width: width, height: h))
      self.window.setContentSize(NSSize(width: width, height: h))
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
        let cfg = WKSnapshotConfiguration()
        cfg.rect = NSRect(x: 0, y: 0, width: width, height: h)
        // device scale override gives a scale-x bitmap
        self.web.takeSnapshot(with: cfg) { image, error in
          guard let image = image, let tiff = image.tiffRepresentation,
                let rep = NSBitmapImageRep(data: tiff),
                let png = rep.representation(using: .png, properties: [:]) else {
            print("snapshot failed: \(String(describing: error))"); exit(1)
          }
          try! png.write(to: out)
          print("wrote \(out.path) \(Int(width))x\(Int(h))")
          exit(0)
        }
      }
    }
  }
}

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let snapper = Snapper(width: width, height: height)
if url.isFileURL {
  snapper.web.loadFileURL(url, allowingReadAccessTo: URL(fileURLWithPath: "/"))
} else {
  snapper.web.load(URLRequest(url: url))
}
DispatchQueue.main.asyncAfter(deadline: .now() + 30) { print("timeout"); exit(1) }
app.run()
