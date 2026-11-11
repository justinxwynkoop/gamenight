import CoreImage.CIFilterBuiltins
import SwiftUI
import UIKit

/// A QR code for a web address, drawn on white so phone cameras can read it.
struct QRCodeView: View {
    let text: String

    private static let context = CIContext()

    var body: some View {
        if let image = Self.makeImage(text) {
            Image(uiImage: image)
                .interpolation(.none)
                .resizable()
                .scaledToFit()
                .padding(10)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .accessibilityLabel("QR code to join the game")
        } else {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.12))
        }
    }

    private static func makeImage(_ text: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 12, y: 12))
        guard let cgImage = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}

/// "Scan to join" with the code and the address as text, for the board's sidebar.
struct JoinCodeBlock: View {
    let joinURL: URL?

    var body: some View {
        HStack(spacing: 22) {
            if let joinURL {
                QRCodeView(text: joinURL.absoluteString)
                    .frame(width: 150, height: 150)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("Scan to join")
                    .font(JP.text(32))
                Text(joinURL.map { JoinAddress.display($0.absoluteString) } ?? "Looking for the server address…")
                    .font(JP.text(24, .medium))
                    .foregroundStyle(JP.muted)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
            }
            Spacer(minLength: 0)
        }
        .padding(18)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.white.opacity(0.07)))
    }
}
