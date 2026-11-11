// swift-tools-version:5.9
// Builds only the platform-free game logic in FamilyGameNight/Singo/Core so it
// can be tested with `swift test` on any Mac or Linux box. The tvOS app itself
// is built from FamilyGameNight.xcodeproj.
import PackageDescription

let package = Package(
    name: "SingoCore",
    products: [
        .library(name: "SingoCore", targets: ["SingoCore"]),
    ],
    targets: [
        .target(name: "SingoCore", path: "FamilyGameNight/Singo/Core"),
        .testTarget(name: "SingoCoreTests", dependencies: ["SingoCore"], path: "Tests/SingoCoreTests"),
    ]
)
