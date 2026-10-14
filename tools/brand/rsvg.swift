// rsvg in.svg out.png size : render an SVG with AppKit onto a transparent square bitmap
import AppKit
let a = CommandLine.arguments
let n = Int(a[3])!
guard let img = NSImage(contentsOf: URL(fileURLWithPath: a[1])) else { print("load failed"); exit(1) }
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: n, pixelsHigh: n, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
rep.size = NSSize(width: n, height: n)
NSGraphicsContext.saveGraphicsState()
let ctx = NSGraphicsContext(bitmapImageRep: rep)!
ctx.imageInterpolation = .high
NSGraphicsContext.current = ctx
NSColor.clear.setFill(); NSRect(x: 0, y: 0, width: n, height: n).fill()
img.draw(in: NSRect(x: 0, y: 0, width: n, height: n))
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: a[2]))
