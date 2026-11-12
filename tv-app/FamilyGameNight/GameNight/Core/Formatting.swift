import Foundation

enum Money {
    /// 1000 → "$1,000", -200 → "−$200" (a real minus sign, not a hyphen).
    static func format(_ amount: Int) -> String {
        var grouped = ""
        for (index, digit) in String(abs(amount)).reversed().enumerated() {
            if index > 0 && index % 3 == 0 { grouped.append(",") }
            grouped.append(digit)
        }
        return (amount < 0 ? "−$" : "$") + String(grouped.reversed())
    }
}

enum JoinAddress {
    /// The host page for a server: "http://192.168.1.50:3000/" → "http://192.168.1.50:3000/host".
    /// The address only; the host still has to enter the PIN on that page.
    /// With a room code the page keeps it: "https://site.app/?r=ABCD" → "https://site.app/host?r=ABCD".
    static func hostPage(from joinURL: String) -> String {
        if let mark = joinURL.firstIndex(of: "?") {
            var path = String(joinURL[..<mark])
            if !path.hasSuffix("/") { path += "/" }
            return path + "host" + joinURL[mark...]
        }
        return joinURL.hasSuffix("/") ? joinURL + "host" : joinURL + "/host"
    }

    /// The connection checker for a phone that can't join: "http://192.168.1.50:3000/" → ".../check".
    static func checkPage(from joinURL: String) -> String {
        joinURL.hasSuffix("/") ? joinURL + "check" : joinURL + "/check"
    }

    /// "http://192.168.1.50:3000/" → "192.168.1.50:3000", for showing under a QR code.
    static func display(_ urlString: String) -> String {
        var text = urlString
        for prefix in ["https://", "http://"] where text.hasPrefix(prefix) {
            text.removeFirst(prefix.count)
            break
        }
        text = text.replacingOccurrences(of: "/?", with: "?")
        while text.hasSuffix("/") { text.removeLast() }
        return text
    }
}

/// A player colour such as "#14b8a6".
struct RGB: Equatable {
    var r: Double
    var g: Double
    var b: Double

    /// Nil unless the text is six hex digits, with or without a leading "#".
    static func parse(hex: String) -> RGB? {
        var text = hex.trimmingCharacters(in: .whitespaces)
        if text.hasPrefix("#") { text.removeFirst() }
        guard text.count == 6, let value = UInt32(text, radix: 16) else { return nil }
        return RGB(
            r: Double((value >> 16) & 255) / 255,
            g: Double((value >> 8) & 255) / 255,
            b: Double(value & 255) / 255
        )
    }

    /// WCAG relative luminance, 0 (black) to 1 (white).
    var luminance: Double {
        func linear(_ c: Double) -> Double {
            c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
    }

    /// True when dark navy text reads better on this colour than white does.
    /// This compares real contrast, so teal and orange get dark text. (The web
    /// pages' `ink()` uses a simpler cut-off that puts white text on both, which
    /// is hard to read from across a room.)
    var prefersDarkInk: Bool {
        let darkInkLuminance = 0.01
        let contrastWithDark = (luminance + 0.05) / (darkInkLuminance + 0.05)
        let contrastWithWhite = 1.05 / (luminance + 0.05)
        return contrastWithDark > contrastWithWhite
    }
}
