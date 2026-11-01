// Render the approved outlined logo without a browser, fonts, or network access.
// Requires macOS (AppKit/CoreGraphics).
// From the repository root: swift tools/brand/share-card.swift
import AppKit
import CoreGraphics
import Foundation
import ImageIO

let root = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .deletingLastPathComponent()
let logoURL = root.appendingPathComponent("assets/telicity/logos/logo-lockup-petrol.svg")
let outputURL = root.appendingPathComponent("og-telicity.png")
let width = 1200
let height = 630

guard let logo = NSImage(contentsOf: logoURL),
      let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
      let context = CGContext(
        data: nil,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: width * 4,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
      ) else {
    fputs("Could not load the approved logo or create the share-card canvas.\n", stderr)
    exit(1)
}
context.setFillColor(red: 245.0 / 255, green: 244.0 / 255, blue: 238.0 / 255, alpha: 1)
context.fill(CGRect(x: 0, y: 0, width: width, height: height))
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
NSGraphicsContext.current?.imageInterpolation = .high

// Keep every visible path inside the central square, so small thumbnail crops
// retain both the symbol and wordmark instead of cutting off the brand name.
let logoWidth = 650.0
let logoHeight = logoWidth * 142.0 / 491.0
let logoFrame = NSRect(
    x: (Double(width) - logoWidth) / 2,
    y: (Double(height) - logoHeight) / 2,
    width: logoWidth,
    height: logoHeight
)
logo.draw(in: logoFrame, from: .zero, operation: .sourceOver, fraction: 1)
NSGraphicsContext.restoreGraphicsState()

guard let image = context.makeImage(),
      let destination = CGImageDestinationCreateWithURL(outputURL as CFURL, "public.png" as CFString, 1, nil) else {
    fputs("Could not encode the share card as a PNG.\n", stderr)
    exit(1)
}
CGImageDestinationAddImage(destination, image, nil)
guard CGImageDestinationFinalize(destination) else {
    fputs("Could not write the share card.\n", stderr)
    exit(1)
}
let bytes = try Data(contentsOf: outputURL).count
print("\(outputURL.lastPathComponent): \(width)×\(height), \(bytes) bytes, opaque sRGB")
